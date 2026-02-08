/**
 * 🍎 Apple Style Markdown 转换器
 * 直接照抄 wechat-tool 的代码块实现
 * 针对微信公众号优化：使用 section 结构，增强兼容性
 */

// Callout 图标配置（颜色跟随主题色）
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

window.AppleStyleConverter = class AppleStyleConverter {
  constructor(theme, avatarUrl = '', showImageCaption = true, app = null, sourcePath = '') {
    this.theme = theme;
    this.avatarUrl = avatarUrl;
    this.showImageCaption = showImageCaption;
    this.app = app; // Obsidian App instance
    this.sourcePath = sourcePath; // Current file path for relative resolution
    this.md = null;
    this.hljs = null;
  }

  async initMarkdownIt() {
    if (this.md) return;
    if (typeof markdownit === 'undefined') throw new Error('markdown-it 未加载');
    this.hljs = typeof hljs !== 'undefined' ? hljs : null;
    this.md = markdownit({ html: true, breaks: true, linkify: true, typographer: true });

    // Enable MathJax if available
    if (window.ObsidianWechatMath) {
      window.ObsidianWechatMath(this.md);
    }

    this.setupRenderRules();
  }

  reinit() { this.md = null; }

  updateConfig(config) {
    if (config.showImageCaption !== undefined) {
      this.showImageCaption = config.showImageCaption;
    }
    if (config.avatarUrl !== undefined) {
      this.avatarUrl = config.avatarUrl;
    }
  }

  updateSourcePath(path) {
    this.sourcePath = path;
  }

  resolveImagePath(src) {
    if (!this.app) return src;
    // IF remote url, bypass
    if (/^(https?:\/\/|data:)/i.test(src)) return src;

    try {
      // Markdown-it might encode the URL (e.g. %20 for space), but Obsidian expects decoded paths
      const linkPath = decodeURI(src);
      const sourcePath = this.sourcePath;
      // Resolve using Obsidian's standard API
      const tFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
      if (tFile) {
        return this.app.vault.getResourcePath(tFile);
      }
    } catch (e) {
      console.error('Image resolution failed:', src, e);
    }
    return src;
  }

  setupRenderRules() {
    // Callout & Blockquote 智能检测渲染
    this.md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
      // 查找 blockquote 内的第一个文本内容，检测是否为 callout 语法
      const calloutInfo = this.detectCallout(tokens, idx);

      // 使用栈管理 callout 状态，支持嵌套
      if (!env._calloutStack) env._calloutStack = [];
      env._calloutStack.push(calloutInfo);

      if (calloutInfo) {
        return this.renderCalloutOpen(calloutInfo);
      }
      // 普通 blockquote
      return `<blockquote style="${this.getInlineStyle('blockquote')}">`;
    };

    this.md.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
      const calloutInfo = env._calloutStack ? env._calloutStack.pop() : null;
      if (calloutInfo) {
        return `</section></section>`; // 关闭内容区和外层容器
      }
      return `</blockquote>`;
    };

    this.md.renderer.rules.paragraph_open = (tokens, idx) => {
      if (tokens[idx].hidden) return '';
      return `<p style="${this.getInlineStyle('p')}">`;
    };

    this.md.renderer.rules.paragraph_close = (tokens, idx) => {
      if (tokens[idx].hidden) return '';
      return `</p>`;
    };
    this.md.renderer.rules.heading_open = (tokens, idx) => `<${tokens[idx].tag} style="${this.getInlineStyle(tokens[idx].tag)}">`;
    this.md.renderer.rules.bullet_list_open = () => `<ul style="${this.getInlineStyle('ul')}">`;
    this.md.renderer.rules.ordered_list_open = () => `<ol style="${this.getInlineStyle('ol')}">`;
    this.md.renderer.rules.list_item_open = () => `<li style="${this.getInlineStyle('li')}">`;

    this.md.renderer.rules.code_inline = (tokens, idx) =>
      `<code style="${this.getInlineStyle('code')}">${this.escapeHtml(tokens[idx].content)}</code>`;

    this.md.renderer.rules.fence = (tokens, idx) => {
      const content = tokens[idx].content;
      const lang = tokens[idx].info || 'text';
      return this.createCodeBlock(content, lang);
    };

    this.md.renderer.rules.link_open = (tokens, idx) => {
      const href = tokens[idx].attrGet('href');
      const safeHref = this.validateLink(href);
      return `<a href="${safeHref}" style="${this.getInlineStyle('a')}">`;
    };
    this.md.renderer.rules.strong_open = () => `<strong style="${this.getInlineStyle('strong')}">`;
    this.md.renderer.rules.em_open = () => `<em style="${this.getInlineStyle('em')}">`;
    this.md.renderer.rules.s_open = () => `<del style="${this.getInlineStyle('del')}">`;

    this.md.renderer.rules.image = (tokens, idx) => {
      let src = tokens[idx].attrGet('src');
      const alt = tokens[idx].content;

      // Resolve Local Path for Preview
      src = this.resolveImagePath(src);


      let caption = '';

      if (!alt) {
        // Logic 1: ![]() -> Extract filename, clean query/ext
        caption = decodeURIComponent(this.extractFileName(src));
        caption = caption.replace(/\?.*$/, '');
        caption = caption.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
      } else {
        // Logic 2: ![alt]() -> Use alt, clean resize/ext
        caption = alt;
        caption = caption.replace(/\|\s*\d+(x\d+)?\s*$/, '');
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
      if (this.showImageCaption) {
        return `<figure style="${simpleFigureStyle}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"><figcaption style="${this.getInlineStyle('figcaption')}">${caption}</figcaption></figure>`;
      } else {
        return `<figure style="${simpleFigureStyle}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"></figure>`;
      }
    };

    this.md.renderer.rules.hr = () => `<hr style="${this.getInlineStyle('hr')}">`;
    this.md.renderer.rules.table_open = () => `<table style="${this.getInlineStyle('table')}">`;
    this.md.renderer.rules.thead_open = () => `<thead style="${this.getInlineStyle('thead')}">`;
    this.md.renderer.rules.th_open = () => `<th style="${this.getInlineStyle('th')}">`;
    this.md.renderer.rules.td_open = () => `<td style="${this.getInlineStyle('td')}">`;
  }

  /**
   * 检测 blockquote 是否为 Callout 语法
   * 并清理 marker 标识符
   * @param {Array} tokens - markdown-it tokens
   * @param {number} idx - blockquote_open 的索引
   * @returns {Object|null} - callout 信息 { type, title, icon, label } 或 null
   */
  detectCallout(tokens, idx) {
    // 查找 blockquote 内的第一个 inline token
    for (let i = idx + 1; i < tokens.length; i++) {
      if (tokens[i].type === 'blockquote_close') break;
      if (tokens[i].type === 'inline' && tokens[i].content) {
        // 只取第一行内容进行匹配
        const firstLine = tokens[i].content.split('\n')[0];
        const match = firstLine.match(/^\[!(\w+)\](?:\s+(.*))?/);
        if (match) {
          const type = match[1].toLowerCase();
          const customTitle = match[2] ? match[2].trim() : null;
          const config = CALLOUT_ICONS[type] || { icon: '📌', label: type };
          const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1);

          // --- 在 Token 阶段清理 Marker ---
          // 1. 更新 content：移除包含 marker 的第一行
          const lines = tokens[i].content.split('\n');
          lines.shift();
          tokens[i].content = lines.join('\n');

          // 2. 更新 children：同步移除第一行对应的 tokens
          if (tokens[i].children) {
            const breakIdx = tokens[i].children.findIndex(c => c.type === 'softbreak' || c.type === 'hardbreak');
            if (breakIdx !== -1) {
              // 移除第一个换行符及其之前的所有内容
              tokens[i].children = tokens[i].children.slice(breakIdx + 1);
            } else {
              // 只有一行，直接清空
              tokens[i].children = [];
            }
          }

          // 3. 如果该段落变为空（说明 marker 独占一行），隐藏该段落容器
          if (tokens[i].content.trim() === '') {
            if (i > 0 && tokens[i-1].type === 'paragraph_open') tokens[i-1].hidden = true;
            tokens[i].hidden = true; // 隐藏 inline token 本身
            if (i < tokens.length - 1 && tokens[i+1].type === 'paragraph_close') tokens[i+1].hidden = true;
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
   * @param {Object} calloutInfo - { type, title, icon }
   * @returns {string} - HTML 字符串
   */
  renderCalloutOpen(calloutInfo) {
    const color = this.theme.getThemeColorValue();
    const sizes = this.theme.getSizes();
    const font = this.theme.getFontFamily();
    const themeName = this.theme.themeName;

    // 优雅主题：居中样式（与其引用块风格一致）
    if (themeName === 'serif') {
      return this.renderCalloutOpenCentered(calloutInfo, color, sizes, font);
    }

    // 简约/经典主题：左边框样式
    const isWechat = themeName === 'wechat';
    const marginLeft = isWechat ? '4px' : '0';
    const borderWidth = isWechat ? '3px' : '4px';
    const borderColor = isWechat ? `${color}99` : color;

    // 外层容器：左边框风格
    const containerStyle = `
      margin: 16px 0 16px ${marginLeft};
      border-left: ${borderWidth} solid ${borderColor};
      background: ${color}1A;
      border-radius: 3px;
      overflow: hidden;
    `.replace(/\s+/g, ' ').trim();

    // 标题栏：深色背景 + 图标 + 标题
    const headerStyle = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: ${color}26;
      font-weight: bold;
      font-size: ${sizes.base}px;
      font-family: ${font};
      color: #333;
    `.replace(/\s+/g, ' ').trim();

    const iconStyle = `margin-right: 8px; font-size: ${sizes.base + 2}px;`;
    const titleStyle = `flex: 1;`;

    // 内容区：正文内容
    const contentStyle = `
      padding: 12px 16px;
      font-size: ${sizes.base}px;
      line-height: 1.8;
      color: #595959;
    `.replace(/\s+/g, ' ').trim();

    return `<section style="${containerStyle}">
      <section style="${headerStyle}">
        <span style="${iconStyle}">${calloutInfo.icon}</span>
        <span style="${titleStyle}">${calloutInfo.title}</span>
      </section>
      <section style="${contentStyle}">`;
  }

  /**
   * 渲染居中样式的 Callout（用于优雅主题）
   * @param {Object} calloutInfo - { type, title, icon }
   * @param {string} color - 主题色
   * @param {Object} sizes - 字体尺寸配置
   * @param {string} font - 字体族
   * @returns {string} - HTML 字符串
   */
  renderCalloutOpenCentered(calloutInfo, color, sizes, font) {
    // 居中样式：无左边框，水平居中，圆角边框
    const containerStyle = `
      margin: 30px 60px;
      background: ${color}1F;
      border-radius: 4px;
      overflow: hidden;
    `.replace(/\s+/g, ' ').trim();

    // 标题栏：靠左对齐，与其他主题保持一致
    const headerStyle = `
      display: flex;
      align-items: center;
      padding: 12px 20px;
      background: ${color}26;
      font-weight: bold;
      font-size: ${sizes.base}px;
      font-family: ${font};
      color: #333;
    `.replace(/\s+/g, ' ').trim();

    const contentStyle = `
      padding: 16px 20px;
      font-size: ${sizes.base}px;
      line-height: 1.8;
      color: #555;
      text-align: center;
    `.replace(/\s+/g, ' ').trim();

    return `<section style="${containerStyle}">
      <section style="${headerStyle}">
        <span style="margin-right: 8px;">${calloutInfo.icon}</span>
        <span>${calloutInfo.title}</span>
      </section>
      <section style="${contentStyle}">`;
  }

  highlightCode(code, lang) {
    if (!this.hljs) return this.escapeHtml(code);
    try {
      if (lang && this.hljs.getLanguage(lang)) return this.hljs.highlight(code, { language: lang }).value;
      return this.hljs.highlightAuto(code).value;
    } catch (e) { return this.escapeHtml(code); }
  }

  /**
   * 格式化高亮代码（参考 wechat-tool formatHighlightedCode）
   */
  formatHighlightedCode(html, preserveNewlines = false) {
    let formatted = html;
    // 将 span 之间的空格移到 span 内部
    formatted = formatted.replace(/(<span[^>]*>[^<]*<\/span>)(\s+)(<span[^>]*>[^<]*<\/span>)/g,
      (_, span1, spaces, span2) => span1 + span2.replace(/^(<span[^>]*>)/, `$1${spaces}`));
    formatted = formatted.replace(/(\s+)(<span[^>]*>)/g,
      (_, spaces, span) => span.replace(/^(<span[^>]*>)/, `$1${spaces}`));
    // 替换制表符为4个空格
    formatted = formatted.replace(/\t/g, '    ');

    // wechat-tool 的逻辑：如果是 lineNumbers 模式（preserveNewlines=false），将空格转为 &nbsp;
    // 如果不是（preserveNewlines=true），将换行转为 <br/> 且空格转为 &nbsp;
    if (preserveNewlines) {
      formatted = formatted
        .replace(/\r\n/g, '<br/>')
        .replace(/\n/g, '<br/>')
        .replace(/(>[^<]+)|(^[^<]+)/g, str => str.replace(/\s/g, '&nbsp;'));
    } else {
      formatted = formatted.replace(/(>[^<]+)|(^[^<]+)/g, str => str.replace(/\s/g, '&nbsp;'));
    }
    return formatted;
  }

  inlineHighlightStyles(html) {
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
      const classes = classNames.split(/\s+/);
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
    const macHeader = showMac ? `<section style="display:block !important;background:${barBackground} !important;padding:10px !important;border:none !important;border-bottom:1px solid ${borderColor} !important;border-radius:8px 8px 0 0 !important;line-height:1 !important;">
      <span style="display:inline-block !important;width:12px !important;height:12px !important;border-radius:50% !important;background:#ff5f57 !important;margin-right:8px !important;"></span>
      <span style="display:inline-block !important;width:12px !important;height:12px !important;border-radius:50% !important;background:#ffbd2e !important;margin-right:8px !important;"></span>
      <span style="display:inline-block !important;width:12px !important;height:12px !important;border-radius:50% !important;background:#28c840 !important;"></span>
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

      const codeLinesHtml = `<section style="white-space:nowrap !important;display:inline-block !important;min-width:100% !important;line-height:${lineHeight} !important;font-size:13px !important;">${codeInnerHtml}</section>`;

      // 行号列容器样式
      const lineNumberColumnStyles = `text-align:right !important;padding:12px 0 12px 0 !important;border-right:1px solid rgba(255,255,255,0.1) !important;user-select:none !important;background:transparent !important;flex:0 0 auto !important;min-width:3.5em !important;margin:0 !important;`;

      // 注意 flex 容器的 padding 0，内部 padding 分别在 lineNumberColumn 和 code section
      codeHtml = `<section style="display:flex !important;align-items:flex-start !important;overflow-x:hidden !important;overflow-y:visible !important;width:100% !important;padding:0 !important;margin:0 !important;">
        <section style="${lineNumberColumnStyles}">${lineNumbersHtml}</section>
        <section style="flex:1 1 auto !important;overflow-x:auto !important;overflow-y:visible !important;padding:12px 12px 12px 16px !important;margin:0 !important;min-width:0 !important;">${codeLinesHtml}</section>
      </section>`;
    } else {
      // 无行号
      const highlighted = this.highlightCode(lines.join('\n'), lang);
      const styled = this.inlineHighlightStyles(highlighted);
      // preserveNewlines=true -> 包含 <br>
      const formatted = this.formatHighlightedCode(styled, true);
      // 改动：white-space: nowrap !important
      const codeLinesHtml = `<section style="white-space:nowrap !important;display:inline-block !important;min-width:100% !important;word-break:keep-all !important;overflow-wrap:normal !important;line-height:${lineHeight} !important;font-size:13px !important;margin:0 !important;">${formatted}</section>`;

      codeHtml = `<section style="display:flex !important;align-items:flex-start !important;overflow-x:hidden !important;overflow-y:visible !important;width:100% !important;padding:0 !important;margin:0 !important;">
        <section style="flex:1 1 auto !important;overflow-x:auto !important;overflow-y:visible !important;padding:12px !important;min-width:0 !important;margin:0 !important;">${codeLinesHtml}</section>
      </section>`;
    }

    // 外层容器
    return `<section class="code-snippet__fix" style="width:100% !important;margin:12px 0 !important;background:${background} !important;border:1px solid ${borderColor} !important;border-radius:8px !important;overflow:hidden !important;box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;display:block !important;">
${macHeader}
<section style="padding:0 !important;border:none !important;background:${background} !important;color:${color} !important;font-family:'SF Mono',Consolas,Monaco,monospace !important;font-size:13px !important;line-height:${lineHeight} !important;white-space:nowrap !important;overflow-x:auto !important;display:block !important;">
<pre style="margin:0 !important;padding:0 !important;background:${background} !important;font-family:inherit !important;font-size:13px !important;line-height:inherit !important;color:${color} !important;white-space:nowrap !important;overflow-x:visible !important;display:inline-block !important;min-width:100% !important;">${codeHtml}</pre>
</section>
</section>`;
  }

  getInlineStyle(tagName) { return this.theme.getStyle(tagName); }
  stripFrontmatter(md) { return md.replace(/^---\n[\s\S]*?\n---\n?/, ''); }


  async convert(markdown) {
    if (!this.md) await this.initMarkdownIt();

    // 修复：移除块级公式 $$ 前面的缩进，避免被误识别为代码块
    // 仅匹配行首的空白 + $$，不影响其他缩进
    markdown = markdown.replace(/^[\t ]+(\$\$)/gm, '$1');

    // Pre-process: Convert Wiki-links ![[...]] to standard images ![](...)
    // Regex: ![[path|alt]] or ![[path]]
    // Fix: Use more robust regex preventing greedy capture and encoding URI for paths with spaces
    markdown = markdown.replace(/!\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g, (match, path, alt) => {
      // Must encodeURI to handle spaces in filenames which are valid in WikiLinks but break standard Markdown images
      // trimmed path to avoid leading/trailing spaces breaking the link
      return `![${alt || ''}](${encodeURI(path.trim())})`;
    });



    let html = this.md.render(this.stripFrontmatter(markdown));
    html = this.fixListParagraphs(html);
    html = this.unwrapFigures(html); // Fix: Remove <p> wrappers from <figure> to prevent empty lines
    html = this.removeBlockquoteParagraphMargins(html); // Fix: Remove margins from <p> inside <blockquote> for vertical centering
    html = this.fixMathJaxTags(html); // Fix: Replace <mjx-container> with WeChat-compatible tags
    html = this.sanitizeHtml(html); // Final security pass: Neutralize XSS and dangerous tags
    return `<section style="${this.getInlineStyle('section')}">${html}</section>`;
  }

  fixMathJaxTags(html) {
    if (!html.includes('mjx-container')) return html;

    // Fix: Remove assistive MathML (hidden text that shows up in WeChat)
    html = html.replace(/<mjx-assistive-mml[^>]*>[\s\S]*?<\/mjx-assistive-mml>/gi, '');

    // Replace <mjx-container> with <section> (block) or <span> (inline)
    // WeChat strips custom tags like mjx-container but keeps SVG content
    return html.replace(/<mjx-container([^>]*)>(.*?)<\/mjx-container>/gs, (match, attrs, content) => {
      // Check for block display mode
      // MathJax 3 usually adds display="true" or class="MathJax CtxtMenu_Attached_0" with separate style
      const isBlock = attrs.includes('display="true"') || attrs.includes('display: true');

      const tag = isBlock ? 'section' : 'span';

      // Inline math needs vertical alignment adjustment
      // Block math needs centering and scaling (not scrolling) as per WeChat behavior
      const style = isBlock
        ? 'display: block; margin: 1em 0; text-align: center; max-width: 100%;'
        : 'display: inline-block; vertical-align: -0.1em; margin: 0 1px;';

      // 关键修复：给块级公式的 SVG 添加 max-width: 100% 和 height: auto
      // 这样在手机上预览时，公式会按比例缩小以适应屏幕，而不是被遮挡或需要滚动
      // 这符合微信公众号的默认渲染行为
      if (isBlock) {
        content = content.replace(/<svg([^>]*)>/, (m, svgAttrs) => {
          if (svgAttrs.includes('style="')) {
            return `<svg${svgAttrs.replace('style="', 'style="max-width: 100%; height: auto; ')}>`;
          } else {
            return `<svg${svgAttrs} style="max-width: 100%; height: auto;">`;
          }
        });
      }

      return `<${tag} style="${style}">${content}</${tag}>`;
    });
  }

  fixListParagraphs(html) {
    const style = this.getInlineStyle('li p');
    return html.replace(/<li[^>]*>[\s\S]*?<\/li>/g, m => m.replace(/<p style="[^"]*">/g, `<p style="${style}">`));
  }

  /**
   * Fix: Remove margins from <p> inside <blockquote>
   * Blockquotes use padding for spacing. If <p> inside has margin-bottom (default),
   * the text appears top-aligned instead of centered.
   */
  removeBlockquoteParagraphMargins(html) {
    return html.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (match, content) => {
      // Replace margin: ... with margin: 0 in <p> styles
      const newContent = content.replace(/<p style="([^"]*)margin:[^;"]*(;?)/g, '<p style="$1margin: 0$2');
      // Also handle case where margin is not present yet (less likely if style plugin is used)
      // or if we want to force it.
      // Since we know our theme adds margin to all p, we just override it.
      // Actually, regex replace above handles "margin:..." replacement.
      // If margin is at the end or middle.
      return match.replace(content, newContent);
    });
  }

  /**
   * Fix: Unwrap <figure> from <p> tags
   * Markdown-it wraps images in <p> by default, but <figure> inside <p> is invalid.
   * Browsers (and WeChat) handle this by splitting the <p> into two empty <p>s above and below,
   * causing unwanted empty lines. This regex removes the wrapping <p>.
   */
  unwrapFigures(html) {
    // Logic: Match <p ...> <figure>...</figure> </p> and replace with <figure>...</figure>
    return html.replace(/<p[^>]*>\s*(<figure[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1');
  }

  validateLink(url, isImage = false) {
    if (!url) return '#';
    // Allow safe protocols
    // data: is only allowed for images
    const safeProtocols = ['http:', 'https:', 'obsidian:', 'mailto:', 'tel:', 'app:', 'capacitor:'];
    if (isImage) safeProtocols.push('data:');

    try {
      // URL constructor might fail for some internal links or malformed data URIs
      const parsed = new URL(url);
      if (safeProtocols.includes(parsed.protocol)) return url;

      // If it's a data: URI but not an image context, neutralize it explicitly
      if (parsed.protocol === 'data:' && !isImage) return '#unsafe';
    } catch (e) {
      // Handle relative paths or Obsidian internal links that URL() can't parse
      if (url.startsWith('#') || url.startsWith('/') || !url.includes(':')) return url;
    }
    return '#'; // Block javascript: and other dangerous protocols
  }

  sanitizeHtml(html) {
    // 1. Remove dangerous tags and their content
    let sanitized = html.replace(/<(script|iframe|object|embed|form|input|button|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // 2. Remove self-closing dangerous tags
    sanitized = sanitized.replace(/<(script|iframe|object|embed|form|input|button|style)[^>]*\/?>/gi, '');
    // 3. Remove all on* event handlers (e.g., onerror, onclick)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

    // 4. Sanitize href and src in remaining HTML tags to prevent protocol bypass (e.g. <a href="javascript:...")
    sanitized = sanitized.replace(/<(a|img|source|video|audio|area)\b([^>]*)>/gi, (match, tag, attrs) => {
      const isImageTag = /^(img|source)$/i.test(tag);
      let newAttrs = attrs.replace(/\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (attrMatch, attrName, qVal, sqVal, uVal) => {
        const val = qVal || sqVal || uVal || '';
        const safeVal = this.validateLink(val, isImageTag);
        const quote = qVal !== undefined ? '"' : (sqVal !== undefined ? "'" : '"');
        return `${attrName}=${quote}${safeVal}${quote}`;
      });
      return `<${tag}${newAttrs}>`;
    });

    return sanitized;
  }

  escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  extractFileName(src) {
    if (!src) return '图片';
    return src.split('/').pop().split('\\').pop().replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '') || '图片';
  }
}

window.AppleStyleConverter = AppleStyleConverter;
