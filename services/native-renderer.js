/*
## 核心功能

实现渲染管线相关的 native renderer 能力，服务预览、复制和发布一致性。

## 输入

接收 Markdown 源、Obsidian 渲染上下文、DOM 容器、渲染选项和转换器依赖。

## 输出

输出 `isSafeRawImageSrc`、`normalizeWechatUnsafeTaskListMarkersForNative`、`normalizeAdjacentMarkdownBlockHeadings`、`preprocessMarkdownForNative`、`cleanupNativeRenderedHtml`、`canUseNativePreviewFastPath`，供视图层生成预览或发布 HTML。

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
 * Some Obsidian-rendered embed/callout HTML blocks are generated before a
 * following markdown heading. If the heading touches the previous block, the
 * markdown parser treats it as paragraph text. Add a block boundary only for
 * known block-level endings.
 * @param {unknown} markdown
 * @returns {string}
 */
export function normalizeAdjacentMarkdownBlockHeadings(markdown) {
  const source = String(markdown || '');
  if (!source) return source;

  const lines = source.split('\n');
  /** @type {string[]} */
  const output = [];
  let fence = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || '').trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    const inSkippedBlock = !!fence || inMathFence;

    if (!inSkippedBlock && shouldSeparateFollowingHeading(line, lines[i + 1])) {
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

/**
 * @param {unknown} line
 * @param {unknown} nextLine
 * @returns {boolean}
 */
function shouldSeparateFollowingHeading(line, nextLine) {
  const current = String(line || '').trim();
  const next = String(nextLine || '');
  if (!current || !/^#{1,6}\s+\S/.test(next)) return false;

  if (/<\/(?:figure|blockquote|section|div)>\s*$/i.test(current)) return true;
  if (/^!\[\[[^[\]\r\n]+]]\s*$/.test(current)) return true;
  if (/^!\[[^\]\r\n]*]\([^) \r\n]+(?:\s+"[^"]*")?\)\s*$/.test(current)) return true;
  if (/^>\s*$/.test(current)) return true;
  if (/^>\s?.+/.test(current)) return true;

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
