/*
## 核心功能

卡片页面装配层（自 card-render-engine.js 拆出）：页面壳/页脚构建、整页装配（assembleCardPage）、
按分页计划的片段重建装配（assembleCardPageFromPlan）、主题样式注入（ensurePageStyle）、
排版覆盖合并（withCardTypography）、离屏附着容器、比例尺寸预设。

## 输入

- `assembleCardPage({theme, doc, pageNumber, pageCount, resolveImageSrc?, resources?, document, size?})` → 单页根元素。
- `assembleCardPageFromPlan(cardDoc, planPage, items, args)` → 按 PlanPage 过滤重建的单页（span 区间 / 列表项区间 / callout 子块区间）。
- `ensurePageStyle(theme, ownerDoc, typography?)` → 页面级 <style>（幂等注入、typography 变化覆写）。
- `attachOffscreenContainer(ownerDoc?)` → { container, detach }。
- `withCardTypography(theme, typography?)` → pagePadding 替换 token 后的主题副本。

## 输出

`.icard-page` 根元素 / `<style>` 节点 / 离屏容器句柄；`RATIO_PRESETS` 比例尺寸常量。

## 定位

位于 services/，卡片装配的纯 DOM 构建层；测量（card-render-measure.js）与布局循环
（card-render-engine.js）都经本模块构建页面，保证「测量与装配同一渲染路径」。

## 依赖

`card-themes.js`（页面尺寸常量 + buildCardPageCss）、`card-render-profile.js`（块渲染）、`card-resources.js`（快照 resolver）。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 装配端与测量端必须共用 renderBlockElement/renderCalloutBlock/wrapParagraphSpans（span 序号可重放）。
*/

import { CARD_PAGE_WIDTH, CARD_PAGE_HEIGHT_3_4, buildCardPageCss } from "./card-themes.js";
import { renderBlockContent, renderBlockElement, renderCalloutBlock } from "./card-render-profile.js";
import { createSnapshotResolver } from "./card-resources.js";

/**
 * 比例 → 逻辑尺寸（规划 §4.3：统一由比例计算，最终像素 = 原始逻辑值 × 倍率后取整）。
 * `height` 为取整后的 CSS 布局高度；`heightExact` 保留未取整原始值（如 9:16 = 666.67），
 * 供 computeCardPixelSize 计算 PNG 像素（§4.3：9:16 2× = 750×1333，先乘后取整）。
 */
export const RATIO_PRESETS = /** @type {const} */ ({
  "3:4": { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4, heightExact: CARD_PAGE_WIDTH * 4 / 3 },
  "3:5": { width: CARD_PAGE_WIDTH, height: Math.round((CARD_PAGE_WIDTH * 5) / 3), heightExact: CARD_PAGE_WIDTH * 5 / 3 },
  "9:16": { width: CARD_PAGE_WIDTH, height: Math.round((CARD_PAGE_WIDTH * 16) / 9), heightExact: CARD_PAGE_WIDTH * 16 / 9 },
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
 * 构建页脚条（red-note 式）：左页码、右水印。
 * 页码关且水印为空 → 不渲染页脚；页码关但有水印 → 仅渲染右对齐水印。
 * 水印超宽由布局核验诊断提示缩短，不在此截断（CSS overflow:hidden 仅保护版式）。
 * @param {Document} ownerDoc
 * @param {number} pageNumber 1-based
 * @param {number} pageCount
 * @param {boolean} [enabled] 页码开关（C01③；封面不编号）
 * @param {string} [watermarkText] 水印文案（空 = 不渲染）
 * @returns {HTMLElement|null}
 */
function buildPageFooter(ownerDoc, pageNumber, pageCount, enabled = true, watermarkText = "") {
  const watermark = String(watermarkText || "").trim();
  if (!enabled && !watermark) return null;
  const footer = ownerDoc.createElement("div");
  footer.className = "icard-footer";
  if (enabled) {
    const pageNum = ownerDoc.createElement("span");
    pageNum.className = "icard-page-num";
    pageNum.textContent = `${pageNumber} / ${pageCount}`;
    footer.append(pageNum);
  }
  if (watermark) {
    const wm = ownerDoc.createElement("span");
    wm.className = "icard-watermark";
    wm.textContent = watermark;
    footer.append(wm);
  }
  return footer;
}

/**
 * 页面装配：主题样式 + 内容 + 页脚条（左页码右水印，均可关）。
 * @param {object} args
 * @param {import('./card-themes.js').CardTheme} args.theme CardTheme
 * @param {import('./card-document.js').CardDocument} args.doc CardDocument
 * @param {number} [args.pageNumber] 1-based（正文页）
 * @param {number} [args.pageCount]
 * @param {boolean} [args.pageNumberEnabled] 正文页码开关（C01③；默认开）
 * @param {string} [args.watermarkText] 水印文案（C01③；空 = 不渲染）
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
  const pageNumberEnabled = args.pageNumberEnabled !== false;

  const { page, content } = createPageShell(ownerDoc, size, args.pageNumber || 1);
  const { fragment } = renderBlockContent(args.doc, {
    resolveImageSrc,
    doc: ownerDoc,
  });
  content.append(fragment);
  const footer = buildPageFooter(ownerDoc, args.pageNumber || 1, args.pageCount || 1, pageNumberEnabled, args.watermarkText);
  if (footer) page.append(footer);

  return page;
}

/**
 * 应用排版覆盖到主题（B03）：pagePadding 替换 token，供 contentHeight 计算与 CSS 生成一致。
 * fontSize/lineHeight 只影响真实 DOM 测量（CSS 生成），不需要进 token。
 * @param {import('./card-themes.js').CardTheme} theme
 * @param {import('./card-themes.js').CardTypography} [typography]
 * @returns {import('./card-themes.js').CardTheme}
 */
export function withCardTypography(theme, typography) {
  if (!typography || !(Number(typography.pagePadding) > 0)) return theme;
  return {
    ...theme,
    tokens: { ...theme.tokens, pagePadding: Number(typography.pagePadding) },
  };
}

/**
 * 构建页面级 <style>（幂等：同一文档只注入一次；typography 变化时覆写内容）。
 * @param {import('./card-themes.js').CardTheme} theme
 * @param {Document} [ownerDoc]
 * @param {import('./card-themes.js').CardTypography} [typography]
 * @returns {HTMLStyleElement}
 */
export function ensurePageStyle(theme, ownerDoc, typography) {
  const doc = ownerDoc || window.document;
  const styleId = "icard-theme-style";
  let style = /** @type {HTMLStyleElement|null} */ (doc.getElementById(styleId));
  if (!style) {
    style = doc.createElement("style");
    style.setAttribute("id", styleId);
    doc.head.append(style);
  }
  style.textContent = buildCardPageCss(theme, typography);
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

/**
 * 按分页计划装配单页（A05 片段重建）：段落 span 区间过滤 / 列表项区间（含续号）/ callout 子块区间（含「续」标题）。
 * @param {import('./card-document.js').CardDocument} cardDoc
 * @param {import('./card-pagination.js').PlanPage} planPage
 * @param {import('./card-pagination.js').LayoutItem[]} items 与计划同源的布局项（提供 spanRanges 与可拆性）
 * @param {object} args
 * @param {import('./card-themes.js').CardTheme} args.theme
 * @param {{width?: number, height?: number}} [args.size]
 * @param {boolean} [args.pageNumberEnabled] 正文页码开关（C01③；默认开）
 * @param {string} [args.watermarkText] 水印文案（C01③；空 = 不渲染）
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
          /** @type {HTMLElement} */ (im).style.setProperty("max-height", `${perImage}px`);
        }
      }
    }
    content.append(el);
  }
  if (typeof args.contentHeight === "number") {
    page.style.setProperty("--icard-content-height", `${Math.round(args.contentHeight)}px`);
  }
  const footer = buildPageFooter(ownerDoc, planPage.index, args.pageCount || planPage.index, args.pageNumberEnabled !== false, args.watermarkText);
  if (footer) page.append(footer);
  return page;
}

/**
 * 封面页装配（C01③）：主题配套文字封面（coverStyle 三式），无页脚、不编号。
 * 空字段段落整体省略（kicker/meta 只在至少一项有值时渲染）。
 * 水印不单独渲染覆盖层——并入底部 meta 行（作者 · 水印）。
 * @param {object} args
 * @param {import('./card-themes.js').CardTheme} args.theme
 * @param {import('./card-cover-model.js').CardCoverFields} args.fields 封面四字段（title 必非空，由调用方保证）
 * @param {{width?: number, height?: number}} [args.size]
 * @param {string} [args.watermarkText] 非空时并入封面底部 meta 行
 * @param {Document} [args.document]
 * @returns {HTMLElement} `.icard-page.icard-cover` 根元素
 */
export function assembleCardCoverPage(args) {
  const ownerDoc = args.document || window.document;
  const size = args.size || { width: CARD_PAGE_WIDTH, height: CARD_PAGE_HEIGHT_3_4 };
  const theme = args.theme;
  const fields = args.fields;
  const page = ownerDoc.createElement("div");
  page.className = `icard icard-page icard-cover icard-cover--${theme.coverStyle}`;
  page.style.setProperty("--icard-page-width", `${size.width}px`);
  page.style.setProperty("--icard-page-height", `${size.height}px`);
  page.setAttribute("data-icard-cover", "true");

  if (fields.coverImage) {
    if (fields.coverMode === "full-bleed") {
      page.classList.add("icard-cover--full-bleed");
      const img = ownerDoc.createElement("img");
      img.className = "icard-cover-full-bleed-img";
      img.src = fields.coverImage;
      img.alt = fields.title || "Cover";
      page.append(img);
      return page;
    }

    page.classList.add("icard-cover--has-image");
    const bg = ownerDoc.createElement("div");
    bg.className = "icard-cover-bg";
    bg.style.setProperty("background-image", `url("${fields.coverImage}")`);
    page.append(bg);

    const overlay = ownerDoc.createElement("div");
    overlay.className = "icard-cover-overlay";
    page.append(overlay);
  }

  const body = ownerDoc.createElement("div");
  body.className = "icard-cover-body";

  // 单一事实只说一次：kicker（顶部）= 日期；meta（置底）= 作者。
  // 两者都来自 cover-model 归一化字段，空值段落整体省略。
  const kicker = ownerDoc.createElement("div");
  kicker.className = "icard-cover-kicker";
  kicker.textContent = fields.date || "";
  if (kicker.textContent) body.append(kicker);

  const title = ownerDoc.createElement("div");
  title.className = "icard-cover-title";
  title.textContent = fields.title;
  body.append(title);

  if (fields.excerpt) {
    const excerpt = ownerDoc.createElement("div");
    excerpt.className = "icard-cover-excerpt";
    excerpt.textContent = fields.excerpt;
    body.append(excerpt);
  }

  // 封面底部一行兼署名与水印（David 2026-09-13：作者与水印不分行，合并展示）；
  // 正文页水印仍是独立覆盖层。任一为空则只显示另一项，都空则整段省略。
  const meta = ownerDoc.createElement("div");
  meta.className = "icard-cover-meta";
  meta.textContent = [fields.author, args.watermarkText].filter(Boolean).join(" · ");
  if (meta.textContent) body.append(meta);

  page.append(body);
  return page;
}
