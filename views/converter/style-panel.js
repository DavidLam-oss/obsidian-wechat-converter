/* eslint-disable no-unused-vars -- Transitional method group keeps original free identifiers available after extraction. */
import * as shared from '../apple-style-view-shared.js';

const {
  createRenderPipelines,
  buildRenderRuntime,
  resolveMarkdownSource,
  normalizeVaultPath,
  isAbsolutePathLike,
  renderObsidianTripletMarkdown,
  canUseNativePreviewFastPath,
  renderNativeMarkdown,
  convertRenderedMermaidDiagramsToImages,
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  AI_PROVIDER_KINDS,
  createDefaultAiSettings,
  normalizeAiSettings,
  normalizeAiProvider,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  getLayoutFamilyList,
  getLayoutFamilyById,
  getColorPaletteList,
  getColorPaletteById,
  resolveColorPaletteForRender,
  normalizeHexColor,
  normalizeLayoutSelection,
  getArticleLayoutSelectionState,
  resolveAiProvider,
  deriveArticleLayoutStateForSelection,
  normalizeArticleLayoutState,
  normalizeArticleLayoutCacheEntry,
  extractImageRefsFromHtml,
  extractRenderedSectionFragments,
  generateArticleLayout,
  renderArticleLayoutHtml,
  testAiProviderConnection,
  createWechatSyncService,
  createWechatSyncBridgeService,
  isWechatSyncUnsupportedMethodError,
  getMultiPlatformResultSummary,
  getWechatSyncResultError,
  getWechatSyncResultPlatformId,
  getWechatSyncResultUrl,
  normalizeWechatsyncPlatform,
  sortWechatsyncPlatformItemsForDisplay,
  resolveSyncAccount,
  toSyncFriendlyMessage,
  createEmptyDraftCache,
  normalizeDraftCache,
  getDraftAssociation,
  setDraftAssociation,
  clearDraftAssociation,
  processAllImagesService,
  processMathFormulasService,
  cleanHtmlForDraftService,
  rasterizeSvgToPngBlob,
  createObsidianFetchAdapter,
  stripMarkdownFrontmatter,
  mapAppUrlImagesToAssetUrls,
  createHtmlContainer,
  getActiveDocument,
  getActiveWindowValue,
  htmlToText,
  setElementHtml,
  createDefaultMultiPlatformSyncSettings,
  parseWechatsyncPlatformIds,
  hasWechatSyncCapability,
  normalizeMultiPlatformSyncSettings,
  getAvailableWechatsyncPlatforms,
  formatWechatsyncCheckedAt,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
  renderMultiPlatformSettingsTab,
  showMultiPlatformPublishModal,
  renderFeishuSettingsTab,
  renderFeishuPublishTab,
  createDefaultFeishuSyncSettings,
  normalizeFeishuSyncSettings,
  updateFeishuHistoryPath,
  WechatAPI,
  loadCommonJsDependency,
  obsidianApi,
  Plugin,
  MarkdownView,
  ItemView,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  LEGACY_SETTING_RENDER_KEY,
  getActiveDocumentCompat,
  createFallbackSvgElement,
  revealLeafCompat,
  getPluginSettings,
  setPluginSettings,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  toReadableError,
  isRecord,
  toRecord,
  toAiLayoutState,
  toAiLayoutJson,
  toAiLayoutBlock,
  toAiLayoutGenerationMeta,
  toAiLayoutSelection,
  toAiLayoutFamilyStates,
  toOptionalText,
  toImageElements,
  removeElementClass,
  toOptionalNumber,
  parseJsonRecord,
  normalizeRequestUrlResponse,
  getResponseJsonRecord,
  getProxyErrorMessage,
  createProxyError,
  formatWechatApiError,
  hasWechatUploadResult,
  readBlobAsBase64Payload,
  dataUrlToBlob,
  bufferFromBinary,
  inferLocalImageMimeType,
  safeDecodeUriText,
  getFileUrlLocalPath,
  getVaultAdapterBasePath,
  normalizeAbsoluteLocalPath,
  getVaultRelativePathFromLocalPath,
  getVaultDirnameFromPath,
  APPLE_STYLE_VIEW,
  APPLE_STYLE_VIEW_TITLE,
  PLACEHOLDER_ICON_DATA_URL,
  GITHUB_REPOSITORY_URL,
  OBSIDIAN_PUBLISHER_PRO_URL,
  OBSIDIAN_PUBLISHER_GUIDE_URL,
  OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL,
  OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL,
  MULTI_PLATFORM_TAB_LABEL,
  getObsidianModalClass,
  createObsidianModal,
  getObsidianSetIcon,
  getObsidianRequestUrl,
  getObsidianRequest,
  getAppleThemeApi,
  getValueElementFromEvent,
  getEventTargetValue,
  IMAGE_SWIPE_COMMAND_COPY,
  getObsidianLocale,
  isChineseObsidianLocale,
  getImageSwipeCommandCopy,
  quoteLinesForImageSwipeCallout,
  createImageSwipeCalloutMarkdown,
  DEFAULT_SETTINGS,
  MAX_ACCOUNTS,
  AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS,
  DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS,
  getWechatAccountPublishOptions,
  normalizeWechatAccountPublishOptions,
  isMobileClient,
  generateId,
  sleep,
  pMap
} = shared;

export const stylePanelMethods = {
createSettingsPanel(container) {

  // 1. 创建顶部工具栏
  const toolbar = container.createEl('div', { cls: 'apple-top-toolbar' });

  // 1.1 左侧：双层信息（插件名 + 文档名）
  this.currentDocLabel = toolbar.createEl('div', { cls: 'apple-toolbar-title' });
  if (!isMobileClient(this.app)) {
    const pluginLine = this.currentDocLabel.createDiv({ cls: 'apple-toolbar-plugin-line' });
    pluginLine.createEl('span', { text: APPLE_STYLE_VIEW_TITLE, cls: 'apple-toolbar-plugin-name' });
    pluginLine.createEl('span', { text: '公众号预览', cls: 'apple-toolbar-preview-badge' });
  }
  this.docTitleText = this.currentDocLabel.createDiv({ text: '未选择文档', cls: 'apple-toolbar-doc-name' });

  // 1.2 右侧：操作按钮组
  const actions = toolbar.createEl('div', { cls: 'apple-toolbar-actions' });

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
      attr: { 'aria-label': title } // Tooltip
    });
    const setIcon = getObsidianSetIcon();
    if (typeof setIcon === 'function') {
      setIcon(btn, icon);
    }
    btn.addEventListener('click', onClick);
    return btn;
  };

  // [设置] 按钮
  const settingsButton = createIconBtn('sliders-horizontal', '样式设置', () => {
    this.togglePanel(this.settingsOverlay, settingsButton, () => this.resetSettingsPanelViewState());
  });
  settingsButton.setAttribute('aria-label', '公众号排版样式设置');
  settingsButton.setAttribute('title', '公众号排版样式设置');
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

  // === 主题选择 ===
  this.createSection(settingsArea, '主题', (section) => {
    const grid = section.createEl('div', { cls: 'apple-btn-grid' });
    const themes = getAppleThemeApi().getThemeList();
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
  this.createSection(settingsArea, '字体', (section) => {
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
  this.createSection(settingsArea, '字号', (section) => {
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
  this.createSection(settingsArea, '主题色', (section) => {
    const grid = section.createEl('div', { cls: 'apple-color-grid' });
    const colors = getAppleThemeApi().getColorList();

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
  this.createSection(settingsArea, '页面两侧留白', (section) => {
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

  const advancedOptions = settingsArea.createEl('details', { cls: 'apple-settings-details' });
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

  this.aiLayoutOverlay = container.createEl('div', { cls: 'apple-ai-layout-overlay' });
  this.createAiLayoutPanel(this.aiLayoutOverlay);
  this.updateAiToolbarState();
}
,

createAccountSelector(parent) {
  /** @type {WechatAccountLike[]} */
  const accounts = this.plugin.settings.wechatAccounts || [];
  if (accounts.length === 0) return;

  const section = parent.createEl('div', { cls: 'apple-setting-section wechat-account-selector' });
  section.createEl('label', { cls: 'apple-setting-label', text: '同步账号' });

  const select = /** @type {ObsidianInputLike} */ (section.createEl('select', { cls: 'wechat-account-select' }));

  const defaultId = this.plugin.settings.defaultAccountId;

  for (const account of accounts) {
    const option = /** @type {ObsidianInputLike} */ (select.createEl('option', {
      value: account.id,
      text: account.id === defaultId ? `${account.name} (默认)` : account.name
    }));
    if (account.id === defaultId) {
      option.selected = true;
    }
  }

  // 保存选中的账号 ID 到实例属性
  this.selectedAccountId = defaultId;
  select.addEventListener('change', (event) => {
    this.selectedAccountId = getEventTargetValue(event, defaultId);
  });
}
,

getFirstImageFromArticle() {
  if (!this.currentHtml) return null;
  const tempDiv = createHtmlContainer('div', this.currentHtml);
  const imgs = Array.from(tempDiv.querySelectorAll('img'));

  // 遍历所有图片，跳过头像（alt="logo"）
  for (const img of imgs) {
    if (img.alt === 'logo') continue;
    const src = String(img.getAttribute('src') || img.src || '').trim();
    if (src) return src;
  }
  return null;
}
,

getPublishContextFile() {
  const activeFile = this.app?.workspace?.getActiveFile?.();
  if (activeFile) return activeFile;
  if (this.lastActiveFile) return this.lastActiveFile;
  return null;
}
,

getFrontmatterPublishMeta(activeFile) {
  if (!activeFile) {
    return { excerpt: '', cover: '', cover_dir: '', coverSrc: null, title: '' };
  }

  const frontmatter = this.app?.metadataCache?.getFileCache?.(activeFile)?.frontmatter;
  const excerpt = this.getFrontmatterString(frontmatter, ['excerpt']);
  const cover = this.getFrontmatterString(frontmatter, ['cover']);
  const cover_dir = this.getFrontmatterString(frontmatter, ['cover_dir', 'coverDir', 'cover-dir', 'coverdir', 'CoverDIR']);
  const title = this.getFrontmatterString(frontmatter, ['title']);

  // 解析失败时静默回退：返回 null，不中断流程
  const coverSrc = cover ? this.resolveVaultPathToResourceSrc(cover) : null;

  return { excerpt, cover, cover_dir, coverSrc, title };
}
,

getFrontmatterString(frontmatter, keys) {
  const frontmatterRecord = toRecord(frontmatter);
  if (!frontmatterRecord) return '';
  if (!Array.isArray(keys) || keys.length === 0) return '';

  const normalizedTargets = new Set(keys.map(key => this.normalizeFrontmatterKey(key)));
  for (const key of keys) {
    const value = frontmatterRecord[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  for (const [key, value] of Object.entries(frontmatterRecord)) {
    if (!normalizedTargets.has(this.normalizeFrontmatterKey(key))) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}
,

normalizeFrontmatterKey(key) {
  return String(key || '').toLowerCase().replace(/[_-]/g, '');
}
,

getFrontmatterKeyMap(frontmatter, keys) {
  /** @type {Record<string, string>} */
  const result = {};
  const frontmatterRecord = toRecord(frontmatter);
  if (!frontmatterRecord) return result;
  if (!Array.isArray(keys) || keys.length === 0) return result;

  const normalizedTargets = new Set(keys.map(key => this.normalizeFrontmatterKey(key)));
  for (const [key, value] of Object.entries(frontmatterRecord)) {
    if (!normalizedTargets.has(this.normalizeFrontmatterKey(key))) continue;
    if (typeof value !== 'string') continue;
    const normalizedValue = this.normalizeVaultPath(value);
    if (!normalizedValue) continue;
    result[key] = normalizedValue;
  }
  return result;
}
,

isPathInsideDirectory(filePath, dirPath) {
  const file = this.normalizeVaultPath(filePath);
  const dir = this.normalizeVaultPath(dirPath);
  if (!file || !dir) return false;
  if (file === dir) return true;
  return file.startsWith(`${dir}/`);
}
,

isPathInsideDirectoryByTail(filePath, dirPath) {
  const file = this.normalizeVaultPath(filePath);
  const dir = this.normalizeVaultPath(dirPath);
  if (!file || !dir) return false;

  const dirSegments = dir.split('/').filter(Boolean);
  if (dirSegments.length < 2) return false;

  // 允许清理目录与 frontmatter 路径存在“根前缀差异”
  // 例如 cleanedDir: Wechat/published/img
  //      cover:     published/img/post-cover.jpg
  for (let i = 1; i <= dirSegments.length - 2; i++) {
    const tailDir = dirSegments.slice(i).join('/');
    if (this.isPathInsideDirectory(file, tailDir)) {
      return true;
    }
  }
  return false;
}
,

shouldClearFrontmatterPathAfterCleanup(pathValue, cleanedDir) {
  const normalized = this.normalizeVaultPath(pathValue);
  if (!normalized) return false;
  if (this.isPathInsideDirectory(normalized, cleanedDir)) return true;
  return this.isPathInsideDirectoryByTail(normalized, cleanedDir);
}
,

clearInvalidPublishMetaInFrontmatter(frontmatter, cleanedDir) {
  const frontmatterRecord = toRecord(frontmatter);
  if (!frontmatterRecord) return false;

  let changed = false;
  const coverMap = this.getFrontmatterKeyMap(frontmatter, ['cover']);
  const coverDirMap = this.getFrontmatterKeyMap(frontmatter, ['cover_dir', 'coverDir', 'cover-dir', 'coverdir', 'CoverDIR']);

  for (const [key, value] of Object.entries(coverMap)) {
    if (this.shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
      frontmatterRecord[key] = '';
      changed = true;
    }
  }

  for (const [key, value] of Object.entries(coverDirMap)) {
    if (this.shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
      frontmatterRecord[key] = '';
      changed = true;
    }
  }

  return changed;
}
,

async clearInvalidPublishMetaByTextFallback(activeFile, cleanedDir) {
  const vault = this.app?.vault;
  if (!vault || typeof vault.read !== 'function' || typeof vault.modify !== 'function') {
    return false;
  }

  const source = await vault.read(activeFile);
  if (typeof source !== 'string' || !source.startsWith('---')) return false;

  const match = source.match(/^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$))/);
  if (!match) return false;

  let changed = false;
  const body = match[2].replace(/^([ \t]*)(cover|cover_dir|coverDir|cover-dir|coverdir|CoverDIR)([ \t]*:[ \t]*)(.*)$/gmi, (line, indent, key, separator, rawValue) => {
    const value = String(rawValue || '').trim().replace(/^['"]|['"]$/g, '');
    if (!this.shouldClearFrontmatterPathAfterCleanup(value, cleanedDir)) {
      return line;
    }
    changed = true;
    return `${indent}${key}${separator}''`;
  });

  if (!changed) return false;
  await vault.modify(activeFile, `${match[1]}${body}${match[3]}${source.slice(match[0].length)}`);
  return true;
}
,

async clearInvalidPublishMetaAfterCleanup(activeFile, cleanedDirPath) {
  if (!activeFile || !cleanedDirPath) return null;

  const cleanedDir = this.normalizeVaultPath(cleanedDirPath);
  if (!cleanedDir) return null;

  try {
    const processFrontMatter = this.app?.fileManager?.['processFrontMatter'];
    if (typeof processFrontMatter === 'function') {
      await processFrontMatter.call(this.app.fileManager, activeFile, (frontmatter) => {
        this.clearInvalidPublishMetaInFrontmatter(toRecord(frontmatter), cleanedDir);
      });
    } else {
      await this.clearInvalidPublishMetaByTextFallback(activeFile, cleanedDir);
    }
  } catch (error) {
    return `资源已删除，但清理 frontmatter 中失效的 cover/cover_dir 失败: ${toReadableError(error).message}`;
  }

  return null;
}
,

resolveVaultPathToResourceSrc(vaultPath) {
  if (typeof vaultPath !== 'string') return null;
  const normalized = vaultPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;

  try {
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!file) return null;
    if (typeof file.extension !== 'string') return null; // 仅接受文件，不接受目录
    return this.app.vault.getResourcePath(file);
  } catch {
    // frontmatter 路径失效或不是文件时，静默回退
    return null;
  }
}
,

normalizeVaultPath(vaultPath) {
  return normalizeVaultPath(vaultPath);
}
,

getVaultConfigDir() {
  const configDir = this.app?.vault?.configDir;
  return typeof configDir === 'string' ? this.normalizeVaultPath(configDir) : '';
}
,

getCleanupDirTemplate() {
  const raw = typeof this.plugin?.settings?.cleanupDirTemplate === 'string'
    ? this.plugin.settings.cleanupDirTemplate
    : '';
  return this.normalizeVaultPath(raw);
}
,

resolveCleanupDirPath(activeFile) {
  const template = this.getCleanupDirTemplate();
  if (!template) {
    return { path: '', warning: '未配置清理目录，请在插件设置中先填写目录后再启用自动清理' };
  }

  const hasNotePlaceholder = /\{\{\s*note\s*\}\}/i.test(template);
  if (hasNotePlaceholder && !activeFile) {
    return { path: '', warning: '当前没有活动文档，无法解析清理目录中的 {{note}}' };
  }

  const noteName = typeof activeFile?.basename === 'string' ? activeFile.basename.trim() : '';
  const resolved = template.replace(/\{\{\s*note\s*\}\}/gi, noteName);
  const normalized = this.normalizeVaultPath(resolved);
  if (!normalized) {
    return { path: '', warning: '清理目录为空，请检查设置值' };
  }

  return { path: normalized };
}
,

isSafeCleanupDirPath(vaultPath) {
  const normalized = this.normalizeVaultPath(vaultPath);
  if (!normalized) return false;
  if (normalized === '.') return false;
  if (normalized.includes('..')) return false;
  const configDir = this.getVaultConfigDir();
  if (configDir && (normalized === configDir || normalized.startsWith(`${configDir}/`))) return false;
  return true;
}
,

async cleanupConfiguredDirectory(activeFile) {
  if (!this.plugin.settings.cleanupAfterSync) {
    return { attempted: false };
  }

  const useSystemTrash = this.plugin.settings.cleanupUseSystemTrash !== false;
  const resolved = this.resolveCleanupDirPath(activeFile);
  if (!resolved.path) {
    return { attempted: true, success: false, warning: resolved.warning || '未解析到清理目录' };
  }

  const normalized = resolved.path;
  if (!this.isSafeCleanupDirPath(normalized)) {
    return { attempted: true, success: false, warning: `清理目录不安全，已跳过: ${normalized}` };
  }

  const abstractFile = this.app.vault.getAbstractFileByPath(normalized);
  if (!abstractFile) {
    return { attempted: true, success: false, warning: `清理目录不存在: ${normalized}` };
  }

  const isFile = typeof abstractFile.extension === 'string';
  if (isFile) {
    return { attempted: true, success: false, warning: `清理路径不是目录，已跳过: ${normalized}` };
  }

  try {
    if (typeof this.app.vault.trash === 'function') {
      await this.app.vault.trash(abstractFile, useSystemTrash);
    } else if (typeof this.app.vault.delete === 'function') {
      await this.app.vault.delete(abstractFile, true);
    } else {
      throw new Error('当前 Obsidian 版本不支持删除接口');
    }
  } catch (error) {
    return { attempted: true, success: false, warning: `删除失败 (${normalized}): ${toReadableError(error).message}` };
  }

  const frontmatterWarning = await this.clearInvalidPublishMetaAfterCleanup(activeFile, normalized);
  if (frontmatterWarning) {
    return { attempted: true, success: true, cleanedPath: normalized, warning: frontmatterWarning };
  }

  return { attempted: true, success: true, cleanedPath: normalized };
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

resetSettingsPanelViewState() {
  const advancedOptions = this.settingsAdvancedOptions || this.settingsOverlay?.querySelector('.apple-settings-details');
  if (advancedOptions) advancedOptions.open = false;

  const scrollTargets = [
    this.settingsOverlay,
    this.settingsArea,
    this.settingsAdvancedArea,
  ].filter(Boolean);

  const resetScroll = () => {
    scrollTargets.forEach((target) => {
      target.scrollTop = 0;
    });
  };

  resetScroll();
  if (typeof requestAnimationFrame === 'function') {
    window.requestAnimationFrame(resetScroll);
  }
}
,

resetAiLayoutPanelViewState() {
  this.aiAdvancedOpen = false;
  this.aiLayoutDebugMode = '';
  this.aiLayoutPendingAnchor = null;

  const scrollTargets = [
    this.aiLayoutOverlay,
    this.aiLayoutArea,
    this.aiAdvancedBody,
    this.aiDebugPanelBody,
  ].filter(Boolean);

  const resetScroll = () => {
    scrollTargets.forEach((target) => {
      target.scrollTop = 0;
    });
  };

  resetScroll();
  if (typeof requestAnimationFrame === 'function') {
    window.requestAnimationFrame(resetScroll);
  }
}
,

togglePanel(overlay, button, onOpen) {
  if (!overlay || !button) return;
  const willOpen = !overlay.classList.contains('visible');
  this.closeTransientPanels();
  if (willOpen) {
    overlay.classList.add('visible');
    button.classList.add('active');
    if (typeof onOpen === 'function') onOpen();
  }
}
,

canScrollElementInDirection(element, deltaY) {
  if (!element) return false;
  const maxScroll = Math.max(0, (element.scrollHeight || 0) - (element.clientHeight || 0));
  if (maxScroll <= 0) return false;
  if (deltaY < 0) return (element.scrollTop || 0) > 0;
  if (deltaY > 0) return (element.scrollTop || 0) < maxScroll - 1;
  return true;
}
,

attachOverlayScrollGuard(overlay, nestedSelectors = []) {
  if (!overlay || overlay.__appleScrollGuardAttached) return;
  const normalizedSelectors = Array.isArray(nestedSelectors)
    ? nestedSelectors.filter(Boolean)
    : [];

  /** @param {WheelEvent} event */
  const handleWheel = (event) => {
    if (!overlay.classList.contains('visible')) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const nestedScrollable = /** @type {Element | null} */ (target
      ? normalizedSelectors
        .map((selector) => target.closest(selector))
        .find(Boolean)
      : null);
    const activeScrollable = nestedScrollable || overlay;

    if (!this.canScrollElementInDirection(activeScrollable, event.deltaY)) {
      event.preventDefault();
    }
    event.stopPropagation();
  };

  /** @param {TouchEvent} event */
  const handleTouchMove = (event) => {
    if (!overlay.classList.contains('visible')) return;
    event.stopPropagation();
  };

  overlay.addEventListener('wheel', handleWheel, { passive: false });
  overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
  overlay.__appleScrollGuardAttached = true;
}
,

closeTransientPanels() {
  removeElementClass(this.settingsOverlay, 'visible');
  removeElementClass(this.aiLayoutOverlay, 'visible');
  removeElementClass(this.settingsBtn, 'active');
  removeElementClass(this.aiLayoutBtn, 'active');
}
,
};
