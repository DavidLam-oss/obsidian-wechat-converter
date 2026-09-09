/*
## 核心功能

图片卡片预览视图（B02）：卡片模式的第三预览入口。绑定 B01 会话层（card-session），
把当前笔记正文走「解析 → 资源就绪 → 测量分页 → 页面装配」管线生成页计划，
以缩放缩略图形式展示，并提供摘要、空态、警告、过期（stale）状态、页选择与版本安全的源定位。

## 输入

AppleStyleView 实例状态（previewMode/previewContainer/app 等）、当前笔记 Markdown、
用户交互（页点击、缩放、模式切换）。

## 输出

输出 `cardPreviewMethods`，由 AppleStyleView 统一组装：
- `renderCardPreview()`：卡片模式渲染入口（convertCurrent 分支调用）；
- `scheduleCardPreviewUpdate()`：编辑合并入口（300ms 停顿后排版，§5.6）；
- 模式操作显隐集中在 panel-shell.js 的 `applyModeActionVisibility()`；
- `setCardPreviewZoom()` / `adjustCardPreviewZoom()`：仅改变展示缩放，不改分页（§4.3）；
- `locateCardPageSource(pageIndex)`：版本安全源定位（陈旧结果不跳转）；
- `disposeCardPreview()`：视图关闭时释放会话与资源。

## 定位

位于 views/converter/，卡片预览编排；解析/分页/资源/会话分别委托 services/。
排版管线集中在 `runCardLayoutPipeline`（测试可注入替身）。

## 依赖

`../apple-style-view-shared.js`；`services/card-document.js`、`card-resources.js`、
`card-render-engine.js`、`card-themes.js`、`card-session.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 预览 DOM 选择器以 icard- 前缀作用域（styles/card-preview.css 分片）。
- 导出/复制入口在 B04/B05/C03 接入前保持禁用或不展示，不得提前放行。
- 排版设置（主题/比例/字号）在 B03 接入；当前固定 3:4 + 默认主题。
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
import { getCardTheme, DEFAULT_CARD_THEME_ID } from '../../services/card-themes.js';
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
 *   cardPreviewMergeTimer?: number | null,
 *   cardPreviewGeneration?: number,
 *   cardPreviewRunner?: { schedule(): Promise<{ applied: boolean, reason?: string } | null> } | null,
 *   cardPreviewRunnerNoteId?: string,
 *   cardPreviewPendingInput?: { markdown: string, sourcePath: string, sourcePathKey: string } | null,
 *   cardPreviewLastOutcome?: Record<string, any> | null,
 *   cardPreviewOutcome?: Record<string, any> | null,
 *   cardPreviewShell?: ObsidianElementLike | null,
 *   cardSelectedPageIndex?: number,
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
    selfRecord.cardSessionRegistry = createCardSessionRegistry();
  }
  return selfRecord.cardSessionRegistry;
}
,

/** @returns {number} 当前预览缩放（仅展示层，默认 0.6） */
getCardPreviewZoom() {
  const selfRecord = cardStateOf(this);
  const zoom = typeof selfRecord.cardPreviewZoom === 'number' ? selfRecord.cardPreviewZoom : CARD_PREVIEW_ZOOM_DEFAULT;
  return Math.min(CARD_PREVIEW_ZOOM_MAX, Math.max(CARD_PREVIEW_ZOOM_MIN, zoom));
}
,

/** @param {number} zoom */
setCardPreviewZoom(zoom) {
  const clamped = Math.min(CARD_PREVIEW_ZOOM_MAX, Math.max(CARD_PREVIEW_ZOOM_MIN, zoom));
  cardStateOf(this).cardPreviewZoom = clamped;
  this.applyCardPreviewZoom();
}
,

/** @param {number} direction +1 放大 / -1 缩小 */
adjustCardPreviewZoom(direction) {
  this.setCardPreviewZoom(this.getCardPreviewZoom() + direction * CARD_PREVIEW_ZOOM_STEP);
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
    el.style.width = `${Math.round(width * zoom)}px`;
    el.style.height = `${Math.round(height * zoom)}px`;
    const inner = el.querySelector('.icard-page');
    if (inner instanceof HTMLElement) {
      inner.style.transform = `scale(${zoom})`;
    }
  });
}
,

/**
 * 编辑合并入口：编辑器事件频繁触发时只保留最后一次（§5.6「连续输入合并旧请求而非累积队列」）。
 */
scheduleCardPreviewUpdate() {
  const selfRecord = cardStateOf(this);
  if (selfRecord.cardPreviewMergeTimer) {
    window.clearTimeout(selfRecord.cardPreviewMergeTimer);
  }
  selfRecord.cardPreviewMergeTimer = window.setTimeout(() => {
    selfRecord.cardPreviewMergeTimer = null;
    void this.renderCardPreview();
  }, CARD_PREVIEW_EDIT_MERGE_MS);
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

  const theme = getCardTheme(DEFAULT_CARD_THEME_ID);
  const size = { width: RATIO_PRESETS['3:4'].width, height: RATIO_PRESETS['3:4'].height };
  const result = await renderCardPages(cardDoc, {
    theme,
    size,
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
  if (state.stale) {
    summary.createEl('span', { cls: 'icard-preview-summary-stale', text: '正文已更新，正在重新排版…' });
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

  // —— 缩放控制（仅展示层）——
  const zoomBar = shell.createEl('div', { cls: 'icard-preview-zoombar' });
  const zoomOut = zoomBar.createEl('button', { cls: 'icard-preview-zoom-btn', attr: { 'aria-label': '缩小预览' }, text: '−' });
  zoomOut.addEventListener('click', () => this.adjustCardPreviewZoom(-1));
  zoomBar.createEl('span', { cls: 'icard-preview-zoom-percent', text: `${Math.round(this.getCardPreviewZoom() * 100)}%` });
  const zoomIn = zoomBar.createEl('button', { cls: 'icard-preview-zoom-btn', attr: { 'aria-label': '放大预览' }, text: '+' });
  zoomIn.addEventListener('click', () => this.adjustCardPreviewZoom(1));

  // —— 缩略页 ——
  const pagesWrap = shell.createEl('div', { cls: 'icard-preview-pages' });
  const pages = Array.isArray(outcome?.pages) ? outcome.pages : [];
  const size = RATIO_PRESETS['3:4'];
  pages.forEach((pageEl, index) => {
    const item = pagesWrap.createEl('div', {
      cls: 'icard-preview-page-item',
      attr: { 'data-page-index': String(index + 1) },
    });
    item.dataset.pageWidth = String(size.width);
    item.dataset.pageHeight = String(size.height);
    if (pageEl instanceof HTMLElement) {
      item.appendChild(pageEl);
    }
    const badge = item.createEl('div', { cls: 'icard-preview-page-badge', text: `第 ${index + 1} 页` });
    badge.setAttribute('data-icard-badge', '1');
    item.addEventListener('click', () => {
      // 点击 = 选中并尝试源定位（版本安全）
      pagesWrap.querySelectorAll('.icard-preview-page-item.is-selected').forEach((sel) => {
        (/** @type {HTMLElement} */ (sel)).classList.remove('is-selected');
      });
      item.classList.add('is-selected');
      cardStateOf(this).cardSelectedPageIndex = index + 1;
      session.setSelection([`page-${index + 1}`]);
      this.locateCardPageSource(index + 1);
    });
  });
  this.applyCardPreviewZoom();
  return /** @type {ObsidianElementLike} */ (/** @type {unknown} */ (shell));
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
  selfRecord.cardSelectedPageIndex = 0;
  if (selfRecord.cardSessionRegistry) {
    selfRecord.cardSessionRegistry.disposeAll();
    selfRecord.cardSessionRegistry = null;
  }
}
,
};
