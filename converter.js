/*
## 核心功能

实现 Markdown 到微信公众号友好 HTML 的转换核心，覆盖 callout、代码块、图片、公式和清洗规则。

## 输入

接收 Markdown 原文、插件设置、主题运行时、路径解析上下文和嵌入依赖。

## 输出

输出 AppleStyleConverter 及其转换后的自包含 HTML、资源引用和渲染辅助结果。

## 定位

位于根目录，是渲染核心源文件；入口与视图只调用它，不在入口文件重复转换规则。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 根目录 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/**
 * 🍎 Apple Style Markdown 转换器
 * 直接照抄 wechat-tool 的代码块实现
 * 针对微信公众号优化：使用 section 结构，增强兼容性
 */

/**
 * @typedef {{ icon: string, label: string }} CalloutIconLike
 * @typedef {{ type: string, title: string, icon: string, label: string }} CalloutInfoLike
 * @typedef {{ base: number, h1?: number, h2?: number, h3?: number, h4?: number, h5?: number, h6?: number, code?: number, caption?: number }} ThemeSizesLike
 * @typedef {{ macCodeBlock?: boolean, codeLineNumber?: boolean, getThemeColorValue: () => string, getSizes: () => ThemeSizesLike, getFontFamily: () => string, getStyle: (tagName: string) => string, getQuoteCalloutStyleMode?: () => string }} ThemeLike
 * @typedef {{ type?: string, tag?: string, content?: string, info?: string, hidden?: boolean, children?: MarkdownTokenLike[], attrGet?: (name: string) => string | null }} MarkdownTokenLike
 * @typedef {{ renderer: { rules: Record<string, (tokens: MarkdownTokenLike[], idx: number, options?: unknown, env?: Record<string, unknown>, self?: unknown) => string> }, render: (markdown: string) => string }} MarkdownItLike
 * @typedef {{ getLanguage?: (language: string) => unknown, highlight?: (code: string, options: { language: string }) => { value: string }, highlightAuto?: (code: string) => { value: string } }} HighlightJsLike
 * @typedef {{ path?: string, extension?: string }} TFileLike
 * @typedef {{ metadataCache?: { getFirstLinkpathDest?: (linkPath: string, sourcePath: string) => TFileLike | null }, vault?: { getAbstractFileByPath?: (path: string) => TFileLike | null, getResourcePath?: (file: TFileLike) => string } }} AppLike
 * @typedef {{ showImageCaption?: boolean, avatarUrl?: string }} ConverterConfigLike
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeDecodeUri(value) {
  const text = String(value || '').trim();
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeVaultPath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

/**
 * @param {unknown} filePath
 * @returns {string}
 */
function getVaultDirname(filePath) {
  const normalized = normalizeVaultPath(filePath);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

/**
 * @param {...unknown} parts
 * @returns {string}
 */
function joinVaultPath(...parts) {
  return normalizeVaultPath(parts.filter(Boolean).join('/'));
}

/**
 * @param {MarkdownTokenLike[]} tokens
 * @param {number} idx
 * @returns {MarkdownTokenLike}
 */
function getToken(tokens, idx) {
  return tokens[idx] || {};
}

/**
 * @param {unknown} value
 * @returns {(CalloutInfoLike | null)[]}
 */
function getCalloutStack(value) {
  return Array.isArray(value) ? /** @type {(CalloutInfoLike | null)[]} */ (value) : [];
}

// Callout 图标配置（颜色跟随主题色）
/** @type {Record<string, CalloutIconLike>} */
const CALLOUT_ICONS = {
  // 信息类
  note: { icon: 'ℹ️', label: '备注' },
  info: { icon: 'ℹ️', label: '信息' },
  todo: { icon: '☑️', label: '待办' },
  // 摘要类
  abstract: { icon: '📄', label: '摘要' },
  summary: { icon: '📄', label: '摘要' },
  tldr: { icon: '📄', label: 'TL;DR' },
  // 提示类
  tip: { icon: '💡', label: '提示' },
  hint: { icon: '💡', label: '提示' },
  important: { icon: '💡', label: '重要' },
  // 成功类
  success: { icon: '✅', label: '成功' },
  check: { icon: '✅', label: '完成' },
  done: { icon: '✅', label: '完成' },
  // 问题类
  question: { icon: '❓', label: '问题' },
  help: { icon: '❓', label: '帮助' },
  faq: { icon: '❓', label: 'FAQ' },
  // 警告类
  warning: { icon: '⚠️', label: '警告' },
  caution: { icon: '⚠️', label: '注意' },
  attention: { icon: '⚠️', label: '注意' },
  // 失败/危险类
  failure: { icon: '❌', label: '失败' },
  fail: { icon: '❌', label: '失败' },
  missing: { icon: '❌', label: '缺失' },
  danger: { icon: '🚨', label: '危险' },
  error: { icon: '❌', label: '错误' },
  bug: { icon: '🐛', label: 'Bug' },
  // 引用类
  quote: { icon: '💬', label: '引用' },
  cite: { icon: '📝', label: '引用' },
  // 示例类
  example: { icon: '📋', label: '示例' },
};

/** @type {Record<string, string>} */
const CALLOUT_SEMANTIC_GROUPS = {
  note: 'info',
  info: 'info',
  todo: 'info',
  abstract: 'info',
  summary: 'info',
  tldr: 'info',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'success',
  check: 'success',
  done: 'success',
  question: 'question',
  help: 'question',
  faq: 'question',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  failure: 'danger',
  fail: 'danger',
  missing: 'danger',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  quote: 'quote',
  cite: 'quote',
  example: 'quote',
};

/** @type {Record<string, string>} */
const CALLOUT_SEMANTIC_COLORS = {
  info: '#2f6fdd',
  tip: '#1f8c7a',
  success: '#2d8a4a',
  question: '#7251b5',
  warning: '#b26a00',
  danger: '#c44747',
  quote: '#5f6b7a',
};

/**
 * @param {unknown} type
 * @param {string} fallbackColor
 * @returns {string}
 */
function resolveCalloutSemanticColor(type, fallbackColor) {
  const key = String(type || '').trim().toLowerCase();
  const group = CALLOUT_SEMANTIC_GROUPS[key] || 'info';
  return CALLOUT_SEMANTIC_COLORS[group] || fallbackColor;
}

const APPLE_CONVERTER_GLOBAL = /** @type {Record<string, unknown>} */ (typeof window !== 'undefined' ? window : {});

/**
 * @param {string} name
 * @returns {unknown}
 */
function getRuntimeDependency(name) {
  const runtimeWindow = typeof window !== 'undefined' ? toRecord(window) : {};
  if (typeof runtimeWindow[name] !== 'undefined') {
    return runtimeWindow[name];
  }
  return undefined;
}

class AppleStyleConverter {
  /**
   * @param {ThemeLike} theme
   * @param {string} [avatarUrl]
   * @param {boolean} [showImageCaption]
   * @param {AppLike | null} [app]
   * @param {string} [sourcePath]
   */
  constructor(theme, avatarUrl = '', showImageCaption = true, app = null, sourcePath = '') {
    /** @type {ThemeLike} */
    this.theme = theme;
    /** @type {string} */
    this.avatarUrl = avatarUrl;
    /** @type {string} */
    this.avatarSrc = avatarUrl;
    /** @type {boolean} */
    this.showImageCaption = showImageCaption;
    /** @type {AppLike | null} */
    this.app = app; // Obsidian App instance
    /** @type {string} */
    this.sourcePath = sourcePath; // Current file path for relative resolution
    /** @type {MarkdownItLike | null} */
    this.md = null;
    /** @type {HighlightJsLike | null} */
    this.hljs = null;
  }

  /**
   * @returns {Promise<void>}
   */
  async initMarkdownIt() {
    if (this.md) return;
    const markdownIt = getRuntimeDependency('markdownit');
    if (typeof markdownIt === 'undefined') throw new Error('markdown-it 未加载');
    this.hljs = /** @type {HighlightJsLike | null} */ (getRuntimeDependency('hljs') || null);
    const markdownItFactory = /** @type {(options: Record<string, unknown>) => MarkdownItLike} */ (markdownIt);
    this.md = markdownItFactory({ html: true, breaks: true, linkify: true, typographer: true });

    // Enable MathJax if available
    const runtimeGlobal = typeof window !== 'undefined' ? /** @type {Record<string, unknown>} */ (window) : APPLE_CONVERTER_GLOBAL;
    if (typeof runtimeGlobal.ObsidianWechatMath === 'function') {
      const mathPlugin = /** @type {(markdownIt: MarkdownItLike) => void} */ (runtimeGlobal.ObsidianWechatMath);
      mathPlugin(this.md);
    }

    this.setupRenderRules();
  }

  reinit() { this.md = null; }

  /**
   * @param {ConverterConfigLike} config
   */
  updateConfig(config) {
    if (config.showImageCaption !== undefined) {
      this.showImageCaption = Boolean(config.showImageCaption);
    }
    if (config.avatarUrl !== undefined) {
      this.avatarUrl = toText(config.avatarUrl);
      this.avatarSrc = toText(config.avatarUrl);
    }
  }

  /**
   * @param {string} path
   */
  updateSourcePath(path) {
    this.sourcePath = path;
  }

  /**
   * @param {string} src
   * @returns {string}
   */
  resolveImagePath(src) {
    if (!this.app) return src;
    // IF remote url, bypass
    if (/^(https?:\/\/|data:|app:\/\/|capacitor:\/\/)/i.test(src)) return src;

    try {
      // Markdown-it might encode the URL (e.g. %20 for space), but Obsidian expects decoded paths
      const linkPath = safeDecodeUri(src);
      const sourcePath = this.sourcePath;
      // Resolve using Obsidian's standard API
      const tFile = this.app.metadataCache?.getFirstLinkpathDest?.(linkPath, sourcePath);
      if (tFile) {
        return this.app.vault?.getResourcePath?.(tFile) || src;
      }

      const vault = this.app.vault;
      const candidates = [];
      const normalized = normalizeVaultPath(linkPath);
      if (normalized) candidates.push(normalized);
      const noteDir = getVaultDirname(sourcePath);
      if (normalized && noteDir) candidates.push(joinVaultPath(noteDir, normalized));

      for (const candidate of Array.from(new Set(candidates))) {
        const file = vault?.getAbstractFileByPath?.(candidate);
        if (file?.extension) {
          return vault?.getResourcePath?.(file) || src;
        }
      }
    } catch (e) {
      console.error('Image resolution failed:', src, e);
    }
    return src;
  }

  /**
   * @returns {void}
   */
  setupRenderRules() {
    if (!this.md) return;
    const rules = this.md.renderer.rules;
    // Callout & Blockquote 智能检测渲染
    rules.blockquote_open = (tokens, idx, options, env = {}, _self) => {
      // 查找 blockquote 内的第一个文本内容，检测是否为 callout 语法
      const calloutInfo = this.detectCallout(tokens, idx);

      // 使用栈管理 callout 状态，支持嵌套
      const calloutStack = getCalloutStack(env._calloutStack);
      env._calloutStack = calloutStack;
      calloutStack.push(calloutInfo);

      if (calloutInfo) {
        return this.renderCalloutOpen(calloutInfo);
      }
      // 普通 blockquote
      return `<blockquote style="${this.getInlineStyle('blockquote')}">`;
    };

    rules.blockquote_close = (tokens, idx, options, env = {}, _self) => {
      const calloutStack = getCalloutStack(env._calloutStack);
      const calloutInfo = calloutStack.length ? calloutStack.pop() : null;
      if (calloutInfo) {
        return `</section></section>`; // 关闭内容区和外层容器
      }
      return `</blockquote>`;
    };

    rules.paragraph_open = (tokens, idx) => {
      if (getToken(tokens, idx).hidden) return '';
      return `<p style="${this.getInlineStyle('p')}">`;
    };

    rules.paragraph_close = (tokens, idx) => {
      if (getToken(tokens, idx).hidden) return '';
      return `</p>`;
    };
    rules.heading_open = (tokens, idx) => {
      const tag = getToken(tokens, idx).tag || 'h1';
      return `<${tag} style="${this.getInlineStyle(tag)}">`;
    };
    rules.bullet_list_open = () => `<ul style="${this.getInlineStyle('ul')}">`;
    rules.ordered_list_open = () => `<ol style="${this.getInlineStyle('ol')}">`;
    /**
     * @param {MarkdownTokenLike[]} tokens
     * @param {number} idx
     * @returns {{ isTask: boolean, checked: boolean, token: MarkdownTokenLike } | null}
     */
    const isTaskListItem = (tokens, idx) => {
      for (let i = idx + 1; i < tokens.length; i++) {
        const token = getToken(tokens, i);
        if (token.type === 'list_item_close') break;
        if (token.type === 'inline') {
          const content = toText(token.content);
          if (content.startsWith('☑') || content.startsWith('□') || content.startsWith('☐')) {
            return {
              isTask: true,
              checked: content.startsWith('☑'),
              token: token
            };
          }
          break;
        }
      }
      return null;
    };

    rules.list_item_open = (tokens, idx) => {
      const taskInfo = isTaskListItem(tokens, idx);
      if (taskInfo) {
        const inlineToken = taskInfo.token;
        const themeColor = this.theme.getThemeColorValue() || '#576b95';
        
        if (inlineToken.children && inlineToken.children.length > 0) {
          const firstChild = inlineToken.children[0];
          const firstContent = toText(firstChild.content);
          if (firstChild.type === 'text' && (firstContent.startsWith('☑') || firstContent.startsWith('□') || firstContent.startsWith('☐'))) {
            const content = firstContent;
            const restText = content.slice(1);
            
            /** @type {MarkdownTokenLike[]} */
            const newChildren = [];
            
            if (taskInfo.checked) {
              newChildren.push({
                type: 'html_inline',
                content: `<span style="display: inline-block; font-size: 1.15em; font-weight: bold; margin-right: 6px; vertical-align: -0.05em; color: #8f959e; line-height: 1;">☑</span>`
              });
              newChildren.push({
                type: 'html_inline',
                content: `<span style="text-decoration: line-through; color: #8f959e;">`
              });
              newChildren.push({
                type: 'text',
                content: restText.trimStart()
              });
              for (let j = 1; j < inlineToken.children.length; j++) {
                newChildren.push(inlineToken.children[j]);
              }
              newChildren.push({
                type: 'html_inline',
                content: `</span>`
              });
            } else {
              newChildren.push({
                type: 'html_inline',
                content: `<span style="display: inline-block; font-size: 1.15em; font-weight: bold; margin-right: 6px; vertical-align: -0.05em; color: ${themeColor}; line-height: 1;">☐</span>`
              });
              newChildren.push({
                type: 'text',
                content: restText.trimStart()
              });
              for (let j = 1; j < inlineToken.children.length; j++) {
                newChildren.push(inlineToken.children[j]);
              }
            }
            inlineToken.children = newChildren;
          }
        } else {
          const content = toText(inlineToken.content);
          const restText = content.slice(1);
          if (taskInfo.checked) {
            inlineToken.content = `<span style="display: inline-block; font-size: 1.15em; font-weight: bold; margin-right: 6px; vertical-align: -0.05em; color: #8f959e; line-height: 1;">☑</span><span style="text-decoration: line-through; color: #8f959e;">${restText.trimStart()}</span>`;
          } else {
            inlineToken.content = `<span style="display: inline-block; font-size: 1.15em; font-weight: bold; margin-right: 6px; vertical-align: -0.05em; color: ${themeColor}; line-height: 1;">☐</span>${restText.trimStart()}`;
          }
        }
        
        return `<li style="${this.getInlineStyle('li-task')}">`;
      }
      return `<li style="${this.getInlineStyle('li')}">`;
    };

    rules.code_inline = (tokens, idx) =>
      `<code style="${this.getInlineStyle('code')}">${this.escapeHtml(toText(getToken(tokens, idx).content))}</code>`;

    rules.fence = (tokens, idx) => {
      const token = getToken(tokens, idx);
      const content = toText(token.content);
      const lang = toText(token.info) || 'text';
      return this.createCodeBlock(content, lang);
    };

    rules.link_open = (tokens, idx) => {
      const href = getToken(tokens, idx).attrGet?.('href') || '';
      const safeHref = this.validateLink(href);
      const nextToken = getToken(tokens, idx + 1);
      const closeToken = getToken(tokens, idx + 2);
      const visibleText = nextToken && nextToken.type === 'text'
        ? toText(nextToken.content).trim()
        : '';
      const isUrlTextLink = closeToken?.type === 'link_close'
        && /^https?:\/\//i.test(visibleText || href);
      const urlTextStyle = isUrlTextLink
        ? '; display:block; max-width:100%; margin:4px 0; line-height:1.55; word-break:break-all; overflow-wrap:anywhere;'
        : '';
      return `<a href="${safeHref}" style="${this.getInlineStyle('a')}${urlTextStyle}">`;
    };
    rules.strong_open = () => `<strong style="${this.getInlineStyle('strong')}">`;
    rules.em_open = () => `<em style="${this.getInlineStyle('em')}">`;
    rules.s_open = () => `<del style="${this.getInlineStyle('del')}">`;

    rules.image = (tokens, idx) => {
      let src = getToken(tokens, idx).attrGet?.('src') || '';
      const alt = toText(getToken(tokens, idx).content);

      // Resolve Local Path for Preview
      src = this.resolveImagePath(src);


      let caption = '';

      if (alt) {
        caption = alt;
        const stripped = caption.replace(/\|\s*\d+(x\d+)?\s*$/, '');
        caption = stripped || caption;
        caption = caption.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
      }


      if (this.avatarUrl) {
        // 水印模式：显示头像 + 图片名称，使用带边框的样式
        const avatarHeaderStyle = this.getInlineStyle('avatar-header');
        const spacerStyle = 'display:block;height:8px;line-height:8px;font-size:0;';
        // Fix: Force text-align: left for the figure container in watermark mode to prevent centering
        // We strip the default text-align: center from the figure style and add text-align: left
        let figureStyle = this.getInlineStyle('figure');
        figureStyle = figureStyle.replace('text-align: center;', 'text-align: left;');

        return `<figure style="${figureStyle}"><div style="${avatarHeaderStyle}"><img src="${this.avatarUrl}" alt="logo" style="${this.getInlineStyle('avatar')}"><span style="${this.getInlineStyle('avatar-caption')}">${caption}</span></div><section style="${spacerStyle}">&nbsp;</section><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"></figure>`;
      }

      // 非水印模式：无边框样式
      const simpleFigureStyle = 'display:block;margin:16px 0;text-align:center;';
      if (this.showImageCaption && caption) {
        return `<figure style="${simpleFigureStyle}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"><figcaption style="${this.getInlineStyle('figcaption')}">${caption}</figcaption></figure>`;
      } else {
        return `<figure style="${simpleFigureStyle}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"></figure>`;
      }
    };

    rules.hr = () => `<hr style="${this.getInlineStyle('hr')}">`;
    rules.table_open = (tokens, idx) => `<section style="${this.getInlineStyle('table-wrapper')}"><table style="${this.getTableStyle(tokens, idx)}">`;
    rules.table_close = () => `</table></section>`;
    rules.thead_open = () => `<thead style="${this.getInlineStyle('thead')}">`;
    rules.th_open = () => `<th style="${this.getInlineStyle('th')}">`;
    rules.td_open = () => `<td style="${this.getInlineStyle('td')}">`;
  }

  /**
   * @param {MarkdownTokenLike[]} tokens
   * @param {number} tableIdx
   * @returns {number}
   */
  getTableColumnCount(tokens, tableIdx) {
    if (!Array.isArray(tokens)) return 0;

    let rowOpen = false;
    let count = 0;
    for (let i = tableIdx + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token) continue;
      if (token.type === 'table_close') break;
      if (token.type === 'tr_open') {
        rowOpen = true;
        count = 0;
        continue;
      }
      if (token.type === 'tr_close' && rowOpen) {
        if (count > 0) return count;
        rowOpen = false;
        continue;
      }
      if (!rowOpen || (token.type !== 'th_open' && token.type !== 'td_open')) continue;

      const colspanAttr = typeof token.attrGet === 'function' ? token.attrGet('colspan') : null;
      const colspan = Number.parseInt(colspanAttr || '1', 10);
      count += Number.isFinite(colspan) && colspan > 0 ? colspan : 1;
    }

    return count;
  }

  /**
   * @param {MarkdownTokenLike[]} tokens
   * @param {number} tableIdx
   * @returns {number}
   */
  getTableMinWidth(tokens, tableIdx) {
    const columns = this.getTableColumnCount(tokens, tableIdx);
    if (!columns) return 720;
    const width = columns <= 2 ? (columns * 180 + 80) : (columns * 230 + 80);
    return Math.max(360, Math.min(1200, width));
  }

  /**
   * @param {MarkdownTokenLike[]} tokens
   * @param {number} tableIdx
   * @returns {string}
   */
  getTableStyle(tokens, tableIdx) {
    const baseStyle = this.getInlineStyle('table');
    const minWidth = this.getTableMinWidth(tokens, tableIdx);
    const withoutWidth = baseStyle
      .replace(/(?:^|;)\s*width\s*:\s*[^;]+;?/gi, ';')
      .replace(/(?:^|;)\s*min-width\s*:\s*[^;]+;?/gi, ';')
      .replace(/(?:^|;)\s*max-width\s*:\s*[^;]+;?/gi, ';')
      .replace(/;{2,}/g, ';')
      .replace(/^\s*;\s*/, '')
      .trim();
    const normalized = withoutWidth && !withoutWidth.endsWith(';') ? `${withoutWidth};` : withoutWidth;
    return `width: ${minWidth}px; min-width: 100%; max-width: none; ${normalized}`;
  }

  /**
   * 检测 blockquote 是否为 Callout 语法
   * 并清理 marker 标识符
   * @param {MarkdownTokenLike[]} tokens - markdown-it tokens
   * @param {number} idx - blockquote_open 的索引
   * @returns {CalloutInfoLike|null} - callout 信息 { type, title, icon, label } 或 null
   */
  detectCallout(tokens, idx) {
    // 查找 blockquote 内的第一个 inline token
    for (let i = idx + 1; i < tokens.length; i++) {
      const token = getToken(tokens, i);
      if (token.type === 'blockquote_close') break;
      if (token.type === 'inline' && token.content) {
        // 只取第一行内容进行匹配
        const firstLine = toText(token.content).split('\n')[0];
        // 支持自定义 callout 类型（包含中文、连字符等），例如 [!学习研究] / [!custom-type]
        const match = firstLine.match(/^\[!\s*([^\]\r\n]+?)\s*\](?:\s+(.*))?/);
        if (match) {
          const rawType = match[1].trim();
          if (!rawType || !/\S/u.test(rawType)) return null;
          const type = rawType.toLowerCase();
          const customTitle = match[2] ? match[2].trim() : null;
          const mappedConfig = CALLOUT_ICONS[type];
          const config = mappedConfig || { icon: CALLOUT_ICONS.note.icon, label: type };
          const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1);

          // --- 在 Token 阶段清理 Marker ---
          // 1. 更新 content：移除包含 marker 的第一行
          const lines = toText(token.content).split('\n');
          lines.shift();
          token.content = lines.join('\n');

          // 2. 更新 children：同步移除第一行对应的 tokens
          if (token.children) {
            const breakIdx = token.children.findIndex(c => c.type === 'softbreak' || c.type === 'hardbreak');
            if (breakIdx !== -1) {
              // 移除第一个换行符及其之前的所有内容
              token.children = token.children.slice(breakIdx + 1);
            } else {
              // 只有一行，直接清空
              token.children = [];
            }
          }

          // 3. 如果该段落变为空（说明 marker 独占一行），隐藏该段落容器
          if (toText(token.content).trim() === '') {
            if (i > 0 && getToken(tokens, i - 1).type === 'paragraph_open') getToken(tokens, i - 1).hidden = true;
            token.hidden = true; // 隐藏 inline token 本身
            if (i < tokens.length - 1 && getToken(tokens, i + 1).type === 'paragraph_close') getToken(tokens, i + 1).hidden = true;
          }

          return {
            type,
            title: customTitle || defaultTitle,
            icon: config.icon,
            label: config.label,
          };
        }
        break; // 只检查第一个 inline
      }
    }
    return null;
  }

  /**
   * 渲染 Callout 开始标签
   * @param {CalloutInfoLike} calloutInfo - { type, title, icon }
   * @returns {string} - HTML 字符串
   */
  renderCalloutOpen(calloutInfo) {
    const color = this.theme.getThemeColorValue();
    const sizes = this.theme.getSizes();
    const font = this.theme.getFontFamily();
    const quoteCalloutStyleMode = typeof this.theme.getQuoteCalloutStyleMode === 'function'
      ? this.theme.getQuoteCalloutStyleMode()
      : 'theme';

    if (quoteCalloutStyleMode === 'neutral') {
      return this.renderCalloutOpenNeutral(calloutInfo, color, sizes, font);
    }

    const safeTitle = this.escapeHtml(String(calloutInfo.title ?? ''));
    const accentColor = resolveCalloutSemanticColor(calloutInfo?.type, color);

    const containerStyle = `
      margin: 16px 0 16px 8px;
      background: ${accentColor}0D;
      border: 1px solid ${accentColor}24;
      border-radius: 4px;
      overflow: hidden;
    `.replace(/\s+/g, ' ').trim();

    const headerStyle = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: ${accentColor}14;
      border-bottom: 1px solid ${accentColor}24;
      font-weight: bold;
      font-size: ${sizes.base}px;
      font-family: ${font};
      color: ${accentColor};
    `.replace(/\s+/g, ' ').trim();

    const iconStyle = `margin-right: 8px; font-size: ${sizes.base + 2}px; color: ${accentColor};`;
    const titleStyle = `flex: 1; color: ${accentColor};`;

    const contentStyle = `
      padding: 12px 16px;
      font-size: ${sizes.base}px;
      line-height: 1.8;
      color: #595959;
      background: ${accentColor}0D;
    `.replace(/\s+/g, ' ').trim();

    return `<section style="${containerStyle}">
      <section style="${headerStyle}">
        <span style="${iconStyle}">${calloutInfo.icon}</span>
        <span style="${titleStyle}">${safeTitle}</span>
      </section>
      <section style="${contentStyle}">`;
  }

  /**
   * @param {CalloutInfoLike} calloutInfo
   * @param {string} themeColor
   * @param {ThemeSizesLike} sizes
   * @param {string} font
   * @returns {string}
   */
  renderCalloutOpenNeutral(calloutInfo, themeColor, sizes, font) {
    const safeTitle = this.escapeHtml(String(calloutInfo.title ?? ''));
    const accentColor = resolveCalloutSemanticColor(calloutInfo?.type, themeColor);

    const containerStyle = `
      margin: 16px 0 16px 8px;
      background: #f9f9f9;
      border: 1px solid ${accentColor}24;
      border-radius: 4px;
      overflow: hidden;
    `.replace(/\s+/g, ' ').trim();

    const headerStyle = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: ${accentColor}14;
      border-bottom: 1px solid ${accentColor}24;
      font-weight: bold;
      font-size: ${sizes.base}px;
      font-family: ${font};
      color: ${accentColor};
    `.replace(/\s+/g, ' ').trim();

    const iconStyle = `margin-right: 8px; font-size: ${sizes.base + 2}px; color: ${accentColor};`;
    const titleStyle = `flex: 1; color: ${accentColor};`;
    const contentStyle = `
      padding: 12px 16px;
      font-size: ${sizes.base}px;
      line-height: 1.8;
      color: #595959;
      background: #f9f9f9;
    `.replace(/\s+/g, ' ').trim();

    return `<section style="${containerStyle}">
      <section style="${headerStyle}">
        <span style="${iconStyle}">${calloutInfo.icon}</span>
        <span style="${titleStyle}">${safeTitle}</span>
      </section>
      <section style="${contentStyle}">`;
  }

  /**
   * @param {string} code
   * @param {string} lang
   * @returns {string}
   */
  highlightCode(code, lang) {
    if (!this.hljs) return this.escapeHtml(code);
    try {
      if (lang && this.hljs.getLanguage(lang)) return this.hljs.highlight(code, { language: lang }).value;
      return this.hljs.highlightAuto(code).value;
    } catch { return this.escapeHtml(code); }
  }

  /**
   * 格式化高亮代码（参考 wechat-tool formatHighlightedCode）
   */
  /**
   * @param {string} html
   * @param {boolean} [preserveNewlines]
   * @returns {string}
   */
  formatHighlightedCode(html, preserveNewlines = false) {
    let formatted = html;
    // 将 span 之间的空格移到 span 内部
    formatted = formatted.replace(/(<span[^>]*>[^<]*<\/span>)(\s+)(<span[^>]*>[^<]*<\/span>)/g,
      (_match, span1, spaces, span2) => String(span1) + String(span2).replace(/^(<span[^>]*>)/, `$1${String(spaces)}`));
    formatted = formatted.replace(/(\s+)(<span[^>]*>)/g,
      (_match, spaces, span) => String(span).replace(/^(<span[^>]*>)/, `$1${String(spaces)}`));
    // 替换制表符为4个空格
    formatted = formatted.replace(/\t/g, '    ');

    // wechat-tool 的逻辑：如果是 lineNumbers 模式（preserveNewlines=false），将空格转为 &nbsp;
    // 如果不是（preserveNewlines=true），将换行转为 <br/> 且空格转为 &nbsp;
    if (preserveNewlines) {
      formatted = formatted
        .replace(/\r\n/g, '<br/>')
        .replace(/\n/g, '<br/>')
        .replace(/(>[^<]+)|(^[^<]+)/g, str => String(str).replace(/\s/g, '&nbsp;'));
    } else {
      formatted = formatted.replace(/(>[^<]+)|(^[^<]+)/g, str => String(str).replace(/\s/g, '&nbsp;'));
    }
    return formatted;
  }

  /**
   * @param {string} html
   * @returns {string}
   */
  inlineHighlightStyles(html) {
    /** @type {Record<string, string>} */
    const map = {
      'hljs-keyword': 'color:#ff7b72 !important;', 'hljs-built_in': 'color:#ffa657 !important;',
      'hljs-type': 'color:#ffa657 !important;', 'hljs-literal': 'color:#79c0ff !important;',
      'hljs-number': 'color:#79c0ff !important;', 'hljs-string': 'color:#a5d6ff !important;',
      'hljs-symbol': 'color:#a5d6ff !important;', 'hljs-comment': 'color:#8b949e !important;font-style:italic !important;',
      'hljs-doctag': 'color:#8b949e !important;', 'hljs-meta': 'color:#ffa657 !important;',
      'hljs-attr': 'color:#79c0ff !important;', 'hljs-attribute': 'color:#79c0ff !important;',
      'hljs-name': 'color:#7ee787 !important;', 'hljs-tag': 'color:#7ee787 !important;',
      'hljs-selector-tag': 'color:#7ee787 !important;', 'hljs-selector-class': 'color:#d2a8ff !important;',
      'hljs-selector-id': 'color:#79c0ff !important;', 'hljs-variable': 'color:#ffa657 !important;',
      'hljs-template-variable': 'color:#ffa657 !important;', 'hljs-params': 'color:#e6e6e6 !important;',
      'hljs-function': 'color:#d2a8ff !important;', 'hljs-title': 'color:#d2a8ff !important;',
      'hljs-punctuation': 'color:#e6e6e6 !important;', 'hljs-property': 'color:#79c0ff !important;',
      'hljs-operator': 'color:#ff7b72 !important;', 'hljs-regexp': 'color:#a5d6ff !important;',
      'hljs-subst': 'color:#e6e6e6 !important;',
    };

    // 改进：处理 class 属性包含多个类名的情况
    return html.replace(/class="([^"]*)"/g, (match, classNames) => {
      const classes = String(classNames || '').split(/\s+/);
      let styles = '';
      for (const cls of classes) {
        if (map[cls]) {
          styles += map[cls];
        }
      }
      return styles ? `style="${styles}"` : match;
    }).replace(/class="[^"]*"/g, ''); // 再次清理未匹配的 class
  }

  /**
   * 创建代码块 - 照抄 wechat-tool 的实现
   * 使用 wechat-tool 的颜色和结构
   */
  /**
   * @param {string} content
   * @param {string} lang
   * @returns {string}
   */
  createCodeBlock(content, lang) {
    const showMac = this.theme.macCodeBlock;
    const showLineNum = this.theme.codeLineNumber;

    // wechat-tool 的颜色配置（GitHub Dark 主题）
    const background = '#0d1117';  // GitHub Dark 背景
    const color = '#f0f6fc';       // GitHub Dark 文字
    const barBackground = '#161b22'; // 工具栏背景
    const borderColor = '#30363d';   // 边框颜色

    let lines = content.replace(/\r\n/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

    // Mac 头部
    // 关键修正：使用 section 而不是 div，增强在公众号中的兼容性
    const macHeader = showMac ? `<section style="display:block !important;background:${barBackground} !important;padding:6px 10px 6px 10px !important;border:none !important;border-bottom:1px solid ${borderColor} !important;border-radius:8px 8px 0 0 !important;line-height:1 !important;">
      <span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#ff5f57 !important;margin-right:7px !important;font-size:0 !important;line-height:0 !important;vertical-align:top !important;"></span>
      <span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#ffbd2e !important;margin-right:7px !important;font-size:0 !important;line-height:0 !important;vertical-align:top !important;"></span>
      <span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#28c840 !important;font-size:0 !important;line-height:0 !important;vertical-align:top !important;"></span>
    </section>` : '';

    // 统一行高和字体变量
    const lineHeight = '1.75';
    // const fontSize = '13px';

    let codeHtml;

    if (showLineNum) {
      // 带行号：逐行处理
      const highlightedLines = lines.map(lineRaw => {
        const lineHtml = this.highlightCode(lineRaw, lang);
        const styled = this.inlineHighlightStyles(lineHtml);
        // 注意：这里 formatHighlightedCode 第二个参数为 false，不包含 <br>，不包含 &nbsp; (除非内部逻辑处理)
        // 实际上 formatHighlightedCode 第二个参数为 false 时，只做空格处理
        // wechat-tool 中： return formatted === '' ? '&nbsp;' : formatted
        const formatted = this.formatHighlightedCode(styled, false);
        return formatted === '' ? '&nbsp;' : formatted;
      });

      // 行号列
      const lineNumbersHtml = highlightedLines.map((_, idx) =>
        `<section style="height:1.75em !important;line-height:${lineHeight} !important;padding:0 12px 0 12px !important;font-size:13px !important;color:#95989C !important;text-align:right !important;white-space:nowrap !important;vertical-align:top !important;margin:0 !important;">${idx + 1}</section>`
      ).join('');

      // 代码内容
      // 关键改动：回归 wechat-tool 原始方案 —— 使用 <br> 拼接代码行，而不是 div 分割
      // 这样右侧就是一个单一的文本流，高度严格由 line-height 控制
      const codeInnerHtml = highlightedLines.join('<br/>');

      const codeLinesHtml = `<section class="code-lines" style="white-space:nowrap !important;display:inline-block !important;width:max-content !important;min-width:100% !important;max-width:none !important;line-height:${lineHeight} !important;font-size:13px !important;">${codeInnerHtml}</section>`;

      // 行号列容器样式
      const lineNumberColumnStyles = `text-align:right !important;padding:12px 0 12px 0 !important;border-right:1px solid rgba(255,255,255,0.1) !important;user-select:none !important;background:transparent !important;flex:0 0 auto !important;min-width:3.5em !important;margin:0 !important;`;

      // 注意 flex 容器的 padding 0，内部 padding 分别在 lineNumberColumn 和 code section
      codeHtml = `<section class="code-with-line-numbers" style="display:flex !important;align-items:flex-start !important;overflow-x:hidden !important;overflow-y:visible !important;width:100% !important;max-width:100% !important;padding:0 !important;margin:0 !important;box-sizing:border-box !important;">
        <section class="code-line-numbers" style="${lineNumberColumnStyles}">${lineNumbersHtml}</section>
        <section class="code-scroll" style="flex:1 1 0% !important;width:0 !important;max-width:calc(100% - 3.5em) !important;overflow-x:scroll !important;overflow-y:visible !important;-webkit-overflow-scrolling:touch !important;scrollbar-gutter:stable !important;scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18) !important;padding:12px 12px 16px 16px !important;margin:0 !important;min-width:0 !important;box-sizing:border-box !important;">${codeLinesHtml}</section>
      </section>`;
    } else {
      // 无行号
      const highlighted = this.highlightCode(lines.join('\n'), lang);
      const styled = this.inlineHighlightStyles(highlighted);
      // preserveNewlines=true -> 包含 <br>
      const formatted = this.formatHighlightedCode(styled, true);
      // 改动：white-space: nowrap !important
      const codeLinesHtml = `<section class="code-lines" style="white-space:nowrap !important;display:inline-block !important;min-width:100% !important;word-break:keep-all !important;overflow-wrap:normal !important;line-height:${lineHeight} !important;font-size:13px !important;margin:0 !important;">${formatted}</section>`;

      codeHtml = `<section class="code-without-line-numbers" style="display:flex !important;align-items:flex-start !important;overflow-x:hidden !important;overflow-y:visible !important;width:100% !important;padding:0 !important;margin:0 !important;">
        <section class="code-scroll" style="flex:1 1 auto !important;width:100% !important;max-width:100% !important;overflow-x:scroll !important;overflow-y:visible !important;scrollbar-gutter:stable !important;scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18) !important;padding:12px 12px 16px 12px !important;min-width:0 !important;margin:0 !important;box-sizing:border-box !important;">${codeLinesHtml}</section>
      </section>`;
    }

    // 外层容器
    return `<section class="code-snippet__fix" style="width:100% !important;margin:12px 0 !important;background:${background} !important;border:1px solid ${borderColor} !important;border-radius:8px !important;overflow:hidden !important;box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;display:block !important;">
${macHeader}
<section style="padding:0 !important;border:none !important;background:${background} !important;color:${color} !important;font-family:'SF Mono',Consolas,Monaco,monospace !important;font-size:13px !important;line-height:${lineHeight} !important;white-space:normal !important;overflow-x:hidden !important;display:block !important;">
<pre style="margin:0 !important;padding:0 !important;background:${background} !important;font-family:inherit !important;font-size:13px !important;line-height:inherit !important;color:${color} !important;white-space:normal !important;overflow-x:visible !important;display:block !important;width:100% !important;max-width:100% !important;">${codeHtml}</pre>
</section>
</section>`;
  }

  /**
   * @param {string} tagName
   * @returns {string}
   */
  getInlineStyle(tagName) { return this.theme.getStyle(tagName); }

  /**
   * @param {string} md
   * @returns {string}
   */
  stripFrontmatter(md) { return md.replace(/^---\n[\s\S]*?\n---\n?/, ''); }


  /**
   * @param {string} markdown
   * @returns {Promise<string>}
   */
  async convert(markdown) {
    if (!this.md) await this.initMarkdownIt();

    // 修复：移除块级公式 $$ 前面的缩进，避免被误识别为代码块
    // 仅匹配行首的空白 + $$，不影响其他缩进
    markdown = markdown.replace(/^[\t ]+(\$\$)/gm, '$1');

    // Pre-process: Convert Wiki-links ![[...]] to standard images ![](...)
    // Regex: ![[path|alt]] or ![[path]]
    // Fix: Use more robust regex preventing greedy capture and encoding URI for paths with spaces
    markdown = markdown.replace(/!\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_match, path, alt) => {
      const imagePath = String(path || '');
      const imageAlt = typeof alt === 'string' ? alt : '';
      // Must encodeURI to handle spaces in filenames which are valid in WikiLinks but break standard Markdown images
      // trimmed path to avoid leading/trailing spaces breaking the link
      if (!imageAlt) {
        const filename = (imagePath.trim().split('/').pop() || '').replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '') || imagePath.trim();
        return `![${filename}](${encodeURI(imagePath.trim())})`;
      }
      return `![${imageAlt}](${encodeURI(imagePath.trim())})`;
    });



    let html = this.md.render(this.stripFrontmatter(markdown));
    html = this.fixListParagraphs(html);
    html = this.unwrapFigures(html); // Fix: Remove <p> wrappers from <figure> to prevent empty lines
    html = this.removeBlockquoteParagraphMargins(html); // Fix: Remove margins from <p> inside <blockquote> for vertical centering
    html = this.fixMathJaxTags(html); // Fix: Replace <mjx-container> with WeChat-compatible tags
    html = this.sanitizeHtml(html); // Final security pass: Neutralize XSS and dangerous tags
    return `<section style="${this.getInlineStyle('section')}">${html}</section>`;
  }

  /**
   * @param {string} html
   * @returns {string}
   */
  fixMathJaxTags(html) {
    if (!html.includes('mjx-container')) return html;

    // Fix: Remove assistive MathML (hidden text that shows up in WeChat)
    html = html.replace(/<mjx-assistive-mml[^>]*>[\s\S]*?<\/mjx-assistive-mml>/gi, '');

    /**
     * @param {string} markup
     * @returns {string}
     */
    const normalizeMathPositionStyles = (markup) => String(markup || '').replace(
      /style="([^"]*)"/gi,
      (_match, styleText) => {
        let style = String(styleText || '');
        let topValue = null;
        style = style.replace(/(^|;)\s*top\s*:\s*([^;"]+)\s*;?/i, (_m, prefix, value) => {
          topValue = String(value || '').trim();
          return String(prefix || '');
        });
        if (!topValue) return `style="${style}"`;

        if (/transform\s*:/i.test(style)) {
          style = style.replace(
            /transform\s*:\s*([^;"]+)/i,
            (_m, value) => `transform:${String(value || '').trim()} translateY(${topValue})`
          );
        } else {
          style = `${style}${style.trim().endsWith(';') || !style.trim() ? '' : ';'}transform: translateY(${topValue});`;
        }
        return `style="${style}"`;
      }
    );

    /**
     * @param {string} markup
     * @param {string} extraStyle
     * @returns {string}
     */
    const appendSvgStyle = (markup, extraStyle) => String(markup || '').replace(/<svg([^>]*)>/i, (_m, svgAttrs) => {
      const attrs = String(svgAttrs || '');
      if (attrs.includes('style="')) {
        return `<svg${attrs.replace('style="', `style="${extraStyle}`)}>`;
      }
      return `<svg${attrs} style="${extraStyle}">`;
    });

    // Replace <mjx-container> with <section> (block) or <span> (inline)
    // WeChat strips custom tags like mjx-container but keeps SVG content
    return html.replace(/<mjx-container([^>]*)>(.*?)<\/mjx-container>/gs, (_match, attrs, content) => {
      const containerAttrs = String(attrs || '');
      let mathContent = String(content || '');
      // Check for block display mode
      // MathJax 3 usually adds display="true" or class="MathJax CtxtMenu_Attached_0" with separate style
      const isBlock = containerAttrs.includes('display="true"') || containerAttrs.includes('display: true');

      const tag = isBlock ? 'section' : 'span';

      // Inline math needs vertical alignment adjustment
      // Block math needs centering and scaling (not scrolling) as per WeChat behavior
      const style = isBlock
        ? 'display:block; width:100%; margin:1em auto; text-align:center; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;'
        : 'display:inline-block; vertical-align:middle; transform:translateY(-0.12em); margin:0 1px; line-height:1;';

      mathContent = normalizeMathPositionStyles(mathContent);

      // 关键修复：给块级公式的 SVG 添加 max-width: 100% 和 height: auto
      // 这样在手机上预览时，公式会按比例缩小以适应屏幕，而不是被遮挡或需要滚动
      // 这符合微信公众号的默认渲染行为
      if (isBlock) {
        mathContent = appendSvgStyle(mathContent, 'display:block; margin:0 auto; max-width:100%; height:auto; ');
      } else {
        mathContent = mathContent.replace(/vertical-align\s*:\s*[^;"]+;?/gi, '');
        mathContent = appendSvgStyle(mathContent, 'display:inline-block; max-width:300vw !important; height:auto; vertical-align:middle; ');
      }

      return `<${tag} data-owc-math="${isBlock ? 'block' : 'inline'}" style="${style}">${mathContent}</${tag}>`;
    });
  }

  /**
   * @param {string} html
   * @returns {string}
   */
  fixListParagraphs(html) {
    const style = this.getInlineStyle('li p');
    return html.replace(/<li[^>]*>[\s\S]*?<\/li>/g, m => m.replace(/<p style="[^"]*">/g, `<p style="${style}">`));
  }

  /**
   * @param {string} styleText
   * @param {string} property
   * @param {string} value
   * @returns {string}
   */
  replaceStyleDeclaration(styleText, property, value) {
    const style = String(styleText || '');
    const declaration = `${property}: ${value}`;
    const propertyPattern = new RegExp(`(^|;)\\s*${property}\\s*:\\s*[^;"]*`, 'i');

    if (propertyPattern.test(style)) {
      return style.replace(propertyPattern, (_match, prefix) => `${prefix ? `${prefix} ` : ''}${declaration}`);
    }

    const normalizedStyle = style.trim().replace(/;?\s*$/, '');
    return normalizedStyle ? `${normalizedStyle}; ${declaration}` : declaration;
  }

  /**
   * Keep blockquote padding in control while preserving intentional blank lines.
   * A blank line inside Markdown blockquotes renders as multiple paragraphs.
   */
  /**
   * @param {string} html
   * @returns {string}
   */
  removeBlockquoteParagraphMargins(html) {
    const containerTags = new Set([
      'blockquote', 'section', 'div', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot',
      'tr', 'th', 'td', 'ul', 'ol', 'li', 'pre', 'article', 'aside',
    ]);
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
    /** @type {{ containerDepth: number, paragraphs: { start: number, end: number, rawTag: string, styleText: string }[] }[]} */
    const blockquoteStack = [];
    /** @type {{ start: number, end: number, value: string }[]} */
    const replacements = [];
    const tagPattern = /<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?>/g;

    let match;
    while ((match = tagPattern.exec(html)) !== null) {
      const rawTag = match[0];
      const tagName = String(match[1] || '').toLowerCase();
      const isClosing = /^<\//.test(rawTag);
      const isSelfClosing = /\/\s*>$/.test(rawTag) || voidTags.has(tagName);

      if (tagName === 'blockquote') {
        if (isClosing) {
          const frame = blockquoteStack.pop();
          if (frame) {
            const paragraphCount = frame.paragraphs.length;
            frame.paragraphs.forEach((paragraph, index) => {
              const isLastParagraph = index === paragraphCount - 1;
              const marginValue = paragraphCount > 1 && !isLastParagraph ? '0 0 0.8em 0' : '0';
              const updatedStyle = this.replaceStyleDeclaration(paragraph.styleText, 'margin', marginValue);
              replacements.push({
                start: paragraph.start,
                end: paragraph.end,
                value: paragraph.rawTag.replace(/style="([^"]*)"/, `style="${updatedStyle}"`),
              });
            });
          }
          if (blockquoteStack.length > 0) {
            const parentFrame = blockquoteStack[blockquoteStack.length - 1];
            parentFrame.containerDepth = Math.max(0, parentFrame.containerDepth - 1);
          }
        } else {
          if (blockquoteStack.length > 0) {
            blockquoteStack[blockquoteStack.length - 1].containerDepth += 1;
          }
          blockquoteStack.push({ containerDepth: 0, paragraphs: [] });
        }
        continue;
      }

      if (blockquoteStack.length === 0) continue;

      const frame = blockquoteStack[blockquoteStack.length - 1];
      if (!isClosing && tagName === 'p') {
        const styleMatch = rawTag.match(/\bstyle="([^"]*)"/);
        if (styleMatch && frame.containerDepth === 0) {
          frame.paragraphs.push({
            start: match.index,
            end: match.index + rawTag.length,
            rawTag,
            styleText: styleMatch[1],
          });
        } else if (styleMatch) {
          const updatedStyle = this.replaceStyleDeclaration(styleMatch[1], 'margin', '0');
          replacements.push({
            start: match.index,
            end: match.index + rawTag.length,
            value: rawTag.replace(/style="([^"]*)"/, `style="${updatedStyle}"`),
          });
        }
        continue;
      }

      if (!containerTags.has(tagName) || tagName === 'p') continue;
      if (isClosing) {
        frame.containerDepth = Math.max(0, frame.containerDepth - 1);
      } else if (!isSelfClosing) {
        frame.containerDepth += 1;
      }
    }

    return replacements
      .sort((a, b) => b.start - a.start)
      .reduce((output, replacement) => (
        output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end)
      ), html);
  }

  /**
   * Fix: Unwrap <figure> from <p> tags
   * Markdown-it wraps images in <p> by default, but <figure> inside <p> is invalid.
   * Browsers (and WeChat) handle this by splitting the <p> into two empty <p>s above and below,
   * causing unwanted empty lines. This regex removes the wrapping <p>.
   */
  /**
   * @param {string} html
   * @returns {string}
   */
  unwrapFigures(html) {
    // Logic: Match <p ...> <figure>...</figure> </p> and replace with <figure>...</figure>
    return html.replace(/<p[^>]*>\s*(<figure[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1');
  }

  /**
   * @param {unknown} url
   * @param {boolean} [isImage]
   * @returns {string}
   */
  validateLink(url, isImage = false) {
    if (!url) return '#';
    const value = String(url).trim();
    if (!value) return '#';

    // Keep legacy parity: allow raw data:image src in image context.
    // Non-image data: remains blocked.
    if (/^data:/i.test(value)) {
      if (!isImage) return '#unsafe';
      return /^data:image\//i.test(value) ? value : '#';
    }

    // Allow safe protocols
    const safeProtocols = ['http:', 'https:', 'obsidian:', 'mailto:', 'tel:', 'app:', 'capacitor:'];

    try {
      // URL constructor might fail for some internal links or malformed data URIs
      const parsed = new URL(value);
      if (safeProtocols.includes(parsed.protocol)) {
        return value;
      }
    } catch {
      // Handle relative paths or Obsidian internal links that URL() can't parse
      if (value.startsWith('#') || value.startsWith('/') || !value.includes(':')) return value;
    }
    return '#'; // Block javascript: and other dangerous protocols
  }

  /**
   * @param {string} html
   * @returns {string}
   */
  sanitizeHtml(html) {
    // 1. Remove dangerous tags and their content
    let sanitized = html.replace(/<(script|iframe|object|embed|form|input|button|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // 2. Remove self-closing dangerous tags
    sanitized = sanitized.replace(/<(script|iframe|object|embed|form|input|button|style)[^>]*\/?>/gi, '');
    // 3. Remove document wrapper tags/comments that may appear when users paste browser fragments.
    sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
    sanitized = sanitized.replace(/<\/?(?:html|body|head|meta|title|link)[^>]*>/gi, '');
    // 4. Remove all on* event handlers (e.g., onerror, onclick)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

    // 5. Sanitize href and src in remaining HTML tags to prevent protocol bypass (e.g. <a href="javascript:...")
    sanitized = sanitized.replace(/<(a|img|source|video|audio|area)\b([^>]*)>/gi, (_match, tag, attrs) => {
      const tagName = String(tag || '');
      const isImageTag = /^(img|source)$/i.test(tagName);
      let newAttrs = String(attrs || '').replace(/\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_attrMatch, attrName, qVal, sqVal, uVal) => {
        const val = String(qVal || sqVal || uVal || '');
        const safeVal = this.validateLink(val, isImageTag);
        const quote = qVal !== undefined ? '"' : (sqVal !== undefined ? "'" : '"');
        return `${attrName}=${quote}${safeVal}${quote}`;
      });
      return `<${tagName}${newAttrs}>`;
    });

    return sanitized;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  escapeHtml(text) {
    /** @type {Record<string, string>} */
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => entities[m] || m);
  }

  /**
   * @param {string} src
   * @returns {string}
   */
  extractFileName(src) {
    if (!src) return '图片';
    return src.split('/').pop().split('\\').pop().replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '') || '图片';
  }
}

APPLE_CONVERTER_GLOBAL.AppleStyleConverter = AppleStyleConverter;
if (typeof window !== 'undefined') {
  window.AppleStyleConverter = AppleStyleConverter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppleStyleConverter;
}
