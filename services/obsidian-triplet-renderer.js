/*
## 核心功能

实现渲染管线相关的 obsidian triplet renderer 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `neutralizeUnsafeMarkdownLinks`、`neutralizePlainWikilinks`、`normalizeWechatUnsafeTaskListMarkers`、`preprocessMarkdownForTriplet`、`injectHardBreaksForLegacyParity`、`normalizeRenderedDomPunctuation`、`shouldObserveAsyncEmbedWindow`、`shouldObserveMermaidRenderWindow`、`waitForTripletDomToSettle`、`renderByObsidianMarkdownRenderer`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：`./obsidian-triplet-serializer.js`、`./obsidian-triplet-renderer-images.js`、`./chinese-punctuation.js`、`./dom-utils.js`、`./native-renderer.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { serializeObsidianRenderedHtml } from './obsidian-triplet-serializer.js';
import { normalizeRenderedDomPunctuation } from './chinese-punctuation.js';
import { findAllElements, getActiveDocument, getActiveWindowValue } from './dom-utils.js';
import { normalizeAdjacentMarkdownBlockHeadings } from './native-renderer.js';
import { getImageCaptionFromPath, materializeLocalMarkdownImages, preprocessImageSwipeCallouts } from './obsidian-triplet-renderer-images.js';

/**
 * @typedef {{ marker: '`' | '~', length: number }} FenceState
 * @typedef {{ placeholder: string, rendered: string, isBlock: boolean }} PreRenderedMathFormula
 * @typedef {{ markdown: string, formulas: PreRenderedMathFormula[] }} PreRenderedMathResult
 * @typedef {{ markdown: string, mathFormulas: PreRenderedMathFormula[] }} TripletPreprocessResult
 * @typedef {{
 *   renderMarkdown?: (markdown: string, sourcePath: string, el: HTMLElement, component: unknown) => Promise<void> | void,
 *   render?: (app: unknown, markdown: string, el: HTMLElement, sourcePath: string, component: unknown) => Promise<void> | void,
 * }} MarkdownRendererLike
 * @typedef {{
 *   render?: (markdown: string) => string,
 *   renderInline?: (markdown: string) => string,
 * }} MarkdownItLike
 * @typedef {{
 *   md?: MarkdownItLike,
 *   stripFrontmatter?: (markdown: string) => string,
 * }} ConverterLike
 * @typedef {{
 *   app?: unknown,
 *   markdown: string,
 *   targetEl: HTMLElement,
 *   sourcePath?: string,
 *   component?: unknown,
 *   converter?: ConverterLike | null,
 *   markdownRenderer?: MarkdownRendererLike | null,
 *   preserveSvgStyleTags?: boolean,
 * }} TripletRenderOptions
 * @typedef {{
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   observeMermaid?: boolean,
 *   minObserveMs?: number,
 *   mermaidObserveMs?: number,
 * }} TripletSettleOptions
 * @typedef {{
 *   app?: unknown,
 *   markdown: string,
 *   sourcePath?: string,
 *   targetEl: HTMLElement,
 *   component?: unknown,
 *   markdownRenderer?: MarkdownRendererLike | null,
 * }} ObsidianRendererOptions
 * @typedef {{
 *   normalizeChinesePunctuation?: boolean,
 * }} TripletSettingsLike
 * @typedef {(root: HTMLElement, options: { mermaidApi?: unknown }) => Promise<void> | void} MermaidCodeRendererLike
 * @typedef {(root: HTMLElement) => Promise<void> | void} MermaidRasterizerLike
 * @typedef {(options: Record<string, unknown>) => string} TripletSerializerLike
 * @typedef {{
 *   html: string,
 *   unresolvedImageEmbeds: number,
 *   pendingMermaidDiagrams: number,
 *   renderedMermaidDiagrams: number,
 * }} TripletRenderResult
 */

/** @returns {MarkdownRendererLike | null} */
function getDefaultMarkdownRenderer() {
  const obsidianApi = /** @type {{ MarkdownRenderer?: MarkdownRendererLike } | undefined} */ (getActiveWindowValue('obsidian'));
  return obsidianApi?.MarkdownRenderer || null;
}

/** @param {string} line */
function isFencedBlockDelimiter(line) {
  return /^\s{0,3}(?:`{3,}|~{3,})/.test(String(line || ''));
}

/**
 * @param {string} line
 * @returns {FenceState | null}
 */
function parseFencedBlockDelimiter(line) {
  const value = String(line || '');
  const match = value.match(/^\s{0,3}((`{3,})|(~{3,}))(.*)$/);
  if (!match) return null;
  const markerRun = match[1] || '';
  const markerChar = markerRun.charAt(0);
  if (markerChar !== '`' && markerChar !== '~') return null;
  return {
    marker: markerChar,
    length: markerRun.length,
  };
}

/** @param {string} line */
function isMathFenceDelimiter(line) {
  return /^\s*\$\$\s*$/.test(String(line || ''));
}

/** @param {string} line */
function isQuoteLine(line) {
  return /^\s{0,3}(?:>\s?)+/.test(String(line || ''));
}

/** @param {string} line */
function stripQuotePrefix(line) {
  return String(line || '').replace(/^\s{0,3}(?:>\s?)+/, '');
}

/** @param {string} prefix */
function isQuotePrefix(prefix) {
  return /^\s{0,3}(?:>\s?)+$/.test(String(prefix || ''));
}

/** @param {string} trimmedLine */
function startsNewBlock(trimmedLine) {
  if (!trimmedLine) return true;
  if (/^#{1,6}\s/.test(trimmedLine)) return true;
  if (/^>/.test(trimmedLine)) return true;
  if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmedLine)) return true;
  if (/^(?:[*+-]|\d+[.)])\s+/.test(trimmedLine)) return true;
  if (/^\|/.test(trimmedLine)) return true;
  if (/^<[^>]+>/.test(trimmedLine)) return true;
  if (isFencedBlockDelimiter(trimmedLine)) return true;
  return false;
}

/** @param {string} trimmedLine */
function isListItemLine(trimmedLine) {
  return /^(?:[*+-]|\d+[.)])\s+/.test(String(trimmedLine || ''));
}

/** @param {string} line */
function appendLegacyHardBreak(line) {
  const value = String(line || '');
  if (!value) return value;
  if (/<br\s*\/?>\s*$/i.test(value)) return value;
  return `${value.replace(/[ \t]+$/, '')}<br>`;
}

/** @param {string} line */
function appendQuoteHardBreak(line) {
  const value = String(line || '');
  if (!value) return value;
  if (/<br\s*\/?>\s*$/i.test(value)) return value;
  return `${value.replace(/[ \t]+$/, '')}<br>`;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function injectHardBreaksForLegacyParity(markdown) {
  const lines = String(markdown || '').split('\n');
  let fenceState = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    const fenceDelimiter = parseFencedBlockDelimiter(line);
    if (fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(line)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fenceState || inMathFence) continue;
    if (!line || !nextLine) continue;
    if (/[ \t]{2,}$/.test(line) || /\\$/.test(line)) continue;

    if (isQuoteLine(line) && isQuoteLine(nextLine)) {
      const currentQuoteContent = stripQuotePrefix(line).trim();
      const nextQuoteContent = stripQuotePrefix(nextLine).trim();
      if (!currentQuoteContent || !nextQuoteContent) continue;
      if (/^\[!/.test(currentQuoteContent) || /^\[!/.test(nextQuoteContent)) continue;
      lines[i] = appendQuoteHardBreak(line);
      continue;
    }

    const currentTrimmed = line.trim();
    if (startsNewBlock(currentTrimmed) && !isListItemLine(currentTrimmed)) continue;
    if (startsNewBlock(nextLine.trim())) continue;

    lines[i] = appendLegacyHardBreak(line);
  }

  return lines.join('\n');
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function neutralizeUnsafeMarkdownLinks(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  // markdown-it rejects javascript:/vbscript:/data: links in markdown syntax and
  // keeps them as literal text. Escape leading "[" to mimic that behavior in triplet.
  const unsafeLinkPattern = /\[[^\]]+\]\(((?:javascript|vbscript|data):[^)\r\n]*)\)/gi;
  return source.replace(unsafeLinkPattern, (match, _href, offset, fullText) => {
    const sourceText = String(fullText || '');
    const safeOffset = Number(offset) || 0;
    const prevChar = safeOffset > 0 ? sourceText[safeOffset - 1] : '';
    if (prevChar === '!' || prevChar === '\\') {
      return match;
    }
    return `\\${match}`;
  });
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function neutralizePlainWikilinks(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  /** @param {string} value */
  const escapePlainWikilinks = (value) =>
    String(value || '').replace(/(^|[^!\\])(\[\[[^[\]\r\n]+?\]\])/g, (_match, prefix, wikilink) => {
      return `${prefix}\\${wikilink}`;
    });

  /** @param {string} line */
  const neutralizeLineOutsideInlineCode = (line) => {
    const value = String(line || '');
    if (!value || !value.includes('[[')) return value;

    let result = '';
    let cursor = 0;
    const codeSpanPattern = /(`+)([\s\S]*?)(\1)/g;
    let match = codeSpanPattern.exec(value);

    while (match) {
      const [segment] = match;
      const start = match.index;
      const end = start + segment.length;
      result += escapePlainWikilinks(value.slice(cursor, start));
      result += segment;
      cursor = end;
      match = codeSpanPattern.exec(value);
    }

    result += escapePlainWikilinks(value.slice(cursor));
    return result;
  };

  const lines = source.split('\n');
  let fenceState = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fenceDelimiter = parseFencedBlockDelimiter(line);
    if (fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(line)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fenceState || inMathFence) continue;

    lines[i] = neutralizeLineOutsideInlineCode(line);
  }

  return lines.join('\n');
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function normalizeWechatUnsafeTaskListMarkers(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  const lines = source.split('\n');
  let fenceState = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fenceDelimiter = parseFencedBlockDelimiter(line);
    if (fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(line)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fenceState || inMathFence) continue;

    lines[i] = line.replace(
      /^(\s*)([-*+])\s+\[([ xX])\]\s+/,
      (_match, indent, marker, state) =>
        `${indent}${marker} ${String(state || '').trim().toLowerCase() === 'x' ? '☑' : '☐'} `,
    );
  }

  return lines.join('\n');
}

// Known safe HTML tags that should NOT be escaped
// This list includes common HTML5 tags that users might intentionally use
const KNOWN_HTML_TAGS = new Set([
  // Block elements
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'br',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'main', 'section',
  'article', 'aside', 'header', 'footer', 'nav', 'address',
  // Inline elements
  'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'code', 'kbd',
  'samp', 'var', 'mark', 'small', 'sub', 'sup', 'span', 'abbr', 'cite', 'q',
  'time', 'ruby', 'rt', 'rp', 'bdi', 'bdo', 'dfn', 'wbr',
  // Media elements
  'img', 'picture', 'source', 'video', 'audio', 'track', 'canvas', 'svg', 'math',
  // Table elements
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // Form elements (though these are stripped by sanitizer)
  'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea', 'label',
  'fieldset', 'legend', 'datalist', 'output', 'progress', 'meter',
  // Other common elements
  'details', 'summary', 'dialog', 'menu', 'menuitem', 'noscript', 'template',
  // MathJax specific
  'mjx-container', 'mjx-math',
]);

/**
 * Escape pseudo-HTML tags that look like HTML but are actually text.
 * For example: <Title>_xxx_MS.pdf should be rendered as text, not as an HTML tag.
 */
/**
 * @param {string} markdown
 * @returns {string}
 */
function escapePseudoHtmlTags(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeBlockFence = null; // { marker: '`' or '~', length: number }

  for (const line of lines) {
    // Track code block boundaries using existing parser (supports 0-3 leading spaces)
    const parsed = parseFencedBlockDelimiter(line);
    if (parsed) {
      if (!inCodeBlock) {
        // Opening fence
        inCodeBlock = true;
        codeBlockFence = { marker: parsed.marker, length: parsed.length };
      } else if (parsed.marker === codeBlockFence.marker && parsed.length >= codeBlockFence.length) {
        // Closing fence must match marker type and be at least as long
        inCodeBlock = false;
        codeBlockFence = null;
      }
      // If marker doesn't match, it's content inside the code block (not a closing fence)
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Escape pseudo-HTML tags outside code blocks, but preserve inline code
    const processed = escapeLinePreservingInlineCode(line);
    result.push(processed);
  }

  return result.join('\n');
}

/**
 * Escape pseudo-HTML tags in a line while preserving inline code content.
 * Supports multi-backtick code spans (CommonMark compliant).
 */
/**
 * @param {string} line
 * @returns {string}
 */
function escapeLinePreservingInlineCode(line) {
  const segments = [];
  let lastIndex = 0;
  let i = 0;

  while (i < line.length) {
    // Look for backtick sequence (inline code span start)
    if (line[i] === '`') {
      // Skip fenced block markers at line start (3+ backticks)
      if (i === 0 && line.match(/^`{3,}/)) {
        i++;
        continue;
      }

      // Count opening delimiter run length
      const startIndex = i;
      let openLen = 0;
      while (i < line.length && line[i] === '`') {
        openLen++;
        i++;
      }

      // Find matching closing delimiter run of the same length
      let foundClose = false;
      while (i < line.length) {
        if (line[i] === '`') {
          let closeLen = 0;
          while (i < line.length && line[i] === '`') {
            closeLen++;
            i++;
          }
          // Closing delimiter must match opening length
          if (closeLen === openLen) {
            foundClose = true;
            break;
          }
          // Otherwise continue searching
        } else {
          i++;
        }
      }

      if (foundClose) {
        // Add text before code span and the code span itself
        segments.push(line.slice(lastIndex, startIndex));
        segments.push(line.slice(startIndex, i));
        lastIndex = i;
      }
      // If no close found, the opening backticks are just literal text
    } else {
      i++;
    }
  }

  // Add remaining text
  if (lastIndex < line.length) {
    segments.push(line.slice(lastIndex));
  }

  // If no inline code found, process the whole line
  if (segments.length === 0) {
    return escapePseudoHtmlInText(line);
  }

  // Process non-code segments (even indices are text, odd are code spans)
  return segments.map((seg, idx) => {
    if (idx % 2 === 1) return seg; // Preserve code span as-is
    return escapePseudoHtmlInText(seg);
  }).join('');
}

/**
 * Escape pseudo-HTML tags in plain text (not inside code).
 * Matches full tag patterns including attributes and closing bracket.
 */
/**
 * @param {string} text
 * @returns {string}
 */
function escapePseudoHtmlInText(text) {
  // Match opening tags: <tag> or <tag attr="value">
  // Match closing tags: </tag>
  return text.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g, (match, tagName, attrs) => {
    const rawMatch = String(match || '');
    const rawTagName = String(tagName || '');
    const rawAttrs = String(attrs || '');
    const lowerTag = rawTagName.toLowerCase();
    // If it's a known HTML tag, keep it as-is
    if (KNOWN_HTML_TAGS.has(lowerTag)) {
      return rawMatch;
    }
    // Otherwise escape the angle brackets
    if (rawMatch.startsWith('</')) {
      return `&lt;/${rawTagName}&gt;`;
    }
    return `&lt;${rawTagName}${rawAttrs}&gt;`;
  });
}

// Generate a unique placeholder that won't conflict with user content
// Uses a random session ID + counter to prevent collision
const MATH_PLACEHOLDER_SESSION = `M${Date.now().toString(36)}X`;
let mathPlaceholderCounter = 0;

/**
 * @param {string} type
 * @returns {string}
 */
function generateMathPlaceholder(type) {
  const id = `${MATH_PLACEHOLDER_SESSION}_${mathPlaceholderCounter}_${Math.random().toString(36).slice(2, 6)}`;
  mathPlaceholderCounter += 1;
  // Zero-width spaces protect from Markdown, unique ID prevents collision
  return `\u200B${id}_${type}\u200B`;
}

/**
 * Pre-render math formulas and return both the processed markdown and formulas array.
 * This function is pure - it doesn't use or modify any global state.
 * @param {string} markdown
 * @param {ConverterLike | null | undefined} converter
 * @returns {PreRenderedMathResult}
 */
function preRenderMathFormulas(markdown, converter) {
  /** @type {PreRenderedMathFormula[]} */
  const formulas = [];

  if (!converter || !converter.md) return { markdown, formulas };
  if (typeof converter.md.render !== 'function') return { markdown, formulas };

  let output = markdown;

  // First, handle block math ($$...$$) - must be processed before inline
  // Match $$...$$ where content can span multiple lines
  const blockMathPattern = /\$\$([\s\S]+?)\$\$/g;
  output = output.replace(blockMathPattern, (match, formula, offset, fullText) => {
    const placeholder = generateMathPlaceholder('BLOCK');
    try {
      let normalizedFormula = String(formula || '');
      const safeOffset = Number(offset) || 0;
      const source = String(fullText || '');
      const lineStart = source.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
      const openingPrefix = source.slice(lineStart, safeOffset);

      // In quoted blocks/callouts, captured formula lines include leading ">" markers.
      // Strip them before MathJax rendering to avoid rendering stray ">" symbols.
      if (isQuotePrefix(openingPrefix)) {
        normalizedFormula = String(formula || '')
          .split('\n')
          .map((line) => stripQuotePrefix(line))
          .join('\n');
      }

      // Render using full markdown-it (handles block math)
      const rendered = converter.md.render(`$$${normalizedFormula}$$`);
      // Extract just the rendered math (strip wrapper <p> if any)
      const cleaned = rendered.replace(/^<p>|<\/p>$/g, '').trim();
      formulas.push({ placeholder, rendered: cleaned, isBlock: true });
      return placeholder;
    } catch {
      return match;
    }
  });

  // Then, handle inline math ($...$) - single $ not $$.
  const inlineMathPattern = /(^|[^$])\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  output = output.replace(inlineMathPattern, (match, prefix, formula) => {
    const placeholder = generateMathPlaceholder('INLINE');
    try {
      // Render using renderInline for inline math
      const rendered = converter.md.renderInline(`$${formula}$`);
      formulas.push({ placeholder, rendered, isBlock: false });
      return `${prefix}${placeholder}`;
    } catch {
      return match;
    }
  });

  return { markdown: output, formulas };
}

/**
 * Preprocess markdown for triplet rendering.
 * Returns an object with processed markdown and pre-rendered math formulas.
 * This function is pure - no global state is used.
 * @param {string} markdown
 * @param {ConverterLike | null | undefined} converter
 * @returns {TripletPreprocessResult}
 */
function preprocessMarkdownForTriplet(markdown, converter) {
  let output = preprocessImageSwipeCallouts(markdown);
  output = normalizeAdjacentMarkdownBlockHeadings(output);

  // Align with converter.convert preprocessing to reduce non-semantic parity noise.
  output = output.replace(/^[\t ]+(\$\$)/gm, '$1');
  output = output.replace(/!\[\[([^[\]|]+)(?:\|([^[\]]+))?]]/g, (match, imagePath, alt) => {
    const normalizedPath = String(imagePath || '').trim();
    return `![${alt || getImageCaptionFromPath(normalizedPath)}](${encodeURI(normalizedPath)})`;
  });
  output = materializeLocalMarkdownImages(output);

  if (converter && typeof converter.stripFrontmatter === 'function') {
    output = converter.stripFrontmatter(output);
  }

  // Pre-render math formulas using markdown-it + MathJax before Obsidian renders
  // This is needed because Obsidian's MarkdownRenderer.renderMarkdown doesn't render LaTeX
  const { markdown: mathProcessed, formulas: mathFormulas } = preRenderMathFormulas(output, converter);
  output = mathProcessed;
  output = normalizeWechatUnsafeTaskListMarkers(output);

  // Escape pseudo-HTML tags that look like HTML but are actually text
  // For example: <Title>_xxx_MS.pdf should render as text, not as an HTML tag
  output = escapePseudoHtmlTags(output);

  output = neutralizeUnsafeMarkdownLinks(output);
  output = neutralizePlainWikilinks(output);

  // Legacy converter runs markdown-it with breaks=true. Normalize soft line breaks
  // so Obsidian renderer emits equivalent <br> in common paragraph text.
  output = injectHardBreaksForLegacyParity(output);

  return { markdown: output, mathFormulas };
}

/** @param {Element | null | undefined} root */
function countUnresolvedImageEmbeds(root) {
  if (!root) return 0;
  const embeds = findAllElements(root, 'span.internal-embed,span.image-embed,div.internal-embed,div.image-embed');
  let unresolved = 0;
  for (const embed of embeds) {
    const isImageEmbed = embed.classList.contains('image-embed');
    const hasImgChild = !!embed.querySelector('img');
    if (isImageEmbed && !hasImgChild) {
      unresolved += 1;
    }
  }
  return unresolved;
}

/** @param {string} markdown */
function shouldObserveMermaidRenderWindow(markdown) {
  const lines = String(markdown || '').split('\n');
  let fenceState = null;

  for (const line of lines) {
    const delimiter = parseFencedBlockDelimiter(line);
    if (!delimiter) continue;

    if (!fenceState) {
      const infoString = String(line || '').replace(/^\s{0,3}(?:`{3,}|~{3,})/, '').trim().toLowerCase();
      if (infoString === 'mermaid' || infoString.startsWith('mermaid ')) {
        return true;
      }
      fenceState = delimiter;
      continue;
    }

    if (delimiter.marker === fenceState.marker && delimiter.length >= fenceState.length) {
      fenceState = null;
    }
  }

  return false;
}

/**
 * @param {Element | null | undefined} root
 * @returns {Element[]}
 */
function collectMermaidHostElements(root) {
  if (!root) return [];
  const elements = findAllElements(root, '*').filter((el) => {
    const values = [
      el.getAttribute?.('class'),
      el.getAttribute?.('id'),
      el.getAttribute?.('data-type'),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('aria-roledescription'),
    ].filter(Boolean).join(' ').toLowerCase();
    return values.includes('mermaid');
  });
  return elements.filter((el) => {
    if (el.closest('mjx-container')) return false;
    const tagName = el.tagName?.toLowerCase?.();
    if (tagName === 'pre' || tagName === 'code') return false;
    return true;
  });
}

/** @param {Element | null | undefined} root */
function countRenderedMermaidDiagrams(root) {
  if (!root) return 0;
  const svgCount = findAllElements(root, 'svg').filter((svg) => {
    if (svg.closest?.('mjx-container,mjx-math,.MathJax')) return false;
    return !!svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
  }).length;
  const imageCount = findAllElements(root, 'img.mermaid-diagram-image').length;
  return svgCount + imageCount;
}

/** @param {Element | null | undefined} root */
function countPendingMermaidHosts(root) {
  const hosts = collectMermaidHostElements(root);
  let pending = 0;
  for (const host of hosts) {
    if (host.tagName?.toLowerCase?.() === 'svg') continue;
    if (host.tagName?.toLowerCase?.() === 'img' && host.classList.contains('mermaid-diagram-image')) continue;
    const hasRenderedSvg = findAllElements(host, 'svg').some((svg) => {
      if (svg.closest?.('mjx-container,mjx-math,.MathJax')) return false;
      return !!svg.closest?.('.mermaid,[data-obsidian-wechat-mermaid="true"]');
    });
    const hasRenderedImage = !!host.querySelector('img.mermaid-diagram-image');
    if (!hasRenderedSvg && !hasRenderedImage) {
      pending += 1;
    }
  }
  return pending;
}

/** @param {string} label */
function normalizeReferenceLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** @param {string} rawTarget */
function extractInlineImageTarget(rawTarget) {
  const value = String(rawTarget || '').trim();
  if (!value) return '';
  if (value.startsWith('<')) {
    const endIndex = value.indexOf('>');
    if (endIndex > 1) {
      return value.slice(1, endIndex).trim();
    }
  }
  return value.split(/\s+/)[0] || '';
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
function collectImageTargets(markdown) {
  const source = String(markdown || '');
  /** @type {string[]} */
  const targets = [];
  if (!source || !source.includes('![')) return targets;

  /** @type {Map<string, string>} */
  const referenceTargets = new Map();
  const referenceDefinitionPattern = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>\r\n]+)>|(\S+))/gm;
  let definitionMatch = referenceDefinitionPattern.exec(source);
  while (definitionMatch) {
    const label = normalizeReferenceLabel(definitionMatch[1]);
    const target = String(definitionMatch[2] || definitionMatch[3] || '').trim();
    if (label && target && !referenceTargets.has(label)) {
      referenceTargets.set(label, target);
    }
    definitionMatch = referenceDefinitionPattern.exec(source);
  }

  const inlineImagePattern = /!\[[^\]]*]\(([^)\r\n]+)\)/g;
  let inlineMatch = inlineImagePattern.exec(source);
  while (inlineMatch) {
    targets.push(extractInlineImageTarget(inlineMatch[1]));
    inlineMatch = inlineImagePattern.exec(source);
  }

  const fullReferenceImagePattern = /!\[([^\]]*)]\[([^\]]*)]/g;
  let fullReferenceMatch = fullReferenceImagePattern.exec(source);
  while (fullReferenceMatch) {
    const fallbackLabel = String(fullReferenceMatch[1] || '');
    const refLabel = String(fullReferenceMatch[2] || '');
    const normalizedLabel = normalizeReferenceLabel(refLabel || fallbackLabel);
    targets.push(referenceTargets.get(normalizedLabel) || '');
    fullReferenceMatch = fullReferenceImagePattern.exec(source);
  }

  const shortcutReferenceImagePattern = /!\[([^\]]+)](?![[(])/g;
  let shortcutReferenceMatch = shortcutReferenceImagePattern.exec(source);
  while (shortcutReferenceMatch) {
    const label = normalizeReferenceLabel(shortcutReferenceMatch[1]);
    targets.push(referenceTargets.get(label) || '');
    shortcutReferenceMatch = shortcutReferenceImagePattern.exec(source);
  }

  return targets;
}

/** @param {string} markdown */
function shouldObserveAsyncEmbedWindow(markdown) {
  const source = String(markdown || '');
  if (!source || !source.includes('![')) return false;

  const targets = collectImageTargets(source);
  if (targets.length === 0) {
    // Unknown image syntax: keep conservative short observe window.
    return true;
  }

  for (const item of targets) {
    // collectImageTargets already strips angle brackets via extractInlineImageTarget
    // and referenceDefinitionPattern's capturing groups.
    const target = String(item || '').trim().toLowerCase();
    if (!target) return true;

    // Remote/data images are rendered directly; local-like paths may resolve
    // asynchronously via Obsidian embed pipeline.
    const isRemoteLike = (
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('data:')
    );
    if (!isRemoteLike) return true;
  }

  return false;
}

/**
 * @param {Element | null | undefined} root
 * @param {TripletSettleOptions} [options]
 */
async function waitForTripletDomToSettle(root, options = {}) {
  if (!root) return;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 500;
  const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 16;
  const observeMermaid = options.observeMermaid === true;
  const minObserveMs = Number.isFinite(options.minObserveMs)
    ? Math.max(0, Math.floor(options.minObserveMs))
    : Math.min(48, timeoutMs);
  const mermaidObserveMs = observeMermaid
    ? (
      Number.isFinite(options.mermaidObserveMs)
        ? Math.max(0, Math.floor(options.mermaidObserveMs))
        : Math.min(180, timeoutMs)
    )
    : 0;

  const start = Date.now();
  let unresolved = countUnresolvedImageEmbeds(root);
  let renderedMermaid = observeMermaid ? countRenderedMermaidDiagrams(root) : 0;
  let pendingMermaid = observeMermaid ? countPendingMermaidHosts(root) : 0;
  const initialObserveMs = Math.max(minObserveMs, mermaidObserveMs);

  if (unresolved === 0 && renderedMermaid === 0 && pendingMermaid === 0 && initialObserveMs <= 0) {
    return;
  }

  // Fast path with a short observation window: avoid waiting full settle time
  // while still catching delayed async embed insertion after render.
  if (unresolved === 0 && renderedMermaid === 0 && pendingMermaid === 0 && initialObserveMs > 0) {
    while (Date.now() - start < initialObserveMs) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
      unresolved = countUnresolvedImageEmbeds(root);
      renderedMermaid = observeMermaid ? countRenderedMermaidDiagrams(root) : 0;
      pendingMermaid = observeMermaid ? countPendingMermaidHosts(root) : 0;
      if (unresolved > 0 || renderedMermaid > 0 || pendingMermaid > 0) break;
    }
    if (unresolved === 0 && renderedMermaid === 0 && pendingMermaid === 0) return;
  }

  let stableCount = 0;

  while (Date.now() - start < timeoutMs) {
    unresolved = countUnresolvedImageEmbeds(root);
    renderedMermaid = observeMermaid ? countRenderedMermaidDiagrams(root) : 0;
    pendingMermaid = observeMermaid ? countPendingMermaidHosts(root) : 0;
    const mermaidReady = !observeMermaid || (
      (pendingMermaid === 0 && renderedMermaid > 0)
      || (pendingMermaid === 0 && renderedMermaid === 0 && (Date.now() - start >= mermaidObserveMs))
    );
    if (unresolved === 0 && mermaidReady) {
      stableCount += 1;
      if (stableCount >= 2) return;
    } else {
      stableCount = 0;
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

/**
 * @param {ObsidianRendererOptions} options
 */
async function renderByObsidianMarkdownRenderer({
  app,
  markdown,
  sourcePath,
  targetEl,
  component = null,
  markdownRenderer = getDefaultMarkdownRenderer(),
}) {
  if (!markdownRenderer) {
    throw new Error('Obsidian MarkdownRenderer is not available');
  }

  if (typeof markdownRenderer.renderMarkdown === 'function') {
    await markdownRenderer.renderMarkdown(markdown, targetEl, sourcePath || '', component);
    return;
  }

  if (typeof markdownRenderer.render === 'function') {
    if (!app) throw new Error('Obsidian app instance is required for MarkdownRenderer.render');
    await markdownRenderer.render(app, markdown, targetEl, sourcePath || '', component);
    return;
  }

  throw new Error('Obsidian MarkdownRenderer does not expose renderMarkdown/render');
}

/**
 * @param {TripletRenderOptions & {
 *   settings?: TripletSettingsLike,
 *   serializer?: TripletSerializerLike,
 *   mermaidCodeRenderer?: MermaidCodeRendererLike,
 *   mermaidRasterizer?: MermaidRasterizerLike,
 *   mermaidApi?: unknown,
 *   rasterizeMermaid?: boolean,
 * }} options
 * @returns {Promise<string>}
 */
async function renderObsidianTripletMarkdown({
  app,
  converter,
  markdown,
  sourcePath = '',
  component = null,
  settings = {},
  markdownRenderer = getDefaultMarkdownRenderer(),
  serializer = serializeObsidianRenderedHtml,
  mermaidCodeRenderer = null,
  mermaidRasterizer = null,
  mermaidApi = null,
  rasterizeMermaid = true,
  preserveSvgStyleTags = false,
}) {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    throw new Error('Triplet renderer requires DOM environment');
  }
  if (!converter) {
    throw new Error('Triplet renderer requires converter runtime');
  }

  const container = activeDocument.createElement('div');
  const { markdown: preparedMarkdown, mathFormulas } = preprocessMarkdownForTriplet(markdown, converter);

  const shouldObserveWindow = shouldObserveAsyncEmbedWindow(markdown) || shouldObserveAsyncEmbedWindow(preparedMarkdown);
  const shouldObserveMermaid = shouldObserveMermaidRenderWindow(preparedMarkdown);
  await renderByObsidianMarkdownRenderer({
    app,
    markdown: preparedMarkdown,
    sourcePath,
    targetEl: container,
    component,
    markdownRenderer,
  });

  // Wait for image embeds to settle; MarkdownRenderer may resolve embeds asynchronously.
  await waitForTripletDomToSettle(container, {
    minObserveMs: shouldObserveWindow ? void 0 : 0,
    observeMermaid: shouldObserveMermaid,
  });
  if (typeof mermaidCodeRenderer === 'function') {
    await mermaidCodeRenderer(container, { mermaidApi });
  }
  if (rasterizeMermaid !== false && typeof mermaidRasterizer === 'function') {
    await mermaidRasterizer(container);
  }

  normalizeRenderedDomPunctuation(container, {
    enabled: settings.normalizeChinesePunctuation === true,
  });

  const serializedHtml = serializer({
    root: container,
    converter,
    sourcePath,
    app,
    preRenderedMath: mathFormulas,
    preserveSvgStyleTags,
  });

  return serializedHtml;
}

export {
  neutralizeUnsafeMarkdownLinks,
  neutralizePlainWikilinks,
  normalizeWechatUnsafeTaskListMarkers,
  preprocessMarkdownForTriplet,
  injectHardBreaksForLegacyParity,
  normalizeRenderedDomPunctuation,
  shouldObserveAsyncEmbedWindow,
  shouldObserveMermaidRenderWindow,
  waitForTripletDomToSettle,
  renderByObsidianMarkdownRenderer,
  renderObsidianTripletMarkdown,
};
