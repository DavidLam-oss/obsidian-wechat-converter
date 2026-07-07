/*
## 核心功能

处理 Obsidian triplet serializer 中的图片、图片 embed、图片轮播/敏感图和 caption 兼容输出。

## 输入

接收 serializer DOM 容器、图片节点、Obsidian callout 结构、converter 图片解析能力和主题样式。

## 输出

输出图片相关转换函数，以及 `deriveImageCaption`、`safeDecodeCaption` 供主 serializer 对外复用。

## 定位

位于 services/，是 obsidian-triplet-serializer.js 的图片子模块；不处理通用 DOM 清洗、表格、数学或最终 HTML 包装。

## 依赖

关键依赖：`./dom-utils.js`、`./obsidian-triplet-serializer-utils.js`。

## 维护规则

- 修改图片序列化、caption、轮播或 embed 行为后，同步更新本文件说明书和相关测试。
- 保持图片处理只通过 converter 的 validateLink、resolveImagePath、getInlineStyle 等既有接口协作。
*/

import { getActiveDocument } from './dom-utils.js';
import { appendInlineStyle, getTagStyle } from './obsidian-triplet-serializer-utils.js';

/**
 * @typedef {{
 *   getInlineStyle?: (tagName: string) => string,
 *   validateLink?: (href: string, isImage?: boolean) => string,
 *   resolveImagePath?: (src: string) => string,
 *   showImageCaption?: boolean,
 *   avatarUrl?: string,
 * }} ConverterLike
 */

/**
 * @param {Element} callout
 * @returns {{ type: string, titleText: string, contentEl: Element | null }}
 */
function getObsidianCalloutParts(callout) {
  const typeRaw =
    callout.getAttribute('data-callout') ||
    callout.getAttribute('data-callout-type') ||
    '';
  const type = String(typeRaw || '').trim().toLowerCase();
  const titleEl =
    callout.querySelector(':scope > .callout-title .callout-title-inner') ||
    callout.querySelector(':scope > .callout-title-inner') ||
    callout.querySelector(':scope > .callout-title');
  const titleText = String(titleEl?.textContent || '').trim();
  const contentEl =
    callout.querySelector(':scope > .callout-content') ||
    callout.querySelector(':scope > .callout-body');

  return { type, titleText, contentEl };
}

/**
 * @param {Element | null | undefined} container
 */
function convertObsidianImageSwipeCallouts(container) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const callouts = Array.from(
    container.querySelectorAll('div.callout,aside.callout,blockquote.callout,section.callout')
  );

  for (const callout of callouts) {
    if (!callout || !callout.parentNode) continue;
    const { type, titleText, contentEl } = getObsidianCalloutParts(callout);
    if (type !== 'image-swipe' && type !== 'image-sensitive') continue;

    const sourceEl = contentEl || callout;
    const imgs = Array.from(sourceEl.querySelectorAll('img'));
    if (!imgs.length) continue;

    const block = activeDocument.createElement('section');
    block.setAttribute('data-owc-image-swipe', '1');
    block.setAttribute('data-owc-image-swipe-type', type);
    if (type === 'image-sensitive') {
      block.setAttribute('data-owc-image-swipe-warning', encodeURIComponent(titleText || IMAGE_SWIPE_DEFAULT_WARNING));
    } else {
      block.setAttribute('data-owc-image-swipe-hint', encodeURIComponent(titleText || IMAGE_SWIPE_DEFAULT_HINT));
    }

    imgs.forEach((img) => block.appendChild(img));
    callout.replaceWith(block);
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function safeDecodeCaption(text) {
  if (!text || typeof text !== 'string') return text || '';
  if (!text.includes('%')) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    // Keep original caption when percent-encoding is malformed (e.g. "100%")
    return text;
  }
}

/**
 * @param {ConverterLike | null | undefined} converter
 * @param {string} [_src]
 * @param {string} [alt]
 * @returns {string}
 */
function deriveImageCaption(converter, _src = '', alt = '') {
  let caption = alt || '';
  if (caption) {
    caption = safeDecodeCaption(caption);
    caption = caption.replace(/[?#].*$/, '');
    const stripped = caption.replace(/\|\s*\d+(x\d+)?\s*$/, '');
    caption = stripped || caption;
    caption = caption.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
  }
  return caption;
}

/**
 * @param {string} text
 * @returns {string}
 */
function extractWidthHintFromText(text) {
  const value = String(text || '');
  if (!value) return '';

  const wikiMatch = value.match(/\|(\d{2,4})(?:x\d+)?(?:\]\]|$)/i);
  if (wikiMatch && wikiMatch[1]) return wikiMatch[1];

  const styleMatch = value.match(/\b(?:max-)?width\s*[:=]\s*(\d{2,4})\s*px\b/i);
  if (styleMatch && styleMatch[1]) return styleMatch[1];

  const bareMatch = value.match(/^\s*(\d{2,4})\s*$/);
  if (bareMatch && bareMatch[1]) return bareMatch[1];

  return '';
}

/**
 * @param {Element | null | undefined} el
 * @returns {string}
 */
function findImageWidthHintFromAncestors(el) {
  let cursor = el;
  let depth = 0;
  while (cursor && depth < 6) {
    if (cursor.nodeType === Node.ELEMENT_NODE) {
      const attrs = ['width', 'data-width', 'data-size', 'data-image-width', 'style', 'src', 'data-src', 'data-href', 'title', 'aria-label', 'alt'];
      for (const key of attrs) {
        const value = cursor.getAttribute(key);
        const width = extractWidthHintFromText(value);
        if (width) return width;
      }
      const textWidth = extractWidthHintFromText(cursor.textContent || '');
      if (textWidth) return textWidth;
    }
    cursor = cursor.parentElement;
    depth += 1;
  }
  return '';
}

/**
 * @param {Element | null | undefined} el
 * @param {string} [rawAlt]
 * @returns {string}
 */
function findLegacyAltHintFromAncestors(el, rawAlt = '') {
  const baseAlt = String(rawAlt || '').trim();
  if (!baseAlt) return '';

  let cursor = el;
  let depth = 0;
  while (cursor && depth < 6) {
    if (cursor.nodeType === Node.ELEMENT_NODE) {
      const attrs = ['alt', 'title', 'aria-label', 'data-alt', 'data-caption'];
      for (const key of attrs) {
        const value = String(cursor.getAttribute(key) || '').trim();
        if (!value) continue;
        if (value === baseAlt) continue;
        if (value.startsWith(`${baseAlt}|`) && /\|\d{2,4}(x\d+)?\s*$/i.test(value)) {
          return value;
        }
      }
    }
    cursor = cursor.parentElement;
    depth += 1;
  }
  return '';
}

/**
 * @param {HTMLImageElement | Element | null | undefined} imgEl
 * @param {string} [rawAlt]
 * @returns {string}
 */
function buildLegacyParityImageAlt(imgEl, rawAlt = '') {
  const alt = String(rawAlt || '');
  if (!alt) return alt;
  if (/\|\s*\d+(x\d+)?\s*$/.test(alt)) return alt;

  const ancestorAltHint = findLegacyAltHintFromAncestors(imgEl, alt);
  if (ancestorAltHint) {
    return ancestorAltHint;
  }

  const widthAttr = String(imgEl?.getAttribute?.('width') || '').trim();
  if (/^\d+$/.test(widthAttr)) {
    return `${alt}|${widthAttr}`;
  }

  const style = String(imgEl?.getAttribute?.('style') || '');
  const styleMatch = style.match(/(?:^|;)\s*width\s*:\s*(\d+)px\b/i);
  if (styleMatch && styleMatch[1]) {
    return `${alt}|${styleMatch[1]}`;
  }

  if (/^\s*\d{2,4}\s*$/.test(alt)) {
    return alt;
  }

  const ancestorWidth = findImageWidthHintFromAncestors(imgEl);
  if (ancestorWidth) {
    return `${alt}|${ancestorWidth}`;
  }

  return alt;
}

/**
 * @param {Element | null | undefined} embedEl
 * @returns {string}
 */
function extractImageEmbedSrc(embedEl) {
  if (!embedEl) return '';
  const attrKeys = ['src', 'data-src', 'data-href', 'href'];
  for (const key of attrKeys) {
    const val = embedEl.getAttribute(key);
    if (val && String(val).trim()) return String(val).trim();
  }

  const text = String(embedEl.textContent || '').trim();
  const wikiMatch = text.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  if (wikiMatch && wikiMatch[1]) return String(wikiMatch[1]).trim();
  return '';
}

/**
 * @param {string} src
 * @returns {boolean}
 */
function looksLikeImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  if (/^(data:image\/|app:\/\/|capacitor:\/\/|https?:\/\/)/i.test(value)) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(value);
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function materializeImageEmbedPlaceholders(container, converter) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;
  const embeds = Array.from(container.querySelectorAll('span.internal-embed,span.image-embed,div.internal-embed,div.image-embed'));
  for (const embed of embeds) {
    const hasImg = !!embed.querySelector('img');
    if (hasImg) continue;

    const src = extractImageEmbedSrc(embed);
    const forceAsImage = embed.classList.contains('image-embed');
    if (!src || (!forceAsImage && !looksLikeImageSrc(src))) continue;

    let resolvedSrc = normalizeObsidianImageSrcForLegacyParity(src);
    if (converter && typeof converter.resolveImagePath === 'function') {
      resolvedSrc = converter.resolveImagePath(resolvedSrc);
    }

    const img = activeDocument.createElement('img');
    img.setAttribute('src', resolvedSrc);
    const alt = embed.getAttribute('alt') || '';
    if (alt) img.setAttribute('alt', alt);
    const widthHint = findImageWidthHintFromAncestors(embed);
    if (widthHint) {
      img.setAttribute('width', widthHint);
    }
    embed.replaceWith(img);
  }
}

/**
 * @param {Element | null | undefined} container
 */
function promoteImageEmbedAltHints(container) {
  if (!container) return;
  const embeds = Array.from(container.querySelectorAll('span.image-embed,div.image-embed,span.internal-embed,div.internal-embed'));
  for (const embed of embeds) {
    const img = embed.querySelector('img');
    if (!img) continue;

    const embedAlt = String(embed.getAttribute('alt') || '').trim();
    const imgAlt = String(img.getAttribute('alt') || '').trim();
    const hasSizedAlt = /\|\s*\d+(x\d+)?\s*$/i.test(embedAlt);
    if (hasSizedAlt) {
      if (!imgAlt || embedAlt.startsWith(`${imgAlt}|`)) {
        img.setAttribute('alt', embedAlt);
      }
    }

    const widthHint = findImageWidthHintFromAncestors(embed);
    if (widthHint && !img.getAttribute('width')) {
      img.setAttribute('width', widthHint);
    }
  }
}

/**
 * @param {string} src
 * @returns {string}
 */
function normalizeObsidianImageSrcForLegacyParity(src) {
  const value = String(src || '').trim();
  if (!value) return value;

  // MarkdownRenderer can emit unresolved images like app://obsidian.md/x.
  // Legacy markdown-it path receives plain link path ("x"), so normalize first.
  if (/^app:\/\/obsidian\.md\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const pathname = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
      return pathname || value;
    } catch {
      return value.replace(/^app:\/\/obsidian\.md\/+/i, '');
    }
  }

  return value;
}

const IMAGE_SWIPE_DEFAULT_WARNING = '此类图片可能引发不适，向左滑动查看';
const IMAGE_SWIPE_DEFAULT_HINT = '左右滑动查看图片';

function decodeImageSwipeValue(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

/**
 * @param {Element | null | undefined} el
 * @param {string} styleText
 */
function setImageSwipeSectionStyle(el, styleText) {
  if (!el || !styleText) return;
  el.setAttribute('style', styleText);
}

/**
 * @param {HTMLImageElement} img
 * @param {ConverterLike | null | undefined} converter
 * @returns {{ src: string, alt: string, caption: string }}
 */
function normalizeImageSwipeImage(img, converter) {
  let src = img.getAttribute('src') || '';
  src = normalizeObsidianImageSrcForLegacyParity(src);
  const safeSrc = converter && typeof converter.validateLink === 'function'
    ? converter.validateLink(src, true)
    : src;
  src = safeSrc;
  if (looksLikeImageSrc(src) && converter && typeof converter.resolveImagePath === 'function') {
    src = converter.resolveImagePath(src);
  }

  const rawAlt = img.getAttribute('alt') || '';
  const alt = buildLegacyParityImageAlt(img, rawAlt);
  const widthHint = extractWidthHintFromText(alt);
  if (widthHint && !img.getAttribute('width')) {
    img.setAttribute('width', widthHint);
  }
  if (/^(?:https?:)?\/\//i.test(src)) {
    img.setAttribute('referrerpolicy', 'no-referrer');
  }
  img.setAttribute('src', src);
  img.setAttribute('alt', alt);
  return {
    src,
    alt,
    caption: deriveImageCaption(converter, src, alt),
  };
}

/**
 * @param {{ img: HTMLImageElement, caption: string, converter: ConverterLike | null | undefined, activeDocument?: Document | null }} options
 * @returns {HTMLElement | null}
 */
function createImageSwipePanel({ img, caption, converter, activeDocument = getActiveDocument() }) {
  if (!activeDocument) return null;
  const panel = activeDocument.createElement('section');
  setImageSwipeSectionStyle(panel, 'display:table-cell;vertical-align:top;width:1%;box-sizing:border-box;white-space:normal;padding:0 8px;margin:0;text-align:center;');

  img.setAttribute('data-owc-skip-standalone-image', '1');
  appendInlineStyle(img, getTagStyle(converter, 'img'));
  panel.appendChild(img);

  const showCaption = !converter || converter.showImageCaption !== false;
  if (showCaption && caption) {
    const captionEl = activeDocument.createElement('figcaption');
    appendInlineStyle(captionEl, getTagStyle(converter, 'figcaption'));
    captionEl.textContent = caption;
    panel.appendChild(captionEl);
  }

  return panel;
}

/**
 * @param {string} warning
 * @param {Document | null} [activeDocument]
 * @returns {HTMLElement | null}
 */
function createImageSwipeWarningPanel(warning, activeDocument = getActiveDocument()) {
  if (!activeDocument) return null;
  const panel = activeDocument.createElement('section');
  setImageSwipeSectionStyle(panel, 'display:table-cell;vertical-align:middle;width:1%;box-sizing:border-box;white-space:normal;padding:8px 10px;margin:0;border:1px solid #e6e8ef;border-radius:12px;background:#f8f9fc;color:#4a4f5a;text-align:center;');

  const content = activeDocument.createElement('section');
  setImageSwipeSectionStyle(content, 'display:block;box-sizing:border-box;padding:0;margin:0 auto;');
  const label = activeDocument.createElement('section');
  setImageSwipeSectionStyle(label, 'display:inline-block;margin:0 auto 8px;padding:2px 8px;border-radius:999px;background:#ffffff;color:#8a6d3b;border:1px solid #efe2c7;font-size:12px;line-height:1.4;');
  label.textContent = '敏感图片';
  const text = activeDocument.createElement('section');
  setImageSwipeSectionStyle(text, 'display:block;margin:0;color:#4a4f5a;font-size:14px;line-height:1.55;font-weight:500;');
  text.textContent = warning || IMAGE_SWIPE_DEFAULT_WARNING;
  const hint = activeDocument.createElement('section');
  setImageSwipeSectionStyle(hint, 'display:block;margin-top:6px;padding:0;color:#6b7280;font-size:12px;line-height:1.4;');
  hint.textContent = '向左滑动查看';

  content.appendChild(label);
  content.appendChild(text);
  content.appendChild(hint);
  panel.appendChild(content);
  return panel;
}

/**
 * @param {string} hint
 * @param {ConverterLike | null | undefined} converter
 * @param {Document | null} [activeDocument]
 * @returns {HTMLElement | null}
 */
function createImageSwipeHint(hint, converter, activeDocument = getActiveDocument()) {
  if (!activeDocument) return null;
  const hintEl = activeDocument.createElement('section');
  const fallbackStyle = 'display:block;margin:8px 0 0;color:#8a8f98;font-size:13px;line-height:1.6;text-align:center;';
  setImageSwipeSectionStyle(hintEl, getTagStyle(converter, 'figcaption') || fallbackStyle);
  appendInlineStyle(hintEl, 'margin-top:8px;');
  hintEl.textContent = hint || IMAGE_SWIPE_DEFAULT_HINT;
  return hintEl;
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function convertImageSwipeBlocks(container, converter) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const blocks = Array.from(container.querySelectorAll('section[data-owc-image-swipe="1"]'));
  for (const block of blocks) {
    const imgs = Array.from(block.querySelectorAll('img'));
    if (!imgs.length) {
      block.removeAttribute('data-owc-image-swipe');
      block.removeAttribute('data-owc-image-swipe-type');
      block.removeAttribute('data-owc-image-swipe-warning');
      block.removeAttribute('data-owc-image-swipe-hint');
      continue;
    }

    const type = block.getAttribute('data-owc-image-swipe-type') || 'image-swipe';
    const wrapper = activeDocument.createElement('section');
    setImageSwipeSectionStyle(wrapper, 'display:block;margin:18px 0;text-align:left;');
    const scroll = activeDocument.createElement('section');
    setImageSwipeSectionStyle(scroll, 'display:block;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;box-sizing:border-box;margin:0;padding:0;white-space:nowrap;');
    const row = activeDocument.createElement('section');
    const panelCount = imgs.length + (type === 'image-sensitive' ? 1 : 0);
    setImageSwipeSectionStyle(row, `display:table;table-layout:fixed;width:${panelCount * 100}%;min-width:${panelCount * 100}%;border-spacing:0;font-size:0;line-height:0;margin:0;padding:0;`);

    if (type === 'image-sensitive') {
      const warning = decodeImageSwipeValue(block.getAttribute('data-owc-image-swipe-warning') || '') || IMAGE_SWIPE_DEFAULT_WARNING;
      const warningPanel = createImageSwipeWarningPanel(warning, activeDocument);
      if (warningPanel) row.appendChild(warningPanel);
    }

    for (const img of imgs) {
      const { caption } = normalizeImageSwipeImage(img, converter);
      const panel = createImageSwipePanel({ img, caption, converter, activeDocument });
      if (panel) row.appendChild(panel);
    }

    scroll.appendChild(row);
    wrapper.appendChild(scroll);
    if (type === 'image-swipe') {
      const hint = decodeImageSwipeValue(block.getAttribute('data-owc-image-swipe-hint') || '') || IMAGE_SWIPE_DEFAULT_HINT;
    const hintEl = createImageSwipeHint(hint, converter, activeDocument);
    if (hintEl) wrapper.appendChild(hintEl);
    }
    block.replaceWith(wrapper);
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function convertStandaloneImages(container, converter) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const imgs = Array.from(container.querySelectorAll('img'));
  for (const img of imgs) {
    if (img.closest('figure')) continue;
    if (img.getAttribute('data-owc-skip-standalone-image') === '1') continue;
    if (img.getAttribute('alt') === 'logo') continue;
    if (img.classList.contains('math-formula-image')) continue;
      if (img.classList.contains('mermaid-diagram-image')) {
        const src = img.getAttribute('src') || '';
        const safeSrc =
          converter && typeof converter.validateLink === 'function'
            ? converter.validateLink(src, true)
            : src;
        img.setAttribute('src', safeSrc);
        if (!img.getAttribute('style')) {
        const mermaidImageStyle = 'display:block;max-width:100%;height:auto;margin:16px auto;';
        img.setAttribute('style', mermaidImageStyle);
      }
      continue;
    }

    let src = img.getAttribute('src') || '';
    src = normalizeObsidianImageSrcForLegacyParity(src);
    const safeSrc =
      converter && typeof converter.validateLink === 'function'
        ? converter.validateLink(src, true)
        : src;
    src = safeSrc;

    if (!looksLikeImageSrc(src)) {
      img.setAttribute('src', safeSrc);
      // Preserve raw-html image shape for strict parity; skip theme image styling.
      img.setAttribute('data-owc-skip-style', '1');
      continue;
    }

    if (converter && typeof converter.resolveImagePath === 'function') {
      src = converter.resolveImagePath(src);
    }

    const rawAlt = img.getAttribute('alt') || '';
    const alt = buildLegacyParityImageAlt(img, rawAlt);
    const caption = deriveImageCaption(converter, src, alt);
    const figure = activeDocument.createElement('figure');

    if (converter && converter.avatarUrl) {
      let figureStyle = getTagStyle(converter, 'figure');
      figureStyle = figureStyle.replace('text-align: center;', 'text-align: left;');
      appendInlineStyle(figure, figureStyle);

      const header = activeDocument.createElement('div');
      appendInlineStyle(header, getTagStyle(converter, 'avatar-header'));

      const avatar = activeDocument.createElement('img');
      avatar.setAttribute('src', converter.avatarUrl);
      avatar.setAttribute('alt', 'logo');
      appendInlineStyle(avatar, getTagStyle(converter, 'avatar'));

      const captionEl = activeDocument.createElement('span');
      appendInlineStyle(captionEl, getTagStyle(converter, 'avatar-caption'));
      captionEl.textContent = caption;

      header.appendChild(avatar);
      header.appendChild(captionEl);

      const spacer = activeDocument.createElement('section');
      const spacerStyle = 'display:block;height:8px;line-height:8px;font-size:0;';
      spacer.setAttribute('style', spacerStyle);
      spacer.appendChild(activeDocument.createTextNode('\u00a0'));

      const bodyImg = activeDocument.createElement('img');
      bodyImg.setAttribute('src', src);
      bodyImg.setAttribute('alt', alt);
      appendInlineStyle(bodyImg, getTagStyle(converter, 'img'));

      figure.appendChild(header);
      figure.appendChild(spacer);
      figure.appendChild(bodyImg);
      img.replaceWith(figure);
      continue;
    }

    const standaloneFigureStyle = 'display:block;margin:16px 0;text-align:center;';
    figure.setAttribute('style', standaloneFigureStyle);
    const bodyImg = activeDocument.createElement('img');
    bodyImg.setAttribute('src', src);
    bodyImg.setAttribute('alt', alt);
    appendInlineStyle(bodyImg, getTagStyle(converter, 'img'));
    figure.appendChild(bodyImg);

    const showCaption = (!converter || converter.showImageCaption !== false) && caption;
    if (showCaption) {
      const figcaption = activeDocument.createElement('figcaption');
      appendInlineStyle(figcaption, getTagStyle(converter, 'figcaption'));
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }

    img.replaceWith(figure);
  }
}

export {
  convertObsidianImageSwipeCallouts,
  materializeImageEmbedPlaceholders,
  promoteImageEmbedAltHints,
  convertImageSwipeBlocks,
  convertStandaloneImages,
  deriveImageCaption,
  safeDecodeCaption,
};
