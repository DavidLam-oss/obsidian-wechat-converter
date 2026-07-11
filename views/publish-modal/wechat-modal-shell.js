/*
## 核心功能

实现发布弹窗中的 wechat modal shell 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatModalShellMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

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


const wechatModalShellMethods = {
preparePublishModalShell(modal, { mode = 'wechat', mobileSync = false } = {}) {
  modal.titleEl.setText('发布与分发');
  modal.titleEl.removeClass?.('wechat-multiplatform-title');
  if (typeof modal.contentEl.empty === 'function') {
    modal.contentEl.empty();
  } else {
    modal.contentEl.replaceChildren?.();
  }
  modal.contentEl.addClass('wechat-sync-modal');
  modal.contentEl.removeClass?.('wechat-multiplatform-modal');
  modal.contentEl.removeClass?.('wechat-multiplatform-result-modal');
  modal.contentEl.removeClass?.('wechat-feishu-modal-content');
  modal.modalEl?.addClass('wechat-publish-shell');
  modal.modalEl?.removeClass?.('wechat-multiplatform-shell');
  if (mobileSync) {
    modal.contentEl.addClass('wechat-sync-modal-mobile');
    modal.modalEl?.addClass('wechat-sync-shell-mobile');
  }
  if (mode === 'multi') {
    modal.titleEl.addClass?.('wechat-multiplatform-title');
    modal.contentEl.addClass('wechat-multiplatform-modal');
    modal.modalEl?.addClass('wechat-multiplatform-shell');
  }
}
,

createPublishModeTabs(modal, activeMode = 'wechat') {
  const publishModeTabs = modal.contentEl.createDiv({ cls: 'wechat-publish-mode-tabs' });
  const wechatTab = publishModeTabs.createEl('button', {
    text: '微信草稿箱',
    cls: `wechat-publish-mode-tab${activeMode === 'wechat' ? ' is-active' : ''}`,
  });

  const multiPlatformTab = publishModeTabs.createEl('button', {
    cls: `wechat-publish-mode-tab${activeMode === 'multi' ? ' is-active' : ''}`,
  });
  multiPlatformTab.createEl('span', { text: MULTI_PLATFORM_TAB_LABEL });

  const feishuTab = publishModeTabs.createEl('button', {
    text: '飞书云文档',
    cls: `wechat-publish-mode-tab${activeMode === 'feishu' ? ' is-active' : ''}`,
  });

  return { wechatTab, feishuTab, multiPlatformTab };
}
};

export { wechatModalShellMethods };
