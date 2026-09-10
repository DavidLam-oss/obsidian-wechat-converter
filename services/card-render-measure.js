/*
## 核心功能

卡片真实 DOM 测量层（A05，自 card-render-engine.js 拆出）：离屏测量宿主逐块渲染并读取实际高度，
消除「测量高度 ≠ 实际渲染高度」类分页误差。含可用内容高度测算（measureContentHeight）与
图片就绪等待（waitForImagesReady，消除测量竞态）。

## 输入

- `measureCardDocument(cardDoc, {theme, size, resolveImageSrc?, resources?, document, typography?})` → 测量结果。
- `measureContentHeight({theme, size, document, contentHeight?})` → 页面可用内容高度（显式传入时直接返回）。

## 输出

- heights：顶层块整体高度（原子块装箱用）。
- childHeights：list 逐项高度 / callout 逐子块高度（>1 项才可拆；callout 含续页开销估算，保守方向）。
- paragraphUnits/paragraphSpans：段落按 CJK 字符/拉丁词 span 包裹后按 offsetTop 分行的行高与 span 区间。
- imageParagraphs：含行内图片段落的「去图纯文本高度 + 图片数」（供装箱层超高时收缩图片）。

## 定位

位于 services/，卡片测量层；与装配（card-render-assembly.js）共用渲染路径
（renderBlockElement/renderCalloutBlock/wrapParagraphSpans），保证 span 序号两次渲染一致。

## 依赖

`card-themes.js`、`card-render-profile.js`、`card-resources.js`、`card-render-assembly.js`（离屏容器/样式注入/探针页装配）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- callout 续页开销常量（CALLOUT_PAD_VERTICAL 等）与 card-themes token 联动，token 变更时同步。
- 新增图片相关测量时必须先 waitForImagesReady 再读高度（B02 实机回归教训）。
*/

import { CARD_PAGE_WIDTH, CARD_PAGE_HEIGHT_3_4, getCardTheme, DEFAULT_CARD_THEME_ID } from "./card-themes.js";
import { renderBlockElement, renderCalloutBlock, wrapParagraphSpans } from "./card-render-profile.js";
import { createSnapshotResolver } from "./card-resources.js";
import { attachOffscreenContainer, ensurePageStyle, assembleCardPage } from "./card-render-assembly.js";

/** callout 引用块垂直内边距（card-themes blockquote padding 10px × 2；token 变更时同步） */
export const CALLOUT_PAD_VERTICAL = 20;

/* 测量端消费无类型的 CardBlock（JSDoc 形状）与 DOM 探针代码，TS 服务器推断为 any；
   所有节点均经安全 DOM API 构建并由 card_layout_integration.test.js 断言，此处关闭 unsafe-* 检查 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- CardBlock 无类型定义 + DOM 探针 */

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
 * @param {import('./card-themes.js').CardTypography} [options.typography] B03 排版覆盖（字号/行高/边距）
 * @returns {Promise<{ heights: Record<string, number>, childHeights: Record<string, number[]>, paragraphUnits: Record<string, Array<{height: number}>>, paragraphSpans: Record<string, Array<[number, number]>>, imageParagraphs: Record<string, { textHeight: number, imageCount: number }> >}
 */
export async function measureCardDocument(cardDoc, options = {}) {
  const ownerDoc = options.document || window.document;
  const theme = options.theme || getCardTheme(options.themeId);
  const size = options.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 };
  const resolveImageSrc = options.resolveImageSrc ||
    (options.resources ? createSnapshotResolver(options.resources) : undefined);

  ensurePageStyle(theme, ownerDoc, options.typography);
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
