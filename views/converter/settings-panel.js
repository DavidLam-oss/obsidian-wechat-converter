/*
## 核心功能

实现转换器顶部工具栏和文章/贴图设置表单的构建能力。

## 输入

接收 AppleStyleView 实例状态、活动笔记、渲染结果和用户交互事件。

## 输出

输出 `settingsPanelMethods`，由 AppleStyleView 统一组装。

## 定位

位于 views/converter/，负责创建设置控件；面板开关和模式切换由 panel-shell.js 负责。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查所属目录 README 是否仍准确。
- 保持现有 AppleStyleView 方法签名与 this 语义，业务规则优先委托 services/。
*/

import {
  toRecord,
  APPLE_STYLE_VIEW_TITLE,
  getObsidianSetIcon,
  getAppleThemeApi,
  getEventTargetValue,
  getImageSwipeCommandCopy,
  isMobileClient,
} from '../apple-style-view-shared.js';

/**
 * @param {AppleThemeApiLike | null} themeApi
 * @param {'getThemeList' | 'getColorList'} method
 * @returns {Array<Record<string, unknown>>}
 */
function readThemeOptions(themeApi, method) {
  if (!themeApi || typeof themeApi[method] !== 'function') return [];
  try {
    const options = themeApi[method]();
    return Array.isArray(options) ? options : [];
  } catch (error) {
    console.warn(`读取${method === 'getThemeList' ? '主题' : '主题色'}列表失败:`, error);
    return [];
  }
}

/** @type {SettingsPanelMethodsContract & ThisType<AppleStyleViewContract>} */
export const settingsPanelMethods = {
createSettingsPanel(container) {

  // 1. 创建顶部双行 Header 容器
  const header = container.createEl('div', { cls: 'apple-preview-header' });

  // 1.1 第一行：Title Row
  const topRow = header.createEl('div', { cls: 'apple-preview-header-top apple-top-toolbar' });
  this.currentDocLabel = topRow.createEl('div', { cls: 'apple-toolbar-title' });
  if (!isMobileClient(this.app)) {
    const pluginLine = this.currentDocLabel.createDiv({ cls: 'apple-toolbar-plugin-line' });
    pluginLine.createEl('span', { text: APPLE_STYLE_VIEW_TITLE, cls: 'apple-toolbar-plugin-name' });
  }
  this.docTitleText = this.currentDocLabel.createDiv({ text: '未选择文档', cls: 'apple-toolbar-doc-name' });

  // 1.2 第二行：Action Row (初始隐藏，由 updateCurrentDoc 根据是否有选定文档展现)
  const bottomRow = header.createEl('div', { cls: 'apple-preview-header-bottom hidden' });
  this.headerBottomRow = bottomRow;

  // 1.2.1 第二行左侧：微型 Icon 分段模式切换胶囊
  const segment = bottomRow.createEl('div', { cls: 'apple-preview-mode-segment' });
  const setIcon = getObsidianSetIcon();

  const selfRec = toRecord(this);

  selfRec.btnArticleMode = segment.createEl('button', {
    cls: 'apple-mode-btn active',
    attr: { 'aria-label': '文章排版模式', 'title': '文章排版模式' }
  });
  const btnArt = /** @type {HTMLElement} */ (selfRec.btnArticleMode);
  if (typeof setIcon === 'function') {
    setIcon(btnArt, 'align-left');
  }

  selfRec.btnStickerMode = segment.createEl('button', {
    cls: 'apple-mode-btn',
    attr: { 'aria-label': '微信贴图模式', 'title': '微信贴图模式' }
  });
  const btnStk = /** @type {HTMLElement} */ (selfRec.btnStickerMode);
  if (typeof setIcon === 'function') {
    setIcon(btnStk, 'layout-grid');
  }

  btnArt.addEventListener('click', () => this.switchPreviewMode('article'));
  btnStk.addEventListener('click', () => this.switchPreviewMode('sticker'));

  // 1.2.2 第二行右侧：操作按钮组
  const actions = bottomRow.createEl('div', { cls: 'apple-toolbar-actions' });

  // 按钮工厂函数
  /**
   * @param {string} icon
   * @param {string} title
   * @param {() => unknown} onClick
   * @returns {ObsidianElementLike}
   */
  const createIconBtn = (icon, title, onClick) => {
    const btn = actions.createEl('div', {
      cls: 'apple-icon-btn',
      attr: { 'aria-label': title, 'title': title } // Tooltip
    });
    if (typeof setIcon === 'function') {
      setIcon(btn, icon);
    }
    btn.addEventListener('click', onClick);
    return btn;
  };

  // [设置] 按钮
  const settingsButton = createIconBtn('sliders-horizontal', '公众号排版样式设置', () => {
    this.toggleSettingsPanel();
  });
  this.settingsBtn = settingsButton;

  this.aiLayoutBtn = createIconBtn('sparkles', 'AI 编排', () => this.onAiLayoutButtonClick());

  // [复制] 按钮（移动端隐藏，避免误导）
  if (!isMobileClient(this.app)) {
    this.copyBtn = createIconBtn('copy', '复制到公众号', () => this.copyHTML());
  } else {
    this.copyBtn = null;
  }

  // [同步] 按钮（始终显示；未配置账号时点击后引导去设置）
  createIconBtn('send', '发布与分发', () => this.showSyncModal());

  // 2. 创建悬浮设置层 (初始隐藏)
  this.settingsOverlay = container.createEl('div', { cls: 'apple-settings-overlay' });
  const settingsArea = this.settingsOverlay.createEl('div', { cls: 'apple-settings-area' });
  this.settingsArea = settingsArea;

  const articleSettingsWrapper = /** @type {ObsidianElementLike} */ (settingsArea.createEl('div', { cls: 'apple-settings-article-wrapper' }));
  this.articleSettingsWrapper = articleSettingsWrapper;

  const stickerSettingsWrapper = /** @type {ObsidianElementLike} */ (settingsArea.createEl('div', { cls: 'apple-settings-sticker-wrapper hidden' }));
  this.stickerSettingsWrapper = stickerSettingsWrapper;

  const targetArea = articleSettingsWrapper;

  // === 主题选择 ===
  this.createSection(targetArea, '主题', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-grid' });
    const themeApi = getAppleThemeApi(this.theme?.constructor);
    const themes = readThemeOptions(themeApi, 'getThemeList');
    themes.forEach(t => {
      const btn = grid.createEl('button', {
        cls: `apple-btn-theme ${this.plugin.settings.theme === t.value ? 'active' : ''}`,
        text: t.label,
        attr: { title: t.label },
      });
      btn.dataset.value = t.value;
      btn.addEventListener('click', () => this.onThemeChange(t.value, grid));
    });
  });

  // === 字体选择 ===
  this.createSection(targetArea, '字体', (section) => {
    const select = /** @type {ObsidianInputLike} */ (section.createEl('select', { cls: 'apple-select' }));
    [
      { value: 'sans-serif', label: '无衬线' },
      { value: 'serif', label: '衬线' },
      { value: 'monospace', label: '等宽' },
    ].forEach(opt => {
      const option = /** @type {ObsidianInputLike} */ (select.createEl('option', { value: opt.value, text: opt.label }));
      if (this.plugin.settings.fontFamily === opt.value) option.selected = true;
    });
    select.addEventListener('change', (e) => this.onFontFamilyChange(getEventTargetValue(e, this.plugin.settings.fontFamily)));
  });

  // === 字号选择 ===
  this.createSection(targetArea, '字号', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-row' });
    const sizeOpts = [
      { value: 1, label: '小' },
      { value: 2, label: '较小' },
      { value: 3, label: '推荐' },
      { value: 4, label: '较大' },
      { value: 5, label: '大' },
    ];

    sizeOpts.forEach(s => {
      const btn = grid.createEl('button', {
        cls: `apple-btn-size ${this.plugin.settings.fontSize === s.value ? 'active' : ''}`,
        text: s.label,
      });
      btn.dataset.value = s.value;
      btn.addEventListener('click', () => this.onFontSizeChange(s.value, grid));
    });
  });

  // === 主题色 (移到标题样式上方) ===
  this.createSection(targetArea, '主题色', (section) => {
    const grid = section.createEl('div', { cls: 'apple-color-grid' });
    const themeApi = getAppleThemeApi(this.theme?.constructor);
    const colors = readThemeOptions(themeApi, 'getColorList');

    // 预设颜色
    colors.forEach(c => {
      const btn = grid.createEl('button', {
        cls: `apple-btn-color ${this.plugin.settings.themeColor === c.value ? 'active' : ''}`,
      });
      btn.dataset.value = c.value;
      btn.style.setProperty('--btn-color', c.color);
      btn.addEventListener('click', () => this.onColorChange(c.value, grid));
    });

    // 自定义颜色
    const customBtn = grid.createEl('button', {
      cls: `apple-btn-custom-text ${this.plugin.settings.themeColor === 'custom' ? 'active' : ''}`,
      text: '自定义',
      title: '自定义颜色'
    });
    customBtn.dataset.value = 'custom';

    // 隐藏的颜色选择器
    const colorInput = /** @type {ObsidianInputLike} */ (grid.createEl('input', {
      type: 'color',
      cls: 'apple-color-picker-hidden'
    }));
    colorInput.value = this.plugin.settings.customColor || '#000000';
    colorInput.setCssStyles({
      visibility: 'hidden',
      width: '0',
      height: '0',
      position: 'absolute',
    });

    // 点击按钮触发颜色选择
    customBtn.addEventListener('click', () => {
      colorInput.click();
    });

    // 颜色改变实时预览
    colorInput.addEventListener('input', (e) => {
      customBtn.style.setProperty('--btn-color', getEventTargetValue(e, this.plugin.settings.customColor));
    });

    // 颜色确认后保存
    colorInput.addEventListener('change', async (e) => {
      const newColor = getEventTargetValue(e, this.plugin.settings.customColor);
      customBtn.style.setProperty('--btn-color', newColor);

      // 更新设置
      this.plugin.settings.customColor = newColor;
      this.theme.update({ customColor: newColor });
      await this.onColorChange('custom', grid);
    });
  });

  // === 页面两侧留白 ===
  this.createSection(targetArea, '页面两侧留白', (section) => {
    const mobile = isMobileClient(this.app);
    const container = section.createEl('div', {
      cls: 'apple-slider-container',
      style: 'width: 100%; display: flex; align-items: center; gap: 10px;'
    });

    const slider = /** @type {ObsidianInputLike} */ (container.createEl('input', {
      type: 'range',
      cls: 'apple-slider',
      attr: { min: 0, max: mobile ? 36 : 40, step: 1 }
    }));
    slider.value = this.plugin.settings.sidePadding;
    slider.setCssStyles({ flex: '1' });

    const valueLabel = container.createEl('span', {
      text: `${this.plugin.settings.sidePadding}px`,
      style: 'font-size: 12px; color: var(--apple-secondary); min-width: 32px; text-align: right;'
    });

    slider.addEventListener('input', (e) => {
      const val = parseInt(getEventTargetValue(e, String(this.plugin.settings.sidePadding)), 10);
      valueLabel.setText(`${val}px`);
      // 拖动过程中只做轻量更新，避免移动端手势被重渲染卡住。
      this.plugin.settings.sidePadding = val;
      this.theme.update({ sidePadding: val });

      if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
      this.saveTimeout = window.setTimeout(async () => {
        await this.plugin.saveSettings();
      }, 500);
      this.scheduleSidePaddingPreview(mobile ? 220 : 120);
    });

    slider.addEventListener('change', async (e) => {
      const val = parseInt(getEventTargetValue(e, String(this.plugin.settings.sidePadding)), 10);
      valueLabel.setText(`${val}px`);
      this.plugin.settings.sidePadding = val;
      this.theme.update({ sidePadding: val });
      if (this.sidePaddingPreviewTimer) {
        window.clearTimeout(this.sidePaddingPreviewTimer);
        this.sidePaddingPreviewTimer = null;
      }
      await this.plugin.saveSettings();
      await this.convertCurrent(true);
    });
  });

  // === 排版间距（折叠：呼吸感微调，默认收起） ===
  const spacingGroup = targetArea.createEl('details', { cls: 'apple-settings-details' });
  this.settingsSpacingGroup = spacingGroup;
  const spacingSummary = spacingGroup.createEl('summary', { cls: 'apple-settings-summary' });
  spacingSummary.createEl('span', { text: '排版间距' });
  this.settingsSpacingValues = spacingSummary.createEl('span', {
    attr: {
      style: 'margin-left: auto; margin-right: 8px; font-size: 11px; font-weight: 400; color: var(--apple-secondary);'
    }
  });
  const spacingArea = spacingGroup.createDiv({ cls: 'apple-settings-area apple-settings-advanced-area' });
  this.updateSpacingSummary();

  /**
   * 复用留白滑块交互：input 轻量预览 + 防抖保存；change 全量重渲染 + 保存。
   * @param {string} label
   * @param {number} min
   * @param {number} max
   * @param {number} step
   * @param {() => number} getEffective
   * @param {string} settingsKey
   * @param {string} updateKey
   */
  const buildSpacingSlider = (label, min, max, step, getEffective, settingsKey, updateKey) => {
    this.createSection(spacingArea, label, (section) => {
      const container = section.createEl('div', {
        cls: 'apple-slider-container',
        style: 'width: 100%; display: flex; align-items: center; gap: 10px;'
      });

      const slider = /** @type {ObsidianInputLike} */ (container.createEl('input', {
        type: 'range',
        cls: 'apple-slider',
        attr: { min: String(min), max: String(max), step: String(step) }
      }));
      const initial = getEffective();
      slider.value = String(initial);
      slider.setCssStyles({ flex: '1' });

      const valueLabel = container.createEl('span', {
        text: this.formatSpacingValue(initial),
        style: 'font-size: 12px; color: var(--apple-secondary); min-width: 32px; text-align: right;'
      });

      // 记录引用，供 refreshSpacingSliders() 切主题后刷新显示。
      this.spacingSliderRefs.push({ slider, valueLabel, getEffective });

      const applyValue = (raw) => {
        const val = Number(raw);
        valueLabel.setText(this.formatSpacingValue(val));
        this.plugin.settings[settingsKey] = val;
        this.theme.update({ [updateKey]: val });
        this.updateSpacingSummary();
      };

      slider.addEventListener('input', (e) => {
        const val = Number(getEventTargetValue(e, String(getEffective())));
        applyValue(val);
        if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
        this.saveTimeout = window.setTimeout(async () => {
          await this.plugin.saveSettings();
        }, 500);
        this.scheduleSidePaddingPreview(120);
      });

      slider.addEventListener('change', async (e) => {
        const val = Number(getEventTargetValue(e, String(getEffective())));
        applyValue(val);
        if (this.sidePaddingPreviewTimer) {
          window.clearTimeout(this.sidePaddingPreviewTimer);
          this.sidePaddingPreviewTimer = null;
        }
        await this.plugin.saveSettings();
        await this.convertCurrent(true);
      });
    });
  };

  // 存储滑块引用，供切主题时刷新显示值（跟随主题的滑块需同步新主题默认值）。
  this.spacingSliderRefs = [];
  buildSpacingSlider('行间距', 1.4, 2.2, 0.05, () => this.getEffectiveLineHeight(), 'lineHeight', 'lineHeight');
  buildSpacingSlider('段间距', 8, 40, 1, () => this.getEffectiveParagraphGap(), 'paragraphGap', 'paragraphGap');
  buildSpacingSlider('字间距', 0, 2, 0.5, () => this.getEffectiveLetterSpacing(), 'letterSpacing', 'letterSpacing');

  const advancedOptions = targetArea.createEl('details', { cls: 'apple-settings-details' });
  this.settingsAdvancedOptions = advancedOptions;
  advancedOptions.createEl('summary', {
    cls: 'apple-settings-summary',
    text: '高级选项'
  });
  const advancedArea = advancedOptions.createDiv({ cls: 'apple-settings-area apple-settings-advanced-area' });
  this.settingsAdvancedArea = advancedArea;

  // === 引用样式 ===
  const quoteStyleSection = this.createSection(advancedArea, '引用样式', (section) => {
    const select = /** @type {ObsidianInputLike} */ (section.createEl('select', { cls: 'apple-select' }));
    [
      { value: 'theme', label: '经典主题色' },
      { value: 'neutral', label: '中性灰（推荐）' },
    ].forEach((opt) => {
      const option = /** @type {ObsidianInputLike} */ (select.createEl('option', { value: opt.value, text: opt.label }));
      if (this.plugin.settings.quoteCalloutStyleMode === opt.value) option.selected = true;
    });
    select.addEventListener('change', (e) => this.onQuoteCalloutStyleModeChange(getEventTargetValue(e, this.plugin.settings.quoteCalloutStyleMode)));

    section.createEl('span', {
      text: '中性灰更适合长文阅读；经典主题色兼容现有风格。',
      attr: {
        style: 'font-size: 11px; color: var(--apple-secondary); margin-top: 8px; opacity: 0.8; font-weight: 500; display: block;'
      }
    });
  });
  quoteStyleSection.classList.add('apple-settings-featured');

  // === 标题样式 (移到主题色下方) ===
  const headingStyleSection = this.createSection(advancedArea, '标题样式', (section) => {
    const row = section.createEl('div', { cls: 'apple-settings-inline-row' });

    const toggle = row.createEl('label', { cls: 'apple-toggle' });
    const checkbox = /** @type {ObsidianInputLike} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }));
    checkbox.checked = this.plugin.settings.coloredHeader;
    toggle.createEl('span', { cls: 'apple-toggle-slider' });

    section.createEl('span', {
      text: '标题使用加深主题色',
      attr: {
        style: 'font-size: 11px; color: var(--apple-secondary); opacity: 0.8; font-weight: 500; display: block;'
      }
    });

    checkbox.addEventListener('change', async () => {
      this.plugin.settings.coloredHeader = checkbox.checked;
      await this.plugin.saveSettings();

      // 关键修复：更新主题状态并重绘
      this.theme.update({ coloredHeader: checkbox.checked });
      // 强制刷新
      await this.convertCurrent(true);
    });
  });
  headingStyleSection.classList.add('apple-settings-inline-toggle');

  // === 正文标点标准化 ===
  const punctuationSection = this.createSection(advancedArea, '正文标点标准化', (section) => {
    const row = section.createEl('div', { cls: 'apple-settings-inline-row' });
    const toggle = row.createEl('label', { cls: 'apple-toggle' });
    const checkbox = /** @type {ObsidianInputLike} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }));
    checkbox.checked = this.plugin.settings.normalizeChinesePunctuation === true;
    toggle.createEl('span', { cls: 'apple-toggle-slider' });

    section.createEl('span', {
      text: '仅作用于预览 / 复制 / 同步结果',
      attr: {
        style: 'font-size: 11px; color: var(--apple-secondary); opacity: 0.8; font-weight: 500; display: block;'
      }
    });

    checkbox.addEventListener('change', async () => {
      this.plugin.settings.normalizeChinesePunctuation = checkbox.checked;
      await this.plugin.saveSettings();
      await this.convertCurrent(true);
    });
  });
  punctuationSection.classList.add('apple-settings-inline-toggle');

  // === Mac 代码块开关 ===
  const macCodeSection = this.createSection(advancedArea, 'Mac 风格代码块', (section) => {
    const row = section.createEl('div', { cls: 'apple-settings-inline-row' });
    const toggle = row.createEl('label', { cls: 'apple-toggle' });
    const checkbox = /** @type {ObsidianInputLike} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }));
    checkbox.checked = this.plugin.settings.macCodeBlock;
    toggle.createEl('span', { cls: 'apple-toggle-slider' });
    checkbox.addEventListener('change', () => this.onMacCodeBlockChange(checkbox.checked));
  });
  macCodeSection.classList.add('apple-settings-inline-toggle');

  // === 代码块行号开关 ===
  const codeLineNumberSection = this.createSection(advancedArea, '显示代码行号', (section) => {
    const row = section.createEl('div', { cls: 'apple-settings-inline-row' });
    const toggle = row.createEl('label', { cls: 'apple-toggle' });
    const checkbox = /** @type {ObsidianInputLike} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }));
    checkbox.checked = this.plugin.settings.codeLineNumber;
    toggle.createEl('span', { cls: 'apple-toggle-slider' });
    checkbox.addEventListener('change', () => this.onCodeLineNumberChange(checkbox.checked));
  });
  codeLineNumberSection.classList.add('apple-settings-inline-toggle');

  // === 显示图片说明文字 ===
  const captionSection = this.createSection(advancedArea, '显示图片说明文字', (section) => {
    const row = section.createEl('div', { cls: 'apple-settings-inline-row' });
    const toggle = row.createEl('label', { cls: 'apple-toggle' });
    const checkbox = /** @type {ObsidianInputLike} */ (toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' }));
    checkbox.checked = this.plugin.settings.showImageCaption;
    toggle.createEl('span', { cls: 'apple-toggle-slider' });

    section.createEl('span', {
      text: '关闭水印时，在图片下方显示说明文字',
      attr: {
        style: 'font-size: 11px; color: var(--apple-secondary); opacity: 0.8; font-weight: 500; display: block;'
      }
    });

    checkbox.addEventListener('change', async () => {
      this.plugin.settings.showImageCaption = checkbox.checked;
      await this.plugin.saveSettings();

      if (this.converter) {
        this.converter.updateConfig({ showImageCaption: checkbox.checked });
        await this.convertCurrent(true);
      }
    });

    this.captionToggleState = { checkbox, toggle };
  });
  captionSection.classList.add('apple-settings-inline-toggle');

  // === 横滑图片块提示 ===
  this.createSection(advancedArea, '横滑图片块', (section) => {
    const imageBlockCommand = getImageSwipeCommandCopy(this.app, 'image-swipe').name;
    const sensitiveImageBlockCommand = getImageSwipeCommandCopy(this.app, 'image-sensitive').name;
    section.createEl('span', {
      text: `选中多张图片，打开命令面板，运行「${imageBlockCommand}」或「${sensitiveImageBlockCommand}」。`,
      attr: {
        style: 'font-size: 11px; color: var(--apple-secondary); opacity: 0.78; font-weight: 500; line-height: 1.6; display: block;'
      }
    });
  });

  // 根据全局水印设置更新状态
  if (this.plugin.settings.enableWatermark) {
    const captionDesc = captionSection.querySelector('.apple-setting-content > span');
    if (captionDesc) {
      captionDesc.setText('因全局设置中已开启水印，此选项默认开启');
    }
    const toggleState = this.captionToggleState;
    if (toggleState?.checkbox) {
      toggleState.checkbox.checked = true;
      toggleState.checkbox.disabled = true;
    }
    if (toggleState?.toggle) {
      toggleState.toggle.setCssStyles({
        pointerEvents: 'none',
        opacity: '0.6',
        filter: 'grayscale(100%)',
      });
    }
  }

  // === 3. 渲染贴图模式专属设置 ===
  const stickerWrapperRaw = /** @type {unknown} */ (this.stickerSettingsWrapper);
  if (stickerWrapperRaw && typeof stickerWrapperRaw === 'object' && 'createDiv' in stickerWrapperRaw) {
    const stickerWrapper = /** @type {ObsidianElementLike} */ (stickerWrapperRaw);

    // 3.2 配图序号开关
    const indexSection = this.createSection(stickerWrapper, '配图序号', (section) => {
      const container = section.createEl('div', { cls: 'apple-sticker-toggle-row' });
      const labelGroup = container.createDiv({ cls: 'apple-sticker-toggle-copy' });
      labelGroup.createEl('span', {
        text: '在文案中插入 [配图 N]',
        cls: 'apple-sticker-toggle-label',
      });
      labelGroup.createEl('span', {
        text: '便于读者对应下方图片；只影响贴图文案。',
        cls: 'apple-sticker-toggle-description',
      });

      const toggle = container.createDiv({ cls: 'apple-toggle' });
      const checkbox = toggle.createEl('input', { type: 'checkbox', cls: 'apple-toggle-input' });
      checkbox.checked = Boolean(this.insertStickerImageIndex);
      toggle.createEl('span', { cls: 'apple-toggle-slider' });

      container.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          e.preventDefault();
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });

      checkbox.addEventListener('change', () => {
        this.insertStickerImageIndex = checkbox.checked;
        this.renderStickerPreview();
      });
      this.stickerIndexToggleState = { checkbox, toggle };
    });
    indexSection.classList.add('apple-settings-inline-toggle');

    // 3.3 纯文本转换说明
    this.createSection(stickerWrapper, '纯文本转换规则', (section) => {
      const card = section.createDiv({ cls: 'apple-settings-info-card' });
      card.createEl('p', {
        text: '· 自动忽略 Frontmatter 等机器信息\n· 代码块、表格、公式和脚注会转换为可读纯文本\n· 只影响预览和草稿，不会改动笔记原文',
        cls: 'apple-settings-info-card-text'
      });
    });
  }

  this.aiLayoutOverlay = container.createEl('div', { cls: 'apple-ai-layout-overlay' });
  this.createAiLayoutPanel(this.aiLayoutOverlay);
  this.updateAiToolbarState();
}
,
createSection(parent, label, builder) {
  const section = parent.createEl('div', { cls: 'apple-setting-section' });
  section.createEl('label', { cls: 'apple-setting-label', text: label });
  const content = section.createEl('div', { cls: 'apple-setting-content' });
  builder(content);
  return section;
}
,

getEffectiveLineHeight() {
  const configured = this.plugin.settings.lineHeight;
  if (configured !== null && configured !== undefined) return configured;
  const cfg = this.getThemeConfigSafe();
  return cfg ? cfg.lineHeight : 1.8;
}
,

getEffectiveParagraphGap() {
  const configured = this.plugin.settings.paragraphGap;
  if (configured !== null && configured !== undefined) return configured;
  const cfg = this.getThemeConfigSafe();
  return cfg ? cfg.paragraphGap : 18;
}
,

getEffectiveLetterSpacing() {
  const configured = this.plugin.settings.letterSpacing;
  if (configured !== null && configured !== undefined) return configured;
  return 0;
}
,

getThemeConfigSafe() {
  const theme = this.theme;
  if (theme && typeof theme.getThemeConfig === 'function') {
    try {
      return theme.getThemeConfig();
    } catch {
      return null;
    }
  }
  return null;
}
,

formatSpacingValue(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0';
  // 最多 2 位小数，去掉末尾多余的 0
  return parseFloat(num.toFixed(2)).toString();
}
,

updateSpacingSummary() {
  const el = this.settingsSpacingValues;
  if (!el) return;
  const lh = this.formatSpacingValue(this.getEffectiveLineHeight());
  const pg = this.formatSpacingValue(this.getEffectiveParagraphGap());
  const ls = this.formatSpacingValue(this.getEffectiveLetterSpacing());
  el.setText(`行距 ${lh} · 段距 ${pg} · 字距 ${ls}`);
}
,

// 切换主题后刷新间距滑块显示：跟随主题(null)的滑块同步新主题默认值；
// 用户手动设过(非 null)的保持不变（getEffective 直接返回用户值）。
refreshSpacingSliders() {
  if (!this.spacingSliderRefs) return;
  this.spacingSliderRefs.forEach(({ slider, valueLabel, getEffective }) => {
    const v = getEffective();
    slider.value = String(v);
    valueLabel.setText(this.formatSpacingValue(v));
  });
  this.updateSpacingSummary();
}
,
};
