/*
## 核心功能

实现 Markdown 动态 Frontmatter 变量插值（Dynamic Frontmatter Interpolation），
支持在正文中使用 {{date}}、{{author}}、{{column}}、{{title}} 等模板变量。
在预览阶段对未配置的变量进行醒目标黄提示（如 {{专栏（待填写）}}），
并在代码块与行内代码中保持免疫。严格隔离卡片封面（不修改卡片封面模型）。

## 输入

- markdown: 待处理的 Markdown 原文字符串
- options: { context?, variables?, highlightUnresolved?, unresolvedSuffix?, unresolvedTagClass?, unresolvedTagStyle? }

## 输出

- interpolateMarkdownVariables: 返回完成变量插值后的 Markdown 字符串
- parseMarkdownFrontmatter: 从 Markdown 解析出的键值对对象
- findUnresolvedVariables: 扫描 Markdown 中未被解析的模板变量名数组

## 定位

位于 services/，属于渲染流水线的前置数据装饰层；纯逻辑与字符串处理，无 DOM 依赖。

## 依赖

- `./markdown-utils.js`: 复用 splitMarkdownCodeSegments 保证代码块与行内代码免疫。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 绝不污染卡片封面模型（card cover 保持独立，保护 tests/card_cover.test.js:48）。
- 未配置变量高亮仅用于预览，导出/同步模式不应破坏正文文本结构。
*/

import { splitMarkdownCodeSegments } from './markdown-utils.js';

export const DEFAULT_UNRESOLVED_TAG_CLASS = 'wechat-unresolved-variable';
export const DEFAULT_UNRESOLVED_TAG_STYLE =
  'background-color: #FEF08A; color: #854D0E; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-weight: 500;';

/**
 * 标准别名映射表
 * @type {Record<string, string[]>}
 */
const STANDARD_VARIABLE_ALIASES = {
  date: ['date', '日期', 'publish_date', 'publishdate', 'datetime'],
  author: ['author', '作者', 'writer', 'by'],
  column: ['column', '专栏', '专栏名', '栏目', 'category', '分类', 'series'],
  title: ['title', '标题', 'name'],
};

/**
 * 反向快速别名映射表
 * @type {Map<string, string>}
 */
const ALIAS_TO_CANONICAL = new Map();
for (const [canonical, aliases] of Object.entries(STANDARD_VARIABLE_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

/**
 * HTML 转义
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 剥离值包裹的引号与行内注释
 * @param {string} raw
 * @returns {string}
 */
function unquoteScalar(raw) {
  let value = String(raw || '').trim();
  const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : '';
  if (quote) {
    const end = value.indexOf(quote, 1);
    if (end > 0) return value.slice(1, end);
    return value.slice(1).trim();
  }
  const hashIndex = value.indexOf(' #');
  if (hashIndex >= 0) value = value.slice(0, hashIndex);
  return value.trim();
}

/**
 * 解析 Markdown 顶部的 YAML Frontmatter 标量键值对
 * @param {string} markdown
 * @returns {Record<string, string>}
 */
export function parseMarkdownFrontmatter(markdown) {
  const text = String(markdown || '');
  const match = text.match(/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!match) return {};

  const lines = match[1].split(/\r?\n/);
  /** @type {Record<string, string>} */
  const result = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const rawKey = line.slice(0, colonIdx).trim();
    if (!rawKey || rawKey.startsWith('#') || rawKey.startsWith('-')) continue;
    const rawVal = line.slice(colonIdx + 1);
    result[rawKey] = unquoteScalar(rawVal);
  }

  return result;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date | number | string} [dateInput]
 * @returns {string}
 */
function formatDate(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 从多级上下文中解析变量真实值
 * @param {string} key
 * @param {Record<string, string>} variables
 * @param {Record<string, unknown>} [context]
 * @returns {string | null}
 */
export function resolveVariableValue(key, variables, context = {}) {
  const trimmedKey = String(key || '').trim();
  if (!trimmedKey) return null;

  // 1. 直接精确匹配（区分大小写与原样 key）
  if (Object.prototype.hasOwnProperty.call(variables, trimmedKey) && variables[trimmedKey] !== '') {
    return String(variables[trimmedKey]);
  }

  // 2. 大小写不敏感匹配
  const lowerKey = trimmedKey.toLowerCase();
  for (const [vKey, val] of Object.entries(variables)) {
    if (vKey.toLowerCase() === lowerKey && val !== '') {
      return String(val);
    }
  }

  // 3. 别名归一化匹配
  const canonical = ALIAS_TO_CANONICAL.get(lowerKey);
  if (canonical && Array.isArray(STANDARD_VARIABLE_ALIASES[canonical])) {
    for (const alias of STANDARD_VARIABLE_ALIASES[canonical]) {
      for (const [vKey, val] of Object.entries(variables)) {
        if (vKey.toLowerCase() === alias.toLowerCase() && val !== '') {
          return String(val);
        }
      }
    }
  }

  // 4. 上下文环境 fallback
  if (canonical === 'date') {
    if (context.date) return formatDate(/** @type {string|number|Date} */ (context.date));
    const fileStat = /** @type {{ ctime?: number, mtime?: number } | undefined} */ (
      /** @type {Record<string, unknown> | undefined} */ (context.file)?.stat
    );
    if (fileStat?.ctime) return formatDate(fileStat.ctime);
    if (fileStat?.mtime) return formatDate(fileStat.mtime);
    return formatDate(new Date());
  }

  if (canonical === 'author') {
    const accountAuthor = /** @type {{ author?: string } | undefined} */ (context.account)?.author;
    if (typeof accountAuthor === 'string' && accountAuthor.trim()) return accountAuthor.trim();
    const settingsAuthor = /** @type {{ author?: string } | undefined} */ (context.settings)?.author;
    if (typeof settingsAuthor === 'string' && settingsAuthor.trim()) return settingsAuthor.trim();
  }

  if (canonical === 'title') {
    if (typeof context.title === 'string' && context.title.trim()) return context.title.trim();
    const basename = /** @type {{ basename?: string } | undefined} */ (context.file)?.basename;
    if (typeof basename === 'string' && basename.trim()) return basename.trim();
    if (typeof context.sourcePath === 'string' && context.sourcePath.trim()) {
      const parts = context.sourcePath.split('/');
      const filename = parts[parts.length - 1] || '';
      return filename.replace(/\.md$/i, '').trim();
    }
  }

  return null;
}

/**
 * 模板变量正则：匹配 {{ key }}
 */
const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_\u4e00-\u9fa5-]+)\s*\}\}/g;

/**
 * 扫描 Markdown 非代码区域中所有未被解析的变量名
 * @param {string} markdown
 * @param {Record<string, unknown>} [options]
 * @returns {string[]}
 */
export function findUnresolvedVariables(markdown, options = {}) {
  const text = String(markdown || '');
  const fmMatch = text.match(/^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  const header = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? text.slice(header.length) : text;

  const fmMap = parseMarkdownFrontmatter(header);
  const explicitVars = options.variables && typeof options.variables === 'object'
    ? /** @type {Record<string, string>} */ (options.variables)
    : {};
  const contextFm = /** @type {Record<string, string> | undefined} */ (
    /** @type {Record<string, unknown> | undefined} */ (options.context)?.frontmatter
  ) || {};

  const mergedVariables = Object.assign({}, fmMap, contextFm, explicitVars);
  const context = (options.context && typeof options.context === 'object')
    ? /** @type {Record<string, unknown>} */ (options.context)
    : {};

  const segments = splitMarkdownCodeSegments(body, null);
  /** @type {Set<string>} */
  const unresolvedSet = new Set();

  for (const segment of segments) {
    if (segment.isCode) continue;
    let match;
    const re = new RegExp(VARIABLE_REGEX.source, 'g');
    while ((match = re.exec(segment.text)) !== null) {
      const key = match[1];
      const val = resolveVariableValue(key, mergedVariables, context);
      if (val === null) {
        unresolvedSet.add(key);
      }
    }
  }

  return /** @type {string[]} */ (Array.from(unresolvedSet));
}

/**
 * 执行 Markdown 动态 Frontmatter 变量插值
 * @param {string} markdown
 * @param {{
 *   context?: Record<string, unknown>,
 *   variables?: Record<string, string>,
 *   highlightUnresolved?: boolean,
 *   unresolvedSuffix?: string,
 *   unresolvedTagClass?: string,
 *   unresolvedTagStyle?: string,
 * }} [options={}]
 * @returns {string}
 */
export function interpolateMarkdownVariables(markdown, options = {}) {
  const text = String(markdown || '');
  if (!text.includes('{{')) return text;

  const fmMatch = text.match(/^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  const header = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? text.slice(header.length) : text;

  const fmMap = parseMarkdownFrontmatter(header);
  const explicitVars = options.variables && typeof options.variables === 'object'
    ? /** @type {Record<string, string>} */ (options.variables)
    : {};
  const contextFm = /** @type {Record<string, string> | undefined} */ (
    /** @type {Record<string, unknown> | undefined} */ (options.context)?.frontmatter
  ) || {};

  const mergedVariables = Object.assign({}, fmMap, contextFm, explicitVars);
  const context = (options.context && typeof options.context === 'object') ? options.context : {};

  // 默认在非 export / 预览环境下启用未配置变量醒目标黄
  const isExport = Boolean(context.isExport);
  const highlightUnresolved = options.highlightUnresolved !== undefined
    ? Boolean(options.highlightUnresolved)
    : !isExport;

  const unresolvedSuffix = options.unresolvedSuffix !== undefined
    ? options.unresolvedSuffix
    : '（待填写）';
  const tagClass = options.unresolvedTagClass || DEFAULT_UNRESOLVED_TAG_CLASS;
  const tagStyle = options.unresolvedTagStyle || DEFAULT_UNRESOLVED_TAG_STYLE;

  const segments = splitMarkdownCodeSegments(body, null);
  const processedSegments = segments.map((segment) => {
    if (segment.isCode) {
      return segment.text;
    }

    return segment.text.replace(VARIABLE_REGEX, (rawMatch, rawKey) => {
      const key = String(rawKey || '');
      const resolved = resolveVariableValue(key, mergedVariables, context);
      if (resolved !== null) {
        return resolved;
      }

      if (highlightUnresolved) {
        const displayText = key.endsWith(unresolvedSuffix)
          ? key
          : `${key}${unresolvedSuffix}`;
        return `<span class="${tagClass}" style="${tagStyle}">{{${escapeHtml(displayText)}}}</span>`;
      }

      return String(rawMatch);
    });
  });

  return header + processedSegments.join('');
}

/**
 * 从 HTML 中剥离未解析变量的黄色高亮标签，还原为原始的 {{key}} 纯文本
 * 用于复制到剪贴板或同步微信草稿箱等最终发布出口
 * @param {string} html
 * @returns {string}
 */
export function stripUnresolvedVariableHighlights(html) {
  const content = String(html || '');
  if (!content.includes(DEFAULT_UNRESOLVED_TAG_CLASS)) return content;

  // 匹配类似 <span class="wechat-unresolved-variable" style="...">{{专栏（待填写）}}</span>
  return content.replace(
    new RegExp(`<span\\b[^>]*class=["'][^"']*${DEFAULT_UNRESOLVED_TAG_CLASS}[^"']*["'][^>]*>\\s*\\{\\{\\s*([\\w\\u4e00-\\u9fa5_-]+?)(?:（待填写）)?\\s*\\}\\}\\s*<\\/span>`, 'gi'),
    (_fullMatch, key) => `{{${key}}}`
  );
}

