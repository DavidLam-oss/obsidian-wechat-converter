/*
## 核心功能

实现飞书云文档同步链路的 feishu markdown processor 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `stripYamlFrontmatter`、`parseYamlTitle`、`convertWikilinks`、`convertObsidianImageSyntax`、`extractImagesFromMarkdown`、`getImageFileNameFromSrc`、`stripMarkdownDestination`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// services/feishu-markdown-processor.js
//
// Pure helpers for processing Obsidian Markdown for Feishu Cloud Documents.
// Handles YAML parsing & stripping, Wikilinks lookup conversion, and image extraction.
// No DOM, no Obsidian API, no side effects.

/**
 * @typedef {{ title: string, url: string }} FeishuHistoryLinkLike
 * @typedef {{ originalSrc: string, path: string, fileName: string, isRemote: boolean, sizeHint?: { width: number, height: number | null } | null }} FeishuMarkdownImageLike
 */

/**
 * Strips YAML frontmatter block from the beginning of the Markdown content.
 * @param {string} markdown
 * @returns {string}
 */
function stripYamlFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

/**
 * Parses the YAML frontmatter and extracts the title if present.
 * @param {string} markdown
 * @returns {string}
 */
function parseYamlTitle(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return '';
  const yamlText = match[1];
  const lines = yamlText.split('\n');
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index > 0) {
      const key = line.substring(0, index).trim();
      if (key === 'title') {
        const value = line.substring(index + 1).trim();
        return value.replace(/^['"]|['"]$/g, ''); // strip outer quotes
      }
    }
  }
  return '';
}

/**
 * Converts Obsidian wiki links [[Note Name]] or [[Note Name|Alias]] into standard
 * Markdown hyperlinks if they match a previously uploaded document in history.
 * Otherwise, it simplifies them to plain text.
 * @param {string} markdown
 * @param {Array<{ title: string, url: string }>} uploadHistory
 * @returns {string}
 */
function convertWikilinks(markdown, uploadHistory = []) {
  const source = String(markdown || '');
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let result = '';
  let lastIndex = 0;
  let match = pattern.exec(source);
  while (match) {
    const matchText = String(match[0] || '');
    const noteName = String(match[1] || '');
    const alias = String(match[2] || '');
    const offset = match.index;
    result += source.slice(lastIndex, offset);
    if (offset > 0 && source[offset - 1] === '!') {
      result += matchText;
      lastIndex = offset + matchText.length;
      match = pattern.exec(source);
      continue;
    }
    const cleanNoteName = noteName.trim();
    const displayName = (alias || noteName).trim();
    
    // Search in the Feishu sync history
    const historyItem = (uploadHistory || []).find((x) => {
      if (!x || !x.title) return false;
      return x.title === cleanNoteName;
    });

    if (historyItem && historyItem.url) {
      result += `[${displayName}](${historyItem.url})`;
    } else {
      result += displayName;
    }
    lastIndex = offset + matchText.length;
    match = pattern.exec(source);
  }
  return result + source.slice(lastIndex);
}

/**
 * Converts Obsidian wiki image embeds ![[image.png]] or ![[image.png|alt]]
 * into standard Markdown image references.
 * @param {string} markdown
 * @returns {string}
 */
function convertObsidianImageSyntax(markdown) {
  const source = String(markdown || '');
  const pattern = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let result = '';
  let lastIndex = 0;
  let match = pattern.exec(source);
  while (match) {
    const matchText = String(match[0] || '');
    const fileName = String(match[1] || '');
    const altText = String(match[2] || '');
    const offset = match.index;
    result += source.slice(lastIndex, offset);
    if (!fileName) {
      result += matchText;
      lastIndex = offset + matchText.length;
      match = pattern.exec(source);
      continue;
    }
    const cleanFileName = fileName.trim();
    const alt = getWikiImageAltText(altText, cleanFileName);
    const encodedFileName = encodeURI(cleanFileName);
    result += `![${alt}](${encodedFileName})`;
    lastIndex = offset + matchText.length;
    match = pattern.exec(source);
  }
  return result + source.slice(lastIndex);
}

/**
 * @param {unknown} rawAltText
 * @param {string} fallback
 * @returns {string}
 */
function getWikiImageAltText(rawAltText, fallback) {
  const raw = String(rawAltText || '').trim();
  if (!raw) return fallback;
  let parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && isLikelyWikiImageSizeHint(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  return parts.join('|').trim() || fallback;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isLikelyWikiImageSizeHint(value) {
  return /^\d+(?:\s*x\s*\d+)?$/i.test(String(value || '').trim());
}

/**
 * @param {unknown} value
 * @returns {{ width: number, height: number | null } | null}
 */
function parseImageSizeHint(value) {
  const match = String(value || '').trim().match(/^(\d+)(?:\s*x\s*(\d+))?$/i);
  if (!match) return null;
  const width = Number(match[1] || 0);
  const height = match[2] ? Number(match[2]) : null;
  if (!Number.isFinite(width) || width <= 0) return null;
  if (height !== null && (!Number.isFinite(height) || height <= 0)) return null;
  return { width, height };
}

/**
 * @param {unknown} altText
 * @returns {{ width: number, height: number | null } | null}
 */
function extractSizeHintFromAltText(altText) {
  const raw = String(altText || '').trim();
  if (!raw) return null;
  if (!raw.includes('|')) return parseImageSizeHint(raw);
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parseImageSizeHint(parts[parts.length - 1]);
}

/**
 * @param {string} src
 * @returns {string}
 */
function getImageFileNameFromSrc(src) {
  const value = String(src || '');
  const dataMatch = value.match(/^data:image\/([a-z0-9.+-]+);base64,/i);
  if (dataMatch) {
    const ext = dataMatch[1].replace(/^jpeg$/i, 'jpg').toLowerCase();
    return `image.${ext}`;
  }
  return value.split('/').pop() || value;
}

/**
 * @param {unknown} rawDestination
 * @returns {string}
 */
function stripMarkdownDestination(rawDestination) {
  const raw = String(rawDestination || '').trim();
  if (raw.startsWith('<')) {
    const end = raw.indexOf('>');
    if (end > 0) return raw.slice(1, end).trim();
  }
  return raw.replace(/\\([()])/g, '$1').trim();
}

/**
 * Extracts all image paths and titles from the Markdown content.
 * Matches standard markdown images and converts wiki image embeds first.
 * @param {string} markdown
 * @returns {Array<{ originalSrc: string, path: string, fileName: string, isRemote: boolean }>}
 */
function extractImagesFromMarkdown(markdown) {
  const converted = convertObsidianImageSyntax(markdown);
  /** @type {FeishuMarkdownImageLike[]} */
  const images = [];

  let index = 0;
  while (index < converted.length) {
    const start = converted.indexOf('![', index);
    if (start < 0) break;

    let cursor = start + 2;
    let escaped = false;
    let altEnd = -1;
    while (cursor < converted.length) {
      const char = converted[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === ']') {
        altEnd = cursor;
        break;
      }
      cursor += 1;
    }

    if (altEnd < 0 || converted[altEnd + 1] !== '(') {
      index = start + 2;
      continue;
    }

    const destinationStart = altEnd + 2;
    cursor = destinationStart;
    let depth = 0;
    escaped = false;
    let destinationEnd = -1;
    while (cursor < converted.length) {
      const char = converted[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        if (depth === 0) {
          destinationEnd = cursor;
          break;
        }
        depth -= 1;
      }
      cursor += 1;
    }

    if (destinationEnd < 0) {
      index = start + 2;
      continue;
    }

    const alt = converted.slice(start + 2, altEnd);
    const originalSrc = stripMarkdownDestination(converted.slice(destinationStart, destinationEnd)).split(/\s+(?=["'])/)[0];
    if (!originalSrc) continue;

    const decodedPath = decodeURI(originalSrc);
    const isRemote = /^https?:\/\//i.test(decodedPath) || decodedPath.startsWith('data:');
    const fileName = getImageFileNameFromSrc(decodedPath);
    const sizeHint = extractSizeHintFromAltText(alt);

    // Prevent duplicates in the queue
    if (!images.some((x) => x.originalSrc === originalSrc)) {
      images.push({
        originalSrc,
        path: decodedPath,
        fileName,
        isRemote,
        sizeHint,
      });
    }

    index = destinationEnd + 1;
  }

  return images;
}

export {
  stripYamlFrontmatter,
  parseYamlTitle,
  convertWikilinks,
  convertObsidianImageSyntax,
  extractImagesFromMarkdown,
  getImageFileNameFromSrc,
  stripMarkdownDestination,
};
