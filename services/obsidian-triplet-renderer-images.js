/*
## 核心功能

承接 Obsidian triplet renderer 的图片预处理能力，包括本地 Markdown 图片物化和 image-swipe callout 转换。

## 输入

接收 Markdown 文本、图片路径、图片 callout 块和相关行级解析上下文。

## 输出

输出 `getImageCaptionFromPath`、`materializeLocalMarkdownImages`、`preprocessImageSwipeCallouts`，供 triplet renderer 在进入 Obsidian MarkdownRenderer 前完成图片兼容预处理。

## 定位

位于 services/，属于 triplet renderer 的图片预处理子模块；保持主 renderer 文件聚焦渲染流程。

## 依赖

仅依赖本文件内的 Markdown 行级解析 helper，无跨层运行时依赖。

## 维护规则

- 修改图片预处理行为后同步检查 `tests/obsidian_triplet_renderer.test.js`。
- 保持本模块只处理渲染前图片 Markdown 归一化，不接管 DOM 序列化或 WeChat 上传逻辑。
*/

/**
 * @typedef {{ marker: '`' | '~', length: number }} FenceState
 * @typedef {[number, number]} TextRange
 * @typedef {{ rawTarget: string, endIndex: number }} MarkdownImageTarget
 * @typedef {{ src: string, alt: string }} ImageSwipeImage
 * @typedef {{ type: string, optionText: string }} ImageSwipeCallout
 */

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

const IMAGE_SWIPE_DEFAULT_WARNING = '此类图片可能引发不适，向左滑动查看';
const IMAGE_SWIPE_DEFAULT_HINT = '左右滑动查看图片';
const IMAGE_SWIPE_TYPES = new Set(['image-swipe', 'image-sensitive']);

function encodeImageSwipeValue(value) {
  return encodeURIComponent(String(value || ''));
}

/** @param {string} value */
function escapeImageSwipeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {string} imagePath */
function getImageCaptionFromPath(imagePath) {
  const value = String(imagePath || '').trim();
  if (!value) return '';
  const filename = value.split('/').pop().split('\\').pop() || value;
  return filename.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)$/i, '');
}

/** @param {string} value */
function hasExplicitUrlProtocol(value) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(String(value || '').trim());
}

/** @param {string} src */
function shouldMaterializeLocalMarkdownImage(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  if (/^(?:https?:)?\/\//i.test(value)) return false;
  if (/^data:image\//i.test(value)) return false;
  return !hasExplicitUrlProtocol(value);
}

/** @param {string} src */
function encodeMarkdownImageSrc(src) {
  const value = String(src || '').trim();
  try {
    return encodeURI(decodeURI(value));
  } catch {
    return encodeURI(value);
  }
}

/**
 * @param {string} line
 * @returns {TextRange[]}
 */
function findInlineCodeRanges(line) {
  const value = String(line || '');
  /** @type {TextRange[]} */
  const ranges = [];
  let index = 0;

  while (index < value.length) {
    if (value[index] !== '`') {
      index += 1;
      continue;
    }

    let markerLength = 1;
    while (value[index + markerLength] === '`') {
      markerLength += 1;
    }

    const marker = '`'.repeat(markerLength);
    const closeIndex = value.indexOf(marker, index + markerLength);
    if (closeIndex === -1) {
      index += markerLength;
      continue;
    }

    ranges.push([index, closeIndex + markerLength]);
    index = closeIndex + markerLength;
  }

  return ranges;
}

/**
 * @param {string} line
 * @returns {TextRange[]}
 */
function findHtmlTagRanges(line) {
  const value = String(line || '');
  /** @type {TextRange[]} */
  const ranges = [];
  let index = 0;

  while (index < value.length) {
    const start = value.indexOf('<', index);
    if (start === -1) break;
    if (!/[A-Za-z/!?]/.test(value[start + 1] || '')) {
      index = start + 1;
      continue;
    }

    const end = value.indexOf('>', start + 1);
    if (end === -1) break;
    ranges.push([start, end + 1]);
    index = end + 1;
  }

  return ranges;
}

/**
 * @param {string} line
 * @returns {TextRange[]}
 */
function findHtmlElementContentRanges(line) {
  const value = String(line || '');
  /** @type {TextRange[]} */
  const ranges = [];
  const openTagPattern = /<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g;
  let match;

  while ((match = openTagPattern.exec(value)) !== null) {
    const rawTag = match[0] || '';
    if (/\/\s*>$/.test(rawTag)) continue;

    const tagName = String(match[1] || '').toLowerCase();
    const closePattern = new RegExp(`</${tagName}\\s*>`, 'i');
    const rest = value.slice(openTagPattern.lastIndex);
    const closeMatch = closePattern.exec(rest);
    if (!closeMatch) continue;

    ranges.push([match.index, openTagPattern.lastIndex + closeMatch.index + closeMatch[0].length]);
  }

  return ranges;
}

/**
 * @param {string} line
 * @returns {TextRange[]}
 */
function findMarkdownLinkLabelRanges(line) {
  const value = String(line || '');
  /** @type {TextRange[]} */
  const ranges = [];

  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== '[' || value[i - 1] === '!' || value[i - 1] === '\\') continue;

    let depth = 1;
    let cursor = i + 1;
    while (cursor < value.length) {
      const char = value[cursor];
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (char === '[') {
        depth += 1;
      } else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          if (value[cursor + 1] === '(') {
            ranges.push([i, cursor + 1]);
          }
          break;
        }
      }
      cursor += 1;
    }
  }

  return ranges;
}

/**
 * @param {number} offset
 * @param {TextRange[]} ranges
 */
function isOffsetInRanges(offset, ranges) {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

const HTML_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** @param {string} tagName */
function isHtmlVoidTag(tagName) {
  return HTML_VOID_TAGS.has(String(tagName || '').toLowerCase());
}

/**
 * @param {string} value
 * @param {number} startIndex
 */
function findClosingMarkdownBracket(value, startIndex) {
  let index = startIndex;
  while (index < value.length) {
    const char = value[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === ']') return index;
    index += 1;
  }
  return -1;
}

/**
 * @param {string} value
 * @param {number} startIndex
 */
function parseQuotedMarkdownTitle(value, startIndex) {
  const quote = value[startIndex];
  if (quote !== '"' && quote !== "'") return null;

  let index = startIndex + 1;
  while (index < value.length) {
    const char = value[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }

  return null;
}

/**
 * @param {string} value
 * @param {number} startIndex
 */
function parseParenthesizedMarkdownTitle(value, startIndex) {
  if (value[startIndex] !== '(') return null;

  let depth = 1;
  let index = startIndex + 1;
  while (index < value.length) {
    const char = value[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }

  return null;
}

/**
 * @param {string} value
 * @param {number} startIndex
 */
function parseMarkdownImageTitleAndClose(value, startIndex) {
  let index = startIndex;
  while (/\s/.test(value[index] || '')) index += 1;
  if (value[index] === ')') return index + 1;

  const titleEnd = value[index] === '('
    ? parseParenthesizedMarkdownTitle(value, index)
    : parseQuotedMarkdownTitle(value, index);
  if (!titleEnd) return null;

  index = titleEnd;
  while (/\s/.test(value[index] || '')) index += 1;
  return value[index] === ')' ? index + 1 : null;
}

/**
 * @param {string} value
 * @param {number} openParenIndex
 * @returns {MarkdownImageTarget | null}
 */
function parseMarkdownImageTargetAt(value, openParenIndex) {
  let index = openParenIndex + 1;
  while (/\s/.test(value[index] || '')) index += 1;

  if (value[index] === '<') {
    const targetStart = index + 1;
    index += 1;
    while (index < value.length) {
      if (value[index] === '\\') {
        index += 2;
        continue;
      }
      if (value[index] === '>') {
        const target = value.slice(targetStart, index);
        index += 1;
        const endIndex = parseMarkdownImageTitleAndClose(value, index);
        if (!endIndex) return null;
        return { rawTarget: target, endIndex };
      }
      index += 1;
    }
    return null;
  }

  const targetStart = index;
  let depth = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (/\s/.test(char) && depth === 0) {
      const target = value.slice(targetStart, index);
      const endIndex = parseMarkdownImageTitleAndClose(value, index);
      if (!endIndex) return null;
      return { rawTarget: target, endIndex };
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      if (depth > 0) {
        depth -= 1;
      } else {
        return {
          rawTarget: value.slice(targetStart, index),
          endIndex: index + 1,
        };
      }
    }
    index += 1;
  }

  return null;
}

/**
 * @param {string} line
 * @param {TextRange[]} protectedRanges
 * @returns {string}
 */
function replaceLocalMarkdownImagesInLine(line, protectedRanges) {
  const value = String(line || '');
  let output = '';
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf('![', cursor);
    if (start === -1) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, start);

    const closeBracketIndex = findClosingMarkdownBracket(value, start + 2);
    const openParenIndex = closeBracketIndex >= 0 ? closeBracketIndex + 1 : -1;
    const parsedTarget = openParenIndex >= 0 && value[openParenIndex] === '('
      ? parseMarkdownImageTargetAt(value, openParenIndex)
      : null;
    if (!parsedTarget) {
      output += value[start];
      cursor = start + 1;
      continue;
    }

    const rawAlt = value.slice(start + 2, closeBracketIndex);
    const match = value.slice(start, parsedTarget.endIndex);
    if (
      isOffsetInRanges(start, protectedRanges)
      || value[start - 1] === '['
      || value[start - 1] === '\\'
    ) {
      output += match;
      cursor = parsedTarget.endIndex;
      continue;
    }

    const src = parseImageSwipeMarkdownTarget(parsedTarget.rawTarget);
    if (!shouldMaterializeLocalMarkdownImage(src)) {
      output += match;
      cursor = parsedTarget.endIndex;
      continue;
    }

    output += `<img src="${escapeImageSwipeHtmlAttr(encodeMarkdownImageSrc(src))}" alt="${escapeImageSwipeHtmlAttr(String(rawAlt || '').trim())}">`;
    cursor = parsedTarget.endIndex;
  }

  return output;
}

/** @param {string} rawTarget */
function parseImageSwipeMarkdownTarget(rawTarget) {
  const value = String(rawTarget || '').trim();
  if (!value) return '';

  if (value.startsWith('<')) {
    const endIndex = value.indexOf('>');
    if (endIndex > 1) return value.slice(1, endIndex).trim();
  }

  const titledMatch = value.match(/^(.+?)\s+(['"]).*\2\s*$/);
  return (titledMatch ? titledMatch[1] : value).trim();
}

/**
 * @param {string} value
 * @returns {ImageSwipeImage | null}
 */
function parseImageSwipeBareRemoteUrlLine(value) {
  const match = String(value || '').trim().match(/^<?((?:https?:)?\/\/[^\s<>]+)>?$/i);
  if (!match) return null;
  return {
    src: encodeURI(String(match[1] || '')),
    alt: '',
  };
}

/** @param {string} src */
function isImageSwipeRemoteSrc(src) {
  return /^(?:https?:)?\/\//i.test(String(src || '').trim());
}

/** @param {string} alt */
function extractImageSwipeWidthHint(alt) {
  const match = String(alt || '').match(/\|\s*(\d{2,4})(?:x\d+)?\s*$/i);
  return match ? match[1] : '';
}

/** @param {ImageSwipeImage} image */
function renderImageSwipeImgTag(image) {
  const attrs = [
    `src="${escapeImageSwipeHtmlAttr(image.src)}"`,
    `alt="${escapeImageSwipeHtmlAttr(image.alt)}"`,
  ];
  const width = extractImageSwipeWidthHint(image.alt);
  if (width) attrs.push(`width="${width}"`);
  if (isImageSwipeRemoteSrc(image.src)) attrs.push('referrerpolicy="no-referrer"');
  return `<img ${attrs.join(' ')}>`;
}

/**
 * @param {string} line
 * @returns {ImageSwipeImage | null}
 */
function parseImageSwipeMarkdownLine(line) {
  const value = String(line || '').trim();
  const bareRemoteImage = parseImageSwipeBareRemoteUrlLine(value);
  if (bareRemoteImage) return bareRemoteImage;

  const wikiMatch = value.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?]]$/);
  if (wikiMatch) {
    return {
      src: encodeURI(String(wikiMatch[1] || '').trim()),
      alt: String(wikiMatch[2] || '').trim(),
    };
  }

  const markdownMatch = value.match(/^!\[([^\]]*)]\(([\s\S]+)\)$/);
  if (!markdownMatch) return null;
  const src = parseImageSwipeMarkdownTarget(markdownMatch[2]);
  if (!src) return null;

  return {
    src: encodeURI(src),
    alt: String(markdownMatch[1] || '').trim(),
  };
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function materializeLocalMarkdownImages(markdown) {
  const lines = String(markdown || '').split('\n');
  /** @type {string[]} */
  const output = [];
  let fenceState = null;
  let inMathFence = false;
  let rawHtmlBlockTag = '';
  let inHtmlComment = false;

  for (const line of lines) {
    const fenceDelimiter = parseFencedBlockDelimiter(line);
    if (!inMathFence && fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      output.push(line);
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(line)) {
      inMathFence = !inMathFence;
      output.push(line);
      continue;
    }

    if (fenceState || inMathFence) {
      output.push(line);
      continue;
    }

    if (inHtmlComment) {
      output.push(line);
      if (String(line || '').includes('-->')) {
        inHtmlComment = false;
      }
      continue;
    }

    if (rawHtmlBlockTag) {
      output.push(line);
      if (new RegExp(`</${rawHtmlBlockTag}\\s*>`, 'i').test(String(line || ''))) {
        rawHtmlBlockTag = '';
      }
      continue;
    }

    if (/^(?: {4}|\t)/.test(String(line || ''))) {
      output.push(line);
      continue;
    }

    if (/^\s{0,3}<!--/.test(String(line || '')) && !String(line || '').includes('-->')) {
      inHtmlComment = true;
      output.push(line);
      continue;
    }

    const rawBlockMatch = String(line || '').match(/^\s{0,3}<([A-Za-z][\w:-]*)(?:\s[^<>]*)?>\s*$/);
    const rawBlockTag = String(rawBlockMatch?.[1] || '').toLowerCase();
    const isSelfClosingRawBlock = /\/\s*>\s*$/.test(String(line || ''));
    if (
      rawBlockMatch
      && !isHtmlVoidTag(rawBlockTag)
      && !isSelfClosingRawBlock
      && !new RegExp(`</${rawBlockTag}\\s*>`, 'i').test(String(line || ''))
    ) {
      rawHtmlBlockTag = rawBlockTag;
      output.push(line);
      continue;
    }

    const protectedRanges = [
      ...findInlineCodeRanges(line),
      ...findHtmlTagRanges(line),
      ...findHtmlElementContentRanges(line),
      ...findMarkdownLinkLabelRanges(line),
    ];

    output.push(replaceLocalMarkdownImagesInLine(line, protectedRanges));
  }

  return output.join('\n');
}

/**
 * @param {string[]} lines
 * @param {number} imageIndex
 * @returns {string}
 */
function extractImageSwipeItalicCaption(lines, imageIndex) {
  for (let i = imageIndex + 1; i < lines.length; i += 1) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (parseImageSwipeMarkdownLine(line)) return '';
    const match = line.match(/^(?:\*|_)(.+?)(?:\*|_)$/);
    return match ? String(match[1] || '').trim() : '';
  }
  return '';
}

/**
 * @param {string[]} blockLines
 * @returns {ImageSwipeImage[]}
 */
function collectImageSwipeImages(blockLines) {
  /** @type {ImageSwipeImage[]} */
  const images = [];
  for (let i = 0; i < blockLines.length; i += 1) {
    const image = parseImageSwipeMarkdownLine(blockLines[i]);
    if (!image) continue;
    const caption = image.alt || extractImageSwipeItalicCaption(blockLines, i);
    images.push({ ...image, alt: caption });
  }
  return images;
}

/** @param {string[]} blockLines */
function hasRemoteImageSwipeImage(blockLines) {
  return collectImageSwipeImages(blockLines).some((image) => isImageSwipeRemoteSrc(image.src));
}

/** @param {string} line */
function normalizeBareRemoteImageSwipeQuoteLine(line) {
  const match = String(line || '').match(/^(\s{0,3}>\s?)([\s\S]*)$/);
  if (!match) return line;
  const image = parseImageSwipeBareRemoteUrlLine(match[2]);
  if (!image) return line;
  return `${match[1]}![](${image.src})`;
}

/**
 * @param {string} type
 * @param {string[]} blockLines
 * @param {string} optionText
 * @returns {string[] | null}
 */
function renderImageSwipeHtmlBlock(type, blockLines, optionText) {
  const images = collectImageSwipeImages(blockLines);
  if (!images.length) return null;

  const attrs = [
    'data-owc-image-swipe="1"',
    `data-owc-image-swipe-type="${type}"`,
  ];
  if (type === 'image-sensitive') {
    attrs.push(`data-owc-image-swipe-warning="${escapeImageSwipeHtmlAttr(encodeImageSwipeValue(optionText || IMAGE_SWIPE_DEFAULT_WARNING))}"`);
  } else {
    attrs.push(`data-owc-image-swipe-hint="${escapeImageSwipeHtmlAttr(encodeImageSwipeValue(optionText || IMAGE_SWIPE_DEFAULT_HINT))}"`);
  }

  return [
    `<section ${attrs.join(' ')}>`,
    ...images.map((image) => renderImageSwipeImgTag(image)),
    '</section>',
  ];
}

/**
 * @param {string} line
 * @returns {ImageSwipeCallout | null}
 */
function parseImageSwipeCalloutOpen(line) {
  const match = String(line || '').match(/^\s{0,3}>\s?\[!\s*([a-z-]+)\s*](?:[+-])?\s*(.*)$/i);
  if (!match) return null;
  const type = String(match[1] || '').toLowerCase();
  if (!IMAGE_SWIPE_TYPES.has(type)) return null;
  return {
    type,
    optionText: String(match[2] || '').trim(),
  };
}

/** @param {string} line */
function stripSingleQuotePrefix(line) {
  return String(line || '').replace(/^\s{0,3}>\s?/, '');
}

/**
 * @param {string} markdown
 * @returns {string}
 */
function preprocessImageSwipeCallouts(markdown) {
  const lines = String(markdown || '').split('\n');
  /** @type {string[]} */
  const output = [];
  let fenceState = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length;) {
    const fenceDelimiter = parseFencedBlockDelimiter(lines[i]);
    if (fenceDelimiter) {
      if (!fenceState) {
        fenceState = fenceDelimiter;
      } else if (
        fenceDelimiter.marker === fenceState.marker &&
        fenceDelimiter.length >= fenceState.length
      ) {
        fenceState = null;
      }
      output.push(lines[i]);
      i += 1;
      continue;
    }

    if (!fenceState && isMathFenceDelimiter(lines[i])) {
      inMathFence = !inMathFence;
      output.push(lines[i]);
      i += 1;
      continue;
    }

    if (fenceState || inMathFence) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const callout = parseImageSwipeCalloutOpen(lines[i]);
    if (!callout) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const originalLines = [lines[i]];
    const blockLines = [];
    i += 1;
    while (i < lines.length && isQuoteLine(lines[i])) {
      originalLines.push(lines[i]);
      blockLines.push(stripSingleQuotePrefix(lines[i]));
      i += 1;
    }

    if (hasRemoteImageSwipeImage(blockLines)) {
      output.push(...originalLines.map((line, index) => (
        index === 0 ? line : normalizeBareRemoteImageSwipeQuoteLine(line)
      )));
      continue;
    }

    const rendered = renderImageSwipeHtmlBlock(callout.type, blockLines, callout.optionText);
    if (rendered) {
      output.push(...rendered);
    } else {
      output.push(...originalLines);
    }
  }

  return output.join('\n');
}

export {
  getImageCaptionFromPath,
  materializeLocalMarkdownImages,
  preprocessImageSwipeCallouts,
};
