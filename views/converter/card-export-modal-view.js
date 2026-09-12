/*
## 核心功能

图片卡片导出弹窗的 DOM 渲染层（B05 视觉重构）：四类视图——可开始表单、准备中、
任务进度（状态区 + 进度条 + 逐页明细折叠）、结果（状态区 + 结果卡片 + 操作）。
渲染只读会话任务与导出器进度事件，不持有任务生命周期。

## 输入

AppleStyleView 实例（会话任务、预览负载、倍率/目录选择、资源摘要、批次信息）与
导出器进度事件；DOM 选择器以 icard-export- 前缀作用域。

## 输出

导出 `cardExportModalViewMethods`（由 AppleStyleView 组装）：`renderCardExportModal`、
`renderCardExportForm`、`renderCardExportPreparing`、`renderCardExportJob`、
`renderCardExportPages`、`renderCardExportResultLinks`，以及文案映射
`EXPORT_STATE_LABELS` / `EXPORT_PAGE_LABELS` / `formatExportReason`。

## 定位

位于 views/converter/，卡片导出的纯展示层；Modal 生命周期与任务编排在
card-export-modal.js，导出规则在 services/card-exporter.js。

## 依赖

`./card-export-bridge.js`（CARD_EXPORT_SCALES / 默认目录与倍率）、
`../apple-style-view-shared.js`（getObsidianSetIcon）；
`formatExportReason` 由本模块导出，card-export-modal.js 复用（避免循环依赖）。

## 维护规则

- 修改视图结构后同步更新本文件说明书，并检查 views/converter 的 README 是否仍准确。
- 颜色只用于「异常」与「当前进行中的那一行」：正常完成行必须保持中性（禁止整列铺成功色底）。
- 同一事实只说一次：完成态的「已完成张数」写在状态区，不再在进度条与列表里重复。
- 图标一律经 applyIcon 注入且必须配有文字（图标在测试替身与旧版 Obsidian 下可能为空）。
- 进度只反映导出器上报的事实，本层不猜测、不补算。
- 结果定位的唯一目的是「让用户真正拿到文件」：优先调用系统文件管理器打开（桌面端），
  不可用时退回复制完整路径；两条路都失败必须说明原因，一律不得谎报成功。
- 复制按钮按能力显示：有「打开所在文件夹」时不渲染复制按钮（打开失败会自动降级为复制，
  两个入口做同一件事只增噪音）；仅在无文件管理器能力（移动端 / 受限环境）时渲染 —— 此时它是唯一入口。
- 面向普通用户：正文只显示 vault 相对目录，绝对路径只进 title 悬停提示；不展示内部产物文件名。
- 逐页明细默认折叠：自动展开（进行中 / 有失败页）不得被记成用户意图，否则完成后会粘滞在展开态。
- 尺寸一致时只在摘要处说一次，不逐行重复；尺寸有差异时才逐行显示。
- 样式在 styles/card-export.css（icard-export- 前缀），新增选择器不得污染宿主 UI。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: 视图方法组跨模块动态组合（同 card-preview），Obsidian DOM 扩展方法与会话/任务负载以 unknown/any 持有，运行时语义由 card_export_flow 与 B01/B04 契约约束 */

import { getObsidianSetIcon } from '../apple-style-view-shared.js';
import { CARD_EXPORT_SCALES, DEFAULT_CARD_EXPORT_ROOT, DEFAULT_CARD_EXPORT_SCALE } from './card-export-bridge.js';

/** 导出任务状态 → 中文标签 */
const EXPORT_STATE_LABELS = {
  running: '导出中',
  canceling: '正在取消…',
  completed: '导出完成',
  partial: '部分完成',
  failed: '导出失败',
  canceled: '已取消',
};

/** 单页结果状态 → 标签 */
const EXPORT_PAGE_LABELS = {
  saved: '已保存',
  failed: '失败',
  canceled: '已取消',
  pending: '待处理',
  skipped: '已跳过',
};

/** 任务状态 → 状态区色调（成功/警告/错误/中性/强调） */
const EXPORT_STATE_TONES = {
  running: 'accent',
  canceling: 'accent',
  completed: 'success',
  partial: 'warning',
  failed: 'error',
  canceled: 'muted',
};

/** 终态状态区的语义图标（Obsidian lucide 图标名） */
const EXPORT_STATE_ICONS = {
  completed: 'check',
  partial: 'alert-triangle',
  failed: 'x',
  canceled: 'slash',
};

/**
 * 注入 Obsidian 图标；图标缺失不影响信息（所有图标位都配有文字标签）。
 * @param {any} el @param {string} name
 */
function applyIcon(el, name) {
  try {
    const setIcon = getObsidianSetIcon();
    if (typeof setIcon === 'function') setIcon(el, name);
  } catch {
    // 图标运行时不可用：保持空元素，文字标签仍然表达语义
  }
  el?.setAttribute?.('aria-hidden', 'true');
  return el;
}

/** 复制文本到剪贴板（不支持时静默失败，界面不谎报成功） */
async function writeClipboard(text) {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限或运行环境不支持：交给调用方保持原样
  }
  return false;
}

/**
 * 笔记显示名：去掉目录前缀与 .md 后缀，只留笔记标题。
 * 弹窗面向普通用户，不展示 vault 相对路径。
 * @param {string} sourcePath
 */
function noteDisplayName(sourcePath) {
  const raw = String(sourcePath || '').trim();
  if (!raw) return '当前笔记';
  const base = raw.split('/').pop() || raw;
  return base.replace(/\.md$/i, '') || raw;
}

/** @type {CardExportModalViewMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardExportModalViewMethods = {
/**
 * 重绘弹窗内容：按会话任务状态分派到表单 / 准备中 / 任务视图。
 * 滚动位置跨重绘保留——进度事件会频繁触发重绘，不应把用户弹回顶部。
 */
renderCardExportModal() {
  const selfRecord = /** @type {any} */ (this);
  const modal = selfRecord.cardExportModal;
  if (!modal) return;
  const content = /** @type {any} */ (modal.contentEl);
  if (!content) return;

  const savedScroll = Number(selfRecord.cardExportScrollTop || 0);
  if (typeof content.empty === 'function') content.empty();
  else content.replaceChildren?.();

  if (!selfRecord.cardExportScrollBound && typeof content.addEventListener === 'function') {
    selfRecord.cardExportScrollBound = true;
    content.addEventListener('scroll', () => { selfRecord.cardExportScrollTop = content.scrollTop; });
  }

  const body = content.createEl('div', { cls: 'icard-export-body' });
  const view = this.resolveCardExportView();
  const job = view && view.job ? view.job : null;

  if (!job) {
    // 任务尚未建立（点击「开始导出」到批次目录/任务落账之间）：显示准备中，
    // 否则弹窗会原地重绘成表单，看起来像「点了没反应」。
    if (selfRecord.cardExportStage) this.renderCardExportPreparing(body, selfRecord.cardExportStage);
    else this.renderCardExportForm(body);
  } else {
    this.renderCardExportJob(body, job);
  }

  if (savedScroll > 0 && typeof content.scrollTop === 'number') content.scrollTop = savedScroll;
}
,

/**
 * 可开始表单：来源/范围/尺寸摘要 → 倍率分段控件 → 输出目录 → 省略摘要 → 开始。
 * 资格不满足时给出原因，不显示可点击的开始按钮。
 * @param {any} body
 */
renderCardExportForm(body) {
  const selfRecord = /** @type {any} */ (this);
  const collected = this.collectCardExportInput({
    rootPath: selfRecord.cardExportRootPath || DEFAULT_CARD_EXPORT_ROOT,
    scale: selfRecord.cardExportScale || DEFAULT_CARD_EXPORT_SCALE,
  });

  if (!collected || collected.ok !== true) {
    const notice = body.createEl('div', { cls: 'icard-export-notice is-error' });
    notice.createEl('div', {
      cls: 'icard-export-notice-title',
      text: collected?.reason === 'no-pages' ? '当前没有可导出的卡片页' : '尚未就绪，无法导出',
    });
    notice.createEl('div', {
      cls: 'icard-export-notice-desc',
      text: '请先在卡片模式完成预览排版，并确认正文已保存。',
    });
    return;
  }

  const outcome = selfRecord.cardPreviewOutcome || {};
  const scale = Number(selfRecord.cardExportScale || DEFAULT_CARD_EXPORT_SCALE);
  const size = collected.size || { width: 0, height: 0 };
  const pageCount = Array.isArray(collected.selectedPageIds) ? collected.selectedPageIds.length : 0;

  const info = body.createEl('div', { cls: 'icard-export-info' });
  /** @param {string} label @param {string} value @param {string} [title] */
  const addRow = (label, value, title) => {
    const line = info.createEl('div', { cls: 'icard-export-info-row' });
    line.createEl('span', { cls: 'icard-export-info-label', text: label });
    line.createEl('span', { cls: 'icard-export-info-value', text: value, attr: { title: title || value } });
  };
  // 「来源」只说哪篇笔记：普通用户不需要在弹窗里读 vault 相对路径，
  // 完整路径留给需要核对的人，放悬停提示即可。
  const sourcePath = String(outcome.sourcePath || '').trim();
  addRow('来源', noteDisplayName(sourcePath), sourcePath || '当前笔记');
  addRow('范围', `全部 ${pageCount} 页`);
  // 「尺寸」说人话：直接给每张图的像素。比例与倍率都隐含在像素里，
  // 且倍率在下方分段控件已展示，按「同一事实只说一次」不重复。
  addRow('尺寸', `每张 ${Math.round(size.width * scale)} × ${Math.round(size.height * scale)} 像素`);

  body.createEl('div', { cls: 'icard-export-divider' });

  const scaleField = body.createEl('div', { cls: 'icard-export-field' });
  scaleField.createEl('span', { cls: 'icard-export-field-label', text: '导出倍率' });
  const segmented = scaleField.createEl('div', {
    cls: 'icard-export-segmented',
    attr: { role: 'group', 'aria-label': '导出倍率' },
  });
  for (const option of CARD_EXPORT_SCALES) {
    const active = option === scale;
    const btn = segmented.createEl('button', {
      cls: `icard-export-scale-btn${active ? ' is-active' : ''}`,
      text: `${option}x`,
      attr: { type: 'button', 'aria-pressed': active ? 'true' : 'false' },
    });
    btn.addEventListener('click', () => {
      selfRecord.cardExportScale = option;
      this.renderCardExportModal();
    });
  }

  const rootField = body.createEl('div', { cls: 'icard-export-field is-stacked' });
  rootField.createEl('label', {
    cls: 'icard-export-field-label',
    text: '输出目录',
    attr: { for: 'icard-export-root-input' },
  });
  const rootInput = /** @type {any} */ (rootField.createEl('input', {
    cls: 'icard-export-root-input',
    attr: { id: 'icard-export-root-input', type: 'text', spellcheck: 'false', placeholder: DEFAULT_CARD_EXPORT_ROOT },
  }));
  rootInput.value = String(selfRecord.cardExportRootPath || DEFAULT_CARD_EXPORT_ROOT);
  rootInput.addEventListener('change', () => {
    selfRecord.cardExportRootPath = String(rootInput.value || DEFAULT_CARD_EXPORT_ROOT).trim() || DEFAULT_CARD_EXPORT_ROOT;
    this.renderCardExportModal();
  });
  rootField.createEl('p', { cls: 'icard-export-field-hint', text: '相对 vault 根目录，导出时会自动建立子目录' });

  const omissionTotal = Number(outcome?.omissionSummary?.total || 0);
  const note = body.createEl('div', { cls: `icard-export-note${omissionTotal > 0 ? ' is-warning' : ''}` });
  applyIcon(note.createEl('span', { cls: 'icard-export-note-icon' }), omissionTotal > 0 ? 'alert-triangle' : 'check');
  note.createEl('span', {
    cls: 'icard-export-note-text',
    text: omissionTotal > 0 ? `${omissionTotal} 处内容未进入卡片（已在预览确认）` : '全部内容都将进入卡片',
  });

  const footer = body.createEl('div', { cls: 'icard-export-footer' });
  const startBtn = footer.createEl('button', {
    cls: 'icard-export-start mod-cta',
    text: '开始导出',
    attr: { type: 'button' },
  });
  startBtn.addEventListener('click', () => { void this.startCardExport(); });
}
,

/**
 * 准备中视图：spinner + 当前阶段说明 + 「关闭也继续」提示。
 * 覆盖两个静默期——批次目录校验与图片下载内联。
 * @param {any} body @param {string} stage
 */
renderCardExportPreparing(body, stage) {
  const resources = stage === 'resources';
  const status = body.createEl('div', { cls: 'icard-export-status is-accent' });
  const mark = status.createEl('div', { cls: 'icard-export-status-mark' });
  mark.createEl('span', { cls: 'icard-export-spinner', attr: { 'aria-hidden': 'true' } });
  const text = status.createEl('div', { cls: 'icard-export-status-text' });
  text.createEl('div', { cls: 'icard-export-status-title', text: resources ? '正在下载笔记图片' : '正在准备导出' });
  text.createEl('div', {
    cls: 'icard-export-status-desc',
    text: resources ? '图片会先内联进卡片，图片多时首次较慢' : '正在创建批次目录并校验输出位置',
  });

  body.createEl('p', {
    cls: 'icard-export-hint',
    text: '关闭窗口不会中断导出，可随时重新打开查看进度',
  });
}
,

/**
 * 任务视图：状态区 → 告警 → 结果卡片（终态）→ 进度条（进行中）→ 逐页明细 → 操作。
 * @param {any} body @param {any} job
 */
renderCardExportJob(body, job) {
  const selfRecord = /** @type {any} */ (this);
  const state = String(job.state || 'running');
  const running = state === 'running' || state === 'canceling';
  const pageIds = Array.isArray(job.pageIds) ? job.pageIds : [];
  const total = pageIds.length;
  const results = Array.isArray(job.results) ? job.results : [];
  const saved = results.filter((r) => r.status === 'saved').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const canceled = results.filter((r) => r.status === 'canceled').length;

  // 当前阶段（来自导出器的进度事件）：资源准备中 / 正在渲染第 N 页
  const progressEvent = selfRecord.cardExportProgress;
  const currentOrdinal = progressEvent && Number(progressEvent.current) > 0 ? Number(progressEvent.current) : 0;

  const tone = EXPORT_STATE_TONES[state] || 'muted';
  const status = body.createEl('div', { cls: `icard-export-status is-${tone}` });
  const mark = status.createEl('div', { cls: 'icard-export-status-mark' });
  if (running) {
    mark.createEl('span', { cls: 'icard-export-spinner', attr: { 'aria-hidden': 'true' } });
  } else {
    applyIcon(mark.createEl('span', { cls: 'icard-export-status-icon' }), EXPORT_STATE_ICONS[state] || 'info');
  }
  const statusText = status.createEl('div', { cls: 'icard-export-status-text' });
  statusText.createEl('div', { cls: 'icard-export-status-title', text: EXPORT_STATE_LABELS[state] || state });
  statusText.createEl('div', { cls: 'icard-export-status-desc', text: jobStatusDescription({ state, running, progressEvent, currentOrdinal, saved, total, failed }) });

  // 图片资源失败 / 省略内容提示（§5.5 不静默少图）
  const resourceSummary = selfRecord.cardExportResourceSummary;
  if (resourceSummary && Number(resourceSummary.failed) > 0) {
    const warn = body.createEl('div', { cls: 'icard-export-omission is-warning' });
    applyIcon(warn.createEl('span', { cls: 'icard-export-omission-icon' }), 'alert-triangle');
    warn.createEl('span', {
      cls: 'icard-export-omission-text',
      text: `${Number(resourceSummary.failed)} 张图片未能加载，已从卡片中跳过`,
    });
  }

  // 结果定位（终态且已落账批次信息时）
  if (!running) this.renderCardExportResultLinks(body);

  // 进度条：只在进行中展示（终态的张数写在状态区，不再重复）
  if (running) {
    const progress = body.createEl('div', { cls: 'icard-export-progress' });
    const track = progress.createEl('div', { cls: 'icard-export-progress-track' });
    const bar = track.createEl('div', { cls: 'icard-export-progress-bar' });
    const percent = total > 0 ? Math.round((results.length / total) * 100) : 0;
    bar.style.setProperty('width', `${percent}%`);
    progress.createEl('div', { cls: 'icard-export-progress-label', text: `${percent}%` });
  }

  this.renderCardExportPages(body, { pageIds, results, running, currentOrdinal, failed, canceled, total });

  if (running) {
    const footer = body.createEl('div', { cls: 'icard-export-footer' });
    footer.createEl('span', { cls: 'icard-export-footer-hint', text: '关闭窗口不会中断导出' });
    const cancelBtn = footer.createEl('button', {
      cls: 'icard-export-cancel',
      text: state === 'canceling' ? '正在取消…' : '取消导出',
      attr: { type: 'button' },
    });
    cancelBtn.toggleClass('is-disabled', state === 'canceling');
    cancelBtn.addEventListener('click', () => {
      if (state === 'canceling') return;
      this.cancelCardExport();
    });
    return;
  }

  // 终态：恢复类操作（重试）放主区，导航类操作放页脚
  if (state === 'partial' || state === 'failed') {
    const actions = body.createEl('div', { cls: 'icard-export-actions' });
    if (failed > 0) {
      const retryBtn = actions.createEl('button', {
        cls: 'icard-export-retry',
        text: '重试失败页',
        attr: { type: 'button' },
      });
      retryBtn.addEventListener('click', () => { void this.retryCardExportFailedPages(); });
    }
    const manifestBtn = actions.createEl('button', {
      cls: 'icard-export-retry-manifest',
      text: '重试结果记录',
      attr: { type: 'button' },
    });
    manifestBtn.addEventListener('click', () => { void this.retryCardExportManifest(); });
  }

  const footer = body.createEl('div', { cls: 'icard-export-footer' });
  // 结果已看完 → 允许换倍率/目录再导一批（否则重开永远停在结果页，无法二次导出）
  const againBtn = footer.createEl('button', {
    cls: 'icard-export-again',
    text: '再次导出',
    attr: { type: 'button' },
  });
  againBtn.addEventListener('click', () => this.startNewCardExport());
  const doneBtn = footer.createEl('button', {
    cls: 'icard-export-done mod-cta',
    text: '完成',
    attr: { type: 'button' },
  });
  doneBtn.addEventListener('click', () => this.closeCardExportModal());
}
,

/**
 * 逐页明细：默认折叠，进行中或存在失败页时展开。
 * 展开态记在视图上（进度事件重绘不应把用户手动展开的列表收回）。
 * @param {any} body
 * @param {{ pageIds: string[], results: any[], running: boolean, currentOrdinal: number, failed: number, canceled: number, total: number }} input
 */
renderCardExportPages(body, input) {
  const selfRecord = /** @type {any} */ (this);
  const { pageIds, results, running, currentOrdinal, failed, canceled, total } = input;
  if (pageIds.length === 0) return;

  // 自动展开（进行中 / 有失败页）是「系统替你打开」，不能被记成用户意图，
  // 否则完成后会把这次自动展开粘滞下来——明明全部成功却停在展开态。
  const autoOpen = running || failed > 0;
  const open = autoOpen || selfRecord.cardExportPagesExpanded === true;
  const details = /** @type {any} */ (body.createEl('details', { cls: 'icard-export-pages-details' }));
  if (open) details.setAttribute('open', '');
  details.addEventListener?.('toggle', () => {
    // 只有结果与本次程序化设定不同，才算用户手动切换
    if (details.open === open) return;
    selfRecord.cardExportPagesExpanded = details.open === true;
  });

  // 尺寸全一致时，逐行重复同一串数字纯属噪音：只在摘要处说一次。
  // 有失败页时不说尺寸（此时焦点是失败，摘要里再报尺寸反而干扰）。
  const uniformSize = running ? null : uniformSavedSize(results);
  const showSizeNote = Boolean(uniformSize) && failed === 0 && canceled === 0;

  const summary = details.createEl('summary', { cls: 'icard-export-pages-summary' });
  applyIcon(summary.createEl('span', { cls: 'icard-export-pages-caret' }), 'chevron-right');
  summary.createEl('span', {
    cls: 'icard-export-pages-label',
    text: running ? `逐页进度 ${results.length} / ${total}` : `逐页明细 ${total}`,
  });
  if (showSizeNote) {
    summary.createEl('span', { cls: 'icard-export-pages-size-note', text: uniformSize });
  }
  summary.createEl('span', { cls: `icard-export-chip is-${pageChipTone({ running, failed, canceled })}`, text: pageChipText({ running, failed, canceled, total }) });

  const list = details.createEl('div', { cls: 'icard-export-pages' });
  const resultByPage = new Map(results.map((r) => [r.pageId, r]));
  pageIds.forEach((pageId, index) => {
    const result = resultByPage.get(pageId);
    const status = result ? result.status : 'pending';
    // 当前正在渲染的页（进度事件的 current 与页序对齐）
    const isCurrent = running && status === 'pending' && currentOrdinal > 0 && index === currentOrdinal - 1;
    const row = list.createEl('div', { cls: `icard-export-page-row is-${isCurrent ? 'rendering' : status}` });
    row.createEl('span', { cls: 'icard-export-page-name', text: `第 ${index + 1} 页` });
    row.createEl('span', {
      cls: 'icard-export-page-state',
      text: isCurrent ? '渲染中…' : (EXPORT_PAGE_LABELS[status] || status),
    });
    if (result && result.status === 'failed' && result.reason) {
      row.createEl('span', { cls: 'icard-export-page-reason', text: formatExportReason(result.reason) });
    }
    // 尺寸一致时已在摘要处给过，逐行不再重复；尺寸有差异时才逐行显示（那才是有用的信号）
    if (!uniformSize && result && result.status === 'saved' && result.width && result.height) {
      row.createEl('span', { cls: 'icard-export-page-size', text: `${result.width} × ${result.height}` });
    }
  });

  if (running) {
    const current = list.querySelector('.icard-export-page-row.is-rendering');
    if (current && typeof current.scrollIntoView === 'function') current.scrollIntoView({ block: 'nearest' });
  }
}
,

/**
 * 结果定位卡片：表头行承载「输出目录」标签与操作按钮，路径独占下一行并占满整行宽度
 * （过长时换行，绝不省略号截断——用户必须能看全自己要找的目录）。
 * 操作按钮按能力二选一：有文件管理器能力时给「打开所在文件夹」（打开失败自动降级为复制完整路径，
 * 解析不出绝对路径时退回复制 vault 相对路径）；无能力时（移动端 / 受限环境）只给复制。
 * 打开失败不谎报成功：降级为复制路径并在行下说明原因。
 * 内部产物（export-manifest.json）不在此暴露：记录文件照常写入磁盘，但对普通用户无可读价值。
 * @param {any} body
 */
renderCardExportResultLinks(body) {
  const selfRecord = /** @type {any} */ (this);
  const info = selfRecord.cardExportLastBatchInfo;
  if (!info || !info.batchDir) return;
  const dir = String(info.batchDir);
  const absPath = typeof this.resolveCardExportAbsPath === 'function'
    ? this.resolveCardExportAbsPath(dir)
    : null;
  const copyText = absPath || dir;

  const card = body.createEl('div', { cls: 'icard-export-result' });
  // 操作按钮与「输出目录」同在表头行：把整行宽度让给路径，路径过长时自然换行（不省略）。
  const head = card.createEl('div', { cls: 'icard-export-result-head' });
  head.createEl('div', { cls: 'icard-export-result-label', text: '输出目录' });
  const actions = head.createEl('div', { cls: 'icard-export-result-actions' });
  const pathEl = card.createEl('div', { cls: 'icard-export-result-path', attr: { title: absPath || dir } });
  appendBreakablePath(pathEl, dir);

  const hint = card.createEl('div', { cls: 'icard-export-result-hint' });
  const flash = (text) => {
    hint.setText(text);
    const win = typeof window !== 'undefined' ? window : null;
    win?.setTimeout?.(() => {
      if (hint.textContent === text) hint.setText('');
    }, 2500);
  };

  const canReveal = typeof this.canRevealCardExportOutput === 'function'
    && this.canRevealCardExportOutput();

  if (canReveal) {
    // 主操作：在系统文件管理器中显示这批图片。
    // 打开失败会**自动降级为复制路径**，所以这里不再单独放复制按钮 ——
    // 两个入口做同一件事只会增加噪音（「同一事实只说一次」）。
    const openBtn = actions.createEl('button', {
      cls: 'icard-export-result-open',
      attr: { type: 'button', title: '在系统文件管理器中显示这批图片' },
    });
    applyIcon(openBtn.createEl('span', { cls: 'icard-export-result-open-icon' }), 'folder-open');
    openBtn.createEl('span', { text: '打开所在文件夹' });
    openBtn.addEventListener('click', () => {
      const outcome = this.revealCardExportOutput(dir);
      if (outcome && outcome.ok) {
        flash('已在文件管理器中打开');
        return;
      }
      // 打开失败：退回复制路径，并把真实原因说清楚（不假装成功）
      void writeClipboard((outcome && outcome.absPath) || copyText).then((ok) => {
        flash(ok ? '无法打开文件夹，已复制路径' : '无法打开文件夹');
      });
    });
  } else {
    // 无文件管理器能力（移动端 / 受限环境）：复制是取得路径的唯一方式，必须保留。
    const copyBtn = actions.createEl('button', {
      cls: 'icard-export-result-copy',
      attr: { type: 'button', 'aria-label': '复制完整路径', title: '复制完整路径' },
    });
    const copyIcon = applyIcon(copyBtn.createEl('span', { cls: 'icard-export-result-copy-icon' }), 'copy');
    copyBtn.addEventListener('click', () => {
      void writeClipboard(copyText).then((ok) => {
        if (!ok) return; // 复制不可用时不谎报成功
        copyBtn.toggleClass('is-copied', true);
        copyBtn.setAttribute('title', '已复制');
        applyIcon(copyIcon, 'check');
        const win = typeof window !== 'undefined' ? window : null;
        win?.setTimeout?.(() => {
          copyBtn.toggleClass('is-copied', false);
          copyBtn.setAttribute('title', '复制完整路径');
          applyIcon(copyIcon, 'copy');
        }, 1500);
      });
    });
  }
}
,
};

/**
 * 路径按层级换行：在每个 `/` 之后插入 `<wbr>`（零宽换行机会），
 * 让过长路径优先在目录分隔处折行，而不是从字符串中间硬断。
 * `<wbr>` 不产生文本节点，因此 `textContent` 仍等于原始路径。
 * @param {any} el @param {string} text
 */
function appendBreakablePath(el, text) {
  const parts = String(text).split('/');
  parts.forEach((part, index) => {
    if (index > 0) el.createEl('wbr');
    el.appendText(index < parts.length - 1 ? `${part}/` : part);
  });
}

/**
 * 状态区副文案：把「已完成张数」和「当前阶段」合成一句，避免在进度条与列表里重复。
 * @param {{ state: string, running: boolean, progressEvent: any, currentOrdinal: number, saved: number, total: number, failed: number }} input
 */
function jobStatusDescription({ state, running, progressEvent, currentOrdinal, saved, total, failed }) {
  if (!running) {
    const base = `${saved} 张卡片已保存`;
    if (failed > 0) return `${base}，${failed} 张失败`;
    if (state === 'canceled') return `已在保存 ${saved} 张后取消`;
    return base;
  }
  if (progressEvent && progressEvent.stage === 'preparing') return '正在下载并内联笔记图片（图片多时首次较慢）…';
  if (currentOrdinal > 0) return `已保存 ${saved} / ${total} 张 · 正在渲染第 ${currentOrdinal} 页`;
  return `已保存 ${saved} / ${total} 张 · 正在准备…`;
}

/** 逐页明细右侧徽标文案 */
function pageChipText({ running, failed, canceled, total }) {
  if (failed > 0) return `${failed} 张失败`;
  if (running) return '进行中';
  if (canceled > 0) return `${canceled} 张已取消`;
  return total > 0 ? '全部成功' : '无内容';
}

/** 逐页明细右侧徽标色调 */
function pageChipTone({ running, failed, canceled }) {
  if (failed > 0) return 'error';
  if (running) return 'accent';
  if (canceled > 0) return 'muted';
  return 'success';
}

/**
 * 已保存页尺寸全部一致时返回该尺寸文案，否则 null。
 * 一致 → 说一次就够；有差异 → 逐行显示才有意义。
 * @param {any[]} results
 */
function uniformSavedSize(results) {
  const sizes = new Set();
  for (const r of Array.isArray(results) ? results : []) {
    if (r && r.status === 'saved' && r.width && r.height) sizes.add(`${r.width} × ${r.height}`);
  }
  return sizes.size === 1 ? [...sizes][0] : null;
}

/**
 * 导出失败原因 → 用户可读文案（脱敏：仅映射已知 reason，不透传原始细节）。
 * @param {string} reason
 */
export function formatExportReason(reason) {
  const map = {
    'capture-failed': '捕获失败',
    'capture-invalid': '输出非 PNG',
    'write-failed': '写入失败',
    'path-conflict': '同名文件冲突',
    'path-redirect': '输出位置被重定向',
    'manifest-write-failed': '结果记录未写入',
  };
  return map[String(reason)] || '未能输出';
}

export { EXPORT_STATE_LABELS, EXPORT_PAGE_LABELS };
