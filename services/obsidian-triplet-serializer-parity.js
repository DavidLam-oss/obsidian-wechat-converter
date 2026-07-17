/*
## 核心功能

处理 triplet serializer 的危险标签清理、数学公式呈现以及旧渲染器兼容转换。

## 输入

接收渲染 DOM、转换器的 Markdown 能力、预渲染公式和 SVG 样式片段。

## 输出

输出数学、linkify、typographer、SVG 样式保护及公式注入函数。

## 定位

位于 services/，是 obsidian-triplet-serializer.js 的内容兼容子模块；不负责图片、表格或主题样式。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 只处理确定性的内容兼容转换，不改变源 Markdown。
- 保持代码、链接、SVG 和公式边界的既有保护行为。
*/

import { createHtmlContainer, getActiveDocument, htmlToText, setElementHtml } from './dom-utils.js';

/**
 * @typedef {{
 *   index?: number,
 *   lastIndex?: number,
 *   url?: string,
 *   text?: string,
 * }} LinkifyMatchLike
 *
 * @typedef {{
 *   typographer?: boolean,
 * }} MarkdownOptionsLike
 *
 * @typedef {{
 *   render?: (markdown: string) => string,
 *   renderInline?: (markdown: string) => string,
 *   options?: MarkdownOptionsLike,
 *   linkify?: {
 *     match?: (text: string) => LinkifyMatchLike[] | null,
 *   },
 * }} MarkdownItLike
 *
 * @typedef {{
 *   md?: MarkdownItLike,
 *   validateLink?: (href: string, isImage?: boolean) => string,
 * }} ConverterLike
 *
 * @typedef {{
 *   placeholder?: string,
 *   rendered?: string,
 * }} PreRenderedMathLike
 *
 * @typedef {{
 *   token: string,
 *   styleMarkup: string,
 * }} SvgStylePlaceholder
 */

/**
 * @param {Element | null | undefined} container
 * @param {{ preserveSvgStyleTags?: boolean }} [options]
 */
function stripDangerousTags(container, { preserveSvgStyleTags = false } = {}) {
  if (!container) return;
  container.querySelectorAll('script,iframe,object,embed,form,input,button,style').forEach((el) => {
    if (
      preserveSvgStyleTags
      && el.tagName?.toLowerCase?.() === 'style'
      && el.closest?.('svg')
    ) {
      return;
    }
    el.remove();
  });
}

/**
 * @param {string} html
 * @returns {{ html: string, placeholders: SvgStylePlaceholder[] }}
 */
function protectSvgStyleTags(html) {
  if (typeof html !== 'string' || !html.includes('<style')) {
    return { html, placeholders: [] };
  }

  /** @type {SvgStylePlaceholder[]} */
  const placeholders = [];
  let index = 0;
  const protectedHtml = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgMarkup) => {
    return svgMarkup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (styleMarkup) => {
      const token = `__OWC_SVG_STYLE_${index}__`;
      placeholders.push({ token, styleMarkup });
      index += 1;
      return token;
    });
  });

  return { html: protectedHtml, placeholders };
}

/**
 * @param {string} html
 * @param {SvgStylePlaceholder[]} [placeholders]
 * @returns {string}
 */
function restoreSvgStyleTags(html, placeholders = []) {
  let result = String(html || '');
  placeholders.forEach(({ token, styleMarkup }) => {
    result = result.split(token).join(styleMarkup);
  });
  return result;
}

/**
 * @param {Element | null | undefined} svg
 * @returns {boolean}
 */
function looksLikeMathSvg(svg) {
  if (!svg || svg.tagName?.toLowerCase?.() !== 'svg') return false;
  if (svg.getAttribute('role') === 'img') return true;
  if (svg.getAttribute('focusable') === 'false') return true;
  if (svg.classList?.contains('MathJax')) return true;
  return !!svg.closest?.('mjx-container,mjx-math,.MathJax');
}

/**
 * @param {Element | null | undefined} container
 */
function normalizeMathPresentation(container) {
  if (!container) return;

  const blockStyle = 'display:block; width:100%; margin:1em auto; text-align:center; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;';
  const inlineStyle = 'display:inline-block; vertical-align:middle; transform:translateY(-0.12em); margin:0 1px; line-height:1;';

  /** @param {Element | null | undefined} el */
  const normalizeTopOffsets = (el) => {
    if (!el || typeof el.getAttribute !== 'function' || typeof el.setAttribute !== 'function') return;
    const style = String(el.getAttribute('style') || '');
    if (!/\btop\s*:/i.test(style)) return;
    let topValue = null;
    let nextStyle = style.replace(/(^|;)\s*top\s*:\s*([^;]+)\s*;?/i, (_m, prefix, value) => {
      topValue = String(value || '').trim();
      return String(prefix || '');
    });
    if (!topValue) return;
    if (/transform\s*:/i.test(nextStyle)) {
      nextStyle = nextStyle.replace(
        /transform\s*:\s*([^;]+)/i,
        (_m, value) => `transform:${String(value || '').trim()} translateY(${topValue})`
      );
    } else {
      nextStyle = `${nextStyle}${nextStyle.trim().endsWith(';') || !nextStyle.trim() ? '' : ';'}transform: translateY(${topValue});`;
    }
    el.setAttribute('style', nextStyle);
  };

  container.querySelectorAll('mjx-container').forEach((mjx) => {
    const attrs = `${mjx.getAttribute('display') || ''} ${mjx.getAttribute('style') || ''}`.toLowerCase();
    const isBlock = attrs.includes('true') || attrs.includes('display: block') || attrs.includes('display:block');
    const existing = String(mjx.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    mjx.setAttribute('style', `${normalized}${isBlock ? blockStyle : inlineStyle}`);
  });

  container.querySelectorAll('svg').forEach((svg) => {
    if (!looksLikeMathSvg(svg)) return;
    const svgStyle = String(svg.getAttribute('style') || '');
    let normalizedSvgStyle = svgStyle ? `${svgStyle}${svgStyle.trim().endsWith(';') ? '' : ';'}` : '';
    normalizedSvgStyle = normalizedSvgStyle.replace(/vertical-align\s*:\s*[^;]+;?/gi, '');
    if (!/max-width\s*:/i.test(normalizedSvgStyle)) {
      normalizedSvgStyle = `${normalizedSvgStyle}max-width: 100%; height: auto;`;
    }
    svg.setAttribute('style', `${normalizedSvgStyle}display:inline-block;vertical-align:middle;`);

    const parent = svg.parentElement;
    if (!parent) return;

    const parentTag = parent.tagName.toLowerCase();
    const mathParent = parentTag === 'mjx-container' ? parent : null;
    const blockHint = String(mathParent?.getAttribute('display') || mathParent?.getAttribute('style') || '').toLowerCase();
    const wrapperMathMode = parent.getAttribute('data-owc-math');
    const hostMathMode = parentTag !== 'mjx-container' ? parent.closest?.('[data-owc-math]')?.getAttribute('data-owc-math') : null;
    const isBlockMath = wrapperMathMode === 'block'
      || hostMathMode === 'block'
      || blockHint.includes('true')
      || blockHint.includes('display: block')
      || blockHint.includes('display:block');

    if (isBlockMath) {
      const host = parentTag === 'section'
        ? parent
        : (parentTag === 'p' && parent.childNodes.length === 1 ? parent : null);
      if (host) {
        host.setAttribute('style', blockStyle);
      }
      svg.setAttribute(
        'style',
        `${svg.getAttribute('style') || ''}${String(svg.getAttribute('style') || '').trim().endsWith(';') || !svg.getAttribute('style') ? '' : ';'}display:block;margin:0 auto;`
      );
    } else if (parentTag === 'span' || parentTag === 'mjx-container') {
      const existing = String(parent.getAttribute('style') || '');
      const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
      parent.setAttribute('style', `${normalized}${inlineStyle}`);
    }

    normalizeTopOffsets(svg);
    Array.from(svg.querySelectorAll('[style*="top:"], [style*="top: "]')).forEach(normalizeTopOffsets);
  });

  container.querySelectorAll('[data-owc-math="block"]').forEach((el) => {
    const existing = String(el.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    el.setAttribute('style', `${normalized}${blockStyle}`);
  });

  container.querySelectorAll('[data-owc-math="inline"]').forEach((el) => {
    const existing = String(el.getAttribute('style') || '');
    const normalized = existing ? `${existing}${existing.trim().endsWith(';') ? '' : ';'}` : '';
    el.setAttribute('style', `${normalized}${inlineStyle}`);
  });
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function applyLegacyTypographerParity(container, converter) {
  if (!container || !converter || !converter.md) return;
  if (typeof converter.md.renderInline !== 'function') return;
  if (converter.md.options && converter.md.options.typographer !== true) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const walker = activeDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const interestingPattern = /["']|\.{3}|---?|\+-|\((?:c|r|tm)\)/i;

  let node = walker.nextNode();
  while (node) {
    const current = node;
    node = walker.nextNode();

    const parent = current.parentElement;
    if (!parent) continue;
    if (parent.closest('pre,code,kbd,samp,script,style,textarea,svg,mjx-container,mjx-math,math')) continue;

    const original = String(current.textContent || '');
    if (!original || !interestingPattern.test(original)) continue;

    let rendered = '';
    try {
      rendered = converter.md.renderInline(original);
    } catch {
      continue;
    }
    if (!rendered || rendered === original) continue;

    const normalized = htmlToText(rendered);
    if (normalized && normalized !== original) {
      current.textContent = normalized;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function renderUnresolvedMathFormulas(container, converter) {
  // Obsidian's MarkdownRenderer.renderMarkdown does not render LaTeX math formulas.
  // This function detects unresolved $...$ and $$...$$ patterns in text nodes
  // and renders them using the converter's markdown-it + MathJax pipeline.
  if (!container || !converter) return;
  if (!converter.md || typeof converter.md.renderInline !== 'function') return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const walker = activeDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    const text = String(node.textContent || '');
    // Check for math patterns: $...$ (inline) or $$...$$ (block)
    if (text.includes('$') && node instanceof Text) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (!parent) continue;
    // Skip if inside code, pre, or already rendered math
    if (parent.closest('pre,code,kbd,samp,script,style,textarea,mjx-container,mjx-math,math')) continue;

    const text = String(textNode.textContent || '');
    if (!text.includes('$')) continue;

    // Check if there are actual math patterns (not just escaped dollar signs)
    // Pattern: $$...$$ for block, $...$ for inline (not preceded/followed by $)
    const hasBlockMath = /\$\$[\s\S]+?\$\$/.test(text);
    const hasInlineMath = /(^|[^$])\$(?!\$)([^$\n]+?)\$(?!\$)/.test(text);
    if (!hasBlockMath && !hasInlineMath) continue;

    // Use markdown-it to render the text with math
    let rendered;
    try {
      // For block math, we need to handle it differently
      if (hasBlockMath) {
        // Create a temporary container and use full render for block math
        const tempDiv = createHtmlContainer('div');
        // Wrap block math in paragraph-like structure for rendering
        const wrappedText = text.replace(/\$\$([\s\S]+?)\$\$/g, '\n$$\n$1\n$$\n');
        const fullRendered = converter.md.render(wrappedText);
        setElementHtml(tempDiv, fullRendered);

        // Extract the rendered content
        const fragment = activeDocument.createDocumentFragment();
        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild);
        }
        textNode.replaceWith(fragment);
      } else {
        // Inline math only - use renderInline
        rendered = converter.md.renderInline(text);
        if (rendered && rendered !== text) {
          const tempDiv = createHtmlContainer('div', rendered);
          const fragment = activeDocument.createDocumentFragment();
          while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
          }
          textNode.replaceWith(fragment);
        }
      }
    } catch {
      // Keep original text if rendering fails
      continue;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function applyLegacyLinkifyParity(container, converter) {
  if (!container || !converter || !converter.md || !converter.md.linkify) return;
  if (typeof converter.md.linkify.match !== 'function') return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const walker = activeDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const current = node;
    node = walker.nextNode();

    const parent = current.parentElement;
    if (!parent) continue;
    if (parent.closest('a,pre,code,kbd,samp,script,style,textarea,svg,mjx-container,mjx-math,math')) continue;

    const original = String(current.textContent || '');
    if (!original || !original.includes('.')) continue;

    let matches = null;
    try {
      matches = converter.md.linkify.match(original);
    } catch {
      matches = null;
    }
    if (!Array.isArray(matches) || matches.length === 0) continue;

    const fragment = activeDocument.createDocumentFragment();
    let cursor = 0;

    for (const item of matches) {
      const start = Number.isFinite(item?.index) ? item.index : -1;
      const end = Number.isFinite(item?.lastIndex) ? item.lastIndex : -1;
      if (start < 0 || end <= start || start < cursor || end > original.length) continue;

      if (start > cursor) {
        fragment.appendChild(activeDocument.createTextNode(original.slice(cursor, start)));
      }

      const displayText = original.slice(start, end);
      const hrefCandidate = String(item?.url || item?.text || displayText || '').trim();
      const href =
        converter && typeof converter.validateLink === 'function'
          ? converter.validateLink(hrefCandidate, false)
          : hrefCandidate;

      const a = activeDocument.createElement('a');
      a.setAttribute('href', href);
      a.textContent = displayText;
      fragment.appendChild(a);
      cursor = end;
    }

    if (cursor === 0) continue;
    if (cursor < original.length) {
      fragment.appendChild(activeDocument.createTextNode(original.slice(cursor)));
    }

    if (current.parentNode) {
      current.parentNode.replaceChild(fragment, current);
    }
  }
}

/**
 * @param {string} html
 * @param {PreRenderedMathLike[]} formulas
 * @returns {string}
 */
function injectPreRenderedMathFormulas(html, formulas) {
  if (!html || !Array.isArray(formulas) || formulas.length === 0) return html;

  let result = html;
  for (const { placeholder, rendered } of formulas) {
    if (placeholder && rendered) {
      // Replace placeholder with pre-rendered math HTML
      result = result.split(placeholder).join(rendered);
    }
  }
  return result;
}

export {
  stripDangerousTags,
  protectSvgStyleTags,
  restoreSvgStyleTags,
  normalizeMathPresentation,
  applyLegacyTypographerParity,
  renderUnresolvedMathFormulas,
  applyLegacyLinkifyParity,
  injectPreRenderedMathFormulas,
};
