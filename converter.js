/**
 * 🍎 Apple Style Markdown 转换器
 * 使用 wechat-tool 的 white-space:nowrap + inline-block 方案
 */

class AppleStyleConverter {
  constructor(theme, avatarUrl = '') {
    this.theme = theme;
    this.avatarUrl = avatarUrl;
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
      const caption = alt || this.extractFileName(src);
      if (this.avatarUrl) {
        return `<figure style="${this.getInlineStyle('figure')}"><div style="${this.getInlineStyle('avatar-header')}"><img src="${this.avatarUrl}" alt="logo" style="${this.getInlineStyle('avatar')}"><figcaption style="${this.getInlineStyle('figcaption')}">${caption}</figcaption></div><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"></figure>`;
      }
      return `<figure style="${this.getInlineStyle('figure')}"><img src="${src}" alt="${alt}" style="${this.getInlineStyle('img')}"><figcaption style="${this.getInlineStyle('figcaption')}">${caption}</figcaption></figure>`;
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
    let result = html;
    for (const [cls, style] of Object.entries(map)) {
      result = result.replace(new RegExp(`class="${cls}"`, 'g'), `style="${style}"`);
    }
    return result.replace(/class="[^"]*"/g, '');
  }

  /**
   * 创建代码块 - 使用 wechat-tool 的 white-space:nowrap 方案
   */
  createCodeBlock(content, lang) {
    const showMac = this.theme.macCodeBlock;
    const showLineNum = this.theme.codeLineNumber;

    let lines = content.replace(/\r\n/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

    // 高亮
    const highlighted = this.highlightCode(lines.join('\n'), lang);
    const styled = this.inlineHighlightStyles(highlighted);

    // 处理内容：换行转 <br/>，空格转 &nbsp;（参考 wechat-tool）
    let processedContent = styled;
    if (styled.includes('<span style=')) {
      // 有语法高亮
      processedContent = styled
        .replace(/\n/g, '<br/>')
        .replace(/(\s+)(<span)/g, (m, sp, span) => sp.replace(/ /g, '&nbsp;') + span)
        .replace(/(<\/span>)(\s+)/g, (m, span, sp) => span + sp.replace(/ /g, '&nbsp;'));
    } else {
      // 无语法高亮
      processedContent = styled
        .replace(/\n/g, '<br/>')
        .replace(/^(\s+)/gm, m => m.replace(/ /g, '&nbsp;'));
    }

    // Mac 头部（只有红绿灯）
    const macHeader = showMac ? `<div style="background:#0f0f0f !important;padding:4px 8px !important;border:none !important;">
      <span style="display:inline-block !important;width:8px !important;height:8px !important;border-radius:50% !important;background:#ff5f57 !important;margin-right:6px !important;"></span>
      <span style="display:inline-block !important;width:8px !important;height:8px !important;border-radius:50% !important;background:#ffbd2e !important;margin-right:6px !important;"></span>
      <span style="display:inline-block !important;width:8px !important;height:8px !important;border-radius:50% !important;background:#28c840 !important;"></span>
    </div>` : '';

    // 代码内容
    let codeHtml;
    if (showLineNum) {
      // 带行号：使用 nobr 包裹每行
      const styledLines = styled.split('\n');
      const linesHtml = styledLines.map((line, idx) => {
        const lineContent = line
          .replace(/(\s+)(<span)/g, (m, sp, span) => sp.replace(/ /g, '&nbsp;') + span)
          .replace(/(<\/span>)(\s+)/g, (m, span, sp) => span + sp.replace(/ /g, '&nbsp;'))
          .replace(/^(\s+)/gm, m => m.replace(/ /g, '&nbsp;')) || '&nbsp;';
        const lnSpan = `<span style="user-select:none !important;opacity:0.6 !important;display:inline-block !important;width:2.8em !important;text-align:right !important;padding-right:0.75em !important;">${idx + 1}&nbsp;</span>`;
        return `<nobr>${lnSpan}${lineContent}</nobr>`;
      }).join('<br>');
      codeHtml = linesHtml;
    } else {
      // 无行号：直接使用 pre
      codeHtml = processedContent;
    }

    // 使用 div 结构 + white-space:nowrap + overflow-x:scroll（参考 wechat-tool）
    return `<div style="width:100% !important;margin:12px 0 !important;background:#1e1e1e !important;border:1px solid #1a1a1a !important;border-radius:6px !important;overflow:hidden !important;">
${macHeader}
<div style="padding:12px !important;border:none !important;background:#1e1e1e !important;color:#e6e6e6 !important;font-family:'SF Mono',Consolas,Monaco,monospace !important;font-size:12px !important;line-height:1.6 !important;white-space:nowrap !important;overflow-x:scroll !important;">
<pre style="margin:0 !important;padding:0 !important;background:#1e1e1e !important;font-family:inherit !important;font-size:inherit !important;line-height:inherit !important;color:#e6e6e6 !important;white-space:nowrap !important;overflow-x:visible !important;display:inline-block !important;min-width:100% !important;">${codeHtml}</pre>
</div>
</div>`;
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
