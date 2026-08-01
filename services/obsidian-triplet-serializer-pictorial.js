/*
## 核心功能

在 Obsidian Triplet Serializer 已生成普通 figure 后，为“图文志”消费显式 `hero:` 标记并应用图片叙事的内联样式。

## 输入

接收 serializer DOM 容器、converter 运行时和已经转换为 figure 的普通图片结构。

## 输出

输出就地更新后的 DOM：hero、regular 与有内容的 caption 使用各自的图文志样式；特殊媒体保持原样。

## 定位

位于 services/，是 obsidian-triplet-serializer.js 的图文志图片语义子模块；不负责 Markdown 解析、图片路径解析或通用主题样式。

## 依赖

依赖 `./dom-utils.js`、`./obsidian-triplet-serializer-images.js` 和 converter 的 `getInlineStyle` / theme 合同。

## 维护规则

- 只在 `converter.theme.themeName === 'pictorial'` 时执行，其他主题输出必须保持兼容。
- 不根据图片尺寸、文件名、位置或主观算法推断角色；只有 alt 的 `hero:` 前缀可增强为 hero。
- 只改写一个直接图片和可选图注组成的普通 figure；Mermaid、数学、轮播/敏感图、头像水印和复杂媒体容器必须跳过。
- 最终输出不得保留为样式服务的 class 或 data 属性；使用标签级内联样式。
*/

import { getActiveDocument } from './dom-utils.js';
import { deriveImageCaption } from './obsidian-triplet-serializer-images.js';
import { getTagStyle } from './obsidian-triplet-serializer-utils.js';

const HERO_MARKER = /^\s*hero\s*:\s*/i;

/**
 * @typedef {{
 *   getInlineStyle?: (tagName: string) => string,
 *   showImageCaption?: boolean,
 *   theme?: { themeName?: string },
 * }} PictorialConverterLike
 */

/**
 * @param {PictorialConverterLike | null | undefined} converter
 * @returns {boolean}
 */
function isPictorialTheme(converter) {
  return converter?.theme?.themeName === 'pictorial';
}

/**
 * @param {string} value
 * @returns {{ isHero: boolean, value: string }}
 */
function consumeHeroMarker(value) {
  const text = String(value || '');
  if (!HERO_MARKER.test(text)) return { isHero: false, value: text };
  return {
    isHero: true,
    value: text.replace(HERO_MARKER, '').trim(),
  };
}

/**
 * @param {Element | null | undefined} figure
 * @returns {HTMLImageElement | Element | null}
 */
function getDirectFigureImage(figure) {
  if (!figure) return null;
  const images = Array.from(figure.children || []).filter((child) => child.tagName === 'IMG');
  return images.length === 1 ? images[0] : null;
}

/**
 * @param {Element | null | undefined} figure
 * @returns {HTMLElement | Element | null}
 */
function getDirectFigureCaption(figure) {
  if (!figure) return null;
  const captions = Array.from(figure.children || []).filter((child) => child.tagName === 'FIGCAPTION');
  return captions.length === 1 ? captions[0] : null;
}

/**
 * @param {Element | null | undefined} figure
 * @returns {boolean}
 */
function hasOnlySimpleFigureChildren(figure) {
  if (!figure) return false;
  const elements = Array.from(figure.children || []);
  if (elements.length < 1 || elements.length > 2) return false;
  if (elements.some((child) => child.tagName !== 'IMG' && child.tagName !== 'FIGCAPTION')) return false;
  if (!getDirectFigureImage(figure)) return false;

  const caption = getDirectFigureCaption(figure);
  if (caption?.querySelector?.('*')) return false;

  return Array.from(figure.childNodes || []).every((node) =>
    node.nodeType === 1 || !String(node.textContent || '').trim()
  );
}

/**
 * @param {Element | null | undefined} img
 * @returns {boolean}
 */
function isSpecialPictorialImage(img) {
  if (!img) return true;
  if (img.getAttribute('data-owc-skip-standalone-image') === '1') return true;
  if (img.getAttribute('data-owc-skip-style') === '1') return true;
  if (img.getAttribute('alt') === 'logo') return true;
  if (img.classList?.contains('mermaid-diagram-image')) return true;
  if (img.classList?.contains('math-formula-image')) return true;
  if (img.closest?.('[data-owc-image-swipe]')) return true;
  return false;
}

/**
 * @param {Element} figure
 * @param {HTMLImageElement | Element} img
 * @returns {boolean}
 */
function isOrdinaryPictorialFigure(figure, img) {
  if (!hasOnlySimpleFigureChildren(figure)) return false;
  if (figure.getAttribute('class')) return false;
  if (Array.from(figure.attributes || []).some((attribute) => attribute.name.startsWith('data-owc-'))) return false;
  return !isSpecialPictorialImage(img);
}

/**
 * @param {Element} caption
 * @param {string} text
 * @param {PictorialConverterLike | null | undefined} converter
 */
function setCaptionContent(caption, text, converter) {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    caption.remove();
    return;
  }
  caption.textContent = cleanText;
  caption.setAttribute('style', getTagStyle(converter, 'pictorial-caption'));
}

/**
 * @param {Element} figure
 * @param {HTMLImageElement | Element} img
 * @param {PictorialConverterLike | null | undefined} converter
 * @param {boolean} isHero
 * @param {string} cleanedAlt
 */
function normalizePictorialCaption(figure, img, converter, isHero, cleanedAlt) {
  const existingCaption = getDirectFigureCaption(figure);
  const existingText = String(existingCaption?.textContent || '').trim();
  const captionFromFigure = isHero
    ? consumeHeroMarker(existingText).value
    : existingText;
  const captionFromAlt = deriveImageCaption(converter, img.getAttribute('src') || '', cleanedAlt).trim();
  const captionText = (captionFromFigure || captionFromAlt).replace(/^\|\s*\d+(?:x\d+)?\s*$/i, '').trim();

  if (!captionText || converter?.showImageCaption === false) {
    existingCaption?.remove();
    return;
  }

  const activeDocument = getActiveDocument();
  const caption = existingCaption || activeDocument?.createElement('figcaption');
  if (!caption) return;
  setCaptionContent(caption, captionText, converter);
  if (!existingCaption) figure.appendChild(caption);
}

/**
 * @param {Element | null | undefined} container
 * @param {PictorialConverterLike | null | undefined} converter
 */
function applyPictorialFigureStyles(container, converter) {
  if (!container || !isPictorialTheme(converter)) return;

  Array.from(container.querySelectorAll('figure')).forEach((figure) => {
    const img = getDirectFigureImage(figure);
    if (!img || !isOrdinaryPictorialFigure(figure, img)) return;

    const originalAlt = img.getAttribute('alt') || '';
    const hero = consumeHeroMarker(originalAlt);
    const role = hero.isHero ? 'hero' : 'regular';

    if (hero.isHero) img.setAttribute('alt', hero.value);

    figure.setAttribute('style', getTagStyle(converter, `pictorial-${role}-figure`));
    img.setAttribute('style', getTagStyle(converter, `pictorial-${role}-img`));
    normalizePictorialCaption(figure, img, converter, hero.isHero, hero.value);
  });
}

export {
  consumeHeroMarker,
  applyPictorialFigureStyles,
};
