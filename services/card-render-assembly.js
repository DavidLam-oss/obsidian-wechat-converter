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
 * 封面底部 meta 行：作者与水印合并展示（David 2026-09-13：不分行），**但内容相同时只显示一次**。
 *
 * 两者语义不同——作者是封面署名，水印是页面级标记（正文每页页脚右侧也有一份）——
 * 所以内容不同时都该出现；而把同一个名字连写两遍没有任何信息量，
 * 用户把两处都填成自己的名字又是最常见用法，因此这里按文案去重。
 * @param {unknown} author
 * @param {unknown} watermark
 * @returns {string}
 */
function joinCoverMeta(author, watermark) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const parts = [];
  for (const raw of [author, watermark]) {
    const text = String(raw || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join(" · ");
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
/**
 * 构建封面配图占位元素（100% 对标 WeChat Tool：极简纯净的实底居中图片图标，无冗余文字与虚线）。
 * 遵循无 innerHTML 规范，纯 DOM 构建。
 * @param {Document} doc
 * @returns {HTMLElement}
 */
export function createCoverPlaceholder(doc) {
  const box = doc.createElement('div');
  box.className = 'icard-cover-placeholder';

  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icard-cover-placeholder-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '52');
  svg.setAttribute('height', '52');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '3');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '18');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');
  svg.append(rect);

  const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '9');
  circle.setAttribute('cy', '9');
  circle.setAttribute('r', '2');
  svg.append(circle);

  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21');
  svg.append(path);

  box.append(svg);
  return box;
}

/**
 * 解析并校验封面图片路径。
 * 1. 凡是网络 URL（http/https）、data:、blob:、app: 等标准协议，直接使用；
 * 2. 本地 vault 路径或 wiki 链接，尝试通过 resolveImageSrc 解析；
 * 3. 若解析为空、文件不存在、或原路径无法被识别为合法有效路径，则返回空字符串，
 *    避免在 DOM 中注入必定破损的 <img> 节点。
 * @param {string} raw
 * @param {((ref: string) => string | null) | undefined} resolver
 * @returns {string}
 */
export function resolveCoverImageUrl(raw, resolver) {
  const src = String(raw || '').trim();
  if (!src) return '';
  if (/^(https?:\/\/|data:image\/|blob:|app:\/\/)/i.test(src)) {
    return src;
  }
  if (typeof resolver === 'function') {
    const resolved = resolver(src);
    if (resolved && typeof resolved === 'string' && resolved.trim()) {
      return resolved.trim();
    }
  }
  return '';
}

/**
 * 创建带安全降级保护的封面图片元素。
 * 一旦加载失败（404/网络断开等），静默替换为精致占位图，杜绝浏览器死图图标。
 * @param {Document} doc
 * @param {string} src
 * @param {string} alt
 * @param {string} className
 * @returns {HTMLImageElement}
 */
function createSafeCoverImage(doc, src, alt, className) {
  const img = doc.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = alt;
  img.addEventListener('error', () => {
    try {
      const ph = createCoverPlaceholder(doc);
      img.replaceWith(ph);
    } catch {
      // 容错忽略
    }
  }, { once: true });
  return img;
}

/**
 * 装配文字封面页（C01③）：独立 `.icard-cover` 容器，单列布局，kicker（日期）+ 标题 + 摘要 + 署名。
 * 2026-09-22 升级：
 * - coverMode === 'none' 时 100% 原生纯文字版面，无图且不放占位；
 * - coverMode === 'adaptive' 时支持 6 主题自适应：有图融入相框/拱门/杂志，无图显示精致占位框（布局不坍塌）；
 * - 纯海报（full-bleed）与底图遮罩（mixed）同样支持有图/无图占位；
 * - resolveImageSrc 支持：本地 frontmatter 相对路径自动解析，解析失败或死图安全降级为占位图。
 * @param {object} args
 * @param {import('./card-themes.js').CardTheme} args.theme
 * @param {import('./card-cover-model.js').CardCoverFields} args.fields
 * @param {{width?: number, height?: number}} [args.size]
 * @param {string} [args.watermarkText]
 * @param {(ref: string) => string | null} [args.resolveImageSrc]
 * @param {Document} [args.document]
 * @returns {HTMLElement}
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

  const mode = fields.coverMode || 'adaptive';
  const style = theme.coverStyle || 'magazine';
  const coverImageUrl = resolveCoverImageUrl(fields.coverImage, args.resolveImageSrc);
  const hasImage = Boolean(coverImageUrl);

  // 1. 纯文字排版（mode === 'none'）：100% 原生纯文字版面，无图且不放占位
  if (mode === 'none') {
    // 纯文字直接走下方的 body 装配
  } else if (mode === 'full-bleed') {
    page.classList.add('icard-cover--full-bleed');
    if (hasImage) {
      const img = createSafeCoverImage(ownerDoc, coverImageUrl, fields.title || 'Cover', 'icard-cover-full-bleed-img');
      page.append(img);
    } else {
      const placeholder = createCoverPlaceholder(ownerDoc);
      placeholder.classList.add('icard-cover-placeholder--full');
      page.append(placeholder);
    }
    return page;
  } else if (mode === 'mixed') {
    page.classList.add('icard-cover--has-image');
    const bg = ownerDoc.createElement('div');
    bg.className = 'icard-cover-bg';
    if (hasImage) {
      bg.style.setProperty('background-image', `url("${coverImageUrl}")`);
    } else {
      bg.classList.add('icard-cover-bg--placeholder');
    }
    page.append(bg);

    const overlay = ownerDoc.createElement('div');
    overlay.className = 'icard-cover-overlay';
    page.append(overlay);
  } else {
    // 2. adaptive 自适应排版（默认）：有图融入主题，无图放精致占位框（保持布局不坍塌）
    page.classList.add('icard-cover--adaptive');
    if (style === 'magazine') {
      const hero = ownerDoc.createElement('div');
      hero.className = 'icard-cover-hero';
      if (hasImage) {
        const heroImg = createSafeCoverImage(ownerDoc, coverImageUrl, fields.title || 'Cover Hero', 'icard-cover-hero-img');
        hero.append(heroImg);
      } else {
        hero.append(createCoverPlaceholder(ownerDoc));
      }
      page.append(hero);
    } else if (style === 'neon') {
      page.classList.add('icard-cover--has-image');
      const bg = ownerDoc.createElement('div');
      bg.className = 'icard-cover-bg';
      if (hasImage) {
        bg.style.setProperty('background-image', `url("${coverImageUrl}")`);
      } else {
        bg.classList.add('icard-cover-bg--placeholder');
      }
      page.append(bg);

      const cyberOverlay = ownerDoc.createElement('div');
      cyberOverlay.className = 'icard-cover-cyber-overlay';
      page.append(cyberOverlay);
    }
  }

  const body = ownerDoc.createElement('div');
  body.className = 'icard-cover-body';

  const kicker = ownerDoc.createElement('div');
  kicker.className = 'icard-cover-kicker';
  kicker.textContent = fields.date || '';
  if (kicker.textContent) body.append(kicker);

  // 自适应模式下，centered 与 luxury 在 kicker 下方、title 上方置入相框
  if (mode === 'adaptive') {
    if (style === 'centered') {
      const frame = ownerDoc.createElement('div');
      frame.className = 'icard-cover-frame';
      if (hasImage) {
        const frameImg = createSafeCoverImage(ownerDoc, coverImageUrl, fields.title || 'Cover Frame', 'icard-cover-frame-img');
        frame.append(frameImg);
      } else {
        frame.append(createCoverPlaceholder(ownerDoc));
      }
      body.append(frame);
    } else if (style === 'luxury') {
      const arch = ownerDoc.createElement('div');
      arch.className = 'icard-cover-arch';
      if (hasImage) {
        const archImg = createSafeCoverImage(ownerDoc, coverImageUrl, fields.title || 'Cover Arch', 'icard-cover-arch-img');
        arch.append(archImg);
      } else {
        arch.append(createCoverPlaceholder(ownerDoc));
      }
      body.append(arch);
    }
  }

  const title = ownerDoc.createElement('div');
  title.className = 'icard-cover-title';
  title.textContent = fields.title;
  body.append(title);

  if (fields.excerpt) {
    const excerpt = ownerDoc.createElement('div');
    excerpt.className = 'icard-cover-excerpt';
    excerpt.textContent = fields.excerpt;
    body.append(excerpt);
  }

  const meta = ownerDoc.createElement('div');
  meta.className = 'icard-cover-meta';
  meta.textContent = joinCoverMeta(fields.author, args.watermarkText);
  if (meta.textContent) body.append(meta);

  page.append(body);
  return page;
}
