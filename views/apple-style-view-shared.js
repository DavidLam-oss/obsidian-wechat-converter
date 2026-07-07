/**
 * @typedef {{ cls?: string, text?: string, value?: string | number, type?: string, href?: string, title?: string, placeholder?: string, checked?: boolean, style?: string, attr?: Record<string, unknown> }} ElementCreateOptionsLike
 * @typedef {HTMLElement & {
 *   createEl: (tag: string, options?: ElementCreateOptionsLike) => ObsidianElementLike,
 *   createDiv: (options?: ElementCreateOptionsLike) => ObsidianElementLike,
 *   createSpan: (options?: ElementCreateOptionsLike) => ObsidianElementLike,
 *   empty: () => void,
 *   addClass: (className: string) => void,
 *   removeClass: (className: string) => void,
 *   toggleClass: (className: string, enabled: boolean) => void,
 *   setCssStyles?: (styles: Record<string, string | number>) => void,
 *   setText?: (text: string) => void,
 *   appendText?: (text: string) => void
 * }} ObsidianElementLike
 * @typedef {ObsidianElementLike & { value: string, checked: boolean, disabled: boolean, selected: boolean }} ObsidianInputLike
 * @typedef {{ base64?: string, mimeType?: string }} WechatsyncAssetLike
 * @typedef {{ getValue?: () => string, getSelection?: () => string, replaceSelection?: (value: string) => void }} EditorLike
 * @typedef {{ path?: string, name?: string, basename?: string }} TFileLike
 * @typedef {{ file?: TFileLike | null, editor?: EditorLike, contentEl: ObsidianElementLike }} MarkdownViewLike
 * @typedef {{ type?: string, state?: Record<string, unknown>, icon?: string, title?: string, active?: boolean }} ViewStateLike
 * @typedef {{ open?: () => void, view?: unknown, getViewState?: () => ViewStateLike, setViewState?: (state: ViewStateLike) => Promise<void> }} LeafLike
 * @typedef {{ on: (name: string, callback: (...args: unknown[]) => unknown) => unknown, getActiveViewOfType: (viewType: unknown) => MarkdownViewLike | null, getActiveFile?: () => TFileLike | null, getLeavesOfType: (viewType: string) => LeafLike[], getRightLeaf: (split?: boolean) => LeafLike | null, getLeaf?: (type?: string | boolean) => LeafLike | null, onLayoutReady: (callback: () => void) => void, revealLeaf?: (leaf: unknown) => Promise<void>, setActiveLeaf?: (leaf: unknown, options?: Record<string, unknown>) => void }} WorkspaceLike
 * @typedef {{ adapter?: unknown, configDir?: string, on?: (name: string, callback: (...args: unknown[]) => unknown) => unknown, getConfig?: (key: string) => unknown, getAbstractFileByPath?: (path: string) => unknown, getResourcePath?: (file: unknown) => string, trash?: (file: unknown, useSystemTrash?: boolean) => Promise<void>, delete?: (file: unknown, force?: boolean) => Promise<void>, read?: (file: unknown) => Promise<string>, readBinary?: (file: unknown) => Promise<unknown>, modify?: (file: unknown, data: string) => Promise<void> }} VaultLike
 * @typedef {{ processFrontMatter?: (file: unknown, callback: (frontmatter: Record<string, unknown>) => void) => Promise<void> }} FileManagerLike
 * @typedef {{ getFileCache?: (file: unknown) => { frontmatter?: Record<string, unknown> } | null, getFirstLinkpathDest?: (linkpath: string, sourcePath: string) => unknown }} MetadataCacheLike
 * @typedef {{ activeTab?: Record<string, unknown>, open?: () => void, openTabById?: (id: string) => void }} AppSettingLike
 * @typedef {{ vault: VaultLike, workspace: WorkspaceLike, fileManager?: FileManagerLike, metadataCache?: MetadataCacheLike, setting?: AppSettingLike, isMobile?: boolean }} AppLike
 * @typedef {{ id: string, name: string, callback?: () => unknown, editorCallback?: (editor: EditorLike) => unknown }} CommandLike
 * @typedef {{ app: AppLike, manifest?: { id?: string, version?: string, dir?: string }, registerEvent: (event: unknown) => void, registerView: (viewType: string, factory: (leaf: LeafLike) => unknown) => void, addRibbonIcon: (icon: string, title: string, callback: () => unknown) => unknown, addCommand: (command: CommandLike) => void, addSettingTab: (tab: unknown) => void, loadData: () => Promise<unknown>, saveData: (data: unknown) => Promise<void> }} PluginBaseLike
 * @typedef {{ app: AppLike, containerEl: ObsidianElementLike, registerEvent: (event: unknown) => void }} ItemViewBaseLike
 * @typedef {{ app: AppLike, containerEl: ObsidianElementLike }} SettingTabBaseLike
 * @typedef {{ titleEl: ObsidianElementLike, contentEl: ObsidianElementLike, modalEl?: ObsidianElementLike, open: () => void, close: () => void, onClose?: () => void }} ModalLike
 * @typedef {{ setValue: (value: boolean) => ToggleComponentLike, onChange: (callback: (value: boolean) => unknown) => ToggleComponentLike }} ToggleComponentLike
 * @typedef {{ inputEl?: ObsidianElementLike, setPlaceholder: (value: string) => TextComponentLike, setValue: (value: string) => TextComponentLike, onChange: (callback: (value: string) => unknown) => TextComponentLike }} TextComponentLike
 * @typedef {{ addOption: (value: string, label: string) => DropdownComponentLike, setValue: (value: string) => DropdownComponentLike, onChange: (callback: (value: string) => unknown) => DropdownComponentLike }} DropdownComponentLike
 * @typedef {{ setButtonText: (value: string) => ButtonComponentLike, onClick: (callback: () => unknown) => ButtonComponentLike, setDestructive?: () => ButtonComponentLike, setWarning?: () => ButtonComponentLike }} ButtonComponentLike
 * @typedef {{ setName: (value: string) => SettingComponentLike, setDesc: (value: string) => SettingComponentLike, setHeading: () => SettingComponentLike, addToggle: (callback: (toggle: ToggleComponentLike) => unknown) => SettingComponentLike, addText: (callback: (text: TextComponentLike) => unknown) => SettingComponentLike, addDropdown: (callback: (dropdown: DropdownComponentLike) => unknown) => SettingComponentLike, addButton: (callback: (button: ButtonComponentLike) => unknown) => SettingComponentLike }} SettingComponentLike
 * @typedef {{ setMessage: (message: string) => void, hide: () => void }} NoticeLike
 * @typedef {{ value: string, label: string }} ThemeOptionLike
 * @typedef {{ value: string, color: string }} ThemeColorOptionLike
 * @typedef {{ getThemeList: () => ThemeOptionLike[], getColorList: () => ThemeColorOptionLike[] }} AppleThemeApiLike
 * @typedef {{ new (...args: unknown[]): unknown }} ConstructorLike
 * @typedef {{ Plugin: new (...args: unknown[]) => PluginBaseLike, MarkdownView: ConstructorLike, ItemView: new (...args: unknown[]) => ItemViewBaseLike, Notice: new (message: string, timeout?: number) => NoticeLike, Platform: Record<string, unknown>, PluginSettingTab: new (...args: unknown[]) => SettingTabBaseLike, Setting: new (containerEl: ObsidianElementLike | HTMLElement) => SettingComponentLike, Modal?: new (app: AppLike) => ModalLike, setIcon?: (element: HTMLElement, icon: string) => void, requestUrl?: (options: Record<string, unknown>) => Promise<unknown>, request?: (options: Record<string, unknown>) => Promise<unknown>, MarkdownRenderer?: unknown }} ObsidianApiLike
 * @typedef {{ id: string, name: string, appId: string, appSecret: string, author?: string, contentSourceUrl?: string, openComment?: boolean, onlyFansCanComment?: boolean }} WechatAccountLike
 * @typedef {{ sourcePath?: string, mediaId?: string, index?: number }} DraftAssociationLike
 * @typedef {{ modal?: ModalLike, isProxyAuth?: boolean, draftAssociation?: DraftAssociationLike }} SyncModalOptionsLike
 * @typedef {{ mediaId: string, url?: string, name?: string }} WechatMaterialSelectionLike
 * @typedef {{ media_id?: string, mediaId?: string, url?: string, name?: string }} WechatMaterialItemLike
 * @typedef {{ item?: WechatMaterialItemLike[], total_count?: number, item_count?: number, fromCache?: boolean, [key: string]: unknown }} WechatMaterialPageLike
 * @typedef {{ cachedAt: number, data: WechatMaterialPageLike }} WechatMaterialCacheEntryLike
 * @typedef {{ coverBase64?: string, thumbMediaId?: string, materialCover?: WechatMaterialSelectionLike | null, title?: string, digest?: string }} ArticleSessionStateLike
 * @typedef {{ id?: string, platform?: string, name?: string, status?: string, success?: boolean, url?: string, error?: string, message?: string, [key: string]: unknown }} WechatsyncPlatformResultLike
 * @typedef {{ found?: boolean, title?: string, platforms?: WechatsyncPlatformResultLike[], [key: string]: unknown }} WechatsyncTaskSnapshotLike
 * @typedef {{ skippedPlatforms?: unknown[], publishedPlatforms?: unknown[], platforms?: unknown[], quotaBlocked?: boolean, reason?: string, message?: string, [key: string]: unknown }} WechatsyncQuotaResultLike
 * @typedef {{ start: () => Promise<unknown>, stop?: () => Promise<void>, waitForConnection?: (timeoutMs?: number) => Promise<unknown>, openSyncTask?: (taskId: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>, getSyncTaskLink?: (taskId: string, options?: Record<string, unknown>) => Promise<Record<string, unknown>>, getSyncTask?: (taskId: string, options?: Record<string, unknown>) => Promise<WechatsyncTaskSnapshotLike | Record<string, unknown>> }} WechatSyncBridgeServiceLike
 * @typedef {{ warning?: string, attempted?: boolean, success?: boolean, cleanedPath?: string }} CleanupResultLike
 * @typedef {{ src?: string, [key: string]: unknown }} ImageUploadFailureLike
 * @typedef {{ code?: string, message?: string, value?: string }} DraftContentIssueLike
 * @typedef {{ cleanupResult?: CleanupResultLike, imageUploadFailures?: ImageUploadFailureLike[], placeholderImageSources?: string[], draftWarnings?: DraftContentIssueLike[], mediaId?: string, isUpdate?: boolean, draftIndex?: number, [key: string]: unknown }} WechatDraftSyncResultLike
 * @typedef {{ account: WechatAccountLike, proxyUrl?: string, currentHtml: string, activeFile?: TFileLike | null, publishMeta?: Record<string, unknown> | null, sessionTitle?: string, sessionCoverBase64?: string, sessionThumbMediaId?: string, sessionDigest?: string, draftMediaId?: string, draftIndex?: number, onStatus?: (stage: string) => void, onImageProgress?: (current: number, total: number) => void, onMathProgress?: (current: number, total: number) => void }} WechatSyncToDraftOptionsLike
 * @typedef {{ syncToDraft: (options: WechatSyncToDraftOptionsLike) => Promise<WechatDraftSyncResultLike> }} WechatSyncServiceLike
 * @typedef {{ mediaId?: string, fingerprint?: string, [key: string]: unknown }} CoverCacheEntry
 * @typedef {{ url?: string, [key: string]: unknown }} ImageCacheEntry
 * @typedef {{ url?: string, [key: string]: unknown }} SvgUploadCacheEntry
 * @typedef {{ ok: boolean, markdown?: string, sourcePath?: string }} MarkdownSourceResultLike
 * @typedef {{ showLoading?: boolean, loadingText?: string, loadingDelay?: number, sourceOverride?: { markdown?: string, sourcePath?: string } | null }} ConvertCurrentOptionsLike
 * @typedef {{ sourcePath?: string, settings?: PluginSettingsLike | Record<string, unknown> }} RenderCandidateContextLike
 * @typedef {{ id: string, name: string, kind: string, baseUrl: string, apiKey: string, model: string, enabled?: boolean }} AiProviderLike
 * @typedef {{ enabled: boolean, defaultLayoutFamily: string, defaultColorPalette: string, defaultProviderId: string, customColor?: string, includeImagesInLayout?: boolean, requestTimeoutMs?: number, providers: AiProviderLike[], articleLayoutsByPath: Record<string, unknown> }} AiSettingsLike
 * @typedef {{ theme: string, themeColor: string, customColor: string, quoteCalloutStyleMode: string, fontFamily: string, fontSize: number, macCodeBlock: boolean, codeLineNumber: boolean, avatarUrl: string, avatarBase64: string, enableWatermark: boolean, showImageCaption: boolean, normalizeChinesePunctuation: boolean, wechatAccounts: WechatAccountLike[], defaultAccountId: string, proxyUrl: string, clientId: string, draftCache: unknown, usePhoneFrame: boolean, sidePadding: number, coloredHeader: boolean, cleanupAfterSync: boolean, cleanupUseSystemTrash: boolean, cleanupDirTemplate: string, multiPlatformSync: unknown, wechatAppId: string, wechatAppSecret: string, ai: AiSettingsLike, [key: string]: unknown }} PluginSettingsLike
 * @typedef {{ update: (values: Record<string, unknown>) => void }} ThemeRuntimeLike
 * @typedef {{ updateConfig?: (values: Record<string, unknown>) => void, reinit?: () => void, initMarkdownIt?: () => Promise<void> }} ConverterRuntimeLike
 * @typedef {{ renderForPreview: (markdown: string, context: { sourcePath: string, settings: PluginSettingsLike }) => Promise<string> }} RenderPipelineLike
 * @typedef {{ updateAiToolbarState?: () => void, refreshAiLayoutPanel?: () => void }} ConverterViewRefreshLike
 * @typedef {PluginBaseLike & { settings: PluginSettingsLike, obsidianApi?: ObsidianApiLike, _wechatSyncBridgeService?: WechatSyncBridgeServiceLike, _wechatSyncBridgeCacheKey?: string, _lastSaveSettingsErrorAt?: number, openConverter: () => Promise<void>, openExternalUrl?: (url: string) => boolean, getConverterView?: () => unknown, getWechatSyncBridgeService?: () => WechatSyncBridgeServiceLike, saveSettings: () => Promise<boolean>, getArticleLayoutState?: (sourcePath: string, selection?: AiLayoutSelectionLike | Record<string, unknown>) => AiLayoutStateLike | null, saveArticleLayoutState?: (sourcePath: string, nextState: AiLayoutStateLike | Record<string, unknown>, selection?: AiLayoutSelectionLike | Record<string, unknown>) => Promise<AiLayoutStateLike | null> }} AppleStylePluginLike
 * @typedef {{ settings?: PluginSettingsLike | Record<string, unknown> }} PluginWithSettingsLike
 * @typedef {{ setDestructive?: () => unknown, setWarning?: () => unknown }} ButtonCompatLike
 * @typedef {{ renderSettingsContent?: () => void, [key: string]: unknown }} SettingTabCompatLike
 * @typedef {{ commandName: string, zhTitle: string, enTitle: string, zhPlaceholder: string[], enPlaceholder: string[], zhNotice: string, enNotice: string }} ImageSwipeCopyLike
 * @typedef {{ message: string, isFatal?: boolean, isProxyAuth?: boolean }} ReadableErrorLike
 * @typedef {{ method?: string, body?: string, headers?: Record<string, string>, contentType?: string, throw?: boolean }} RequestUrlOptionsLike
 * @typedef {{ status: number, json?: unknown, text: string, arrayBuffer?: () => Promise<ArrayBuffer>, headers: Record<string, string> }} RequestUrlResponseLike
 * @typedef {{ checkbox: ObsidianInputLike, toggle: ObsidianElementLike }} CaptionToggleStateLike
 * @typedef {{ layoutFamily?: string, colorPalette?: string }} AiLayoutSelectionLike
 * @typedef {{ type?: string, sectionIndex?: number, title?: string, caseLabel?: string, text?: string, caption?: string, buttonText?: string, imageId?: string, [key: string]: unknown }} AiLayoutBlockLike
 * @typedef {{ blocks?: AiLayoutBlockLike[], selection?: AiLayoutSelectionLike, resolved?: AiLayoutSelectionLike, articleType?: string, stylePack?: string, recommendedLayoutFamily?: string, recommendedColorPalette?: string, layoutFamily?: string, title?: string, summary?: string, [key: string]: unknown }} AiLayoutJsonLike
 * @typedef {{ source?: string, originalIndex?: number, blockKey?: string, type?: string, label?: string, index?: number, [key: string]: unknown }} AiLayoutBlockOriginLike
 * @typedef {{ providerName?: string, providerModel?: string, blockOrigins?: AiLayoutBlockOriginLike[], schemaValidation?: AiSchemaValidationLike, executionMode?: string, fallbackUsed?: boolean, fallbackBlockCount?: number, [key: string]: unknown }} AiLayoutGenerationMetaLike
 * @typedef {{ issueCount?: number, fatal?: boolean, issues?: { path?: string, message?: string, fatal?: boolean }[], [key: string]: unknown }} AiSchemaValidationLike
 * @typedef {{ status?: string, layoutJson?: AiLayoutJsonLike | null, generationMeta?: AiLayoutGenerationMetaLike | null, selection?: AiLayoutSelectionLike, resolved?: AiLayoutSelectionLike, sourceHash?: string, providerId?: string, model?: string, updatedAt?: number, lastError?: string, lastAttemptStatus?: string, lastAttemptError?: string, lastAttemptAt?: number, lastAttemptSchemaValidation?: AiSchemaValidationLike | null, dismissedBlockKeys?: string[], recommendedLayoutFamily?: string, recommendedColorPalette?: string, stylePack?: string, layoutFamily?: string, [key: string]: unknown }} AiLayoutStateLike
 * @typedef {{ sourcePath: string, markdown: string, sourceHash: string, isSourcePending?: boolean, isSourceSwitching?: boolean, isStaleSuppressed?: boolean, title: string }} AiLayoutContextLike
 * @typedef {{ layoutJson: AiLayoutJsonLike | null, blockOrigins: AiLayoutBlockOriginLike[], hiddenCount: number }} VisibleAiLayoutSnapshotLike
 * @typedef {{ name: string, desc?: string, searchable?: boolean, render: (setting: SettingComponentLike, group?: unknown) => void }} SettingDefinitionRenderLike
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
