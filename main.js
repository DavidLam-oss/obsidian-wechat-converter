const { Plugin, MarkdownView, ItemView, Notice } = require('obsidian');
const { PluginSettingTab, Setting } = require('obsidian');

// 视图类型标识
const APPLE_STYLE_VIEW = 'apple-style-converter';

// 默认设置
const DEFAULT_SETTINGS = {
  theme: 'github',
  themeColor: 'blue',
  customColor: '#0366d6',
  fontFamily: 'sans-serif',
  fontSize: 3,
  macCodeBlock: true,
  codeLineNumber: true,
  avatarUrl: '',
  enableWatermark: false,
};

/**
 * 🍎 Apple Style 转换视图
 */
class AppleStyleView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentHtml = null;
    this.converter = null;
    this.theme = null;
    this.lastActiveFile = null;
  }

  getViewType() {
    return APPLE_STYLE_VIEW;
  }

  getDisplayText() {
    return '🍎 Apple 风格转换';
  }

  getIcon() {
    return 'wand';
  }

  async onOpen() {
    console.log('🍎 转换器面板打开');
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('apple-converter-container');

    // 加载依赖
    await this.loadDependencies();

    // 创建设置面板
    this.createSettingsPanel(container);

    // 创建预览区
    this.previewContainer = container.createEl('div', {
      cls: 'apple-converter-preview',
    });

    this.setPlaceholder();

    // 监听文件切换
    this.registerActiveFileChange();

    // 自动转换当前文档
    setTimeout(async () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && this.converter) {
        await this.convertCurrent(true);
      }
    }, 500);
  }

  /**
   * 监听活动文件切换
   */
  registerActiveFileChange() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
          this.lastActiveFile = activeView.file;
        }
        this.updateCurrentDoc();
        if (activeView && this.converter) {
          setTimeout(async () => {
            await this.convertCurrent(true);
          }, 300);
        }
      })
    );
  }

  /**
   * 加载依赖库
   */
  async loadDependencies() {
    const adapter = this.app.vault.adapter;
    const basePath = '.obsidian/plugins/obsidian-apple-style';

    try {
      // 加载 markdown-it
      if (typeof markdownit === 'undefined') {
        const mdContent = await adapter.read(`${basePath}/lib/markdown-it.min.js`);
        (0, eval)(mdContent);
      }

      // 加载 highlight.js
      if (typeof hljs === 'undefined') {
        const hljsContent = await adapter.read(`${basePath}/lib/highlight.min.js`);
        (0, eval)(hljsContent);
      }

      // 加载主题
      const themeContent = await adapter.read(`${basePath}/themes/apple-theme.js`);
      (0, eval)(themeContent);

      // 加载转换器
      const converterContent = await adapter.read(`${basePath}/converter.js`);
      (0, eval)(converterContent);

      // 初始化主题实例
      this.theme = new AppleTheme({
        theme: this.plugin.settings.theme,
        themeColor: this.plugin.settings.themeColor,
        customColor: this.plugin.settings.customColor,
        fontFamily: this.plugin.settings.fontFamily,
        fontSize: this.plugin.settings.fontSize,
        macCodeBlock: this.plugin.settings.macCodeBlock,
        codeLineNumber: this.plugin.settings.codeLineNumber,
      });

      // 初始化转换器
      const avatarUrl = this.plugin.settings.enableWatermark ? this.plugin.settings.avatarUrl : '';
      this.converter = new AppleStyleConverter(this.theme, avatarUrl);
      await this.converter.initMarkdownIt();

      console.log('✅ 依赖加载完成');
    } catch (error) {
      console.error('❌ 依赖加载失败:', error);
      new Notice('依赖加载失败: ' + error.message);
    }
  }

  /**
   * 创建设置面板
   */
  createSettingsPanel(container) {
    const panel = container.createEl('div', { cls: 'apple-settings-panel' });

    // 标题区
    const header = panel.createEl('div', { cls: 'apple-settings-header' });
    header.createEl('div', { cls: 'apple-settings-title', text: '🍎 Apple 风格转换器' });
    this.currentDocLabel = header.createEl('div', { cls: 'apple-current-doc', text: '未选择文档' });

    // 设置区域
    const settingsArea = panel.createEl('div', { cls: 'apple-settings-area' });

    // === 主题选择 ===
    this.createSection(settingsArea, '主题', (section) => {
      const grid = section.createEl('div', { cls: 'apple-btn-grid' });
      const themes = AppleTheme.getThemeList();
      themes.forEach(t => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-theme ${this.plugin.settings.theme === t.value ? 'active' : ''}`,
          text: t.label,
        });
        btn.dataset.value = t.value;
        btn.addEventListener('click', () => this.onThemeChange(t.value, grid));
      });
    });

    // === 字体选择 ===
    this.createSection(settingsArea, '字体', (section) => {
      const select = section.createEl('select', { cls: 'apple-select' });
      [
        { value: 'sans-serif', label: '无衬线' },
        { value: 'serif', label: '衬线' },
        { value: 'monospace', label: '等宽' },
      ].forEach(opt => {
        const option = select.createEl('option', { value: opt.value, text: opt.label });
        if (this.plugin.settings.fontFamily === opt.value) option.selected = true;
      });
      select.addEventListener('change', (e) => this.onFontFamilyChange(e.target.value));
    });

    // === 字号选择 ===
    this.createSection(settingsArea, '字号', (section) => {
      const grid = section.createEl('div', { cls: 'apple-btn-row' });
      const sizes = [
        { value: 1, label: '小' },
        { value: 2, label: '较小' },
        { value: 3, label: '推荐' },
        { value: 4, label: '较大' },
        { value: 5, label: '大' },
      ];
      sizes.forEach(s => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-size ${this.plugin.settings.fontSize === s.value ? 'active' : ''}`,
          text: s.label,
        });
        btn.dataset.value = s.value;
        btn.addEventListener('click', () => this.onFontSizeChange(s.value, grid));
      });
    });

    // === 主题色 ===
    this.createSection(settingsArea, '主题色', (section) => {
      const grid = section.createEl('div', { cls: 'apple-color-grid' });
      const colors = AppleTheme.getColorList();
      colors.forEach(c => {
        const btn = grid.createEl('button', {
          cls: `apple-btn-color ${this.plugin.settings.themeColor === c.value ? 'active' : ''}`,
        });
        btn.dataset.value = c.value;
        btn.style.setProperty('--btn-color', c.color);
        btn.addEventListener('click', () => this.onColorChange(c.value, grid));
      });
    });

    // === Mac 代码块开关 ===
    this.createSection(settingsArea, 'Mac 风格代码块', (section) => {
      const toggle = section.createEl('label', { cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = this.plugin.settings.macCodeBlock;
      toggle.createEl('span', { cls: 'apple-toggle-slider' });
      checkbox.addEventListener('change', () => this.onMacCodeBlockChange(checkbox.checked));
    });

    // === 代码块行号开关 ===
    this.createSection(settingsArea, '显示代码行号', (section) => {
      const toggle = section.createEl('label', { cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = this.plugin.settings.codeLineNumber;
      toggle.createEl('span', { cls: 'apple-toggle-slider' });
      checkbox.addEventListener('change', () => this.onCodeLineNumberChange(checkbox.checked));
    });

    // === 操作按钮 ===
    const actions = panel.createEl('div', { cls: 'apple-actions' });

    const convertBtn = actions.createEl('button', {
      cls: 'apple-btn-primary',
      text: '⚡ 转换当前文档',
    });
    convertBtn.addEventListener('click', () => this.convertCurrent());

    const copyBtn = actions.createEl('button', {
      cls: 'apple-btn-secondary',
      text: '📋 复制到公众号',
    });
    copyBtn.addEventListener('click', () => this.copyHTML());
  }

  /**
   * 创建设置区块
   */
  createSection(parent, label, builder) {
    const section = parent.createEl('div', { cls: 'apple-setting-section' });
    section.createEl('label', { cls: 'apple-setting-label', text: label });
    const content = section.createEl('div', { cls: 'apple-setting-content' });
    builder(content);
  }

  // === 设置变更处理 ===
  async onThemeChange(value, grid) {
    this.plugin.settings.theme = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme.update({ theme: value });
    await this.convertCurrent(true);
  }

  async onFontFamilyChange(value) {
    this.plugin.settings.fontFamily = value;
    await this.plugin.saveSettings();
    this.theme.update({ fontFamily: value });
    await this.convertCurrent(true);
  }

  async onFontSizeChange(value, grid) {
    this.plugin.settings.fontSize = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme.update({ fontSize: value });
    await this.convertCurrent(true);
  }

  async onColorChange(value, grid) {
    this.plugin.settings.themeColor = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme.update({ themeColor: value });
    await this.convertCurrent(true);
  }

  async onMacCodeBlockChange(checked) {
    this.plugin.settings.macCodeBlock = checked;
    await this.plugin.saveSettings();
    this.theme.update({ macCodeBlock: checked });
    // 重建 converter
    if (this.converter) {
      this.converter.reinit();
      await this.converter.initMarkdownIt();
    }
    await this.convertCurrent(true);
  }

  async onCodeLineNumberChange(checked) {
    this.plugin.settings.codeLineNumber = checked;
    await this.plugin.saveSettings();
    this.theme.update({ codeLineNumber: checked });
    // 重建 converter
    if (this.converter) {
      this.converter.reinit();
      await this.converter.initMarkdownIt();
    }
    await this.convertCurrent(true);
  }

  updateButtonActive(grid, value) {
    grid.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value == value);
    });
  }

  /**
   * 更新当前文档显示
   */
  updateCurrentDoc() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && this.currentDocLabel) {
      this.currentDocLabel.setText(`📄 ${activeView.file.basename}`);
      this.currentDocLabel.style.color = '#0071e3';
    } else if (this.lastActiveFile && this.currentDocLabel) {
      this.currentDocLabel.setText(`📄 ${this.lastActiveFile.basename}`);
      this.currentDocLabel.style.color = '#0071e3';
    } else if (this.currentDocLabel) {
      this.currentDocLabel.setText('未选择文档');
      this.currentDocLabel.style.color = '#86868b';
    }
  }

  /**
   * 设置占位符
   */
  setPlaceholder() {
    this.previewContainer.empty();
    const placeholder = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
    placeholder.createEl('div', { cls: 'apple-placeholder-icon', text: '🍎' });
    placeholder.createEl('h2', { text: 'Apple 风格 Markdown 转换器' });
    placeholder.createEl('p', { text: '将 Markdown 转换为优雅的 HTML，可直接粘贴到公众号' });
    const steps = placeholder.createEl('div', { cls: 'apple-steps' });
    steps.createEl('div', { text: '1️⃣ 打开 Markdown 文件' });
    steps.createEl('div', { text: '2️⃣ 调整设置并点击 "转换"' });
    steps.createEl('div', { text: '3️⃣ 点击 "复制到公众号" 粘贴' });
  }

  /**
   * 转换当前文档
   */
  async convertCurrent(silent = false) {
    let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    let markdown = '';

    if (!activeView && this.lastActiveFile) {
      try {
        markdown = await this.app.vault.read(this.lastActiveFile);
      } catch (error) {
        if (!silent) new Notice('请先打开一个 Markdown 文件');
        return;
      }
    } else if (activeView) {
      markdown = activeView.editor.getValue();
    } else {
      if (!silent) new Notice('请先打开一个 Markdown 文件');
      return;
    }

    if (!markdown.trim()) {
      if (!silent) new Notice('当前文件内容为空');
      return;
    }

    try {
      if (!silent) new Notice('⚡ 正在转换...');
      const html = await this.converter.convert(markdown);
      this.currentHtml = html;
      this.renderHTML(html);
      this.updateCurrentDoc();
      if (!silent) new Notice('✅ 转换成功！');
    } catch (error) {
      console.error('转换失败:', error);
      if (!silent) new Notice('❌ 转换失败: ' + error.message);
    }
  }

  /**
   * 渲染 HTML
   */
  renderHTML(html) {
    this.previewContainer.empty();
    this.previewContainer.innerHTML = html;
  }

  /**
   * 复制 HTML
   */
  async copyHTML() {
    if (!this.currentHtml) {
      new Notice('请先转换文档');
      return;
    }

    try {
      const text = this.previewContainer.textContent || '';

      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([this.currentHtml], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([clipboardItem]);
        new Notice('✅ 已复制！可直接粘贴到公众号编辑器');
        return;
      }

      // 降级方案
      const range = document.createRange();
      range.selectNodeContents(this.previewContainer);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const success = document.execCommand('copy');
      selection.removeAllRanges();

      if (success) {
        new Notice('✅ 内容已复制！可直接粘贴到公众号编辑器');
      } else {
        throw new Error('复制失败');
      }
    } catch (error) {
      console.error('复制失败:', error);
      new Notice('❌ 复制失败，请手动选择复制');
    }
  }

  async onClose() {
    this.previewContainer?.empty();
    console.log('🍎 转换器面板已关闭');
  }
}

/**
 * 🍎 Apple Style 设置面板
 */
class AppleStyleSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '🍎 Apple Style 转换器设置' });

    new Setting(containerEl)
      .setName('默认主题')
      .setDesc('选择默认的排版主题')
      .addDropdown(dropdown => {
        const themes = { github: '简约', wechat: '经典', serif: '优雅', ink: '水墨', aurora: '极光', vintage: '复古', porcelain: '青瓷', editorial: '报章', deco: '摩登' };
        Object.entries(themes).forEach(([k, v]) => dropdown.addOption(k, v));
        dropdown.setValue(this.plugin.settings.theme);
        dropdown.onChange(async (value) => {
          this.plugin.settings.theme = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('默认字号')
      .setDesc('1=小, 3=推荐, 5=大')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.fontSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.fontSize = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Mac 风格代码块')
      .setDesc('在代码块显示红绿灯样式')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.macCodeBlock)
        .onChange(async (value) => {
          this.plugin.settings.macCodeBlock = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: '🖼️ 图片水印设置' });

    new Setting(containerEl)
      .setName('启用图片水印')
      .setDesc('在每张图片上方显示头像')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableWatermark)
        .onChange(async (value) => {
          this.plugin.settings.enableWatermark = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('头像 URL')
      .setDesc('输入头像图片的 URL')
      .addText(text => text
        .setPlaceholder('https://example.com/avatar.jpg')
        .setValue(this.plugin.settings.avatarUrl)
        .onChange(async (value) => {
          this.plugin.settings.avatarUrl = value;
          await this.plugin.saveSettings();
        }));
  }
}

/**
 * 🍎 Apple Style 主插件
 */
class AppleStylePlugin extends Plugin {
  async onload() {
    console.log('🍎 正在加载 Apple Style Converter...');

    await this.loadSettings();

    this.registerView(
      APPLE_STYLE_VIEW,
      (leaf) => new AppleStyleView(leaf, this)
    );

    this.addRibbonIcon('wand', '🍎 Apple 风格转换器', async () => {
      await this.openConverter();
    });

    this.addCommand({
      id: 'open-apple-converter',
      name: '打开 Apple 风格转换器',
      callback: async () => {
        await this.openConverter();
      },
    });

    this.addCommand({
      id: 'convert-to-apple-style',
      name: '转换为 Apple 风格 HTML',
      callback: async () => {
        const view = this.getConverterView();
        if (view) {
          await view.convertCurrent();
        } else {
          await this.openConverter();
          setTimeout(async () => {
            const view = this.getConverterView();
            if (view) await view.convertCurrent();
          }, 500);
        }
      },
    });

    this.addSettingTab(new AppleStyleSettingTab(this.app, this));

    console.log('✅ Apple Style Converter 加载完成');
  }

  async openConverter() {
    let leaf = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW)[0];

    if (!leaf) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      await rightLeaf.setViewState({
        type: APPLE_STYLE_VIEW,
        active: true,
      });
      leaf = rightLeaf;
    }

    this.app.workspace.revealLeaf(leaf);
  }

  getConverterView() {
    const leaves = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW);
    if (leaves.length > 0) {
      return leaves[0].view;
    }
    return null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    console.log('🍎 Apple Style Converter 已卸载');
  }
}

module.exports = AppleStylePlugin;
