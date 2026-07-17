/*
## 核心功能

规范化 Obsidian 渲染 DOM 中的 callout、标签、属性、链接、代码块和空白。

## 输入

接收 Obsidian 渲染容器及转换器提供的兼容方法。

## 输出

输出可组合的 DOM 规范化函数，供 triplet serializer 的固定处理顺序调用。

## 定位

位于 services/，是 obsidian-triplet-serializer.js 的 DOM 规范化子模块；不负责图片、数学或最终 HTML 包装。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 保持每个转换函数可独立调用，处理顺序由 serializer 编排层决定。
- 不在本模块加入主题样式或发布平台网络逻辑。
*/

import { createHtmlContainer, getActiveDocument } from './dom-utils.js';

/**
 * @typedef {{
 *   type: string,
 *   title: string,
 *   icon: string,
 *   label: string,
 * }} LegacyCalloutInfo
 *
 * @typedef {{
 *   renderCalloutOpen?: (callout: LegacyCalloutInfo) => string,
 *   createCodeBlock?: (content: string, language: string) => string,
 *   validateLink?: (href: string, isImage?: boolean) => string,
 *   resolveImagePath?: (src: string) => string,
 * }} ConverterLike
 */

/** @type {Record<string, string>} */
const LEGACY_CALLOUT_ICON_BY_TYPE = {
  note: 'ℹ️',
  info: 'ℹ️',
  todo: '☑️',
  abstract: '📄',
  summary: '📄',
  tldr: '📄',
  tip: '💡',
  hint: '💡',
  important: '💡',
  success: '✅',
  check: '✅',
  done: '✅',
  question: '❓',
  help: '❓',
  faq: '❓',
  warning: '⚠️',
  caution: '⚠️',
  attention: '⚠️',
  failure: '❌',
  fail: '❌',
  missing: '❌',
  danger: '🚨',
  error: '❌',
  bug: '🐛',
  quote: '💬',
  cite: '📝',
  example: '📋',
};

function toTitleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveLegacyCalloutIcon(type) {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return 'ℹ️';
  return LEGACY_CALLOUT_ICON_BY_TYPE[key] || 'ℹ️';
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function convertObsidianCalloutsToLegacy(container, converter) {
  if (!container || !converter) return;
  if (typeof converter.renderCalloutOpen !== 'function') return;

  const callouts = Array.from(
    container.querySelectorAll('div.callout,aside.callout,blockquote.callout,section.callout')
  );
  if (callouts.length === 0) return;

  // Convert deepest nodes first so nested callouts stay stable.
  /** @param {Element} node */
  const getCalloutDepth = (node) => {
    let depth = 0;
    let cursor = node?.parentElement || null;
    while (cursor) {
      if (
        cursor.matches &&
        cursor.matches('div.callout,aside.callout,blockquote.callout,section.callout')
      ) {
        depth += 1;
      }
      cursor = cursor.parentElement;
    }
    return depth;
  };
  callouts.sort((a, b) => {
    const da = getCalloutDepth(a);
    const db = getCalloutDepth(b);
    return db - da;
  });

  for (const callout of callouts) {
    if (!callout || !callout.parentNode) continue;

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
    const title = titleText || toTitleCase(type) || 'Callout';

    const contentEl =
      callout.querySelector(':scope > .callout-content') ||
      callout.querySelector(':scope > .callout-body');
    const contentHtml = contentEl ? contentEl.innerHTML : callout.innerHTML;

    const calloutInfo = {
      type: type || title.toLowerCase(),
      title,
      icon: resolveLegacyCalloutIcon(type || title),
      label: type || title,
    };

    let openHtml = '';
    try {
      openHtml = converter.renderCalloutOpen(calloutInfo);
    } catch {
      continue;
    }
    if (!openHtml) continue;

    const host = createHtmlContainer('div', `${openHtml}${contentHtml}</section></section>`);

    const replacementNodes = Array.from(host.childNodes);
    if (replacementNodes.length === 0) continue;
    callout.replaceWith(...replacementNodes);
  }
}

/**
 * @param {Element} el
 * @param {string} tagName
 * @param {boolean} [finalStage]
 */
function sanitizeClassList(el, tagName, finalStage = false) {
  const className = el.getAttribute('class');
  if (!className) return;
  const classes = className.split(/\s+/).filter(Boolean);
  let keep = [];

  if (tagName === 'section') {
    keep = classes.filter((cls) => cls === 'code-snippet__fix');
  } else if (tagName === 'img') {
    keep = classes.filter((cls) => cls === 'math-formula-image' || cls === 'mermaid-diagram-image');
  } else if (tagName === 'svg') {
    keep = classes.filter((cls) => cls === 'owc-mermaid-diagram');
  } else if (!finalStage && (tagName === 'pre' || tagName === 'code')) {
    keep = classes.filter((cls) => cls.startsWith('language-'));
  }

  if (keep.length > 0) {
    el.setAttribute('class', keep.join(' '));
  } else {
    el.removeAttribute('class');
  }
}

/**
 * @param {Element | null | undefined} container
 * @param {{ finalStage?: boolean }} [options]
 */
function pruneObsidianOnlyAttributes(container, { finalStage = false } = {}) {
  if (!container) return;

  const SVG_ALLOWED_ATTRS = new Set([
    'style', 'class', 'xmlns', 'viewbox', 'width', 'height', 'x', 'y', 'dx', 'dy',
    'cx', 'cy', 'rx', 'ry', 'r', 'x1', 'y1', 'x2', 'y2', 'd', 'points',
    'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
    'fill-opacity', 'stroke-opacity', 'font-size', 'font-family',
    'font-weight', 'text-anchor', 'alignment-baseline', 'dominant-baseline',
    'preserveaspectratio',
    'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight',
    'refx', 'refy', 'orient', 'pathlength', 'role', 'focusable', 'aria-hidden',
    'xmlns:xlink', 'xlink:href',
  ]);
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'text', 'tspan', 'defs', 'marker', 'foreignobject', 'clippath',
    'pattern', 'mask', 'symbol', 'use',
  ]);

  /** @param {string} tagName */
  const getAllowedAttrs = (tagName) => {
    if (tagName === 'a') return new Set(['href', 'style']);
    if (tagName === 'img') return new Set(['src', 'alt', 'style', 'width', 'height', 'class', 'referrerpolicy']);
    if (tagName === 'section' && !finalStage) {
      return new Set(['style', 'class', 'data-owc-image-swipe', 'data-owc-image-swipe-type', 'data-owc-image-swipe-warning', 'data-owc-image-swipe-hint']);
    }
    if (tagName === 'section') return new Set(['style', 'class']);
    if (!finalStage && (tagName === 'pre' || tagName === 'code')) return new Set(['style', 'class']);
    if (SVG_TAGS.has(tagName)) return SVG_ALLOWED_ATTRS;
    return new Set(['style']);
  };

  Array.from(container.querySelectorAll('*')).forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const allowed = getAllowedAttrs(tagName);
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if ((name.startsWith('data-') && !allowed.has(name)) || name === 'id' || name === 'dir') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (!allowed.has(name)) {
        el.removeAttribute(attr.name);
      }
    }

    sanitizeClassList(el, tagName, finalStage);

    const style = el.getAttribute('style');
    if (style !== null && style.trim() === '') {
      el.removeAttribute('style');
    }
  });
}

/**
 * @param {Element | null | undefined} container
 */
function normalizeLegacyTagAliases(container) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;
  const strikeTags = Array.from(container.querySelectorAll('s'));
  for (const sEl of strikeTags) {
    const del = activeDocument.createElement('del');
    if (sEl.hasAttributes()) {
      Array.from(sEl.attributes).forEach((attr) => {
        del.setAttribute(attr.name, attr.value);
      });
    }
    while (sEl.firstChild) {
      del.appendChild(sEl.firstChild);
    }
    sEl.replaceWith(del);
  }
}

/**
 * @param {Element | null | undefined} container
 */
function normalizeLegacyDeleteNesting(container) {
  if (!container) return;
  const activeDocument = getActiveDocument();
  if (!activeDocument) return;

  const dels = Array.from(container.querySelectorAll('del'));
  for (const first of dels) {
    if (!first || !first.parentElement) continue;
    if (first.parentElement.tagName.toLowerCase() === 'del') continue;
    if (first.querySelector('del')) continue;

    let spacer = first.nextSibling;
    let second = null;

    if (spacer && spacer.nodeType === Node.TEXT_NODE && /^\s*$/.test(spacer.textContent || '')) {
      second = spacer.nextSibling;
    } else if (spacer instanceof Element && spacer.tagName.toLowerCase() === 'del') {
      second = spacer;
      spacer = null;
    } else {
      continue;
    }

    if (!(second instanceof Element) || second.tagName.toLowerCase() !== 'del') continue;

    const label = (first.textContent || '').trim();
    if (!/[：:]$/.test(label)) continue;
    if (!/\S/.test(second.textContent || '')) continue;

    if (!/\s$/.test(first.textContent || '')) {
      first.appendChild(activeDocument.createTextNode(' '));
    }
    first.appendChild(second);
    if (spacer && spacer.parentNode) spacer.remove();
  }
}

/**
 * @param {string} html
 * @returns {string}
 */
function normalizeLegacyDeleteNestingInHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  return html.replace(
    /<del([^>]*)>([^<]*[：:])<\/del>(?:\s|&nbsp;|<br\s*\/?>)*<del([^>]*)>/g,
    (_match, attrs1, label, attrs2) => `<del${attrs1}>${label} <del${attrs2}>`
  );
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function sanitizeAnchorAndImageLinks(container, converter) {
  if (!container) return;

  const hasExplicitProtocol = (value) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(String(value || ''));
  const hasNonAscii = (value) => {
    for (const ch of String(value || '')) {
      if (String(ch || '').charCodeAt(0) > 0x7f) return true;
    }
    return false;
  };

  const canonicalizeRelativeHrefForLegacyParity = (href) => {
    const value = String(href || '').trim();
    if (!value) return value;
    if (value.startsWith('#') || value.startsWith('//')) return value;
    if (hasExplicitProtocol(value)) {
      // Keep most absolute links unchanged; only normalize non-ASCII http(s) URLs
      // for parity with legacy punycode output.
      if (/^https?:/i.test(value) && hasNonAscii(value)) {
        try {
          const parsed = new URL(value);
          const isBareHost = /^https?:\/\/[^/?#]+$/i.test(value);
          if (isBareHost && parsed.pathname === '/' && !parsed.search && !parsed.hash) {
            return `${parsed.protocol}//${parsed.host}`;
          }
          return parsed.href;
        } catch {
          return value;
        }
      }
      return value;
    }

    let decoded = value;
    try {
      decoded = decodeURI(value);
    } catch {
      // keep original value if decode fails (e.g. malformed percent encoding)
    }
    return encodeURI(decoded);
  };

  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const safeHref =
      converter && typeof converter.validateLink === 'function'
        ? converter.validateLink(href, false)
        : href;
    a.setAttribute('href', canonicalizeRelativeHrefForLegacyParity(safeHref));
  });
}

/**
 * @param {Element | null | undefined} container
 * @param {ConverterLike | null | undefined} converter
 */
function convertPreBlocks(container, converter) {
  if (!container || !converter || typeof converter.createCodeBlock !== 'function') return;

  const preBlocks = Array.from(container.querySelectorAll('pre'));
  for (const pre of preBlocks) {
    if (pre.closest('.code-snippet__fix')) continue;
    const codeEl = pre.querySelector('code');
    const className = `${pre.className || ''} ${codeEl?.className || ''}`;
    const langMatch = className.match(/language-([\w-]+)/);
    const lang = langMatch ? langMatch[1] : 'text';
    const content = codeEl ? codeEl.textContent || '' : pre.textContent || '';

    const wrapper = createHtmlContainer('div', converter.createCodeBlock(content, lang));
    const replacement = wrapper.firstElementChild;
    if (replacement) {
      pre.replaceWith(replacement);
    }
  }
}

/**
 * @param {Element | null | undefined} container
 */
function trimTrailingWhitespaceInBlockText(container) {
  if (!container) return;
  const selector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,th';
  const blocks = Array.from(container.querySelectorAll(selector));

  for (const block of blocks) {
    let node = block.lastChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = String(node.textContent || '');
        const trimmed = original.replace(/[ \t\u00a0]+$/g, '');
        if (trimmed !== original) {
          if (trimmed) {
            node.textContent = trimmed;
            break;
          }
          const prev = node.previousSibling;
          node.remove();
          node = prev;
          continue;
        }
      }
      break;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 */
function trimLeadingWhitespaceInBlockText(container) {
  if (!container) return;
  const selector = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,figcaption,td,th';
  const blocks = Array.from(container.querySelectorAll(selector));

  for (const block of blocks) {
    let node = block.firstChild;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = String(node.textContent || '');
        const trimmed = original.replace(/^[ \t\u00a0]+/g, '');
        if (trimmed !== original) {
          if (trimmed) {
            node.textContent = trimmed;
            break;
          }
          const next = node.nextSibling;
          node.remove();
          node = next;
          continue;
        }
      }
      break;
    }
  }
}

/**
 * @param {Element | null | undefined} container
 */
function pruneEmptyHeadings(container) {
  if (!container) return;
  const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));

  for (const heading of headings) {
    const text = String(heading.textContent || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (text) continue;

    const html = String(heading.innerHTML || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (!html) {
      heading.remove();
      continue;
    }

    const normalized = html
      .replace(/<br\s*\/?>/gi, '')
      .replace(/&nbsp;/gi, '')
      .replace(/\s+/g, '');
    if (!normalized) {
      heading.remove();
    }
  }
}

export {
  convertObsidianCalloutsToLegacy,
  pruneObsidianOnlyAttributes,
  normalizeLegacyTagAliases,
  normalizeLegacyDeleteNesting,
  normalizeLegacyDeleteNestingInHtml,
  sanitizeAnchorAndImageLinks,
  convertPreBlocks,
  trimTrailingWhitespaceInBlockText,
  trimLeadingWhitespaceInBlockText,
  pruneEmptyHeadings,
};
