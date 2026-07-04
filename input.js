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

/**
 * @param {string} specifier
 * @returns {unknown}
 */
const loadCommonJsDependency = (specifier) => {
  if (typeof require === 'function') {
    const requireFn = /** @type {(specifier: string) => unknown} */ (require);
    return requireFn(specifier);
  }
  const activeWindowRequire = getActiveWindowValue('require');
  if (typeof activeWindowRequire === 'function') {
    const requireFn = /** @type {(specifier: string) => unknown} */ (activeWindowRequire);
    return requireFn(specifier);
  }
  throw new Error(`CommonJS loader unavailable for ${specifier}`);
};
/** @type {ObsidianApiLike} */
const obsidianApi = /** @type {ObsidianApiLike} */ (loadCommonJsDependency('obsidian'));
const { Plugin, MarkdownView, ItemView, Notice, Platform } = obsidianApi;
const { PluginSettingTab, Setting } = obsidianApi;
const LEGACY_SETTING_RENDER_KEY = ['dis', 'play'].join('');
import { createRenderPipelines } from './services/render-pipeline.js';
import { buildRenderRuntime } from './services/dependency-loader.js';
import { resolveMarkdownSource } from './services/markdown-source.js';
import { normalizeVaultPath, isAbsolutePathLike } from './services/path-utils.js';
import { renderObsidianTripletMarkdown } from './services/obsidian-triplet-renderer.js';
import { canUseNativePreviewFastPath, renderNativeMarkdown } from './services/native-renderer.js';
import { convertRenderedMermaidDiagramsToImages } from './services/rendered-mermaid.js';
import {
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
} from './services/ai-layout.js';
import { createWechatSyncService } from './services/wechat-sync.js';
import {
  createWechatSyncBridgeService,
  isUnsupportedBridgeMethodError as isWechatSyncUnsupportedMethodError,
} from './services/wechatsync-bridge.js';
import {
  getMultiPlatformResultSummary,
  getWechatSyncResultError,
  getWechatSyncResultPlatformId,
  getWechatSyncResultUrl,
  normalizeWechatsyncPlatform,
  sortWechatsyncPlatformItemsForDisplay,
} from './services/wechatsync-results.js';
import { resolveSyncAccount, toSyncFriendlyMessage } from './services/sync-context.js';
import {
  createEmptyDraftCache,
  normalizeDraftCache,
  getDraftAssociation,
  setDraftAssociation,
  clearDraftAssociation,
} from './services/wechat-draft-cache.js';
import { processAllImages as processAllImagesService, processMathFormulas as processMathFormulasService } from './services/wechat-media.js';
import { cleanHtmlForDraft as cleanHtmlForDraftService } from './services/wechat-html-cleaner.js';
import { rasterizeSvgToPngBlob } from './services/svg-rasterizer.js';
import { createObsidianFetchAdapter } from './services/obsidian-fetch-adapter.js';
import { stripMarkdownFrontmatter } from './services/markdown-utils.js';
import { mapAppUrlImagesToAssetUrls } from './services/article-image-assets.js';
import {
  createHtmlContainer,
  getActiveDocument,
  getActiveWindowValue,
  htmlToText,
  setElementHtml,
} from './services/dom-utils.js';

function getActiveDocumentCompat() {
  return getActiveDocument();
}

/**
 * @returns {SVGElement}
 */
function createFallbackSvgElement() {
  const activeDocument = getActiveDocumentCompat();
  if (!activeDocument) {
    throw new Error('Active document unavailable for SVG fallback');
  }
  return activeDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

/**
 * @param {WorkspaceLike | null | undefined} workspace
 * @param {LeafLike | unknown} leaf
 * @returns {Promise<void>}
 */
function revealLeafCompat(workspace, leaf) {
  if (!workspace || !leaf) return Promise.resolve();
  const revealLeaf = workspace.revealLeaf;
  if (typeof revealLeaf === 'function') {
    return Promise.resolve(revealLeaf.call(workspace, leaf)).then(() => {});
  }
  if (typeof workspace.setActiveLeaf === 'function') {
    workspace.setActiveLeaf(leaf, { focus: true });
    return Promise.resolve();
  }
  const leafLike = /** @type {LeafLike} */ (leaf);
  if (typeof leafLike.open === 'function') {
    leafLike.open();
  }
  return Promise.resolve();
}

/**
 * @param {PluginWithSettingsLike | null | undefined} plugin
 * @returns {Record<string, unknown>}
 */
function getPluginSettings(plugin) {
  if (!plugin || typeof plugin !== 'object') return {};
  return plugin.settings || {};
}

/**
 * @param {PluginWithSettingsLike | null | undefined} plugin
 * @param {Record<string, unknown>} settings
 * @returns {Record<string, unknown>}
 */
function setPluginSettings(plugin, settings) {
  if (!plugin || typeof plugin !== 'object') return settings;
  plugin.settings = settings;
  return settings;
}

/**
 * @param {ButtonComponentLike} button
 * @returns {ButtonComponentLike}
 */
function setDestructiveButtonCompat(button) {
  if (!button) return button;
  const setDestructive = button.setDestructive;
  if (typeof setDestructive === 'function') {
    setDestructive.call(button);
    return button;
  }
  const setWarning = button.setWarning;
  if (typeof setWarning === 'function') {
    setWarning.call(button);
    return button;
  }
  return button;
}

/**
 * @param {SettingTabCompatLike | null | undefined} tab
 * @returns {boolean}
 */
function refreshSettingTabCompat(tab) {
  if (!tab || typeof tab !== 'object') return false;
  if (typeof tab.renderSettingsContent === 'function') {
    tab.renderSettingsContent();
    return true;
  }
  const legacyRender = tab[LEGACY_SETTING_RENDER_KEY];
  if (typeof legacyRender !== 'function') return false;
  legacyRender.call(tab);
  return true;
}

/**
 * @param {unknown} error
 * @returns {ReadableErrorLike}
 */
function toReadableError(error) {
  if (error instanceof Error) return /** @type {ReadableErrorLike} */ (error);
  if (error && typeof error === 'object') {
    const record = /** @type {{ message?: unknown, isFatal?: unknown, isProxyAuth?: unknown }} */ (error);
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      isFatal: record.isFatal === true,
      isProxyAuth: record.isProxyAuth === true,
    };
  }
  return { message: String(error || '') };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * @param {unknown} value
 * @returns {AiLayoutStateLike | null}
 */
function toAiLayoutState(value) {
  return isRecord(value) ? /** @type {AiLayoutStateLike} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {AiLayoutJsonLike | null}
 */
function toAiLayoutJson(value) {
  return isRecord(value) ? /** @type {AiLayoutJsonLike} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {AiLayoutBlockLike}
 */
function toAiLayoutBlock(value) {
  return isRecord(value) ? /** @type {AiLayoutBlockLike} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {AiLayoutGenerationMetaLike | null}
 */
function toAiLayoutGenerationMeta(value) {
  return isRecord(value) ? /** @type {AiLayoutGenerationMetaLike} */ (value) : null;
}

/**
 * @param {unknown} value
 * @returns {AiLayoutSelectionLike}
 */
function toAiLayoutSelection(value) {
  return isRecord(value) ? /** @type {AiLayoutSelectionLike} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {Record<string, AiLayoutStateLike>}
 */
function toAiLayoutFamilyStates(value) {
  if (!isRecord(value)) return {};
  return /** @type {Record<string, AiLayoutStateLike>} */ (value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toOptionalText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * @param {unknown} value
 * @returns {HTMLImageElement[]}
 */
function toImageElements(value) {
  if (!value || typeof value !== 'object' || typeof value[Symbol.iterator] !== 'function') return [];
  /** @type {HTMLImageElement[]} */
  const images = [];
  for (const item of value) {
    if (item instanceof HTMLImageElement) images.push(item);
  }
  return images;
}

/**
 * @param {unknown} element
 * @param {string} className
 */
function removeElementClass(element, className) {
  if (element instanceof HTMLElement) element.classList.remove(className);
}

/**
 * @param {unknown} value
 * @returns {number | undefined}
 */
function toOptionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function parseJsonRecord(value) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return toRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * @param {unknown} response
 * @returns {RequestUrlResponseLike}
 */
function normalizeRequestUrlResponse(response) {
  const record = toRecord(response);
  const status = toOptionalNumber(record.status) ?? 200;
  const headers = /** @type {Record<string, string>} */ (toRecord(record.headers));
  return {
    status,
    json: record.json,
    text: toOptionalText(record.text),
    arrayBuffer: typeof record.arrayBuffer === 'function' ? /** @type {() => Promise<ArrayBuffer>} */ (record.arrayBuffer.bind(response)) : undefined,
    headers,
  };
}

/**
 * @param {RequestUrlResponseLike} response
 * @returns {Record<string, unknown>}
 */
function getResponseJsonRecord(response) {
  return toRecord(response.json);
}

/**
 * @param {RequestUrlResponseLike} response
 * @returns {string}
 */
function getProxyErrorMessage(response) {
  const body = isRecord(response.json) ? response.json : parseJsonRecord(response.text);
  const bodyError = body.error;
  if (typeof bodyError === 'string' && bodyError) return bodyError;
  return response.text || `Request failed, status ${response.status}`;
}

/**
 * @param {string} message
 * @param {boolean} isAuthFailure
 * @returns {Error & { isProxyAuth?: boolean, isFatal?: boolean }}
 */
function createProxyError(message, isAuthFailure) {
  const error = /** @type {Error & { isProxyAuth?: boolean, isFatal?: boolean }} */ (new Error(message));
  if (isAuthFailure) {
    error.isProxyAuth = true;
    error.isFatal = true;
  }
  return error;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
function formatWechatApiError(data) {
  const errmsg = typeof data.errmsg === 'string' ? data.errmsg : JSON.stringify(data);
  const errcode = data.errcode ?? 'N/A';
  return `${errmsg} (${errcode})`;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {boolean}
 */
function hasWechatUploadResult(data) {
  return typeof data.media_id === 'string' || typeof data.url === 'string';
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function readBlobAsBase64Payload(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file data'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const source = String(dataUrl || '');
  const match = source.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/i);
  if (!match) {
    throw new Error('无效的 data URL 图片来源');
  }
  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = !!match[2];
  const payload = match[3] || '';
  let binary;
  if (isBase64) {
    binary = atob(payload);
  } else {
    binary = decodeURIComponent(payload);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function bufferFromBinary(binary) {
  if (binary instanceof ArrayBuffer) return binary;
  if (ArrayBuffer.isView(binary)) {
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  }
  if (Array.isArray(binary)) {
    return new Uint8Array(binary).buffer;
  }
  return new ArrayBuffer(0);
}

function inferLocalImageMimeType(filename) {
  const ext = String(filename || '').split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function safeDecodeUriText(value) {
  const text = String(value || '').trim();
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

function getFileUrlLocalPath(src) {
  try {
    const url = new URL(String(src || '').trim());
    if (url.protocol !== 'file:') return '';
    if (url.hostname && url.hostname !== 'localhost') return '';
    const pathname = decodeURIComponent(url.pathname || '');
    return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname;
  } catch {
    return '';
  }
}

function getVaultAdapterBasePath(app) {
  const adapter = app?.vault?.adapter;
  if (!adapter || typeof adapter !== 'object') return '';
  const basePath = adapter['basePath'];
  return typeof basePath === 'string' ? basePath : '';
}

function normalizeAbsoluteLocalPath(value) {
  let pathValue = String(value || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const hasDrivePrefix = /^[a-zA-Z]:\//.test(pathValue);
  if (!hasDrivePrefix) {
    pathValue = pathValue.replace(/\/+/g, '/');
  }
  return pathValue.replace(/\/+$/, '');
}

function getVaultRelativePathFromLocalPath(app, localPath) {
  const basePath = getVaultAdapterBasePath(app);
  if (!basePath || !localPath) return '';
  const normalizedBase = normalizeAbsoluteLocalPath(basePath);
  const normalizedLocal = normalizeAbsoluteLocalPath(localPath);
  if (!normalizedBase || !normalizedLocal) return '';
  if (normalizedLocal === normalizedBase) return '';
  if (!normalizedLocal.startsWith(`${normalizedBase}/`)) return '';
  return normalizeVaultPath(normalizedLocal.slice(normalizedBase.length + 1));
}

function getVaultDirnameFromPath(filePath) {
  const normalized = normalizeVaultPath(String(filePath || ''));
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

// 视图类型标识
const APPLE_STYLE_VIEW = 'apple-style-converter';
const APPLE_STYLE_VIEW_TITLE = 'Obsidian 发布助手';
const PLACEHOLDER_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAWeElEQVRoBZ2aW4xe1XXHz/073zfgsQ0YDCYXQEi9kAQi2qCImxKoiAIUpU1URVSizUsf2ry0apD6UKkvlapQNVWfWqmR+kJLBAkNVEpSBVSkQCmQkmAgAhuMbWzj23hmvsu59vdfa59vxjQXKXvmO2efvdflv9Ze+3pOfG59fVQUWZbNptNRWUZRtJjPx5NJU9dN05CZz2ZxkoxGo+nmZjEqkiSdzabj8aTvu/l8Ppms1HXdNg0ZyuMkHo3K6XSa5zkyp9NNo+yNcoJAxCITFX0UlWWJUsiyPIelHI1QhDoI2ratFovJygrXtuvG4/FsNku2YIzSNNncBMY4S5Mkivqu62Due8RGZHgkBxqVk6JoIIigwQYYLCNKY4nbrjXCwEIhVVA6Abot07vwSKSuNEYROQikuw8ECA+UwIjPk+k40Q9yYZhM8GW0WCywJnhoPOYRDfgSp+ZFkaQJDsBheL2qRFnh9a7Fu4vFHAVFMRKlvE77OGW/JbNtYIEShLQkBFma5llOBhWwz0172zZVVUl4VWEtGW/8oigQzjVNU1oswIBlMqHxY9oO62kRHmhLfIAZeZG3bYdjaFxaPUnjIs+avk7iJOqhbLI0owm6tk2zDGVksxSWBohpmoklgTYhtHjEsU3bEimiRGaWt10T9YESMnzZtFBypyXrPM27qKsXHWYiATcLRl3TFggBJ5SYTQnaM8KDfxohjmJIQQCd3ylKM9oyPncifu9AfPgn0eapaLHRV4uob0Xb0c6EgrV8mvQ8OrfFIyqilsAkRpwS28n2cZrCq8ihqusT6BBCJKIrL/psHO26LLrkQ/Geq/pLrhSspg74EB4QIgjp0hYpvGgyfEYvpMmQS9vR+YgH+vaBH83/98n84IvR5tm+bcWCdeIjOVqTYs+U60HokC5KFYt64FCVyix5tT/LMAplqhkp3snO6EMf6z/xuezKX1F/LcsJUAlLYh7A9HIys+ks3tjYUORm2Xw+I5QRQ8cfT8q66p7+l+6Fx+N6FqUFHVpal+r0YEkwpJcqd4n5yC1QMYAGzEZEgXFQY+XuDhFaCjTyAm3SVFFRxr/x29Ftv09QLeixuJUBjSshSqcCcIxN7hjn1ZVWW8T//lC0/+muKAU9QDPd6HF1jmObAWYGETWAcLMCdQBoTIb8/PLBC1ZlPggGdm1Uz/tfuzW9+0/jfIRZFpFWaTBi2YRwddycvqXumCb5E1/rhH5MMIhsaFiCXi0sMBb6qtKz06g4VFNgpcS4UVuNeDU6i5z8UGPZvvOibeUmTt7Mx/GPnmqf/DsK6OuMNIwKEaMCgLuuJbw2afCSuN9U3Jdl/oNH56/8J20XuqQEeTKVXFxlKNPTUrmZ4mY4SodqNNBLgDPLjpC3XLhI0vKfnBHRKsU4+uF36+cf7yYTG1tjpktNrABObFjt6RZMw13fnDxSP/eNOC3U/c0C0xmE6rZMA2xTsgVUAHliSFtS8mSwlpRBzhaFOATd6SwHsZhMlsCkefTMw+3Jo/WoJJJ6BlMAEzgaxURLcMUxQ/aPvx+tvRfFGumkhiYPMtTGAwLR279nVKyuEwoHLkicxzKGxymVpcZUWHGgs3KrG0qN3tQyaURrJ/qXv9cyBzgz0CHWFEuGGXExn/VN9ubzSUAvHRIgWCZQF/Eau5Wp3nukaZI8JZEHY8TAn5qDO7TKGIuXmBVW6FVwmxRqz0uGgUZ447/j6eaCmc+m5xn9IWM0ZUpjbGJmPn2sfu+dlnnXoNODBVdJV28oIfMS7uYC3aFQuap0p1zJObhZ17Ui4xbZtuSPkuHMVmWItxFJWpJGp4701UZZjGzRoQmhzob5n4VRS/DMNiJWd+gxgX5VdgDuoKXMzDPYhsqUmwnGJH+7q1UWjHJDBr9Qva2jyAz76aIkqT5+hycRz9a7M8faHXuipI1ZyCCK6aCCgPVJ01aztahl3g5tLYfIERoLTSoXN8SfVOd6ws2pjIgLq4OBeskIoVdL8FArMWG8lu1bCQtVJQ7nYgXTRGunKtYerI4WVcWiKFthzV1VhJAy8wWrLS1Ulq6RF9GEM8ICwWF7oVFBoBU1CSr7WfCIZVuJqsQqGonkRhsyMriTRaq/IMmCUKFn5GaVM6kNWzYtWlOsrExms0XGwoHxhwG16RZNJaz2Q4QbYaqk3v6kV8lL7col3HUTu6kfiOSBIW8587I8ZFzBGIc6MOItc1pQYwq8gJLFvNYiM8uIHZblGbMvN+0nWPM2rA/FpTB1btPiPnOFQaPXgsieVWXecjbZ4BUqNmFOaRagQpUkAzU0tvcqFyhZVMIpKvtRxD8tQGRCBGAmgTRPNQrRHN4iccJOT+KdV5yuxHP26KoHBHKVFesiYlZgC4FQ++EFVQYcYjFap9TVyUDWyWVaMr6PxhrKNTgv6NOkhMP2VYTQnG0ru9KUmbluZgGMaQ1NH7TBIuTWN8wEhxLgq4Y6X9N/8vPl1dcnaWaedTJljcukBZG6qRDQ1ax/4cnq9efxqJpec6u3i9Wb8MH2OKrZLUXsuLRNy7Mis+CRn22vqVhUL0a0gUOUmYMiwwLOQZQAWApmM0R0/b1/PP7EPVqTB3plltDdGhVZ8vJg27W/mX3tDzdOvcsWz1Vaa6gJebQu4ahksIwDnSHvddyAOAYimoFaH6qpJpKMTjfPICz8iz+MrmRE0PVt1V364fjGzxSqVBqI/em8Eq/yikBdriS7LmeX6IwIFQ1NytaPfQw+1SOoFEIZsrUWGpVsaxRCtggtq2ZqWl2EYEkKbrKMHrYnL4TBNHFp2m6yg8iR4l8q+XRjSNXu50sRKGuZPib6bekzYh2N9zMWFVjIaoIdJC0BpRqB/2ULB1Hh2WosP+iwOxHYHT1YrZ/uLtzNgPZLmKDNrc9Cg1OEwTR5d0KqsCV0dvzVtELedpxHsLpj981qlK2XjSoQyq8hSdzWox7UkGpVa2WodEdwdPp4/fDfnD532o6SCNVtSSJ+URpixOPF1AqCIoek1bCEKPS5YSzIqVIIYQq7grqdsn/DREELiQzWiTMUaYhQmctaNjW1kGRF9Px3Nt54ef2Ka3POvmQYSZNrf98fXfaBazlWGgT/tDt6cQzbLjJypOwPysXHz4KI6I+jkgMHkHP+kPFjRmA+LsoxR0yCBrs4gxK/I9CfdbchVbIl15V4bVyM0jMn6hNHpmz2+og+JlD3P7h339W/AL0kWaJpbZgxBBq2l3qVxUAOIHAyBylCzgmVTA2QBlIRCq0DVN6leak9hUZQFT8zSr2Mg6mUPXbCJNCnBCiR9sWv7Ln9d3cv7Zfcn5Fkq6ZRtEsg8d/xpxzqTbeiw1HZYGr4OE3hcCIvslHTahSydhSDfoJGEnxNLcjyjPnFHo3IyKy/0Y1SizIO2DoWY7/34O5bf2fV8ATKn3ez4y3Fj2mRVKf2u65CUjdVHI05xdQx43icsAilSodC2QR6dU4z06C7ajXIkJMnoDeZKrN/mWiOwlcpNkRdxoL3i1+55Gehh87c6gC3rkhEOSlo4ISRosHxyvY9sy8dmkMhO7uuMqYwGFjdcSjpsHhkBlETSpS1ndseHhFuOVMj3EEB44PZaU3whT/befPncM1AGjh0o2/Opy2NVYzstGyosu4uH4tLd9OzFKFHPegYnB1yaoekHK7TgyFmdcpkYMzGZuOMnK0iF6kHtY/J9UKrZmPUs+O+cIcGciqrRf/Jeyc/B/250/U/PHjw3OnmfY1gzkYADlEQmQppRwtaNbLYKGQGyALmLobUzF8iEELEUhxvitSXjxrJ5C+ZIBHBUaihSEme1hZpPIlvu+vCPZdnLz07fem5KfPMTfeOVf3/Er4H/Vf/5M23XptmrNven6SbFHiHetmCLjAYlCLjzEdn9yDnbDTjQBc7RuyT27n5VwYjeZDjXKFAMq1xXLWhTz712R17r8xxz6VXcFTWjVb6C3YNyp3Oro7+oS8feOW5jYv3Mpv+9GSekpM0lkuM4FBoqPTM4ZzNAwXIszxTFFIsyNZCIlZP8p/yxmwEXmeSKOTgvpzEn75b6Hnc3Oxeem6DgXM27dbesz6EzCGBfu0Uvj+4//npeKXgCMrUDtV2BwMhGGbcLRze+AYD6YYnsFkIJuNyDCcrpCwZybsKZFsrGIvkmEnGSD48NE3HvHfH3augh2E26/7jsdOHDs45+bjpltXqOO+gFIjDf3z2ZP23X3779Rdmk0nBAMV0cR72AVEwZCv+pZDCAMIGSc4fgFRXFauHtmmzTb0KyMpyXLMaBbtBhAufic3bR0LI2U0bl348Se68Z3XvPqGfz7onHjv1zsE5o8rNn975qx9ZOXOofePp9tJfj/MVjjn6n7w0feTvj7/9Gkf7HHYz2qODActkbru0tc9iGjqlTfGibqtezR9l6gz9QqvRlSK8dBxxPEEA0BfZDWVR3C4FunyqKPE8NxfF8u/2z6xefmWBJnz/xGMn3zk445j11jt2Xnf9SlV3o3Fy+NX6H796aE6ctdGZ4y2Ix2P6CbuVJEr62Vr31v7Frj0cjEs2zjpzojn8ZpXYatygo9l9aKiJLUoNh97tESitXn8RLsPxOq+oEjoWM6gwi8LizdCb+bIEmdT2eR5fvIclSUy4P/HoyUOgL6Lbf2vXdTdcUDd9liXTWfvE40cPHZifOtKePdHxAoXJPo7ocKx8OdLUsvfhh04ceIVTTSWWT//8V8fW3mNg1UmLOU0YLAmQ5UOGV2ogGY7Xu4xtQaFT9TGrUVEKZhgove0oUTLrqeJF0+a0fvq7Zz941ejlH24cfcfQ33nRR2640NDHG+vNtx458u7h+bjUmwcdIPAP9FjoVcK6NeuPvV399ZfevvqjnBPGB19ZnDnelWWxNeqgjhjetqoUNMVwX9WEEBGUcbzOUoLo18aM+ZiyKJqat4VWYxg3qYNXAxWL7clKsmdvduTQ4vX9m6/t30BFXsS33bH7OtDXvEuM19ebbz5y5Ojh2aggIEm8v6PtlSF0JNVFRrQ8R1LNy88w87BFT0Yl0SWATuGelFZQOAw9aIkQOnFdl2Mdr4vNQQ6cagB00mAe8pJhRpTj5K77dl3xgeKFZ9ef+s5ZXnASbzfdsuujHwd9l+YJ6B/7N/mexbr8DXpJ0r95T1dpkTyq0iyNktIKROarQKEEsF3cVu93yoNIqAbAyuh4fa5A1LFKO5evnUt3RlPxuCxGm9VdKR1XEGyAgoKOe821vCfH98n6ufrRfz367uEFL6QtWizcGW2C41EmrJZkkjoDKz+6tXo2b41Ebz4zjcJGL7S8IXCryFoI8WrdJjI/XmePo+P18SRK1jWVeB+QOrdXPqDjnThWPf29tbJMXnxuXW+vo4g3ma++sn7jTatra/W3v3n02JEFoQkOosXdD4238PKOT8ylViMbhFROUTEZK3D3QbL0KPmQGEKYB7pqoW8uKk4X6QBUsTZinTe43IADHmnej4yZgPmfH5xDOE0vTfg2iZ995sz+H5+bTmtGJEWOOitV1lnN5eY5wTQOcWlINIESHyTZMxchNgNlA6bpJ2L4JUjVZlTMOw6Qa3yg+6KSpmg71tVOAA1zitLAZQ6iy+YcA0Me5jhqya+daeqKcLKYAfoWbgHwRI7+ZwOhQ/AqM0RZzwjkkp4ylULuV0NPlhd51NCVQa5PJDgbpYoQytNJNoLFhFgImq0mVBdJCrKcRp0dHfapA291wihJmdlA021xmNvkRRNk9mu3rMaQDxBOhgNSV6NC4xgeFRkqEioWvyMY2dCwfCb4OaReELA6Xm8XLG9AhBaZrh8M9jfYpaWWalRnGaknbIyQwlAuTkvgMqV6MPDLYgFiYBB4kp5EiWbL6nEoBYATqUATSkEL8IFTzkdH+sJAs7Edr7Oh2bGbAk22HplyC2AHdskkL4tCEgFJhfz07yid5Tzj3WiIl8zGuWWVi9XMJQp+Fqhe6oisMIsu2Km2ZQvA9x0cM1oI8ZUW3x3kYz4TKVfcVfBApl8IXBNq8qzKc14ojaB3vX6DJqx9Ra0aSUOUSRMUL4YvaKFAZdSr1jnIi96rrBeNV+K9H5y0jT5QYdjkw5+E4yGUMx/zvvWiy/IrrmGvKR6TJEWSJX0S72ErFaGpB8c7TbiyGhe9t50y9hTGBTGbNBEv0YnIkxfaaB4IXBrx1tTt3qvSySr4/DUrx+uZPjbCDSzuGLn53umG20u+zxE/Npgm95l5wnQbGh69XIY5IGkWIqMUbBkcylygu9NhqRJMIjv/H9WqC+JllAlRYdNE19/OmbTODhT5Ov3T8brOzKq6YjLmM5yP35Fdso9vshCrUHOUZsywywmgBC1gRYwp5dHUL6vQrdDyWpU6i3Dzz5OxwaW751XojrOCUIiprFYu3pfceCf7IS3j7XidbXDDxx4b6GA1yuIujbPL9pV3PcB7ZNuYwT6oR0NQ6Yq3ru5yKbYyg2WMZo9M4l91Fu5OJLjkbMUlc6i19iBvilSk9gkeUYb99z1fumDvPj7G0jdy5ahkHc3gGXMqKhEMYGwUCDcNZt0//eWpp75RjSaMBJoXrYfaxXGaX/2CbqFl3DEYAgWh8ipe0oRSbiqUjnAXoSVnkS4nMvahajHrPvWFyQN/sarZ3yIHAeRwD68ktKzhJFCrCfMD66T7H9xx8315NSfsPCiARCUp3JS1YQY/KcBCjcjIW0hAaz60SmsGKp3Au2WoMEmSJ9mKH+Wk1R5Z6Czm/S33je7/81UOs1DHmI9ziBAAo5wV/DqIWUr4/gBjmJXZvDKwfvvra09+fXH2ZMuiX6+uthpCTjaXuYvCdXsbDRVDc9izJj34nM4nDXO4VZoJ7n+hZ1zhk7N+9aL4sw+s3P0HOzmI5hSLjqrPhPwTTPu+M2ZPQMIgTcb0czulo4tgKBvFA69u/te36he/Pzt+pK75WBH/0Mo+URkQuVuNrrBxeEMumOC0gh2oQvnyNnCZZJVKfD6KL92Xf+yW/NOfv/DKa0bzWaN9jPaDfFlWsIOncdlIMg/EYOVwEANoBDaaCFDGPySKkz5uizxdX2vZcb/7Vn32ZDdb7xdzvrLQeyS1I5/kqjFo2ZTXPihnG0O57WUso2FaH2YoZBUWfZolOnlnCcyHpfrelzVlzHjCmE5Tj8bx7j3Z3g8X+67OVzjYbvnkN7bvT1kv640D8JCP41hHADheP7dejJgQ8hBCLOw4tWOSo830RTQvk2e0hnY8zYzPbdFrGT5Y6Ot2wRKQfQEfsrIsbHvtjZKo5KSe72BxBfvsPD2PsukaZv8u0puUJB433TTjKCLKjVKvSdlX5ekY4NPZYlzqC0vg8i6Dw3RcAIxNe6WEv/wNTYxNNAJNw0jKwo4WgEindrz+TlP6A1920WWYKLTxp7k6dt98HeVfHBcQcLyBaEpgxEmohICFCpK3ZBYjjl8ZMEiw0OsIOtSxK+dwCmcBkfGQFmJeggCBhDQsBIyELxC+BYNjXWLGYCz02SW+tBgdlmKK4tDTyHhSx7NoXZaoYKBcForMKiTQsl61pLSycKHKy43DCodnr1oSLykl0wYC3bUs77WhIY+5da3Pb0h82M0jPMQlX5biSOjo+LifcMWFZLjiGCjpSVBCAyWNQ2wapU54aBkot8tEp85zeD1KiHTs4DSV0rd5QwSlXpimGTJpKIRTAiWqYeHseRsMPvQTDJDD8H+SJXQfoCbppAAAAABJRU5ErkJggg==';
const GITHUB_REPOSITORY_URL = 'https://github.com/DavidLam-oss/obsidian-wechat-converter';
const OBSIDIAN_PUBLISHER_PRO_URL = 'https://xiaoweibox.top/obsidian-publisher/pro/';
const OBSIDIAN_PUBLISHER_GUIDE_URL = 'https://xiaoweibox.top/obsidian-publisher/guide/';
const OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL = `${OBSIDIAN_PUBLISHER_GUIDE_URL}?from=obsidian-plugin#install-extension`;
const OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL = `${OBSIDIAN_PUBLISHER_GUIDE_URL}?from=obsidian-plugin#bridge`;
const MULTI_PLATFORM_TAB_LABEL = '其他平台（小红书/知乎/抖音等）';

// Pure data helpers extracted to services/wechatsync-settings.js so the
// views/ layer can normalize / read settings without depending on input.js.
import {
  createDefaultMultiPlatformSyncSettings,
  parseWechatsyncPlatformIds,
  hasWechatSyncCapability,
  normalizeMultiPlatformSyncSettings,
  getAvailableWechatsyncPlatforms,
} from './services/wechatsync-settings.js';

import {
  formatWechatsyncCheckedAt,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
} from './views/connection-status-bar.js';

import { renderMultiPlatformSettingsTab } from './views/settings/multi-platform-tab.js';
import { showMultiPlatformPublishModal } from './views/publish-modal/multi-platform.js';
import { renderFeishuSettingsTab } from './views/settings/feishu-tab.js';
import { renderFeishuPublishTab } from './views/publish-modal/feishu.js';
import {
  createDefaultFeishuSyncSettings,
  normalizeFeishuSyncSettings,
  updateFeishuHistoryPath,
} from './services/feishu-settings.js';

function getObsidianModalClass() {
  return obsidianApi.Modal;
}

/**
 * @param {AppLike} app
 * @returns {ModalLike}
 */
function createObsidianModal(app) {
  const ModalClass = getObsidianModalClass();
  if (typeof ModalClass !== 'function') {
    throw new Error('当前 Obsidian 版本不支持 Modal');
  }
  return new ModalClass(app);
}

function getObsidianSetIcon() {
  return obsidianApi.setIcon;
}

function getObsidianRequestUrl() {
  return obsidianApi.requestUrl;
}

function getObsidianRequest() {
  return obsidianApi.request;
}

/**
 * @returns {AppleThemeApiLike}
 */
function getAppleThemeApi() {
  const api = getActiveWindowValue('AppleTheme');
  return /** @type {AppleThemeApiLike} */ (api);
}

/**
 * @param {Event} event
 * @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null}
 */
function getValueElementFromEvent(event) {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
  ) {
    return target;
  }
  return null;
}

/**
 * @param {Event} event
 * @param {string} [fallback]
 * @returns {string}
 */
function getEventTargetValue(event, fallback = '') {
  return getValueElementFromEvent(event)?.value ?? fallback;
}

/** @type {Record<string, ImageSwipeCopyLike>} */
const IMAGE_SWIPE_COMMAND_COPY = {
  'image-swipe': {
    commandName: '插入横滑图片块',
    zhTitle: '左右滑动查看图片',
    enTitle: 'Swipe to view images',
    zhPlaceholder: ['![[图片1.png]]', '![[图片2.png]]'],
    enPlaceholder: ['![[image-1.png]]', '![[image-2.png]]'],
    zhNotice: '已插入图片块',
    enNotice: 'Image block inserted',
  },
  'image-sensitive': {
    commandName: '插入横滑敏感图片块',
    zhTitle: '此类图片可能引发不适，向左滑动查看',
    enTitle: 'Sensitive images. Swipe to view.',
    zhPlaceholder: ['![[图片1.png]]', '![[图片2.png]]'],
    enPlaceholder: ['![[image-1.png]]', '![[image-2.png]]'],
    zhNotice: '已插入敏感图片块',
    enNotice: 'Sensitive image block inserted',
  },
};

/**
 * @param {AppLike | null} [app=null]
 * @returns {string}
 */
function getObsidianLocale(app = null) {
  const candidates = [
    app?.vault?.getConfig?.('language'),
    app?.vault?.getConfig?.('locale'),
    typeof navigator !== 'undefined' ? navigator.language : '',
  ];

  return String(candidates.find((value) => typeof value === 'string' && value.trim()) || '').trim().toLowerCase();
}

/**
 * @param {AppLike | null} [app=null]
 * @returns {boolean}
 */
function isChineseObsidianLocale(app = null) {
  const locale = getObsidianLocale(app);
  return !locale || /^zh(?:-|_|$)/i.test(locale);
}

/**
 * @param {AppLike | null} [app=null]
 * @param {string} [type='image-swipe']
 * @returns {{ name: string, title: string, placeholder: string[], notice: string }}
 */
function getImageSwipeCommandCopy(app = null, type = 'image-swipe') {
  const copy = IMAGE_SWIPE_COMMAND_COPY[type] || IMAGE_SWIPE_COMMAND_COPY['image-swipe'];
  const useChinese = isChineseObsidianLocale(app);
  return {
    name: copy.commandName,
    title: useChinese ? copy.zhTitle : copy.enTitle,
    placeholder: useChinese ? copy.zhPlaceholder : copy.enPlaceholder,
    notice: useChinese ? copy.zhNotice : copy.enNotice,
  };
}

/**
 * @param {unknown} text
 * @returns {string}
 */
function quoteLinesForImageSwipeCallout(text) {
  const lines = String(text || '').split('\n');
  return lines.map((line) => (line ? `> ${line}` : '>')).join('\n');
}

/**
 * @param {string} [type]
 * @param {string} [selectedText]
 * @param {AppLike | null} [app]
 * @returns {string}
 */
function createImageSwipeCalloutMarkdown(type = 'image-swipe', selectedText = '', app = null) {
  const copy = getImageSwipeCommandCopy(app, type);
  const content = String(selectedText || '').trim()
    ? String(selectedText || '').replace(/\s+$/g, '')
    : copy.placeholder.join('\n');
  return `> [!${type}] ${copy.title}\n${quoteLinesForImageSwipeCallout(content)}`;
}

// 默认设置
const DEFAULT_SETTINGS = {
  theme: 'github',
  themeColor: 'blue',
  customColor: '#0366d6',
  quoteCalloutStyleMode: 'theme',
  fontFamily: 'sans-serif',
  fontSize: 3,
  macCodeBlock: true,
  codeLineNumber: true,
  avatarUrl: '',
  avatarBase64: '',  // Base64 编码的本地头像，优先级高于 avatarUrl
  enableWatermark: false,
  showImageCaption: true,  // 关闭水印时是否显示图片说明文字
  normalizeChinesePunctuation: true, // 默认开启：仅在渲染结果中将英文标点标准化为中文标点
  // 多账号支持
  wechatAccounts: [],  // [{ id, name, appId, appSecret }]
  defaultAccountId: '',
  // 代理设置
  proxyUrl: '',  // Cloudflare Worker 等代理地址
  clientId: '',  // 自动生成的本地设备唯一ID
  draftCache: createEmptyDraftCache(),
  // 预览设置
  usePhoneFrame: true, // 是否使用手机框预览
  // 渲染模式已切换为 native-only
  // 排版设置
  sidePadding: 16, // 页面两侧留白 (px)
  coloredHeader: false, // 标题是否使用主题色
  // 同步后清理资源（默认关闭，避免破坏性行为）
  cleanupAfterSync: false,
  cleanupUseSystemTrash: true,
  cleanupDirTemplate: '', // 发送成功后要清理的目录（支持 {{note}}）
  multiPlatformSync: createDefaultMultiPlatformSyncSettings(),
  feishuSync: createDefaultFeishuSyncSettings(),
  // 旧字段保留用于迁移检测
  wechatAppId: '',
  wechatAppSecret: '',
  ai: createDefaultAiSettings(),
};

// 账号上限
const MAX_ACCOUNTS = 5;
const AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS = 700;
const DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS = Object.freeze({
  contentSourceUrl: '',
  openComment: true,
  onlyFansCanComment: false,
});

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
 * @param {AppLike | null | undefined} app
 * @returns {boolean}
 */
function isMobileClient(app) {
  if (typeof Platform?.isMobile === 'boolean') {
    return Platform.isMobile;
  }
  return !!app?.isMobile;
}

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

// 辅助函数：等待指定毫秒数
/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));

// 辅助函数：并发控制 (p-limit 简化版)
/**
 * @template T
 * @template R
 * @param {T[]} array
 * @param {(item: T) => Promise<R> | R} mapper
 * @param {number} [concurrency]
 * @returns {Promise<R[]>}
 */
async function pMap(array, mapper, concurrency = 3) {
  /** @type {Promise<R>[]} */
  const results = [];
  /** @type {Promise<void>[]} */
  const executing = [];
  let isFailed = false;
  for (const item of array) {
    if (isFailed) break;
    const p = Promise.resolve().then(() => mapper(item));
    results.push(p);
    // Fix: Ensure cleanup happens regardless of success or failure
    // If error occurs, mark as failed to stop scheduling new tasks
    const e = p.catch(() => { isFailed = true; }).then(() => {
      executing.splice(executing.indexOf(e), 1);
    });
    executing.push(e);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/**
 * 🚀 微信公众号 API 对接模块
 */
class WechatAPI {
  /**
   * @param {string} appId
   * @param {string} appSecret
   * @param {string} [proxyUrl]
   * @param {string} [clientId]
   */
  constructor(appId, appSecret, proxyUrl = '', clientId = '') {
    /** @type {string} */
    this.appId = appId;
    /** @type {string} */
    this.appSecret = appSecret;
    /** @type {string} */
    this.proxyUrl = proxyUrl;
    /** @type {string} */
    this.clientId = clientId;
    /** @type {string} */
    this.accessToken = '';
    /** @type {number} */
    this.expireTime = 0;
  }

  /**
   * @template T
   * 通用重试机制 (仅处理网络层面的不稳定性)
   * 不再处理 Token 逻辑，专注于网络波动和配置错误
   * @param {() => Promise<T>} operation
   * @param {number} [maxRetries]
   * @returns {Promise<T>}
   */
  async requestWithRetry(operation, maxRetries = 3) {
    /** @type {() => Promise<unknown>} */
    const operationFn = operation;
    /** @type {unknown} */
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operationFn();
      } catch (error) {
        const readableError = toReadableError(error);
        lastError = error;

        // 0. 通用熔断：如果错误已被标记为致命，直接抛出
        if (readableError.isFatal) throw error;

        // 识别配置错误 (AppID/Secret 错误)，直接失败
        const isConfigError = readableError.message && (
            readableError.message.includes('(40013)') || // invalid appid
            readableError.message.includes('(40125)') || // invalid appsecret
            readableError.message.includes('invalid appid')
        );

        if (isConfigError) {
           console.warn(`[WechatAPI] Configuration error detected, aborting retry: ${readableError.message}`);
           throw error;
        }

        // 熔断机制：识别致命错误 (配额超限/素材满)，立即停止重试并向上抛出
        // 45009: 接口调用频次达到上限 (日限额)
        if (readableError.message && (readableError.message.includes('45009') || readableError.message.includes('reach max api daily quota limit'))) {
            const fatalError = new Error('微信接口今日额度已用完 (45009)，请明天再试或切换账号。');
            fatalError.isFatal = true;
            throw fatalError;
        }

        // 45001: 素材数量达到上限或图片大小超限
        if (readableError.message && (readableError.message.includes('45001') || readableError.message.includes('media size out of limit'))) {
            const fatalError = new Error('微信上传失败 (45001)。可能原因：\n1. 素材库已满 - 请登录微信公众平台 -> 素材管理，删除旧图片释放空间\n2. 图片太大 - 请检查封面或正文图片是否过大');
            fatalError.isFatal = true;
            throw fatalError;
        }

        // 识别 Token 过期错误，直接失败，交由上层 actionWithTokenRetry 处理刷新
        const isTokenError = readableError.message && (
            readableError.message.includes('40001') ||
            readableError.message.includes('42001') ||
            readableError.message.includes('40014')
        );

        if (isTokenError) {
            // console.warn(`[WechatAPI] Token error detected in retry layer, bubbling up: ${error.message}`);
            throw error;
        }

        // 识别业务层明确错误 (已收到微信响应但报错)，直接失败，避免无意义重试
        // 排除 -1 (系统繁忙) 这种情况可以重试
        const isBusinessError = readableError.message && readableError.message.includes('微信API报错') && !readableError.message.includes('(-1)');
        if (isBusinessError) {
             console.warn(`[WechatAPI] Business logic error detected, aborting retry: ${readableError.message}`);
             throw error;
        }

        console.warn(`[WechatAPI] Network request failed (attempt ${i + 1}/${maxRetries}): ${readableError.message}`);

        if (i < maxRetries - 1) {
          await sleep(1000 * (i + 1)); // 线性退避: 1s, 2s, 3s
        }
      }
    }
    throw lastError;
  }

  /**
   * @template T
   * 高阶函数：执行带 Token 生命周期管理的操作
   * 负责：获取 Token -> 执行操作 -> 捕获 Token 过期错误 -> 刷新 Token -> 重试
   * @param {(token: string) => Promise<T>} action
   * @returns {Promise<T>}
   */
  async actionWithTokenRetry(action) {
    /** @type {(token: string) => Promise<unknown>} */
    const actionFn = action;
    let retryCount = 0;
    const maxRetries = 1; // Token 过期只重试一次

    while (true) {
      try {
        const token = await this.getAccessToken();
        return await actionFn(token);
      } catch (error) {
        const readableError = toReadableError(error);
        // 检查是否是 Token 过期 (40001, 42001, 40014)
        const isTokenExpired = readableError.message && (
          readableError.message.includes('40001') ||
          readableError.message.includes('42001') ||
          readableError.message.includes('40014')
        );

        if (isTokenExpired && retryCount < maxRetries) {
          console.warn(`[WechatAPI] Token expired (${readableError.message}), refreshing and retrying...`);
          this.accessToken = ''; // 1. 清除本地缓存
          retryCount++;
          continue; // 2. 重新循环：再次调用 getAccessToken (会触发新请求) -> 执行 action (使用新 Token 拼接 URL)
        }

        throw error; // 其他错误或重试次数耗尽，向上抛出
      }
    }
  }

  /**
   * 验证代理 URL 安全性 (必须使用 HTTPS)
   */
  validateProxyUrl(proxyUrl) {
    const normalizedProxyUrl = String(proxyUrl || '');
    if (normalizedProxyUrl && !normalizedProxyUrl.toLowerCase().startsWith('https://')) {
      const error = new Error('Security Error: Insecure HTTP proxy blocked. Proxy URL must use HTTPS.');
      error.isFatal = true; // 禁止重试
      throw error;
    }
  }

  /**
   * 发送请求（如果配置了代理，通过代理发送）
   * 纯粹的 HTTP 请求封装，不包含重试逻辑
   * @param {string} url
   * @param {RequestUrlOptionsLike} [options]
   * @returns {Promise<Record<string, unknown>>}
   */
  async sendRequest(url, options = {}) {

    if (this.proxyUrl) {
      this.validateProxyUrl(this.proxyUrl);

      // 通过代理发送
      const headers = { 'Content-Type': 'application/json' };
      if (this.clientId) {
        headers['X-Client-Id'] = this.clientId;
      }

      const requestBody = options.body ? parseJsonRecord(options.body) : undefined;
      const proxyResponse = normalizeRequestUrlResponse(await getObsidianRequestUrl()({
        url: this.proxyUrl,
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          url: url,
          method: options.method || 'GET',
          data: requestBody
        }),
        contentType: 'application/json',
        throw: false
      }));

      if (proxyResponse.status < 200 || proxyResponse.status >= 300) {
        throw createProxyError(getProxyErrorMessage(proxyResponse), proxyResponse.status === 403 || proxyResponse.status === 401);
      }

      return /** @type {Record<string, unknown>} */ (getResponseJsonRecord(proxyResponse));
    } else {
      // 直连
      const response = normalizeRequestUrlResponse(await getObsidianRequestUrl()({ url, ...options }));
      return /** @type {Record<string, unknown>} */ (getResponseJsonRecord(response));
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expireTime - 300000) {
      return this.accessToken;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;
    // 网络重试包裹
    const data = /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url)));

    const accessToken = toOptionalText(data.access_token);
    if (accessToken) {
      this.accessToken = accessToken;
      this.expireTime = Date.now() + ((toOptionalNumber(data.expires_in) ?? 7200) * 1000);
      return this.accessToken;
    } else {
      throw new Error(`获取 Token 失败: ${data.errmsg || '未知错误'} (${data.errcode || '??'})`);
    }
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<Record<string, unknown>>}
   */
  async uploadCover(blob) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`;
      return await this.uploadMultipart(url, blob, 'media');
    });
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<Record<string, unknown>>}
   */
  async uploadImage(blob) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${token}`;
      return await this.uploadMultipart(url, blob, 'media');
    });
  }

  /**
   * @param {string} type
   * @param {number} [offset]
   * @param {number} [count]
   * @returns {Promise<WechatMaterialPageLike>}
   */
  async batchGetMaterials(type, offset = 0, count = 20) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${token}`;
      const data = /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ type, offset, count })
      })));
      if (Array.isArray(data.item) || data.item_count !== undefined || data.total_count !== undefined) {
        return /** @type {Record<string, unknown>} */ (data);
      }
      throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
    });
  }

  /**
   * @param {Record<string, unknown>} article
   * @returns {Promise<Record<string, unknown>>}
   */
  async createDraft(article) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;

      // ⚠️ 关键修正: createDraft 非幂等，不使用 requestWithRetry 自动重试网络超时，
      // 避免在"请求成功但响应丢失"的情况下创建重复草稿。
      // 失败后由用户手动点击同步更安全。
      const data = /** @type {Record<string, unknown>} */ (await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ articles: [article] })
      }));

      if (typeof data.media_id === 'string' && data.media_id) {
        return data;
      }
      throw new Error(`创建草稿失败: ${formatWechatApiError(data)}`);
    });
  }

  /**
   * @returns {Promise<Record<string, unknown>>}
   */
  async getDraftCount() {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/count?access_token=${token}`;
      return /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({})
      })));
    });
  }

  /**
   * @param {number} [offset]
   * @param {number} [count]
   * @param {number} [noContent]
   * @returns {Promise<Record<string, unknown>>}
   */
  async batchGetDrafts(offset = 0, count = 20, noContent = 1) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${token}`;
      return /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ offset, count, no_content: noContent })
      })));
    });
  }

  /**
   * @param {string} mediaId
   * @returns {Promise<Record<string, unknown>>}
   */
  async getDraft(mediaId) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${token}`;
      return /** @type {Record<string, unknown>} */ (await this.requestWithRetry(() => this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId })
      })));
    });
  }

  /**
   * @param {string} mediaId
   * @param {number} index
   * @param {Record<string, unknown>} article
   * @returns {Promise<Record<string, unknown>>}
   */
  async updateDraft(mediaId, index, article) {
    return this.actionWithTokenRetry(async (token) => {
      const url = `https://api.weixin.qq.com/cgi-bin/draft/update?access_token=${token}`;
      const data = /** @type {Record<string, unknown>} */ (await this.sendRequest(url, {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId, index, articles: article })
      }));
      if (data.errcode === 0 || data.errmsg === 'ok') {
        return { media_id: mediaId };
      }
      throw new Error(`更新草稿失败: ${formatWechatApiError(data)}`);
    });
  }

  /**
   * @param {string} url
   * @param {Blob} blob
   * @param {string} fieldName
   * @returns {Promise<Record<string, unknown>>}
   */
  async uploadMultipart(url, blob, fieldName) {
    return this.requestWithRetry(async () => {

      // 获取真实的 MIME 类型和文件扩展名
      const mimeType = blob.type || 'image/jpeg';
      const ext = mimeType.includes('gif') ? 'gif' : mimeType.includes('png') ? 'png' : 'jpg';

      if (this.proxyUrl) {
        this.validateProxyUrl(this.proxyUrl);

        // 通过代理发送：将文件转为 base64 (使用 FileReader 提升性能)
        const base64Data = await readBlobAsBase64Payload(blob);

        const headers = { 'Content-Type': 'application/json' };
        if (this.clientId) {
          headers['X-Client-Id'] = this.clientId;
        }

        const proxyResponse = normalizeRequestUrlResponse(await getObsidianRequestUrl()({
          url: this.proxyUrl,
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            url: url,
            method: 'UPLOAD',  // 特殊标记，告诉代理这是文件上传
            fileData: base64Data,
            fileName: `image.${ext}`,
            mimeType: mimeType,
            fieldName: fieldName
          }),
          contentType: 'application/json',
          throw: false
        }));

        if (proxyResponse.status < 200 || proxyResponse.status >= 300) {
          throw createProxyError(getProxyErrorMessage(proxyResponse), proxyResponse.status === 403 || proxyResponse.status === 401);
        }

        const data = /** @type {Record<string, unknown>} */ (getResponseJsonRecord(proxyResponse));
        if (hasWechatUploadResult(data)) {
          return data;
        } else {
          throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
        }
      } else {
        // 直连：原有逻辑
        const boundary = '----ObsidianWechatConverterBoundary' + Math.random().toString(36).substring(2);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        let header = `--${boundary}\r\n`;
        header += `Content-Disposition: form-data; name="${fieldName}"; filename="image.${ext}"\r\n`;
        header += `Content-Type: ${mimeType}\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const headerBytes = new TextEncoder().encode(header);
        const footerBytes = new TextEncoder().encode(footer);

        const bodyBytes = new Uint8Array(headerBytes.length + bytes.length + footerBytes.length);
        bodyBytes.set(headerBytes, 0);
        bodyBytes.set(bytes, headerBytes.length);
        bodyBytes.set(footerBytes, headerBytes.length + bytes.length);

        try {
          const response = normalizeRequestUrlResponse(await getObsidianRequestUrl()({
            url: url,
            method: 'POST',
            body: bodyBytes.buffer,
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`
            }
          }));

          const data = /** @type {Record<string, unknown>} */ (getResponseJsonRecord(response));
          if (hasWechatUploadResult(data)) {
            return data;
          } else {
            throw new Error(`微信API报错: ${formatWechatApiError(data)}`);
          }
        } catch (error) {
          console.error('Upload Error:', error);
          throw new Error(`网络请求失败: ${toReadableError(error).message}`);
        }
      }
    });
  }
}

/**
 * 📝 微信公众号转换视图
 */
class AppleStyleView extends ItemView {
  /**
   * @param {LeafLike} leaf
   * @param {AppleStylePluginLike} plugin
   */
  constructor(leaf, plugin) {
    super(leaf);
    /** @type {AppleStylePluginLike} */
    this.plugin = plugin;
    /** @type {string | null} */
    this.currentHtml = null;
    /** @type {ConverterRuntimeLike | null} */
    this.converter = null;
    /** @type {unknown} */
    this.nativeRenderPipeline = null;
    /** @type {ThemeRuntimeLike | null} */
    this.theme = null;
    /** @type {TFileLike | null} */
    this.lastActiveFile = null;
    /** @type {string | null} */
    this.sessionCoverBase64 = ''; // 本次文章的临时封面
    /** @type {string} */
    this.sessionThumbMediaId = ''; // 从微信素材库选择的封面 media_id
    /** @type {string} */
    this.sessionDraftMediaId = ''; // 本次同步要更新的草稿 media_id
    /** @type {number} */
    this.sessionDraftIndex = 0; // 单图文默认更新第 0 篇
    /** @type {string} */
    this.sessionTitle = ''; // 本次同步的标题
    /** @type {string} */
    this.sessionDigest = ''; // 本次同步的摘要
    /** @type {Map<string, WechatMaterialCacheEntryLike>} */
    this.wechatMaterialCache = new Map(); // Map<account/page, { data, cachedAt }>
    this.wechatMaterialCoverAssetCache = new Map(); // Map<media/url, downloaded bridge asset bytes>

    // 双向滚动同步状态。滚动事件先合并到动画帧，再按预期目标位置
    // 区分用户滚动与代码同步滚动，避免 CodeMirror 重排和反向回弹。
    /** @type {number | null} */
    this.scrollSyncFrame = null;
    /** @type {(() => void) | null} */
    this.cancelScrollSyncFrame = null;
    this.pendingScrollSyncSource = '';
    /** @type {number | null} */
    this.expectedEditorScrollTop = null;
    /** @type {number | null} */
    this.expectedPreviewScrollTop = null;

    // 状态缓存：Map<FilePath, { coverBase64, digest }>
    // 用于在不关闭插件面板的情况下，切换文章或关闭弹窗后保留封面和摘要
    /** @type {Map<string, ArticleSessionStateLike>} */
    this.articleStates = new Map();

    // 公式/SVG 上传缓存：Map<Hash, WechatURL>
    // 避免重复上传相同的公式，节省微信 API 调用额度 (Quota) 并提升速度
    /** @type {Map<string, SvgUploadCacheEntry>} */
    this.svgUploadCache = new Map();
    // 普通图片上传缓存：Map<accountId::src, wechatUrl>
    // 用于同一视图生命周期内跨次同步复用，避免重复上传相同图片
    /** @type {Map<string, string | ImageCacheEntry>} */
    this.imageUploadCache = new Map();
    // 封面上传缓存：Map<accountId/appId::cover::src, { mediaId, fingerprint }>
    // 复用同一封面图的 thumb_media_id，封面内容变化时会自动重新上传。
    /** @type {Map<string, string | CoverCacheEntry>} */
    this.coverUploadCache = new Map();
    // Mermaid 导出缓存：Map<Hash, { dataUrl, width, height, style }>
    // 复制与同步复用同一份本地导出结果，避免重复栅格化
    /** @type {Map<string, unknown>} */
    this.mermaidImageCache = new Map();

    /** @type {number} */
    this.renderGeneration = 0;
    /** @type {string} */
    this.lastRenderError = '';
    /** @type {string} */
    this.lastRenderFailureNoticeKey = '';
    /** @type {number | null} */
    this.activeLeafRenderTimer = null;
    /** @type {number} */
    this.loadingGeneration = 0;
    /** @type {number | null} */
    this.loadingVisibilityTimer = null;
    /** @type {number | null} */
    this.sidePaddingPreviewTimer = null;
    /** @type {number | null} */
    this.resizeTimeout = null;
    /** @type {string} */
    this.lastResolvedMarkdown = '';
    /** @type {string} */
    this.lastResolvedSourcePath = '';
    /** @type {string} */
    this.lastResolvedSourceHash = '';
    /** @type {string} */
    this.aiLayoutSourceSwitchPath = '';
    /** @type {string} */
    this.aiLayoutStaleSuppressPath = '';
    /** @type {number} */
    this.aiLayoutStaleSuppressUntil = 0;
    /** @type {number | null} */
    this.aiLayoutStaleSuppressTimer = null;
    /** @type {string | null} */
    this.baseRenderedHtml = null;
    /** @type {boolean} */
    this.aiPreviewApplied = false;
    this.aiLayoutBtn = null;
    this.settingsBtn = null;
    this.aiLayoutDebugMode = '';
    /** @type {Record<string, unknown> | null} */
    this.aiLayoutActiveGenerationSelection = null;
    /** @type {ObsidianElementLike | null} */
    this.previewContainer = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsOverlay = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsArea = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsAdvancedArea = null;
    /** @type {ObsidianElementLike | null} */
    this.settingsAdvancedOptions = null;
    /** @type {ObsidianElementLike | null} */
    this.activeEditorScroller = null;
    /** @type {((event: Event) => void) | null} */
    this.editorScrollListener = null;
    /** @type {((event: Event) => void) | null} */
    this.previewScrollListener = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutOverlay = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutArea = null;
    /** @type {ObsidianInputLike | null} */
    this.aiLayoutFamilySelect = null;
    /** @type {ObsidianInputLike | null} */
    this.aiColorPaletteSelect = null;
    /** @type {ObsidianInputLike | null} */
    this.aiStylePackSelect = null;
    /** @type {ObsidianInputLike | null} */
    this.aiCustomColorInput = null;
    /** @type {ObsidianElementLike | null} */
    this.aiColorPaletteControls = null;
    /** @type {ObsidianElementLike | null} */
    this.aiColorPaletteGrid = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatus = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatusBadge = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatusBody = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutStatusText = null;
    /** @type {ObsidianElementLike | null} */
    this.aiCachedLayoutList = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutSummary = null;
    /** @type {ObsidianElementLike | null} */
    this.aiGenerateBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiRegenerateBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiResetBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiRestoreBlocksBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiResultSection = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutMetaNote = null;
    /** @type {ObsidianElementLike | null} */
    this.aiBlockList = null;
    /** @type {ObsidianElementLike | null} */
    this.aiAdvancedToggleBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiAdvancedBody = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutMetaChips = null;
    /** @type {ObsidianElementLike | null} */
    this.aiSchemaIssuePanel = null;
    /** @type {ObsidianElementLike | null} */
    this.aiViewJsonBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiViewErrorBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiDebugPanel = null;
    /** @type {ObsidianElementLike | null} */
    this.aiDebugPanelTitle = null;
    /** @type {ObsidianElementLike | null} */
    this.aiCopyPromptBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiCopyDebugBtn = null;
    /** @type {ObsidianElementLike | null} */
    this.aiDebugPanelBody = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutLoadingMask = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutLoadingSpinner = null;
    /** @type {ObsidianElementLike | null} */
    this.aiLayoutLoadingMaskText = null;
    /** @type {ObsidianElementLike | null} */
    this.currentDocLabel = null;
    /** @type {ObsidianElementLike | null} */
    this.docTitleText = null;
    /** @type {ObsidianElementLike | null} */
    this.copyBtn = null;
    /** @type {string} */
    this.selectedAccountId = '';
    /** @type {boolean} */
    this.isCopying = false;
    /** @type {CaptionToggleStateLike | null} */
    this.captionToggleState = null;
    /** @type {string} */
    this.pendingAiLayoutFamily = '';
    /** @type {string} */
    this.pendingAiColorPalette = '';
    /** @type {string} */
    this.pendingAiStylePack = '';
    /** @type {string} */
    this.aiPrimaryActionMode = '';
    /** @type {boolean} */
    this.aiLayoutLoading = false;
    /** @type {boolean} */
    this.aiAdvancedOpen = false;
    /** @type {string} */
    this._sourceFirstRecoveryKey = '';
    /** @type {{ blockKey: string, relativeTop: number, fallbackScrollTop: number } | null} */
    this.aiLayoutPendingAnchor = null;
  }

  getViewType() {
    return APPLE_STYLE_VIEW;
  }

  getDisplayText() {
    return APPLE_STYLE_VIEW_TITLE;
  }

  getIcon() {
    return 'wand';
  }

  async onOpen() {
    console.log('🍎 发布助手面板打开');
    const container = /** @type {ObsidianElementLike} */ (this.containerEl.children[1]);
    container.empty();
    container.addClass('apple-converter-container');
    if (isMobileClient(this.app)) {
      container.addClass('apple-converter-mobile');
    }

    // 加载依赖
    await this.loadDependencies();

    // 创建设置面板
    this.createSettingsPanel(container);

    // 创建预览区 - 根据设置决定是否使用手机框
    const usePhoneFrame = this.plugin.settings.usePhoneFrame && !isMobileClient(this.app);
    const previewWrapper = container.createEl('div', {
      cls: `apple-preview-wrapper ${usePhoneFrame ? 'mode-phone' : 'mode-classic'}`
    });

    // Light Dismiss: 点击预览区域(手机框外)收起设置面板
    previewWrapper.addEventListener('click', () => {
      this.closeTransientPanels();
    });

    if (usePhoneFrame) {
      // === 手机仿真模式 ===
      const phoneFrame = previewWrapper.createEl('div', { cls: 'apple-phone-frame' });

      // 1. 顶部导航栏 (模拟微信)
      const header = phoneFrame.createEl('div', { cls: 'apple-phone-header' });
      header.createEl('span', { cls: 'title', text: '公众号预览' });
      header.createEl('span', { cls: 'dots', text: '•••' });

      // 2. 内容区域 (挂载到手机框内)
      this.previewContainer = phoneFrame.createEl('div', {
        cls: 'apple-converter-preview',
      });

      // 3. 底部 Home Indicator
      phoneFrame.createEl('div', { cls: 'apple-home-indicator' });
    } else {
      // === 经典无框模式 ===
      // 直接挂载到 wrapper，且 wrapper 样式会变为填满父容器
      this.previewContainer = previewWrapper.createEl('div', {
        cls: 'apple-converter-preview',
      });
    }

    this.setPlaceholder();

    // 监听文件切换
    this.registerActiveFileChange();

    // 初始化同步滚动
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) this.registerScrollSync(activeView);

    // 自动转换当前文档
    window.setTimeout(async () => {
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
    // 监听文件切换
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
          this.lastActiveFile = activeView.file;
          const nextSourcePath = activeView.file.path || '';
          if (nextSourcePath && nextSourcePath !== this.lastResolvedSourcePath) {
            this.markAiLayoutSourceSwitch(nextSourcePath);
          }
        }
        if (activeView && this.converter) {
          this.scheduleActiveLeafRender(activeView);
        }
        this.updateCurrentDoc();

        // 更新滚动同步绑定
        if (activeView) {
          this.registerScrollSync(activeView);
        }

      })
    );

    // 监听编辑器内容变化 (实时预览)
    /**
     * @param {(...args: unknown[]) => unknown} func
     * @param {number} wait
     * @returns {(...args: unknown[]) => void}
     */
    const debounce = (func, wait) => {
      /** @type {number | undefined} */
      let timeout;
      return (...args) => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => func(...args), wait);
      };
    };

    const debouncedConvert = debounce(async () => {
      // 1. 真正的可见性检查 (True Visibility Check)
      // 如果插件被折叠、隐藏或从未打开，offsetParent 为 null
      if (!this.containerEl.offsetParent) return;

      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      // 仅当当前编辑的文件是最后激活的文件时才更新
      if (activeView && activeView.file && this.lastActiveFile && activeView.file.path === this.lastActiveFile.path) {
        await this.convertCurrent(true, {
          sourceOverride: {
            markdown: activeView.editor.getValue(),
            sourcePath: activeView.file.path || '',
          },
        });
      }
    }, 500); // 500ms 延迟

    this.registerEvent(
      this.app.workspace.on('editor-change', debouncedConvert)
    );
  }

  /**
   * @param {MarkdownViewLike | null} [activeViewOverride]
   */
  scheduleActiveLeafRender(activeViewOverride = null) {
    if (this.activeLeafRenderTimer) {
      window.clearTimeout(this.activeLeafRenderTimer);
      this.activeLeafRenderTimer = null;
    }

    // 让出当前 active-leaf 事件栈，但不额外等待一帧，避免切文档时可见卡顿。
    this.activeLeafRenderTimer = window.setTimeout(() => {
      this.activeLeafRenderTimer = null;
      const activeView = activeViewOverride || this.app.workspace.getActiveViewOfType(MarkdownView);
      const sourceOverride = activeView && activeView.file
        ? {
          markdown: activeView.editor.getValue(),
          sourcePath: activeView.file.path || '',
        }
        : null;
      this.convertCurrent(true, {
        showLoading: true,
        loadingText: '正在切换文章预览...',
        loadingDelay: 120,
        sourceOverride,
      });
    }, 0);
  }

  scheduleSidePaddingPreview(delay = 120) {
    if (this.sidePaddingPreviewTimer) {
      window.clearTimeout(this.sidePaddingPreviewTimer);
      this.sidePaddingPreviewTimer = null;
    }
    this.sidePaddingPreviewTimer = window.setTimeout(() => {
      this.sidePaddingPreviewTimer = null;
      this.convertCurrent(true);
    }, delay);
  }

  setPreviewLoading(active, text = '正在渲染预览...') {
    if (!this.previewContainer) return;
    if (active) {
      this.previewContainer.addClass('apple-preview-loading');
      this.previewContainer.dataset.loadingText = text;
      return;
    }
    this.previewContainer.removeClass('apple-preview-loading');
    delete this.previewContainer.dataset.loadingText;
  }

  markAiLayoutSourceSwitch(sourcePath = '') {
    if (!sourcePath) return;
    this.aiLayoutSourceSwitchPath = sourcePath;
    this.aiLayoutStaleSuppressPath = sourcePath;
    this.aiLayoutStaleSuppressUntil = Date.now() + AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS;
    if (this.aiLayoutStaleSuppressTimer) {
      window.clearTimeout(this.aiLayoutStaleSuppressTimer);
    }
    this.aiLayoutStaleSuppressTimer = window.setTimeout(() => {
      this.aiLayoutStaleSuppressTimer = null;
      if (
        this.aiLayoutStaleSuppressPath === sourcePath
        && Date.now() >= this.aiLayoutStaleSuppressUntil
      ) {
        this.aiLayoutStaleSuppressPath = '';
        this.aiLayoutStaleSuppressUntil = 0;
      }
      if (this.shouldSyncAiLayoutUi()) {
        this.refreshAiLayoutPanel();
      }
    }, AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS + 40);
  }

  completeAiLayoutSourceSwitch(sourcePath = '') {
    if (sourcePath && this.aiLayoutSourceSwitchPath === sourcePath) {
      this.aiLayoutSourceSwitchPath = '';
    }
  }

  isAiLayoutStaleSuppressedForPath(sourcePath = '') {
    if (!sourcePath || this.aiLayoutStaleSuppressPath !== sourcePath) return false;
    if (Date.now() < this.aiLayoutStaleSuppressUntil) return true;
    this.aiLayoutStaleSuppressPath = '';
    this.aiLayoutStaleSuppressUntil = 0;
    return false;
  }

  /**
   * 注册同步滚动 (双向: Editor <-> Preview)
   * 用动画帧合并高频事件，并按预期目标位置过滤程序触发的回调。
   * @param {MarkdownViewLike | null} activeView
   */
  registerScrollSync(activeView) {
    // 1. 清理旧的监听器
    if (this.activeEditorScroller && this.editorScrollListener) {
      this.activeEditorScroller.removeEventListener('scroll', this.editorScrollListener);
    }
    if (this.previewContainer && this.previewScrollListener) {
      this.previewContainer.removeEventListener('scroll', this.previewScrollListener);
    }
    if (this.cancelScrollSyncFrame) {
      this.cancelScrollSyncFrame();
    }

    this.activeEditorScroller = null;
    this.editorScrollListener = null;
    this.previewScrollListener = null;
    this.scrollSyncFrame = null;
    this.cancelScrollSyncFrame = null;
    this.pendingScrollSyncSource = '';
    this.expectedEditorScrollTop = null;
    this.expectedPreviewScrollTop = null;

    if (!activeView) return;

    // 2. 获取 Editor Scroller
    const editorScroller = /** @type {ObsidianElementLike | null} */ (activeView.contentEl.querySelector('.cm-scroller'));
    if (!editorScroller) return;
    this.activeEditorScroller = editorScroller;

    /**
     * @param {ObsidianElementLike} element
     * @param {'expectedEditorScrollTop' | 'expectedPreviewScrollTop'} fieldName
     * @returns {boolean}
     */
    const consumeExpectedScroll = (element, fieldName) => {
      const expected = this[fieldName];
      if (!Number.isFinite(expected)) return false;
      if (Math.abs(element.scrollTop - expected) <= 1) return true;
      this[fieldName] = null;
      return false;
    };

    /**
     * @param {'editor' | 'preview'} source
     */
    const syncScrollPosition = (source) => {
      if (!this.containerEl.offsetParent || !this.previewContainer) return;
      const editorHeight = editorScroller.scrollHeight - editorScroller.clientHeight;
      const previewHeight = this.previewContainer.scrollHeight - this.previewContainer.clientHeight;
      if (editorHeight <= 0 || previewHeight <= 0) return;

      if (source === 'editor') {
        let targetScrollTop;
        if (editorScroller.scrollTop === 0) {
          targetScrollTop = 0;
        } else if (Math.abs(editorScroller.scrollTop - editorHeight) < 2) {
          targetScrollTop = previewHeight;
        } else {
          targetScrollTop = (editorScroller.scrollTop / editorHeight) * previewHeight;
        }

        if (Math.abs(this.previewContainer.scrollTop - targetScrollTop) <= 1) return;
        this.expectedPreviewScrollTop = targetScrollTop;
        this.previewContainer.scrollTop = targetScrollTop;
        return;
      }

      let targetScrollTop;
      if (this.previewContainer.scrollTop === 0) {
        targetScrollTop = 0;
      } else if (Math.abs(this.previewContainer.scrollTop - previewHeight) < 2) {
        targetScrollTop = editorHeight;
      } else {
        const ratio = this.previewContainer.scrollTop / previewHeight;
        targetScrollTop = ratio * editorHeight;
      }

      if (Math.abs(editorScroller.scrollTop - targetScrollTop) <= 1) return;
      this.expectedEditorScrollTop = targetScrollTop;
      editorScroller.scrollTop = targetScrollTop;
    };

    /**
     * @param {'editor' | 'preview'} source
     */
    const scheduleScrollSync = (source) => {
      this.pendingScrollSyncSource = source;
      if (this.scrollSyncFrame !== null) return;

      const run = () => {
        this.scrollSyncFrame = null;
        this.cancelScrollSyncFrame = null;
        const pendingSource = this.pendingScrollSyncSource;
        this.pendingScrollSyncSource = '';
        if (pendingSource) {
          syncScrollPosition(pendingSource);
        }
      };

      if (typeof requestAnimationFrame === 'function') {
        const frameId = window.requestAnimationFrame(run);
        this.scrollSyncFrame = frameId;
        this.cancelScrollSyncFrame = () => {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(frameId);
          }
        };
      } else {
        const timeoutId = window.setTimeout(run, 16);
        this.scrollSyncFrame = timeoutId;
        this.cancelScrollSyncFrame = () => window.clearTimeout(timeoutId);
      }
    };

    // === Listener A: Editor -> Preview ===
    this.editorScrollListener = () => {
      if (!this.containerEl.offsetParent) return;
      if (consumeExpectedScroll(editorScroller, 'expectedEditorScrollTop')) return;
      scheduleScrollSync('editor');
    };

    // === Listener B: Preview -> Editor ===
    this.previewScrollListener = () => {
      if (!this.containerEl.offsetParent || !this.previewContainer) return;
      if (consumeExpectedScroll(this.previewContainer, 'expectedPreviewScrollTop')) return;
      scheduleScrollSync('preview');
    };

    // 4. 绑定监听 (使用 passive 提升性能)
    editorScroller.addEventListener('scroll', this.editorScrollListener, { passive: true });
    this.previewContainer.addEventListener('scroll', this.previewScrollListener, { passive: true });
  }

  /**
   * 加载依赖库
   */
  async loadDependencies() {
    const adapter = this.app.vault.adapter;
    // Use dynamic path from manifest to allow folder renaming
    const basePath = this.plugin.manifest?.dir || '';

    try {
      const runtime = /** @type {{ theme: ThemeRuntimeLike, converter: ConverterRuntimeLike }} */ (await buildRenderRuntime({
        settings: this.plugin.settings,
        app: this.app,
        adapter,
        basePath,
      }));
      this.theme = runtime.theme;
      this.converter = runtime.converter;
      const pipelines = /** @type {{ nativePipeline: RenderPipelineLike }} */ (createRenderPipelines({
        candidateRenderer: async (markdown, context = {}) => {
          const renderContext = /** @type {RenderCandidateContextLike} */ (toRecord(context));
          const contextSettings = isRecord(renderContext.settings)
            ? /** @type {PluginSettingsLike} */ (renderContext.settings)
            : this.plugin.settings;
          if (canUseNativePreviewFastPath(markdown)) {
            const nativeHtml = /** @type {unknown} */ (await renderNativeMarkdown({
              converter: this.converter,
              markdown: String(markdown || ''),
              sourcePath: toOptionalText(renderContext.sourcePath),
            }));
            return String(nativeHtml || '');
          }
          return /** @type {Promise<string>} */ (renderObsidianTripletMarkdown({
            app: this.app,
            converter: this.converter,
            markdown: String(markdown || ''),
            sourcePath: toOptionalText(renderContext.sourcePath),
            settings: contextSettings,
            component: this,
            markdownRenderer: obsidianApi.MarkdownRenderer,
            rasterizeMermaid: false,
            preserveSvgStyleTags: true,
          }));
        },
      }));
      this.nativeRenderPipeline = pipelines.nativePipeline;

      console.log('✅ 依赖加载完成');
    } catch (error) {
      console.error('❌ 依赖加载失败:', error);
      new Notice('依赖加载失败: ' + toReadableError(error).message);
    }
  }


  /**
   * 创建设置面板（重构为：顶部工具栏 + 悬浮设置层）
   * @param {ObsidianElementLike} container
   */
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



  /**
   * 创建账号选择器
   */
  /**
   * @param {ObsidianElementLike} parent
   */
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

  /**
   * 从文章内容中提取第一张图片作为封面
   */
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

  /**
   * 获取当前发布上下文文件：
   * 1) 优先当前活动文件
   * 2) 回退到最近一次活动文件（侧边栏切换 tab 后常见）
   */
  getPublishContextFile() {
    const activeFile = this.app?.workspace?.getActiveFile?.();
    if (activeFile) return activeFile;
    if (this.lastActiveFile) return this.lastActiveFile;
    return null;
  }

  /**
   * 读取当前文档 frontmatter 中的发布元数据
   * @returns {{ excerpt: string, cover: string, cover_dir: string, coverSrc: string|null, title: string }}
   */
  /**
   * @param {TFileLike | unknown | null | undefined} activeFile
   * @returns {{ excerpt: string, cover: string, cover_dir: string, coverSrc: string|null, title: string }}
   */
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

  /**
   * @param {Record<string, unknown> | null | undefined} frontmatter
   * @param {string[]} keys
   * @returns {string}
   */
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

  /**
   * @param {unknown} key
   * @returns {string}
   */
  normalizeFrontmatterKey(key) {
    return String(key || '').toLowerCase().replace(/[_-]/g, '');
  }

  /**
   * @param {Record<string, unknown> | null | undefined} frontmatter
   * @param {string[]} keys
   * @returns {Record<string, string>}
   */
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

  isPathInsideDirectory(filePath, dirPath) {
    const file = this.normalizeVaultPath(filePath);
    const dir = this.normalizeVaultPath(dirPath);
    if (!file || !dir) return false;
    if (file === dir) return true;
    return file.startsWith(`${dir}/`);
  }

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

  shouldClearFrontmatterPathAfterCleanup(pathValue, cleanedDir) {
    const normalized = this.normalizeVaultPath(pathValue);
    if (!normalized) return false;
    if (this.isPathInsideDirectory(normalized, cleanedDir)) return true;
    return this.isPathInsideDirectoryByTail(normalized, cleanedDir);
  }

  /**
   * @param {Record<string, unknown> | null | undefined} frontmatter
   * @param {string} cleanedDir
   * @returns {boolean}
   */
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

  /**
   * 将 vault 相对路径解析为可预览/上传的资源 src（通常是 app://）
   */
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

  normalizeVaultPath(vaultPath) {
    return normalizeVaultPath(vaultPath);
  }

  getVaultConfigDir() {
    const configDir = this.app?.vault?.configDir;
    return typeof configDir === 'string' ? this.normalizeVaultPath(configDir) : '';
  }

  getCleanupDirTemplate() {
    const raw = typeof this.plugin?.settings?.cleanupDirTemplate === 'string'
      ? this.plugin.settings.cleanupDirTemplate
      : '';
    return this.normalizeVaultPath(raw);
  }

  /**
   * @param {TFileLike | null | undefined} activeFile
   * @returns {{ path: string, warning?: string }}
   */
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

  /**
   * 清理目录安全校验：禁止空路径、上跳路径、系统配置目录等危险路径
   */
  isSafeCleanupDirPath(vaultPath) {
    const normalized = this.normalizeVaultPath(vaultPath);
    if (!normalized) return false;
    if (normalized === '.') return false;
    if (normalized.includes('..')) return false;
    const configDir = this.getVaultConfigDir();
    if (configDir && (normalized === configDir || normalized.startsWith(`${configDir}/`))) return false;
    return true;
  }

  /**
   * 在同步成功后按配置清理目录
   * 失败返回 warning，不抛错（避免影响同步成功状态）
   * @param {TFileLike | null | undefined} activeFile
   * @returns {Promise<CleanupResultLike>}
   */
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

  /**
   * 创建设置区块
   * @param {ObsidianElementLike} parent
   * @param {string} label
   * @param {(content: ObsidianElementLike) => unknown} builder
   * @returns {ObsidianElementLike}
   */
  createSection(parent, label, builder) {
    const section = parent.createEl('div', { cls: 'apple-setting-section' });
    section.createEl('label', { cls: 'apple-setting-label', text: label });
    const content = section.createEl('div', { cls: 'apple-setting-content' });
    builder(content);
    return section;
  }

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

  /**
   * @param {ObsidianElementLike | null} overlay
   * @param {ObsidianElementLike | null} button
   * @param {(() => unknown) | undefined} onOpen
   */
  /**
   * @param {ObsidianElementLike | null} overlay
   * @param {ObsidianElementLike | null} button
   * @param {(() => unknown) | undefined} [onOpen]
   */
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

  /**
   * @param {Element | null} element
   * @param {number} deltaY
   * @returns {boolean}
   */
  canScrollElementInDirection(element, deltaY) {
    if (!element) return false;
    const maxScroll = Math.max(0, (element.scrollHeight || 0) - (element.clientHeight || 0));
    if (maxScroll <= 0) return false;
    if (deltaY < 0) return (element.scrollTop || 0) > 0;
    if (deltaY > 0) return (element.scrollTop || 0) < maxScroll - 1;
    return true;
  }

  /**
   * @param {ObsidianElementLike | null} overlay
   * @param {string[]} [nestedSelectors]
   */
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

  closeTransientPanels() {
    removeElementClass(this.settingsOverlay, 'visible');
    removeElementClass(this.aiLayoutOverlay, 'visible');
    removeElementClass(this.settingsBtn, 'active');
    removeElementClass(this.aiLayoutBtn, 'active');
  }

  /**
   * @returns {AiLayoutStateLike | null}
   */
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

  hasCurrentArticleAiLayoutCache() {
    const state = this.getCurrentArticleAnyLayoutState();
    return !!(state?.status === 'ready' && Array.isArray(state.layoutJson?.blocks) && state.layoutJson.blocks.length);
  }

  updateAiToolbarState() {
    if (!this.aiLayoutBtn) return;
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

  /**
   * @param {ObsidianElementLike} parent
   */
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

  /**
   * @returns {string}
   */
  getAiCustomColor() {
    return normalizeHexColor(this.plugin.settings?.ai?.customColor, '#7c3aed');
  }

  /**
   * @param {string} [colorPaletteId]
   * @returns {{ customColor: string } | null}
   */
  getAiColorPaletteOverride(colorPaletteId = '') {
    const targetPalette = colorPaletteId || this.getCurrentAiLayoutSelection().colorPalette;
    if (targetPalette !== 'custom') return null;
    return { customColor: this.getAiCustomColor() };
  }

  /**
   * @param {string} [colorPaletteId]
   * @returns {Record<string, unknown>}
   */
  getAiRenderColorPalette(colorPaletteId = '') {
    const targetPalette = colorPaletteId || this.getCurrentAiLayoutSelection().colorPalette || 'tech-green';
    return /** @type {Record<string, unknown>} */ (resolveColorPaletteForRender(targetPalette, this.getAiColorPaletteOverride(targetPalette)));
  }

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

  /**
   * @param {AiLayoutJsonLike | null} [layoutJson]
   * @param {string} [colorPaletteId]
   * @returns {AiLayoutJsonLike | null}
   */
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

  /**
   * @param {string} value
   * @param {{ skipSave?: boolean }} [options]
   */
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

  /**
   * @param {string} value
   */
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

  /**
   * @param {string} colorPaletteId
   */
  applyAiLayoutPanelStylePack(colorPaletteId) {
    if (!this.aiLayoutOverlay) return;
    const pack = this.getAiRenderColorPalette(colorPaletteId || 'tech-green');
    const tokens = toRecord(pack.tokens);
    this.aiLayoutOverlay.style.setProperty('--ai-layout-accent', tokens.accent || '#0a84ff');
    this.aiLayoutOverlay.style.setProperty('--ai-layout-accent-deep', tokens.accentDeep || tokens.accent || '#0a84ff');
    this.aiLayoutOverlay.style.setProperty('--ai-layout-accent-soft', tokens.accentSoft || 'rgba(0, 122, 255, 0.08)');
    this.aiLayoutOverlay.style.setProperty('--ai-layout-accent-border', tokens.accent || '#0a84ff');
  }

  /**
   * @param {AiLayoutBlockLike | unknown} [block]
   * @param {number} [index]
   * @returns {string}
   */
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

  /**
   * @param {AiLayoutStateLike | null} state
   * @returns {VisibleAiLayoutSnapshotLike}
   */
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

  /**
   * @param {number} originalIndex
   * @param {HTMLElement | ObsidianElementLike | null} [itemEl]
   */
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

  /**
   * @param {number} originalIndex
   * @param {HTMLElement | ObsidianElementLike | null} [itemEl]
   */
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

  /**
   * @param {string} mode
   */
  toggleAiLayoutDebugMode(mode) {
    this.aiAdvancedOpen = true;
    this.aiLayoutDebugMode = this.aiLayoutDebugMode === mode ? '' : mode;
    this.refreshAiLayoutPanel();
  }

  /**
   * @returns {AiLayoutContextLike}
   */
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

  /**
   * @returns {AiLayoutSelectionLike}
   */
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

  /**
   * @returns {AiLayoutStateLike | null}
   */
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

  /**
   * @param {string} [sourcePath]
   * @param {AiLayoutSelectionLike | Record<string, unknown>} [selection]
   * @param {AiLayoutStateLike | null} [candidateState]
   * @param {string} [sourceHash]
   * @returns {AiLayoutStateLike | null}
   */
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

  /**
   * @param {AiLayoutStateLike | null} [currentState]
   * @param {AiLayoutSelectionLike | null} [selection]
   * @param {AiLayoutContextLike | null} [context]
   * @returns {Promise<AiLayoutJsonLike | null>}
   */
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

  /**
   * @param {AiLayoutStateLike | null} [baseState]
   * @param {AiLayoutSelectionLike | null} [selection]
   * @returns {Promise<AiLayoutStateLike | null>}
   */
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

  isAiLayoutPanelVisible() {
    return !!(this.aiLayoutOverlay && this.aiLayoutOverlay.classList?.contains('visible'));
  }

  shouldSyncAiLayoutUi() {
    return this.aiPreviewApplied === true || this.aiLayoutLoading === true || this.isAiLayoutPanelVisible();
  }

  /**
   * @param {AiLayoutStateLike | null} state
   * @param {AiSettingsLike | null | undefined} aiSettings
   * @returns {string}
   */
  getArticleLayoutProviderLabel(state, aiSettings) {
    if (!state) return '';
    const providerList = Array.isArray(aiSettings?.providers) ? aiSettings.providers : [];
    const matchedProvider = state.providerId
      ? providerList.find((item) => item.id === state.providerId)
      : null;
    return state.generationMeta?.providerName || matchedProvider?.name || '';
  }

  /**
   * @param {AiLayoutStateLike | null} state
   * @param {AiSettingsLike | null | undefined} aiSettings
   * @returns {string}
   */
  getArticleLayoutModelLabel(state, aiSettings) {
    if (!state) return '';
    const providerList = Array.isArray(aiSettings?.providers) ? aiSettings.providers : [];
    const matchedProvider = state.providerId
      ? providerList.find((item) => item.id === state.providerId)
      : null;
    return state.generationMeta?.providerModel || state.model || matchedProvider?.model || '';
  }

  /**
   * @param {AiLayoutBlockLike | unknown} block
   * @returns {string}
   */
  getAiLayoutBlockLabel(block) {
    const blockRecord = toAiLayoutBlock(block);
    return blockRecord.title || blockRecord.caseLabel || blockRecord.text || blockRecord.caption || blockRecord.buttonText || blockRecord.type || '未命名区块';
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  getAiLayoutFamilyLabel(value) {
    if (value === AI_LAYOUT_SELECTION_AUTO) return '自动推荐';
    const family = getLayoutFamilyById(value);
    if (!family) return value || '自动推荐';
    return family.label || value || '自动推荐';
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  getAiColorPaletteLabel(value) {
    if (value === AI_LAYOUT_SELECTION_AUTO) return '自动配色';
    return getColorPaletteById(value)?.label || value || '自动配色';
  }

  /**
   * @param {AiLayoutStateLike | null} state
   * @returns {AiSchemaValidationLike | null}
   */
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

  /**
   * @param {string[]} [chips]
   */
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

  /**
   * @returns {{ familyStates?: Record<string, AiLayoutStateLike>, lastLayoutFamily?: string } | null}
   */
  getCurrentArticleLayoutCacheEntry() {
    const { sourcePath } = this.getCurrentLayoutContext();
    if (!sourcePath) return null;
    const normalizedPath = normalizeVaultPath(sourcePath);
    return /** @type {{ familyStates?: Record<string, AiLayoutStateLike>, lastLayoutFamily?: string } | null} */ (normalizeArticleLayoutCacheEntry(this.plugin?.settings?.ai?.articleLayoutsByPath?.[normalizedPath]));
  }

  /**
   * @param {AiLayoutContextLike} [context]
   * @returns {{ layoutFamily: string, state: AiLayoutStateLike, label: string, isCurrentContent: boolean, isStaleContent: boolean, fromAuto: boolean, updatedAt: number }[]}
   */
  getCachedAiLayoutFamilyItems(context = this.getCurrentLayoutContext()) {
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

  /**
   * @param {{ context?: AiLayoutContextLike, currentLayoutFamily?: string, isLoading?: boolean }} [options]
   */
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

  /**
   * @param {string} [layoutFamily]
   */
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

  /**
   * @param {{ hasDoc: boolean, aiFeatureEnabled: boolean, canGenerateForSelection: boolean, state: AiLayoutStateLike | null, visibleLayout: AiLayoutJsonLike | null, hasReusableLayout: boolean, hasLastAttemptFailure: boolean, hasApplied: boolean, isStale: boolean, isLoading: boolean }} options
   * @returns {{ mode: string, label: string, disabled: boolean }}
   */
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

  /**
   * @param {AiSchemaValidationLike | null} [schemaValidation]
   */
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

  /**
   * @param {AiLayoutStateLike | null} state
   * @returns {string}
   */
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

  /**
   * @param {{ state: AiLayoutStateLike | null, providerLabel?: string, modelLabel?: string, isStale?: boolean }} options
   * @returns {string}
   */
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

  /**
   * @param {{ mode?: string, state: AiLayoutStateLike | null, providerLabel?: string, modelLabel?: string, isStale?: boolean, sourcePath?: string }} options
   * @returns {string}
   */
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

  truncateAiPromptMarkdown(markdown, maxLength = 1600) {
    const normalized = String(markdown || '').trim();
    if (!normalized) return '';
    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}…`
      : normalized;
  }

  /**
   * @param {{ state: AiLayoutStateLike | null, context: AiLayoutContextLike, providerLabel?: string, modelLabel?: string, isStale?: boolean }} options
   * @returns {string}
   */
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

  /**
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async copyPlainTextSnapshot(text) {
    if (!text) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

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

  /**
   * @param {{ state: AiLayoutStateLike | null, providerLabel?: string, modelLabel?: string, isStale?: boolean }} options
   */
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

  /**
   * @param {{ stateOverride?: AiLayoutStateLike | null, allowStale?: boolean }} [options]
   */
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

  syncPreviewPresentationMode() {
    if (!this.previewContainer) return;
    const hasAiPreview = this.aiPreviewApplied === true;
    this.previewContainer.classList.toggle('apple-ai-preview-active', hasAiPreview);
    const previewWrapper = this.previewContainer.closest('.apple-preview-wrapper');
    previewWrapper?.classList.toggle('apple-ai-preview-active', hasAiPreview);
  }

  /**
   * @returns {boolean}
   */
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

  /**
   * @param {string} url
   * @param {{ allowExtensionUrls?: boolean }} [options]
   * @returns {boolean}
   */
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

  openPublisherProPage() {
    return this.openExternalUrl(OBSIDIAN_PUBLISHER_PRO_URL);
  }

  openPublisherGuidePage(section = '') {
    if (section === 'bridge') {
      return this.openExternalUrl(OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL);
    }
    if (section === 'install-extension') {
      return this.openExternalUrl(OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL);
    }
    return this.openExternalUrl(OBSIDIAN_PUBLISHER_GUIDE_URL);
  }

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

  /**
   * @param {string} message
   * @param {SyncModalOptionsLike} [options]
   */
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

  /**
   * 提示用户先配置公众号账号（空状态 + 引导操作）
   */
  promptConfigureWechatAccount() {
    this.showAccountSetupEmptyState();
  }

  /**
   * 显示同步选项 Modal
   */
  /**
   * @param {ModalLike} modal
   * @param {{ mode?: string, mobileSync?: boolean }} [options]
   */
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

  /**
   * @param {ModalLike} modal
   * @param {string} [activeMode]
   * @returns {{ wechatTab: ObsidianElementLike, multiPlatformTab: ObsidianElementLike }}
   */
  createPublishModeTabs(modal, activeMode = 'wechat') {
    const publishModeTabs = modal.contentEl.createDiv({ cls: 'wechat-publish-mode-tabs' });
    const wechatTab = publishModeTabs.createEl('button', {
      text: '微信草稿箱',
      cls: `wechat-publish-mode-tab${activeMode === 'wechat' ? ' is-active' : ''}`,
    });

    const feishuTab = publishModeTabs.createEl('button', {
      text: '飞书云文档',
      cls: `wechat-publish-mode-tab${activeMode === 'feishu' ? ' is-active' : ''}`,
    });

    const multiPlatformTab = publishModeTabs.createEl('button', {
      cls: `wechat-publish-mode-tab${activeMode === 'multi' ? ' is-active' : ''}`,
    });
    multiPlatformTab.createEl('span', { text: MULTI_PLATFORM_TAB_LABEL });
    return { wechatTab, feishuTab, multiPlatformTab };
  }

  /**
   * @param {SyncModalOptionsLike} [options]
   */
  showSyncModal(options = {}) {
    if (!this.currentHtml) {
      new Notice(this.getMissingRenderNotice());
      return;
    }

    const accounts = this.plugin.settings.wechatAccounts || [];
    if (accounts.length === 0) {
      if (!options.modal) {
        if (this.plugin.settings.feishuSync?.enabled) {
          this.showFeishuSyncModal();
          return;
        }
        if (this.plugin.settings.multiPlatformSync?.enabled) {
          this.showMultiPlatformSyncModal();
          return;
        }
      }
      const modal = options.modal || createObsidianModal(this.app);
      const mobileSync = isMobileClient(this.app);
      this.preparePublishModalShell(modal, { mode: 'wechat', mobileSync });
      const { feishuTab, multiPlatformTab } = this.createPublishModeTabs(modal, 'wechat');
      if (feishuTab) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic tab element click handler
        feishuTab.onclick = () => this.showFeishuSyncModal({ modal });
      }
      multiPlatformTab.onclick = () => this.showMultiPlatformSyncModal({ modal });
      const empty = modal.contentEl.createDiv({ cls: 'wechat-sync-empty-state' });
      empty.createEl('h3', { text: '尚未配置微信公众号账号' });
      empty.createEl('p', { text: '微信草稿箱需要先配置公众号 API。其他平台仍可通过浏览器插件发送。' });
      const settingsBtn = empty.createEl('button', { text: '去设置', cls: 'mod-cta' });
      settingsBtn.onclick = () => {
        modal.close();
        this.openPluginSettings();
      };
      if (!options.modal) {
        modal.open();
      }
      return;
    }
    const modal = options.modal || createObsidianModal(this.app);
    const shouldOpenModal = !options.modal;
    const mobileSync = isMobileClient(this.app);
    this.preparePublishModalShell(modal, { mode: 'wechat', mobileSync });

    const { feishuTab, multiPlatformTab } = this.createPublishModeTabs(modal, 'wechat');
    if (feishuTab) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic tab element click handler
      feishuTab.onclick = () => {
        this.showFeishuSyncModal({ modal });
      };
    }
    multiPlatformTab.onclick = () => {
      this.showMultiPlatformSyncModal({ modal });
    };

    // 获取当前活动文件的路径，用于状态缓存
    const activeFile = this.getPublishContextFile();
    const currentPath = activeFile ? activeFile.path : null;
    const frontmatterMeta = this.getFrontmatterPublishMeta(activeFile);

    // 尝试从缓存读取状态
    /** @type {ArticleSessionStateLike | null} */
    let cachedState = null;
    if (currentPath && this.articleStates.has(currentPath)) {
      cachedState = this.articleStates.get(currentPath);
    }

    const defaultId = this.plugin.settings.defaultAccountId;
    const hasDefault = accounts.some((account) => account.id === defaultId);
    let selectedAccountId = hasDefault ? defaultId : (accounts[0]?.id || '');

    // 封面逻辑：优先使用缓存 -> frontmatter.cover -> 文章第一张图
    let coverBase64 = cachedState?.coverBase64 || frontmatterMeta.coverSrc || this.getFirstImageFromArticle() || '';
    let thumbMediaId = cachedState?.thumbMediaId || '';
    /** @type {WechatMaterialSelectionLike | null} */
    let materialCover = cachedState?.materialCover || null;

    // 更新 sessionCoverBase64 以便 onSyncToWechat 使用
    this.sessionCoverBase64 = coverBase64;
    this.sessionThumbMediaId = thumbMediaId;

    /** @returns {WechatAccountLike | null} */
    const getSelectedAccount = () => {
      const resolvedAccount = /** @type {unknown} */ (resolveSyncAccount({
        accounts: this.plugin.settings.wechatAccounts || [],
        selectedAccountId,
        defaultAccountId: this.plugin.settings.defaultAccountId,
      }));
      return isRecord(resolvedAccount) ? /** @type {WechatAccountLike} */ (resolvedAccount) : null;
    };
    const getSelectedDraftAssociation = () => currentPath
      ? /** @type {DraftAssociationLike | null} */ (getDraftAssociation(this.plugin.settings, currentPath, getSelectedAccount()?.id || selectedAccountId))
      : null;
    /** @type {DraftAssociationLike | null} */
    let draftAssociation = getSelectedDraftAssociation();
    let forceNewDraft = false;

    // 账号选择器
    const accountSection = modal.contentEl.createDiv({ cls: 'wechat-modal-section' });
    accountSection.createEl('label', { text: '账号', cls: 'wechat-modal-label' });
    if (accounts.length === 1) {
      const onlyAccount = accounts[0];
      selectedAccountId = onlyAccount.id;
      accountSection.createEl('div', {
        cls: 'wechat-sync-account-single',
        text: `${onlyAccount.name} (默认)`
      });
    } else {
      const accountSelect = /** @type {ObsidianInputLike} */ (accountSection.createEl('select', { cls: 'wechat-account-select' }));

      for (const account of accounts) {
        const option = /** @type {ObsidianInputLike} */ (accountSelect.createEl('option', {
          value: account.id,
          text: account.id === defaultId ? `${account.name} (默认)` : account.name
        }));
        if (account.id === selectedAccountId) option.selected = true;
      }
      accountSelect.addEventListener('change', (e) => {
        selectedAccountId = getEventTargetValue(e, selectedAccountId);
        draftAssociation = getSelectedDraftAssociation();
        forceNewDraft = false;
        if (typeof updatePreview === 'function') updatePreview();
        if (typeof updateDraftStatusUI === 'function') updateDraftStatusUI();
      });
    }

    if (mobileSync) {
      const hasCoverForModal = !!coverBase64 || !!thumbMediaId;
      modal.contentEl.createEl('p', {
        cls: 'wechat-sync-mobile-quick-hint',
        text: hasCoverForModal
          ? '可直接同步；封面与摘要可在高级选项中调整。'
          : '当前未检测到封面，请在高级选项中上传封面后再同步。'
      });
    }

    const advancedOptions = modal.contentEl.createEl('details', { cls: 'wechat-sync-advanced' });
    const shouldExpandAdvanced = !mobileSync || (!coverBase64 && !thumbMediaId);
    if (shouldExpandAdvanced) advancedOptions.setAttribute('open', '');
    advancedOptions.createEl('summary', {
      cls: 'wechat-sync-advanced-summary',
      text: '高级选项（标题、封面与摘要）'
    });
    const advancedBody = advancedOptions.createDiv({ cls: 'wechat-sync-advanced-body' });

    // 标题设置
    const titleSection = advancedBody.createDiv({ cls: 'wechat-modal-section' });
    titleSection.createEl('label', { text: '文章标题', cls: 'wechat-modal-label' });

    // 标题逻辑：优先使用缓存 -> frontmatter.title -> 文件名
    const initialTitle = cachedState?.title !== undefined
      ? cachedState.title
      : (frontmatterMeta.title || (activeFile ? activeFile.basename : ''));

    const titleInput = /** @type {ObsidianInputLike} */ (titleSection.createEl('input', {
      type: 'text',
      cls: 'wechat-modal-title-input',
      placeholder: '留空则默认使用 frontmatter 中的 title 或文件名'
    }));
    titleInput.value = initialTitle;
    titleInput.setCssStyles({ width: '100%' });
    titleInput.maxLength = 64; // 微信标题最大限制 64 字符

    // 实时更新缓存（标题）
    titleInput.addEventListener('input', () => {
      if (currentPath) {
        const state = this.articleStates.get(currentPath) || {};
        this.articleStates.set(currentPath, { ...state, title: titleInput.value.trim() });
      }
    });

    // 封面设置
    const coverSection = advancedBody.createDiv({ cls: 'wechat-modal-section' });
    coverSection.createEl('label', { text: '封面图', cls: 'wechat-modal-label' });

    const coverContent = coverSection.createDiv({ cls: 'wechat-modal-cover-content' });
    const coverPreview = coverContent.createDiv({ cls: 'wechat-modal-cover-preview' });

    const updatePreview = () => {
      coverPreview.empty();
      coverPreview.removeClass('has-material-cover');
      if (thumbMediaId) {
        coverPreview.addClass('has-material-cover');
        const materialPreview = coverPreview.createDiv({ cls: 'wechat-modal-cover-material-preview' });
        const materialTitle = materialCover?.name || '素材库封面';
        const imageFrame = materialPreview.createDiv({ cls: 'wechat-modal-cover-material-frame' });
        if (coverBase64) {
          const img = imageFrame.createEl('img', {
            attr: { src: coverBase64, alt: materialTitle },
          });
          img.onerror = () => {
            img.remove();
            imageFrame.addClass('has-image-error');
          };
        } else {
          imageFrame.addClass('has-image-error');
        }
        const meta = materialPreview.createDiv({ cls: 'wechat-modal-cover-material-meta' });
        meta.createEl('span', { text: '素材库' });
        meta.createEl('strong', { text: materialTitle });
        syncBtn.disabled = false;
        syncBtn.setText(getSyncButtonText());
        syncBtn.removeClass('apple-btn-disabled');
      } else if (coverBase64) {
        coverPreview.createEl('img', { attr: { src: coverBase64 } });
        // 有封面 -> 启用同步按钮
        syncBtn.disabled = false;
        syncBtn.setText(getSyncButtonText());
        syncBtn.removeClass('apple-btn-disabled');
      } else {
        // UI 优化：去除 emoji，使用纯净的提示样式 (样式在 CSS 中定义)
        coverPreview.createEl('div', {
          text: '暂无封面',
          cls: 'wechat-modal-no-cover'
        });
        // 无封面 -> 禁用同步按钮
        syncBtn.disabled = true;
        syncBtn.setText('请先设置封面');
        syncBtn.addClass('apple-btn-disabled');
      }
    };

    const coverBtns = coverContent.createDiv({ cls: 'wechat-modal-cover-btns' });
    const uploadBtn = coverBtns.createEl('button', { text: '上传' });
    const selectMaterialBtn = coverBtns.createEl('button', {
      text: '从素材库选择',
      cls: 'wechat-cover-select-material-btn',
    });

    // 摘要设置
    const digestSection = advancedBody.createDiv({ cls: 'wechat-modal-section' });
    digestSection.createEl('label', { text: '文章摘要（可选）', cls: 'wechat-modal-label' });

    // 自动提取文章前 45 字作为默认摘要
    const autoDigest = htmlToText(this.currentHtml || '').replace(/\s+/g, ' ').trim().substring(0, 45);

    // 摘要逻辑：优先使用缓存 -> frontmatter.excerpt -> 自动提取
    const initialDigest = cachedState?.digest !== undefined
      ? cachedState.digest
      : (frontmatterMeta.excerpt || autoDigest);

    const digestInput = /** @type {ObsidianInputLike & { rows: number, maxLength: number }} */ (digestSection.createEl('textarea', {
      cls: 'wechat-modal-digest-input',
      placeholder: '留空则自动提取文章前 45 字'
    }));
    // Explicitly set the value to ensure it renders correctly in the textarea
    digestInput.value = initialDigest;

    digestInput.rows = 3;
    digestInput.setCssStyles({
      width: '100%',
      resize: 'vertical',
    });
    digestInput.maxLength = 120; // 限制最大输入 120 字

    // 字数统计
    const charCount = digestSection.createEl('div', {
      cls: 'wechat-digest-count',
      text: `${digestInput.value.length}/120`,
      style: 'text-align: right; font-size: 11px; color: var(--text-muted); margin-top: 4px; opacity: 0.7;'
    });

    // 实时更新缓存（摘要）
    digestInput.addEventListener('input', () => {
      charCount.setText(`${digestInput.value.length}/120`);
      if (currentPath) {
        const state = this.articleStates.get(currentPath) || {};
        state.digest = digestInput.value.trim(); // 允许为空字符串（代表清空）
        // 如果用户清空了输入框，我们存空字符串，以便下次打开也是空的（还是说回退到 auto?）
        // 逻辑修正：如果用户清空，通常意味着想用默认或不发摘要。这里我们存用户输入的值。
        // 但如果原本逻辑是"空则自动提取"，那这里输入框空的时候，sessionDigest 会变成 autoDigest
        this.articleStates.set(currentPath, { ...state, digest: digestInput.value });
      }
    });

    const draftStatusEl = modal.contentEl.createDiv({ cls: 'wechat-draft-status' });
    const getSyncButtonText = () => (draftAssociation && !forceNewDraft ? '更新草稿' : '开始同步');
    const updateDraftStatusUI = () => {
      if (!draftStatusEl) return;
      draftStatusEl.empty();
      if (!draftAssociation || forceNewDraft) return;

      let confirmUnlink = false;
      const statusText = draftStatusEl.createEl('span', {
        text: '已关联微信草稿，同步将更新该草稿',
      });
      const unlinkBtn = draftStatusEl.createEl('button', {
        text: '取消关联',
        cls: 'wechat-draft-unlink',
      });
      unlinkBtn.onclick = async () => {
        if (!confirmUnlink) {
          confirmUnlink = true;
          draftStatusEl.addClass('is-confirming');
          statusText.setText('再次点击确认取消关联');
          unlinkBtn.setText('确认取消');
          return;
        }
        forceNewDraft = true;
        if (currentPath) {
          clearDraftAssociation(this.plugin.settings, currentPath);
          await this.plugin.saveSettings();
        }
        draftAssociation = null;
        syncBtn.setText(getSyncButtonText());
        updateDraftStatusUI();
      };
    };

    // 操作按钮
    const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const syncBtn = btnRow.createEl('button', { text: getSyncButtonText(), cls: 'mod-cta' });
    // 初始化时就检查状态
    updatePreview();
    updateDraftStatusUI();

    syncBtn.onclick = async () => {
      if (!coverBase64 && !thumbMediaId) {
        new Notice('❌ 请先设置封面图');
        return;
      }
      modal.close();
      this.selectedAccountId = selectedAccountId;
      this.sessionCoverBase64 = coverBase64;
      this.sessionThumbMediaId = thumbMediaId;
      this.sessionDraftMediaId = (!forceNewDraft && draftAssociation?.mediaId) ? draftAssociation.mediaId : '';
      this.sessionDraftIndex = (!forceNewDraft && Number.isInteger(draftAssociation?.index)) ? draftAssociation.index : 0;
      // 传递用户输入的标题，或使用 frontmatter 标题或文件名
      this.sessionTitle = titleInput.value.trim() || frontmatterMeta.title || (activeFile ? activeFile.basename : '无标题文章');
      // 传递用户输入的摘要，或使用自动提取的摘要
      this.sessionDigest = digestInput.value.trim() || autoDigest || '一键同步自 Obsidian';
      await this.onSyncToWechat();
    };

    // 实时更新缓存（封面图） - 需要修改 uploadBtn 的回调逻辑
    uploadBtn.onclick = () => {
      const activeDocument = getActiveDocumentCompat();
      if (!activeDocument) return;
      const input = /** @type {HTMLInputElement} */ (activeDocument.createElement('input'));
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const target = e.target instanceof HTMLInputElement ? e.target : null;
        const file = target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          coverBase64 = typeof event.target?.result === 'string' ? event.target.result : '';
          thumbMediaId = '';
          materialCover = null;
          this.sessionCoverBase64 = coverBase64;
          this.sessionThumbMediaId = '';
          updatePreview();

          // 更新缓存
          if (currentPath) {
            const state = this.articleStates.get(currentPath) || {};
            this.articleStates.set(currentPath, {
              ...state,
              coverBase64: coverBase64,
              thumbMediaId: '',
              materialCover: null,
            });
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    selectMaterialBtn.onclick = async () => {
      const account = getSelectedAccount();
      if (!account) {
        new Notice('请先配置公众号账号');
        return;
      }

      const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
      await this.showMaterialPickerModal(api, (material) => {
        thumbMediaId = material.mediaId;
        coverBase64 = material.url || '';
        materialCover = {
          mediaId: material.mediaId,
          url: material.url || '',
          name: material.name || '',
        };
        this.sessionCoverBase64 = coverBase64;
        this.sessionThumbMediaId = thumbMediaId;
        updatePreview();

        if (currentPath) {
          const state = this.articleStates.get(currentPath) || {};
          this.articleStates.set(currentPath, { ...state, coverBase64, thumbMediaId, materialCover });
        }
      });
    };

    if (shouldOpenModal) modal.open();
  }

  /**
   * @param {WechatAPI} api
   * @param {string} type
   * @param {number} offset
   * @param {number} count
   * @returns {string}
   */
  getWechatMaterialCacheKey(api, type, offset, count) {
    return [
      api?.appId || '',
      api?.proxyUrl || '',
      type || 'image',
      Number(offset) || 0,
      Number(count) || 20,
    ].join('::');
  }

  /**
   * @param {WechatAPI} api
   * @param {string} type
   * @param {number} offset
   * @param {number} count
   * @param {{ forceRefresh?: boolean, ttlMs?: number }} [options]
   * @returns {Promise<WechatMaterialPageLike>}
   */
  async loadWechatMaterialPage(api, type, offset, count, options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 5 * 60 * 1000;
    if (!this.wechatMaterialCache) this.wechatMaterialCache = new Map();

    const key = this.getWechatMaterialCacheKey(api, type, offset, count);
    const cached = this.wechatMaterialCache.get(key);
    const now = Date.now();
    for (const [cacheKey, entry] of this.wechatMaterialCache.entries()) {
      if (!entry || now - entry.cachedAt >= ttlMs) {
        this.wechatMaterialCache.delete(cacheKey);
      }
    }
    if (!forceRefresh && cached && now - cached.cachedAt < ttlMs) {
      return {
        ...cached.data,
        fromCache: true,
      };
    }

    const data = await api.batchGetMaterials(type, offset, count);
    this.wechatMaterialCache.set(key, {
      cachedAt: now,
      data,
    });
    return {
      ...data,
      fromCache: false,
    };
  }

  /**
   * @param {WechatAPI} api
   * @param {(material: WechatMaterialSelectionLike) => unknown} onSelect
   */
  async showMaterialPickerModal(api, onSelect) {
    const modal = createObsidianModal(this.app);
    modal.titleEl.setText('从素材库选择封面');
    modal.modalEl?.addClass('wechat-material-picker-modal');
    modal.contentEl.addClass('wechat-material-picker');

    if (isMobileClient(this.app)) {
      modal.modalEl?.addClass('wechat-material-picker-modal-mobile');
      modal.contentEl.addClass('wechat-material-picker-mobile');
    }

    const pageSize = 12;
    let currentPage = 1;
    let totalCount = 0;
    /** @type {WechatMaterialSelectionLike | null} */
    let selectedItem = null;
    let isLoading = false;

    const toolbar = modal.contentEl.createDiv({ cls: 'wechat-material-toolbar' });
    const refreshBtn = toolbar.createEl('button', { text: '刷新' });
    const toolbarMeta = toolbar.createDiv({ cls: 'wechat-material-toolbar-meta' });
    const countLabel = toolbarMeta.createDiv({ cls: 'wechat-material-count', text: '正在加载素材库...' });
    const cacheLabel = toolbarMeta.createDiv({ cls: 'wechat-material-cache-note' });
    const grid = modal.contentEl.createDiv({ cls: 'wechat-material-grid' });
    const footer = modal.contentEl.createDiv({ cls: 'wechat-material-footer' });
    const pagination = footer.createDiv({ cls: 'wechat-material-pagination' });
    const confirmBtn = footer.createEl('button', { text: '使用这张封面', cls: 'mod-cta wechat-material-confirm' });
    confirmBtn.disabled = true;

    const renderLoadingSkeleton = () => {
      grid.empty();
      grid.addClass('is-loading');
      for (let i = 0; i < pageSize; i += 1) {
        const skeleton = grid.createDiv({ cls: 'wechat-material-skeleton' });
        skeleton.createDiv({ cls: 'wechat-material-skeleton-thumb' });
        skeleton.createDiv({ cls: 'wechat-material-skeleton-name' });
      }
    };

    /**
     * @param {(page: number, options?: { forceRefresh?: boolean }) => Promise<void> | void} loadPage
     */
    const renderPagination = (loadPage) => {
      pagination.empty();
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      if (totalPages <= 1) return;

      const prevBtn = pagination.createEl('button', { text: '上一页', cls: 'wechat-material-page-btn' });
      prevBtn.disabled = currentPage <= 1;
      prevBtn.onclick = () => loadPage(currentPage - 1);

      pagination.createEl('span', {
        text: `第 ${currentPage} / ${totalPages} 页`,
        cls: 'wechat-material-page-label',
      });

      const nextBtn = pagination.createEl('button', { text: '下一页', cls: 'wechat-material-page-btn' });
      nextBtn.disabled = currentPage >= totalPages;
      nextBtn.onclick = () => loadPage(currentPage + 1);
    };

    /**
     * @param {WechatMaterialItemLike[]} items
     */
    const renderItems = (items) => {
      grid.empty();
      grid.removeClass('is-loading');
      if (!items.length) {
        grid.createDiv({ cls: 'wechat-material-empty', text: '素材库中暂无图片素材' });
        return;
      }

      for (const item of items) {
        const mediaId = item.media_id || item.mediaId || '';
        if (!mediaId) continue;
        const cell = grid.createDiv({ cls: 'wechat-material-cell' });
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('title', item.name || '未命名图片');
        const url = item.url || '';
        if (url) {
          const img = cell.createEl('img', {
            attr: { src: url, loading: 'lazy', alt: item.name || '素材图片' },
          });
          img.onerror = () => {
            img.remove();
            cell.createDiv({ cls: 'wechat-material-thumb-fallback', text: item.name || '图片' });
          };
        } else {
          cell.createDiv({ cls: 'wechat-material-thumb-fallback', text: item.name || '图片' });
        }
        cell.createDiv({ cls: 'wechat-material-name', text: item.name || '未命名图片' });
        const selectCell = () => {
          grid.querySelectorAll('.wechat-material-cell.is-selected').forEach((el) => {
            el.removeClass('is-selected');
          });
          cell.addClass('is-selected');
          selectedItem = { mediaId, url, name: item.name || '' };
          confirmBtn.disabled = false;
        };
        cell.onclick = selectCell;
        cell.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectCell();
          }
        };
      }
    };

    /**
     * @param {number} page
     * @param {{ forceRefresh?: boolean }} [options]
     */
    const loadPage = async (page, options = {}) => {
      if (isLoading) return;
      isLoading = true;
      currentPage = Math.max(1, page);
      selectedItem = null;
      confirmBtn.disabled = true;
      pagination.empty();
      countLabel.setText('正在加载素材库...');
      cacheLabel.setText('');
      renderLoadingSkeleton();

      try {
        const offset = (currentPage - 1) * pageSize;
        const data = await this.loadWechatMaterialPage(api, 'image', offset, pageSize, {
          forceRefresh: options.forceRefresh === true,
        });
        totalCount = Number.isFinite(data.total_count) ? data.total_count : 0;
        const items = Array.isArray(data.item) ? data.item : [];
        countLabel.setText(totalCount > 0 ? `共 ${totalCount} 张图片素材` : '暂无图片素材');
        cacheLabel.setText(data.fromCache ? '当前页列表来自缓存' : '');
        renderItems(items);
        renderPagination(loadPage);
      } catch (error) {
        grid.empty();
        grid.removeClass('is-loading');
        countLabel.setText('加载失败');
        grid.createDiv({ cls: 'wechat-material-empty', text: `加载失败：${toReadableError(error).message}` });
      } finally {
        isLoading = false;
      }
    };

    refreshBtn.onclick = () => loadPage(1, { forceRefresh: true });
    confirmBtn.onclick = () => {
      if (!selectedItem) return;
      modal.close();
      onSelect({
        mediaId: selectedItem.mediaId,
        url: selectedItem.url || '',
        name: selectedItem.name || '',
      });
    };

    modal.open();
    modal.modalEl?.addClass('wechat-material-picker-modal');
    await loadPage(1);
  }

  /**
   * @param {unknown} syncId
   * @returns {Promise<boolean>}
   */
  async openWechatsyncTask(syncId) {
    const taskId = String(syncId || '').trim();
    if (!taskId) {
      new Notice('当前任务没有 syncId，请在浏览器插件历史记录中查看最近任务');
      return false;
    }

    const settings = normalizeMultiPlatformSyncSettings(this.plugin.settings.multiPlatformSync);
    const bridge = this.plugin.getWechatSyncBridgeService();
    try {
      await bridge.start();
      if (typeof bridge.waitForConnection === 'function') {
        await bridge.waitForConnection(8000);
      }
      const capabilities = settings.connection.capabilities || {};

      if (capabilities.openSyncTask !== false) {
        try {
          const result = typeof bridge.openSyncTask === 'function'
            ? toRecord(await bridge.openSyncTask(taskId, { timeoutMs: 8000 }))
            : {};
          if (result?.opened !== false) {
            new Notice('已打开浏览器插件任务窗口');
            return true;
          }
        } catch (error) {
          if (!isWechatSyncUnsupportedMethodError(error)) throw error;
          const readableError = toReadableError(error);
          const errorRecord = toRecord(error);
          console.warn('[Wechatsync] openSyncTask failed, falling back to task link', {
            code: errorRecord.code,
            message: readableError.message,
          });
        }
      }

      if (capabilities.getSyncTaskLink !== false) {
        try {
          const linkResult = typeof bridge.getSyncTaskLink === 'function'
            ? toRecord(await bridge.getSyncTaskLink(taskId, { timeoutMs: 5000 }))
            : {};
          const url = String(linkResult?.url || '').trim();
          if (linkResult?.canOpen !== false && url) {
            return this.openExternalUrl(url, { allowExtensionUrls: true });
          }
          if (typeof linkResult?.message === 'string' && linkResult.message) {
            new Notice(linkResult.message, 8000);
            return false;
          }
        } catch (error) {
          if (!isWechatSyncUnsupportedMethodError(error)) throw error;
          const readableError = toReadableError(error);
          const errorRecord = toRecord(error);
          console.warn('[Wechatsync] getSyncTaskLink failed', {
            code: errorRecord.code,
            message: readableError.message,
          });
        }
      }

      new Notice(`请在浏览器插件历史记录中查看任务：${taskId}`, 10000);
      return false;
    } catch (error) {
      const readableError = toReadableError(error);
      const errorRecord = toRecord(error);
      console.error('[Wechatsync] open task failed', {
        syncId: taskId,
        code: errorRecord.code,
        message: readableError.message,
      });
      new Notice(`无法打开浏览器插件任务：${readableError.message}`, 10000);
      return false;
    }
  }

  /**
   * @param {WechatSyncBridgeServiceLike} bridge
   * @param {unknown} syncId
   * @returns {Promise<WechatsyncTaskSnapshotLike | null>}
   */
  async getWechatsyncTaskSnapshot(bridge, syncId) {
    const taskId = String(syncId || '').trim();
    if (!taskId) return null;
    const settings = normalizeMultiPlatformSyncSettings(this.plugin.settings.multiPlatformSync);
    if (!hasWechatSyncCapability(settings, 'getSyncTask')) return null;

    try {
      const task = typeof bridge.getSyncTask === 'function'
        ? toRecord(await bridge.getSyncTask(taskId, { timeoutMs: 5000 }))
        : {};
      if (task?.found === false) return task;
      return Object.keys(task).length ? /** @type {WechatsyncTaskSnapshotLike} */ (task) : null;
    } catch (error) {
      if (isWechatSyncUnsupportedMethodError(error)) return null;
      const readableError = toReadableError(error);
      const errorRecord = toRecord(error);
      console.warn('[Wechatsync] getSyncTask failed after enqueue', {
        syncId: taskId,
        code: errorRecord.code,
        message: readableError.message,
      });
      return null;
    }
  }

  /**
   * @param {{ syncId?: string, title?: string, platforms?: unknown[], task?: WechatsyncTaskSnapshotLike | null, usedFallbackSend?: boolean, quotaResult?: WechatsyncQuotaResultLike | null }} [options]
   */
  showWechatsyncEnqueueAcceptedModal({
    syncId = '',
    title = '',
    platforms = [],
    task = null,
    usedFallbackSend = false,
    quotaResult = null,
  } = {}) {
    const taskId = String(syncId || '').trim();
    const quotaRecord = quotaResult || {};
    const requestedPlatforms = Array.isArray(platforms) ? platforms : [];
    const skippedPlatformIds = parseWechatsyncPlatformIds(Array.isArray(quotaRecord.skippedPlatforms) ? quotaRecord.skippedPlatforms : []);
    const quotaPublishedPlatforms = Array.isArray(quotaRecord.publishedPlatforms) ? quotaRecord.publishedPlatforms : [];
    const quotaPlatforms = Array.isArray(quotaRecord.platforms) ? quotaRecord.platforms : [];
    const publishedPlatformIds = parseWechatsyncPlatformIds(
      quotaPublishedPlatforms.length ? quotaPublishedPlatforms : (quotaPlatforms.length ? quotaPlatforms : requestedPlatforms)
    );
    const skippedPlatformSet = new Set(skippedPlatformIds);
    const publishedPlatformSet = new Set(publishedPlatformIds);
    if (typeof getObsidianModalClass() !== 'function') {
      const syncIdText = taskId ? `（任务 ${taskId}）` : '';
      const fallbackText = usedFallbackSend ? '当前插件未提供任务 ID，' : '';
      const quotaText = skippedPlatformIds.length
        ? `已跳过 ${skippedPlatformIds.length} 个超出今日额度的平台。`
        : '';
      new Notice(`✅ 已发送到浏览器插件${syncIdText}。${fallbackText}${quotaText}请在浏览器插件的历史或目标平台草稿箱查看结果。`, 10000);
      return;
    }

    const modal = createObsidianModal(this.app);
    modal.titleEl.setText('已发送到浏览器插件');
    modal.titleEl.addClass?.('wechat-multiplatform-title');
    modal.contentEl.addClass('wechat-sync-modal');
    modal.contentEl.addClass('wechat-multiplatform-modal');
    modal.contentEl.addClass('wechat-multiplatform-result-modal');
    modal.modalEl?.addClass('wechat-publish-shell');
    modal.modalEl?.addClass('wechat-multiplatform-shell');

    const summary = modal.contentEl.createDiv({
      cls: `wechat-multiplatform-result-summary ${skippedPlatformIds.length ? 'is-warning' : 'is-success'}`,
    });
    const multiPlatformSettings = normalizeMultiPlatformSyncSettings(this.plugin.settings.multiPlatformSync);
    const platformCatalog = getAvailableWechatsyncPlatforms(multiPlatformSettings);
    const platformById = new Map(platformCatalog.map((platform) => [platform.id, platform]));
    /**
     * @param {unknown[]} [items]
     * @param {(item: unknown) => string} [getId]
     * @returns {unknown[]}
     */
    const sortPlatformItems = (items = [], getId = (item) => String(item || '')) => /** @type {unknown[]} */ (sortWechatsyncPlatformItemsForDisplay(Array.isArray(items) ? items : [], {
      bridgeConnected: multiPlatformSettings.connection?.status === 'connected',
      getPlatformId: getId,
      getPlatform: (item) => {
        const id = getId(item);
        return platformById.get(id) || normalizeWechatsyncPlatform(
          item && typeof item === 'object' ? { ...item, id } : { id }
        ) || { id };
      },
    }));
    /** @param {unknown[]} [ids] */
    const formatPlatformNames = (ids = []) => {
      const names = sortPlatformItems(parseWechatsyncPlatformIds(Array.isArray(ids) ? ids : []))
        .map((id) => platformById.get(String(id))?.name || String(id))
        .filter(Boolean);
      return names.length ? names.join('、') : '无';
    };
    summary.createEl('div', {
      cls: 'wechat-multiplatform-result-summary-title',
      text: skippedPlatformIds.length ? '已按免费版额度投递' : '任务已交给浏览器插件',
    });
    summary.createEl('p', {
      text: skippedPlatformIds.length
        ? `已发布到：${formatPlatformNames(publishedPlatformIds)}。跳过 ${skippedPlatformIds.length} 个超出今日额度的平台：${formatPlatformNames(skippedPlatformIds)}。升级 Pro 可发布到全部平台。`
        : (taskId
          ? 'Obsidian 已完成投递，不会长时间等待所有平台完成。后续草稿链接、失败原因和重试请在浏览器插件任务窗口里查看。'
          : '当前插件版本没有返回任务 ID。文章已发送，请在浏览器插件历史记录中查看最近任务。'),
    });

    const list = modal.contentEl.createDiv({ cls: 'wechat-multiplatform-result-list' });
    /** @type {unknown[]} */
    let taskPlatformSource = [];
    if (Array.isArray(task?.platforms) && task.platforms.length) {
      taskPlatformSource = task.platforms;
    } else {
      const queuedPlatformIds = publishedPlatformIds.length ? publishedPlatformIds : requestedPlatforms;
      taskPlatformSource = queuedPlatformIds.map((id) => /** @type {Record<string, unknown>} */ ({ id, status: 'queued' }));
    }
    const rawTaskPlatforms = taskPlatformSource;
    const taskPlatforms = sortPlatformItems(rawTaskPlatforms.filter((item) => {
      const itemRecord = toRecord(item);
      const platformId = parseWechatsyncPlatformIds([itemRecord.id || itemRecord.platform || item])[0] || '';
      if (!platformId) return false;
      if (skippedPlatformSet.has(platformId)) return false;
      if (skippedPlatformSet.size > 0 && publishedPlatformSet.size > 0) {
        return publishedPlatformSet.has(platformId);
      }
      return true;
    }), (item) => {
      const itemRecord = toRecord(item);
      return parseWechatsyncPlatformIds([itemRecord.id || itemRecord.platform || item])[0] || '';
    });

    if (taskId) {
      const taskRow = list.createDiv({ cls: 'wechat-multiplatform-result-row' });
      taskRow.createEl('div', { text: '任务', cls: 'wechat-multiplatform-result-pill is-success' });
      const taskBody = taskRow.createDiv({ cls: 'wechat-multiplatform-result-body' });
      taskBody.createEl('div', {
        text: task?.found === false ? '插件暂未返回任务详情' : (title || task?.title || '多平台发布任务'),
        cls: 'wechat-multiplatform-result-name',
      });
      if (task?.found === false) {
        taskBody.createEl('div', {
          text: '请打开插件历史查看。',
          cls: 'wechat-multiplatform-result-detail',
        });
      }
    }

    for (const item of taskPlatforms) {
      const itemRecord = toRecord(item);
      const platformId = String(itemRecord.id || itemRecord.platform || item || '').trim();
      if (!platformId) continue;
      const platformName = typeof itemRecord.name === 'string' ? itemRecord.name : (platformById.get(platformId)?.name || platformId);
      const row = list.createDiv({ cls: 'wechat-multiplatform-result-row' });
      row.createEl('div', { text: '已投递', cls: 'wechat-multiplatform-result-pill' });
      const body = row.createDiv({ cls: 'wechat-multiplatform-result-body' });
      body.createEl('div', { text: platformName, cls: 'wechat-multiplatform-result-name' });
    }

    for (const platformItem of sortPlatformItems(skippedPlatformIds)) {
      const platformId = String(platformItem || '');
      const platformName = platformById.get(platformId)?.name || platformId;
      const row = list.createDiv({ cls: 'wechat-multiplatform-result-row is-warning' });
      row.createEl('div', {
        text: '已跳过',
        cls: 'wechat-multiplatform-result-pill is-warning',
      });
      const body = row.createDiv({ cls: 'wechat-multiplatform-result-body' });
      body.createEl('div', { text: platformName, cls: 'wechat-multiplatform-result-name' });
      body.createEl('div', {
        text: '免费版每天 3 个平台额度，当前平台未入队。',
        cls: 'wechat-multiplatform-result-detail',
      });
    }

    const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
    if (quotaRecord.quotaBlocked) {
      const upgradeBtn = btnRow.createEl('button', { text: '升级 Pro' });
      upgradeBtn.onclick = () => this.openPublisherProPage();
    }
    const closeBtn = btnRow.createEl('button', { text: '关闭' });
    closeBtn.onclick = () => modal.close();
    if (taskId) {
      const openBtn = btnRow.createEl('button', { text: '查看任务', cls: 'mod-cta' });
      openBtn.onclick = () => {
        this.openWechatsyncTask(taskId);
      };
    }
    modal.open();
  }

  /**
   * @param {{ quotaResult?: WechatsyncQuotaResultLike, requestedPlatformIds?: unknown[] }} [options]
   */
  showMultiPlatformQuotaBlockedModal({ quotaResult = {}, requestedPlatformIds = [] } = {}) {
    const multiPlatformSettings = normalizeMultiPlatformSyncSettings(this.plugin.settings.multiPlatformSync);
    const platformCatalog = getAvailableWechatsyncPlatforms(multiPlatformSettings);
    const platformById = new Map(platformCatalog.map((platform) => [platform.id, platform]));
    const sortPlatformIds = (ids = []) => sortWechatsyncPlatformItemsForDisplay(parseWechatsyncPlatformIds(ids), {
      bridgeConnected: multiPlatformSettings.connection?.status === 'connected',
      getPlatformId: (id) => id,
      getPlatform: (id) => platformById.get(id) || { id },
    });
    const skippedPlatforms = Array.isArray(quotaResult.skippedPlatforms) && quotaResult.skippedPlatforms.length
      ? quotaResult.skippedPlatforms
      : requestedPlatformIds;
    const skippedPlatformIds = parseWechatsyncPlatformIds(skippedPlatforms);
    const formatPlatformNames = (ids = []) => {
      const names = sortPlatformIds(ids)
        .map((id) => platformById.get(id)?.name || id)
        .filter(Boolean);
      return names.length ? names.join('、') : '无';
    };
    const reason = quotaResult?.reason || '';
    const rawMessage = typeof quotaResult?.message === 'string' ? quotaResult.message.trim() : '';
    const legacyQuotaMessage = /单次最多|每次最多|每天最多发布\s*1\s*次|每天最多\s*1\s*次/.test(rawMessage);
    const summaryText = rawMessage && !legacyQuotaMessage
      ? rawMessage
      : '免费版今日平台额度不足，明天 0:00 重置，或升级 Pro。';

    if (typeof getObsidianModalClass() !== 'function') {
      new Notice(summaryText, 10000);
      return;
    }

    const modal = createObsidianModal(this.app);
    modal.titleEl.setText('发布受限');
    modal.titleEl.addClass?.('wechat-multiplatform-title');
    modal.contentEl.addClass('wechat-sync-modal');
    modal.contentEl.addClass('wechat-multiplatform-modal');
    modal.contentEl.addClass('wechat-multiplatform-result-modal');
    modal.modalEl?.addClass('wechat-publish-shell');
    modal.modalEl?.addClass('wechat-multiplatform-shell');

    const summary = modal.contentEl.createDiv({ cls: 'wechat-multiplatform-result-summary is-warning is-quota-blocked' });
    summary.createEl('div', {
      cls: 'wechat-multiplatform-result-summary-title',
      text: reason === 'daily_limit' ? '今日平台额度不足' : '免费版平台额度不足',
    });
    summary.createEl('p', { text: summaryText });
    summary.createEl('div', {
      text: skippedPlatformIds.length
        ? `本次未入队：${formatPlatformNames(skippedPlatformIds)}`
        : '本次未入队：浏览器插件没有返回平台明细。',
      cls: 'wechat-multiplatform-result-detail wechat-multiplatform-quota-platforms',
    });

    const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
    const upgradeBtn = btnRow.createEl('button', { text: '升级 Pro', cls: 'mod-cta' });
    upgradeBtn.onclick = () => this.openPublisherProPage();
    const closeBtn = btnRow.createEl('button', { text: '关闭' });
    closeBtn.onclick = () => modal.close();

    modal.open();
  }

  /**
   * @param {{ results?: WechatsyncPlatformResultLike[], requestedPlatformIds?: unknown[], fatalError?: ReadableErrorLike | null }} [options]
   */
  showMultiPlatformSyncResultModal({ results = [], requestedPlatformIds = [], fatalError = null } = {}) {
    if (typeof getObsidianModalClass() !== 'function') {
      const message = fatalError
        ? `浏览器插件同步失败：${fatalError.message || String(fatalError)}`
        : '同步完成，请在浏览器插件中查看结果';
      new Notice(message, 10000);
      return;
    }

    const modal = createObsidianModal(this.app);
    const mobileSync = isMobileClient(this.app);
    const bridgeSettings = normalizeMultiPlatformSyncSettings(this.plugin.settings.multiPlatformSync);
    const platformCatalog = getAvailableWechatsyncPlatforms(bridgeSettings);
    const platformById = new Map(platformCatalog.map((platform) => [platform.id, platform]));
    const {
      normalizedResults,
      successCount,
      failedResults,
      isAllSuccess,
    } = getMultiPlatformResultSummary(results, requestedPlatformIds, fatalError);

    modal.titleEl.setText('同步结果');
    modal.titleEl.addClass?.('wechat-multiplatform-title');
    modal.contentEl.addClass('wechat-sync-modal');
    modal.contentEl.addClass('wechat-multiplatform-modal');
    modal.contentEl.addClass('wechat-multiplatform-result-modal');
    modal.modalEl?.addClass('wechat-publish-shell');
    modal.modalEl?.addClass('wechat-multiplatform-shell');
    if (mobileSync) {
      modal.contentEl.addClass('wechat-sync-modal-mobile');
      modal.modalEl?.addClass('wechat-sync-shell-mobile');
    }

    /**
     * @param {WechatsyncPlatformResultLike} [result]
     * @returns {string}
     */
    const getPlatformName = (result = {}) => {
      const id = getWechatSyncResultPlatformId(result);
      return result.platformName || result.name || platformById.get(id)?.name || id || '未知平台';
    };

    const summary = modal.contentEl.createDiv({
      cls: `wechat-multiplatform-result-summary ${fatalError ? 'is-error' : (isAllSuccess ? 'is-success' : 'is-warning')}`,
    });
    summary.createEl('div', {
      cls: 'wechat-multiplatform-result-summary-title',
      text: fatalError
        ? '同步没有完成'
        : (isAllSuccess ? '草稿已保存' : '部分平台需要处理'),
    });
    summary.createEl('p', {
      text: fatalError
        ? (fatalError.code === 'SYNC_TIMEOUT'
          ? 'Obsidian 没有等到浏览器插件的最终回调。插件可能仍在后台同步，请先查看插件历史或目标平台草稿箱；之后可以减少平台后重试。'
          : (fatalError.message || '浏览器插件连接中断，请检查插件、连接令牌或浏览器登录态后重试。'))
        : (normalizedResults.length > 0
          ? `${successCount}/${normalizedResults.length} 个平台已保存为草稿。成功的平台可以直接打开草稿检查，失败的平台修复后重新同步。`
          : '请求已发送到浏览器插件。若这里没有返回平台明细，请在浏览器插件中查看结果。'),
    });

    const list = modal.contentEl.createDiv({ cls: 'wechat-multiplatform-result-list' });

    if (fatalError) {
      const row = list.createDiv({ cls: 'wechat-multiplatform-result-row is-error' });
      const body = row.createDiv({ cls: 'wechat-multiplatform-result-body' });
      body.createEl('div', { text: '浏览器插件发布', cls: 'wechat-multiplatform-result-name' });
      body.createEl('div', {
        text: fatalError.code === 'SYNC_TIMEOUT'
          ? '同步请求已超时，暂时无法拿到逐平台进度。请在浏览器插件侧确认是否已经生成草稿。'
          : (fatalError.message || '连接不可用'),
        cls: 'wechat-multiplatform-result-detail',
      });
    } else if (normalizedResults.length === 0) {
      const row = list.createDiv({ cls: 'wechat-multiplatform-result-row' });
      const body = row.createDiv({ cls: 'wechat-multiplatform-result-body' });
      body.createEl('div', { text: '等待插件结果', cls: 'wechat-multiplatform-result-name' });
      body.createEl('div', {
        text: '当前连接没有返回平台明细。请在浏览器插件侧确认草稿是否已生成。',
        cls: 'wechat-multiplatform-result-detail',
      });
    } else {
      const sortedResults = sortWechatsyncPlatformItemsForDisplay(normalizedResults, {
        bridgeConnected: bridgeSettings.connection?.status === 'connected',
        getPlatformId: (result) => getWechatSyncResultPlatformId(result),
        getPlatform: (result) => {
          const id = getWechatSyncResultPlatformId(result);
          return platformById.get(id) || normalizeWechatsyncPlatform({ ...result, id }) || { id };
        },
      });
      for (const result of sortedResults) {
        const draftUrl = getWechatSyncResultUrl(result);
        const errorMessage = getWechatSyncResultError(result);
        const isSuccess = result?.success === true;
        const row = list.createDiv({
          cls: `wechat-multiplatform-result-row ${isSuccess ? 'is-success' : 'is-error'}`,
        });
        row.createEl('div', {
          text: isSuccess ? '成功' : '失败',
          cls: `wechat-multiplatform-result-pill ${isSuccess ? 'is-success' : 'is-error'}`,
        });
        const body = row.createDiv({ cls: 'wechat-multiplatform-result-body' });
        body.createEl('div', {
          text: getPlatformName(result),
          cls: 'wechat-multiplatform-result-name',
        });
        body.createEl('div', {
          text: isSuccess
            ? (draftUrl ? '已保存为草稿，请打开后检查排版并手动发布。' : '已同步成功，请在浏览器插件中查看草稿。')
            : (errorMessage || '同步失败，请修复后重试。'),
          cls: 'wechat-multiplatform-result-detail',
        });
        if (isSuccess && draftUrl) {
          const openBtn = row.createEl('button', {
            text: '打开草稿',
            cls: 'wechat-multiplatform-inline-btn',
          });
          openBtn.onclick = () => this.openExternalUrl(draftUrl);
        }
      }
    }

    const btnRow = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
    if (fatalError || failedResults.length > 0) {
      const retryBtn = btnRow.createEl('button', { text: '重新选择平台' });
      retryBtn.onclick = () => {
        modal.close();
        this.showMultiPlatformSyncModal();
      };
    }
    const closeBtn = btnRow.createEl('button', {
      text: isAllSuccess ? '完成' : '关闭',
      cls: 'mod-cta',
    });
    closeBtn.onclick = () => modal.close();

    modal.open();
  }

  /**
   * @param {Record<string, unknown>} [options]
   * @returns {Promise<unknown>}
   */
  async showMultiPlatformSyncModal(options = {}) {
    return /** @type {Promise<unknown>} */ (showMultiPlatformPublishModal(this, { ...options, obsidianApi }));
  }

  /**
   * @param {{ modal?: ModalLike }} [options]
   */
  showFeishuSyncModal(options = {}) {
    const modal = options.modal || createObsidianModal(this.app);
    const mobileSync = isMobileClient(this.app);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- reason: dynamic modal parameter
    this.preparePublishModalShell(modal, { mode: 'feishu', mobileSync });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- reason: dynamic modal parameter
    const { wechatTab, multiPlatformTab } = this.createPublishModeTabs(modal, 'feishu');
    if (wechatTab) {
      wechatTab.onclick = () => {
        this.showSyncModal({ modal });
      };
    }
    if (multiPlatformTab) {
      multiPlatformTab.onclick = () => {
        this.showMultiPlatformSyncModal({ modal });
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- reason: dynamic modal element
    renderFeishuPublishTab(this, modal, modal.contentEl, { obsidianApi });

    if (!options.modal) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- reason: dynamic modal API call
      modal.open();
    }
  }

  /**
   * 处理同步到微信逻辑
   */
  async onSyncToWechat() {
    const accountRecord = /** @type {unknown} */ (resolveSyncAccount({
      accounts: this.plugin.settings.wechatAccounts || [],
      selectedAccountId: this.selectedAccountId,
      defaultAccountId: this.plugin.settings.defaultAccountId,
    }));
    const account = isRecord(accountRecord) ? /** @type {WechatAccountLike} */ (accountRecord) : null;

    if (!account) {
      this.promptConfigureWechatAccount();
      return;
    }

    if (!this.currentHtml) {
      new Notice(this.getMissingRenderNotice());
      return;
    }

    const notice = new Notice(`🚀 正在使用 ${account.name} 同步...`, 0);
    const activeFile = this.getPublishContextFile();
    const publishMeta = this.getFrontmatterPublishMeta(activeFile);

    try {
      const syncService = /** @type {WechatSyncServiceLike} */ (createWechatSyncService({
        createApi: (appId, appSecret, proxyUrl) => new WechatAPI(appId, appSecret, proxyUrl, this.plugin.settings.clientId),
        srcToBlob: (src) => this.srcToBlob(String(src || '')),
        coverUploadCache: this.coverUploadCache,
        processAllImages: (html, api, progressCallback, options) => this.processAllImages(String(html || ''), api, progressCallback, options),
        processMathFormulas: (html, api, progressCallback) => this.processMathFormulas(String(html || ''), api, progressCallback),
        prepareHtmlForDraft: (html) => this.prepareHtmlForWechatDraft(String(html || '')),
        cleanHtmlForDraft: (html) => this.cleanHtmlForDraft(String(html || '')),
        cleanupConfiguredDirectory: (file) => this.cleanupConfiguredDirectory(isRecord(file) ? /** @type {TFileLike} */ (file) : null),
        getFirstImageFromArticle: () => this.getFirstImageFromArticle(),
      }));

      const result = await syncService.syncToDraft({
        account,
        proxyUrl: this.plugin.settings.proxyUrl,
        currentHtml: this.getCurrentExportHtml() || '',
        activeFile,
        publishMeta,
        sessionTitle: this.sessionTitle,
        sessionCoverBase64: this.sessionCoverBase64 || '',
        sessionThumbMediaId: this.sessionThumbMediaId || '',
        sessionDigest: this.sessionDigest,
        draftMediaId: this.sessionDraftMediaId || '',
        draftIndex: this.sessionDraftIndex || 0,
        onStatus: (stage) => {
          if (stage === 'cover') notice.setMessage('正在处理封面图...');
          if (stage === 'images') notice.setMessage('正在同步正文图片...');
          if (stage === 'math') notice.setMessage('正在转换矢量图/数学公式...');
          if (stage === 'draft') notice.setMessage(this.sessionDraftMediaId ? '正在更新微信草稿...' : '正在发送到微信草稿箱...');
        },
        onImageProgress: (current, total) => {
          notice.setMessage(`正在同步正文图片 (${current}/${total})...`);
        },
        onMathProgress: (current, total) => {
          notice.setMessage(`正在转换矢量图/数学公式 (${current}/${total})...`);
        },
      });

      const { cleanupResult, imageUploadFailures, placeholderImageSources, draftWarnings, mediaId, isUpdate, draftIndex } = result;
      if (activeFile && mediaId) {
        setDraftAssociation(this.plugin.settings, {
          sourcePath: activeFile.path,
          mediaId,
          accountId: account.id || '',
          title: publishMeta.title || activeFile.basename,
          index: draftIndex || 0,
          updatedAt: Date.now(),
        });
        await this.plugin.saveSettings();
      }

      notice.hide();
      new Notice(isUpdate ? '✅ 更新成功！微信草稿已更新' : '✅ 同步成功！请前往微信公众号后台草稿箱查看');
      const failedImageSources = Array.from(new Set([
        ...(Array.isArray(imageUploadFailures) ? imageUploadFailures.map(item => item?.src).filter(Boolean) : []),
        ...(Array.isArray(placeholderImageSources) ? placeholderImageSources.filter(Boolean) : []),
      ]));
      if (failedImageSources.length > 0) {
        const preview = failedImageSources.slice(0, 3).join('、');
        const suffix = failedImageSources.length > 3 ? ` 等 ${failedImageSources.length} 张` : '';
        new Notice(`⚠️ 草稿已创建，但有 ${failedImageSources.length} 张正文图片未同步：${preview}${suffix}。请在微信后台手动补传。`, 10000);
      }
      if (Array.isArray(draftWarnings) && draftWarnings.length > 0) {
        const preview = draftWarnings
          .slice(0, 3)
          .map((item) => `${item?.message || '正文存在可疑内容'}${item?.value ? `：${item.value}` : ''}`)
          .join('；');
        const suffix = draftWarnings.length > 3 ? `；另有 ${draftWarnings.length - 3} 项` : '';
        new Notice(`⚠️ 草稿已创建，但正文检查发现 ${draftWarnings.length} 项提醒：${preview}${suffix}`, 10000);
      }
      if (cleanupResult?.warning) {
        new Notice(`⚠️ 资源清理失败：${cleanupResult.warning}`, 7000);
      }
    } catch (error) {
      notice.hide();
      console.error('Wechat Sync Error:', error);
      const readableError = toReadableError(error);
      const isProxyAuth = readableError.isProxyAuth || /token|服务已于|安全警报/i.test(readableError.message);
      const friendlyMsg = toSyncFriendlyMessage(readableError.message);
      this.showSyncFailureActions(friendlyMsg, {
        isProxyAuth,
        draftAssociation: (this.sessionDraftMediaId && activeFile) ? {
          sourcePath: activeFile.path,
          mediaId: this.sessionDraftMediaId,
          accountId: account.id || '',
        } : null
      });
    }
  }

  /**
   * @param {string} src
   * @returns {unknown | null}
   */
  resolveLocalImageFileForUpload(src) {
    const raw = String(src || '').trim();
    if (!raw || /^(data:|https?:\/\/|app:\/\/|capacitor:\/\/)/i.test(raw)) return null;

    const activeFile = this.getPublishContextFile();
    const sourcePath = activeFile?.path || this.lastResolvedSourcePath || '';
    const decoded = safeDecodeUriText(raw);
    const fromFileUrl = /^file:\/\//i.test(decoded)
      ? getVaultRelativePathFromLocalPath(this.app, getFileUrlLocalPath(decoded))
      : '';

    if (/^file:\/\//i.test(decoded) && !fromFileUrl) {
      throw new Error('只支持读取当前 vault 内的 file:// 图片');
    }

    const lookupSrc = fromFileUrl || decoded;
    try {
      const linked = this.app?.metadataCache?.getFirstLinkpathDest?.(lookupSrc, sourcePath);
      if (linked && typeof linked === 'object' && typeof linked['extension'] === 'string') return linked;
    } catch {
      // Continue with direct path candidates.
    }

    const candidates = [];
    const normalized = normalizeVaultPath(lookupSrc);
    if (normalized) candidates.push(normalized);
    const noteDir = getVaultDirnameFromPath(sourcePath);
    if (normalized && noteDir && !isAbsolutePathLike(normalized)) {
      candidates.push(normalizeVaultPath(`${noteDir}/${normalized}`));
    }

    for (const candidate of Array.from(new Set(candidates))) {
      try {
        const file = this.app?.vault?.getAbstractFileByPath?.(candidate);
        if (file && typeof file === 'object' && typeof file['extension'] === 'string') return file;
      } catch {
        // Try the next candidate.
      }
    }

    return null;
  }

  /**
   * @param {unknown} file
   * @returns {Promise<Blob>}
   */
  async vaultFileToBlob(file) {
    const readBinary = this.app?.vault?.readBinary;
    if (typeof readBinary !== 'function') {
      throw new Error('当前 Obsidian 版本不支持读取本地图片');
    }
    const binary = await readBinary.call(this.app.vault, file);
    const buffer = bufferFromBinary(binary);
    const fileName = typeof file === 'object' && file && typeof file['name'] === 'string'
      ? file['name']
      : (typeof file === 'object' && file && typeof file['path'] === 'string' ? file['path'] : 'image');
    return new Blob([buffer], { type: inferLocalImageMimeType(fileName) });
  }

  /**
   * 将各种形式的 src (Base64, URL, 路径) 转为 Blob
   */
  /**
   * @param {string} src
   * @returns {Promise<Blob>}
   */
  async srcToBlob(src) {
    const localFile = this.resolveLocalImageFileForUpload(src);
    if (localFile) {
      return this.vaultFileToBlob(localFile);
    }

    // Base64/data URL 图片直接本地解析，避免对 data: URL 发起 fetch。
    if (src.startsWith('data:')) {
      return dataUrlToBlob(src);
    }

    // Obsidian 本地资源 (app:// 或 capacitor://) 可以直接 fetch
    if (src.startsWith('app://') || src.startsWith('capacitor://')) {
      const resp = await window.fetch(src);
      return await resp.blob();
    }

    // HTTP/HTTPS 图床链接需要使用 requestUrl 绕过 CORS
    if (src.startsWith('http')) {
      const requestUrl = getObsidianRequestUrl();
      if (typeof requestUrl !== 'function') {
        throw new Error('当前 Obsidian 版本不支持 requestUrl');
      }
      const response = /** @type {{ arrayBuffer?: ArrayBuffer, headers?: Record<string, string> }} */ (await requestUrl({ url: src }));
      // requestUrl 返回 ArrayBuffer，需要转换为 Blob
      const headers = response.headers || {};
      const contentType = headers['content-type'] || headers['Content-Type'] || 'image/jpeg';
      const buffer = response.arrayBuffer instanceof ArrayBuffer ? response.arrayBuffer : new ArrayBuffer(0);
      return new Blob([buffer], { type: contentType });
    }

    throw new Error(`不支持的图片来源或本地图片未找到：${src || '空地址'}`);
  }

  /**
   * 处理 HTML 中的所有图片，上传到微信并替换链接
   * 支持并发上传 (Limit 3) 和进度回调
   */
  /**
   * @param {string} html
   * @param {WechatAPI} api
   * @param {((current: number, total: number) => unknown) | undefined} progressCallback
   * @param {{ accountId?: string, onImageFailure?: (failure: ImageUploadFailureLike) => unknown }} [cacheContext]
   * @returns {Promise<string>}
   */
  async processAllImages(html, api, progressCallback, cacheContext = {}) {
    const accountId = cacheContext?.accountId || '';
    return /** @type {Promise<string>} */ (processAllImagesService({
      html,
      api,
      progressCallback,
      pMap,
      srcToBlob: (src) => this.srcToBlob(String(src || '')),
      imageUploadCache: this.imageUploadCache,
      cacheNamespace: accountId,
      onImageFailure: cacheContext?.onImageFailure,
    }));
  }

  /**
   * 处理 HTML 中的数学公式 (MathJax SVG -> Wechat Image)
   * 解决微信接口内容长度限制问题
   */
  /**
   * @param {string} html
   * @param {WechatAPI} api
   * @param {((current: number, total: number) => unknown) | undefined} progressCallback
   * @returns {Promise<string>}
   */
  async processMathFormulas(html, api, progressCallback) {
    return /** @type {Promise<string>} */ (processMathFormulasService({
      html,
      api,
      progressCallback,
      pMap,
      simpleHash: (value) => this.simpleHash(String(value || '')),
      svgUploadCache: this.svgUploadCache,
      svgToPngBlob: (svgElement, scale) => this.svgToPngBlob(
        svgElement instanceof SVGElement ? svgElement : createFallbackSvgElement(),
        typeof scale === 'number' ? scale : 3
      ),
    }));
  }

  /**
   * 将 SVG 元素转换为高分辨率 PNG Blob
   * 返回: { blob, width, height, style }
   */
  /**
   * @param {SVGElement} svgElement
   * @param {number} [scale]
   * @returns {Promise<{ blob: Blob, width: number, height: number, style?: string }>}
   */
  async svgToPngBlob(svgElement, scale = 3) {
    return rasterizeSvgToPngBlob(svgElement, { scale });
  }

  /**
   * 清理 HTML 以适配微信编辑器
   * 微信编辑器对嵌套列表支持不佳，需要：
   * 1. 处理嵌套列表父级 li 内的段落与行内内容（避免嵌套层级被打散）
   * 2. 将深层嵌套列表转为伪列表（避免微信扁平化）
   * 3. 移除嵌套 ul/ol 的 margin（避免被当成独立块）
   * 4. 移除空的 li 元素和空白文本节点
   */
  /**
   * @param {string} html
   * @returns {string}
   */
  cleanHtmlForDraft(html) {
    return cleanHtmlForDraftService(html);
  }

  // === 设置变更处理 ===
  /**
   * @param {string} value
   * @param {Element} grid
   */
  async onThemeChange(value, grid) {
    this.plugin.settings.theme = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme?.update({ theme: value });
    await this.convertCurrent(true);
  }

  /**
   * @param {string} value
   */
  async onFontFamilyChange(value) {
    this.plugin.settings.fontFamily = value;
    await this.plugin.saveSettings();
    this.theme?.update({ fontFamily: value });
    await this.convertCurrent(true);
  }

  /**
   * @param {number} value
   * @param {Element} grid
   */
  async onFontSizeChange(value, grid) {
    this.plugin.settings.fontSize = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme?.update({ fontSize: value });
    await this.convertCurrent(true);
  }

  /**
   * @param {string} value
   * @param {Element} grid
   */
  async onColorChange(value, grid) {
    this.plugin.settings.themeColor = value;
    await this.plugin.saveSettings();
    this.updateButtonActive(grid, value);
    this.theme?.update({ themeColor: value });

    // 移除：不再更改全局 CSS 变量，保持设置面板 UI 为默认蓝色 (#0071e3)
    // const colorHex = this.theme.getThemeColorValue();
    // this.containerEl.style.setProperty('--apple-accent', colorHex);

    await this.convertCurrent(true);
  }

  /**
   * @param {string} value
   */
  async onQuoteCalloutStyleModeChange(value) {
    const nextValue = value === 'neutral' ? 'neutral' : 'theme';
    this.plugin.settings.quoteCalloutStyleMode = nextValue;
    await this.plugin.saveSettings();
    this.theme?.update({ quoteCalloutStyleMode: nextValue });
    await this.convertCurrent(true);
  }

  /**
   * @param {boolean} checked
   */
  async onMacCodeBlockChange(checked) {
    this.plugin.settings.macCodeBlock = checked;
    await this.plugin.saveSettings();
    this.theme?.update({ macCodeBlock: checked });
    // 重建 converter
    if (this.converter) {
      this.converter.reinit();
      await this.converter.initMarkdownIt();
    }
    await this.convertCurrent(true);
  }

  /**
   * @param {boolean} checked
   */
  async onCodeLineNumberChange(checked) {
    this.plugin.settings.codeLineNumber = checked;
    await this.plugin.saveSettings();
    this.theme?.update({ codeLineNumber: checked });
    // 重建 converter
    if (this.converter) {
      this.converter.reinit();
      await this.converter.initMarkdownIt();
    }
    await this.convertCurrent(true);
  }

  /**
   * @param {Element} grid
   * @param {string | number | boolean} value
   */
  updateButtonActive(grid, value) {
    const buttons = Array.from(grid.querySelectorAll('button'));
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value == value);
    });
  }

  /**
   * @returns {RenderPipelineLike | null}
   */
  getActiveRenderPipeline() {
    return /** @type {RenderPipelineLike | null} */ (this.nativeRenderPipeline);
  }

  /**
   * @param {string} markdown
   * @param {string} sourcePath
   * @returns {Promise<string>}
   */
  async renderMarkdownForPreview(markdown, sourcePath) {
    const pipeline = this.getActiveRenderPipeline();
    if (!pipeline) {
      throw new Error('渲染管线未初始化');
    }
    return pipeline.renderForPreview(markdown, {
      sourcePath,
      settings: this.plugin.settings,
    });
  }

  /**
   * 更新当前文档显示
   */
  updateCurrentDoc() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && this.docTitleText) {
      this.docTitleText.setText(activeView.file.basename);
      this.docTitleText.setCssStyles({ color: 'var(--apple-primary)' }); // 恢复激活色
    } else if (this.lastActiveFile && this.docTitleText) {
      this.docTitleText.setText(this.lastActiveFile.basename);
      this.docTitleText.setCssStyles({ color: 'var(--apple-primary)' });
    } else if (this.docTitleText) {
      this.docTitleText.setText('未选择文档');
      this.docTitleText.setCssStyles({ color: 'var(--apple-tertiary)' }); // 灰色提示
    }
    this.updateAiToolbarState();
  }

  /**
   * 设置占位符
   */
  setPlaceholder() {
    this.previewContainer.empty();
    this.previewContainer.removeClass('apple-has-content'); // 移除内容状态类
    const placeholder = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
    const iconDiv = placeholder.createEl('div', { cls: 'apple-placeholder-icon' });
    this.renderPlaceholderIcon(iconDiv);
    placeholder.createEl('h2', { text: 'Obsidian 发布助手' });
    const content = placeholder.createDiv({ cls: 'apple-placeholder-content' });
    content.createEl('p', {
      text: '当前面板用于预览微信公众号排版。请在左侧编辑器中打开或激活任意 Markdown 笔记以自动加载预览。',
      cls: 'apple-placeholder-desc'
    });
    const steps = content.createEl('div', { cls: 'apple-steps' });
    steps.createEl('div', { text: '1. 打开或点击任意 Markdown 笔记' });
    steps.createEl('div', { text: '2. 预览微信公众号排版' });
    steps.createEl('div', { text: '3. 一键复制或同步到微信、飞书、小红书等平台' });

    content.createEl('p', {
      text: '注：此面板仅预览微信排版。同步至飞书、小红书等平台直接以源 Markdown 笔记为准。',
      cls: 'apple-placeholder-note'
    });
  }

  /**
   * @param {ObsidianElementLike} iconDiv
   * @returns {Promise<void>}
   */
  renderPlaceholderIcon(iconDiv) {
    iconDiv.empty();
    const img = /** @type {ObsidianElementLike & HTMLImageElement} */ (iconDiv.createEl('img', { attr: { alt: 'Obsidian 发布助手' } }));
    img.src = PLACEHOLDER_ICON_DATA_URL;
    img.setCssStyles({
      width: '64px',
      height: '64px',
      display: 'block',
    });
  }

  showRenderFailurePlaceholder(message = '') {
    if (!this.previewContainer || typeof this.previewContainer.createEl !== 'function') return;
    this.previewContainer.empty();
    this.previewContainer.removeClass('apple-has-content');
    const placeholder = this.previewContainer.createEl('div', { cls: 'apple-placeholder' });
    placeholder.createEl('div', { cls: 'apple-placeholder-icon', text: '⚠️' });
    placeholder.createEl('h2', { text: '渲染失败' });
    placeholder.createEl('p', {
      text: '当前文档尚未成功渲染，复制/同步已禁用。请修复后重试。'
    });
    if (message) {
      placeholder.createEl('p', { cls: 'apple-placeholder-note', text: `错误信息：${message}` });
    }
  }

  getMissingRenderNotice() {
    if (this.lastRenderError) {
      return '❌ 当前文档渲染失败，请修复后重试';
    }
    return '⚠️ 请先打开一个文章进行转换';
  }

  /**
   * 转换当前文档
   * @param {boolean} [silent]
   * @param {ConvertCurrentOptionsLike} [options]
   */
  async convertCurrent(silent = false, options = {}) {
    const {
      showLoading = false,
      loadingText = '正在渲染预览...',
      loadingDelay = 0,
      sourceOverride = null,
    } = options;
    const generation = ++this.renderGeneration;
    if (showLoading) {
      this.loadingGeneration = generation;
      if (this.loadingVisibilityTimer) {
        window.clearTimeout(this.loadingVisibilityTimer);
        this.loadingVisibilityTimer = null;
      }
      if (loadingDelay > 0) {
        this.loadingVisibilityTimer = window.setTimeout(() => {
          if (this.loadingGeneration === generation) {
            this.setPreviewLoading(true, loadingText);
          }
          this.loadingVisibilityTimer = null;
        }, loadingDelay);
      } else {
        this.setPreviewLoading(true, loadingText);
      }
    }
    /** @type {MarkdownSourceResultLike} */
    const source = sourceOverride && typeof sourceOverride === 'object'
      ? {
        ok: true,
        markdown: typeof sourceOverride.markdown === 'string' ? sourceOverride.markdown : '',
        sourcePath: typeof sourceOverride.sourcePath === 'string' ? sourceOverride.sourcePath : '',
      }
      : /** @type {MarkdownSourceResultLike} */ (await resolveMarkdownSource({
        app: this.app,
        lastActiveFile: this.lastActiveFile,
        MarkdownViewType: MarkdownView,
      }));

    let markdown = '';
    let sourcePath = '';
    if (source.ok) {
      markdown = source.markdown || '';
      sourcePath = source.sourcePath || '';
    } else if (this.lastResolvedMarkdown.trim()) {
      markdown = this.lastResolvedMarkdown;
      sourcePath = this.lastResolvedSourcePath || '';
    } else {
      if (!silent) new Notice('请先打开一个 Markdown 文件');
      if (showLoading && this.loadingGeneration === generation) {
        if (this.loadingVisibilityTimer) {
          window.clearTimeout(this.loadingVisibilityTimer);
          this.loadingVisibilityTimer = null;
        }
        this.setPreviewLoading(false);
      }
      return;
    }

    if (!markdown.trim()) {
      if (!silent) new Notice('当前文件内容为空');
      this.completeAiLayoutSourceSwitch(sourcePath);
      if (showLoading && this.loadingGeneration === generation) {
        if (this.loadingVisibilityTimer) {
          window.clearTimeout(this.loadingVisibilityTimer);
          this.loadingVisibilityTimer = null;
        }
        this.setPreviewLoading(false);
      }
      return;
    }

    try {
      if (!silent) new Notice('⚡ 正在转换...');
      const html = await this.renderMarkdownForPreview(markdown, sourcePath);

      if (generation !== this.renderGeneration) return;

      // 只有渲染成功并且仍是最新一轮渲染时，才提交当前文章源。
      // 这样切换文章时 AI 面板不会在渲染中途用临时 hash 误判缓存状态。
      this.lastResolvedMarkdown = markdown;
      this.lastResolvedSourcePath = sourcePath;
      this.lastResolvedSourceHash = String(this.simpleHash(markdown));
      this.completeAiLayoutSourceSwitch(sourcePath);

      this.baseRenderedHtml = html;
      this.currentHtml = html;
      this.lastRenderError = '';
      this.lastRenderFailureNoticeKey = '';
      // 重置手动上传的封面，确保切换文章时不会残留上一篇的封面
      this.sessionCoverBase64 = null;

      // 滚动位置保持 (Scroll Preservation)
      const scrollTop = this.previewContainer.scrollTop;
      setElementHtml(this.previewContainer, html);
      this.previewContainer.scrollTop = scrollTop;

      this.previewContainer.addClass('apple-has-content'); // 添加内容状态类
      this.syncPreviewPresentationMode();
      this.updateCurrentDoc();
      if (this.shouldSyncAiLayoutUi()) {
        const activeSelection = this.getCurrentAiLayoutSelection();
        let layoutState = null;
        if (sourcePath && typeof this.plugin?.getArticleLayoutState === 'function') {
          layoutState = this.plugin.getArticleLayoutState(sourcePath, activeSelection);
        }
        const canReuseAiLayout = !!(
          this.aiPreviewApplied
          && layoutState?.layoutJson?.blocks?.length
          && this.lastResolvedSourceHash
          && layoutState.sourceHash === this.lastResolvedSourceHash
        );
        if (canReuseAiLayout) {
          this.applyAiLayoutToPreview();
        } else if (this.aiPreviewApplied) {
          this.aiPreviewApplied = false;
          this.syncPreviewPresentationMode();
        }
        this.refreshAiLayoutPanel();
      }
      if (!silent) new Notice('✅ 转换成功！');

    } catch (error) {
      console.error('转换失败:', error);
      if (generation !== this.renderGeneration) return;

      this.currentHtml = null;
      this.baseRenderedHtml = null;
      this.aiPreviewApplied = false;
      this.completeAiLayoutSourceSwitch(sourcePath);
      this.syncPreviewPresentationMode();
      this.lastRenderError = toReadableError(error).message || '未知渲染错误';
      this.showRenderFailurePlaceholder(this.lastRenderError);
      this.updateCurrentDoc();
      if (this.shouldSyncAiLayoutUi()) {
        this.refreshAiLayoutPanel();
      }

      const noticeKey = `${sourcePath || ''}:${this.lastRenderError}`;
      if (!silent || this.lastRenderFailureNoticeKey !== noticeKey) {
        new Notice('❌ 转换失败: ' + this.lastRenderError);
        this.lastRenderFailureNoticeKey = noticeKey;
      }
    } finally {
      if (showLoading && this.loadingGeneration === generation) {
        if (this.loadingVisibilityTimer) {
          window.clearTimeout(this.loadingVisibilityTimer);
          this.loadingVisibilityTimer = null;
        }
        this.setPreviewLoading(false);
      }
    }
  }

  /**
   * 视图改变大小时触发 (包括侧边栏展开、Tab切换等导致的大小变化)
   */
  onResize() {
    // ItemView does not provide resize behavior this view relies on; keep handling local.
    // 使用防抖，避免拖动侧边栏时频繁渲染
    if (this.resizeTimeout) window.clearTimeout(this.resizeTimeout);

    // 检查是否可见 (以防万一)
    if (!this.containerEl.offsetParent) return;

    this.resizeTimeout = window.setTimeout(() => {
      this.convertCurrent(true);
    }, 300);
  }

  /**
   * 渲染 HTML
   * @param {string} html
   */
  renderHTML(html) {
    if (!this.previewContainer) return;
    this.previewContainer.empty();
    setElementHtml(this.previewContainer, html);
  }

  /**
   * @param {string} htmlContent
   * @returns {Promise<boolean>}
   */
  async copyRichHTMLByClipboard(htmlContent) {
    if (
      !navigator.clipboard ||
      typeof navigator.clipboard.write !== 'function' ||
      typeof ClipboardItem === 'undefined'
    ) {
      return false;
    }

    const item = new ClipboardItem({
      'text/html': new Blob([htmlContent], { type: 'text/html' }),
    });
    await navigator.clipboard.write([item]);
    return true;
  }

  /**
   * @param {unknown} text
   * @returns {string}
   */
  normalizeClipboardText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {string} icon
   */
  setCopyButtonIcon(icon) {
    if (!this.copyBtn) return;
    this.copyBtn.replaceChildren();
    const setIcon = getObsidianSetIcon();
    if (typeof setIcon === 'function') {
      setIcon(this.copyBtn, icon);
    }
  }

  setCopyButtonSpinner() {
    if (!this.copyBtn) return;
    this.copyBtn.replaceChildren();
    const activeDocument = getActiveDocumentCompat();
    if (!activeDocument) return;
    const spinner = activeDocument.createElement('span');
    spinner.className = 'apple-copy-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    this.copyBtn.appendChild(spinner);
  }

  /**
   * @param {HTMLElement | null} root
   */
  async enhanceHtmlForWechatPublishing(root) {
    if (!root) return;
    const activeDocument = getActiveDocumentCompat();
    /** @type {HTMLElement | null} */
    let mount = null;
    try {
      if (activeDocument?.body && !root.isConnected) {
        mount = activeDocument.createElement('div');
        mount.setCssStyles({
          position: 'fixed',
          left: '-99999px',
          top: '0',
          width: '760px',
          opacity: '0',
          pointerEvents: 'none',
          overflow: 'hidden',
        });
        activeDocument.body.appendChild(mount);
        mount.appendChild(root);
      }
      await convertRenderedMermaidDiagramsToImages(root, {
        simpleHash: (value) => this.simpleHash(String(value || '')),
        mermaidImageCache: this.mermaidImageCache,
      });
      this.transformCodeBlocksForClipboard(root);
    } finally {
      if (mount) {
        mount.remove();
      }
    }
  }

  /**
   * @param {string} html
   * @returns {Promise<string>}
   */
  async prepareHtmlForWechatDraft(html) {
    const tempDiv = createHtmlContainer('div', html || '');
    if (!tempDiv) return '';
    await this.enhanceHtmlForWechatPublishing(tempDiv);
    return tempDiv.innerHTML;
  }

  /**
   * @param {string} html
   * @returns {Promise<string>}
   */
  async prepareHtmlForWechatsyncArticle(html) {
    const tempDiv = createHtmlContainer('div', html || '');
    if (!tempDiv) return '';
    await this.processImagesToDataURL(tempDiv);
    this.transformCodeBlocksForWechatsync(tempDiv);
    return tempDiv.innerHTML;
  }

  // Bridge publish flow only. Unlike prepareHtmlForWechatsyncArticle (which
  // inlines local images as data: URLs for the legacy WeChat clipboard
  // flow), the bridge protocol carries image bytes via assets[] separately.
  // Inlining base64 here would double-encode every local image: once into
  // assets[] (correct), once into content[] (~33% inflated). The latter
  // also breaks retry, because the extension has to redact base64 before
  // persisting history (storage quota), and a redacted data: URL cannot be
  // re-published. So: rewrite app:// img srcs back to asset://<id> using
  // the assets[] metadata resolveArticleImages already produced. Do NOT
  // call processImagesToDataURL.
  /**
   * @param {string} html
   * @param {unknown[]} [assets]
   * @returns {Promise<string>}
   */
  async prepareHtmlForWechatsyncArticleViaBridge(html, assets = []) {
    const mapped = mapAppUrlImagesToAssetUrls(html || '', assets);
    const tempDiv = createHtmlContainer('div', mapped);
    if (!tempDiv) return '';
    this.transformCodeBlocksForWechatsync(tempDiv);
    return tempDiv.innerHTML;
  }

  // Bridge publish flow: produce a small inline JPEG data URL for the
  // cover asset, suitable for direct <img src> use in the extension's
  // popup History list (which cannot resolve asset:// URLs in plain DOM).
  // Budget: longest edge ≤ COVER_THUMBNAIL_MAX_DIM (256px), JPEG quality
  // tries 0.7 → 0.55 → 0.4 until size ≤ COVER_THUMBNAIL_MAX_BYTES (~8KB).
  // Returns '' on any failure — the extension will fall back to its own
  // local-thumbnail path. Never throws into the publish pipeline.
  /**
   * @param {WechatsyncAssetLike | null | undefined} asset
   * @returns {Promise<string>}
   */
  async generateCoverThumbnailFromAsset(asset) {
    try {
      if (!asset || typeof asset !== 'object') return '';
      const base64 = typeof asset.base64 === 'string' ? asset.base64 : '';
      const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType : '';
      if (!base64 || !mimeType) return '';
      // GIFs would lose animation if we re-encode to JPEG; skip and let
      // the extension fall back to its local-thumbnail path (which can
      // keep the first frame). Plugin keeps the implementation small.
      if (mimeType === 'image/gif') return '';

      const sourceDataUrl = `data:${mimeType};base64,${base64}`;
      const image = /** @type {HTMLImageElement} */ (await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image_decode_failed'));
        img.src = sourceDataUrl;
      }));

      const naturalW = image.naturalWidth || image.width || 0;
      const naturalH = image.naturalHeight || image.height || 0;
      if (!naturalW || !naturalH) return '';

      const MAX_DIM = 256;
      const scale = Math.min(1, MAX_DIM / Math.max(naturalW, naturalH));
      const targetW = Math.max(1, Math.round(naturalW * scale));
      const targetH = Math.max(1, Math.round(naturalH * scale));

      const activeDocument = getActiveDocumentCompat();
      if (!activeDocument) return '';
      const canvas = activeDocument.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(image, 0, 0, targetW, targetH);

      const MAX_BYTES = 8 * 1024;
      // The data URL prefix `data:image/jpeg;base64,` adds ~22 bytes; we
      // compare the whole string length against MAX_BYTES, accepting
      // that the prefix counts toward the budget (negligible).
      for (const quality of [0.7, 0.55, 0.4]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (typeof dataUrl === 'string' && dataUrl.length <= MAX_BYTES) {
          return dataUrl;
        }
      }
      // Even the lowest quality is too big; return empty so the
      // extension does the local fallback instead of carrying a payload
      // that bloats `chrome.storage.local`.
      return '';
    } catch (err) {
      console.warn('[Wechatsync] generateCoverThumbnailFromAsset failed', err);
      return '';
    }
  }

  /**
   * @param {Element | null | undefined} block
   * @returns {string}
   */
  extractCodeTextForWechatsync(block) {
    const codePre = block?.querySelector?.('pre');
    if (!codePre) return '';

    const sectionNodes = /** @type {HTMLElement[]} */ (Array.from(codePre.querySelectorAll('section')));
    const codeLinesNode = sectionNodes
      .filter((node) => {
        const style = (node.getAttribute('style') || '').toLowerCase();
        return style.includes('white-space:nowrap') || style.includes('white-space: nowrap');
      })
      .sort((a, b) => {
        /** @param {HTMLElement} node */
        const score = (node) => {
          const html = node.innerHTML || '';
          return (html.includes('<br') ? 10000 : 0) + (node.textContent || '').length;
        };
        return score(b) - score(a);
      })[0];

    if (codeLinesNode) {
      return (codeLinesNode.innerHTML || '')
        .split(/<br\s*\/?>/i)
        .map((lineHtml) => {
          return htmlToText(lineHtml || '').replace(/\u00a0/g, ' ');
        })
        .join('\n');
    }

    const codeEl = codePre.querySelector('code');
    return ((codeEl ? codeEl.textContent : codePre.textContent) || '').replace(/\u00a0/g, ' ');
  }

  /**
   * @param {Element | null} root
   */
  transformCodeBlocksForWechatsync(root) {
    if (!root) return;

    const codeBlocks = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.code-snippet__fix')));
    codeBlocks.forEach((block) => {
      const codeText = this.extractCodeTextForWechatsync(block);

      const activeDocument = getActiveDocumentCompat();
      if (!activeDocument) return;
      const pre = activeDocument.createElement('pre');
      pre.setAttribute('style', [
        'display:block !important',
        'width:100% !important',
        'max-width:100% !important',
        'margin:14px 0 !important',
        'padding:12px 14px !important',
        'box-sizing:border-box !important',
        'background:#f6f8fa !important',
        'border:1px solid #e5e7eb !important',
        'border-radius:8px !important',
        'overflow-x:auto !important',
        'overflow-y:hidden !important',
        '-webkit-overflow-scrolling:touch !important',
        "font-family:'SF Mono',Consolas,Monaco,monospace !important",
        'font-size:13px !important',
        'line-height:1.65 !important',
        'color:#24292f !important',
        'text-indent:0 !important',
        'white-space:pre !important',
      ].join(';'));

      const code = activeDocument.createElement('code');
      code.setAttribute('style', [
        'display:block !important',
        'margin:0 !important',
        'padding:0 !important',
        'background:transparent !important',
        'color:#24292f !important',
        'font:inherit !important',
        'line-height:inherit !important',
        'white-space:pre !important',
        'text-indent:0 !important',
      ].join(';'));
      code.textContent = codeText;
      pre.appendChild(code);
      block.replaceWith(pre);
    });
  }

  /**
   * @param {Element | null} root
   */
  transformCodeBlocksForClipboard(root) {
    if (!root) return;

    const codeBlocks = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.code-snippet__fix')));
    codeBlocks.forEach((block) => {
      const codePre = block.querySelector('pre');
      if (!codePre) return;

      const codeHtml = codePre.innerHTML || '';
      const styleText = block.getAttribute('style') || '';
      const backgroundMatch = styleText.match(/background:([^;!]+)(?:\s*!important)?/i);
      const borderMatch = styleText.match(/border:([^;!]+)(?:\s*!important)?/i);
      const radiusMatch = styleText.match(/border-radius:([^;!]+)(?:\s*!important)?/i);
      const background = backgroundMatch ? backgroundMatch[1].trim() : '#0d1117';
      const border = borderMatch ? borderMatch[1].trim() : '1px solid #30363d';
      const borderRadius = radiusMatch ? radiusMatch[1].trim() : '8px';
      const sectionNodes = /** @type {HTMLElement[]} */ (Array.from(codePre.querySelectorAll('section')));
      const lineNumberColumn = sectionNodes.find((node) => {
        const style = (node.getAttribute('style') || '').toLowerCase();
        return style.includes('border-right') && style.includes('user-select');
      });
      const codeLinesNode = sectionNodes
        .filter((node) => {
          const style = (node.getAttribute('style') || '').toLowerCase();
          return style.includes('white-space:nowrap') || style.includes('white-space: nowrap');
        })
        .sort((a, b) => {
          /** @param {HTMLElement} node */
          const score = (node) => {
            const html = node.innerHTML || '';
            return (html.includes('<br') ? 10000 : 0) + (node.textContent || '').length;
          };
          return score(b) - score(a);
        })[0];
      const codeLinesHtml = codeLinesNode ? codeLinesNode.innerHTML : codeHtml;
      const directMacHeader = Array.from(block.children).find((child) =>
        child !== codePre &&
        !child.querySelector('pre') &&
        child.querySelector('span') &&
        !(child.textContent || '').trim()
      );
      const hasMacHeader = !!directMacHeader;
      const codeLineParts = codeLinesNode
        ? codeLinesHtml.split(/<br\s*\/?>/i)
        : [codeLinesHtml];
      const lineNumberLabels = lineNumberColumn
        ? Array.from(lineNumberColumn.children).map((node) => (node.textContent || '').trim()).filter(Boolean)
        : [];
      const shouldKeepFixedLineNumbers = lineNumberLabels.length > 0 && codeLineParts.length > 0;

      const activeDocument = getActiveDocumentCompat();
      if (!activeDocument) return;
      const pre = activeDocument.createElement('pre');
      pre.setAttribute('class', 'hljs code__pre');
      pre.setAttribute('style', `width:100% !important;max-width:100% !important;margin:12px 0 !important;background:${background} !important;border:${border} !important;border-radius:${borderRadius} !important;box-shadow:0 4px 12px rgba(0,0,0,0.3) !important;overflow-x:auto !important;overflow-y:hidden !important;-webkit-overflow-scrolling:touch !important;box-sizing:border-box !important;font-family:'SF Mono',Consolas,Monaco,monospace !important;font-size:13px !important;line-height:1.75 !important;color:#f0f6fc !important;white-space:normal !important;`);

      if (hasMacHeader) {
        const toolbar = activeDocument.createElement('section');
        const toolbarStyle = 'display:block !important;background:#161b22 !important;padding:6px 10px 6px 10px !important;border:none !important;border-bottom:1px solid #30363d !important;border-radius:8px 8px 0 0 !important;line-height:1 !important;box-sizing:border-box !important;width:100% !important;';
        toolbar.setAttribute('style', toolbarStyle);
        setElementHtml(toolbar, [
        '<span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#ff5f57 !important;margin-right:7px !important;font-size:0 !important;line-height:0 !important;color:transparent !important;vertical-align:top !important;">&nbsp;</span>',
        '<span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#ffbd2e !important;margin-right:7px !important;font-size:0 !important;line-height:0 !important;color:transparent !important;vertical-align:top !important;">&nbsp;</span>',
        '<span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#28c840 !important;font-size:0 !important;line-height:0 !important;color:transparent !important;vertical-align:top !important;">&nbsp;</span>',
      ].join(''));
        pre.appendChild(toolbar);
      }

      const code = activeDocument.createElement('code');
      if (shouldKeepFixedLineNumbers) {
        const lineNumbersHtml = codeLineParts.map((_, index) => {
          const lineNumber = lineNumberLabels[index] || String(index + 1);
          return `<section style="padding:0 10px 0 0 !important;line-height:1.75 !important;color:#95989C !important;">${lineNumber}</section>`;
        }).join('');
        const codeInnerHtml = codeLineParts.map((lineHtml) => lineHtml || '&nbsp;').join('<br/>');
        const codeWithLineNumbersStyle = 'display:block !important;width:100% !important;min-width:100% !important;max-width:100% !important;padding:0 !important;box-sizing:border-box !important;background:transparent !important;color:#f0f6fc !important;font-family:inherit !important;font-size:13px !important;line-height:1.75 !important;white-space:normal !important;overflow:visible !important;text-indent:0 !important;margin:0 !important;';
        code.setAttribute('style', codeWithLineNumbersStyle);
        setElementHtml(code, `<section style="display:flex !important;align-items:flex-start !important;overflow-x:hidden !important;overflow-y:visible !important;width:100% !important;max-width:100% !important;padding:0 !important;box-sizing:border-box !important;margin:0 !important;">
          <section class="line-numbers" style="text-align:right !important;padding:12px 0 !important;border-right:1px solid rgba(255,255,255,0.1) !important;user-select:none !important;background:transparent !important;flex:0 0 auto !important;min-width:3.5em !important;box-sizing:border-box !important;margin:0 !important;">${lineNumbersHtml}</section>
          <section class="code-scroll" style="flex:1 1 auto !important;overflow-x:auto !important;overflow-y:visible !important;-webkit-overflow-scrolling:touch !important;padding:12px 12px 12px 16px !important;min-width:0 !important;box-sizing:border-box !important;margin:0 !important;">
            <section style="white-space:pre !important;min-width:max-content !important;line-height:1.75 !important;font-size:13px !important;margin:0 !important;">${codeInnerHtml}</section>
          </section>
        </section>`);
      } else {
        const codeScrollableStyle = 'display:block !important;width:max-content !important;min-width:100% !important;max-width:none !important;padding:12px !important;box-sizing:border-box !important;background:transparent !important;color:#f0f6fc !important;font-family:inherit !important;font-size:13px !important;line-height:1.75 !important;white-space:nowrap !important;overflow:visible !important;text-indent:0 !important;margin:0 !important;';
        code.setAttribute('style', codeScrollableStyle);
        setElementHtml(code, codeLinesHtml);
      }
      pre.appendChild(code);

      block.replaceWith(pre);
    });
  }

  async readClipboardTextSnapshot() {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      return { supported: false, text: '' };
    }
    try {
      const text = await navigator.clipboard.readText();
      return { supported: true, text: this.normalizeClipboardText(text) };
    } catch {
      return { supported: false, text: '' };
    }
  }


  /**
   * 复制 HTML
   */
  async copyHTML() {
    if (this.isCopying) return;

    if (!this.currentHtml) {
      new Notice(this.getMissingRenderNotice());
      return;
    }

    this.isCopying = true;
    if (this.copyBtn) {
      this.copyBtn.classList.add('is-copying');
      this.setCopyButtonSpinner();
    }

    try {
      const exportHtml = this.getCurrentExportHtml() || this.currentHtml;
      // 创建临时的 DOM 容器来解析和处理图片
      const tempDiv = createHtmlContainer('div', exportHtml);

      // 处理本地图片：转换为 JPEG Base64
      // 返回 true 表示有图片被处理了
      await this.processImagesToDataURL(tempDiv);

      await this.enhanceHtmlForWechatPublishing(tempDiv);

      // 清理 HTML 以适配微信编辑器（处理嵌套列表等）
      const cleanedHtml = this.cleanHtmlForDraft(tempDiv.innerHTML);

      const htmlContent = cleanedHtml;
      window.__OWC_LAST_CLIPBOARD_HTML = htmlContent;
      window.__OWC_LAST_CLIPBOARD_TEXT = htmlToText(cleanedHtml);
      const expectedPlainText = this.normalizeClipboardText(window.__OWC_LAST_CLIPBOARD_TEXT);

      const mobile = isMobileClient(this.app);
      let copied = false;
      try {
        copied = await this.copyRichHTMLByClipboard(htmlContent);
      } catch {
        copied = false;
      }
      if (mobile && copied) {
        const snapshot = await this.readClipboardTextSnapshot();
        copied = snapshot.supported && snapshot.text === expectedPlainText;
      }

      if (!copied) {
        throw new Error('rich copy unavailable');
      }

      // Success Feedback
      new Notice('✅ 已复制公众号格式，请直接粘贴到公众号编辑器');
      if (this.copyBtn) {
         this.copyBtn.classList.remove('is-copying');
         this.setCopyButtonIcon('check'); // 变成对勾图标
         window.setTimeout(() => {
           if (this.copyBtn) {
             this.setCopyButtonIcon('copy'); // 恢复复制图标
           }
         }, 2000);
      }
      return;

    } catch (error) {
      console.error('复制失败:', error);
      new Notice('❌ 复制失败，请使用「发布与分发」发送文章');
      if (this.copyBtn) {
        this.copyBtn.classList.remove('is-copying');
        this.setCopyButtonIcon('copy');
      }
    } finally {
      this.isCopying = false;
    }
  }

  /**
   * 将 HTML 中的本地图片转换为 Base64 (Canvas Compressed)
   */
  /**
   * @param {Element} container
   * @returns {Promise<boolean>}
   */
  async processImagesToDataURL(container) {
    const images = toImageElements(container.querySelectorAll('img'));
    const localImages = images.filter(img => img.src.startsWith('app://') || img.src.startsWith('capacitor://'));

    if (localImages.length === 0) return false;

    // Start time for minimum duration check (prevents UX flicker)
    const startTime = Date.now();

    // 并发控制：3个一组
    const concurrency = 3;
    for (let i = 0; i < localImages.length; i += concurrency) {
      const chunk = localImages.slice(i, i + concurrency);
      await Promise.all(chunk.map(img => this.convertImageToLocally(img)));
    }

    // Calculate elapsed time and wait if needed
    const elapsed = Date.now() - startTime;
    const minDuration = 800; // 800ms minimum duration
    if (elapsed < minDuration) {
      await new Promise(resolve => window.setTimeout(resolve, minDuration - elapsed));
    }

    return true;
  }


  /**
   * @param {HTMLImageElement} img
   * @returns {Promise<void>}
   */
  async convertImageToLocally(img) {
    try {
      // CRITICAL FIX: app:// 资源在 Electron 中可以直接 fetch！
      // 我们不需要反向查找 TFile，直接 fetch(img.src) 拿 blob 即可！
      const response = await window.fetch(img.src);
      const blob = await response.blob();

      // 检查大小警告
      if (blob.size > 10 * 1024 * 1024) {
        new Notice(`⚠️ 发现大图 (${(blob.size / 1024 / 1024).toFixed(1)}MB)，处理可能较慢`, 5000);
      }

      /** @type {string} */
      let dataUrl;
      // GIF Protection: Bypass compression for GIFs to preserve animation
      if (blob.type === 'image/gif') {
        // Direct read for GIF
        dataUrl = await this.blobToDataUrl(blob);
      } else {
        // Compress others (JPG/PNG) to JPEG 80%
        dataUrl = await this.blobToJpegDataUrl(blob);
      }

      img.src = dataUrl;
      // 清除 Obsidian 特有的 dataset 属性，避免干扰
      delete img.dataset.src;
    } catch (error) {
      console.error('Image processing failed:', error);
      // 保持原样，至少不破图（虽然微信会看不到）
    }
  }

  // Helper: Direct Blob to Base64 (for GIFs)
  /**
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  blobToJpegDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        const activeDocument = getActiveDocumentCompat();
        if (!activeDocument) {
          URL.revokeObjectURL(url);
          reject(new Error('Document unavailable'));
          return;
        }
        const canvas = activeDocument.createElement('canvas');
        let width = image.width;
        let height = image.height;

        // Resize slightly if too massive (e.g. > 1920)
        if (width > 1920) {
          height = Math.round(height * (1920 / width));
          width = 1920;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        // Compress to JPEG 80%
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load failed'));
      };
      image.src = url;
    });
  }


  async onClose() {
    if (this.activeLeafRenderTimer) {
      window.clearTimeout(this.activeLeafRenderTimer);
      this.activeLeafRenderTimer = null;
    }
    if (this.loadingVisibilityTimer) {
      window.clearTimeout(this.loadingVisibilityTimer);
      this.loadingVisibilityTimer = null;
    }
    if (this.sidePaddingPreviewTimer) {
      window.clearTimeout(this.sidePaddingPreviewTimer);
      this.sidePaddingPreviewTimer = null;
    }
    if (this.aiLayoutStaleSuppressTimer) {
      window.clearTimeout(this.aiLayoutStaleSuppressTimer);
      this.aiLayoutStaleSuppressTimer = null;
    }
    this.setPreviewLoading(false);

    // 清理滚动监听 (Critical: Fix memory leak)
    if (this.activeEditorScroller && this.editorScrollListener) {
      this.activeEditorScroller.removeEventListener('scroll', this.editorScrollListener);
    }
    if (this.previewContainer && this.previewScrollListener) {
      this.previewContainer.removeEventListener('scroll', this.previewScrollListener);
    }
    if (this.cancelScrollSyncFrame) {
      this.cancelScrollSyncFrame();
      this.cancelScrollSyncFrame = null;
      this.scrollSyncFrame = null;
      this.pendingScrollSyncSource = '';
    }
    this.expectedEditorScrollTop = null;
    this.expectedPreviewScrollTop = null;
    this.previewContainer?.empty();
    this.closeTransientPanels();
    this.aiLayoutBtn = null;
    this.settingsBtn = null;

    // 清理文章状态缓存
    if (this.articleStates) {
      this.articleStates.clear();
    }
    if (this.svgUploadCache) {
      this.svgUploadCache.clear();
    }
    if (this.imageUploadCache) {
      this.imageUploadCache.clear();
    }
    if (this.coverUploadCache) {
      this.coverUploadCache.clear();
    }
    if (this.mermaidImageCache) {
      this.mermaidImageCache.clear();
    }

    console.log('🍎 发布助手面板已关闭');
  }

  /**
   * 简单的字符串哈希函数 (DJB2算法)
   * @param {string} str
   * @returns {number}
   */
  simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
  }
}

/**
 * 📝 Obsidian 发布助手设置面板
 */
class AppleStyleSettingTab extends PluginSettingTab {
  /**
   * @param {AppLike} app
   * @param {AppleStylePluginLike} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    /** @type {AppleStylePluginLike} */
    this.plugin = plugin;
  }

  /**
   * @param {string} vaultPath
   * @returns {string}
   */
  normalizeVaultPath(vaultPath) {
    return normalizeVaultPath(vaultPath);
  }

  /**
   * @param {string} vaultPath
   * @returns {boolean}
   */
  isAbsolutePathLike(vaultPath) {
    return isAbsolutePathLike(vaultPath);
  }

  refreshOpenConverterAiState() {
    const view = /** @type {ConverterViewRefreshLike | null} */ (this.plugin.getConverterView?.() || null);
    if (view && typeof view.updateAiToolbarState === 'function') {
      view.updateAiToolbarState();
    }
    if (view && typeof view.refreshAiLayoutPanel === 'function') {
      view.refreshAiLayoutPanel();
    }
  }

  /**
   * @param {{ title?: string, message?: string, confirmText?: string, cancelText?: string }} options
   * @returns {Promise<boolean>}
   */
  confirmDestructiveAction({ title, message, confirmText = '确认', cancelText = '取消' }) {
    return new Promise((resolve) => {
      const modal = createObsidianModal(this.app);
      let settled = false;
      /** @param {boolean} value */
      const settle = (value) => {
        if (settled) return;
        settled = true;
        modal.close();
        resolve(value);
      };

      modal.titleEl.setText(title || '确认操作');
      const body = modal.contentEl.createDiv({ cls: 'wechat-confirm-modal' });
      body.createEl('p', { text: message || '确定要继续吗？' });
      const actions = modal.contentEl.createDiv({ cls: 'wechat-modal-buttons' });
      actions.createEl('button', { text: cancelText }).onclick = () => settle(false);
      const confirmBtn = actions.createEl('button', { text: confirmText, cls: 'mod-warning' });
      confirmBtn.onclick = () => settle(true);
      const originalOnClose = typeof modal.onClose === 'function'
        ? /** @type {() => void} */ (modal.onClose.bind(modal))
        : null;
      modal.onClose = () => {
        if (originalOnClose) originalOnClose();
        if (!settled) {
          settled = true;
          resolve(false);
        }
      };
      modal.open();
    });
  }

  /** @returns {SettingDefinitionRenderLike[]} */
  getSettingDefinitions() {
    return [{
      name: 'Wechat Converter',
      desc: '微信发布助手设置',
      searchable: false,
      render: () => {
        this.renderSettingsContent();
      },
    }];
  }

  /**
   * @param {ObsidianElementLike} containerEl
   */
  renderGitHubStarBanner(containerEl) {
    const banner = containerEl.createDiv({ cls: 'apple-settings-github-banner' });
    const iconWrap = banner.createDiv({ cls: 'apple-settings-github-icon' });
    const setIcon = getObsidianSetIcon();
    if (typeof setIcon === 'function') {
      setIcon(iconWrap, 'star');
    } else {
      iconWrap.setText('Star');
    }

    const copy = banner.createDiv({ cls: 'apple-settings-github-copy' });
    copy.createEl('div', { text: '喜欢这个插件？', cls: 'apple-settings-github-kicker' });
    copy.createEl('p', {
      text: '在 GitHub 上点个 Star，可以帮更多 Obsidian 创作者发现它。',
      cls: 'apple-settings-github-desc',
    });

    const starButton = banner.createEl('button', {
      text: 'Star on GitHub',
      cls: 'apple-settings-github-button',
    });
    starButton.onclick = () => {
      const openExternalUrl = this.plugin.openExternalUrl;
      if (typeof openExternalUrl === 'function') {
        openExternalUrl.call(this.plugin, GITHUB_REPOSITORY_URL);
      }
    };
  }

  /**
   * @param {ObsidianElementLike} containerEl
   * @param {string} description
   */
  renderSettingsTabIntro(containerEl, description) {
    const intro = containerEl.createDiv({ cls: 'apple-settings-tab-intro' });
    intro.createEl('p', { text: description, cls: 'apple-settings-tab-intro-desc' });
  }

  renderSettingsContent() {
    const { containerEl } = this;
    containerEl.empty();

    this.renderGitHubStarBanner(containerEl);

    // === Tab 导航 ===
    const tabBar = containerEl.createDiv({ cls: 'apple-settings-tabs' });
    const wechatTab = tabBar.createDiv({ cls: 'apple-settings-tab active', text: '微信' });
    const feishuTab = tabBar.createDiv({ cls: 'apple-settings-tab', text: '飞书' });
    const multiTab = tabBar.createDiv({ cls: 'apple-settings-tab apple-settings-tab-multi' });
    multiTab.createSpan({ text: MULTI_PLATFORM_TAB_LABEL, cls: 'apple-settings-tab-label' });

    const wechatContent = containerEl.createDiv({ cls: 'apple-settings-tab-content' });
    const feishuContent = containerEl.createDiv({ cls: 'apple-settings-tab-content' });
    feishuContent.setCssStyles({ display: 'none' });
    const multiContent = containerEl.createDiv({ cls: 'apple-settings-tab-content' });
    multiContent.setCssStyles({ display: 'none' });

    wechatTab.onclick = () => {
      this._activeSettingsTab = 'wechat';
      wechatTab.addClass('active');
      feishuTab.removeClass('active');
      multiTab.removeClass('active');
      wechatContent.setCssStyles({ display: '' });
      feishuContent.setCssStyles({ display: 'none' });
      multiContent.setCssStyles({ display: 'none' });
    };
    feishuTab.onclick = () => {
      this._activeSettingsTab = 'feishu';
      feishuTab.addClass('active');
      wechatTab.removeClass('active');
      multiTab.removeClass('active');
      wechatContent.setCssStyles({ display: 'none' });
      feishuContent.setCssStyles({ display: '' });
      multiContent.setCssStyles({ display: 'none' });
      renderFeishuSettingsTab(this, feishuContent, { obsidianApi });
    };
    multiTab.onclick = () => {
      this._activeSettingsTab = 'multi';
      multiTab.addClass('active');
      wechatTab.removeClass('active');
      feishuTab.removeClass('active');
      wechatContent.setCssStyles({ display: 'none' });
      feishuContent.setCssStyles({ display: 'none' });
      multiContent.setCssStyles({ display: '' });
    };

    // 恢复上次激活的 Tab
    if (this._activeSettingsTab === 'feishu') {
      feishuTab.onclick();
    } else if (this._activeSettingsTab === 'multi') {
      multiTab.onclick();
    }

    // === 微信 Tab ===
    {
      const containerEl = wechatContent;

    this.renderSettingsTabIntro(
      containerEl,
      '配置公众号账号、封面摘要和微信预览相关选项。'
    );

    // 预览模式设置
    new Setting(containerEl)
      .setName('预览模式')
      .setHeading();

    new Setting(containerEl)
      .setName('使用手机仿真框')
      .setDesc('开启后，预览区域将显示为 iPhone X 手机框样式；关闭则恢复为经典全宽预览模式（需重启插件面板生效）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.usePhoneFrame)
        .onChange(async (value) => {
          this.plugin.settings.usePhoneFrame = value;
          await this.plugin.saveSettings();
          new Notice('设置已保存，请关闭并重新打开发布助手面板以生效');
        }));

    // 图片水印设置
    new Setting(containerEl)
      .setName('图片水印')
      .setHeading();

    new Setting(containerEl)
      .setName('启用图片水印')
      .setDesc('在每张图片上方显示头像（需重启插件面板生效）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableWatermark)
        .onChange(async (value) => {
          this.plugin.settings.enableWatermark = value;
          await this.plugin.saveSettings();
          new Notice('设置已保存，请关闭并重新打开发布助手面板以生效');
        }));

    // 本地头像上传
    const uploadSetting = new Setting(containerEl)
      .setName('上传本地头像')
      .setDesc(this.plugin.settings.avatarBase64 ? '✅ 已上传本地头像（优先使用）' : '选择本地图片，转换为 Base64 存储，无需网络请求');

    uploadSetting.addButton(button => button
      .setButtonText(this.plugin.settings.avatarBase64 ? '重新上传' : '选择图片')
      .onClick(() => {
        const activeDocument = getActiveDocumentCompat();
        if (!activeDocument) return;
        const input = activeDocument.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const target = e.target instanceof HTMLInputElement ? e.target : null;
          const file = target?.files?.[0] || null;
          if (!file) return;

          if (file.size > 100 * 1024) {
            new Notice('❌ 图片太大，请选择小于 100KB 的图片');
            return;
          }

          const reader = new FileReader();
          reader.onload = async (event) => {
            const result = event.target?.result;
            this.plugin.settings.avatarBase64 = typeof result === 'string' ? result : '';
            await this.plugin.saveSettings();
            new Notice('✅ 头像已上传');
            refreshSettingTabCompat(this);
          };
          reader.readAsDataURL(file);
        };
        input.click();
      }));

    if (this.plugin.settings.avatarBase64) {
      uploadSetting.addButton((button) => {
        const clearButton = setDestructiveButtonCompat(button.setButtonText('清除'));
        clearButton.onClick(async () => {
            this.plugin.settings.avatarBase64 = '';
            await this.plugin.saveSettings();
            new Notice('已清除本地头像');
            refreshSettingTabCompat(this);
          });
      });
    }

    new Setting(containerEl)
      .setName('头像 URL（备用）')
      .setDesc('如未上传本地头像，将使用此 URL')
      .addText(text => text
        .setPlaceholder('https://example.com/avatar.jpg')
        .setValue(this.plugin.settings.avatarUrl)
        .onChange(async (value) => {
          this.plugin.settings.avatarUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('微信公众号账号')
      .setDesc('请在微信公众号后台 [设置与开发] -> [基本配置] 中获取 AppID 和 AppSecret，并确保已将当前 IP 加入白名单。')
      .setHeading();

    // 账号列表
    const accounts = this.plugin.settings.wechatAccounts || [];
    const defaultId = this.plugin.settings.defaultAccountId;

    if (accounts.length === 0) {
      containerEl.createEl('p', {
        text: '暂无账号，请点击下方按钮添加',
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted); font-style: italic;' }
      });
    } else {
      const listContainer = containerEl.createDiv({ cls: 'wechat-account-list' });

      for (const account of accounts) {
        const isDefault = account.id === defaultId;
        const card = listContainer.createDiv({ cls: 'wechat-account-card' });

        // 账号信息
        const info = card.createDiv({ cls: 'wechat-account-info' });
        const nameRow = info.createDiv({ cls: 'wechat-account-name-row' });
        nameRow.createSpan({ text: account.name, cls: 'wechat-account-name' });
        if (isDefault) {
          nameRow.createSpan({ text: '默认', cls: 'wechat-account-badge' });
        }
        info.createDiv({
          text: `AppID: ${account.appId.substring(0, 8)}...`,
          cls: 'wechat-account-appid'
        });

        // 操作按钮
        const actions = card.createDiv({ cls: 'wechat-account-actions' });

        if (!isDefault) {
          const defaultBtn = actions.createEl('button', { text: '设为默认', cls: 'wechat-btn-small' });
          defaultBtn.onclick = async () => {
            this.plugin.settings.defaultAccountId = account.id;
            await this.plugin.saveSettings();
            refreshSettingTabCompat(this);
          };
        }

        const editBtn = actions.createEl('button', { text: '编辑', cls: 'wechat-btn-small' });
        editBtn.onclick = () => this.showEditAccountModal(account);

        const testBtn = actions.createEl('button', { text: '测试', cls: 'wechat-btn-small wechat-btn-test' });
        testBtn.onclick = async () => {
          testBtn.disabled = true;
          testBtn.textContent = '测试中...';
          try {
            const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
            await api.getAccessToken();
            new Notice(`✅ ${account.name} 连接成功！`);
          } catch (err) {
            new Notice(`❌ ${account.name} 连接失败: ${toReadableError(err).message}`);
          }
          testBtn.disabled = false;
          testBtn.textContent = '测试';
        };

        const deleteBtn = actions.createEl('button', { text: '删除', cls: 'wechat-btn-small wechat-btn-danger' });
        deleteBtn.onclick = async () => {
          const confirmed = await this.confirmDestructiveAction({
            title: '删除公众号账号',
            message: `确定要删除账号 "${account.name}" 吗？`,
            confirmText: '删除',
          });
          if (!confirmed) return;
          this.plugin.settings.wechatAccounts = accounts.filter(a => a.id !== account.id);
          // 如果删除的是默认账号，自动选择第一个
          if (account.id === defaultId && this.plugin.settings.wechatAccounts.length > 0) {
            this.plugin.settings.defaultAccountId = this.plugin.settings.wechatAccounts[0].id;
          } else if (this.plugin.settings.wechatAccounts.length === 0) {
            this.plugin.settings.defaultAccountId = '';
          }
          await this.plugin.saveSettings();
          refreshSettingTabCompat(this);
        };
      }
    }

    // 添加账号按钮
    const addBtnContainer = containerEl.createDiv({ cls: 'wechat-add-account-container' });
    if (accounts.length < MAX_ACCOUNTS) {
      const addBtn = addBtnContainer.createEl('button', {
        text: '+ 添加账号',
        cls: 'wechat-btn-add'
      });
      addBtn.onclick = () => this.showEditAccountModal(null);
    } else {
      addBtnContainer.createEl('p', {
        text: `已达到最大账号数量 (${MAX_ACCOUNTS})`,
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted);' }
      });
    }

    this.renderAiSettingsSection(containerEl);

    // 高级设置
    new Setting(containerEl)
      .setName('高级设置')
      .setHeading();

    new Setting(containerEl)
      .setName('发送成功后自动清理资源')
      .setDesc('默认关闭。开启后会在创建草稿成功后，删除你在下方配置的目录。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cleanupAfterSync)
        .onChange(async (value) => {
          this.plugin.settings.cleanupAfterSync = value;
          await this.plugin.saveSettings();
        }));

    let hasWarnedAbsoluteCleanupPath = false;
    new Setting(containerEl)
      .setName('清理目录')
      .setDesc('填写 vault 内相对路径（不要填 /Users/... 这类绝对路径），支持 {{note}} 占位符，例如 published/{{note}}_img。')
      .addText(text => text
        .setPlaceholder('published/{{note}}_img')
        .setValue(this.plugin.settings.cleanupDirTemplate || '')
        .onChange(async (value) => {
          if (this.isAbsolutePathLike(value)) {
            if (!hasWarnedAbsoluteCleanupPath) {
              new Notice('⚠️ 清理目录请填写 vault 内相对路径，不要使用绝对路径（如 /Users/... 或 C:\\...）');
              hasWarnedAbsoluteCleanupPath = true;
            }
          } else {
            hasWarnedAbsoluteCleanupPath = false;
          }

          const normalized = this.normalizeVaultPath(value);
          this.plugin.settings.cleanupDirTemplate = normalized;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('使用系统回收站')
      .setDesc('开启时优先移动到系统回收站；关闭时直接从 vault 删除。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cleanupUseSystemTrash !== false)
        .onChange(async (value) => {
          this.plugin.settings.cleanupUseSystemTrash = value;
          await this.plugin.saveSettings();
        }));

    let hasWarnedInsecureProxy = false;
    new Setting(containerEl)
      .setName('API 代理地址')
      .setDesc('如果您的网络 IP 经常变化（如多地办公或使用移动热点），可配置代理服务以解决微信 IP 白名单漂移导致的同步失败问题。')
      .addText(text => {
        text
          .setPlaceholder('https://your-proxy.workers.dev')
          .setValue(this.plugin.settings.proxyUrl || '')
          .onChange(async (value) => {
            const trimmedValue = value.trim();
            if (trimmedValue && !trimmedValue.toLowerCase().startsWith('https://')) {
              if (!hasWarnedInsecureProxy) {
                new Notice('⚠️ 安全风险：代理地址必须使用 HTTPS 以保护您的 AppSecret。');
                hasWarnedInsecureProxy = true;
              }
            } else {
              hasWarnedInsecureProxy = false;
            }
            this.plugin.settings.proxyUrl = trimmedValue;
            await this.plugin.saveSettings();
          });
        // 拓宽输入框宽度以完美容纳带 Token 的长 URL，并作安全判定兼容 Mock 环境
        if (text.inputEl && typeof text.inputEl.setAttribute === 'function') {
          text.inputEl.setCssStyles?.({ width: '320px', maxWidth: '100%' });
        }
      });

    // 独立于 Setting 结构之外的说明卡片，自动独占一行并横跨 100% 宽度
    const card = containerEl.createDiv({
      cls: 'wechat-proxy-info-card',
      attr: {
        style: 'margin-top: 8px; margin-bottom: 16px; padding: 12px; border: 1px solid var(--background-modifier-border); border-radius: 6px; background-color: var(--background-primary-alt); font-size: 12px; line-height: 1.6; display: flex; flex-direction: column; gap: 8px;'
      }
    });

    // 1. 官方免自建服务行
    const officialRow = card.createDiv({ attr: { style: 'display: flex; gap: 6px; align-items: flex-start;' } });
    officialRow.createSpan({ text: '💡', attr: { style: 'flex-shrink: 0; line-height: 1.6;' } });
    const officialText = officialRow.createDiv();
    officialText.createEl('strong', {
      text: '官方中转',
      attr: { style: 'color: var(--text-normal); font-weight: 600;' }
    });
    officialText.createSpan({
      text: '：已上线稳定中转代理，彻底解决微信 IP 白名单频繁漂移问题。',
      attr: { style: 'color: var(--text-muted);' }
    });
    officialText.createEl('a', {
      text: '获取官方中转 Token ➔',
      href: 'https://xiaoweibox.top/chats/wechat-proxy-service',
      attr: { style: 'margin-left: 6px; color: var(--text-muted); text-decoration: underline;' }
    });

    // 2. 自建指南行
    const selfHostedRow = card.createDiv({ attr: { style: 'display: flex; gap: 6px; align-items: flex-start;' } });
    selfHostedRow.createSpan({ text: '🛠️', attr: { style: 'flex-shrink: 0; line-height: 1.6;' } });
    const selfHostedText = selfHostedRow.createDiv();
    selfHostedText.createEl('strong', {
      text: '手工自建',
      attr: { style: 'color: var(--text-normal); font-weight: 600;' }
    });
    selfHostedText.createSpan({
      text: '：如果您想拥有完全自主的控制权，也可以基于 Cloudflare Worker 或个人 VPS 自建。',
      attr: { style: 'color: var(--text-muted);' }
    });
    selfHostedText.createEl('a', {
      text: '查看自建部署指南 ➔',
      href: 'https://xiaoweibox.top/chats/wechat-proxy',
      attr: { style: 'margin-left: 6px; color: var(--text-muted); text-decoration: underline;' }
    });

    // 3. 安全与隐私提示
    const securityRow = card.createDiv({ attr: { style: 'display: flex; gap: 6px; align-items: flex-start;' } });
    securityRow.createSpan({ text: '🔒', attr: { style: 'flex-shrink: 0; line-height: 1.6;' } });
    const securityText = securityRow.createDiv();
    securityText.createEl('strong', {
      text: '安全声明',
      attr: { style: 'color: var(--text-warning); font-weight: 600;' }
    });
    securityText.createSpan({
      text: '：代理服务将中转您的请求。请确保使用受信任的代理（自建或官方），以保护 AppSecret 安全。中转服务仅在内存中转发，不存储您的任何敏感凭证。',
      attr: { style: 'color: var(--text-muted);' }
    });

    }

    // === 其他平台 Tab ===
    renderMultiPlatformSettingsTab(this, multiContent, { obsidianApi });
  }

  /**
   * @param {ObsidianElementLike} containerEl
   */
  renderAiSettingsSection(containerEl) {
    new Setting(containerEl)
      .setName('AI 编排')
      .setDesc('管理模型、默认布局、默认颜色和缓存策略。实际生成与应用入口在转换器顶部工具栏的「AI 编排」按钮中。')
      .setHeading();

    new Setting(containerEl)
      .setName('启用 AI 编排')
      .setDesc('关闭后会隐藏右侧工具栏中的 AI 编排入口，但不会删除已经为文章和布局/颜色组合生成过的缓存结果。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ai.enabled === true)
        .onChange(async (value) => {
          this.plugin.settings.ai.enabled = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        }));

    const layoutFamilyOptions = getLayoutFamilyList({ includeAuto: true, includeReserved: false });
    new Setting(containerEl)
      .setName('默认布局')
      .setDesc('打开 AI 编排面板时默认选中的布局。保持“自动推荐”时，AI 会根据文章内容推荐布局风格。')
      .addDropdown((dropdown) => {
        layoutFamilyOptions.forEach((option) => dropdown.addOption(option.value, option.label));
        dropdown.setValue(this.plugin.settings.ai.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO);
        dropdown.onChange(async (value) => {
          this.plugin.settings.ai.defaultLayoutFamily = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        });
      });

    const colorPaletteOptions = getColorPaletteList({ includeAuto: true });
    new Setting(containerEl)
      .setName('默认颜色')
      .setDesc('打开 AI 编排面板时默认选中的颜色。保持“自动推荐”时，AI 会在内置配色方案中推荐一个结果；生成后也可以手动切换颜色复用当前布局。')
      .addDropdown((dropdown) => {
        colorPaletteOptions.forEach((option) => dropdown.addOption(option.value, option.label));
        dropdown.setValue(this.plugin.settings.ai.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO);
        dropdown.onChange(async (value) => {
          this.plugin.settings.ai.defaultColorPalette = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        });
      });

    /** @type {AiProviderLike[]} */
    const providers = this.plugin.settings.ai.providers || [];
    const defaultProviderId = this.plugin.settings.ai.defaultProviderId;
    const runnableProviders = providers.filter((provider) => isAiProviderRunnable(provider) && provider.enabled !== false);

    new Setting(containerEl)
      .setName('默认 AI Provider')
      .setDesc(runnableProviders.length > 0
        ? '生成 AI 编排时会优先使用这里选中的 Provider。'
        : '还没有可直接用于 AI 编排的 Provider，请先补全 Base URL、API Key 和模型。')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '自动选择');
        providers.forEach((provider) => {
          const statusText = summarizeAiProviderIssues(provider);
          dropdown.addOption(provider.id, `${provider.name} (${statusText})`);
        });
        dropdown.setValue(defaultProviderId || '');
        dropdown.onChange(async (value) => {
          this.plugin.settings.ai.defaultProviderId = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        });
      });

    if (providers.length === 0) {
      containerEl.createEl('p', {
        text: '暂无 AI Provider，请点击下方按钮添加',
        cls: 'setting-item-description',
        attr: { style: 'color: var(--text-muted); font-style: italic;' }
      });
    } else {
      const providerList = containerEl.createDiv({ cls: 'wechat-account-list' });
      for (const provider of providers) {
        const isDefault = provider.id === defaultProviderId;
        const providerIssues = getAiProviderIssues(provider);
        const isRunnable = isAiProviderRunnable(provider) && provider.enabled !== false;
        const providerCard = providerList.createDiv({ cls: 'wechat-account-card' });
        const info = providerCard.createDiv({ cls: 'wechat-account-info' });
        const nameRow = info.createDiv({ cls: 'wechat-account-name-row' });
        nameRow.createEl('span', { text: provider.name, cls: 'wechat-account-name' });
        if (isDefault) {
          nameRow.createEl('span', { text: '默认', cls: 'wechat-account-badge' });
        }
        if (provider.enabled === false) {
          nameRow.createEl('span', { text: '已停用', cls: 'wechat-account-badge', attr: { style: 'background: var(--text-faint);' } });
        } else if (isRunnable) {
          nameRow.createEl('span', { text: '可用', cls: 'wechat-account-badge', attr: { style: 'background: #0f8f64;' } });
        } else {
          nameRow.createEl('span', { text: '待补全', cls: 'wechat-account-badge', attr: { style: 'background: #d97706;' } });
        }
        info.createDiv({
          text: `${provider.kind} · ${provider.model || '未设置模型'}`,
          cls: 'wechat-account-appid'
        });
        info.createDiv({
          text: summarizeAiProviderIssues(provider),
          cls: 'wechat-account-appid'
        });

        const actions = providerCard.createDiv({ cls: 'wechat-account-actions' });
        if (!isDefault) {
          const defaultBtn = actions.createEl('button', { text: '设为默认', cls: 'wechat-btn-small' });
          defaultBtn.onclick = async () => {
            this.plugin.settings.ai.defaultProviderId = provider.id;
            await this.plugin.saveSettings();
            this.refreshOpenConverterAiState();
            refreshSettingTabCompat(this);
          };
        }

        const editBtn = actions.createEl('button', { text: '编辑', cls: 'wechat-btn-small' });
        editBtn.onclick = () => this.showEditAiProviderModal(provider);

        const testBtn = actions.createEl('button', { text: '测试', cls: 'wechat-btn-small wechat-btn-test' });
        if (!isRunnable) {
          testBtn.disabled = true;
          testBtn.title = providerIssues.includes('disabled')
            ? '请先启用该 Provider'
            : `当前无法测试：${summarizeAiProviderIssues(provider)}`;
        }
        testBtn.onclick = async () => {
          if (!isRunnable) return;
          testBtn.disabled = true;
          testBtn.textContent = '测试中...';
          try {
            await testAiProviderConnection(provider, createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() }));
            new Notice(`✅ ${provider.name} 连接成功！`);
          } catch (error) {
            new Notice(`❌ ${provider.name} 连接失败: ${toReadableError(error).message}`);
          }
          testBtn.disabled = false;
          testBtn.textContent = '测试';
        };

        const deleteBtn = actions.createEl('button', { text: '删除', cls: 'wechat-btn-small wechat-btn-danger' });
        deleteBtn.onclick = async () => {
          const confirmed = await this.confirmDestructiveAction({
            title: '删除 AI Provider',
            message: `确定要删除 AI Provider "${provider.name}" 吗？`,
            confirmText: '删除',
          });
          if (!confirmed) return;
          this.plugin.settings.ai.providers = providers.filter((item) => item.id !== provider.id);
          if (provider.id === defaultProviderId) {
            const nextRunnableProvider = this.plugin.settings.ai.providers.find((item) => item.enabled !== false && isAiProviderRunnable(item));
            this.plugin.settings.ai.defaultProviderId = nextRunnableProvider?.id || '';
          }
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
          refreshSettingTabCompat(this);
        };
      }
    }

    const addProviderContainer = containerEl.createDiv({ cls: 'wechat-add-account-container' });
    const addProviderBtn = addProviderContainer.createEl('button', {
      text: '+ 添加 AI Provider',
      cls: 'wechat-btn-add'
    });
    addProviderBtn.onclick = () => this.showEditAiProviderModal(null);

    const advancedOptions = containerEl.createEl('details', { cls: 'apple-settings-details' });
    advancedOptions.createEl('summary', {
      cls: 'apple-settings-summary',
      text: 'AI 编排高级选项'
    });
    const advancedArea = advancedOptions.createDiv({ cls: 'apple-settings-area apple-settings-advanced-area' });

    new Setting(advancedArea)
      .setName('编排时参考图片')
      .setDesc('开启后，AI 会把文中的配图和截图作为排版素材参考，但不会直接改写你的正文。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.ai.includeImagesInLayout !== false)
        .onChange(async (value) => {
          this.plugin.settings.ai.includeImagesInLayout = value;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        }));

    new Setting(advancedArea)
      .setName('AI 请求超时（秒）')
      .setDesc('默认 120 秒；较快模型可设 15 到 45 秒，较慢或本地模型建议保持 60 到 120 秒。')
      .addText(text => text
        .setPlaceholder('120')
        .setValue(String(Math.round((this.plugin.settings.ai.requestTimeoutMs || 120000) / 1000)))
        .onChange(async (value) => {
          const seconds = Math.min(180, Math.max(5, parseInt(value || '120', 10) || 120));
          this.plugin.settings.ai.requestTimeoutMs = seconds * 1000;
          await this.plugin.saveSettings();
          this.refreshOpenConverterAiState();
        }));

    const layoutCacheEntries = Object.values(this.plugin.settings.ai.articleLayoutsByPath || {});
    const cachedDocCount = layoutCacheEntries.length;
    const cachedLayoutCount = layoutCacheEntries.reduce((count, entry) => {
      const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
      if (!normalizedEntry) return count;
      return count + Object.keys(normalizedEntry.familyStates || {}).length;
    }, 0);
    const cacheSetting = new Setting(advancedArea)
      .setName('AI 编排缓存')
      .setDesc(cachedLayoutCount > 0
        ? `当前已缓存 ${cachedDocCount} 篇文章、共 ${cachedLayoutCount} 份编排风格结果。`
        : '当前还没有缓存的 AI 编排结果。');

    if (cachedLayoutCount > 0) {
      cacheSetting.addButton((button) => {
        const clearCacheButton = setDestructiveButtonCompat(button.setButtonText('清空缓存'));
        clearCacheButton.onClick(async () => {
            const confirmed = await this.confirmDestructiveAction({
              title: '清空 AI 编排缓存',
              message: `确定要清空 ${cachedDocCount} 篇文章、共 ${cachedLayoutCount} 份 AI 编排缓存吗？`,
              confirmText: '清空',
            });
            if (!confirmed) return;
            this.plugin.settings.ai.articleLayoutsByPath = {};
            await this.plugin.saveSettings();
            this.refreshOpenConverterAiState();
            new Notice('已清空 AI 编排缓存');
            refreshSettingTabCompat(this);
          });
      });
    }
  }

  /**
   * 显示添加/编辑账号的模态框
   */
  /**
   * @param {AiProviderLike | null} provider
   */
  showEditAiProviderModal(provider) {
    const modal = createObsidianModal(this.app);
    modal.titleEl.setText(provider ? '编辑 AI Provider' : '添加 AI Provider');

    const form = modal.contentEl.createDiv();

    const nameGroup = form.createDiv({ cls: 'wechat-form-group' });
    nameGroup.createEl('label', { text: '名称' });
    const nameInput = /** @type {ObsidianInputLike} */ (nameGroup.createEl('input', {
      type: 'text',
      placeholder: '例如：OpenAI / OpenRouter / 自建网关',
      value: provider?.name || ''
    }));

    const kindGroup = form.createDiv({ cls: 'wechat-form-group' });
    kindGroup.createEl('label', { text: '类型' });
    const kindSelectWrap = kindGroup.createDiv({ cls: 'wechat-form-select-wrap' });
    const kindSelect = /** @type {ObsidianInputLike} */ (kindSelectWrap.createEl('select', { cls: 'wechat-form-select' }));
    const providerKinds = [
      { value: AI_PROVIDER_KINDS.OPENAI_COMPATIBLE, label: 'OpenAI 兼容接口' },
      { value: AI_PROVIDER_KINDS.GEMINI, label: 'Gemini 兼容格式' },
      { value: AI_PROVIDER_KINDS.ANTHROPIC, label: 'Anthropic 兼容格式' },
    ];
    providerKinds.forEach((kind) => {
      const option = /** @type {ObsidianInputLike} */ (kindSelect.createEl('option', { value: kind.value, text: kind.label }));
      if ((provider?.kind || AI_PROVIDER_KINDS.OPENAI_COMPATIBLE) === kind.value) {
        option.selected = true;
      }
    });

    const baseUrlGroup = form.createDiv({ cls: 'wechat-form-group' });
    baseUrlGroup.createEl('label', { text: 'Base URL' });
    const baseUrlInput = /** @type {ObsidianInputLike} */ (baseUrlGroup.createEl('input', {
      type: 'text',
      placeholder: 'https://api.openai.com/v1 或 http://localhost:11434/v1',
      value: provider?.baseUrl || 'https://api.openai.com/v1'
    }));

    const apiKeyGroup = form.createDiv({ cls: 'wechat-form-group' });
    apiKeyGroup.createEl('label', { text: 'API Key' });
    const apiKeyInput = /** @type {ObsidianInputLike} */ (apiKeyGroup.createEl('input', {
      type: 'password',
      placeholder: 'sk-...',
      value: provider?.apiKey || ''
    }));

    const modelGroup = form.createDiv({ cls: 'wechat-form-group' });
    modelGroup.createEl('label', { text: '模型' });
    const modelInput = /** @type {ObsidianInputLike} */ (modelGroup.createEl('input', {
      type: 'text',
      placeholder: 'gpt-4.1-mini',
      value: provider?.model || 'gpt-4.1-mini'
    }));

    const applyKindDefaults = () => {
      const kind = kindSelect.value || AI_PROVIDER_KINDS.OPENAI_COMPATIBLE;
      if (kind === AI_PROVIDER_KINDS.GEMINI) {
        baseUrlInput.placeholder = 'https://generativelanguage.googleapis.com/v1beta';
        modelInput.placeholder = 'gemini-2.5-flash';
        if (!provider || provider.kind !== kind) {
          if (!baseUrlInput.value.trim()) baseUrlInput.value = 'https://generativelanguage.googleapis.com/v1beta';
          if (!modelInput.value.trim()) modelInput.value = 'gemini-2.5-flash';
        }
        return;
      }
      if (kind === AI_PROVIDER_KINDS.ANTHROPIC) {
        baseUrlInput.placeholder = 'https://api.anthropic.com/v1';
        modelInput.placeholder = 'claude-3-5-haiku-latest';
        if (!provider || provider.kind !== kind) {
          if (!baseUrlInput.value.trim()) baseUrlInput.value = 'https://api.anthropic.com/v1';
          if (!modelInput.value.trim()) modelInput.value = 'claude-3-5-haiku-latest';
        }
        return;
      }
      baseUrlInput.placeholder = 'https://api.openai.com/v1 或 http://localhost:11434/v1';
      modelInput.placeholder = 'gpt-4.1-mini';
      if (!provider || provider.kind !== kind) {
        if (!baseUrlInput.value.trim()) baseUrlInput.value = 'https://api.openai.com/v1';
        if (!modelInput.value.trim()) modelInput.value = 'gpt-4.1-mini';
      }
    };
    kindSelect.addEventListener('change', applyKindDefaults);
    applyKindDefaults();

    const enabledGroup = form.createDiv({ cls: 'wechat-form-group' });
    enabledGroup.createEl('label', { text: '启用' });
    const enabledWrap = enabledGroup.createDiv({ cls: 'wechat-provider-enabled' });
    const enabledToggle = /** @type {ObsidianInputLike} */ (enabledWrap.createEl('label', { cls: 'apple-toggle' }).createEl('input', {
      type: 'checkbox',
      cls: 'apple-toggle-input',
      checked: provider?.enabled !== false ? true : undefined,
    }));
    enabledToggle.checked = provider?.enabled !== false;
    enabledToggle.parentElement.createEl('span', { cls: 'apple-toggle-slider' });
    enabledWrap.createEl('span', {
      cls: 'wechat-provider-enabled-text',
      text: '保存后可用于 AI 编排和连接测试',
    });

    const btnRow = form.createDiv({ cls: 'wechat-modal-buttons' });
    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const testBtn = btnRow.createEl('button', { text: '测试连接', cls: 'wechat-btn-test' });
    testBtn.onclick = async () => {
      const candidate = normalizeAiProvider({
        id: provider?.id,
        name: nameInput.value.trim() || '未命名 Provider',
        kind: kindSelect.value,
        baseUrl: baseUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        enabled: enabledToggle.checked,
      });
      const issueSummary = summarizeAiProviderIssues(candidate);
      if (!isAiProviderRunnable(candidate)) {
        new Notice(`请先补全 Provider 配置：${issueSummary}`);
        return;
      }
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      try {
        await testAiProviderConnection(candidate, createObsidianFetchAdapter({ requestUrl: getObsidianRequestUrl(), request: getObsidianRequest() }));
        new Notice('✅ AI Provider 连接成功！');
      } catch (error) {
        new Notice(`❌ 连接失败: ${toReadableError(error).message}`);
      }
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    };

    const saveBtn = btnRow.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveBtn.onclick = async () => {
      const nextProvider = normalizeAiProvider({
        id: provider?.id,
        name: nameInput.value.trim() || '未命名 Provider',
        kind: kindSelect.value,
        baseUrl: baseUrlInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        model: modelInput.value.trim(),
        enabled: enabledToggle.checked,
      });

      const issues = getAiProviderIssues(nextProvider).filter((issue) => issue !== 'disabled');
      if (issues.length > 0) {
        new Notice(`请补全 Provider 配置：${summarizeAiProviderIssues(nextProvider)}`);
        return;
      }

      const providers = this.plugin.settings.ai.providers || [];
      if (provider) {
        this.plugin.settings.ai.providers = providers.map((item) => item.id === provider.id ? nextProvider : item);
      } else {
        this.plugin.settings.ai.providers.push(nextProvider);
        if (!this.plugin.settings.ai.defaultProviderId) {
          this.plugin.settings.ai.defaultProviderId = nextProvider.id;
        }
      }

      if (!this.plugin.settings.ai.defaultProviderId && nextProvider.enabled !== false && isAiProviderRunnable(nextProvider)) {
        this.plugin.settings.ai.defaultProviderId = nextProvider.id;
      }

      await this.plugin.saveSettings();
      this.refreshOpenConverterAiState();
      modal.close();
      refreshSettingTabCompat(this);
      new Notice(provider ? '✅ AI Provider 已更新' : '✅ AI Provider 已添加');
    };

    modal.open();
  }

  /**
   * 显示添加/编辑账号的模态框
   */
  /**
   * @param {WechatAccountLike | null} account
   */
  showEditAccountModal(account) {
    const modal = createObsidianModal(this.app);
    modal.titleEl.setText(account ? '编辑账号' : '添加账号');

    const form = modal.contentEl.createDiv();
    const publishDefaults = getWechatAccountPublishOptions(account);

    // 账号名称
    const nameGroup = form.createDiv({ cls: 'wechat-form-group' });
    nameGroup.createEl('label', { text: '账号名称' });
    const nameInput = /** @type {ObsidianInputLike} */ (nameGroup.createEl('input', {
      type: 'text',
      placeholder: '例如：我的公众号',
      value: account?.name || ''
    }));

    // AppID
    const appIdGroup = form.createDiv({ cls: 'wechat-form-group' });
    appIdGroup.createEl('label', { text: 'AppID' });
    const appIdInput = /** @type {ObsidianInputLike} */ (appIdGroup.createEl('input', {
      type: 'text',
      placeholder: 'wx...',
      value: account?.appId || ''
    }));

    // AppSecret
    const secretGroup = form.createDiv({ cls: 'wechat-form-group' });
    secretGroup.createEl('label', { text: 'AppSecret' });
    const secretInput = /** @type {ObsidianInputLike} */ (secretGroup.createEl('input', {
      type: 'password',
      placeholder: '开发者密钥',
      value: account?.appSecret || ''
    }));

    // 默认作者
    const authorGroup = form.createDiv({ cls: 'wechat-form-group' });
    authorGroup.createEl('label', { text: '默认作者（可选）' });
    const authorInput = /** @type {ObsidianInputLike} */ (authorGroup.createEl('input', {
      type: 'text',
      placeholder: '留空则不显示作者',
      value: account?.author || ''
    }));

    const publishOptions = form.createEl('details', { cls: 'wechat-sync-advanced wechat-account-publish-options' });
    publishOptions.createEl('summary', {
      text: '发布选项',
      cls: 'wechat-sync-advanced-summary',
    });
    const publishSection = publishOptions.createDiv({ cls: 'wechat-sync-advanced-body wechat-account-publish-body' });
    publishSection.createEl('div', {
      text: '可为当前公众号预设原文链接与留言相关的默认发布策略。',
      cls: 'wechat-form-help',
    });

    const sourceUrlGroup = publishSection.createDiv({ cls: 'wechat-form-group' });
    sourceUrlGroup.createEl('label', { text: '默认原文链接（可选）' });
    const sourceUrlInput = /** @type {ObsidianInputLike} */ (sourceUrlGroup.createEl('input', {
      type: 'url',
      placeholder: '留空则不同步原文链接',
      value: publishDefaults.contentSourceUrl,
    }));

    const commentGroup = publishSection.createDiv({ cls: 'wechat-form-checkbox-group' });
    const commentLabel = commentGroup.createEl('label', { cls: 'wechat-form-checkbox-label' });
    const commentInput = /** @type {ObsidianInputLike} */ (commentLabel.createEl('input', { type: 'checkbox' }));
    commentInput.checked = publishDefaults.openComment;
    commentLabel.appendText('默认开启留言');

    const fansCommentGroup = publishSection.createDiv({ cls: 'wechat-form-checkbox-group' });
    const fansCommentLabel = fansCommentGroup.createEl('label', { cls: 'wechat-form-checkbox-label' });
    const fansCommentInput = /** @type {ObsidianInputLike} */ (fansCommentLabel.createEl('input', { type: 'checkbox' }));
    fansCommentInput.checked = publishDefaults.openComment && publishDefaults.onlyFansCanComment;
    fansCommentLabel.appendText('默认仅粉丝可留言');
    fansCommentGroup.createEl('div', {
      text: '关闭留言时，此选项不会生效。',
      cls: 'wechat-form-help',
    });

    const syncCommentDependency = () => {
      const enabled = commentInput.checked;
      fansCommentInput.disabled = !enabled;
      fansCommentGroup.toggleClass('is-disabled', !enabled);
      if (!enabled) fansCommentInput.checked = false;
    };
    commentInput.addEventListener('change', syncCommentDependency);
    syncCommentDependency();

    // 按钮区
    const btnRow = form.createDiv({ cls: 'wechat-modal-buttons' });

    const cancelBtn = btnRow.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => modal.close();

    const testBtn = btnRow.createEl('button', { text: '测试连接', cls: 'wechat-btn-test' });
    testBtn.onclick = async () => {
      if (!appIdInput.value || !secretInput.value) {
        new Notice('请填写 AppID 和 AppSecret');
        return;
      }
      testBtn.disabled = true;
      testBtn.textContent = '测试中...';
      try {
        const api = new WechatAPI(appIdInput.value.trim(), secretInput.value.trim(), this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
        await api.getAccessToken();
        new Notice('✅ 连接成功！');
      } catch (err) {
        new Notice(`❌ 连接失败: ${toReadableError(err).message}`);
      }
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    };

    const saveBtn = btnRow.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveBtn.onclick = async () => {
      const name = nameInput.value.trim() || '未命名账号';
      const appId = appIdInput.value.trim();
      const appSecret = secretInput.value.trim();

      if (!appId || !appSecret) {
        new Notice('请填写 AppID 和 AppSecret');
        return;
      }

      const publishOptions = normalizeWechatAccountPublishOptions({
        contentSourceUrl: sourceUrlInput.value,
        openComment: commentInput.checked,
        onlyFansCanComment: fansCommentInput.checked,
      });

      if (account) {
        // 编辑现有账号
        account.name = name;
        account.appId = appId;
        account.appSecret = appSecret;
        account.author = authorInput.value.trim();
        Object.assign(account, publishOptions);
      } else {
        // 添加新账号
        const newAccount = {
          id: generateId(),
          name,
          appId,
          appSecret,
          author: authorInput.value.trim(),
          ...publishOptions,
        };
        this.plugin.settings.wechatAccounts.push(newAccount);
        // 如果是第一个账号，自动设为默认
        if (this.plugin.settings.wechatAccounts.length === 1) {
          this.plugin.settings.defaultAccountId = newAccount.id;
        }
      }

      await this.plugin.saveSettings();
      modal.close();
      refreshSettingTabCompat(this);
      new Notice(account ? '✅ 账号已更新' : '✅ 账号已添加');
    };

    modal.open();
  }
}

AppleStyleSettingTab.prototype[LEGACY_SETTING_RENDER_KEY] = function legacySettingsFallback() {
  this.renderSettingsContent();
};

/**
 * 📝 Obsidian 发布助手主插件
 */
class AppleStylePlugin extends Plugin {
  async onload() {
    console.log('📝 正在加载 Obsidian 发布助手...');
    /** @type {ObsidianApiLike} */
    this.obsidianApi = obsidianApi;

    await this.loadSettings();

    this.registerView(
      APPLE_STYLE_VIEW,
      (leaf) => new AppleStyleView(leaf, this)
    );

    this.addRibbonIcon('wand', APPLE_STYLE_VIEW_TITLE, async () => {
      await this.openConverter();
    });

    this.addCommand({
      id: 'open-apple-converter',
      name: `打开${APPLE_STYLE_VIEW_TITLE}`,
      callback: async () => {
        await this.openConverter();
      },
    });

    this.addCommand({
      id: 'insert-image-swipe-block',
      name: getImageSwipeCommandCopy(this.app, 'image-swipe').name,
      callback: () => {
        this.insertImageSwipeCalloutFromActiveEditor('image-swipe');
      },
    });

    this.addCommand({
      id: 'insert-image-sensitive-block',
      name: getImageSwipeCommandCopy(this.app, 'image-sensitive').name,
      callback: () => {
        this.insertImageSwipeCalloutFromActiveEditor('image-sensitive');
      },
    });


    // Command 'convert-to-apple-style' removed as per user request

    this.addSettingTab(new AppleStyleSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.migrateLegacyConverterLeafTitles().catch((error) => {
        console.warn('同步转换器标题失败:', error);
      });
    });

    if (typeof this.app.vault.on === 'function') {
      this.registerEvent(
        this.app.vault.on('rename', (file, oldPath) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- reason: dynamic plugin settings
          if (this.settings.feishuSync) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- reason: dynamic file rename variables
            const changed = updateFeishuHistoryPath(this.settings.feishuSync, oldPath, file.path);
            if (changed) {
              this.saveSettings().catch((err) => {
                console.error('保存重命名设置失败:', err);
              });
            }
          }
        })
      );
    }

    this.startWechatSyncBridgeInBackground('plugin-load');

    console.log('✅ Obsidian 发布助手加载完成');
  }

  /**
   * @param {string} [type]
   */
  insertImageSwipeCalloutFromActiveEditor(type = 'image-swipe') {
    const activeView = this.app?.workspace?.getActiveViewOfType?.(MarkdownView);
    this.insertImageSwipeCallout(activeView?.editor, type);
  }

  /**
   * @param {EditorLike | null | undefined} editor
   * @param {string} [type]
   */
  insertImageSwipeCallout(editor, type = 'image-swipe') {
    if (!editor || typeof editor.replaceSelection !== 'function') {
      new Notice('请先打开一篇 Markdown 文档');
      return;
    }

    const selectedText = typeof editor.getSelection === 'function' ? editor.getSelection() : '';
    const markdown = createImageSwipeCalloutMarkdown(type, selectedText, this.app);
    editor.replaceSelection(markdown);
    new Notice(getImageSwipeCommandCopy(this.app, type).notice);
  }

  /**
   * @param {ViewStateLike | Record<string, unknown>} [baseState]
   * @param {{ active?: boolean }} [options]
   * @returns {ViewStateLike}
   */
  toConverterViewState(baseState = {}, options = {}) {
    const safeState = (baseState && typeof baseState === 'object') ? baseState : {};
    const shouldActivate = options && typeof options === 'object' && options.active === true;
    return {
      ...safeState,
      type: APPLE_STYLE_VIEW,
      state: (safeState.state && typeof safeState.state === 'object') ? safeState.state : {},
      icon: 'wand',
      title: APPLE_STYLE_VIEW_TITLE,
      active: shouldActivate,
    };
  }

  async migrateLegacyConverterLeafTitles() {
    const leaves = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW);
    if (!Array.isArray(leaves) || leaves.length === 0) return;

    for (const leaf of leaves) {
      const currentViewState = (typeof leaf.getViewState === 'function') ? leaf.getViewState() : null;
      if (!currentViewState || currentViewState.title === APPLE_STYLE_VIEW_TITLE) continue;
      await leaf.setViewState(
        this.toConverterViewState(currentViewState, { active: currentViewState.active === true })
      );
    }
  }

  async openConverter() {
    let leaf = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW)[0];

    if (!leaf) {
      const targetLeaf = isMobileClient(this.app)
        ? (this.app.workspace.getLeaf?.('tab') || this.app.workspace.getLeaf?.(false))
        : this.app.workspace.getRightLeaf(false);

      if (!targetLeaf) return;

      await targetLeaf.setViewState(this.toConverterViewState({}, { active: true }));
      leaf = targetLeaf;
    } else {
      const currentViewState = (typeof leaf.getViewState === 'function') ? leaf.getViewState() : null;
      if (!currentViewState || currentViewState.title !== APPLE_STYLE_VIEW_TITLE) {
        await leaf.setViewState(this.toConverterViewState(currentViewState || {}, { active: true }));
      }
    }

    await revealLeafCompat(this.app.workspace, leaf);
  }

  getConverterView() {
    const leaves = this.app.workspace.getLeavesOfType(APPLE_STYLE_VIEW);
    if (leaves.length > 0) {
      return leaves[0].view;
    }
    return null;
  }

  openExternalUrl(url) {
    const target = String(url || '').trim();
    if (!/^https?:\/\//i.test(target)) return false;
    const view = this.getConverterView?.();
    if (view && typeof view === 'object') {
      const externalLinkView = /** @type {{ openExternalUrl?: unknown }} */ (view);
      const openExternalUrl = externalLinkView.openExternalUrl;
      if (typeof openExternalUrl === 'function') {
        openExternalUrl.call(externalLinkView, target);
        return true;
      }
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
    return false;
  }

  getWechatSyncBridgeService() {
    const pluginSettings = getPluginSettings(this);
    const settings = normalizeMultiPlatformSyncSettings(pluginSettings['multiPlatformSync']);
    const cacheKey = `${settings.port}:${settings.token}:${settings.allowRemote ? 1 : 0}`;
    if (this._wechatSyncBridgeService && this._wechatSyncBridgeCacheKey === cacheKey) {
      return this._wechatSyncBridgeService;
    }

    if (this._wechatSyncBridgeService?.stop) {
      this._wechatSyncBridgeService.stop().catch((error) => {
        console.warn('停止旧浏览器插件连接失败:', error);
      });
    }

    this._wechatSyncBridgeCacheKey = cacheKey;
    this._wechatSyncBridgeService = createWechatSyncBridgeService({
      port: settings.port,
      token: settings.token,
      allowRemote: settings.allowRemote,
      serverVersion: this.manifest?.version || '',
      initialConnectedClients: settings.connectedClients || [],
      onClientRegistryChange: async (clients) => {
        const currentSettings = getPluginSettings(this);
        currentSettings['multiPlatformSync'] = normalizeMultiPlatformSyncSettings({
          ...toRecord(currentSettings['multiPlatformSync']),
          connectedClients: Array.isArray(clients) ? clients : [],
        });
        await this.saveSettings();
        refreshSettingTabCompat(/** @type {SettingTabCompatLike | null | undefined} */ (this.app?.setting?.activeTab));
      },
    });
    return this._wechatSyncBridgeService;
  }

  startWechatSyncBridgeInBackground(reason = 'manual') {
    const pluginSettings = getPluginSettings(this);
    const settings = normalizeMultiPlatformSyncSettings(pluginSettings['multiPlatformSync']);
    if (!settings.enabled) return;

    const bridge = this.getWechatSyncBridgeService();
    bridge.start()
      .then((status) => {
        console.info('[Wechatsync] bridge warm start', {
          reason,
          port: settings.port,
          status,
        });
      })
      .catch((error) => {
        const errorRecord = toRecord(error);
        const readableError = toReadableError(error);
        console.warn('[Wechatsync] bridge warm start failed', {
          reason,
          port: settings.port,
          code: errorRecord.code,
          message: readableError.message,
        });
      });
  }

  async loadSettings() {
    const loadedData = toRecord(await this.loadData());
    const settings = setPluginSettings(this, Object.assign({}, DEFAULT_SETTINGS, loadedData));
    let didMigrate = false;

    if (!settings['clientId']) {
      settings['clientId'] = 'wp_dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      didMigrate = true;
    }

    settings['multiPlatformSync'] = normalizeMultiPlatformSyncSettings(settings['multiPlatformSync']);
    settings['feishuSync'] = normalizeFeishuSyncSettings(settings['feishuSync']);

    const normalizedDraftCache = normalizeDraftCache(settings['draftCache']);
    settings['draftCache'] = normalizedDraftCache.cache;
    if (normalizedDraftCache.changed) {
      didMigrate = true;
    }

    const rawAiSettings = loadedData.ai;
    settings['ai'] = normalizeAiSettings(rawAiSettings || settings['ai'] || {});
    if (rawAiSettings !== undefined) {
      const normalizedRawAi = normalizeAiSettings(toRecord(rawAiSettings));
      if (JSON.stringify(normalizedRawAi) !== JSON.stringify(rawAiSettings)) {
        didMigrate = true;
      }
    }

    // 数据迁移：将旧的单账号格式迁移到新的多账号格式
    if (settings['wechatAppId'] && settings['wechatAccounts'].length === 0) {
      const migratedAccount = {
        id: generateId(),
        name: '我的公众号',
        appId: String(settings['wechatAppId'] || ''),
        appSecret: String(settings['wechatAppSecret'] || ''),
      };
      /** @type {WechatAccountLike[]} */ (settings['wechatAccounts']).push(migratedAccount);
      settings['defaultAccountId'] = migratedAccount.id;
      // 清除旧字段
      settings['wechatAppId'] = '';
      settings['wechatAppSecret'] = '';
      didMigrate = true;
      console.log('✅ 已将旧账号配置迁移到新格式');
    }

    if (Array.isArray(settings['wechatAccounts'])) {
      settings['wechatAccounts'] = /** @type {WechatAccountLike[]} */ (settings['wechatAccounts'].map((account) => {
        if (!isRecord(account)) return /** @type {WechatAccountLike} */ ({ id: '', name: '', appId: '', appSecret: '' });
        const nextAccount = { ...account };
        let changed = false;

        if (Object.prototype.hasOwnProperty.call(nextAccount, 'enableOriginal')) {
          delete nextAccount.enableOriginal;
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextAccount, 'allowReprint')) {
          delete nextAccount.allowReprint;
          changed = true;
        }

        if (changed) {
          didMigrate = true;
        }
        return /** @type {WechatAccountLike} */ (nextAccount);
      }));
    }

    // 数据迁移：旧清理配置 -> cleanupDirTemplate
    const currentTemplate = normalizeVaultPath(settings['cleanupDirTemplate'] || '');
    const legacyRootDir = normalizeVaultPath(settings['cleanupRootDir'] || '');
    const legacyTarget = settings['cleanupTarget'];

    // 仅迁移旧的 folder 模式，避免把 file 模式误迁移成“删目录”
    if (!currentTemplate && legacyRootDir && legacyTarget === 'folder') {
      settings['cleanupDirTemplate'] = `${legacyRootDir}/{{note}}_img`;
      didMigrate = true;
      console.log('✅ 已将旧清理配置迁移为目录模板 cleanupDirTemplate');
    }

    // 清理弃用字段，避免后续歧义
    if (Object.prototype.hasOwnProperty.call(settings, 'cleanupRootDir')) {
      delete settings['cleanupRootDir'];
      didMigrate = true;
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'cleanupTarget')) {
      delete settings['cleanupTarget'];
      didMigrate = true;
    }

    // native-only: 清理已弃用的 legacy/parity 渲染开关
    const deprecatedRenderKeys = [
      'useTripletPipeline',
      'tripletFallbackToPhase2',
      'enforceTripletParity',
      'tripletParityMaxLengthDelta',
      'tripletParityMaxSegmentCount',
      'tripletParityVerboseLog',
      'useNativePipeline',
      'enableLegacyFallback',
      'enforceNativeParity',
    ];
    for (const key of deprecatedRenderKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        delete settings[key];
        didMigrate = true;
      }
    }

    if (didMigrate) {
      await this.saveSettings();
    }
  }

  getArticleLayoutState(sourcePath = '', selection = {}) {
    const normalizedPath = normalizeVaultPath(sourcePath || '');
    if (!normalizedPath) return null;
    const pluginSettings = getPluginSettings(this);
    const aiSettings = normalizeAiSettings(toRecord(pluginSettings['ai']));
    const articleLayoutsByPath = toRecord(aiSettings.articleLayoutsByPath);
    const entry = articleLayoutsByPath[normalizedPath] || null;
    const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
    if (!normalizedEntry) return null;
    if (!selection || Object.keys(selection).length === 0) {
      const familyStates = toAiLayoutFamilyStates(normalizedEntry.familyStates);
      return familyStates[normalizedEntry.lastLayoutFamily] || null;
    }
    return toAiLayoutState(getArticleLayoutSelectionState(normalizedEntry, toAiLayoutSelection(selection), {
      layoutFamily: aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
      colorPalette: aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
    }));
  }

  async saveArticleLayoutState(sourcePath = '', nextState = null, selection = {}) {
    const normalizedPath = normalizeVaultPath(sourcePath || '');
    if (!normalizedPath) return false;
    const pluginSettings = getPluginSettings(this);
    if (!pluginSettings['ai']) {
      pluginSettings['ai'] = createDefaultAiSettings();
    }
    const aiSettings = /** @type {AiSettingsLike} */ (pluginSettings['ai']);
    if (!isRecord(aiSettings.articleLayoutsByPath)) {
      aiSettings.articleLayoutsByPath = {};
    }
    const articleLayoutsByPath = /** @type {Record<string, unknown>} */ (aiSettings.articleLayoutsByPath);
    const existingEntry = normalizeArticleLayoutCacheEntry(articleLayoutsByPath[normalizedPath]) || {
      lastLayoutFamily: '',
      lastAutoResolvedFamily: '',
      familyStates: {},
    };
    const existingFamilyStates = toAiLayoutFamilyStates(existingEntry.familyStates);
    existingEntry.familyStates = existingFamilyStates;
    const nextLayoutState = toAiLayoutState(nextState);
    const hasExplicitSelection = typeof selection === 'string'
      || (selection && typeof selection === 'object' && Object.keys(selection).length > 0);
    const requestedSelection = normalizeLayoutSelection(
      nextLayoutState?.selection || (hasExplicitSelection ? toAiLayoutSelection(selection) : null) || {
        layoutFamily: nextLayoutState?.layoutFamily || nextLayoutState?.resolved?.layoutFamily,
        colorPalette: nextLayoutState?.stylePack || nextLayoutState?.resolved?.colorPalette || nextLayoutState?.layoutJson?.stylePack,
      },
      {
        layoutFamily: aiSettings.defaultLayoutFamily || AI_LAYOUT_SELECTION_AUTO,
        colorPalette: aiSettings.defaultColorPalette || AI_LAYOUT_SELECTION_AUTO,
      }
    );
    const getCacheFamily = (state = null) => {
      const stateRecord = toAiLayoutState(state);
      const normalizedState = normalizeArticleLayoutState(stateRecord || {});
      const rawFamily = normalizedState?.resolved?.layoutFamily
        || normalizedState?.layoutFamily
        || stateRecord?.resolved?.layoutFamily
        || stateRecord?.layoutFamily
        || (requestedSelection.layoutFamily !== AI_LAYOUT_SELECTION_AUTO ? requestedSelection.layoutFamily : '');
      const normalizedFamily = normalizeLayoutSelection({ layoutFamily: rawFamily }).layoutFamily;
      return normalizedFamily === AI_LAYOUT_SELECTION_AUTO ? '' : normalizedFamily;
    };
    const effectiveLayoutFamily = getCacheFamily(nextLayoutState);

    if (!nextLayoutState) {
      if (selection && Object.keys(selection).length && effectiveLayoutFamily) {
        delete existingFamilyStates[effectiveLayoutFamily];
        const remainingFamilies = Object.keys(existingFamilyStates);
        if (!remainingFamilies.length) {
          delete articleLayoutsByPath[normalizedPath];
        } else {
          existingEntry.lastLayoutFamily = existingFamilyStates[existingEntry.lastLayoutFamily]
            ? existingEntry.lastLayoutFamily
            : remainingFamilies[0];
          if (existingEntry.lastAutoResolvedFamily && !existingFamilyStates[existingEntry.lastAutoResolvedFamily]) {
            existingEntry.lastAutoResolvedFamily = '';
          }
          articleLayoutsByPath[normalizedPath] = normalizeArticleLayoutCacheEntry(existingEntry) || existingEntry;
        }
      } else {
        delete articleLayoutsByPath[normalizedPath];
      }
    } else {
      const resolvedLayoutFamily = effectiveLayoutFamily || 'source-first';
      const inferredSkillId = nextLayoutState.skillId
        || resolvedLayoutFamily
        || requestedSelection.layoutFamily;
      const inferredSkillVersion = nextLayoutState.skillVersion
        || nextLayoutState.generationMeta?.skillVersion
        || getLayoutFamilyById(inferredSkillId)?.version
        || '';
      existingFamilyStates[resolvedLayoutFamily] = {
        ...nextLayoutState,
        skillId: inferredSkillId,
        skillVersion: inferredSkillVersion,
        selection: requestedSelection,
        resolved: {
          ...(nextLayoutState.resolved || {}),
          layoutFamily: resolvedLayoutFamily,
          colorPalette: nextLayoutState.stylePack || nextLayoutState.resolved?.colorPalette || 'tech-green',
        },
        layoutFamily: resolvedLayoutFamily,
        stylePack: nextLayoutState.stylePack || nextLayoutState.resolved?.colorPalette || 'tech-green',
      };
      existingEntry.lastLayoutFamily = resolvedLayoutFamily;
      if (requestedSelection.layoutFamily === AI_LAYOUT_SELECTION_AUTO) {
        existingEntry.lastAutoResolvedFamily = resolvedLayoutFamily;
      }
      articleLayoutsByPath[normalizedPath] = normalizeArticleLayoutCacheEntry(existingEntry) || existingEntry;
    }
    return this.saveSettings();
  }

  async saveSettings() {
    try {
      await this.saveData(getPluginSettings(this));
      return true;
    } catch (error) {
      console.error('保存插件设置失败:', error);
      const now = Date.now();
      if (!this._lastSaveSettingsErrorAt || now - this._lastSaveSettingsErrorAt > 3000) {
        this._lastSaveSettingsErrorAt = now;
        new Notice('⚠️ 设置保存失败，本次修改仅在当前会话生效');
      }
      return false;
    }
  }

  async onunload() {
    if (this._wechatSyncBridgeService?.stop) {
      await this._wechatSyncBridgeService.stop().catch((error) => {
        console.warn('停止浏览器插件连接失败:', error);
      });
    }
    console.log('📝 Obsidian 发布助手已卸载');
  }
}

AppleStylePlugin.default = AppleStylePlugin;
AppleStylePlugin.AppleStylePlugin = AppleStylePlugin;
AppleStylePlugin.AppleStyleView = AppleStyleView;
AppleStylePlugin.WechatAPI = WechatAPI;
AppleStylePlugin.AppleStyleSettingTab = AppleStyleSettingTab;
AppleStylePlugin.createImageSwipeCalloutMarkdown = createImageSwipeCalloutMarkdown;
AppleStylePlugin.getImageSwipeCommandCopy = getImageSwipeCommandCopy;
AppleStylePlugin.stripMarkdownFrontmatter = stripMarkdownFrontmatter;
AppleStylePlugin.describeWechatsyncConnectionState = describeWechatsyncConnectionState;
AppleStylePlugin.renderWechatsyncConnectionStatusBar = renderWechatsyncConnectionStatusBar;
AppleStylePlugin.formatWechatsyncCheckedAt = formatWechatsyncCheckedAt;

export default AppleStylePlugin;
export {
  AppleStylePlugin,
  AppleStyleView,
  WechatAPI,
  AppleStyleSettingTab,
  createImageSwipeCalloutMarkdown,
  getImageSwipeCommandCopy,
  stripMarkdownFrontmatter,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
  formatWechatsyncCheckedAt,
};
