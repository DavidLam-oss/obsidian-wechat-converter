/*
## 核心功能

实现转换器主面板的 ai layout debug 交互能力。

## 输入

接收 AppleStyleView 实例状态、活动笔记、渲染结果、用户点击和面板控件事件。

## 输出

输出 `aiLayoutDebugMethods`，驱动预览刷新、样式选择、剪贴板或 AI layout 面板行为。

## 定位

位于 views/converter/，只处理转换器视图交互；底层转换和同步逻辑调用 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/converter 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import {
  resolveMarkdownSource,
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  createDefaultAiSettings,
  normalizeLayoutSelection,
  resolveAiProvider,
  extractImageRefsFromHtml,
  extractRenderedSectionFragments,
  generateArticleLayout,
  renderArticleLayoutHtml,
  createObsidianFetchAdapter,
  setElementHtml,
  MarkdownView,
  Notice,
  toReadableError,
  toRecord,
  toAiLayoutJson,
  toAiLayoutBlock,
  toAiLayoutGenerationMeta,
  getObsidianRequestUrl,
  getObsidianRequest,
} from '../apple-style-view-shared.js';

/** @type {AiLayoutDebugMethodsContract & ThisType<AppleStyleViewContract>} */
export const aiLayoutDebugMethods = {
buildAiLayoutDebugJson(state) {
  if (!state) return '';
  return JSON.stringify({
    layoutJson: state.layoutJson || null,
    generationMeta: state.generationMeta || null,
    lastAttempt: {
      status: state.lastAttemptStatus || 'idle',
      error: state.lastAttemptError || '',
      at: state.lastAttemptAt ? new Date(state.lastAttemptAt).toISOString() : '',
      schemaValidation: state.lastAttemptSchemaValidation || null,
    },
  }, null, 2);
}
,

buildAiLayoutErrorDetails({ state, providerLabel, modelLabel, isStale }) {
  return JSON.stringify({
    status: state?.status || 'unknown',
    lastError: state?.lastError || '',
    providerId: state?.providerId || '',
    providerName: providerLabel || '',
    model: modelLabel || '',
    selection: state?.selection || null,
    resolved: state?.resolved || null,
    updatedAt: state?.updatedAt ? new Date(state.updatedAt).toISOString() : '',
    sourceHash: state?.sourceHash || '',
    isStale: isStale === true,
    currentLayoutGenerationMeta: state?.generationMeta || null,
    lastAttempt: {
      status: state?.lastAttemptStatus || 'idle',
      error: state?.lastAttemptError || '',
      at: state?.lastAttemptAt ? new Date(state.lastAttemptAt).toISOString() : '',
      schemaValidation: state?.lastAttemptSchemaValidation || null,
    },
  }, null, 2);
}
,

buildAiLayoutDebugSnapshot({ mode, state, providerLabel, modelLabel, isStale, sourcePath }) {
  if (!state || !mode) return '';
  const header = [
    `mode: ${mode}`,
    `sourcePath: ${sourcePath || ''}`,
    `provider: ${providerLabel || ''}`,
    `model: ${modelLabel || ''}`,
    `updatedAt: ${state?.updatedAt ? new Date(state.updatedAt).toISOString() : ''}`,
    '',
  ].join('\n');
  if (mode === 'json') {
    return `${header}${this.buildAiLayoutDebugJson(state)}`;
  }
  return `${header}${this.buildAiLayoutErrorDetails({ state, providerLabel, modelLabel, isStale })}`;
}
,

truncateAiPromptMarkdown(markdown, maxLength = 1600) {
  const normalized = String(markdown || '').trim();
  if (!normalized) return '';
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}
,

buildAiLayoutPromptContext({ state, context, providerLabel, modelLabel, isStale }) {
  if (!state?.layoutJson) return '';

  const visibleSchemaValidation = this.getVisibleAiSchemaValidation(state);

  const blockLines = Array.isArray(state.layoutJson.blocks)
    ? state.layoutJson.blocks.map((block, index) => {
      const blockRecord = toAiLayoutBlock(block);
      const origin = state.generationMeta?.blockOrigins?.[index]?.source === 'fallback' ? '补全' : 'AI';
      return `${index + 1}. [${origin}] ${blockRecord.type || ''} - ${this.getAiLayoutBlockLabel(blockRecord)}`;
    }).join('\n')
    : '- 无区块';

  const markdownExcerpt = this.truncateAiPromptMarkdown(context?.markdown || '');
  const snapshot = this.aiLayoutDebugMode
    ? this.buildAiLayoutDebugSnapshot({
      mode: this.aiLayoutDebugMode,
      state,
      providerLabel,
      modelLabel,
      isStale,
      sourcePath: context?.sourcePath,
    })
    : this.buildAiLayoutDebugSnapshot({
      mode: 'json',
      state,
      providerLabel,
      modelLabel,
      isStale,
      sourcePath: context?.sourcePath,
    });

  return [
    '# 公众号 AI 编排调试上下文',
    '',
    '请基于下面的信息，帮我分析当前 Obsidian 微信公众号 AI 编排结果，并给出：',
    '1. 当前 block 组合和顺序是否合理',
    '2. 哪些区块适合保留、替换或重排',
    '3. 如果存在失败或 fallback 介入，最可能的原因是什么',
    '4. 下一步最值得调整的 prompt / schema / block 策略',
    '',
    '## 文章信息',
    `- 标题：${context?.title || '未命名文章'}`,
    `- 路径：${context?.sourcePath || ''}`,
    `- 源哈希：${context?.sourceHash || ''}`,
    `- AI 状态：${state.status || 'ready'}`,
    `- 已过期：${isStale ? '是' : '否'}`,
    `- 布局选择：${state.selection?.layoutFamily || ''}`,
    `- 颜色选择：${state.selection?.colorPalette || ''}`,
    `- 最终布局：${state.resolved?.layoutFamily || ''}`,
    `- 最终颜色：${state.resolved?.colorPalette || ''}`,
    `- Provider：${providerLabel || ''}`,
    `- Model：${modelLabel || ''}`,
    '',
    '## 当前布局摘要',
    `- articleType: ${state.layoutJson.articleType || 'article'}`,
    `- blockCount: ${state.layoutJson.blocks?.length || 0}`,
    blockLines,
    '',
    '## 生成元信息',
    '```json',
    JSON.stringify(state.generationMeta || null, null, 2),
    '```',
    '',
    '## Schema 问题',
    '```json',
    JSON.stringify(visibleSchemaValidation, null, 2),
    '```',
    '',
    '## 当前调试快照',
    '```text',
    snapshot,
    '```',
    '',
    '## 文章正文摘录',
    '```md',
    markdownExcerpt || '(无可用正文)',
    '```',
  ].join('\n');
}
,

async copyPlainTextSnapshot(text) {
  if (!text) return false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
,

async copyAiLayoutDebugSnapshot() {
  const state = this.getCurrentArticleLayoutState();
  const aiSettings = this.plugin.settings.ai || createDefaultAiSettings();
  const context = this.getCurrentLayoutContext();
  const providerLabel = this.getArticleLayoutProviderLabel(state, aiSettings);
  const modelLabel = this.getArticleLayoutModelLabel(state, aiSettings);
  const isStale = !!(state && context.sourceHash && state.sourceHash && state.sourceHash !== context.sourceHash);
  const payload = this.buildAiLayoutDebugSnapshot({
    mode: this.aiLayoutDebugMode,
    state,
    providerLabel,
    modelLabel,
    isStale,
    sourcePath: context.sourcePath,
  });

  if (!payload) {
    new Notice('请先展开布局 JSON 或错误详情，再复制调试快照');
    return;
  }

  try {
    const copied = await this.copyPlainTextSnapshot(payload);
    if (!copied) throw new Error('clipboard unavailable');
    new Notice('✅ 调试快照已复制');
  } catch {
    new Notice('❌ 调试快照复制失败，请检查剪贴板权限');
  }
}
,

async copyAiLayoutPromptContext() {
  const state = this.getCurrentArticleLayoutState();
  const aiSettings = this.plugin.settings.ai || createDefaultAiSettings();
  const context = this.getCurrentLayoutContext();
  const providerLabel = this.getArticleLayoutProviderLabel(state, aiSettings);
  const modelLabel = this.getArticleLayoutModelLabel(state, aiSettings);
  const isStale = !!(state && context.sourceHash && state.sourceHash && state.sourceHash !== context.sourceHash);
  const payload = this.buildAiLayoutPromptContext({
    state,
    context,
    providerLabel,
    modelLabel,
    isStale,
  });

  if (!payload) {
    new Notice('当前还没有可用的 AI 编排结果，暂时无法生成 Prompt 上下文');
    return;
  }

  try {
    const copied = await this.copyPlainTextSnapshot(payload);
    if (!copied) throw new Error('clipboard unavailable');
    new Notice('✅ Prompt 上下文已复制');
  } catch {
    new Notice('❌ Prompt 上下文复制失败，请检查剪贴板权限');
  }
}
,

refreshAiLayoutDebugPanel({ state, providerLabel, modelLabel, isStale }) {
  if (!this.aiDebugPanel || !this.aiDebugPanelBody || !this.aiDebugPanelTitle) return;
  const isLoading = this.aiLayoutLoading === true;
  const canShowJson = !!state?.layoutJson;
  const canShowError = !!(state?.status === 'error' || state?.status === 'schema-error' || state?.lastError);
  const isAdvancedOpen = this.aiAdvancedOpen === true;

  if (this.aiViewJsonBtn) {
    this.aiViewJsonBtn.disabled = !canShowJson || isLoading;
    this.aiViewJsonBtn.classList.toggle('is-active', this.aiLayoutDebugMode === 'json');
  }
  if (this.aiViewErrorBtn) {
    this.aiViewErrorBtn.disabled = !canShowError || isLoading;
    this.aiViewErrorBtn.classList.toggle('is-active', this.aiLayoutDebugMode === 'error');
  }
  if (this.aiCopyDebugBtn) {
    this.aiCopyDebugBtn.disabled = !this.aiLayoutDebugMode || isLoading;
  }
  if (this.aiCopyPromptBtn) {
    this.aiCopyPromptBtn.disabled = !state?.layoutJson || isLoading;
  }

  if ((this.aiLayoutDebugMode === 'json' && !canShowJson) || (this.aiLayoutDebugMode === 'error' && !canShowError)) {
    this.aiLayoutDebugMode = '';
  }

  if (!isAdvancedOpen || !this.aiLayoutDebugMode) {
    this.aiDebugPanel.classList.remove('visible');
    this.aiDebugPanelTitle.setText('调试输出');
    this.aiDebugPanelBody.setText('');
    if (this.aiCopyPromptBtn) {
      this.aiCopyPromptBtn.setText('复制给 AI');
      this.aiCopyPromptBtn.title = '复制一份包含文章摘录、布局摘要和调试信息的排查 Prompt';
    }
    if (this.aiCopyDebugBtn) {
      this.aiCopyDebugBtn.setText('复制当前内容');
      this.aiCopyDebugBtn.title = '复制当前调试面板内容';
    }
    if (this.aiCopyDebugBtn) this.aiCopyDebugBtn.disabled = true;
    return;
  }

  this.aiDebugPanel.classList.add('visible');
  if (this.aiCopyDebugBtn) this.aiCopyDebugBtn.disabled = false;
  if (this.aiCopyPromptBtn) {
    this.aiCopyPromptBtn.setText('复制给 AI');
    this.aiCopyPromptBtn.title = this.aiLayoutDebugMode === 'error'
      ? '复制一份包含错误详情、文章摘录和布局摘要的排查 Prompt'
      : '复制一份包含布局 JSON、文章摘录和布局摘要的排查 Prompt';
  }
  if (this.aiLayoutDebugMode === 'json') {
    this.aiDebugPanelTitle.setText('布局 JSON');
    if (this.aiCopyDebugBtn) {
      this.aiCopyDebugBtn.setText('复制 JSON');
      this.aiCopyDebugBtn.title = '只复制当前布局 JSON 调试内容';
    }
    this.aiDebugPanelBody.setText(this.buildAiLayoutDebugJson(state));
    return;
  }

  this.aiDebugPanelTitle.setText('错误详情');
  if (this.aiCopyDebugBtn) {
    this.aiCopyDebugBtn.setText('复制错误详情');
    this.aiCopyDebugBtn.title = '只复制当前错误详情调试内容';
  }
  this.aiDebugPanelBody.setText(this.buildAiLayoutErrorDetails({ state, providerLabel, modelLabel, isStale }));
}
,

refreshAiLayoutPanel() {
  if (!this.aiLayoutStatusBadge || !this.aiLayoutSummary || !this.aiBlockList) return;

  const aiSettings = this.plugin.settings.ai || createDefaultAiSettings();
  const provider = resolveAiProvider(aiSettings);
  const configuredProviders = Array.isArray(aiSettings.providers) ? aiSettings.providers.length : 0;
  const context = this.getCurrentLayoutContext();
  const storedState = this.getCurrentArticleLayoutState();
  const currentSelection = this.getCurrentAiLayoutSelection();
  const activeGenerationSelection = this.aiLayoutLoading === true
    ? normalizeLayoutSelection(this.aiLayoutActiveGenerationSelection || {}, {
      layoutFamily: aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
      colorPalette: aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
    })
    : null;
  const effectiveSelection = {
    layoutFamily: activeGenerationSelection?.layoutFamily || currentSelection.layoutFamily || storedState?.selection?.layoutFamily || aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: activeGenerationSelection?.colorPalette || currentSelection.colorPalette || storedState?.selection?.colorPalette || aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
  };
  const state = storedState;
  if (
    effectiveSelection.layoutFamily === 'source-first'
    && context.sourcePath
    && (!state || ((state.status === 'error' || state.status === 'schema-error') && !(state.layoutJson?.blocks?.length)))
  ) {
    this.recoverSourceFirstLayoutState(state, effectiveSelection, context);
  }
  const generationMeta = state?.generationMeta || null;
  const schemaValidation = this.getVisibleAiSchemaValidation(state);
  const providerLabel = this.getArticleLayoutProviderLabel(state, aiSettings);
  const modelLabel = this.getArticleLayoutModelLabel(state, aiSettings);
  const aiFeatureEnabled = aiSettings.enabled === true;
  const visibleSnapshot = this.getVisibleAiLayoutSnapshot(state);
  const visibleLayout = visibleSnapshot.layoutJson;
  const visibleBlockOrigins = visibleSnapshot.blockOrigins;
  const hiddenBlockCount = visibleSnapshot.hiddenCount;
  const hasReusableLayout = !!(state?.status === 'ready' && visibleLayout?.blocks?.length);
  const hasLastAttemptFailure = state?.lastAttemptStatus === 'error' || state?.lastAttemptStatus === 'schema-error';

  const hasDoc = !!context.sourcePath;
  const hasProvider = !!provider;
  const canUseLocalLayout = effectiveSelection.layoutFamily === 'source-first';
  const canGenerateForSelection = hasProvider || canUseLocalLayout;
  const rawIsStale = !!(state && context.sourceHash && state.sourceHash && state.sourceHash !== context.sourceHash);
  const isSourceSwitching = context.isSourceSwitching === true;
  const isResolvingSourceState = isSourceSwitching || (context.isStaleSuppressed === true && rawIsStale);
  const isStale = rawIsStale && !isResolvingSourceState;
  const hasApplied = this.aiPreviewApplied === true && !!state && !rawIsStale;
  const isGenerating = this.aiLayoutLoading === true;
  const isLoading = isGenerating || isResolvingSourceState;
  const hasVisibleLayout = !!(visibleLayout?.blocks?.length);
  const canApplyVisibleLayout = hasVisibleLayout && !hasApplied && !rawIsStale;

  let badge = '未生成';
  let statusText = hasDoc ? '当前文章还没有 AI 编排结果。' : '请先打开一篇文章。';
  if (isResolvingSourceState) {
    badge = '读取中';
    statusText = '正在切换到当前文章，请稍候。';
  } else if (isGenerating) {
    badge = '生成中';
    statusText = '正在生成并应用新的编排，请稍候。';
  } else if (!aiFeatureEnabled) {
    badge = '已关闭';
    statusText = 'AI 编排已关闭，请先在设置中启用。';
  } else if (!state) {
    if (!hasProvider && !canUseLocalLayout) {
      badge = '待配置';
      statusText = configuredProviders > 0
        ? '当前布局需要可用的 AI Provider，请补全配置后再试。'
        : '当前布局需要 AI Provider，请先到设置中完成配置。';
    } else {
      badge = '未生成';
      statusText = '点击“生成并应用”查看效果。';
    }
  } else if (state?.status === 'schema-error') {
    badge = hasReusableLayout ? '已保留上一版' : '生成失败';
    statusText = hasReusableLayout
      ? '这次生成没有成功，已为你保留上一版结果。'
      : '这次生成没有成功，请重试或检查 AI 设置。';
  } else if (state?.status === 'error') {
    badge = hasReusableLayout ? '已保留上一版' : '生成失败';
    statusText = hasReusableLayout
      ? '这次生成没有成功，已为你保留上一版结果。'
      : '生成失败，请重试或检查 AI 设置。';
  } else if (state && isStale) {
    if (canGenerateForSelection) {
      badge = '需更新';
      statusText = hasReusableLayout
        ? '这份编排基于旧内容，可先应用旧缓存，或重新生成最新结果。'
        : '文章内容有更新，建议重新生成并应用。';
    } else {
      badge = '待配置';
      statusText = hasReusableLayout
        ? '这份编排基于旧内容；若要重新生成，请先完成 AI Provider 配置。'
        : '当前已有旧结果，但文章内容已更新。若要重新生成，请先完成 AI Provider 配置。';
    }
  } else if (hasReusableLayout && hasLastAttemptFailure) {
    badge = '已保留上一版';
    statusText = '这次生成没有成功，已为你保留上一版结果。';
  } else if (state) {
    badge = hasApplied ? '已应用' : '可应用';
    statusText = hasApplied
      ? '已应用到预览。'
      : '可以直接应用到预览。';
  }

  this.aiLayoutStatusBadge.setText(badge);
  this.aiLayoutStatusBadge.className = `apple-ai-layout-badge ${hasApplied ? 'is-applied' : ''} ${isStale ? 'is-stale' : ''} ${(state?.status === 'error' || state?.status === 'schema-error') ? 'is-error' : ''} ${!aiFeatureEnabled ? 'is-disabled' : ''}`;
  const hideSuccessStatusText = !!state
    && !isLoading
    && aiFeatureEnabled
    && !isStale
    && !hasLastAttemptFailure
    && state.status !== 'error'
    && state.status !== 'schema-error';
  this.aiLayoutStatusText.hidden = hideSuccessStatusText;
  this.aiLayoutStatusText.setText(hideSuccessStatusText ? '' : statusText);
  this.applyAiLayoutPanelStylePack(String(
    state?.resolved?.colorPalette
    || (effectiveSelection.colorPalette !== AI_LAYOUT_SELECTION_AUTO ? effectiveSelection.colorPalette : '')
    || aiSettings.defaultStylePack
    || 'tech-green'
  ));
  if (isResolvingSourceState && this.aiCachedLayoutList) {
    this.aiCachedLayoutList.empty();
    this.aiCachedLayoutList.hidden = true;
  } else {
    this.renderAiCachedLayoutFamilies({
      context,
      currentLayoutFamily: state?.resolved?.layoutFamily || state?.layoutFamily || effectiveSelection.layoutFamily,
      isLoading,
    });
  }
  this.aiLayoutFamilySelect.value = effectiveSelection.layoutFamily;
  this.aiColorPaletteSelect.value = effectiveSelection.colorPalette;
  if (this.aiStylePackSelect) this.aiStylePackSelect.value = effectiveSelection.colorPalette;
  this.pendingAiLayoutFamily = effectiveSelection.layoutFamily;
  this.pendingAiColorPalette = effectiveSelection.colorPalette;
  this.pendingAiStylePack = effectiveSelection.colorPalette;
  this.updateAiColorPaletteControls();
  this.aiLayoutFamilySelect.disabled = !aiFeatureEnabled || isLoading;
  this.aiColorPaletteSelect.disabled = !aiFeatureEnabled || isLoading;
  if (this.aiStylePackSelect) this.aiStylePackSelect.disabled = !aiFeatureEnabled || isLoading;
  if (this.aiAdvancedToggleBtn) {
    this.aiAdvancedToggleBtn.classList.toggle('is-open', this.aiAdvancedOpen === true);
    this.aiAdvancedToggleBtn.setAttribute('aria-expanded', this.aiAdvancedOpen === true ? 'true' : 'false');
  }
  if (this.aiAdvancedBody) {
    this.aiAdvancedBody.classList.toggle('visible', this.aiAdvancedOpen === true);
    this.aiAdvancedBody.hidden = this.aiAdvancedOpen !== true;
  }
  if (this.aiLayoutOverlay) {
    this.aiLayoutOverlay.classList.toggle('is-loading', isLoading);
  }
  const converterContainer = this.previewContainer?.closest('.apple-converter-container');
  if (converterContainer) {
    converterContainer.classList.toggle('apple-ai-layout-panel-loading', isLoading);
  }
  if (this.aiLayoutLoadingMask) {
    this.aiLayoutLoadingMask.classList.toggle('visible', isLoading);
  }
  if (this.aiLayoutLoadingMaskText) {
    const layoutLabel = this.getAiLayoutFamilyLabel(effectiveSelection.layoutFamily);
    const colorLabel = this.getAiColorPaletteLabel(effectiveSelection.colorPalette);
    this.aiLayoutLoadingMaskText.setText(isResolvingSourceState
      ? '正在切换文章预览...'
      : `正在生成「${layoutLabel} · ${colorLabel}」编排...`);
  }
  const primaryAction = this.getAiPrimaryActionConfig({
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
  });
  this.aiPrimaryActionMode = primaryAction.mode;
  this.aiGenerateBtn.setText(primaryAction.label);
  this.aiGenerateBtn.disabled = primaryAction.disabled;
  if (this.aiRegenerateBtn) {
    const showRegenerate = !!(
      hasDoc
      && aiFeatureEnabled
      && canGenerateForSelection
      && !isLoading
      && state
      && primaryAction.mode !== 'generate-apply'
    );
    this.aiRegenerateBtn.hidden = !showRegenerate;
    this.aiRegenerateBtn.disabled = !showRegenerate;
  }

  const setSummary = (text = '') => {
    if (!this.aiLayoutSummary) return;
    const value = String(text || '').trim();
    this.aiLayoutSummary.setText(value);
    this.aiLayoutSummary.hidden = !value;
  };
  const setMetaNote = (text = '') => {
    if (!this.aiLayoutMetaNote) return;
    const value = String(text || '').trim();
    this.aiLayoutMetaNote.setText(value);
    this.aiLayoutMetaNote.hidden = !value;
  };

  if (isResolvingSourceState) {
    setSummary('正在读取当前文章的编排状态。');
    this.renderAiLayoutMetaChips([]);
    setMetaNote('');
    this.refreshAiSchemaIssuePanel(null);
  } else if (isGenerating) {
    setSummary(`正在为「${context.title || '当前文章'}」生成新的排版效果。`);
    this.renderAiLayoutMetaChips([]);
    setMetaNote('');
    this.refreshAiSchemaIssuePanel(null);
  } else if (!aiFeatureEnabled) {
    setSummary('启用 AI 编排后，这里会根据当前文章生成版式结果。');
    setMetaNote('');
    this.renderAiLayoutMetaChips([]);
    this.refreshAiSchemaIssuePanel(null);
  } else if (!hasDoc) {
    setSummary('打开一篇文章后，就可以生成专属编排。');
    setMetaNote('');
    this.renderAiLayoutMetaChips([]);
    this.refreshAiSchemaIssuePanel(null);
  } else if (state?.status === 'schema-error') {
    setSummary(hasReusableLayout ? '上一版结果仍可继续使用。' : '');
    this.renderAiLayoutMetaChips([
      ...(providerLabel ? [`Provider ${providerLabel}`] : []),
      ...(modelLabel ? [`模型 ${modelLabel}`] : []),
      ...(schemaValidation?.issueCount > 0 ? [`Schema ${schemaValidation.issueCount} 项`] : []),
    ]);
    setMetaNote(hasReusableLayout ? '如果当前效果还能用，可以直接继续使用上一版。' : '可以重试一次；如仍失败，再到高级里查看具体原因。');
    this.refreshAiSchemaIssuePanel(schemaValidation);
  } else if (state?.status === 'error' && state.lastError) {
    setSummary(hasReusableLayout ? '上一版结果仍可继续使用。' : '');
    this.renderAiLayoutMetaChips([
      ...(providerLabel ? [`Provider ${providerLabel}`] : []),
      ...(modelLabel ? [`模型 ${modelLabel}`] : []),
    ]);
    setMetaNote(hasReusableLayout ? '当前不会影响继续使用上一版结果。' : '如果反复失败，可以到高级里查看错误详情。');
    this.refreshAiSchemaIssuePanel(null);
  } else if (hasReusableLayout && hasLastAttemptFailure) {
    setSummary('上一版结果仍可继续使用。');
    this.renderAiLayoutMetaChips([
      ...(providerLabel ? [`Provider ${providerLabel}`] : []),
      ...(modelLabel ? [`模型 ${modelLabel}`] : []),
      state.lastAttemptStatus === 'schema-error' ? '最近一次校验失败' : '最近一次生成失败',
    ]);
    setMetaNote(hiddenBlockCount > 0 ? `已隐藏 ${hiddenBlockCount} 个区块，可随时恢复。` : '');
    this.refreshAiSchemaIssuePanel(state.lastAttemptStatus === 'schema-error' ? schemaValidation : null);
  } else if (!state) {
    if (!hasProvider && !canUseLocalLayout) {
      setSummary('当前所选布局依赖 AI Provider。');
      setMetaNote('');
      this.renderAiLayoutMetaChips([]);
    } else {
      setSummary('');
      this.renderAiLayoutMetaChips([]);
      setMetaNote('');
    }
    this.refreshAiSchemaIssuePanel(null);
  } else if (state && isStale && !canGenerateForSelection) {
    setSummary('当前已有一版旧结果，但要重新生成需要先完成 AI Provider 配置。');
    this.renderAiLayoutMetaChips([
      ...(providerLabel ? [`Provider ${providerLabel}`] : []),
      ...(modelLabel ? [`模型 ${modelLabel}`] : []),
    ]);
    setMetaNote(canApplyVisibleLayout ? '当前结果仍可继续应用；如果要更新内容，请先恢复 Provider。' : '');
    this.refreshAiSchemaIssuePanel(null);
  } else {
    const blockCount = visibleLayout?.blocks?.length || 0;
    setSummary(`共 ${blockCount} 个区块，可移除不需要的部分。`);

    const metaChips = [];
    if (providerLabel) metaChips.push(`Provider ${providerLabel}`);
    if (modelLabel) metaChips.push(`模型 ${modelLabel}`);
    if (schemaValidation?.issueCount > 0) metaChips.push(`Schema ${schemaValidation.issueCount} 项`);
    if (generationMeta?.executionMode === 'local-fallback') {
      metaChips.push('本地兜底');
    } else if (generationMeta?.fallbackUsed) {
      metaChips.push(`补全 ${generationMeta.fallbackBlockCount} 块`);
    }
    if (hiddenBlockCount > 0) metaChips.push(`已移除 ${hiddenBlockCount} 块`);
    if (hasLastAttemptFailure) {
      metaChips.push(state.lastAttemptStatus === 'schema-error' ? '最近一次校验失败' : '最近一次生成失败');
    }
    this.renderAiLayoutMetaChips(metaChips);
    const hiddenText = hiddenBlockCount > 0 ? `已隐藏 ${hiddenBlockCount} 个区块，可随时恢复。` : '';
    if (hasLastAttemptFailure && state.lastAttemptError) {
      setMetaNote(`上一版结果已保留。${hiddenText}`.trim());
    } else if (generationMeta?.executionMode === 'local-fallback') {
      setMetaNote(`当前使用的是更稳定的本地增强结果。${hiddenText}`.trim());
    } else {
      setMetaNote(hiddenText);
    }
    this.refreshAiSchemaIssuePanel(schemaValidation);
  }

  if (this.aiResultSection) {
    this.aiResultSection.hidden = !(isLoading || hasVisibleLayout || hiddenBlockCount > 0);
  }

  this.aiBlockList.empty();
  if (isLoading) {
    for (let index = 0; index < 4; index += 1) {
      const item = this.aiBlockList.createDiv({ cls: 'apple-ai-layout-block-item is-skeleton' });
      item.createDiv({ cls: 'apple-ai-layout-block-skeleton-index' });
      const content = item.createDiv({ cls: 'apple-ai-layout-block-main' });
      content.createDiv({ cls: 'apple-ai-layout-block-skeleton-line is-title' });
      content.createDiv({ cls: 'apple-ai-layout-block-skeleton-line is-meta' });
      item.createDiv({ cls: 'apple-ai-layout-block-skeleton-badge' });
    }
  } else if (visibleLayout?.blocks?.length) {
    visibleLayout.blocks.forEach((block, index) => {
      const item = this.aiBlockList.createDiv({ cls: 'apple-ai-layout-block-item' });
      const origin = visibleBlockOrigins?.[index] || null;
      if (origin?.blockKey) {
        item.dataset.blockKey = origin.blockKey;
      }
      item.createEl('span', { cls: 'apple-ai-layout-block-index', text: String(index + 1).padStart(2, '0') });
      const content = item.createDiv({ cls: 'apple-ai-layout-block-main' });
      content.createEl('span', {
        cls: 'apple-ai-layout-block-name',
        text: this.getAiLayoutBlockLabel(block),
      });
      if (origin?.originalIndex >= 0) {
        const removeBtn = item.createEl('button', {
          cls: 'apple-ai-layout-block-remove',
          text: '移除',
        });
        removeBtn.addEventListener('click', () => this.removeAiLayoutBlock(origin.originalIndex, item));
      }
    });
  } else {
    this.aiBlockList.createDiv({
      cls: 'apple-ai-layout-empty',
      text: hiddenBlockCount > 0
        ? '当前区块都已被移除，可以点击“恢复已移除”重新查看。'
        : (aiFeatureEnabled ? '生成后会展示区块清单。' : '启用 AI 编排后，这里会展示当前文章的区块清单。'),
    });
  }

  this.aiResetBtn.disabled = !this.aiPreviewApplied || isLoading;
  if (this.aiRegenerateBtn && isLoading) {
    this.aiRegenerateBtn.disabled = true;
  }
  if (this.aiRestoreBlocksBtn) {
    this.aiRestoreBlocksBtn.disabled = hiddenBlockCount <= 0 || isLoading;
    this.aiRestoreBlocksBtn.hidden = hiddenBlockCount <= 0;
  }
  this.restoreAiLayoutPendingAnchor();
  this.refreshAiLayoutDebugPanel({ state, providerLabel, modelLabel, isStale });
  this.updateAiToolbarState();
}
,

async ensureCurrentArticleContext() {
  const source = await resolveMarkdownSource({
    app: this.app,
    lastActiveFile: this.lastActiveFile,
    MarkdownViewType: MarkdownView,
  });

  if (!source.ok || !String(source.markdown || '').trim()) {
    return null;
  }

  const markdown = source.markdown || '';
  const sourcePath = source.sourcePath || '';
  this.lastResolvedMarkdown = markdown;
  this.lastResolvedSourcePath = sourcePath;
  this.lastResolvedSourceHash = String(this.simpleHash(markdown));

  const activeFile = this.getPublishContextFile();
  const publishMeta = this.getFrontmatterPublishMeta(activeFile);
  const title = publishMeta?.title || activeFile?.basename || '未命名文章';

  return {
    markdown,
    sourcePath,
    sourceHash: this.lastResolvedSourceHash,
    title,
  };
}
,

async generateAiLayoutForCurrentArticle({ applyAfterGenerate = false } = {}) {
  const aiSettings = this.plugin.settings.ai || createDefaultAiSettings();
  const context = await this.ensureCurrentArticleContext();
  if (!context) {
    new Notice('请先打开一篇有内容的 Markdown 文章');
    return;
  }

  if (!this.baseRenderedHtml) {
    await this.convertCurrent(true, { showLoading: true, loadingText: '正在准备文章上下文...' });
  }

  const imageRefs = aiSettings.includeImagesInLayout === false
    ? []
    : extractImageRefsFromHtml(this.baseRenderedHtml || this.currentHtml || '');

  const selection = this.getCurrentAiLayoutSelection();
  const provider = resolveAiProvider(aiSettings);
  if (selection.layoutFamily !== 'source-first' && !provider) {
    new Notice('请先在插件设置中配置并启用 AI Provider');
    return;
  }
  const originalText = this.aiGenerateBtn?.textContent;
  try {
    this.aiLayoutActiveGenerationSelection = selection;
    this.aiLayoutLoading = true;
    this.refreshAiLayoutPanel();
    if (this.aiGenerateBtn) {
      this.aiGenerateBtn.disabled = true;
      this.aiGenerateBtn.setText('生成中...');
    }
    const result = await generateArticleLayout({
      provider,
      title: context.title,
      markdown: context.markdown,
      selection,
      imageRefs,
      timeoutMs: aiSettings.requestTimeoutMs,
      fetchImpl: createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() }),
    });
    const layoutJson = toAiLayoutJson(result.layoutJson);
    if (!Array.isArray(layoutJson?.blocks) || !layoutJson.blocks.length) {
      throw new Error('AI 返回了空的编排结果');
    }

    await this.plugin.saveArticleLayoutState(context.sourcePath, {
      version: AI_LAYOUT_SCHEMA_VERSION,
      updatedAt: Date.now(),
      sourceHash: context.sourceHash,
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
    this.pendingAiLayoutFamily = layoutJson.selection?.layoutFamily || selection.layoutFamily;
    this.pendingAiColorPalette = layoutJson.selection?.colorPalette || selection.colorPalette;
    this.pendingAiStylePack = this.pendingAiColorPalette;
    if (applyAfterGenerate) {
      this.applyAiLayoutToPreview();
      new Notice(
        toAiLayoutGenerationMeta(result.generationMeta)?.executionMode === 'local-fallback'
          ? '✅ 已生成并应用原文增强结果'
          : '✅ 已生成并应用新的编排结果'
      );
    } else {
      new Notice(
        toAiLayoutGenerationMeta(result.generationMeta)?.executionMode === 'local-fallback'
          ? '✅ 已生成原文增强结果'
          : '✅ AI 编排已生成'
      );
    }
  } catch (error) {
    console.error('AI 编排生成失败:', error);
    const readableError = toReadableError(error);
    const errorRecord = toRecord(error);
    const errorGenerationMeta = toAiLayoutGenerationMeta(errorRecord.generationMeta);
    const previousState = this.getCurrentArticleLayoutState();
    const isSchemaError = errorRecord.code === 'ai-layout-schema-invalid';
    const hasReusablePreviousLayout = !!(previousState?.status === 'ready' && previousState?.layoutJson?.blocks?.length);
    await this.plugin.saveArticleLayoutState(context.sourcePath, {
      version: AI_LAYOUT_SCHEMA_VERSION,
      updatedAt: hasReusablePreviousLayout ? previousState.updatedAt : Date.now(),
      sourceHash: hasReusablePreviousLayout ? previousState.sourceHash : context.sourceHash,
      providerId: provider?.id || '',
      model: provider?.model || '',
      selection: hasReusablePreviousLayout ? previousState.selection : selection,
      resolved: hasReusablePreviousLayout ? previousState.resolved : {
        layoutFamily: selection.layoutFamily === AI_LAYOUT_SELECTION_AUTO ? 'source-first' : selection.layoutFamily,
        colorPalette: selection.colorPalette === AI_LAYOUT_SELECTION_AUTO ? 'tech-green' : selection.colorPalette,
      },
      recommendedLayoutFamily: hasReusablePreviousLayout ? previousState.recommendedLayoutFamily : '',
      recommendedColorPalette: hasReusablePreviousLayout ? previousState.recommendedColorPalette : '',
      stylePack: hasReusablePreviousLayout
        ? previousState.stylePack
        : (selection.colorPalette === AI_LAYOUT_SELECTION_AUTO ? 'tech-green' : selection.colorPalette),
      status: hasReusablePreviousLayout ? previousState.status : (isSchemaError ? 'schema-error' : 'error'),
      lastError: readableError.message || '未知错误',
      lastAttemptStatus: isSchemaError ? 'schema-error' : 'error',
      lastAttemptError: readableError.message || '未知错误',
      lastAttemptAt: Date.now(),
      lastAttemptSchemaValidation: /** @type {AiSchemaValidationLike | null} */ (errorRecord.schemaValidation || errorGenerationMeta?.schemaValidation || null),
      dismissedBlockKeys: hasReusablePreviousLayout ? (previousState.dismissedBlockKeys || []) : [],
      generationMeta: hasReusablePreviousLayout
        ? previousState.generationMeta
        : (errorGenerationMeta || previousState?.generationMeta || null),
      layoutJson: hasReusablePreviousLayout
        ? previousState.layoutJson
        : (previousState?.layoutJson || {
        version: AI_LAYOUT_SCHEMA_VERSION,
        articleType: 'article',
        selection,
        resolved: {
          layoutFamily: selection.layoutFamily === AI_LAYOUT_SELECTION_AUTO ? 'source-first' : selection.layoutFamily,
          colorPalette: selection.colorPalette === AI_LAYOUT_SELECTION_AUTO ? 'tech-green' : selection.colorPalette,
        },
        recommendedLayoutFamily: '',
        recommendedColorPalette: '',
        stylePack: selection.colorPalette === AI_LAYOUT_SELECTION_AUTO ? 'tech-green' : selection.colorPalette,
        layoutFamily: selection.layoutFamily === AI_LAYOUT_SELECTION_AUTO ? 'source-first' : selection.layoutFamily,
        title: context.title,
        summary: '',
        blocks: [],
      }),
    }, selection);
    new Notice(
      hasReusablePreviousLayout
        ? '❌ 这次生成没有成功，已为你保留上一版结果'
        : (isSchemaError ? `❌ 生成失败：${readableError.message}` : `❌ 生成失败：${readableError.message}`)
    );
  } finally {
    this.aiLayoutLoading = false;
    this.aiLayoutActiveGenerationSelection = null;
    if (this.aiGenerateBtn) {
      this.aiGenerateBtn.disabled = false;
      this.aiGenerateBtn.setText(originalText || '生成并应用');
    }
    this.refreshAiLayoutPanel();
  }
}
,

applyAiLayoutToPreview({ stateOverride = null, allowStale = false } = {}) {
  const context = this.getCurrentLayoutContext();
  const state = stateOverride || this.getCurrentArticleLayoutState();
  const visibleSnapshot = this.getVisibleAiLayoutSnapshot(state);
  if (!state || !visibleSnapshot.layoutJson?.blocks?.length) {
    new Notice('当前文章还没有可用的 AI 编排结果');
    return;
  }
  if (!allowStale && context.sourceHash && state.sourceHash && context.sourceHash !== state.sourceHash) {
    this.refreshAiLayoutPanel();
    return;
  }

  const imageRefs = extractImageRefsFromHtml(this.baseRenderedHtml || this.currentHtml || '');
  const renderedSectionFragments = extractRenderedSectionFragments(this.baseRenderedHtml || this.currentHtml || '');
  const renderLayout = this.getAiRenderLayoutJson(visibleSnapshot.layoutJson);
  const html = renderArticleLayoutHtml(renderLayout, {
    imageRefs,
    renderedSectionFragments,
    colorPaletteOverride: this.getAiColorPaletteOverride(renderLayout?.resolved?.colorPalette || renderLayout?.stylePack),
  });
  const scrollTop = this.previewContainer?.scrollTop || 0;
  this.currentHtml = html;
  this.aiPreviewApplied = true;
  if (this.previewContainer) {
    setElementHtml(this.previewContainer, html);
    this.previewContainer.scrollTop = scrollTop;
    this.previewContainer.addClass('apple-has-content');
  }
  this.syncPreviewPresentationMode();
  this.refreshAiLayoutPanel();
}
,
};
