/*
## 核心功能

将 Markdown 清洗为微信贴图（newspic）所需的纯文本文案。

## 输入

接收原始 Markdown 字符串，以及是否插入配图序号、贴图最终图片顺序等选项。

## 输出

输出 `normalizeImageKey`、`cleanMarkdownToPlainText`，供贴图提取与预览复用。

## 定位

位于 services/，是共享服务模块；只做纯文本转换，不依赖 Obsidian API 或 DOM。

## 依赖

关键依赖：无直接模块导入；依赖同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: regex replace callbacks and compatibility image-order inputs are dynamically shaped in JavaScript */

/**
 * 把图片地址归一化成保留完整路径的可比较身份。
 *
 * 不再退化成 basename：`a/cover.png` 与 `b/cover.png` 必须保持不同。Obsidian
 * vault 的 canonical path 由调用方先解析后传入，本函数只负责去噪和稳定比较。
 *
 * @param {unknown} src
 * @returns {string}
 */
function normalizeImageKey(src) {
  if (typeof src !== 'string') return '';
  let value = src.trim();
  if (!value) return '';

  // 去掉锚点和查询参数，保留完整目录。
  value = value.split('#')[0].split('?')[0].trim();
  if (value.startsWith('<') && value.endsWith('>')) {
    value = value.slice(1, -1).trim();
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    // 非法编码时保留原值
  }

  return value
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .trim()
    .toLowerCase();
}

/**
 * 在贴图顺序列表中查找某个正文图片地址的序号（从 1 开始）。
 *
 * @param {string} src - 正文中书写的图片地址
 * @param {Array<string|{key?:string,displaySrc?:string,uploadRef?:{kind?:string,src?:string}}>} imageOrder
 * 贴图九宫格的最终顺序
 * @returns {number} 命中返回 1-based 序号，未命中返回 0
 */
function findImageOrderIndex(src, imageOrder) {
  if (!Array.isArray(imageOrder) || imageOrder.length === 0) return 0;

  const exactIndex = imageOrder.findIndex((item) => item === src);
  if (exactIndex !== -1) return exactIndex + 1;

  const key = normalizeImageKey(src);
  if (!key) return 0;

  const keyIndex = imageOrder.findIndex((item) => {
    if (typeof item === 'string') {
      return normalizeImageKey(item.replace(/^body:/, '')) === key;
    }
    if (!item || typeof item !== 'object') return false;
    const itemSrc = typeof item.displaySrc === 'string'
      ? item.displaySrc
      : item.uploadRef?.kind === 'src' && typeof item.uploadRef.src === 'string'
        ? item.uploadRef.src
        : '';
    return normalizeImageKey(itemSrc) === key;
  });
  return keyIndex === -1 ? 0 : keyIndex + 1;
}

/**
 * @param {string} value
 * @returns {{text:string, codeBlocks:number, mermaid:number}}
 */
function removeFencedBlocks(value) {
  const lines = value.split('\n');
  const output = [];
  let codeBlocks = 0;
  let mermaid = 0;

  for (let index = 0; index < lines.length;) {
    const opening = lines[index].match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)/);
    if (!opening) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const marker = opening[1];
    const language = String(opening[2] || '').toLowerCase();
    if (language === 'mermaid') mermaid += 1;
    else codeBlocks += 1;
    index += 1;
    const closeRegex = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`);
    while (index < lines.length && !closeRegex.test(lines[index])) {
      index += 1;
    }
    if (index < lines.length) index += 1;
  }

  return { text: output.join('\n'), codeBlocks, mermaid };
}

/**
 * 移除 GFM/Obsidian 表格块，保留普通包含竖线的段落。
 *
 * @param {string} value
 * @returns {{text:string,count:number}}
 */
function removeMarkdownTables(value) {
  const lines = value.split('\n');
  const removed = new Set();
  let count = 0;
  const isTableRow = (line) => line.includes('|') && line.trim().replace(/^\||\|$/g, '').includes('|');
  const isDelimiter = (line) => {
    if (!isTableRow(line)) return false;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|');
    return cells.length >= 2 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
  };

  for (let index = 1; index < lines.length; index++) {
    if (!isDelimiter(lines[index]) || !isTableRow(lines[index - 1]) || removed.has(index)) continue;
    count += 1;
    removed.add(index - 1);
    removed.add(index);
    let cursor = index + 1;
    while (cursor < lines.length && isTableRow(lines[cursor]) && lines[cursor].trim()) {
      removed.add(cursor);
      cursor += 1;
    }
  }

  return {
    text: lines.filter((_, index) => !removed.has(index)).join('\n'),
    count,
  };
}

/**
 * 只移除边界明确的行内数学表达式；货币 `$12`、转义 `\\$` 和未闭合 `$` 保留。
 *
 * @param {string} value
 * @returns {{text:string,count:number}}
 */
function removeInlineMath(value) {
  let output = '';
  let count = 0;
  for (let index = 0; index < value.length;) {
    const char = value[index];
    if (char !== '$' || value[index - 1] === '\\' || /\d/.test(value[index + 1] || '')) {
      output += char;
      index += 1;
      continue;
    }
    let closing = index + 1;
    while (closing < value.length) {
      if (value[closing] === '\n') break;
      if (value[closing] === '$' && value[closing - 1] !== '\\') break;
      closing += 1;
    }
    const content = value.slice(index + 1, closing);
    if (
      closing < value.length
      && value[closing] === '$'
      && content.trim()
      && !/^\s|\s$/.test(content)
    ) {
      count += 1;
      index = closing + 1;
      continue;
    }
    output += char;
    index += 1;
  }
  return { text: output, count };
}

/**
 * @param {string} value
 * @param {RegExp} regex
 * @param {(match:string,...groups:string[])=>string} replacer
 * @returns {string}
 */
function replaceProtected(value, regex, replacer) {
  return value.replace(regex, (...args) => replacer(args[0], ...args.slice(1, -2)));
}

/**
 * 将 Markdown 文本转换为适合微信贴图（newspic）的纯文本 content
 *
 * @param {string} markdown - 原始 Markdown 字符串
 * @param {object} [options]
 * @param {boolean} [options.insertImageIndex=false] - 是否在原图片位置插入 [配图 N] 指引
 * @param {Array<string|object>} [options.imageOrder] - 贴图九宫格最终顺序
 * @returns {{
 *   text: string,
 *   hasCodeBlocks: boolean,
 *   hasTables: boolean,
 *   hasMath: boolean,
 *   hasFootnotes: boolean,
 *   imageCount: number,
 *   removed: Array<{kind:string,count:number}>
 * }}
 */
function cleanMarkdownToPlainText(markdown, options = {}) {
  if (typeof markdown !== 'string') {
    return {
      text: '',
      hasCodeBlocks: false,
      hasTables: false,
      hasMath: false,
      hasFootnotes: false,
      imageCount: 0,
      removed: [],
    };
  }

  const insertImageIndex = Boolean(options.insertImageIndex);
  /** @type {Array<string|object>} */
  const imageOrder = Array.isArray(options.imageOrder)
    ? options.imageOrder.filter((item) => typeof item === 'string' || (item && typeof item === 'object'))
    : [];

  /** @type {Record<string, number>} */
  const counts = {
    codeBlocks: 0,
    mermaid: 0,
    tables: 0,
    math: 0,
    footnotes: 0,
  };

  // 0. Frontmatter
  let text = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

  // 1. fenced code / Mermaid（支持反引号、波浪线和未闭合 fence）
  const fenced = removeFencedBlocks(text);
  text = fenced.text;
  counts.codeBlocks = fenced.codeBlocks;
  counts.mermaid = fenced.mermaid;

  // 2. Obsidian comments
  text = text.replace(/%%[\s\S]*?%%/g, '');

  // 3. block/inline math，保守区分货币与转义美元符
  text = text.replace(/\$\$[\s\S]*?\$\$/g, () => {
    counts.math += 1;
    return '';
  });
  text = text.replace(/\\\[[\s\S]*?\\\]/g, () => {
    counts.math += 1;
    return '';
  });
  text = text.replace(/\\\([^)\n]*?\\\)/g, () => {
    counts.math += 1;
    return '';
  });
  const inlineMath = removeInlineMath(text);
  text = inlineMath.text;
  counts.math += inlineMath.count;

  // 4. tables
  const tables = removeMarkdownTables(text);
  text = tables.text;
  counts.tables = tables.count;

  // 5. footnote definitions（含缩进续行）与引用
  text = text.replace(/^\[\^[^\]]+\]:[^\n]*(?:\n(?: {2,}|\t)[^\n]*)*/gm, () => {
    counts.footnotes += 1;
    return '';
  });
  text = text.replace(/\[\^[^\]]+\]/g, '');

  // 6. horizontal rules
  text = text.replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '');

  // 7. strikethrough
  text = text.replace(/~~[\s\S]*?~~/g, '');

  // 8. images and non-image embeds
  let imageCounter = 0;
  const imageTagRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]|!\[([^\]]*)\]\(([^)]+)\)/g;

  text = text.replace(imageTagRegex, (match, wikiSrc, altText, stdSrc) => {
    imageCounter++;
    if (!insertImageIndex) {
      return '';
    }
    const src = String(wikiSrc || stdSrc || '').trim();

    if (imageOrder.length > 0) {
      const mappedIndex = findImageOrderIndex(src, imageOrder);
      // 用户在侧边栏删掉了这张图：正文里不再保留它的序号占位。
      return mappedIndex === 0 ? '' : `[配图 ${mappedIndex}]`;
    }

    return `[配图 ${imageCounter}]`;
  });

  text = text.replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '');

  // 9. callout markers
  text = text.replace(/^\s*>\s*\[![^\]]+\][+-]?\s*/gmi, '');

  // 10. HTML
  text = text.replace(/<[^>]+>/g, '');

  // 11. headings and highlights
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  text = text.replace(/==([\s\S]*?)==/g, '$1');

  // 12. protect inline code and link labels before emphasis cleanup.
  /** @type {string[]} */
  const protectedValues = [];
  const protect = (value) => {
    const token = `\u0000P${protectedValues.length}X\u0000`;
    protectedValues.push(value);
    return token;
  };
  text = replaceProtected(text, /(`+)([^`\n]*?)\1/g, (_match, _ticks, content) => protect(content));
  text = replaceProtected(text, /\[([^\]]+)\]\((?:<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (_match, label) => protect(label));
  text = replaceProtected(text, /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => protect(String(alias || target)));

  // 13. emphasis
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/\u0000P(\d+)X\u0000/g, (_, index) => protectedValues[Number(index)] || '');

  // 14. tasks, quotes and lists
  text = text.replace(/^(\s*[-*+]\s+)\[[ xX]\]\s+/gm, '$1');
  text = text.replace(/^>\s?/gm, '');
  text = text.replace(/^[\s]*[-*+]\s+/gm, '• ');

  // 15. whitespace
  const cleanedLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => {
      // 过滤连续的空行，最多保留 1 个连续空行
      if (line === '' && idx > 0 && arr[idx - 1] === '') {
        return false;
      }
      return true;
    });

  const removed = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => ({ kind, count }));

  return {
    text: cleanedLines.join('\n').trim(),
    hasCodeBlocks: counts.codeBlocks + counts.mermaid > 0,
    hasTables: counts.tables > 0,
    hasMath: counts.math > 0,
    hasFootnotes: counts.footnotes > 0,
    imageCount: imageCounter,
    removed,
  };
}

export {
  normalizeImageKey,
  cleanMarkdownToPlainText
};
