/**
 * 🍎 Apple Style Markdown 转换器
 * 直接照抄 wechat-tool 的代码块实现
 * 针对微信公众号优化：使用 section 结构，增强兼容性
 */

window.AppleStyleConverter = class AppleStyleConverter {
  constructor(theme, avatarUrl = '', showImageCaption = true) {
    this.theme = theme;
    this.avatarUrl = avatarUrl;
    this.showImageCaption = showImageCaption;
    this.md = null;
    this.hljs = null;
  }

  async initMarkdownIt() {
    if (this.md) return;
    if (typeof markdownit === 'undefined') throw new Error('markdown-it 未加载');
    this.hljs = typeof hljs !== 'undefined' ? hljs : null;
    this.md = markdownit({ html: true, breaks: true, linkify: true, typographer: true });
    this.setupRenderRules();
  }

  reinit() { this.md = null; }

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
      const src = tokens[idx].attrGet('src'), alt = tokens[idx].content;
      // 优先使用 alt，如果没有则从 src 提取文件名
      let caption = alt || this.extractFileName(src);

      // 1. 先去除 Obsidian 尺寸参数 (例如 |100, |200x100), 这样后缀若在中间也能被正确处理
      caption = caption.replace(/\|\s*\d+(x\d+)?\s*$/, '');
      // 2. 再去除文件后缀 (现在它应该在字符串末尾了)
      caption = caption.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');

      if (this.avatarUrl) {
        // 水印模式：显示头像 + 图片名称
        const avatarHeaderStyle = this.getInlineStyle('avatar-header');
        const spacerStyle = 'display:block;height:8px;line-height:8px;font-size:0;';
        return `<figure style="${this.getInlineStyle('figure')}"><div style="${avatarHeaderStyle}"><img src="${this.avatarUrl}" alt="logo" style="${this.getInlineStyle('avatar')}"><span style="${this.getInlineStyle('avatar-caption')}">${caption}</span></div><section style="${spacerStyle}">&nbsp;</section><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"></figure>`;
      }

      // 非水印模式：根据 showImageCaption 决定是否显示说明文字
      if (this.showImageCaption) {
        return `<figure style="${this.getInlineStyle('figure')}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"><figcaption style="${this.getInlineStyle('figcaption')}">${caption}</figcaption></figure>`;
      } else {
        return `<figure style="${this.getInlineStyle('figure')}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"></figure>`;
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
    await this.initMarkdownIt();
    let html = this.md.render(this.stripFrontmatter(markdown));
    html = this.fixListParagraphs(html);
    return `<section style="${this.getInlineStyle('section')}">${html}</section>`;
  }

  fixListParagraphs(html) {
    const style = this.getInlineStyle('li p');
    return html.replace(/<li[^>]*>[\s\S]*?<\/li>/g, m => m.replace(/<p style="[^"]*">/g, `<p style="${style}">`));
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
