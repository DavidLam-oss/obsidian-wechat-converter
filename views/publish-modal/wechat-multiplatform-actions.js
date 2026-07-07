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


const wechatMultiPlatformActionMethods = {
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
,

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
,

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
  const quotaLimit = Number.isFinite(Number(quotaRecord.maxPlatforms))
    ? Math.max(0, Math.floor(Number(quotaRecord.maxPlatforms)))
    : 1;
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
      text: `免费版每天 ${quotaLimit} 个平台额度，当前平台未入队。`,
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
,

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
,

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
,

async showMultiPlatformSyncModal(options = {}) {
  return /** @type {Promise<unknown>} */ (showMultiPlatformPublishModal(this, { ...options, obsidianApi }));
}
,

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
};

export { wechatMultiPlatformActionMethods };
