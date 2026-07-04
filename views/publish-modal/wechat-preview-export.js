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


const wechatPreviewExportMethods = {
getCurrentExportHtml() {
  if (!this.currentHtml) return null;
  if (!this.aiPreviewApplied) return this.currentHtml;

  const context = this.getCurrentLayoutContext();
  const state = this.getCurrentArticleLayoutState();
  const visibleSnapshot = this.getVisibleAiLayoutSnapshot(state);
  if (!state || !visibleSnapshot.layoutJson?.blocks?.length) {
    return this.currentHtml;
  }
  if (context.sourceHash && state.sourceHash && context.sourceHash !== state.sourceHash) {
    return this.currentHtml;
  }

  const imageRefs = extractImageRefsFromHtml(this.baseRenderedHtml || this.currentHtml || '');
  const renderedSectionFragments = extractRenderedSectionFragments(this.baseRenderedHtml || this.currentHtml || '');
  const renderLayout = this.getAiRenderLayoutJson(visibleSnapshot.layoutJson);
  return renderArticleLayoutHtml(renderLayout, {
    imageRefs,
    mode: 'draft',
    renderedSectionFragments,
    colorPaletteOverride: this.getAiColorPaletteOverride(renderLayout?.resolved?.colorPalette || renderLayout?.stylePack),
  });
}
,

restoreBasePreview() {
  if (!this.baseRenderedHtml || !this.previewContainer) return;
  const scrollTop = this.previewContainer.scrollTop;
  this.currentHtml = this.baseRenderedHtml;
  this.aiPreviewApplied = false;
  setElementHtml(this.previewContainer, this.baseRenderedHtml);
  this.previewContainer.scrollTop = scrollTop;
  this.previewContainer.addClass('apple-has-content');
  this.syncPreviewPresentationMode();
  this.refreshAiLayoutPanel();
}
,

syncPreviewPresentationMode() {
  if (!this.previewContainer) return;
  const hasAiPreview = this.aiPreviewApplied === true;
  this.previewContainer.classList.toggle('apple-ai-preview-active', hasAiPreview);
  const previewWrapper = this.previewContainer.closest('.apple-preview-wrapper');
  previewWrapper?.classList.toggle('apple-ai-preview-active', hasAiPreview);
}
,

openPluginSettings() {
  const settingApi = this.app?.setting;
  if (!settingApi || typeof settingApi.open !== 'function') return false;

  settingApi.open();
  const tabId = this.plugin?.manifest?.id || 'wechat-converter';
  if (typeof settingApi.openTabById === 'function') {
    settingApi.openTabById(tabId);
  }
  return true;
}
,

openExternalUrl(url, options = {}) {
  const target = String(url || '').trim();
  const allowExtensionUrls = options?.allowExtensionUrls === true;
  const isHttpUrl = /^https?:\/\//i.test(target);
  const isExtensionUrl = /^(chrome|edge|brave|moz)-extension:\/\//i.test(target);
  if (!isHttpUrl && !(allowExtensionUrls && isExtensionUrl)) {
    new Notice('草稿链接不可用');
    return false;
  }

  if (typeof window !== 'undefined') {
    try {
      const activeDoc = getActiveDocumentCompat();
      if (!activeDoc) return false;
      const a = activeDoc.createElement('a');
      a.href = target;
      a.target = '_blank';
      a.click();
      return true;
    } catch {
      if (typeof window.open === 'function') {
        window.open(target, '_blank', 'noopener');
        return true;
      }
    }
  }

  new Notice('无法打开草稿链接，请在浏览器插件中查看同步结果');
  return false;
}
,

openPublisherProPage() {
  return this.openExternalUrl(OBSIDIAN_PUBLISHER_PRO_URL);
}
,

openPublisherGuidePage(section = '') {
  if (section === 'bridge') {
    return this.openExternalUrl(OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL);
  }
  if (section === 'install-extension') {
    return this.openExternalUrl(OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL);
  }
  return this.openExternalUrl(OBSIDIAN_PUBLISHER_GUIDE_URL);
}
};

export { wechatPreviewExportMethods };
