/*
## 核心功能

将 Markdown 清洗为微信贴图（newspic）所需的纯文本文案。

## 输入

接收原始 Markdown 字符串，以及贴图标题、是否插入配图序号、贴图最终图片顺序等选项。

## 输出

输出图片嵌入判定、地址归一化与保留语义的纯文本降级结果，供贴图提取与预览复用。

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

const PLAIN_TEXT_HORIZONTAL_RULE = '────────';

/**
 * 判断 Obsidian wiki embed 是否指向图片文件。
 *
 * 标准 Markdown 的 `![](...)` 已经明确表达图片，不需要扩展名兜底；只有
 * `![[...]]` 同时可能表示笔记、PDF、音频等嵌入，因此必须按文件类型区分。
 *
 * @param {unknown} src
 * @returns {boolean}
 */
function isImageEmbedTarget(src) {
  const value = String(src || '')
    .split('#')[0]
    .split('?')[0]
    .trim()
    .toLowerCase();
  return /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/.test(value);
}

/**
 * 在贴图顺序列表中查找某个正文图片地址的序号（从 1 开始）。
 *
 * @param {string} src - 正文中书写的图片地址
 * @param {Array<string|{key?:string,displaySrc?:string,uploadRef?:{kind?:string,src?:string}}>} imageOrder
 * 贴图图片网格的最终顺序
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

const NON_TEXT_FENCE_LANGUAGES = new Set([
  'dataview',
  'dataviewjs',
  'tasks',
  'query',
  'templater',
  'meta-bind',
  'button',
]);

/**
 * 把普通代码块降级为纯文本；流程图和查询类执行块只保留可理解的占位。
 *
 * @param {string} value
 * @param {(value:string)=>string} protectBlock
 * @returns {{text:string, codeBlocks:number, mermaid:number, pluginBlocks:number}}
 */
function convertFencedBlocks(value, protectBlock) {
  const lines = value.split('\n');
  const output = [];
  let codeBlocks = 0;
  let mermaid = 0;
  let pluginBlocks = 0;

  for (let index = 0; index < lines.length;) {
    const opening = lines[index].match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)/);
    if (!opening) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const marker = opening[1];
    const language = String(opening[2] || '').toLowerCase();
    index += 1;
    const closeRegex = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`);
    const contentLines = [];
    while (index < lines.length && !closeRegex.test(lines[index])) {
      contentLines.push(lines[index]);
      index += 1;
    }
    if (index < lines.length) index += 1;

    if (language === 'mermaid') {
      mermaid += 1;
      output.push('[流程图]');
      continue;
    }
    if (NON_TEXT_FENCE_LANGUAGES.has(language)) {
      pluginBlocks += 1;
      output.push('[查询内容未展开]');
      continue;
    }

    codeBlocks += 1;
    const content = contentLines.join('\n').replace(/^\n+|\n+$/g, '');
    output.push(protectBlock(content ? `【代码】\n${content}` : '【代码】'));
  }

  return { text: output.join('\n'), codeBlocks, mermaid, pluginBlocks };
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function splitMarkdownTableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/**
 * 把 GFM/Obsidian 表格降级为逐行纯文本，保留所有单元格内容。
 *
 * @param {string} value
 * @returns {{text:string,count:number}}
 */
function convertMarkdownTables(value) {
  const lines = value.split('\n');
  const replacements = new Map();
  let count = 0;
  const isTableRow = (line) => line.includes('|') && line.trim().replace(/^\||\|$/g, '').includes('|');
  const isDelimiter = (line) => {
    if (!isTableRow(line)) return false;
    const cells = splitMarkdownTableRow(line);
    return cells.length >= 2 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
  };

  for (let index = 1; index < lines.length; index++) {
    if (!isDelimiter(lines[index]) || !isTableRow(lines[index - 1]) || replacements.has(index)) continue;
    count += 1;
    replacements.set(index - 1, splitMarkdownTableRow(lines[index - 1]).join(' ｜ '));
    replacements.set(index, null);
    let cursor = index + 1;
    while (cursor < lines.length && isTableRow(lines[cursor]) && lines[cursor].trim()) {
      replacements.set(cursor, splitMarkdownTableRow(lines[cursor]).join(' ｜ '));
      cursor += 1;
    }
  }

  return {
    text: lines
      .flatMap((line, index) => {
        if (!replacements.has(index)) return [line];
        const replacement = replacements.get(index);
        return replacement === null ? [] : [replacement];
      })
      .join('\n'),
    count,
  };
}

/**
 * @param {string} content
 * @param {boolean} [isBlock]
 * @returns {string}
 */
function formatMathFallback(content, isBlock = false) {
  const normalized = String(content || '').trim().replace(/\s+/g, ' ');
  if (!isBlock && normalized && normalized.length <= 80 && !/[\\{}^_]/.test(normalized)) {
    return normalized;
  }
  return '[公式]';
}

/**
 * 只转换边界明确的行内数学表达式；货币 `$12`、转义 `\\$` 和未闭合 `$` 保留。
 *
 * @param {string} value
 * @returns {{text:string,count:number}}
 */
function convertInlineMath(value) {
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
      output += formatMathFallback(content);
      index = closing + 1;
      continue;
    }
    output += char;
    index += 1;
  }
  return { text: output, count };
}

/**
 * 将脚注引用转换为顺序编号，并把定义追加为文末注释。
 *
 * @param {string} value
 * @returns {{text:string,count:number}}
 */
function convertFootnotes(value) {
  const lines = value.split('\n');
  /** @type {Map<string,string>} */
  const definitions = new Map();
  const bodyLines = [];

  for (let index = 0; index < lines.length;) {
    const definition = lines[index].match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (!definition) {
      bodyLines.push(lines[index]);
      index += 1;
      continue;
    }

    const label = definition[1];
    const content = [definition[2]];
    index += 1;
    while (index < lines.length && /^(?: {2,}|\t)/.test(lines[index])) {
      content.push(lines[index].trim());
      index += 1;
    }
    definitions.set(label, content.filter(Boolean).join(' '));
  }

  /** @type {Map<string,number>} */
  const numbers = new Map();
  const ensureNumber = (label) => {
    if (!numbers.has(label)) numbers.set(label, numbers.size + 1);
    return numbers.get(label);
  };

  let text = bodyLines.join('\n');
  text = text.replace(/\[\^([^\]]+)\]/g, (_match, label) => `[${ensureNumber(label)}]`);
  text = text.replace(/\^\[([^\]]+)\]/g, (_match, content) => {
    const label = `inline-${numbers.size + definitions.size + 1}`;
    definitions.set(label, String(content).trim());
    return `[${ensureNumber(label)}]`;
  });

  for (const label of definitions.keys()) ensureNumber(label);
  if (definitions.size > 0) {
    const notes = Array.from(definitions.entries())
      .map(([label, content]) => `注${ensureNumber(label)}：${content}`)
      .join('\n');
    text = `${text.trimEnd()}\n\n${notes}`;
  }

  return { text, count: definitions.size };
}

/**
 * @param {string} value
 * @param {string} title
 * @returns {string}
 */
function removeDuplicateLeadingHeading(value, title) {
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) return value;
  const match = value.match(/^(\s*)#\s+([^\n]+)\r?\n?/);
  if (!match) return value;
  const headingText = match[2]
    .replace(/(\*\*|__|~~|==|`)/g, '')
    .trim();
  return headingText === normalizedTitle ? value.slice(match[0].length) : value;
}

/**
 * @param {string} value
 * @returns {string}
 */
function convertHtmlToPlainText(value) {
  let output = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(?:p|div|section|article|aside|blockquote|li|h[1-6]|tr|table|ul|ol|pre)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' ｜ ')
    .replace(/<[^>]+>/g, '');

  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  output = output.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity) => {
    const key = String(entity).toLowerCase();
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    return entities[key] || '';
  });
  return output;
}

/**
 * @param {string} target
 * @param {string} alias
 * @returns {string}
 */
function formatNonImageEmbed(target, alias) {
  const rawTarget = String(target || '').trim();
  const label = String(alias || '').trim() || rawTarget.split('/').pop() || rawTarget;
  const path = rawTarget.split('#')[0].split('?')[0];
  const hasFileExtension = /\.[A-Za-z0-9]{1,8}$/.test(path);
  return hasFileExtension ? `【附件：${label}】` : `【引用：${label}】`;
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
 * @param {Array<string|object>} [options.imageOrder] - 贴图图片网格最终顺序
 * @param {string} [options.title] - 已单独用于贴图标题的文字，用于去掉正文开头的重复 H1
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
    pluginBlocks: 0,
    tables: 0,
    math: 0,
    footnotes: 0,
  };

  // 0. Frontmatter
  let text = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  text = removeDuplicateLeadingHeading(text, String(options.title || ''));

  /** @type {string[]} */
  const protectedBlocks = [];
  const protectBlock = (value) => {
    const token = `\uE000B${protectedBlocks.length}X\uE001`;
    protectedBlocks.push(value);
    return token;
  };

  // 1. fenced code / Mermaid（支持反引号、波浪线和未闭合 fence）
  const fenced = convertFencedBlocks(text, protectBlock);
  text = fenced.text;
  counts.codeBlocks = fenced.codeBlocks;
  counts.mermaid = fenced.mermaid;
  counts.pluginBlocks = fenced.pluginBlocks;

  // 2. Obsidian comments
  text = text.replace(/%%[\s\S]*?%%/g, '');

  // 3. block/inline math，简单行内公式保留文字，复杂公式使用可见占位。
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, content) => {
    counts.math += 1;
    return formatMathFallback(content, true);
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, content) => {
    counts.math += 1;
    return formatMathFallback(content, true);
  });
  text = text.replace(/\\\(([^)\n]*?)\\\)/g, (_match, content) => {
    counts.math += 1;
    return formatMathFallback(content);
  });
  const inlineMath = convertInlineMath(text);
  text = inlineMath.text;
  counts.math += inlineMath.count;

  // 4. tables
  const tables = convertMarkdownTables(text);
  text = tables.text;
  counts.tables = tables.count;

  // 5. footnote definitions（含缩进续行）与引用
  const footnotes = convertFootnotes(text);
  text = footnotes.text;
  counts.footnotes = footnotes.count;

  // 6. horizontal rules：保留分段语义，并统一不同 Markdown 写法。
  text = text.replace(
    /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/gm,
    PLAIN_TEXT_HORIZONTAL_RULE
  );

  // 7. strikethrough：纯文本无法展示删除线，但作者主动保留的文字不能静默丢失。
  text = text.replace(/~~([\s\S]*?)~~/g, '$1');

  // 8. images and non-image embeds
  let imageCounter = 0;
  const imageTagRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|!\[([^\]]*)\]\(([^)]+)\)/g;

  text = text.replace(imageTagRegex, (match, wikiSrc, wikiAlias, altText, stdSrc) => {
    if (wikiSrc && !isImageEmbedTarget(wikiSrc)) {
      return formatNonImageEmbed(wikiSrc, wikiAlias);
    }
    imageCounter++;
    if (!insertImageIndex) {
      return '';
    }
    const src = String(wikiSrc || stdSrc || '').trim();
    if (imageOrder.length > 0) {
      const mappedIndex = findImageOrderIndex(src, imageOrder);
      // 用户在侧边栏删掉了这张图：正文里不再保留它的序号占位。
      return mappedIndex === 0
        ? ''
        : `[配图 ${mappedIndex}]`;
    }

    return `[配图 ${imageCounter}]`;
  });

  text = text.replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '');

  // 9. callout markers
  text = text.replace(/^\s*>\s*\[![^\]]+\][+-]?\s*/gmi, '');

  // 10. HTML
  text = convertHtmlToPlainText(text);

  // 11. headings and highlights
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  text = text.replace(/==([\s\S]*?)==/g, '$1');

  // 12. protect inline code and link labels before emphasis cleanup.
  /** @type {string[]} */
  const protectedValues = [];
  const protect = (value) => {
    const token = `\uE000P${protectedValues.length}X\uE001`;
    protectedValues.push(value);
    return token;
  };
  text = replaceProtected(text, /(`+)([^`\n]*?)\1/g, (_match, _ticks, content) => protect(content));
  text = replaceProtected(
    text,
    /\[([^\]]+)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    (_match, label, destination) => {
      const href = String(destination || '').replace(/^<|>$/g, '');
      const readable = /^(?:https?:\/\/|mailto:|tel:)/i.test(href) && href !== label
        ? `${label}：${href}`
        : label;
      return protect(readable);
    }
  );
  text = replaceProtected(text, /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => protect(String(alias || target)));

  // 13. emphasis
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/\uE000P(\d+)X\uE001/g, (_, index) => protectedValues[Number(index)] || '');

  // 14. tasks, quotes and lists
  text = text.replace(
    /^(\s*)[-*+]\s+\[([ xX])\]\s+/gm,
    (_match, indent, state) => `${indent}${String(state).toLowerCase() === 'x' ? '☑' : '☐'} `
  );
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

  const cleanedText = cleanedLines
    .join('\n')
    .trim()
    .replace(/\uE000B(\d+)X\uE001/g, (_, index) => protectedBlocks[Number(index)] || '');

  return {
    text: cleanedText,
    hasCodeBlocks: counts.codeBlocks + counts.mermaid + counts.pluginBlocks > 0,
    hasTables: counts.tables > 0,
    hasMath: counts.math > 0,
    hasFootnotes: counts.footnotes > 0,
    imageCount: imageCounter,
    removed,
  };
}

export {
  normalizeImageKey,
  isImageEmbedTarget,
  cleanMarkdownToPlainText
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after Markdown compatibility normalization */
