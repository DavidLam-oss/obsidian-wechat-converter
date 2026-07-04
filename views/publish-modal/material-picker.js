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

export const materialPickerMethods = {
getWechatMaterialCacheKey(api, type, offset, count) {
  return [
    api?.appId || '',
    api?.proxyUrl || '',
    type || 'image',
    Number(offset) || 0,
    Number(count) || 20,
  ].join('::');
}
,

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
,

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
,
};
