/*
## 核心功能

实现渲染管线相关的 native renderer 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `isSafeRawImageSrc`、`normalizeWechatUnsafeTaskListMarkersForNative`、`normalizeAdjacentMarkdownBlocks`、`normalizeAdjacentMarkdownBlockHeadings`、`shouldSeparateAdjacentMarkdownBlocks`、`preprocessMarkdownForNative`、`cleanupNativeRenderedHtml`、`canUseNativePreviewFastPath`，供视图层生成预览或发布 HTML。

## 定位

位于 services/，属于渲染服务层；避免把渲染细节堆回 input.js。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { createHtmlContainer } from './dom-utils.js';

/**
 * @typedef {{ convert: (markdown: string) => Promise<string> | string, updateSourcePath?: (sourcePath: string) => void }} NativeConverterLike
 */

/**
 * @param {unknown} src
 * @returns {boolean}
 */
export function isSafeRawImageSrc(src) {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('#')) return false;

  const safeProtocols = ['http:', 'https:', 'data:', 'app:', 'capacitor:', 'obsidian:'];

  try {
    const parsed = new URL(trimmed);
    return safeProtocols.includes(parsed.protocol);
  } catch {
    // Raw HTML <img src="relative/path"> bypasses converter path resolution and
    // frequently becomes broken icons in WeChat preview, so native path removes it.
    return false;
  }
}

/**
 * @param {unknown} markdown
 * @returns {string}
 */
export function normalizeWechatUnsafeTaskListMarkersForNative(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  const lines = source.split('\n');
  let fence = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || '').trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker, length };
      } else if (marker === fence.marker && length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (!fence && /^\$\$\s*$/.test(trimmed)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fence || inMathFence) continue;

    lines[i] = line.replace(
      /^(\s*)([-*+])\s+\[([ xX])\]\s+/,
      (_match, indent, marker, state) =>
        `${indent}${marker} ${String(state || '').trim().toLowerCase() === 'x' ? '☑' : '☐'} `,
    );
  }

  return lines.join('\n');
}

/**
 * Standalone blocks (images, closing HTML tags, single-line HTML containers, quotes before headings)
 * must be separated from adjacent markdown blocks/inlines by an empty line in CommonMark.
 * Otherwise, the unclosed HTML block swallows subsequent lines, breaking inline parsing (bold, links, etc.).
 * @param {unknown} markdown
 * @returns {string}
 */
export function normalizeAdjacentMarkdownBlocks(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  const lines = source.split('\n');
  /** @type {string[]} */
  const output = [];
  let fence = null;
  let inMathFence = false;
  let inHtmlComment = false;
  let rawHtmlBlockTag = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || '').trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (inHtmlComment) {
      output.push(line);
      if (trimmed.includes('-->')) inHtmlComment = false;
      continue;
    }

    if (rawHtmlBlockTag) {
      output.push(line);
      if (new RegExp(`</${rawHtmlBlockTag}\\s*>`, 'i').test(trimmed)) rawHtmlBlockTag = '';
      continue;
    }

    if (/^\s{0,3}<!--/.test(trimmed) && !trimmed.includes('-->')) {
      inHtmlComment = true;
      output.push(line);
      continue;
    }

    const rawBlockMatch = trimmed.match(/^<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>\s*$/);
    const rawBlockTag = String(rawBlockMatch?.[1] || '').toLowerCase();
    const isSelfClosing = /\/\s*>\s*$/.test(trimmed);
    if (
      rawBlockMatch
      && (rawBlockTag === 'pre' || rawBlockTag === 'code' || rawBlockTag === 'script' || rawBlockTag === 'style')
      && !isSelfClosing
      && !new RegExp(`</${rawBlockTag}\\s*>`, 'i').test(trimmed)
    ) {
      rawHtmlBlockTag = rawBlockTag;
      output.push(line);
      continue;
    }

    const inSkippedBlock = !!fence || inMathFence;

    if (!inSkippedBlock && shouldSeparateAdjacentMarkdownBlocks(line, lines[i + 1])) {
      output.push(line, '');
    } else {
      output.push(line);
    }

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker, length };
      } else if (marker === fence.marker && length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (!fence && /^\$\$\s*$/.test(trimmed)) {
      inMathFence = !inMathFence;
    }
  }

  return output.join('\n');
}

export const normalizeAdjacentMarkdownBlockHeadings = normalizeAdjacentMarkdownBlocks;

/**
 * @param {unknown} line
 * @returns {boolean}
 */
function isImageLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  return /^<img\b[^>]*>\s*$/i.test(trimmed)
    || /^!\[\[[^[\]\r\n]+]]\s*$/.test(trimmed)
    || /^!\[[^\]\r\n]*]\([^) \r\n]+(?:\s+"[^"]*")?\)\s*$/.test(trimmed);
}

/**
 * @param {unknown} line
 * @param {unknown} nextLine
 * @returns {boolean}
 */
export function shouldSeparateAdjacentMarkdownBlocks(line, nextLine) {
  const current = String(line || '').trim();
  const next = String(nextLine || '').trim();
  if (!current || !next) return false;

  // 1. Heading boundary: quotes followed immediately by heading
  if (/^#{1,6}\s+\S/.test(next)) {
    if (/^>\s*$/.test(current) || /^>\s?.+/.test(current)) return true;
  }

  // 2. Standalone image lines: <img ...>, ![[...]], ![...](...)
  // Only separate when next line is NOT another image (i.e. text/heading),
  // preserving tight stacking for adjacent images.
  if (isImageLine(current)) {
    if (!isImageLine(next)) {
      return true;
    }
    return false;
  }

  // 3. Block-level closing HTML tag (e.g. </section>, </div>, </center>, </figure>, </details>, </blockquote>)
  const isBlockClosingTag = /^<\/(?:section|div|figure|blockquote|table|details|center|p|h[1-6])>\s*$/i.test(current);
  if (isBlockClosingTag) {
    const nextIsClosingTag = /^<\/(?:section|div|figure|blockquote|table|details|center|p|h[1-6])>\s*$/i.test(next);
    if (!nextIsClosingTag) return true;
  }

  // 4. Single-line self-contained HTML block elements (e.g. <center>...</center>, <details>...</details>)
  const isSingleLineHtmlBlock = /^<(?:center|details|summary|div|section|table|figure)\b[^>]*>.*?<\/(?:center|details|summary|div|section|table|figure)>\s*$/i.test(current);
  if (isSingleLineHtmlBlock) {
    return true;
  }

  return false;
}

/**
 * @param {unknown} markdown
 * @returns {string}
 */
export function preprocessMarkdownForNative(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return '';

  let output = markdown;
  output = normalizeWechatUnsafeTaskListMarkersForNative(output);
  output = normalizeAdjacentMarkdownBlockHeadings(output);

  // Remove dangerous raw HTML blocks before markdown-it parsing so they do not
  // poison following markdown lines as raw HTML context.
  output = output.replace(/<(script|iframe|object|embed|form|input|button|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '\n');
  output = output.replace(/<(script|iframe|object|embed|form|input|button|style)\b[^>]*\/?>/gi, '\n');

  // Handle raw <img> tags separately to avoid broken placeholder images.
  output = output.replace(/<img\b[^>]*>/gi, (tag) => {
    const hasEventHandler = /\son\w+\s*=/.test(tag);
    const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = srcMatch ? (srcMatch[1] || srcMatch[2] || srcMatch[3] || '') : '';

    if (hasEventHandler || !isSafeRawImageSrc(src)) {
      return '\n';
    }

    return tag;
  });

  return output;
}

/**
 * @param {unknown} html
 * @returns {string}
 */
export function cleanupNativeRenderedHtml(html) {
  if (typeof html !== 'string' || html.length === 0) {
    return typeof html === 'string' ? html : '';
  }

  const container = createHtmlContainer('div', html);
  if (!container) return html;

  // Remove orphan raw <img> tags that are not generated by the markdown image renderer.
  Array.from(container.querySelectorAll('img')).forEach((img) => {
    const inFigure = !!img.closest('figure');
    const isMathImage = img.classList.contains('math-formula-image');
    if (!inFigure && !isMathImage) {
      img.remove();
    }
  });

  return container.innerHTML;
}

/**
 * @param {unknown} markdown
 * @returns {string[]}
 */
function extractInlineImageTargets(markdown) {
  const source = String(markdown || '');
  /** @type {string[]} */
  const targets = [];
  if (!source || !source.includes('![')) return targets;

  const inlineImagePattern = /!\[[^\]]*]\(([^)\r\n]+)\)/g;
  let match = inlineImagePattern.exec(source);
  while (match) {
    const rawTarget = String(match[1] || '').trim();
    const target = rawTarget.startsWith('<')
      ? rawTarget.slice(1, rawTarget.indexOf('>') > 0 ? rawTarget.indexOf('>') : undefined).trim()
      : rawTarget.split(/\s+/)[0].trim();
    targets.push(target);
    match = inlineImagePattern.exec(source);
  }

  return targets;
}

/**
 * @param {unknown} markdown
 * @returns {boolean}
 */
export function canUseNativePreviewFastPath(markdown) {
  const source = String(markdown || '');
  if (!source.trim()) return false;

  if (/^\s{0,3}>\s?\[!\s*(?:image-swipe|image-sensitive)\s*](?:[+-])?/im.test(source)) return false;
  if (source.includes('![[')) return false;
  if (/^\s{0,3}(?:`{3,}|~{3,})\s*mermaid\b/im.test(source)) return false;
  if (/^\s*\$\$\s*$/m.test(source) || /(^|[^\\])\$[^$\n]+\$/m.test(source)) return false;

  const targets = extractInlineImageTargets(source);
  if (source.includes('![') && targets.length === 0) return false;
  return targets.every((target) => /^(https?:\/\/|data:image\/)/i.test(target));
}

/**
 * @param {{ converter: NativeConverterLike | unknown, markdown: unknown, sourcePath?: string }} options
 * @returns {Promise<string>}
 */
export async function renderNativeMarkdown({
  converter,
  markdown,
  sourcePath = '',
}) {
  if (!converter || typeof converter.convert !== 'function') {
    throw new Error('Native converter is not ready');
  }
  const nativeConverter = /** @type {NativeConverterLike} */ (converter);

  if (typeof nativeConverter.updateSourcePath === 'function') {
    nativeConverter.updateSourcePath(sourcePath);
  }

  const preprocessed = preprocessMarkdownForNative(markdown);
  const html = await nativeConverter.convert(preprocessed);
  return cleanupNativeRenderedHtml(html);
}
