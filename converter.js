/**
 * 🍎 Apple Style Markdown 转换器
 * 直接照抄 wechat-tool 的代码块实现
 * 针对微信公众号优化：使用 section 结构，增强兼容性
 */


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
    this.md.renderer.rules.paragraph_open = () => `<p style="${this.getInlineStyle('p')}">`;
    this.md.renderer.rules.heading_open = (tokens, idx) => `<${tokens[idx].tag} style="${this.getInlineStyle(tokens[idx].tag)}">`;
    this.md.renderer.rules.blockquote_open = () => `<blockquote style="${this.getInlineStyle('blockquote')}">`;
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

    this.md.renderer.rules.link_open = (tokens, idx) => `<a href="${tokens[idx].attrGet('href')}" style="${this.getInlineStyle('a')}">`;
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

  escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  extractFileName(src) {
    if (!src) return '图片';
    return src.split('/').pop().split('\\').pop().replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '') || '图片';
  }
}

window.AppleStyleConverter = AppleStyleConverter;
