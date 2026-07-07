/*
## 核心功能

实现发布弹窗中的 wechat account state 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatAccountStateMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../apple-style-view-shared.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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


const wechatAccountStateMethods = {
showAccountSetupEmptyState() {
  if (typeof getObsidianModalClass() !== 'function') {
    if (!this.openPluginSettings()) {
      new Notice('请先在插件设置中添加公众号账号（AppID / AppSecret）');
    }
    return;
  }

  const modal = createObsidianModal(this.app);
  modal.titleEl.setText('未配置公众号账号');
  modal.contentEl.addClass('wechat-sync-modal');
  if (isMobileClient(this.app)) {
    modal.contentEl.addClass('wechat-sync-modal-mobile');
    modal.modalEl?.addClass('wechat-sync-shell-mobile');
  }

  const emptyState = modal.contentEl.createDiv({ cls: 'wechat-sync-empty-state' });
  emptyState.createEl('div', { cls: 'wechat-sync-empty-icon', text: '⚙️' });
  emptyState.createEl('h3', { text: '先配置公众号账号' });
  emptyState.createEl('p', { text: '请先在插件设置中填写 AppID / AppSecret，再发送到微信草稿箱。' });

  const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
  const cancelBtn = btnRow.createEl('button', { text: '取消' });
  cancelBtn.onclick = () => modal.close();

  const configBtn = btnRow.createEl('button', { text: '去配置账号', cls: 'mod-cta' });
  configBtn.onclick = () => {
    modal.close();
    if (!this.openPluginSettings()) {
      new Notice('请在设置中打开 Obsidian 发布助手并配置公众号账号');
    }
  };

  modal.open();
}
,

showSyncFailureActions(message, options = {}) {
  if (typeof getObsidianModalClass() !== 'function') {
    new Notice(`❌ 同步失败: ${message}`);
    return;
  }

  const modal = createObsidianModal(this.app);
  modal.titleEl.setText('同步失败');
  modal.contentEl.addClass('wechat-sync-modal');
  if (isMobileClient(this.app)) {
    modal.contentEl.addClass('wechat-sync-modal-mobile');
    modal.modalEl?.addClass('wechat-sync-shell-mobile');
  }

  const body = modal.contentEl.createDiv({ cls: 'wechat-sync-failure-state' });
  body.createEl('p', { cls: 'wechat-sync-failure-message', text: message });
  
  const isProxyAuth = !!options.isProxyAuth;
  const hasDraftAssociation = !isProxyAuth && !!options.draftAssociation?.mediaId && !!options.draftAssociation?.sourcePath;
  
  let hintText = '可以重试同步，或先检查账号配置。';
  if (isProxyAuth) {
    hintText = '请检查您的 API 代理地址和 Token 配置是否正确。若服务已到期，请联系作者续费。';
  } else if (hasDraftAssociation) {
    hintText = '可以重试同步；如果微信后台草稿已被删除或无法更新，也可以取消关联后新建草稿。';
  }

  body.createEl('p', {
    cls: 'wechat-sync-failure-hint',
    text: hintText
  });

  const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
  const closeBtn = btnRow.createEl('button', { text: '关闭' });
  closeBtn.onclick = () => modal.close();

  const settingsBtn = btnRow.createEl('button', { text: '去配置账号' });
  settingsBtn.onclick = () => {
    modal.close();
    if (!this.openPluginSettings()) {
      new Notice('请在设置中打开 Obsidian 发布助手并配置公众号账号');
    }
  };

  if (hasDraftAssociation) {
    const resetDraftBtn = btnRow.createEl('button', { text: '取消关联并新建草稿' });
    resetDraftBtn.onclick = async () => {
      modal.close();
      clearDraftAssociation(this.plugin.settings, options.draftAssociation.sourcePath);
      this.sessionDraftMediaId = '';
      this.sessionDraftIndex = 0;
      await this.plugin.saveSettings();
      await this.onSyncToWechat();
    };
  }

  const retryBtn = btnRow.createEl('button', { text: '重试同步', cls: 'mod-cta' });
  retryBtn.onclick = async () => {
    modal.close();
    await this.onSyncToWechat();
  };

  modal.open();
}
,

promptConfigureWechatAccount() {
  this.showAccountSetupEmptyState();
}
};

export { wechatAccountStateMethods };
