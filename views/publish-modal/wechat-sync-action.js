/*
## 核心功能

实现发布弹窗中的 wechat sync action 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `wechatSyncActionMethods`，用于微信、飞书或多平台发布流程的 UI 编排。

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


const wechatSyncActionMethods = {
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
};

export { wechatSyncActionMethods };
