/// <reference path="../project-types.js" />
/*
## 核心功能

实现 Obsidian 插件视图层的 apple style view shared 能力。

## 输入

接收 Obsidian ItemView/PluginSettingTab 生命周期、插件实例、用户事件和服务层结果。

## 输出

输出 `createRenderPipelines`、`buildRenderRuntime`、`resolveMarkdownSource`、`normalizeVaultPath`、`isAbsolutePathLike`、`renderObsidianTripletMarkdown`、`canUseNativePreviewFastPath`、`renderNativeMarkdown`、`convertRenderedMermaidDiagramsToImages`、`renderMermaidCodeBlocks`，用于组装主视图、状态栏或共享视图方法。

## 定位

位于 views/，是 UI 编排层；复杂业务规则应委托 converter.js 或 services/。

## 依赖

关键依赖：`../services/render-pipeline.js`、`../services/dependency-loader.js`、`../services/markdown-source.js`、`../services/path-utils.js`、`../services/obsidian-triplet-renderer.js`、`../services/native-renderer.js`、`../services/rendered-mermaid.js`、`../services/ai-layout.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/


export {
  createRenderPipelines,
} from '../services/render-pipeline.js';
export {
  buildRenderRuntime,
} from '../services/dependency-loader.js';
export {
  resolveMarkdownSource,
} from '../services/markdown-source.js';
export {
  normalizeVaultPath,
  isAbsolutePathLike,
} from '../services/path-utils.js';
export {
  renderObsidianTripletMarkdown,
} from '../services/obsidian-triplet-renderer.js';
export {
  canUseNativePreviewFastPath,
  renderNativeMarkdown,
} from '../services/native-renderer.js';
export {
  convertRenderedMermaidDiagramsToImages,
  renderMermaidCodeBlocks,
} from '../services/rendered-mermaid.js';
export {
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
} from '../services/ai-layout.js';
export {
  createWechatSyncService,
} from '../services/wechat-sync.js';
export {
  createWechatSyncBridgeService,
  isUnsupportedBridgeMethodError as isWechatSyncUnsupportedMethodError,
} from '../services/wechatsync-bridge.js';
export {
  getMultiPlatformResultSummary,
  getWechatSyncResultError,
  getWechatSyncResultPlatformId,
  getWechatSyncResultUrl,
  normalizeWechatsyncPlatform,
  sortWechatsyncPlatformItemsForDisplay,
} from '../services/wechatsync-results.js';
export {
  resolveSyncAccount,
  toSyncFriendlyMessage,
} from '../services/sync-context.js';
export {
  createEmptyDraftCache,
  normalizeDraftCache,
  getDraftAssociation,
  setDraftAssociation,
  clearDraftAssociation,
} from '../services/wechat-draft-cache.js';
export {
  processAllImages as processAllImagesService,
  processMathFormulas as processMathFormulasService,
} from '../services/wechat-media.js';
export {
  cleanHtmlForDraft as cleanHtmlForDraftService,
} from '../services/wechat-html-cleaner.js';
export {
  rasterizeSvgToPngBlob,
} from '../services/svg-rasterizer.js';
export {
  createObsidianFetchAdapter,
} from '../services/obsidian-fetch-adapter.js';
export {
  stripMarkdownFrontmatter,
} from '../services/markdown-utils.js';
export {
  mapAppUrlImagesToAssetUrls,
} from '../services/article-image-assets.js';
export {
  createHtmlContainer,
  getActiveDocument,
  getActiveWindowValue,
  htmlToText,
  setElementHtml,
} from '../services/dom-utils.js';
export {
  createDefaultMultiPlatformSyncSettings,
  parseWechatsyncPlatformIds,
  hasWechatSyncCapability,
  normalizeMultiPlatformSyncSettings,
  getAvailableWechatsyncPlatforms,
} from '../services/wechatsync-settings.js';
export {
  formatWechatsyncCheckedAt,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
} from './connection-status-bar.js';
export {
  renderMultiPlatformSettingsTab,
} from './settings/multi-platform-tab.js';
export {
  showMultiPlatformPublishModal,
} from './publish-modal/multi-platform.js';
export {
  renderFeishuSettingsTab,
} from './settings/feishu-tab.js';
export {
  renderFeishuPublishTab,
} from './publish-modal/feishu.js';
export {
  createDefaultFeishuSyncSettings,
  normalizeFeishuSyncSettings,
  updateFeishuHistoryPath,
} from '../services/feishu-settings.js';
export {
  WechatAPI,
} from '../services/wechat-api.js';
export {
  loadCommonJsDependency,
  obsidianApi,
  Plugin,
  MarkdownView,
  ItemView,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  getObsidianModalClass,
  createObsidianModal,
  getObsidianSetIcon,
  getObsidianRequestUrl,
  getObsidianRequest,
} from '../services/obsidian-compat.js';
export {
  LEGACY_SETTING_RENDER_KEY,
  revealLeafCompat,
  getPluginSettings,
  setPluginSettings,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  isMobileClient as isMobileClientBase,
  generateId,
} from './shared/view-state-utils.js';
export {
  getActiveDocumentCompat,
  createFallbackSvgElement,
  getAppleThemeApi,
  getValueElementFromEvent,
  getEventTargetValue,
  toImageElements,
  removeElementClass,
} from './shared/view-dom-helpers.js';
export {
  toReadableError,
} from '../services/readable-error.js';
export {
  isRecord,
  toRecord,
  toOptionalText,
  toOptionalNumber,
  parseJsonRecord,
} from '../services/record-utils.js';
export {
  toAiLayoutState,
  toAiLayoutJson,
  toAiLayoutBlock,
  toAiLayoutGenerationMeta,
  toAiLayoutSelection,
  toAiLayoutFamilyStates,
} from '../services/ai-layout-records.js';
export {
  normalizeRequestUrlResponse,
  getResponseJsonRecord,
  getProxyErrorMessage,
  createProxyError,
} from '../services/request-utils.js';
export {
  formatWechatApiError,
  hasWechatUploadResult,
} from '../services/wechat-api-utils.js';
export {
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
} from '../services/image-source-utils.js';
export {
  APPLE_STYLE_VIEW,
  APPLE_STYLE_VIEW_TITLE,
  PLACEHOLDER_ICON_DATA_URL,
  GITHUB_REPOSITORY_URL,
  OBSIDIAN_PUBLISHER_PRO_URL,
  OBSIDIAN_PUBLISHER_GUIDE_URL,
  OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL,
  OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL,
  MULTI_PLATFORM_TAB_LABEL,
  MAX_ACCOUNTS,
  AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS,
  DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS,
} from './shared/view-constants.js';
export {
  IMAGE_SWIPE_COMMAND_COPY,
  getObsidianLocale,
  isChineseObsidianLocale,
  getImageSwipeCommandCopy,
  quoteLinesForImageSwipeCallout,
  createImageSwipeCalloutMarkdown,
} from '../services/image-swipe-callout.js';
export {
  createDefaultSettings as createDefaultSettingsObject,
} from '../services/plugin-settings.js';
export {
  sleep,
  pMap,
} from '../services/concurrency.js';

import { Platform } from '../services/obsidian-compat.js';
import { createDefaultSettings } from '../services/plugin-settings.js';
import { DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS } from './shared/view-constants.js';
import { isMobileClient as isMobileClientBase } from './shared/view-state-utils.js';

const DEFAULT_SETTINGS = createDefaultSettings();

/**
 * @param {{ contentSourceUrl?: unknown, openComment?: unknown, onlyFansCanComment?: unknown } | null} [account=null]
 * @returns {{ contentSourceUrl: string, openComment: boolean, onlyFansCanComment: boolean }}
 */
function getWechatAccountPublishOptions(account = null) {
  return {
    contentSourceUrl: typeof account?.contentSourceUrl === 'string'
      ? account.contentSourceUrl
      : DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS.contentSourceUrl,
    openComment: typeof account?.openComment === 'boolean'
      ? account.openComment
      : DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS.openComment,
    onlyFansCanComment: typeof account?.onlyFansCanComment === 'boolean'
      ? account.onlyFansCanComment
      : DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS.onlyFansCanComment,
  };
}

/**
 * @param {{ contentSourceUrl?: unknown, openComment?: unknown, onlyFansCanComment?: unknown }} [values={}]
 * @returns {{ contentSourceUrl: string, openComment: boolean, onlyFansCanComment: boolean }}
 */
function normalizeWechatAccountPublishOptions(values = {}) {
  const contentSourceUrl = typeof values.contentSourceUrl === 'string'
    ? values.contentSourceUrl.trim()
    : '';
  const openComment = !!values.openComment;
  return {
    contentSourceUrl,
    openComment,
    onlyFansCanComment: openComment && !!values.onlyFansCanComment,
  };
}

/**
 * @param {{ isMobile?: boolean } | null | undefined} app
 * @returns {boolean}
 */
function isMobileClient(app) {
  return isMobileClientBase(app, Platform);
}

export {
  DEFAULT_SETTINGS,
  getWechatAccountPublishOptions,
  normalizeWechatAccountPublishOptions,
  isMobileClient,
};
