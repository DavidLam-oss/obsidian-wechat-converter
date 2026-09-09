/*
## 核心功能

图片卡片渲染引擎：页面装配（主题 CSS + 内容 DOM + 页脚）、离屏附着容器、**真实 DOM 测量**（A05）、
**分页片段重建**（A05：measure → plan → assemble 布局循环）、截图捕获（modern-screenshot，A06 选型定案）。

## 输入

`assembleCardPage({theme, doc, pageNumber, pageCount, resolveImageSrc?, resources?, document})` → 单页根元素；
`measureCardDocument(doc, {theme, size, resolveImageSrc, document})` → 测量结果（heights/childHeights/paragraphUnits/paragraphSpans）；
`renderCardPages(doc, options)` → 分页布局循环：测量（真实 DOM 离屏容器）→ createCardPagePlan 装箱 →
assembleCardPageFromPlan 片段重建 → 逐页溢出检查（超限则收缩可用高度重排，最多 LAYOUT_ROUND_BUDGET 轮）→ 附着页面 + detach 句柄；
`capturePage(root, {library, pixelRatio, timeoutMs, document})` → Blob。

## 输出

PNG Blob（捕获）；页面 DOM（装配）；测量结果与分页页面集合（含 detach，调用方捕获完后必须调用）。

## 关键约束（规划 §5.1）

- 测量/捕获容器必须附着在真实文档并参与布局：position:fixed + visibility:hidden，禁止 display:none。
- 预览与导出同一页面模板；仅输出倍率不同。屏幕 DPR 不额外相乘（scale 即目标倍率）。
- 截图节点与工具壳分离：捕获目标只是 `.icard-page`，不含选择框/按钮。
- 测量与装配必须用同一渲染路径（renderBlockElement/renderCalloutBlock + wrapParagraphSpans 确定性包裹），
  保证 span 序号两次渲染一致（行区间可重放）。

## 测量模型（A05）

- heights：顶层块整体高度（原子块装箱用）。
- childHeights：list 逐项高度 / callout 逐子块高度（>1 项才可拆）。
  callout 子块高度含**续页开销估算**：每单元 + 引用块垂直内边距（20px），首单元另 + 标题高度
  （保守方向：宁可提前分页，不可裁切；续页「（续）」标题高度差额由布局循环的溢出检查兜底）。
- paragraphUnits/paragraphSpans：段落按 CJK 字符/拉丁词 span 包裹后按 offsetTop 分行，
  units = 各行高度，spans = 各行 span 区间 [start, end)（装配时过滤重建）。
- 含行内图片的段落不拆行（图片跨行无法安全拆分），保持原子。
- contentHeight = 页高 − 上下页边距 − 页脚实测高度；块间 gap（主题 contentGap）由装箱 itemGap 计入。

## 定位

位于 services/，卡片渲染、测量与捕获层；动态 import modern-screenshot（A06 选型：0 失败稳定性优于 snapdom，详见 docs/plans/evidence/image-card-phase1/A06/record.md）。

## 依赖

`modern-screenshot@4.7.0`（MIT，唯一捕获引擎）；`card-themes.js`、`card-render-profile.js`、`card-pagination.js`、`card-resources.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 引擎选型结论回写规划文档附录；落选库连同其适配代码一并移除。
- callout 续页开销常量（CALLOUT_PAD_VERTICAL 等）与 card-themes token 联动，token 变更时同步。
*/

import { CARD_PAGE_WIDTH, CARD_PAGE_HEIGHT_3_4, buildCardPageCss, getCardTheme, DEFAULT_CARD_THEME_ID } from "./card-themes.js";
import { renderBlockContent, renderBlockElement, renderCalloutBlock, wrapParagraphSpans } from "./card-render-profile.js";
import { createSnapshotResolver } from "./card-resources.js";
import {
  LAYOUT_ROUND_BUDGET,
  createCardPagePlan,
  createLayoutItems,
  mapManualBreaks,
  verifyPagePlan,
} from "./card-pagination.js";

/** 捕获引擎白名单（A06 选型定案：仅 modern-screenshot；snapdom 因真实内容页 URI malformed 落选移除） */
export const CAPTURE_LIBRARY_IDS = /** @type {const} */ (["modern-screenshot"]);
export const DEFAULT_CAPTURE_TIMEOUT_MS = 15000;

/** 比例 → 逻辑尺寸（规划 §4.3：统一由比例计算，最终像素 = 逻辑 × 倍率后取整） */
export const RATIO_PRESETS = /** @type {const} */ ({
  "3:4": { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 },
  "3:5": { width: CARD_PAGE_WIDTH, height: Math.round((CARD_PAGE_WIDTH * 5) / 3) },
  "9:16": { width: CARD_PAGE_WIDTH, height: Math.round((CARD_PAGE_WIDTH * 16) / 9) },
});

/**
 * 创建页面壳（.icard-page + content 容器，不含页脚）。
 * @param {Document} ownerDoc
 * @param {{width?: number, height?: number}} size
 * @param {number} pageIndex 1-based
 * @returns {{page: HTMLElement, content: HTMLElement}}
 */
function createPageShell(ownerDoc, size, pageIndex) {
  const page = ownerDoc.createElement("div");
  page.className = "icard icard-page";
  page.style.setProperty("--icard-page-width", `${size.width}px`);
  page.style.setProperty("--icard-page-height", `${size.height}px`);
  page.setAttribute("data-icard-page-index", String(pageIndex));
  const content = ownerDoc.createElement("div");
  content.className = "icard-content";
  page.append(content);
  return { page, content };
}

/**
 * 构建页脚（页码）。
 * @param {Document} ownerDoc
 * @param {number} pageNumber 1-based
 * @param {number} pageCount
 * @returns {HTMLElement}
 */
function buildPageFooter(ownerDoc, pageNumber, pageCount) {
  const footer = ownerDoc.createElement("div");
  footer.className = "icard-footer";
  const pageNum = ownerDoc.createElement("span");
  pageNum.className = "icard-page-num";
  pageNum.textContent = `${pageNumber} / ${pageCount}`;
  footer.append(pageNum);
  return footer;
}

/**
 * 页面装配：主题样式 + 内容 + 页脚（页码）。
 * @param {object} args
 * @param {import('./card-themes.js').CardTheme} args.theme CardTheme
 * @param {import('./card-document.js').CardDocument} args.doc CardDocument
 * @param {number} [args.pageNumber] 1-based（正文页）
 * @param {number} [args.pageCount]
 * @param {(ref: string) => string | null} [args.resolveImageSrc]
 * @param {import('./card-resources.js').CardResourceSnapshot} [args.resources] 资源快照句柄；未显式传 resolveImageSrc 时由快照构造
 * @param {Document} [args.document]
 * @param {{width?: number, height?: number}} [args.size]
 * @returns {HTMLElement} `.icard-page` 根元素
 */
export function assembleCardPage(args) {
  const ownerDoc = args.document || window.document;
  const size = args.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 };
  const resolveImageSrc = args.resolveImageSrc || (args.resources ? createSnapshotResolver(args.resources) : undefined);

  const { page, content } = createPageShell(ownerDoc, size, args.pageNumber || 1);
  const { fragment } = renderBlockContent(args.doc, {
    resolveImageSrc,
    doc: ownerDoc,
  });
  content.append(fragment);
  page.append(buildPageFooter(ownerDoc, args.pageNumber || 1, args.pageCount || 1));

  return page;
}

/**
 * 构建页面级 <style>（幂等：同一文档只注入一次）。
 * @param {import('./card-themes.js').CardTheme} theme
 * @param {Document} [ownerDoc]
 * @returns {HTMLStyleElement}
 */
export function ensurePageStyle(theme, ownerDoc) {
  const doc = ownerDoc || window.document;
  const styleId = "icard-theme-style";
  let style = /** @type {HTMLStyleElement|null} */ (doc.getElementById(styleId));
  if (!style) {
    style = doc.createElement("style");
    style.setAttribute("id", styleId);
    doc.head.append(style);
  }
  style.textContent = buildCardPageCss(theme);
  return style;
}

/**
 * 离屏附着容器：参与布局但不可见、不可交互；调用方负责 detach。
 * @param {Document} [ownerDoc]
 * @returns {{container: HTMLElement, detach: () => void}}
 */
export function attachOffscreenContainer(ownerDoc) {
  const doc = ownerDoc || window.document;
  const container = doc.createElement("div");
  container.setAttribute("data-icard-offscreen", "true");
  container.className = "icard-offscreen";
  doc.body.append(container);
  return {
    container,
    detach: () => {
      if (container.parentNode) container.parentNode.removeChild(container);
    },
  };
}

/* ===================== A05：真实 DOM 测量与分页装配 ===================== */
/* 测量/装配消费无类型的 CardBlock（JSDoc 形状）与 DOM 探针代码，TS 服务器推断为 any；
   所有节点均经安全 DOM API 构建并由 card_layout_integration.test.js 断言，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- CardBlock 无类型定义 + DOM 探针 */

/** callout 引用块垂直内边距（card-themes blockquote padding 10px × 2；token 变更时同步） */
export const CALLOUT_PAD_VERTICAL = 20;

/** 布局循环溢出重排的安全余量（px） */
export const LAYOUT_OVERFLOW_SLACK = 4;

/* ===================== 布局调试日志（window.ICARD_DEBUG_LAYOUT 开关控制） =====================
 * 用途：诊断「页底空白 / 提前断页」。在宿主控制台执行 window.ICARD_DEBUG_LAYOUT = true 后
 * 重新触发卡片排版即可输出每轮装箱明细；默认关闭、零开销。 */

/**
 * @param {number} round
 * @param {{ contentHeight: number, itemGap: number, measured: any, items: any[], pages: any[] }} data
 */
function debugLayoutLog(round, data) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  const lines = [];
  lines.push(`[icard-layout] round=${round} contentHeight=${Math.round(data.contentHeight)} itemGap=${data.itemGap} pages=${data.pages.length}`);
  const itemById = new Map(data.items.map((it) => [it.blockId, it]));
  data.pages.forEach((page) => {
    const parts = page.entries.map((/** @type {any} */ e) => {
      const it = itemById.get(e.blockId);
      let h = 0;
      if (it) {
        h = e.scaled ? data.contentHeight
          : it.units.slice(e.unitStart, e.unitEnd).reduce((/** @type {number} */ a, /** @type {{height: number}} */ u, /** @type {number} */ i) =>
            a + u.height + (i > 0 ? it.unitGap : 0), 0);
      }
      const src = it && it.meta ? `${it.meta.sourceStart}-${it.meta.sourceEnd}` : "?";
      return `${e.blockId}@${src}[${e.unitStart},${e.unitEnd})${e.continuedFrom ? "^" : ""}${e.continues ? "…" : ""}${e.scaled ? "scaled" : ""}≈${Math.round(h)}`;
    });
    const used = page.entries.reduce((/** @type {number} */ acc, /** @type {any} */ e, /** @type {number} */ i) => {
      const it = itemById.get(e.blockId);
      let h = 0;
      if (it) {
        h = e.scaled ? data.contentHeight
          : it.units.slice(e.unitStart, e.unitEnd).reduce((/** @type {number} */ a, /** @type {{height: number}} */ u, /** @type {number} */ i) =>
            a + u.height + (i > 0 ? it.unitGap : 0), 0);
      }
      return acc + h + (i > 0 ? data.itemGap : 0);
    }, 0);
    lines.push(`[icard-layout]   p${page.index} used≈${Math.round(used)} | ${parts.join("  ")}`);
  });
  const paraInfo = Object.entries(data.measured.paragraphUnits || {})
    .map(([id, units]) => `${id}:${/** @type {any[]} */ (units).length}行/${Math.round(/** @type {any[]} */ (units).reduce((a, u) => a + u.height, 0))}px`)
    .join(" ");
  lines.push(`[icard-layout] 段落行单元 ${paraInfo || "无"}`);
  const heights = Object.entries(data.measured.heights || {})
    .map(([id, h]) => `${id}:${Math.round(/** @type {number} */ (h))}`)
    .join(" ");
  lines.push(`[icard-layout] 块高 ${heights}`);
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(lines.join("\n"));
}

/**
 * @param {number} round
 * @param {number} worst
 * @param {number} contentHeight
 */
function debugLayoutLogOverflow(round, worst, contentHeight) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(`[icard-layout] round=${round} 溢出核验 worst=${worst}px → contentHeight ${Math.round(contentHeight)}${worst > 0 ? ` → 收缩至 ${Math.round(contentHeight - worst - LAYOUT_OVERFLOW_SLACK)}` : "（通过）"}`);
}

/**
 * @param {number} round
 * @param {Array<{ blockId: string, message: string }>} diagnostics
 * @param {number} contentHeight
 */
function debugLayoutLogFail(round, diagnostics, contentHeight) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  const lines = [`[icard-layout] round=${round} 布局失败（contentHeight=${Math.round(contentHeight)}）诊断 ${diagnostics.length} 条：`];
  for (const d of diagnostics) lines.push(`[icard-layout]   ✗ ${d.blockId || "-"}: ${d.message}`);
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(lines.join("\n"));
}

/**
 * 资源快照状态诊断：排查「图片没出来」（ref 缺失 / resolve-failed / error / timeout / budget 等）。
 * @param {import('./card-resources.js').CardResourceSnapshot} [resources]
 */
function debugLayoutLogResources(resources) {
  const w = /** @type {any} */ (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.ICARD_DEBUG_LAYOUT) return;
  const images = (resources && resources.images) || {};
  const refs = Object.keys(images);
  const lines = [`[icard-layout] 资源快照 ${refs.length} 张图片：`];
  for (const ref of refs) {
    const e = /** @type {any} */ (images[ref]);
    lines.push(`[icard-layout]   ${e.status === "ok" ? "✓" : "✗"} [${e.status}] ${ref.slice(0, 80)}${e.width ? ` ${e.width}x${e.height}` : ""}${e.bytes ? ` ${(e.bytes / 1024).toFixed(0)}KB` : ""}`);
  }
  // eslint-disable-next-line no-console -- 受 ICARD_DEBUG_LAYOUT 开关控制的诊断输出
  console.log(lines.join("\n"));
}

/**
 * 单页可用内容高度 = 页高 − 上下页边距 − 页脚实测高度。
 * 显式传 contentHeight 时直接返回（测试/覆盖入口）。
 * @param {object} options
 * @param {import('./card-themes.js').CardTheme} [options.theme]
 * @param {{width: number, height: number}} [options.size]
 * @param {Document} [options.document]
 * @param {number} [options.contentHeight]
 * @returns {number}
 */
export function measureContentHeight(options = {}) {
  if (typeof options.contentHeight === "number") return options.contentHeight;
  const ownerDoc = options.document || window.document;
  const theme = options.theme || getCardTheme(DEFAULT_CARD_THEME_ID);
  const size = options.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 };
  const offscreen = attachOffscreenContainer(ownerDoc);
  try {
    const probe = assembleCardPage({
      theme,
      doc: /** @type {any} */ ({ blocks: [], paginationMarkers: [] }),
      document: ownerDoc,
      size,
    });
    offscreen.container.append(probe);
    const footer = probe.querySelector(".icard-footer");
    const probeStyle = ownerDoc.defaultView && ownerDoc.defaultView.getComputedStyle
      ? ownerDoc.defaultView.getComputedStyle(probe)
      : null;
    const padTop = parseFloat((probeStyle && probeStyle.paddingTop) || "") || 0;
    const padBottom = parseFloat((probeStyle && probeStyle.paddingBottom) || "") || 0;
    const footerEl = /** @type {HTMLElement|null} */ (footer);
    const footerH = footerEl ? footerEl.offsetHeight : 0;
    return Math.max(1, size.height - padTop - padBottom - footerH);
  } finally {
    offscreen.detach();
  }
}

/**
 * 等待 root 内所有图片就绪（加载成功或失败都算就绪），带总超时兜底。
 * 目的：消除「测量时图片未加载 → 高度按 0 计 → 计划认为放得下 → 实际渲染溢出被裁」的竞态（B02 实机回归）。
 * @param {Element} root
 * @param {number} [timeoutMs] 单张图片等待上限（默认 4s；超时按当前状态继续测量，宁可显式溢出收缩也不挂死）
 * @returns {Promise<void>}
 */
async function waitForImagesReady(root, timeoutMs = 4000) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map((im) => {
    const img = /** @type {HTMLImageElement} */ (im);
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }));
}

/**
 * 真实 DOM 测量（A05 ①）：在参与布局的离屏容器中渲染每个块并读取实际高度。
 * 测量与装配共用 renderBlockElement/renderCalloutBlock/wrapParagraphSpans（确定性包裹，span 序号可重放）。
 * 说明：
 * - list 逐项（>1 项才可拆）、callout 逐子块（>1 个才可拆；子块高度含续页开销估算：每单元 + 引用块垂直内边距，
 *   首单元另 + 标题高度——保守方向，宁可提前分页不可裁切）。
 * - 段落按 span 包裹后 offsetTop 分行；含行内图片的段落保持原子（图片无法安全跨行拆分），
 *   并附测去图纯文本高度（imageParagraphs）供装箱层超高时收缩图片。
 * - 图片块先等加载完成再读高度（waitForImagesReady），保证测量与实际渲染一致。
 * - callout 子块高度与 renderChildren 按下标一一对应（标题剥离后为空的段落计 0，与装配端的跳过行为一致）。
 * @param {import('./card-document.js').CardDocument} cardDoc
 * @param {object} [options]
 * @param {import('./card-themes.js').CardTheme} [options.theme]
 * @param {string} [options.themeId]
 * @param {{width?: number, height?: number}} [options.size]
 * @param {(ref: string) => string | null} [options.resolveImageSrc]
 * @param {import('./card-resources.js').CardResourceSnapshot} [options.resources] 资源快照句柄；未显式传 resolveImageSrc 时由快照构造
 * @param {Document} [options.document]
 * @returns {Promise<{ heights: Record<string, number>, childHeights: Record<string, number[]>, paragraphUnits: Record<string, Array<{height: number}>>, paragraphSpans: Record<string, Array<[number, number]>>, imageParagraphs: Record<string, { textHeight: number, imageCount: number }> >}
 */
export async function measureCardDocument(cardDoc, options = {}) {
  const ownerDoc = options.document || window.document;
  const theme = options.theme || getCardTheme(options.themeId);
  const size = options.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 };
  const resolveImageSrc = options.resolveImageSrc ||
    (options.resources ? createSnapshotResolver(options.resources) : undefined);

  ensurePageStyle(theme, ownerDoc);
  const offscreen = attachOffscreenContainer(ownerDoc);
  /** @type {Record<string, number>} */
  const heights = {};
  /** @type {Record<string, number[]>} */
  const childHeights = {};
  /** @type {Record<string, Array<{height: number}>>} */
  const paragraphUnits = {};
  /** @type {Record<string, Array<[number, number]>>} */
  const paragraphSpans = {};
  /** @type {Record<string, { textHeight: number, imageCount: number }>} */
  const imageParagraphs = {};
  try {
    // 测量宿主与 .icard-page 同构（同宽、同 padding），但不设固定高：内容自然延展
    const host = ownerDoc.createElement("div");
    host.className = "icard icard-page icard-measure-host";
    host.style.setProperty("--icard-page-width", `${size.width}px`);
    const content = ownerDoc.createElement("div");
    content.className = "icard-content";
    host.append(content);
    offscreen.container.append(host);

    const appendBlock = (el) => {
      content.append(el);
      return el;
    };

    for (const block of cardDoc.blocks || []) {
      if (block.parentId) continue;
      if (block.disposition !== "render" || block.type === "paginationMarker") continue;

      if (block.type === "callout" || block.type === "blockquote") {
        const allChildren = (cardDoc.blocks || []).filter((b) => b.parentId === block.id);
        const renderChildren = allChildren.filter((c) => c.disposition === "render");
        if (renderChildren.length > 1) {
          const quoteFull = appendBlock(renderCalloutBlock(block, allChildren, { resolveImageSrc, doc: ownerDoc }));
          await waitForImagesReady(quoteFull);
          heights[block.id] = quoteFull.offsetHeight;
          quoteFull.remove();
          // 标题实测（含下边距）
          const titleProbe = appendBlock(renderCalloutBlock(block, [], { resolveImageSrc, doc: ownerDoc }));
          const titleEl = titleProbe.querySelector(".icard-callout-title");
          let titleH = 0;
          if (titleEl) {
            const titleStyle = ownerDoc.defaultView && ownerDoc.defaultView.getComputedStyle
              ? ownerDoc.defaultView.getComputedStyle(titleEl)
              : null;
            titleH = titleEl.offsetHeight + (parseFloat((titleStyle && titleStyle.marginBottom) || "") || 0);
          }
          titleProbe.remove();
          // 逐子块探针：与装配端同一渲染路径（含标题剥离/空段跳过），保证下标对齐 renderChildren
          const perChild = renderChildren.map((child) => {
            const probe = appendBlock(renderCalloutBlock(block, [child], { resolveImageSrc, doc: ownerDoc }));
            const probeTitle = probe.querySelector(".icard-callout-title");
            const bodyEls = Array.from(probe.children).filter((el) => el !== probeTitle);
            const h = bodyEls.reduce((acc, el) => acc + el.offsetHeight, 0);
            probe.remove();
            return h;
          });
          childHeights[block.id] = perChild.map((h, i) => h + CALLOUT_PAD_VERTICAL + (i === 0 ? titleH : 0));
        } else {
          const quote = appendBlock(renderCalloutBlock(block, allChildren, { resolveImageSrc, doc: ownerDoc }));
          await waitForImagesReady(quote);
          heights[block.id] = quote.offsetHeight;
        }
        continue;
      }

      const el = renderBlockElement(block, { resolveImageSrc, doc: ownerDoc });
      if (!el) continue;
      appendBlock(el);
      await waitForImagesReady(el);
      const blockEl = /** @type {HTMLElement} */ (el);
      heights[block.id] = blockEl.offsetHeight;

      if (block.type === "list") {
        const lis = Array.from(el.children).filter((c) => c.tagName === "LI");
        if (lis.length > 1) {
          childHeights[block.id] = lis.map((li) => /** @type {HTMLElement} */ (li).offsetHeight);
        }
      } else if (block.type === "paragraph") {
        const hasImages = (block.images || []).some((img) => !img.gif && !img.excluded);
        if (!hasImages) {
          const total = wrapParagraphSpans(blockEl, ownerDoc);
          const spans = Array.from(el.querySelectorAll("span[data-icard-span]"));
          /** @type {Array<{top: number, height: number, start: number}>} */
          const lines = [];
          for (const spanEl of spans) {
            const span = /** @type {HTMLElement} */ (spanEl);
            const top = span.offsetTop;
            const index = Number(span.getAttribute("data-icard-span"));
            const last = lines[lines.length - 1];
            if (!last || last.top !== top) {
              lines.push({ top, height: span.offsetHeight, start: index });
            } else if (span.offsetHeight > last.height) {
              last.height = span.offsetHeight;
            }
          }
          if (lines.length > 1) {
            paragraphUnits[block.id] = lines.map((l) => ({ height: l.height }));
            paragraphSpans[block.id] = lines.map((l, i) =>
              /** @type {[number, number]} */ ([l.start, i + 1 < lines.length ? lines[i + 1].start : total])
            );
          }
        } else {
          // 行内图片段落：附测「去图纯文本高度」（供装箱层超高时按预算收缩图片，B02 实机回归）
          const imgEls = Array.from(el.querySelectorAll("img"));
          if (imgEls.length > 0) {
            const textProbe = /** @type {HTMLElement} */ (blockEl.cloneNode(true));
            textProbe.querySelectorAll("img").forEach((im) => im.remove());
            content.append(textProbe);
            imageParagraphs[block.id] = { textHeight: textProbe.offsetHeight, imageCount: imgEls.length };
            textProbe.remove();
          }
        }
      }
    }
    return { heights, childHeights, paragraphUnits, paragraphSpans, imageParagraphs };
  } finally {
    offscreen.detach();
  }
}

/**
 * 按分页计划装配单页（A05 片段重建）：段落 span 区间过滤 / 列表项区间（含续号）/ callout 子块区间（含「续」标题）。
 * @param {import('./card-document.js').CardDocument} cardDoc
 * @param {import('./card-pagination.js').PlanPage} planPage
 * @param {import('./card-pagination.js').LayoutItem[]} items 与计划同源的布局项（提供 spanRanges 与可拆性）
 * @param {object} args
 * @param {import('./card-themes.js').CardTheme} args.theme
 * @param {{width?: number, height?: number}} [args.size]
 * @param {(ref: string) => string | null} [args.resolveImageSrc]
 * @param {import('./card-resources.js').CardResourceSnapshot} [args.resources] 资源快照句柄；未显式传 resolveImageSrc 时由快照构造
 * @param {Document} [args.document]
 * @param {number} [args.pageCount]
 * @param {number} [args.contentHeight] 可用内容高度（scaled 图片 max-height 用）
 * @returns {HTMLElement} `.icard-page` 根元素
 */
export function assembleCardPageFromPlan(cardDoc, planPage, items, args) {
  const ownerDoc = args.document || window.document;
  const size = args.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 };
  const resolveImageSrc = args.resolveImageSrc ||
    (args.resources ? createSnapshotResolver(args.resources) : undefined);
  const itemsById = new Map(items.map((it) => [it.blockId, it]));
  const blocksById = new Map((cardDoc.blocks || []).map((b) => [b.id, b]));

  const { page, content } = createPageShell(ownerDoc, size, planPage.index);
  for (const entry of planPage.entries) {
    const item = itemsById.get(entry.blockId);
    const block = blocksById.get(entry.blockId);
    if (!item || !block) throw new Error(`分页计划引用了未知块：${entry.blockId}`);
    const splittable = item.units.length > 1;

    if (block.type === "callout" || block.type === "blockquote") {
      const allChildren = (cardDoc.blocks || []).filter((b) => b.parentId === block.id);
      const el = renderCalloutBlock(block, allChildren, {
        resolveImageSrc,
        doc: ownerDoc,
        childRange: splittable ? [entry.unitStart, entry.unitEnd] : undefined,
        continued: entry.continuedFrom === true,
      });
      content.append(el);
      continue;
    }

    /** @type {Record<string, any>} */
    const renderOptions = { resolveImageSrc, doc: ownerDoc };
    if (block.type === "paragraph" && splittable && Array.isArray(item.meta.spanRanges)) {
      const ranges = item.meta.spanRanges;
      renderOptions.paragraphSpanRange = [ranges[entry.unitStart][0], ranges[entry.unitEnd - 1][1]];
    } else if (block.type === "list" && splittable) {
      renderOptions.listItemRange = [entry.unitStart, entry.unitEnd];
    }
    const el = renderBlockElement(block, renderOptions);
    if (!el) continue;
    if (entry.scaled) {
      const img = el.tagName === "IMG" ? el : el.querySelector("img");
      if (img) img.classList.add("icard-img-fit");
      // 行内图片段落（shrinkToFit）：整段贴齐页高，段内图片按预算均分 max-height
      if (item.shrinkToFit && typeof args.contentHeight === "number") {
        const imgs = el.tagName === "IMG" ? [el] : Array.from(el.querySelectorAll("img"));
        const perImage = Math.floor(
          (args.contentHeight - item.shrinkToFit.textHeight) / Math.max(1, imgs.length || item.shrinkToFit.imageCount)
        );
        for (const im of imgs) {
          /** @type {HTMLElement} */ (im).style.maxHeight = `${perImage}px`;
        }
      }
    }
    content.append(el);
  }
  if (typeof args.contentHeight === "number") {
    page.style.setProperty("--icard-content-height", `${Math.round(args.contentHeight)}px`);
  }
  page.append(buildPageFooter(ownerDoc, planPage.index, args.pageCount || planPage.index));
  return page;
}

/**
 * 分页布局主循环（A05）：测量 → 装箱 → 片段重建 → 溢出核验（超限收缩可用高度重排）。
 * 轮次上限固定为 LAYOUT_ROUND_BUDGET（传入更大值会被钳制，不允许绕过 §5.6 上限）。
 * 返回的页面已附着在离屏容器（可直接 capturePage）；调用方捕获完成后必须调用 detach()。
 * @param {import('./card-document.js').CardDocument} cardDoc
 * @param {object} [options]
 * @param {import('./card-themes.js').CardTheme} [options.theme]
 * @param {string} [options.themeId]
 * @param {{width?: number, height?: number}} [options.size]
 * @param {(ref: string) => string | null} [options.resolveImageSrc]
 * @param {import('./card-resources.js').CardResourceSnapshot} [options.resources]
 * @param {Document} [options.document]
 * @param {number} [options.contentHeight] 覆盖自动测算的可用内容高度（测试/覆盖入口）
 * @param {(cardDoc: any, options: any) => any} [options.measureFn] 测量注入（测试用；默认真实 DOM 测量）
 * @param {number} [options.maxRounds] 布局轮次上限（默认且至多 LAYOUT_ROUND_BUDGET）
 * @returns {Promise<{ok: boolean, pages: HTMLElement[], plan: import('./card-pagination.js').CardPagePlan, diagnostics: Array<import('./card-pagination.js').PlanDiagnostic>, rounds: number, detach: () => void}>}
 */
export async function renderCardPages(cardDoc, options = {}) {
  const ownerDoc = options.document || window.document;
  const theme = options.theme || getCardTheme(options.themeId);
  const size = /** @type {{width: number, height: number}} */ (
    options.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 }
  );
  const resolveImageSrc = options.resolveImageSrc ||
    (options.resources ? createSnapshotResolver(options.resources) : undefined);
  const measureFn = options.measureFn || measureCardDocument;
  const maxRounds = Math.max(1, Math.min(options.maxRounds ?? LAYOUT_ROUND_BUDGET, LAYOUT_ROUND_BUDGET));

  const offscreen = attachOffscreenContainer(ownerDoc);
  const fail = (diagnostics, rounds) => {
    offscreen.detach();
    return {
      ok: false,
      pages: [],
      plan: /** @type {import('./card-pagination.js').CardPagePlan} */ ({ ok: false, pages: [], diagnostics }),
      diagnostics,
      rounds,
      detach: () => {},
    };
  };

  try {
    ensurePageStyle(theme, ownerDoc);
    let contentHeight = typeof options.contentHeight === "number"
      ? options.contentHeight
      : measureContentHeight({ theme, size, document: ownerDoc });
    debugLayoutLogResources(options.resources);

    for (let round = 1; round <= maxRounds; round += 1) {
      const measured = await measureFn(cardDoc, { theme, size, resolveImageSrc, document: ownerDoc });
      const items = createLayoutItems(cardDoc, measured);
      const breakBefore = mapManualBreaks(cardDoc, items);
      const plan = createCardPagePlan(items, {
        contentHeight,
        breakBeforeItemIds: breakBefore,
        itemGap: theme.tokens.contentGap,
      });
      if (!plan.ok) {
        debugLayoutLogFail(round, plan.diagnostics, contentHeight);
        return fail(plan.diagnostics, round);
      }
      const verification = verifyPagePlan(items, plan);
      if (!verification.ok) {
        return fail(verification.problems.map((message) =>
          /** @type {import('./card-pagination.js').PlanDiagnostic} */ ({ blockId: "", reason: "oversized-atomic", message })
        ), round);
      }
      debugLayoutLog(round, {
        contentHeight,
        itemGap: theme.tokens.contentGap,
        measured,
        items,
        pages: plan.pages,
      });

      // 装配 + 附着 + 溢出核验（§A05 ⑥）；失败页移除后收缩高度重排
      const pages = plan.pages.map((p) => assembleCardPageFromPlan(cardDoc, p, items, {
        theme,
        size,
        resolveImageSrc,
        document: ownerDoc,
        pageCount: plan.pages.length,
        contentHeight,
      }));
      for (const p of pages) offscreen.container.append(p);

      let worst = 0;
      for (const p of pages) {
        const contentEl = p.querySelector(".icard-content");
        if (!contentEl) continue;
        const overflow = contentEl.scrollHeight - contentEl.clientHeight;
        if (overflow > worst) worst = overflow;
      }
      debugLayoutLogOverflow(round, worst, contentHeight);
      if (worst <= 0) {
        return { ok: true, pages, plan, diagnostics: [], rounds: round, detach: offscreen.detach };
      }
      for (const p of pages) p.remove();
      contentHeight = Math.max(1, contentHeight - worst - LAYOUT_OVERFLOW_SLACK);
    }
    return fail([{
      blockId: "",
      reason: "oversized-atomic",
      message: `布局在 ${maxRounds} 轮内未能消除溢出，已阻断输出（不裁剪、不静默降级）。`,
    }], maxRounds);
  } catch (error) {
    offscreen.detach();
    throw error;
  }
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs, label) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error(`capture timeout: ${label} (${timeoutMs}ms)`), { code: "CAPTURE_TIMEOUT" });
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/* ===================== A06：捕获槽（§5.6） =====================
 * 语义：逻辑超时立即向调用方返回 CAPTURE_TIMEOUT（结果不得提交），
 * 但底层不可中断调用仍占用捕获槽，直到其真正结束才释放、才允许下一次捕获启动——
 * 不因逻辑超时叠加新的底层捕获。全局单槽 + FIFO 队列（多视图有界协调在 C05 扩展）。 */

const captureSlot = { busy: false, queue: [] };

/** @returns {Promise<void>} */
function acquireCaptureSlot() {
  return new Promise((resolve) => {
    if (!captureSlot.busy) {
      captureSlot.busy = true;
      resolve();
      return;
    }
    captureSlot.queue.push(resolve);
  });
}

function releaseCaptureSlot() {
  const next = captureSlot.queue.shift();
  if (next) next();
  else captureSlot.busy = false;
}

/** 槽位状态（测试/诊断用）：{ busy, queued } */
export function getCaptureSlotState() {
  return { busy: captureSlot.busy, queued: captureSlot.queue.length };
}

/** 清空槽位状态（仅测试隔离用；生产代码不得调用） */
export function resetCaptureSlotForTests() {
  captureSlot.queue.length = 0;
  captureSlot.busy = false;
}

/**
 * 解析 PNG 头部像素尺寸（IHDR）：capturePage 不逐张解码（性能），实验/契约测试用它核对尺寸。
 * @param {ArrayBuffer | Uint8Array} bytes PNG 文件字节
 * @returns {{width: number, height: number}}
 */
export function readPngSize(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (view.length < 24 || signature.some((b, i) => view[i] !== b)) {
    throw new Error("not a PNG buffer");
  }
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/**
 * modern-screenshot 适配：domToBlob(root, {scale})
 * @param {HTMLElement} root
 * @param {number} pixelRatio
 * @returns {Promise<Blob>}
 */
async function captureWithModernScreenshot(root, pixelRatio) {
  const mod = /** @type {{domToBlob: (el: HTMLElement, opts: {scale: number}) => Promise<Blob|null>}} */ (
    await import("modern-screenshot")
  );
  const blob = await mod.domToBlob(root, { scale: pixelRatio });
  if (!blob) throw new Error("modern-screenshot returned empty blob");
  return /** @type {Blob} */ (blob);
}

/**
 * 捕获页面为 PNG Blob。
 * @param {HTMLElement} root `.icard-page`
 * @param {{library: string, pixelRatio?: number, timeoutMs?: number}} options
 * @returns {Promise<Blob>}
 */
export async function capturePage(root, options) {
  const library = options.library;
  const pixelRatio = options.pixelRatio || 2;
  const timeoutMs = options.timeoutMs || DEFAULT_CAPTURE_TIMEOUT_MS;
  if (!CAPTURE_LIBRARY_IDS.includes(/** @type {any} */ (library))) {
    throw new Error(`unknown capture library: ${library}`);
  }
  // 捕获前临时移除离屏 hidden 类（部分引擎对 visibility:hidden 的祖先会渲染为空白），捕获后恢复
  const offscreenParent = root.parentElement;
  const isOffscreenParent = Boolean(
    offscreenParent && offscreenParent.hasAttribute("data-icard-offscreen")
  );
  await acquireCaptureSlot();
  if (isOffscreenParent) {
    offscreenParent.classList.remove("icard-offscreen");
  }
  /** @type {Promise<Blob>} */
  let task;
  try {
    task = captureWithModernScreenshot(root, pixelRatio);
  } catch (error) {
    if (isOffscreenParent) offscreenParent.classList.add("icard-offscreen");
    releaseCaptureSlot();
    throw error;
  }
  // 槽位跟随底层任务生命周期：逻辑超时提前返回，但槽位等底层真正结束才释放（§5.6）
  let slotReleased = false;
  const releaseOnce = () => {
    if (slotReleased) return;
    slotReleased = true;
    releaseCaptureSlot();
  };
  task.then(releaseOnce, releaseOnce);
  try {
    const blob = await withTimeout(task, timeoutMs, library);
    if (!blob || blob.type !== "image/png") {
      throw new Error(`capture returned non-PNG blob (type: ${blob ? blob.type : "null"})`);
    }
    return blob;
  } finally {
    // 注意：此处只恢复离屏类，不释放捕获槽——槽位由底层 task 的 settle 回调释放（§5.6，超时不得提前放开）
    if (isOffscreenParent) {
      offscreenParent.classList.add("icard-offscreen");
    }
  }
}
