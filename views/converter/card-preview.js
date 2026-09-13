/*
## 核心功能

图片卡片预览视图（B02）：卡片模式的第三预览入口。绑定 B01 会话层（card-session），
把当前笔记正文走「解析 → 资源就绪 → 测量分页 → 页面装配」管线生成页计划，
以缩放缩略图形式展示，并提供摘要、空态、警告、过期（stale）状态、页级勾选（多选，
供「选中页」导出）与版本安全的源定位。

## 输入

AppleStyleView 实例状态（previewMode/previewContainer/app 等）、当前笔记 Markdown、
用户交互（页勾选、页点击定位、缩放、模式切换）。

## 输出

输出 `cardPreviewMethods`，由 AppleStyleView 统一组装：
- `renderCardPreview()`：卡片模式渲染入口（convertCurrent 分支调用）；
- `scheduleCardPreviewUpdate()`：编辑合并入口（300ms 停顿后排版，§5.6）；
  合并只调度排版，「正文已过期」的提示由 `markCardPreviewStaleNow()` 在事件到达即给出
  （会话 markPreviewStale + 摘要条 stale 提示同步刷新，§5.6 ≤250ms）；
- 模式操作显隐集中在 panel-shell.js 的 `applyModeActionVisibility()`；
- `setCardPreviewZoom()` / `adjustCardPreviewZoom()`：仅改变展示缩放，不改分页（§4.3）；
- `locateCardPageSource(pageIndex)`：版本安全源定位（陈旧结果不跳转）；
- 页勾选（多选）的读写与摘要 chip 在 **card-page-selection.js** 的独立方法组
  （`getCardPageSelection` / `applyCardPageSelection` / `toggleCardPageSelection` 等），
  本文件只负责在缩略页上渲染勾选控件并调用它；
- `disposeCardPreview()`：视图关闭时释放会话与资源。

## 定位

位于 views/converter/，卡片预览编排；解析/分页/资源/会话分别委托 services/，
页勾选拆到 card-page-selection.js（按职责拆分，避免本文件越过 800 行软警告线）。
排版管线集中在 `runCardLayoutPipeline`（测试可注入替身）。

## 依赖

`../apple-style-view-shared.js`；`services/card-document.js`、`card-resources.js`、
`card-render-engine.js`、`card-themes.js`、`card-session.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 预览 DOM 选择器以 icard- 前缀作用域（styles/card-preview.css 分片）。
- **勾选与定位必须分离**（规划 §3.1）：点页面本体只做源定位，选择集合只由左上角勾选控件改写。
- 选择写进会话（非空用 `setSelection`、清空用 `clearSelection`）：任一版本 bump 后由会话自动失效
  → 回落「全部」并在摘要提示，不得把旧页号对应到新内容（§5.2）。
- 导出/复制入口在 B04/B05/C03 接入前保持禁用或不展示，不得提前放行。
- 排版设置已在 B03 接入（会话归一化：card-settings-model.js）；主题/比例仍仅已验证值，C01 扩展。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- reason: AppleStyleView 方法组跨模块动态组合（同 sticker-preview），会话/runner 等合同字段以 unknown 持有，运行时语义由 B01 契约测试约束 */

import {
  resolveMarkdownSource,
  isMobileClient,
  MarkdownView,
} from '../apple-style-view-shared.js';
import { createCardDocument } from '../../services/card-document.js';
import {
  createCardResourcePool,
  createCardResourceSession,
  createSnapshotResolver,
} from '../../services/card-resources.js';
import { renderCardPages, RATIO_PRESETS } from '../../services/card-render-engine.js';
import { getCardTheme } from '../../services/card-themes.js';
import {
  createCardSessionRegistry,
  createPreviewRunner,
} from '../../services/card-session.js';

/** 编辑合并：停止输入 300ms 后启动排版（§5.6） */
export const CARD_PREVIEW_EDIT_MERGE_MS = 300;
/** 预览缩放范围（仅展示层） */
export const CARD_PREVIEW_ZOOM_MIN = 0.35;
export const CARD_PREVIEW_ZOOM_MAX = 1;
export const CARD_PREVIEW_ZOOM_STEP = 0.15;
export const CARD_PREVIEW_ZOOM_DEFAULT = 0.6;

/** 省略原因 → 用户可读标签（§4.1 一期口径） */
const OMISSION_LABELS = {
  codeBlock: '代码块',
  mermaid: 'Mermaid 图',
  gif: 'GIF 动图',
  blockFormula: '块级公式',
  inlineFormula: '行内公式',
  unsupportedEmbed: '未支持嵌入',
};

/**
 * 卡片视图状态（d.ts 合同以 unknown 持有，这里给运行时访问形状）。
 * @typedef {{
 *   cardSessionRegistry?: import('../../services/card-session.js').CardSessionRegistryLike | null,
 *   cardPreviewZoom?: number,
 *   cardPreviewZoomUserSet?: boolean,
 *   cardPreviewMergeTimer?: number | null,
 *   cardPreviewGeneration?: number,
 *   cardPreviewRunner?: { schedule(): Promise<{ applied: boolean, reason?: string } | null> } | null,
 *   cardPreviewRunnerNoteId?: string,
 *   cardPreviewPendingInput?: { markdown: string, sourcePath: string, sourcePathKey: string } | null,
 *   cardPreviewLastOutcome?: Record<string, any> | null,
 *   cardPreviewOutcome?: Record<string, any> | null,
 *   cardPreviewShell?: ObsidianElementLike | null,
 *   cardPreviewSelectedCount?: number,
 *   cardRenderedLayoutKey?: string,
 *   cardContentHashes?: Map<string, string>,
 *   cardResourceBudget?: import('../../services/card-resources.js').CardResourceSession | null
 * }} CardViewStateLike
 */

/**
 * @param {unknown} view
 * @returns {CardViewStateLike}
 */
function cardStateOf(view) {
  return /** @type {CardViewStateLike} */ (view);
}

/** @type {CardPreviewMethodsContract & ThisType<AppleStyleViewContract>} */
export const cardPreviewMethods = {
getCardSessions() {
  const selfRecord = cardStateOf(this);
  if (!selfRecord.cardSessionRegistry) {
    selfRecord.cardSessionRegistry = createCardSessionRegistry({
      // C02：全局默认仅在新会话创建时读取；会话内调整不写回，已存在会话不受后续变化影响
      getLayoutDefaults: () => {
        const defaults = /** @type {Record<string, unknown> | undefined} */ (
          /** @type {any} */ (this).plugin?.settings?.cardDefaults
        );
        return defaults && typeof defaults === 'object' ? defaults : undefined;
      },
    });
  }
  return /** @type {import('../../services/card-session.js').CardSessionRegistryLike} */ (selfRecord.cardSessionRegistry);
}
,

/** @returns {number} 当前预览缩放（仅展示层；未手动调整时按容器宽度自适应） */
getCardPreviewZoom() {
  const selfRecord = cardStateOf(this);
  const zoom = typeof selfRecord.cardPreviewZoom === 'number' ? selfRecord.cardPreviewZoom : CARD_PREVIEW_ZOOM_DEFAULT;
  return Math.min(CARD_PREVIEW_ZOOM_MAX, Math.max(CARD_PREVIEW_ZOOM_MIN, zoom));
}
,

/** @param {number} zoom */
setCardPreviewZoom(zoom) {
  const clamped = Math.min(CARD_PREVIEW_ZOOM_MAX, Math.max(CARD_PREVIEW_ZOOM_MIN, zoom));
  const selfRecord = cardStateOf(this);
  selfRecord.cardPreviewZoom = clamped;
  selfRecord.cardPreviewZoomUserSet = true;
  this.applyCardPreviewZoom();
}
,

/** @param {number} direction +1 放大 / -1 缩小 */
adjustCardPreviewZoom(direction) {
  this.setCardPreviewZoom(this.getCardPreviewZoom() + direction * CARD_PREVIEW_ZOOM_STEP);
}
,

/**
 * 首次渲染（用户未手动调过缩放）时按容器宽度自适应：取不产生横向滚动的最大缩放。
 * 375px 卡片在侧栏 100% 会溢出，固定默认值要么太小要么溢出，自适应是两全解。
 * @param {number} pageWidth 页面自然宽度（px）
 */
maybeAutoFitCardPreviewZoom(pageWidth) {
  const selfRecord = cardStateOf(this);
  if (selfRecord.cardPreviewZoomUserSet) return;
  const shell = selfRecord.cardPreviewShell;
  const available = shell
    ? /** @type {HTMLElement} */ (/** @type {unknown} */ (shell)).clientWidth - 24
    : 0;
  if (!pageWidth || available < CARD_PREVIEW_ZOOM_MIN * pageWidth) return;
  selfRecord.cardPreviewZoom = Math.min(
    CARD_PREVIEW_ZOOM_MAX,
    Math.max(CARD_PREVIEW_ZOOM_MIN, available / pageWidth),
  );
}
,

/** 把缩放应用到已渲染缩略图（不改分页，§4.3「预览缩放不改变分页」） */
applyCardPreviewZoom() {
  const shell = cardStateOf(this).cardPreviewShell;
  if (!shell) return;
  const zoom = this.getCardPreviewZoom();
  const percentLabel = shell.querySelector('.icard-preview-zoom-percent');
  if (percentLabel) percentLabel.textContent = `${Math.round(zoom * 100)}%`;
  shell.querySelectorAll('.icard-preview-page-item').forEach((item) => {
    const el = /** @type {HTMLElement} */ (item);
    const width = Number(el.dataset.pageWidth || '0');
    const height = Number(el.dataset.pageHeight || '0');
    if (!width || !height) return;
    el.style.setProperty('width', `${Math.round(width * zoom)}px`);
    el.style.setProperty('height', `${Math.round(height * zoom)}px`);
    const inner = el.querySelector('.icard-page');
    if (inner instanceof HTMLElement) {
      inner.style.setProperty('transform', `scale(${zoom})`);
    }
  });
}
,

/**
 * 编辑合并入口：编辑器事件频繁触发时只保留最后一次（§5.6「连续输入合并旧请求而非累积队列」）。
 * 合并只调度排版；「已过期」的反馈在事件到达即给出（markCardPreviewStaleNow，§5.6 ≤250ms）。
 */
scheduleCardPreviewUpdate() {
  const selfRecord = cardStateOf(this);
  if (selfRecord.cardPreviewMergeTimer) {
    window.clearTimeout(selfRecord.cardPreviewMergeTimer);
  }
  this.markCardPreviewStaleNow();
  selfRecord.cardPreviewMergeTimer = window.setTimeout(() => {
    selfRecord.cardPreviewMergeTimer = null;
    void this.renderCardPreview();
  }, CARD_PREVIEW_EDIT_MERGE_MS);
}
,

/**
 * 编辑事件到达即置 stale（§5.6：事件→标记 ≤250ms）：
 * 会话 markPreviewStale + 摘要条提示同步刷新，不等待合并窗口、不重绘缩略图。
 * 无旧结果（首渲染前）或当前无预览壳时为 no-op；合并渲染完成后由整树重绘自然摘除提示。
 */
markCardPreviewStaleNow() {
  const selfRecord = cardStateOf(this);
  const sourceKey = String(selfRecord.cardPreviewPendingInput?.sourcePathKey || '');
  if (!sourceKey || typeof this.getCardSessions !== 'function') return;
  const session = /** @type {any} */ (
    /** @type {any} */ (this.getCardSessions()).getSession(sourceKey)
  );
  if (!session || typeof session.markPreviewStale !== 'function') return;
  session.markPreviewStale();
  if (!session.getPreviewState().stale) return;
  const summary = selfRecord.cardPreviewShell?.querySelector('.icard-preview-summary') || null;
  if (!summary || summary.querySelector('.icard-preview-summary-stale')) return;
  const marker = summary.createEl('span', { cls: 'icard-preview-summary-stale', text: '正文已更新，正在重新排版…' });
  const count = summary.querySelector('.icard-preview-summary-count');
  if (count) summary.insertBefore(marker, count.nextSibling);
}
,

/**
 * 卡片模式渲染入口（convertCurrent / switchPreviewMode 分支调用）。
 * 直接读取当前笔记内容，卡片跟随未保存正文更新（与贴图模式一致）。
 */
async renderCardPreview() {
  if (!this.previewContainer) return undefined;

  const selfRecord = cardStateOf(this);
  const generation = (typeof selfRecord.cardPreviewGeneration === 'number' ? selfRecord.cardPreviewGeneration : 0) + 1;
  selfRecord.cardPreviewGeneration = generation;

  // B02 ⑥：移动端能力判断从接入第一刻生效，不触发排版管线
  if (isMobileClient(this.app)) {
    this.renderCardMobileNotice();
    return undefined;
  }

  const source = await this.resolveCardMarkdownSource();
  if (selfRecord.cardPreviewGeneration !== generation) return undefined;
  if (!source || !source.ok || !String(source.markdown || '').trim()) {
    this.renderCardEmptyState();
    return undefined;
  }

  const markdown = String(source.markdown);
  const sourcePath = String(source.sourcePath || '');
  const session = /** @type {import('../../services/card-session.js').CardNoteSessionLike} */ (
    /** @type {import('../../services/card-session.js').CardSessionRegistryLike} */ (this.getCardSessions()).getSession(sourcePath)
  );

  // 内容版本键：正文变化 → bump，选择/省略确认自动失效（B01 契约）
  const contentHash = String(this.simpleHash ? this.simpleHash(markdown) : markdown.length);
  if (selfRecord.cardContentHashes instanceof Map) {
    if (selfRecord.cardContentHashes.get(sourcePath) !== contentHash) {
      selfRecord.cardContentHashes.set(sourcePath, contentHash);
      session.bumpContent();
    }
  } else {
    selfRecord.cardContentHashes = new Map([[sourcePath, contentHash]]);
  }
  // 会话绑定 runner：换篇时重建；渲染负载先落 lastOutcome，settle 生效后转正
  if (!selfRecord.cardPreviewRunner || selfRecord.cardPreviewRunnerNoteId !== session.noteId) {
    selfRecord.cardPreviewRunnerNoteId = session.noteId;
    selfRecord.cardPreviewRunner = createPreviewRunner(session, async (ctx) => {
      const outcome = await this.runCardLayoutPipeline(ctx);
      if (outcome && !outcome.stale) selfRecord.cardPreviewLastOutcome = outcome;
      return outcome;
    });
  }
  selfRecord.cardPreviewPendingInput = { markdown, sourcePath, sourcePathKey: sourcePath };

  const settled = await selfRecord.cardPreviewRunner.schedule();
  if (selfRecord.cardPreviewGeneration !== generation) return undefined;
  if (!settled || !settled.applied) return undefined;
  selfRecord.cardPreviewOutcome = selfRecord.cardPreviewLastOutcome || null;
  return this.renderCardPreviewDom();
}
,

/**
 * 解析当前笔记 Markdown（测试可注入替身）。
 * @returns {Promise<{ ok: boolean, markdown?: string, sourcePath?: string } | null>}
 */
async resolveCardMarkdownSource() {
  return /** @type {any} */ (await resolveMarkdownSource({
    app: /** @type {any} */ (this.app),
    lastActiveFile: this.lastActiveFile,
    MarkdownViewType: MarkdownView,
  }));
}
,

/**
 * 排版管线：解析 → 资源就绪 → 字体等待 → 测量分页装配（测试可注入替身）。
 * @param {{ layoutKey: string, isStale: () => boolean }} ctx
 */
async runCardLayoutPipeline(ctx) {
  const selfRecord = cardStateOf(this);
  const input = selfRecord.cardPreviewPendingInput || { markdown: '', sourcePath: '' };
  // B03：排版设置来自会话（归一化后），调整设置 → bumpConfig → 新版本重排
  const settings = typeof (/** @type {any} */ (this).getCurrentCardLayoutSettings) === 'function'
    ? /** @type {any} */ (this).getCurrentCardLayoutSettings()
    : { themeId: 'clear-notes', ratioId: '3:4', fontSize: 14, lineHeight: 1.7, pagePadding: 28 };
  const cardDoc = createCardDocument(String(input.markdown || ''));

  const imageRefs = [];
  for (const block of cardDoc.blocks || []) {
    for (const image of block.images || []) imageRefs.push(image);
  }

  if (!selfRecord.cardResourceBudget) {
    selfRecord.cardResourceBudget = createCardResourceSession();
  }
  const pool = createCardResourcePool({
    app: this.app,
    sourcePath: String(input.sourcePath || ''),
    session: selfRecord.cardResourceBudget,
  });
  const resources = await pool.prepare(imageRefs);
  if (ctx.isStale()) return { ok: false, stale: true };
  await pool.waitForFonts(window.document);
  if (ctx.isStale()) return { ok: false, stale: true };

  // settings 已经过会话归一化（白名单主题/比例、钳制数值），直接取用
  const theme = getCardTheme(String(settings.themeId || 'clear-notes'));
  const size = RATIO_PRESETS[String(settings.ratioId || '3:4')] || RATIO_PRESETS['3:4'];
  const typography = {
    fontSize: Number(settings.fontSize),
    lineHeight: Number(settings.lineHeight),
    pagePadding: Number(settings.pagePadding),
  };
  const result = await renderCardPages(cardDoc, {
    theme,
    size,
    typography,
    resolveImageSrc: createSnapshotResolver(resources),
    resources,
    document: window.document,
  });
  result.detach();

  return {
    ok: result.ok === true,
    stale: false,
    pages: result.ok ? result.pages : [],
    plan: result.plan,
    cardDoc,
    resources,
    settings,
    diagnostics: result.diagnostics || [],
    omissionSummary: cardDoc.omissionSummary || { total: 0 },
    pageCount: result.ok ? result.pages.length : 0,
    layoutKey: ctx.layoutKey,
    sourcePath: input.sourcePath || '',
  };
}
,

/** 空态（未选文档 / 正文为空） */
renderCardEmptyState() {
  if (!this.previewContainer) return;
  this.previewContainer.empty();
  this.previewContainer.removeClass('apple-has-content');
  const empty = this.previewContainer.createEl('div', { cls: 'icard-preview-empty' });
  empty.createEl('div', { cls: 'icard-preview-empty-title', text: '暂无可排版的卡片内容' });
  empty.createEl('div', {
    cls: 'icard-preview-empty-desc',
    text: '请打开一篇 Markdown 笔记并输入正文；卡片将按 3:4 比例自动分页。',
  });
}
,

/** 移动端说明态（B02 ⑥：桌面能力延迟加载，不触发 Electron 依赖） */
renderCardMobileNotice() {
  if (!this.previewContainer) return;
  this.previewContainer.empty();
  this.previewContainer.removeClass('apple-has-content');
  const notice = this.previewContainer.createEl('div', { cls: 'icard-preview-empty' });
  notice.createEl('div', { cls: 'icard-preview-empty-title', text: '图片卡片目前仅支持桌面端' });
  notice.createEl('div', {
    cls: 'icard-preview-empty-desc',
    text: '移动端暂时无法进行卡片排版预览与导出，文章与贴图功能不受影响。',
  });
}
,

/** 失败态 */
renderCardFailureState(outcome) {
  if (!this.previewContainer) return;
  this.previewContainer.empty();
  this.previewContainer.removeClass('apple-has-content');
  const failure = this.previewContainer.createEl('div', { cls: 'icard-preview-empty is-failure' });
  failure.createEl('div', { cls: 'icard-preview-empty-title', text: '卡片排版失败' });
  /** @type {Record<string, any> | null | undefined} */
  const typedOutcome = /** @type {any} */ (outcome);
  const reasons = Array.isArray(typedOutcome?.diagnostics) ? typedOutcome.diagnostics : [];
  const message = reasons.length > 0
    ? reasons.map((d) => String(d?.message || '')).filter(Boolean).join('；') || '布局未能收敛，请调整内容后重试。'
    : '布局未能收敛，请调整内容后重试。';
  failure.createEl('div', { cls: 'icard-preview-empty-desc', text: message });
}
,

/**
 * 就绪态 DOM：摘要条 + 缩略页 + 缩放控制。
 * 状态依据 B01 会话（getPreviewState）+ 本次落账 outcome。
 */
renderCardPreviewDom() {
  const session = /** @type {import('../../services/card-session.js').CardNoteSessionLike} */ (
    /** @type {import('../../services/card-session.js').CardSessionRegistryLike} */ (this.getCardSessions())
      .getSession(String(cardStateOf(this).cardPreviewPendingInput?.sourcePathKey || ''))
  );
  const state = session.getPreviewState();
  const outcome = cardStateOf(this).cardPreviewOutcome;

  if (!state.hasResult) {
    this.renderCardEmptyState();
    return undefined;
  }
  if (state.state === 'failed') {
    this.renderCardFailureState(outcome);
    return undefined;
  }
  // 负载与当前版本不符（迟到结果竞态）时不重渲染：保持旧预览暂留
  if (!outcome || outcome.layoutKey !== session.currentLayoutKey()) {
    return undefined;
  }

  // B03/B05：上一渲染版本之后发生过 bump（正文/设置/主题）且当时有页勾选 → 选择已失效，提示并回落全部
  const selfRec = cardStateOf(this);
  const prevRenderedKey = String(selfRec.cardRenderedLayoutKey || '');
  const selectionResetNotice = Boolean(
    prevRenderedKey && prevRenderedKey !== String(outcome.layoutKey) && Number(selfRec.cardPreviewSelectedCount || 0) > 0,
  );
  if (selectionResetNotice) selfRec.cardPreviewSelectedCount = 0;

  const container = this.previewContainer;
  if (!container) return undefined;
  container.empty();
  container.removeClass('apple-has-content');

  const shell = /** @type {ObsidianElementLike} */ (/** @type {unknown} */ (container.createEl('div', { cls: 'icard-preview-shell' })));
  cardStateOf(this).cardPreviewShell = shell;

  // —— 摘要条（B02 ③：摘要 / 警告 / 过期状态）——
  const summary = shell.createEl('div', { cls: 'icard-preview-summary' });
  const pageCount = Number(outcome?.pageCount || 0);
  summary.createEl('span', { cls: 'icard-preview-summary-count', text: `共 ${pageCount} 页` });
  // 勾选摘要：文案与显隐由 syncCardPageSelectionDom 按当前选择渲染
  summary.createEl('span', { cls: 'icard-preview-chip is-selection hidden' });
  if (state.stale) {
    summary.createEl('span', { cls: 'icard-preview-summary-stale', text: '正文已更新，正在重新排版…' });
  }
  if (selectionResetNotice) {
    summary.createEl('span', {
      cls: 'icard-preview-chip is-info',
      text: '排版已更新，页选择已重置为全部',
    });
  }
  const omissionTotal = Number(outcome?.omissionSummary?.total || 0);
  if (omissionTotal > 0) {
    const chips = summary.createEl('span', { cls: 'icard-preview-summary-omissions' });
    chips.createEl('span', {
      cls: 'icard-preview-chip is-warning',
      text: `${omissionTotal} 处内容未进入卡片`,
    });
    for (const [reason, label] of Object.entries(OMISSION_LABELS)) {
      const count = Number(outcome?.omissionSummary?.[reason] || 0);
      if (count > 0) {
        chips.createEl('span', { cls: 'icard-preview-chip', text: `${label} ${count}` });
      }
    }
  }
  const resourceWarning = outcome?.resources?.hasBlockingFailures === true;
  if (resourceWarning) {
    summary.createEl('span', {
      cls: 'icard-preview-chip is-error',
      text: '部分图片未能加载，导出前需处理',
    });
  }

  // —— 全文省略空态（§B03 ⑤：正文全部未进入卡片时不产空白卡，逐条可定位）——
  if (pageCount === 0 && omissionTotal > 0) {
    const allOmitted = shell.createEl('div', { cls: 'icard-preview-empty is-all-omitted' });
    allOmitted.createEl('div', {
      cls: 'icard-preview-empty-title',
      text: '正文内容均无法进入卡片',
    });
    allOmitted.createEl('div', {
      cls: 'icard-preview-empty-desc',
      text: '下方列出了每一条未进入卡片的内容及其在原文中的位置；修改笔记后可重新排版。当前状态无法导出。',
    });
    this.renderCardDiagnosticArea(shell, outcome, session);
    selfRec.cardRenderedLayoutKey = String(outcome.layoutKey);
    return /** @type {ObsidianElementLike} */ (/** @type {unknown} */ (shell));
  }

  // —— 缩放控制（仅展示层）——
  const zoomBar = shell.createEl('div', { cls: 'icard-preview-zoombar' });
  const zoomOut = zoomBar.createEl('button', { cls: 'icard-preview-zoom-btn', attr: { 'aria-label': '缩小预览' }, text: '−' });
  zoomOut.addEventListener('click', () => this.adjustCardPreviewZoom(-1));
  zoomBar.createEl('span', { cls: 'icard-preview-zoom-percent', text: `${Math.round(this.getCardPreviewZoom() * 100)}%` });
  const zoomIn = zoomBar.createEl('button', { cls: 'icard-preview-zoom-btn', attr: { 'aria-label': '放大预览' }, text: '+' });
  zoomIn.addEventListener('click', () => this.adjustCardPreviewZoom(1));

  // —— 缩略页（每页带独立勾选控件）——
  const pagesWrap = shell.createEl('div', { cls: 'icard-preview-pages' });
  const pages = Array.isArray(outcome?.pages) ? outcome.pages : [];
  const size = RATIO_PRESETS['3:4'];
  const checkedIds = new Set(this.getCardPageSelection() || []);
  pages.forEach((pageEl, index) => {
    const pageId = `page-${index + 1}`;
    const checked = checkedIds.has(pageId);
    const item = pagesWrap.createEl('div', {
      cls: `icard-preview-page-item${checked ? ' is-selected' : ''}`,
      attr: { 'data-page-index': String(index + 1) },
    });
    item.dataset.pageWidth = String(size.width);
    item.dataset.pageHeight = String(size.height);
    if (pageEl instanceof HTMLElement) {
      item.appendChild(pageEl);
    }
    // 独立勾选控件（规划 §3.1）：选择与定位是两个互不干扰的单页操作。
    // 勾选控件自带 stopPropagation —— 勾选不得顺带把编辑器光标跳走。
    const check = item.createEl('button', {
      cls: `icard-preview-page-check${checked ? ' is-checked' : ''}`,
      attr: {
        type: 'button',
        'data-page-id': pageId,
        'aria-pressed': checked ? 'true' : 'false',
        'aria-label': `选择第 ${index + 1} 页`,
        title: `勾选第 ${index + 1} 页（导出时可只导出勾选的页）`,
      },
    });
    check.createEl('span', { cls: 'icard-preview-page-check-mark' });
    check.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleCardPageSelection(pageId);
    });
    const badge = item.createEl('div', { cls: 'icard-preview-page-badge', text: `第 ${index + 1} 页` });
    badge.setAttribute('data-icard-badge', '1');
    item.addEventListener('click', () => {
      // 点击本体 = 只做版本安全的源定位；选择集合只由勾选控件改写
      this.locateCardPageSource(index + 1);
    });
  });
  // —— 省略/资源诊断区（可展开、可定位、可确认；B03 ③④）——
  this.renderCardDiagnosticArea(shell, outcome, session);
  selfRec.cardRenderedLayoutKey = String(outcome.layoutKey);
  this.syncCardPageSelectionDom();
  this.maybeAutoFitCardPreviewZoom(Number(size.width));
  this.applyCardPreviewZoom();
  return /** @type {ObsidianElementLike} */ (/** @type {unknown} */ (shell));
}
,

/**
 * 省略/资源诊断区（B03）：可展开明细（类型 + 摘录 + 定位原文）、
 * 绑定版本的省略确认操作（bump 后自动失效，由会话保证）。
 * @param {ObsidianElementLike} shell
 * @param {Record<string, any>} outcome
 * @param {import('../../services/card-session.js').CardNoteSessionLike} session
 */
renderCardDiagnosticArea(shell, outcome, session) {
  const omissionTotal = Number(outcome?.omissionSummary?.total || 0);
  const resourceBlocking = outcome?.resources?.hasBlockingFailures === true;
  if (!omissionTotal && !resourceBlocking) return;

  const area = shell.createEl('div', { cls: 'icard-preview-diagnostics' });
  const toggle = area.createEl('button', {
    cls: 'icard-preview-diagnostics-toggle',
    text: '查看未进入卡片的内容',
    attr: { 'aria-expanded': 'false', 'title': '展开省略明细' },
  });
  const list = area.createEl('div', { cls: 'icard-preview-diagnostics-list hidden' });
  toggle.addEventListener('click', () => {
    const hidden = list.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    toggle.textContent = hidden ? '查看未进入卡片的内容' : '收起明细';
  });

  const blocks = Array.isArray(outcome?.cardDoc?.blocks) ? outcome.cardDoc.blocks : [];
  const diagnostics = Array.isArray(outcome?.diagnostics) ? outcome.diagnostics : [];
  for (const diag of diagnostics) {
    const block = blocks.find((b) => b && b.id === diag?.blockId);
    const excerpt = String(block?.text || diag?.detail || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    this.appendCardDiagnosticRow(area, list, {
      kind: OMISSION_LABELS[String(diag?.reason || '')] || String(diag?.reason || '未进入卡片'),
      excerpt,
      sourceStart: Number(diag?.sourceStart || 0),
      highRisk: diag?.highRisk === true,
    });
  }
  if (resourceBlocking) {
    const failed = Array.isArray(outcome?.resources?.failures) ? outcome.resources.failures : [];
    for (const failure of failed.slice(0, 20)) {
      this.appendCardDiagnosticRow(area, list, {
        kind: '图片加载失败',
        excerpt: String(failure?.ref || failure?.message || ''),
        sourceStart: Number(failure?.sourceStart || 0),
        highRisk: false,
      });
    }
  }

  if (omissionTotal > 0) {
    // 确认绑定本次渲染版本（layoutKey 已含正文+设置+主题+资源）：任一 bump 后自动失效
    const diagnosticVersion = String(outcome?.layoutKey || '');
    if (session.isOmissionConfirmed(diagnosticVersion)) {
      area.createEl('div', {
        cls: 'icard-preview-omission-confirmed',
        text: '已确认接受本次省略（内容或设置更新后需重新确认）',
      });
    } else {
      const confirmBtn = area.createEl('button', {
        cls: 'icard-preview-omission-confirm',
        text: '已知悉以上内容不会进入卡片，接受本次省略',
        attr: { 'title': '确认后才能导出；正文或排版设置变化后需重新确认' },
      });
      confirmBtn.addEventListener('click', () => {
        session.confirmOmissions(diagnosticVersion);
        this.renderCardPreviewDom();
      });
    }
  }
}
,

/**
 * 诊断明细行：类型 + 摘录 +（可定位时）定位按钮。
 * @param {ObsidianElementLike} area
 * @param {ObsidianElementLike} list
 * @param {{ kind: string, excerpt: string, sourceStart: number, highRisk: boolean }} item
 */
appendCardDiagnosticRow(area, list, item) {
  const row = list.createEl('div', { cls: 'icard-preview-diagnostic-row' });
  row.createEl('span', {
    cls: `icard-preview-diagnostic-type${item.highRisk ? ' is-high-risk' : ''}`,
    text: item.kind,
  });
  row.createEl('span', {
    cls: 'icard-preview-diagnostic-excerpt',
    text: item.excerpt || '（无文本摘录）',
  });
  if (item.sourceStart >= 1) {
    const locateBtn = row.createEl('button', {
      cls: 'icard-preview-diagnostic-locate',
      text: '定位',
      attr: { 'aria-label': `定位到原文第 ${item.sourceStart} 行`, 'title': '在编辑器中定位原文' },
    });
    locateBtn.addEventListener('click', () => this.locateCardSourceLine(item.sourceStart));
  }
}
,

/**
 * 源定位（B03 抽取，供页定位与诊断定位共用）：行号 1-based；编辑器不可用时静默跳过。
 * @param {number} lineNumber 1-based
 */
locateCardSourceLine(lineNumber) {
  const line = Number(lineNumber);
  if (!Number.isFinite(line) || line < 1) return;
  try {
    const markdownView = this.app?.workspace?.getActiveViewOfType?.(MarkdownView);
    const editor = /** @type {any} */ (markdownView?.editor);
    if (!editor) return;
    const zeroBased = Math.max(0, line - 1);
    if (typeof editor.setCursor === 'function') editor.setCursor({ line: zeroBased, ch: 0 });
    if (typeof editor.scrollIntoView === 'function') {
      editor.scrollIntoView({ from: { line: zeroBased, ch: 0 }, to: { line: zeroBased, ch: 0 } }, true);
    }
  } catch {
    // 编辑器不可用（如弹窗状态）时静默跳过定位
  }
}
,

/**
 * 版本安全的源定位（B02 ④）：结果已过期（layoutKey 与当前版本不符）时不跳转，
 * 避免把旧页号对应到新的错误内容（§5.2）。
 * @param {number} pageIndex 1-based
 */
locateCardPageSource(pageIndex) {
  const selfRecord = cardStateOf(this);
  const outcome = selfRecord.cardPreviewOutcome;
  if (!outcome) return;
  const session = /** @type {import('../../services/card-session.js').CardNoteSessionLike} */ (
    /** @type {import('../../services/card-session.js').CardSessionRegistryLike} */ (this.getCardSessions())
      .getSession(String(selfRecord.cardPreviewPendingInput?.sourcePathKey || ''))
  );
  if (!session || outcome.layoutKey !== session.currentLayoutKey()) return; // 已过期：不定位
  const planPage = Array.isArray(outcome?.plan?.pages) ? outcome.plan.pages[pageIndex - 1] : null;
  const firstEntry = planPage && Array.isArray(planPage.entries) ? planPage.entries[0] : null;
  const blockId = firstEntry ? String(firstEntry.blockId || '') : '';
  const block = blockId && Array.isArray(outcome.cardDoc?.blocks)
    ? outcome.cardDoc.blocks.find((b) => b && b.id === blockId)
    : null;
  const sourceStart = Number(block?.sourceStart || 0);
  if (!sourceStart || sourceStart < 1) return;
  try {
    const markdownView = this.app?.workspace?.getActiveViewOfType?.(MarkdownView);
    const editor = /** @type {any} */ (markdownView?.editor);
    if (!editor) return;
    const line = Math.max(0, sourceStart - 1);
    if (typeof editor.setCursor === 'function') editor.setCursor({ line, ch: 0 });
    if (typeof editor.scrollIntoView === 'function') {
      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    }
  } catch {
    // 编辑器不可用（如弹窗状态）时静默跳过定位
  }
}
,

/** 视图关闭：取消合并计时器、销毁全部会话与资源持有 */
disposeCardPreview() {
  const selfRecord = cardStateOf(this);
  if (selfRecord.cardPreviewMergeTimer) {
    window.clearTimeout(selfRecord.cardPreviewMergeTimer);
    selfRecord.cardPreviewMergeTimer = null;
  }
  selfRecord.cardPreviewGeneration = (selfRecord.cardPreviewGeneration || 0) + 1;
  selfRecord.cardPreviewRunner = null;
  selfRecord.cardPreviewRunnerNoteId = '';
  selfRecord.cardPreviewOutcome = null;
  selfRecord.cardPreviewShell = null;
  selfRecord.cardPreviewSelectedCount = 0;
  selfRecord.cardPreviewZoomUserSet = false;
  selfRecord.cardRenderedLayoutKey = '';
  if (selfRecord.cardSessionRegistry) {
    selfRecord.cardSessionRegistry.disposeAll();
    selfRecord.cardSessionRegistry = null;
  }
}
,
};
