/*
## 核心功能

实现转换器主面板的 ai layout panel 交互能力。

## 输入

接收 AppleStyleView 实例状态、活动笔记、渲染结果、用户点击和面板控件事件。

## 输出

输出 `aiLayoutPanelMethods`，驱动预览刷新、样式选择、剪贴板或 AI layout 面板行为。

## 定位

位于 views/converter/，只处理转换器视图交互；底层转换和同步逻辑调用 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  normalizeVaultPath,
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  createDefaultAiSettings,
  getLayoutFamilyList,
  getLayoutFamilyById,
  getColorPaletteList,
  getColorPaletteById,
  resolveColorPaletteForRender,
  normalizeHexColor,
  normalizeLayoutSelection,
  resolveAiProvider,
  deriveArticleLayoutStateForSelection,
  normalizeArticleLayoutCacheEntry,
  extractImageRefsFromHtml,
  generateArticleLayout,
  createObsidianFetchAdapter,
  Notice,
  toRecord,
  toAiLayoutState,
  toAiLayoutJson,
  toAiLayoutBlock,
  toAiLayoutGenerationMeta,
  getObsidianRequestUrl,
  getObsidianRequest,
  getEventTargetValue,
} from '../apple-style-view-shared.js';

/** @type {AiLayoutPanelMethodsContract & ThisType<AppleStyleViewContract>} */
export const aiLayoutPanelMethods = {
getCurrentArticleAnyLayoutState() {
  const { sourcePath } = this.getCurrentLayoutContext();
  if (!sourcePath) return null;

  if (typeof this.plugin?.getArticleLayoutState === 'function') {
    return toAiLayoutState(this.plugin.getArticleLayoutState(sourcePath, {}) || null);
  }

  const normalizedPath = normalizeVaultPath(sourcePath);
  const entry = this.plugin?.settings?.ai?.articleLayoutsByPath?.[normalizedPath] || null;
  const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
  if (!normalizedEntry) return null;
  return toAiLayoutState(normalizedEntry.familyStates?.[normalizedEntry.lastLayoutFamily] || null);
}
,

hasCurrentArticleAiLayoutCache() {
  const state = this.getCurrentArticleAnyLayoutState();
  return !!(state?.status === 'ready' && Array.isArray(state.layoutJson?.blocks) && state.layoutJson.blocks.length);
}
,

updateAiToolbarState() {
  if (!this.aiLayoutBtn) return;
  if (this.previewMode === 'sticker') {
    this.aiLayoutBtn.classList.add('hidden');
    this.aiLayoutBtn.hidden = true;
    if (this.aiLayoutOverlay) this.aiLayoutOverlay.classList.remove('visible');
    this.aiLayoutBtn.classList.remove('active');
    return;
  }
  this.aiLayoutBtn.classList.remove('hidden');
  const aiSettings = this.plugin.settings?.ai || createDefaultAiSettings();
  const enabled = aiSettings.enabled === true;
  const hasProvider = !!resolveAiProvider(aiSettings);
  const hasCachedLayout = this.hasCurrentArticleAiLayoutCache();
  const shouldShow = enabled && (hasProvider || hasCachedLayout);

  this.aiLayoutBtn.classList.toggle('is-disabled', !shouldShow);
  this.aiLayoutBtn.setAttribute(
    'title',
    !enabled
      ? 'AI 编排已关闭，请先在插件设置中启用'
      : (shouldShow ? 'AI 编排' : '配置可用 AI Provider 后显示 AI 编排入口')
  );
  this.aiLayoutBtn.hidden = !shouldShow;
  if (!shouldShow) {
    if (this.aiLayoutOverlay) this.aiLayoutOverlay.classList.remove('visible');
    this.aiLayoutBtn.classList.remove('active');
  }
}
,

onAiLayoutButtonClick() {
  if (this.plugin.settings?.ai?.enabled !== true) {
    this.closeTransientPanels();
    this.updateAiToolbarState();
    new Notice('AI 编排当前已关闭，请先在插件设置中启用');
    return;
  }
  this.togglePanel(this.aiLayoutOverlay, this.aiLayoutBtn, () => {
    this.resetAiLayoutPanelViewState();
    this.refreshAiLayoutPanel();
  });
}
,

createAiLayoutPanel(parent) {
  this.attachOverlayScrollGuard(parent, ['.apple-ai-layout-debug-body']);

  const area = parent.createDiv({ cls: 'apple-ai-layout-area' });
  this.aiLayoutArea = area;

  const header = area.createDiv({ cls: 'apple-ai-layout-header' });
  header.createEl('div', { cls: 'apple-ai-layout-title', text: 'AI 编排' });
  header.createEl('div', {
    cls: 'apple-ai-layout-subtitle',
    text: '按当前文章内容生成区块化排版建议',
  });

  this.aiLayoutStatus = area.createDiv({ cls: 'apple-ai-layout-status' });
  this.aiLayoutStatusBadge = this.aiLayoutStatus.createEl('span', { cls: 'apple-ai-layout-badge', text: '未生成' });
  this.aiLayoutStatusBody = this.aiLayoutStatus.createDiv({ cls: 'apple-ai-layout-status-body' });
  this.aiLayoutStatusText = this.aiLayoutStatusBody.createEl('span', {
    cls: 'apple-ai-layout-status-text',
    text: '尚未生成当前文章的 AI 编排结果。',
  });
  this.aiCachedLayoutList = this.aiLayoutStatusBody.createDiv({ cls: 'apple-ai-layout-cache-list' });
  this.aiLayoutSummary = this.aiLayoutStatusBody.createDiv({
    cls: 'apple-ai-layout-summary',
    text: '生成后会在这里展示当前结果的简要说明。',
  });

  const controlSection = area.createDiv({ cls: 'apple-ai-layout-section apple-ai-layout-controls-section' });
  const layoutControl = controlSection.createDiv({ cls: 'apple-ai-layout-control' });
  layoutControl.createEl('label', { cls: 'apple-setting-label', text: '布局' });
  this.aiLayoutFamilySelect = /** @type {ObsidianInputLike} */ (layoutControl.createEl('select', { cls: 'apple-select' }));
  getLayoutFamilyList({ includeAuto: true, includeReserved: false }).forEach((family) => {
    const option = /** @type {ObsidianInputLike} */ (this.aiLayoutFamilySelect.createEl('option', {
      value: family.value,
      text: this.getAiLayoutFamilyLabel(family.value),
    }));
    if ((this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO) === family.value) {
      option.selected = true;
    }
  });

  const paletteControl = controlSection.createDiv({ cls: 'apple-ai-layout-control' });
  paletteControl.createEl('label', { cls: 'apple-setting-label', text: '颜色' });
  this.aiColorPaletteSelect = /** @type {ObsidianInputLike} */ (paletteControl.createEl('select', { cls: 'apple-select apple-ai-layout-color-select' }));
  getColorPaletteList({ includeAuto: true }).forEach((palette) => {
    const option = /** @type {ObsidianInputLike} */ (this.aiColorPaletteSelect.createEl('option', {
      value: palette.value,
      text: palette.label,
    }));
    if ((this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO) === palette.value) {
      option.selected = true;
    }
  });

  this.pendingAiLayoutFamily = this.pendingAiLayoutFamily || this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO;
  this.pendingAiColorPalette = this.pendingAiColorPalette || this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO;
  this.pendingAiStylePack = this.pendingAiColorPalette;
  this.aiLayoutFamilySelect.value = this.pendingAiLayoutFamily;
  this.aiColorPaletteSelect.value = this.pendingAiColorPalette;
  this.aiStylePackSelect = this.aiColorPaletteSelect;
  this.aiColorPaletteControls = paletteControl.createDiv({ cls: 'apple-ai-color-controls' });
  const autoPaletteRow = this.aiColorPaletteControls.createDiv({ cls: 'apple-ai-color-mode-row' });
  this.aiColorPaletteGrid = this.aiColorPaletteControls.createDiv({ cls: 'apple-ai-color-grid' });
  const customPaletteRow = this.aiColorPaletteControls.createDiv({ cls: 'apple-ai-color-custom-row' });
  getColorPaletteList({ includeAuto: true }).forEach((palette) => {
    const isAuto = palette.value === AI_LAYOUT_SELECTION_AUTO;
    const isCustom = palette.value === 'custom';
    const target = isAuto ? autoPaletteRow : (isCustom ? customPaletteRow : this.aiColorPaletteGrid);
    const button = target.createEl('button', {
      cls: isCustom ? 'apple-btn-custom-text apple-ai-color-custom' : (isAuto ? 'apple-ai-color-pill' : 'apple-btn-color apple-ai-color-btn'),
      text: isAuto ? '自动' : (isCustom ? '自定义' : ''),
      title: palette.label,
    });
    button.dataset.value = palette.value;
    if (!isAuto && !isCustom) {
      const pack = getColorPaletteById(palette.value);
      button.style.setProperty('--btn-color', pack?.tokens?.accent || '#7c3aed');
    }
    button.addEventListener('click', async () => {
      await this.onAiColorPaletteChange(palette.value);
      if (isCustom) this.aiCustomColorInput?.click();
    });
  });
  this.aiCustomColorInput = /** @type {ObsidianInputLike} */ (paletteControl.createEl('input', {
    type: 'color',
    cls: 'apple-color-picker-hidden apple-ai-custom-color-input',
  }));
  this.aiCustomColorInput.value = this.getAiCustomColor();
  this.aiCustomColorInput.addEventListener('input', (event) => {
    const nextColor = normalizeHexColor(getEventTargetValue(event, this.getAiCustomColor()), this.getAiCustomColor());
    this.plugin.settings.ai.customColor = nextColor;
  });
  this.aiCustomColorInput.addEventListener('change', async (event) => {
    const nextColor = normalizeHexColor(getEventTargetValue(event, this.getAiCustomColor()), this.getAiCustomColor());
    this.plugin.settings.ai.customColor = nextColor;
    await this.plugin.saveSettings();
    await this.onAiColorPaletteChange('custom', { skipSave: true });
  });
  this.updateAiColorPaletteControls();
  this.aiLayoutFamilySelect.addEventListener('change', () => {
    this.onAiLayoutFamilyChange(this.aiLayoutFamilySelect.value || this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO);
  });
  this.aiColorPaletteSelect.addEventListener('change', () => {
    this.onAiColorPaletteChange(this.aiColorPaletteSelect.value || this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO);
  });

  const actionRow = area.createDiv({ cls: 'apple-ai-layout-actions' });
  this.aiGenerateBtn = actionRow.createEl('button', { cls: 'apple-btn-primary', text: '生成并应用' });
  this.aiGenerateBtn.addEventListener('click', () => this.handleAiPrimaryAction());

  this.aiRegenerateBtn = actionRow.createEl('button', { cls: 'apple-btn-secondary', text: '重新生成并应用' });
  this.aiRegenerateBtn.addEventListener('click', () => this.generateAiLayoutForCurrentArticle({ applyAfterGenerate: true }));

  this.aiResetBtn = actionRow.createEl('button', { cls: 'apple-btn-secondary', text: '恢复普通预览' });
  this.aiResetBtn.addEventListener('click', () => this.restoreBasePreview());

  this.aiRestoreBlocksBtn = actionRow.createEl('button', { cls: 'apple-btn-secondary', text: '恢复已移除' });
  this.aiRestoreBlocksBtn.addEventListener('click', () => this.restoreRemovedAiLayoutBlocks());

  this.aiResultSection = area.createDiv({ cls: 'apple-ai-layout-section apple-ai-layout-result-section' });
  this.aiResultSection.createEl('label', { cls: 'apple-setting-label', text: '区块' });
  this.aiLayoutMetaNote = this.aiResultSection.createDiv({ cls: 'apple-ai-layout-mini-note' });
  this.aiBlockList = this.aiResultSection.createDiv({ cls: 'apple-ai-layout-block-list' });

  const advancedSection = area.createDiv({ cls: 'apple-ai-layout-section apple-ai-layout-advanced' });
  this.aiAdvancedToggleBtn = advancedSection.createEl('button', {
    cls: 'apple-ai-layout-advanced-toggle',
    text: '高级 / 调试',
    attr: { 'aria-expanded': 'false' },
  });
  this.aiAdvancedToggleBtn.addEventListener('click', () => {
    this.aiAdvancedOpen = !this.aiAdvancedOpen;
    if (!this.aiAdvancedOpen) this.aiLayoutDebugMode = '';
    this.refreshAiLayoutPanel();
  });
  this.aiAdvancedBody = advancedSection.createDiv({ cls: 'apple-ai-layout-advanced-body' });

  this.aiLayoutMetaChips = this.aiAdvancedBody.createDiv({ cls: 'apple-ai-layout-meta-chips' });
  this.aiSchemaIssuePanel = this.aiAdvancedBody.createDiv({ cls: 'apple-ai-layout-issues' });

  const debugRow = this.aiAdvancedBody.createDiv({ cls: 'apple-ai-layout-debug-actions' });
  this.aiViewJsonBtn = debugRow.createEl('button', { cls: 'apple-btn-secondary apple-ai-layout-debug-btn', text: '查看布局 JSON' });
  this.aiViewJsonBtn.addEventListener('click', () => this.toggleAiLayoutDebugMode('json'));

  this.aiViewErrorBtn = debugRow.createEl('button', { cls: 'apple-btn-secondary apple-ai-layout-debug-btn', text: '查看错误详情' });
  this.aiViewErrorBtn.addEventListener('click', () => this.toggleAiLayoutDebugMode('error'));

  this.aiDebugPanel = this.aiAdvancedBody.createDiv({ cls: 'apple-ai-layout-debug-panel' });
  const debugHeader = this.aiDebugPanel.createDiv({ cls: 'apple-ai-layout-debug-header' });
  this.aiDebugPanelTitle = debugHeader.createDiv({ cls: 'apple-ai-layout-debug-title', text: '调试输出' });
  const debugTools = debugHeader.createDiv({ cls: 'apple-ai-layout-debug-tools' });
  this.aiCopyPromptBtn = debugTools.createEl('button', {
    cls: 'apple-ai-layout-debug-copy',
    text: '复制给 AI',
    title: '复制一份包含文章摘录、布局摘要和调试信息的排查 Prompt',
  });
  this.aiCopyPromptBtn.addEventListener('click', () => this.copyAiLayoutPromptContext());
  this.aiCopyDebugBtn = debugTools.createEl('button', {
    cls: 'apple-ai-layout-debug-copy',
    text: '复制当前内容',
    title: '复制当前调试面板内容',
  });
  this.aiCopyDebugBtn.addEventListener('click', () => this.copyAiLayoutDebugSnapshot());
  this.aiDebugPanelBody = this.aiDebugPanel.createEl('pre', { cls: 'apple-ai-layout-debug-body' });

  this.aiLayoutLoadingMask = parent.createDiv({ cls: 'apple-ai-layout-loading-mask' });
  const loadingBar = this.aiLayoutLoadingMask.createDiv({ cls: 'apple-ai-layout-loading-bar' });
  loadingBar.createDiv({ cls: 'apple-ai-layout-loading-bar-fill' });
  this.aiLayoutLoadingSpinner = this.aiLayoutLoadingMask.createDiv({ cls: 'apple-ai-layout-loading-spinner' });
  this.aiLayoutLoadingMaskText = this.aiLayoutLoadingMask.createDiv({
    cls: 'apple-ai-layout-loading-text',
    text: '正在生成 AI 编排...',
  });

  this.refreshAiLayoutPanel();
}
,

getAiCustomColor() {
  return normalizeHexColor(this.plugin.settings?.ai?.customColor, '#7c3aed');
}
,

getAiColorPaletteOverride(colorPaletteId = '') {
  const targetPalette = colorPaletteId || this.getCurrentAiLayoutSelection().colorPalette;
  if (targetPalette !== 'custom') return null;
  return { customColor: this.getAiCustomColor() };
}
,

getAiRenderColorPalette(colorPaletteId = '') {
  const targetPalette = colorPaletteId || this.getCurrentAiLayoutSelection().colorPalette || 'tech-green';
  return /** @type {Record<string, unknown>} */ (resolveColorPaletteForRender(targetPalette, this.getAiColorPaletteOverride(targetPalette)));
}
,

updateAiColorPaletteControls() {
  const selectedValue = this.pendingAiColorPalette || this.aiColorPaletteSelect?.value || this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO;
  if (this.aiColorPaletteSelect && this.aiColorPaletteSelect.value !== selectedValue) {
    this.aiColorPaletteSelect.value = selectedValue;
  }
  if (this.aiCustomColorInput) {
    this.aiCustomColorInput.value = this.getAiCustomColor();
  }
  this.aiColorPaletteControls?.querySelectorAll?.('button[data-value]')?.forEach((button) => {
    if (!(button instanceof HTMLElement)) return;
    button.classList.toggle('active', button.dataset.value === selectedValue);
  });
}
,

getAiRenderLayoutJson(layoutJson = null, colorPaletteId = '') {
  const layoutRecord = toAiLayoutJson(layoutJson);
  if (!layoutRecord) return layoutRecord;
  const selectedPalette = colorPaletteId || this.getCurrentAiLayoutSelection().colorPalette;
  if (!selectedPalette || selectedPalette === AI_LAYOUT_SELECTION_AUTO) return layoutRecord;
  return {
    ...layoutRecord,
    selection: {
      ...(layoutRecord.selection || {}),
      colorPalette: selectedPalette,
    },
    resolved: {
      ...(layoutRecord.resolved || {}),
      colorPalette: selectedPalette,
    },
    stylePack: selectedPalette,
  };
}
,

async onAiColorPaletteChange(value, { skipSave = false } = {}) {
  const nextValue = value || this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO;
  const previousState = this.getCurrentArticleLayoutState();
  this.pendingAiColorPalette = nextValue;
  this.pendingAiStylePack = this.pendingAiColorPalette;
  if (this.aiColorPaletteSelect) this.aiColorPaletteSelect.value = nextValue;
  this.updateAiColorPaletteControls();

  if (!skipSave && nextValue === 'custom') {
    this.plugin.settings.ai.customColor = this.getAiCustomColor();
    await this.plugin.saveSettings();
  }

  await this.ensureAiLayoutSelectionState(previousState, {
    layoutFamily: this.pendingAiLayoutFamily || this.aiLayoutFamilySelect?.value || previousState?.selection?.layoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: this.pendingAiColorPalette,
  });
  if (this.aiPreviewApplied) {
    this.applyAiLayoutToPreview();
    return;
  }
  this.refreshAiLayoutPanel();
}
,

async onAiLayoutFamilyChange(value) {
  const nextValue = value || this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO;
  this.pendingAiLayoutFamily = nextValue;
  if (this.aiLayoutFamilySelect && this.aiLayoutFamilySelect.value !== nextValue) {
    this.aiLayoutFamilySelect.value = nextValue;
  }

  if (this.aiPreviewApplied) {
    const state = this.getCurrentArticleLayoutState();
    if (state?.layoutJson?.blocks?.length) {
      this.applyAiLayoutToPreview({ stateOverride: state, allowStale: true });
      return;
    }
  }

  this.refreshAiLayoutPanel();
}
,

applyAiLayoutPanelStylePack(colorPaletteId) {
  if (!this.aiLayoutOverlay) return;
  const pack = this.getAiRenderColorPalette(colorPaletteId || 'tech-green');
  const tokens = toRecord(pack.tokens);
  this.aiLayoutOverlay.style.setProperty('--ai-layout-accent', tokens.accent || '#0a84ff');
  this.aiLayoutOverlay.style.setProperty('--ai-layout-accent-deep', tokens.accentDeep || tokens.accent || '#0a84ff');
  this.aiLayoutOverlay.style.setProperty('--ai-layout-accent-soft', tokens.accentSoft || 'rgba(0, 122, 255, 0.08)');
  this.aiLayoutOverlay.style.setProperty('--ai-layout-accent-border', tokens.accent || '#0a84ff');
}
,

getAiLayoutBlockStateKey(block = {}, index = 0) {
  const blockRecord = toAiLayoutBlock(block);
  const type = String(blockRecord.type || '').trim();
  const sectionIndex = Number.isInteger(blockRecord.sectionIndex) ? String(blockRecord.sectionIndex) : '';
  const label = String(
    blockRecord.title
    || blockRecord.caseLabel
    || blockRecord.text
    || blockRecord.caption
    || blockRecord.buttonText
    || blockRecord.imageId
    || type
  ).trim();
  return [type, sectionIndex, label, String(index)].join('::');
}
,

getVisibleAiLayoutSnapshot(state) {
  if (!state?.layoutJson?.blocks?.length) {
    return {
      layoutJson: state?.layoutJson || null,
      blockOrigins: [],
      hiddenCount: 0,
    };
  }

  const dismissedKeys = new Set(Array.isArray(state.dismissedBlockKeys) ? state.dismissedBlockKeys : []);
  /** @type {AiLayoutBlockLike[]} */
  const visibleBlocks = [];
  /** @type {AiLayoutBlockOriginLike[]} */
  const visibleOrigins = [];
  let hiddenCount = 0;

  state.layoutJson.blocks.forEach((block, index) => {
    const blockRecord = toAiLayoutBlock(block);
    const blockKey = this.getAiLayoutBlockStateKey(blockRecord, index);
    if (dismissedKeys.has(blockKey)) {
      hiddenCount += 1;
      return;
    }
    visibleBlocks.push(blockRecord);
    const origin = state.generationMeta?.blockOrigins?.[index];
    if (origin) {
      visibleOrigins.push({
        ...origin,
        originalIndex: index,
        blockKey,
      });
    } else {
      visibleOrigins.push({
        index: visibleBlocks.length - 1,
        type: blockRecord.type || '',
        source: 'ai',
        label: this.getAiLayoutBlockLabel(blockRecord),
        originalIndex: index,
        blockKey,
      });
    }
  });

  return {
    layoutJson: {
      ...state.layoutJson,
      blocks: visibleBlocks,
    },
    blockOrigins: visibleOrigins,
    hiddenCount,
  };
}
,

queueAiLayoutRemovalAnchor(originalIndex, itemEl = null) {
  const state = this.getCurrentArticleLayoutState();
  const visibleSnapshot = this.getVisibleAiLayoutSnapshot(state);
  const visibleOrigins = Array.isArray(visibleSnapshot.blockOrigins) ? visibleSnapshot.blockOrigins : [];
  const removedVisibleIndex = visibleOrigins.findIndex((origin) => origin.originalIndex === originalIndex);
  const nextOrigin = removedVisibleIndex >= 0
    ? (visibleOrigins[removedVisibleIndex + 1] || visibleOrigins[removedVisibleIndex - 1] || null)
    : null;
  const overlay = this.aiLayoutOverlay;
  const relativeTop = overlay && itemEl ? Math.max(0, itemEl.offsetTop - overlay.scrollTop) : 0;
  this.aiLayoutPendingAnchor = {
    blockKey: nextOrigin?.blockKey || '',
    relativeTop,
    fallbackScrollTop: overlay?.scrollTop || 0,
  };
}
,

restoreAiLayoutPendingAnchor() {
  const pendingAnchor = this.aiLayoutPendingAnchor;
  if (!pendingAnchor || !this.aiLayoutOverlay) return;
  const items = Array.from(this.aiBlockList?.querySelectorAll?.('.apple-ai-layout-block-item') || []);
  const targetItem = pendingAnchor.blockKey
    ? items.find((item) => item instanceof HTMLElement && item.dataset.blockKey === pendingAnchor.blockKey)
    : null;
  if (targetItem) {
    this.aiLayoutOverlay.scrollTop = Math.max(0, targetItem.offsetTop - (pendingAnchor.relativeTop || 0));
  } else {
    this.aiLayoutOverlay.scrollTop = Math.max(0, pendingAnchor.fallbackScrollTop || 0);
  }
  this.aiLayoutPendingAnchor = null;
}
,

async removeAiLayoutBlock(originalIndex, itemEl = null) {
  const context = this.getCurrentLayoutContext();
  const state = this.getCurrentArticleLayoutState();
  if (!context.sourcePath || !state?.layoutJson?.blocks?.length) return;
  const block = toAiLayoutBlock(state.layoutJson.blocks[originalIndex]);
  if (!block) return;
  this.queueAiLayoutRemovalAnchor(originalIndex, itemEl);
  const blockKey = this.getAiLayoutBlockStateKey(block, originalIndex);
  const nextDismissedBlockKeys = Array.from(new Set([
    ...(Array.isArray(state.dismissedBlockKeys) ? state.dismissedBlockKeys : []),
    blockKey,
  ]));

  await this.plugin.saveArticleLayoutState(context.sourcePath, {
    ...state,
    dismissedBlockKeys: nextDismissedBlockKeys,
  });

  if (this.aiPreviewApplied) {
    this.applyAiLayoutToPreview();
    return;
  }
  this.refreshAiLayoutPanel();
}
,

async restoreRemovedAiLayoutBlocks() {
  const context = this.getCurrentLayoutContext();
  const state = this.getCurrentArticleLayoutState();
  if (!context.sourcePath || !state) return;
  if (!Array.isArray(state.dismissedBlockKeys) || !state.dismissedBlockKeys.length) return;

  await this.plugin.saveArticleLayoutState(context.sourcePath, {
    ...state,
    dismissedBlockKeys: [],
  });

  if (this.aiPreviewApplied) {
    this.applyAiLayoutToPreview();
    return;
  }
  this.refreshAiLayoutPanel();
}
,

async handleAiPrimaryAction() {
  const mode = this.aiPrimaryActionMode || 'generate-apply';
  if (mode === 'apply') {
    this.applyAiLayoutToPreview();
    return;
  }
  if (mode === 'apply-stale') {
    this.applyAiLayoutToPreview({ allowStale: true });
    return;
  }
  await this.generateAiLayoutForCurrentArticle({ applyAfterGenerate: true });
}
,

toggleAiLayoutDebugMode(mode) {
  this.aiAdvancedOpen = true;
  this.aiLayoutDebugMode = this.aiLayoutDebugMode === mode ? '' : mode;
  this.refreshAiLayoutPanel();
}
,

getCurrentLayoutContext() {
  const activeFile = this.app?.workspace?.getActiveFile?.() || this.lastActiveFile || null;
  const activePath = activeFile?.path || '';
  const resolvedPath = this.lastResolvedSourcePath || '';
  const canUseResolvedSource = !activePath || !resolvedPath || activePath === resolvedPath;
  const sourcePath = canUseResolvedSource ? (resolvedPath || activePath) : activePath;
  const markdown = canUseResolvedSource ? (this.lastResolvedMarkdown || '') : '';
  const sourceHash = markdown ? String(this.simpleHash(markdown)) : '';
  const isSourcePending = !!(activePath && resolvedPath && activePath !== resolvedPath);
  const isSourceSwitching = !!(
    isSourcePending
    && this.aiLayoutSourceSwitchPath
    && this.aiLayoutSourceSwitchPath === activePath
  );
  const isStaleSuppressed = this.isAiLayoutStaleSuppressedForPath(sourcePath);
  const activeFileForTitle = activeFile || this.getPublishContextFile();
  const publishMeta = this.getFrontmatterPublishMeta(activeFileForTitle);
  const title = publishMeta?.title || activeFileForTitle?.basename || '未命名文章';
  return {
    sourcePath,
    markdown,
    sourceHash,
    isSourcePending,
    isSourceSwitching,
    isStaleSuppressed,
    title,
  };
}
,

getCurrentAiLayoutSelection() {
  const aiSettings = this.plugin?.settings?.ai || createDefaultAiSettings();
  return normalizeLayoutSelection({
    layoutFamily: this.pendingAiLayoutFamily || this.aiLayoutFamilySelect?.value || aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: this.pendingAiStylePack || this.pendingAiColorPalette || this.aiColorPaletteSelect?.value || this.aiStylePackSelect?.value || aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  }, {
    layoutFamily: aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
}
,

getCurrentArticleLayoutState() {
  const { sourcePath, sourceHash } = this.getCurrentLayoutContext();
  if (!sourcePath) return null;
  const selection = this.getCurrentAiLayoutSelection();
  if (typeof this.plugin?.getArticleLayoutState === 'function') {
    const state = toAiLayoutState(this.plugin.getArticleLayoutState(sourcePath, selection));
    if (state) {
      return this.preferFreshAiLayoutState(sourcePath, selection, state, sourceHash);
    }
  }
  return null;
}
,

preferFreshAiLayoutState(sourcePath = '', selection = {}, candidateState = null, sourceHash = '') {
  if (!candidateState || !sourceHash || !candidateState.sourceHash || candidateState.sourceHash === sourceHash) {
    return candidateState;
  }

  const normalizedSelection = normalizeLayoutSelection(selection || {}, {
    layoutFamily: this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
  const canUseAnyColor = normalizedSelection.colorPalette === AI_LAYOUT_SELECTION_AUTO;
  if (!canUseAnyColor) return candidateState;

  const normalizedPath = normalizeVaultPath(sourcePath || '');
  const entry = normalizeArticleLayoutCacheEntry(this.plugin?.settings?.ai?.articleLayoutsByPath?.[normalizedPath]);
  const statesByFamily = entry?.familyStates || {};
  const requestedFamily = normalizedSelection.layoutFamily === AI_LAYOUT_SELECTION_AUTO
    ? ''
    : normalizedSelection.layoutFamily;
  const exactState = requestedFamily ? toAiLayoutState(statesByFamily[requestedFamily]) : null;
  if (exactState?.sourceHash === sourceHash && exactState.layoutJson?.blocks?.length) return exactState;

  const lastState = toAiLayoutState(statesByFamily[entry?.lastLayoutFamily]);
  if (lastState?.sourceHash === sourceHash && lastState.layoutJson?.blocks?.length) return lastState;

  return Object.values(statesByFamily).map(toAiLayoutState).find((state) => (
    state?.sourceHash === sourceHash
    && state.layoutJson?.blocks?.length
  )) || candidateState;
}
,

async recoverSourceFirstLayoutState(currentState = null, selection = null, context = null) {
  const requestedSelection = normalizeLayoutSelection(selection || this.getCurrentAiLayoutSelection(), {
    layoutFamily: this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
  if (requestedSelection.layoutFamily !== 'source-first') return null;

  const sourceContext = context?.sourcePath ? context : await this.ensureCurrentArticleContext();
  if (!sourceContext?.sourcePath || !sourceContext?.markdown) return null;
  if (currentState?.status === 'ready' && currentState?.layoutJson?.blocks?.length) return currentState;

  const recoveryKey = `${sourceContext.sourcePath}::${requestedSelection.layoutFamily}::${requestedSelection.colorPalette}::${sourceContext.sourceHash}`;
  if (this._sourceFirstRecoveryKey === recoveryKey) return null;
  this._sourceFirstRecoveryKey = recoveryKey;

  try {
    if (!this.baseRenderedHtml) {
      await this.convertCurrent(true, { showLoading: false });
    }
    const aiSettings = this.plugin.settings.ai || createDefaultAiSettings();
    const provider = resolveAiProvider(aiSettings);
    const imageRefs = aiSettings.includeImagesInLayout === false
      ? []
      : extractImageRefsFromHtml(this.baseRenderedHtml || this.currentHtml || '');
    const result = await generateArticleLayout({
      provider,
      title: sourceContext.title,
      markdown: sourceContext.markdown,
      selection: requestedSelection,
      imageRefs,
      timeoutMs: aiSettings.requestTimeoutMs,
      fetchImpl: createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() }),
    });
    const layoutJson = toAiLayoutJson(result.layoutJson);
    if (!Array.isArray(layoutJson?.blocks) || !layoutJson.blocks.length) return null;
    await this.plugin.saveArticleLayoutState(sourceContext.sourcePath, {
      version: AI_LAYOUT_SCHEMA_VERSION,
      updatedAt: Date.now(),
      sourceHash: sourceContext.sourceHash,
      providerId: provider?.id || '',
      model: provider?.model || '',
      selection: layoutJson.selection,
      resolved: layoutJson.resolved,
      recommendedLayoutFamily: layoutJson.recommendedLayoutFamily,
      recommendedColorPalette: layoutJson.recommendedColorPalette,
      stylePack: layoutJson.stylePack,
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      lastAttemptError: '',
      lastAttemptAt: Date.now(),
      lastAttemptSchemaValidation: null,
      dismissedBlockKeys: [],
      generationMeta: toAiLayoutGenerationMeta(result.generationMeta),
      layoutJson,
    }, layoutJson.selection);
    this.pendingAiLayoutFamily = layoutJson.selection?.layoutFamily || requestedSelection.layoutFamily;
    this.pendingAiColorPalette = layoutJson.selection?.colorPalette || requestedSelection.colorPalette;
    this.pendingAiStylePack = this.pendingAiColorPalette;
    this.refreshAiLayoutPanel();
    return layoutJson;
  } catch (error) {
    console.error('原文增强型本地恢复失败:', error);
    return null;
  } finally {
    if (this._sourceFirstRecoveryKey === recoveryKey) {
      this._sourceFirstRecoveryKey = '';
    }
  }
}
,

async ensureAiLayoutSelectionState(baseState = null, selection = null) {
  const context = this.getCurrentLayoutContext();
  if (!context.sourcePath || typeof this.plugin?.getArticleLayoutState !== 'function') return null;
  const requestedSelection = normalizeLayoutSelection(selection || this.getCurrentAiLayoutSelection(), {
    layoutFamily: this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
  const existingState = toAiLayoutState(this.plugin.getArticleLayoutState(context.sourcePath, requestedSelection));
  if (existingState?.layoutJson?.blocks?.length) {
    return existingState;
  }
  const derivedState = deriveArticleLayoutStateForSelection(baseState, requestedSelection, {
    layoutFamily: this.plugin.settings.ai?.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: this.plugin.settings.ai?.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
  if (!derivedState) return null;
  await this.plugin.saveArticleLayoutState(context.sourcePath, {
    ...derivedState,
    updatedAt: Date.now(),
  }, requestedSelection);
  return toAiLayoutState(derivedState);
}
,

isAiLayoutPanelVisible() {
  return !!(this.aiLayoutOverlay && this.aiLayoutOverlay.classList?.contains('visible'));
}
,

shouldSyncAiLayoutUi() {
  return this.aiPreviewApplied === true || this.aiLayoutLoading === true || this.isAiLayoutPanelVisible();
}
,

getArticleLayoutProviderLabel(state, aiSettings) {
  if (!state) return '';
  const providerList = Array.isArray(aiSettings?.providers) ? aiSettings.providers : [];
  const matchedProvider = state.providerId
    ? providerList.find((item) => item.id === state.providerId)
    : null;
  return state.generationMeta?.providerName || matchedProvider?.name || '';
}
,

getArticleLayoutModelLabel(state, aiSettings) {
  if (!state) return '';
  const providerList = Array.isArray(aiSettings?.providers) ? aiSettings.providers : [];
  const matchedProvider = state.providerId
    ? providerList.find((item) => item.id === state.providerId)
    : null;
  return state.generationMeta?.providerModel || state.model || matchedProvider?.model || '';
}
,

getAiLayoutBlockLabel(block) {
  const blockRecord = toAiLayoutBlock(block);
  return blockRecord.title || blockRecord.caseLabel || blockRecord.text || blockRecord.caption || blockRecord.buttonText || blockRecord.type || '未命名区块';
}
,

getAiLayoutFamilyLabel(value) {
  if (value === AI_LAYOUT_SELECTION_AUTO) return '自动推荐';
  const family = getLayoutFamilyById(value);
  if (!family) return value || '自动推荐';
  return family.label || value || '自动推荐';
}
,

getAiColorPaletteLabel(value) {
  if (value === AI_LAYOUT_SELECTION_AUTO) return '自动配色';
  return getColorPaletteById(value)?.label || value || '自动配色';
}
,

getVisibleAiSchemaValidation(state) {
  if (!state) return null;
  if (state.lastAttemptStatus === 'schema-error') {
    return state.lastAttemptSchemaValidation?.issueCount ? state.lastAttemptSchemaValidation : null;
  }
  if (state.lastAttemptStatus === 'error') {
    return null;
  }
  return state.generationMeta?.schemaValidation || null;
}
,

renderAiLayoutMetaChips(chips = []) {
  if (!this.aiLayoutMetaChips) return;
  this.aiLayoutMetaChips.empty();
  chips.forEach((chip) => {
    if (!chip) return;
    this.aiLayoutMetaChips.createEl('span', {
      cls: 'apple-ai-layout-meta-chip',
      text: chip,
    });
  });
}
,

getCurrentArticleLayoutCacheEntry() {
  const { sourcePath } = this.getCurrentLayoutContext();
  if (!sourcePath) return null;
  const normalizedPath = normalizeVaultPath(sourcePath);
  return /** @type {{ familyStates?: Record<string, AiLayoutStateLike>, lastLayoutFamily?: string } | null} */ (normalizeArticleLayoutCacheEntry(this.plugin?.settings?.ai?.articleLayoutsByPath?.[normalizedPath]));
}
,

/** @this {AppleStyleViewContract} */
getCachedAiLayoutFamilyItems(context = undefined) {
  context = context === undefined ? this.getCurrentLayoutContext() : context;
  const entry = this.getCurrentArticleLayoutCacheEntry();
  if (!entry?.familyStates) return [];
  return Object.entries(entry.familyStates)
    .map(([layoutFamily, state]) => {
      const typedState = toAiLayoutState(state);
      if (!typedState?.layoutJson?.blocks?.length) return null;
      const isCurrentContent = !!(context.sourceHash && typedState.sourceHash && typedState.sourceHash === context.sourceHash);
      const isStaleContent = !!(
        !context.isStaleSuppressed
        && context.sourceHash
        && typedState.sourceHash
        && typedState.sourceHash !== context.sourceHash
      );
      const fromAuto = typedState.selection?.layoutFamily === AI_LAYOUT_SELECTION_AUTO;
      return {
        layoutFamily,
        state: typedState,
        label: this.getAiLayoutFamilyLabel(layoutFamily),
        isCurrentContent,
        isStaleContent,
        fromAuto,
        updatedAt: Number(typedState.updatedAt || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isCurrentContent !== b.isCurrentContent) return a.isCurrentContent ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
}
,

renderAiCachedLayoutFamilies({ context, currentLayoutFamily = '', isLoading = false } = {}) {
  if (!this.aiCachedLayoutList) return;
  const items = this.getCachedAiLayoutFamilyItems(context);
  this.aiCachedLayoutList.hidden = items.length === 0;
  this.aiCachedLayoutList.empty();
  if (!items.length) return;

  const activeItem = items.find((item) => item.layoutFamily === currentLayoutFamily) || items[0];
  if (items.length === 1 && activeItem) {
    const inline = this.aiCachedLayoutList.createDiv({ cls: 'apple-ai-layout-cache-inline' });
    const sourceText = activeItem.fromAuto ? '由自动推荐生成' : '手动选择';
    inline.createEl('span', {
      cls: 'apple-ai-layout-cache-name',
      text: `${activeItem.label} · ${sourceText}`,
    });
    if (activeItem.isStaleContent) {
      inline.createEl('span', { cls: 'apple-ai-layout-cache-separator', text: '·' });
      inline.createEl('span', {
        cls: 'apple-ai-layout-cache-state is-stale',
        text: '基于旧内容',
      });
    }
    return;
  }

  const activeRow = this.aiCachedLayoutList.createDiv({ cls: 'apple-ai-layout-cache-inline' });
  const activeSourceText = activeItem?.fromAuto ? '由自动推荐生成' : '手动选择';
  activeRow.createEl('span', {
    cls: 'apple-ai-layout-cache-name',
    text: `${activeItem?.label || this.getAiLayoutFamilyLabel(currentLayoutFamily)} · ${activeSourceText}`,
  });
  if (activeItem?.isStaleContent) {
    activeRow.createEl('span', { cls: 'apple-ai-layout-cache-separator', text: '·' });
    activeRow.createEl('span', {
      cls: 'apple-ai-layout-cache-state is-stale',
      text: '基于旧内容',
    });
  }

  const switchRow = this.aiCachedLayoutList.createDiv({ cls: 'apple-ai-layout-cache-switch-row' });
  switchRow.createEl('span', { cls: 'apple-ai-layout-cache-caption', text: '切换到' });
  items
    .filter((item) => item.layoutFamily !== activeItem?.layoutFamily)
    .forEach((item) => {
      const button = switchRow.createEl('button', {
        cls: 'apple-ai-layout-cache-chip',
        title: item.isStaleContent ? '预览这份基于旧内容的缓存' : '预览这份缓存',
      });
      button.disabled = isLoading;
      button.dataset.layoutFamily = item.layoutFamily;
      button.createEl('span', { cls: 'apple-ai-layout-cache-name', text: item.label });
      if (item.isStaleContent) {
        button.createEl('span', { cls: 'apple-ai-layout-cache-state is-stale', text: '基于旧内容' });
      }
      button.addEventListener('click', () => this.previewCachedAiLayoutFamily(item.layoutFamily));
    });
}
,

previewCachedAiLayoutFamily(layoutFamily = '') {
  const entry = this.getCurrentArticleLayoutCacheEntry();
  const state = entry?.familyStates?.[layoutFamily] || null;
  if (!state?.layoutJson?.blocks?.length) {
    new Notice('这份缓存已经不可用，请重新生成');
    this.refreshAiLayoutPanel();
    return;
  }
  this.pendingAiLayoutFamily = layoutFamily;
  if (this.aiLayoutFamilySelect) this.aiLayoutFamilySelect.value = layoutFamily;
  this.applyAiLayoutToPreview({ stateOverride: state, allowStale: true });
}
,

getAiPrimaryActionConfig({
  hasDoc,
  aiFeatureEnabled,
  canGenerateForSelection,
  state,
  visibleLayout,
  hasReusableLayout,
  hasLastAttemptFailure,
  hasApplied,
  isStale,
  isLoading,
}) {
  if (isLoading) {
    return { mode: 'generate-apply', label: '生成中...', disabled: true };
  }
  if (!hasDoc || !aiFeatureEnabled) {
    return { mode: 'generate-apply', label: '生成并应用', disabled: true };
  }
  if (isStale) {
    if (visibleLayout?.blocks?.length) {
      return { mode: 'apply-stale', label: '应用旧缓存', disabled: false };
    }
    return { mode: 'generate-apply', label: '重新生成并应用', disabled: !canGenerateForSelection };
  }
  if (hasReusableLayout && hasLastAttemptFailure) {
    if (hasApplied) {
      return { mode: 'generate-apply', label: '重新生成并应用', disabled: !canGenerateForSelection };
    }
    return { mode: 'apply', label: '应用上一版', disabled: false };
  }
  if (visibleLayout?.blocks?.length && !hasApplied) {
    return { mode: 'apply', label: '应用当前结果', disabled: false };
  }
  if (!canGenerateForSelection) {
    return { mode: 'generate-apply', label: '生成并应用', disabled: true };
  }
  if (!state) {
    return { mode: 'generate-apply', label: '生成并应用', disabled: false };
  }
  if (state.status === 'error' || state.status === 'schema-error') {
    return { mode: 'generate-apply', label: '重新生成并应用', disabled: false };
  }
  return { mode: 'generate-apply', label: '重新生成并应用', disabled: false };
}
,

refreshAiSchemaIssuePanel(schemaValidation = null) {
  if (!this.aiSchemaIssuePanel) return;
  this.aiSchemaIssuePanel.empty();
  const issues = Array.isArray(schemaValidation?.issues) ? schemaValidation.issues.filter(Boolean) : [];
  if (!issues.length) {
    this.aiSchemaIssuePanel.classList.remove('visible');
    return;
  }

  this.aiSchemaIssuePanel.classList.add('visible');
  this.aiSchemaIssuePanel.createDiv({
    cls: 'apple-ai-layout-issues-title',
    text: schemaValidation?.fatal === true ? 'Schema 校验问题' : 'Schema 提醒',
  });

  issues.slice(0, 5).forEach((issue) => {
    const item = this.aiSchemaIssuePanel.createDiv({
      cls: `apple-ai-layout-issue-item ${issue?.fatal === true ? 'is-fatal' : ''}`,
    });
    item.createEl('span', {
      cls: 'apple-ai-layout-issue-path',
      text: issue?.path || '$',
    });
    item.createEl('span', {
      cls: 'apple-ai-layout-issue-message',
      text: issue?.message || '未知 schema 问题',
    });
  });

  if (issues.length > 5) {
    this.aiSchemaIssuePanel.createDiv({
      cls: 'apple-ai-layout-mini-note',
      text: `其余 ${issues.length - 5} 项请在“错误详情”或调试快照中查看。`,
    });
  }
}
,
};
