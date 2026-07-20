/*
## 核心功能

实现发布弹窗中的 multi platform 交互能力。

## 输入

接收视图状态、账号设置、文章元数据、同步结果和用户在弹窗中的操作。

## 输出

输出 `showMultiPlatformPublishModal`，用于微信、飞书或多平台发布流程的 UI 编排。

## 定位

位于 views/publish-modal/，负责发布弹窗 UI 层；API 调用委托 services/。

## 依赖

关键依赖：`../../services/wechatsync-results.js`、`../../services/wechatsync-bridge.js`、`../../services/wechatsync-settings.js`、`../connection-status-bar.js`、`../../services/markdown-utils.js`、`../../services/article-image-assets.js`、`../../services/obsidian-publisher-policy.js`、`../../services/dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 views/publish-modal 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// views/publish-modal/multi-platform.js
//
// Renders the「其他平台发布」publish modal. Extracted from input.js
// (originally AppleStyleView.showMultiPlatformSyncModal, ~318 lines).
//
// Public API:
//   showMultiPlatformPublishModal(view, options)
// where `view` is the AppleStyleView instance. The function still relies
// heavily on view.* methods for content preparation (prepareHtmlForWechatsyncArticle,
// getPublishContextFile, getFrontmatterPublishMeta, etc.) and for
// follow-up modals (showWechatsyncEnqueueAcceptedModal, showMultiPlatformSyncResultModal),
// so the view stays the orchestrator — this module only owns the UI shell.

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS module crosses dynamic Obsidian/Bridge response boundaries without strict TypeScript declarations */

import {
  isWechatSyncConnectionFailure,
  normalizeWechatSyncResponseResults,
  updateCachedPlatformsAfterSync,
} from '../../services/wechatsync-results.js';

import {
  normalizeWechatSyncCapabilities,
  normalizeMultiPlatformConnection,
  normalizeMultiPlatformSyncSettings,
  normalizeWechatSyncRecentTasks,
} from '../../services/wechatsync-settings.js';

import { stripMarkdownFrontmatter } from '../../services/markdown-utils.js';
import {
  findAssetForCover,
  formatArticleImageWarnings,
  resolveArticleImages,
} from '../../services/article-image-assets.js';
import {
  checkExtensionPolicyGate,
  checkObsidianPluginPolicyGate,
  getEffectiveObsidianPublisherPolicy,
  getObsidianPluginVersion,
} from '../../services/obsidian-publisher-policy.js';
import { getActiveWindowValue } from '../../services/dom-utils.js';
import {
  getQuotaHintText,
  mergePolicyCapabilityDetails,
  mergeHealthPolicyCapabilities,
  resolveInitialFreeQuotaLimit,
  resolvePluginSideQuotaTruncation,
  mergePluginSkippedPlatformsIntoResult,
} from './multi-platform-policy.js';
import {
  getBridgeSafeSessionCover,
  downloadMaterialCoverAsBridgeAsset,
} from './multi-platform-cover-assets.js';
import { renderMultiPlatformModalUI } from './multi-platform-modal-ui.js';
import {
  toRecord,
  toRecordList,
  toText,
  toReadableError,
  toEnqueueResult,
  toResolvedImages,
  toBridgeAsset,
  toTaskResults,
  getRecentTaskPlatforms,
  toUnknownList,
  isUnsupportedBridgeError,
} from './multi-platform-data.js';

const QUOTA_POLICY = 'truncate';

/**
 * @typedef {{ id?: string, filename: string, mimeType: string, size: number, base64: string, source?: Record<string, unknown> }} BridgeAssetLike
 * @typedef {{ cachedAt: number, asset: BridgeAssetLike }} MaterialCoverCacheEntryLike
 * @typedef {{ requestUrl?: (options: Record<string, unknown>) => Promise<unknown>, obsidianApi?: Partial<ObsidianApiLike>, modal?: PublishModalLike }} PublishModalOptionsLike
 * @typedef {{ isMobile?: boolean }} PlatformLike
 * @typedef {{ Modal: new (app: unknown) => PublishModalLike, Notice: new (message: string, timeout?: number) => NoticeLike, Platform?: PlatformLike, requestUrl?: (options: Record<string, unknown>) => Promise<unknown>, setIcon?: (element: HTMLElement, iconName: string) => void }} ObsidianApiLike
 * @typedef {{ hide: () => void, setMessage?: (message: string) => void }} NoticeLike
 * @typedef {{ contentEl: ModalContentElementLike, open: () => void, close: () => void }} PublishModalLike
 * @typedef {HTMLElement & { createDiv: (options?: { cls?: string }) => ModalContentElementLike, createEl: (tagName: string, options?: { text?: string, cls?: string, attr?: Record<string, string> }) => ModalContentElementLike, empty?: () => void, addClass?: (className: string) => void, removeClass?: (className: string) => void }} ModalContentElementLike
 * @typedef {{ status?: string, checkedAt?: number, message?: string, platforms?: unknown, capabilities?: unknown }} ConnectionLike
 * @typedef {{ syncId?: string, requestId?: string, accepted?: boolean, quotaBlocked?: boolean, skippedPlatforms?: unknown, message?: string, publishedPlatforms?: unknown, platforms?: unknown, maxPlatforms?: number }} EnqueueResultLike
 * @typedef {{ health?: (options?: Record<string, unknown>) => Promise<unknown>, getActiveClientDescriptor?: () => unknown, getStatus?: () => unknown, enqueueSyncArticle?: (payload: Record<string, unknown>) => Promise<unknown>, sendArticle?: (payload: Record<string, unknown>) => Promise<unknown> }} BridgeLike
 * @typedef {{ settings: { multiPlatformSync?: unknown }, obsidianApi?: Partial<ObsidianApiLike>, getWechatSyncBridgeService: () => BridgeLike, saveSettings: () => Promise<void> }} PluginLike
 * @typedef {{ path: string, basename: string }} FileLike
 * @typedef {{ title?: string, cover?: string }} PublishMetaLike
 * @typedef {{ markdown: string, assets: BridgeAssetLike[], cover?: string, firstImageSrc?: string, warnings?: unknown[] }} ResolvedImagesLike
 * @typedef {{ app?: unknown, currentHtml?: string, lastResolvedMarkdown?: string, sessionCoverBase64?: string, sessionThumbMediaId?: string, wechatMaterialCoverAssetCache?: Map<string, MaterialCoverCacheEntryLike>, articleStates: Map<string, Record<string, unknown>>, plugin: PluginLike, getMissingRenderNotice: () => string, preparePublishModalShell: (modal: PublishModalLike, options: Record<string, unknown>) => void, createPublishModeTabs: (modal: PublishModalLike, mode: string) => { wechatTab: ModalContentElementLike }, showSyncModal: (options: Record<string, unknown>) => void, openPluginSettings: () => boolean, getPublishContextFile: () => FileLike | null, getFrontmatterPublishMeta: (file: FileLike | null) => PublishMetaLike, getCurrentExportHtml: () => string, getFirstImageFromArticle: () => string, prepareHtmlForWechatsyncArticleViaBridge: (html: string, assets: BridgeAssetLike[]) => Promise<string>, generateCoverThumbnailFromAsset: (asset: BridgeAssetLike) => Promise<string>, getWechatsyncTaskSnapshot: (bridge: BridgeLike, syncId: string) => Promise<unknown>, showMultiPlatformQuotaBlockedModal: (options: Record<string, unknown>) => void, showWechatsyncEnqueueAcceptedModal: (options: Record<string, unknown>) => void, showMultiPlatformSyncResultModal: (options: Record<string, unknown>) => void }} PublishViewLike
 */

/**
 * @param {unknown} target
 * @param {string} methodName
 * @param {unknown[]} [args]
 * @returns {boolean | null}
 */
function callBooleanMethod(target, methodName, args = []) {
  const method = toRecord(target)[methodName];
  if (typeof method !== 'function') return null;
  const methodFn = /** @type {(...methodArgs: unknown[]) => unknown} */ (method);
  return methodFn.apply(target, args) === true;
}

/**
 * @param {unknown} element
 * @returns {ModalContentElementLike}
 */
function asModalElement(element) {
  return /** @type {ModalContentElementLike} */ (element);
}

/**
 * @param {unknown} app
 * @param {PlatformLike | null} [platformApi]
 * @returns {boolean}
 */
function isMobileClient(app, platformApi = null) {
  if (typeof platformApi?.isMobile === 'boolean') return platformApi.isMobile;
  return toRecord(app).isMobile === true;
}

/**
 * @param {unknown} view
 * @returns {boolean}
 */
function openPublisherProPage(view) {
  const openedProPage = callBooleanMethod(view, 'openPublisherProPage');
  if (openedProPage !== null) return openedProPage;
  const openedExternalUrl = callBooleanMethod(view, 'openExternalUrl', ['https://xiaoweibox.top/obsidian-publisher/pro/']);
  if (openedExternalUrl !== null) return openedExternalUrl;
  return false;
}

/**
 * @param {unknown} view
 * @param {string} [section]
 * @returns {boolean}
 */
function openPublisherGuidePage(view, section = 'install-extension') {
  const openedGuidePage = callBooleanMethod(view, 'openPublisherGuidePage', [section]);
  if (openedGuidePage !== null) return openedGuidePage;
  const hash = section === 'bridge' ? 'bridge' : 'install-extension';
  const openedExternalUrl = callBooleanMethod(view, 'openExternalUrl', [`https://xiaoweibox.top/obsidian-publisher/guide/?from=obsidian-plugin#${hash}`]);
  if (openedExternalUrl !== null) return openedExternalUrl;
  return false;
}

/**
 * @param {BridgeLike | null | undefined} bridge
 * @param {ConnectionLike} [cachedConnection]
 * @returns {Promise<Record<string, unknown>>}
 */
async function detectQuotaPolicySupport(bridge, cachedConnection = {}) {
  const cachedCapabilities = normalizeWechatSyncCapabilities(toRecord(cachedConnection.capabilities));
  if (!bridge || typeof bridge.health !== 'function') return cachedCapabilities;

  try {
    const health = await bridge.health({ timeoutMs: 5000 });
    return mergeHealthPolicyCapabilities(cachedCapabilities, health);
  } catch (error) {
    if (isUnsupportedBridgeError(error)) return cachedCapabilities;
    const readableError = toReadableError(error);
    console.debug?.('[Wechatsync] quota feature detection skipped', {
      code: readableError.code,
      message: readableError.message,
    });
    return cachedCapabilities;
  }
}

/**
 * @param {PublishViewLike} view
 * @param {ConnectionLike} [cachedConnection]
 * @returns {Record<string, unknown>}
 */
function resolvePublishModalCapabilities(view, cachedConnection = {}) {
  const cachedCapabilities = normalizeWechatSyncCapabilities(toRecord(cachedConnection.capabilities));
  const bridge = /** @type {BridgeLike} */ (view.plugin.getWechatSyncBridgeService());
  const activeClient = typeof bridge.getActiveClientDescriptor === 'function'
    ? bridge.getActiveClientDescriptor()
    : null;
  const activeClientRecord = toRecord(activeClient);
  if (activeClientRecord.capabilities) {
    return mergePolicyCapabilityDetails(
      mergePolicyCapabilityDetails(cachedCapabilities, activeClientRecord.capabilities),
      activeClientRecord
    );
  }

  const status = typeof bridge.getStatus === 'function' ? toRecord(bridge.getStatus()) : {};
  const connectedClients = toRecordList(status.connectedClients);
  const liveClient = connectedClients.find((client) => client.status === 'connected' && client.capabilities);
  const liveClientRecord = toRecord(liveClient);
  return mergePolicyCapabilityDetails(
    mergePolicyCapabilityDetails(cachedCapabilities, liveClientRecord.capabilities),
    liveClientRecord
  );
}

/**
 * @param {PublishViewLike} view
 * @param {PublishModalOptionsLike} [options]
 * @returns {ObsidianApiLike}
 */
/**
 * @param {PublishViewLike} view
 * @param {PublishModalOptionsLike} [options]
 * @returns {ObsidianApiLike}
 */
function getObsidianApi(view, options = {}) {
  return /** @type {ObsidianApiLike} */ (options.obsidianApi
    || view.plugin.obsidianApi
    || getActiveWindowValue('obsidian')
    || {});
}

/**
 * @param {PublishViewLike} view
 * @param {PublishModalOptionsLike} [options]
 * @returns {Promise<void>}
 */
async function showMultiPlatformPublishModal(view, options = {}) {
  const obsidian = getObsidianApi(view, options);
  const { Notice, Platform } = obsidian;
  if (!view.currentHtml) {
    new Notice(view.getMissingRenderNotice());
    return;
  }

  const modal = options.modal || new obsidian.Modal(view.app);
  modal.contentEl = asModalElement(modal.contentEl);
  const shouldOpenModal = !options.modal;
  const mobileSync = isMobileClient(view.app, Platform);
  const bridgeSettings = normalizeMultiPlatformSyncSettings(toRecord(view.plugin.settings.multiPlatformSync));
  const cachedConnection = bridgeSettings.connection || normalizeMultiPlatformConnection();
  const cachedConnectionRecord = toRecord(cachedConnection);
  view.preparePublishModalShell(modal, { mode: 'multi', mobileSync });

  const { wechatTab, feishuTab } = view.createPublishModeTabs(modal, 'multi');
  wechatTab.onclick = () => {
    view.showSyncModal({ modal });
  };
  if (feishuTab) {
    feishuTab.onclick = () => {
      view.showFeishuSyncModal({ modal });
    };
  }

  const renderModalUi = (publishModalCapabilities, initialFreeQuotaLimit) => renderMultiPlatformModalUI({
    view,
    modal,
    obsidian,
    shouldOpenModal,
    bridgeSettings,
    cachedConnectionRecord,
    publishModalCapabilities,
    initialFreeQuotaLimit,
    getQuotaHintText,
    openPublisherProPage: () => openPublisherProPage(view),
    openPublisherGuidePage: (section) => openPublisherGuidePage(view, section),
  });
  if (!bridgeSettings.enabled) {
    const disabledModalUi = renderModalUi({}, 1);
    if (disabledModalUi.disabled) return;
  }
  const publishModalCapabilities = resolvePublishModalCapabilities(view, cachedConnection);
  const initialFreeQuotaLimit = resolveInitialFreeQuotaLimit(bridgeSettings, publishModalCapabilities);
  const modalUi = renderModalUi(publishModalCapabilities, initialFreeQuotaLimit);
  if (modalUi.disabled) return;

  const {
    isBridgeReady,
    syncButton: syncBtn,
    selectedPlatforms,
    updateSyncButtonState,
  } = modalUi;

  syncBtn.onclick = async () => {
    if (!isBridgeReady) {
      new Notice('请先连接浏览器插件，再发送多平台发布任务。', 8000);
      return;
    }
    if (selectedPlatforms.size === 0) {
      new Notice('请先选择至少一个平台');
      return;
    }
    const activeFile = view.getPublishContextFile();
    const publishMeta = view.getFrontmatterPublishMeta(activeFile);
    const currentPath = activeFile ? activeFile.path : null;
    const cachedState = currentPath ? view.articleStates.get(currentPath) : null;
    const title = cachedState?.title || publishMeta?.title || activeFile?.basename || '无标题文章';
    const rawMarkdown = stripMarkdownFrontmatter(view.lastResolvedMarkdown || '');
    const exportHtml = view.getCurrentExportHtml() || view.currentHtml || '';
    const selectedWechatMaterialCover = !!view.sessionThumbMediaId;
    const rawCover = getBridgeSafeSessionCover(view.sessionCoverBase64) || publishMeta.cover || '';
    const notice = new Notice('正在准备并发送到浏览器插件...', 0);
    syncBtn.disabled = true;
    syncBtn.addClass?.('apple-btn-disabled');
    const sendStartedAt = Date.now();
    const requestedPlatformIds = Array.from(selectedPlatforms);
    try {
      const bridge = view.plugin.getWechatSyncBridgeService();
      const [detectedCapabilities, effectivePolicy] = await Promise.all([
        detectQuotaPolicySupport(bridge, cachedConnection),
        getEffectiveObsidianPublisherPolicy(view.plugin, {
          requestUrl: obsidian.requestUrl,
          clientVersion: getObsidianPluginVersion(view.plugin),
        }),
      ]);
      const pluginPolicyGate = checkObsidianPluginPolicyGate(
        effectivePolicy.payload,
        getObsidianPluginVersion(view.plugin)
      );
      if (!pluginPolicyGate.allowed) {
        notice.hide();
        new Notice(`❌ ${pluginPolicyGate.message || '当前 Obsidian 插件版本过低，请升级后继续发布。'}`, 10000);
        return;
      }
      const extensionPolicyGate = checkExtensionPolicyGate(effectivePolicy.payload, {
        currentVersion: toText(detectedCapabilities.extensionVersion),
        remotePolicySupported: detectedCapabilities.remotePolicy === true,
      });
      if (!extensionPolicyGate.allowed) {
        notice.hide();
        new Notice(`❌ ${extensionPolicyGate.message || '当前浏览器扩展版本过低，请升级后继续发布。'}`, 10000);
        return;
      }
      if (pluginPolicyGate.warning) {
        console.debug('[Wechatsync] Obsidian plugin upgrade recommended by policy', {
          currentVersion: getObsidianPluginVersion(view.plugin),
          minObsidianPluginVersion: pluginPolicyGate.minObsidianPluginVersion,
          policyVersion: toRecord(effectivePolicy.payload).policyVersion,
        });
      }
      if (extensionPolicyGate.warning) {
        console.debug('[Wechatsync] browser extension upgrade recommended by policy', {
          currentVersion: toText(detectedCapabilities.extensionVersion),
          minExtensionVersion: extensionPolicyGate.minExtensionVersion,
          policyVersion: toRecord(effectivePolicy.payload).policyVersion,
        });
      }
      const platformTruncation = resolvePluginSideQuotaTruncation(
        requestedPlatformIds,
        effectivePolicy,
        detectedCapabilities
      );
      if (platformTruncation.truncated) {
        console.debug('[Wechatsync] request pre-truncated by Obsidian plugin policy', {
          requestedPlatformCount: requestedPlatformIds.length,
          enqueuedPlatformCount: platformTruncation.platformIds.length,
          skippedPlatformCount: platformTruncation.skippedPlatformIds.length,
          quotaLimit: platformTruncation.quotaLimit,
          policyVersion: toRecord(effectivePolicy.payload).policyVersion,
          policySource: effectivePolicy.source,
        });
      }
      const resolvedImages = toResolvedImages(await resolveArticleImages(rawMarkdown, activeFile, {
        app: view.app,
        cover: rawCover,
      }));
      if (resolvedImages.warnings?.length) {
        throw new Error(`本地图片处理失败：${formatArticleImageWarnings(resolvedImages.warnings)}`);
      }
      const markdown = resolvedImages.markdown;
      const assets = resolvedImages.assets;
      const fallbackCover = view.getFirstImageFromArticle();
      let cover = resolvedImages.cover
        || resolvedImages.firstImageSrc
        || (/^(https?:\/\/|data:image\/)/i.test(fallbackCover || '') ? fallbackCover : '')
        || '';
      if (selectedWechatMaterialCover) {
        const materialCover = await downloadMaterialCoverAsBridgeAsset(view, view.sessionCoverBase64, assets, {
          requestUrl: obsidian.requestUrl,
        });
        cover = materialCover.cover;
      }
      // Bridge flow: do NOT inline base64 (assets[] carries bytes
      // separately). The ViaBridge variant maps app:// img srcs to
      // asset://<id> using the assets[] metadata directly. Sticking with
      // the legacy prepareHtmlForWechatsyncArticle would double-encode
      // every local image and break extension-side retry on redacted
      // base64.
      const content = await view.prepareHtmlForWechatsyncArticleViaBridge(exportHtml, assets);

      // Invariant guard (handover §3.2): bridge content[] must never carry
      // inline base64 image bytes — assets[] is the single source of truth
      // for image bytes, and the extension has to redact base64 from
      // history to fit chrome.storage.local quota. A leak here would break
      // the extension's retry path. Warn loud (do not abort) so an
      // unrelated regression surfaces in dev while users can still publish.
      const base64Matches = String(content || '').match(/data:image\/[a-z]+;base64,/gi);
      if (base64Matches && base64Matches.length) {
        console.error('[Wechatsync] bridge content contains inline base64 images — this should never happen on bridge flow. Likely a regression in prepareHtmlForWechatsyncArticleViaBridge or a forgotten callsite using the legacy preparator.', {
          inlineBase64ImageCount: base64Matches.length,
          contentLength: content.length,
          assetCount: assets.length,
          title,
        });
      }

      // Generate a small inline cover thumbnail when the resolved cover is
      // a local asset. The extension popup History list cannot resolve
      // asset:// URLs in plain <img src>; previously the only fallback was
      // for the extension to re-decode + resize the full asset bytes at
      // first paint. coverThumbnail short-circuits that: a ≤8KB JPEG data
      // URL the extension can drop straight into <img src>. Purely
      // additive — older extensions just ignore the field.
      const coverAsset = toBridgeAsset(findAssetForCover(cover, assets));
      const coverThumbnail = coverAsset
        ? await view.generateCoverThumbnailFromAsset(coverAsset)
        : '';

      console.debug('[Wechatsync] enqueueSyncArticle started', {
        platformCount: platformTruncation.platformIds.length,
        requestedPlatformCount: requestedPlatformIds.length,
        platforms: requestedPlatformIds,
        enqueuedPlatforms: platformTruncation.platformIds,
        skippedByPluginPolicy: platformTruncation.skippedPlatformIds,
        title,
        hasMarkdown: !!markdown,
        contentLength: content.length,
        hasCover: !!cover,
        hasCoverThumbnail: !!coverThumbnail,
        coverThumbnailBytes: coverThumbnail.length,
        assetCount: assets.length,
        assetBytes: assets.reduce((sum, asset) => sum + (asset.size || 0), 0),
      });
      /** @type {EnqueueResultLike | null} */
      let result = null;
      let usedFallbackSend = false;
      if (platformTruncation.platformIds.length === 0) {
        result = {
          accepted: false,
          reason: 'daily_limit',
          quotaBlocked: true,
          maxPlatforms: platformTruncation.quotaLimit,
          publishedPlatforms: [],
          skippedPlatforms: requestedPlatformIds,
          message: `免费版今日 ${platformTruncation.quotaLimit} 个平台额度已用完，明天 0:00 重置，或升级 Pro。`,
        };
      } else {
        try {
          result = toEnqueueResult(await bridge.enqueueSyncArticle({
            platforms: platformTruncation.platformIds,
            title,
            markdown,
            content,
            cover,
            coverThumbnail,
            assets,
            source: 'obsidian',
            quotaPolicy: QUOTA_POLICY,
          }));
        } catch (enqueueError) {
          if (!isUnsupportedBridgeError(enqueueError)) throw enqueueError;
          usedFallbackSend = true;
          console.warn('[Wechatsync] enqueueSyncArticle unsupported, falling back to one-way syncArticle', enqueueError);
          result = toEnqueueResult(await bridge.sendArticle({
            platforms: platformTruncation.platformIds,
            title,
            markdown,
            content,
            cover,
            coverThumbnail,
            assets,
            quotaPolicy: QUOTA_POLICY,
          }));
        }
        result = mergePluginSkippedPlatformsIntoResult(result, platformTruncation);
      }
      console.debug('[Wechatsync] enqueueSyncArticle accepted', {
        elapsedMs: Date.now() - sendStartedAt,
        resultKind: Array.isArray(result) ? 'array' : typeof result,
        syncId: result?.syncId,
        requestId: result?.requestId,
        accepted: result?.accepted,
        quotaBlocked: result?.quotaBlocked,
        skippedPlatforms: result?.skippedPlatforms,
        usedFallbackSend,
        platformCount: platformTruncation.platformIds.length,
        requestedPlatformCount: requestedPlatformIds.length,
        supportsQuotaPolicy: detectedCapabilities.quotaPolicy === true,
        remotePolicy: detectedCapabilities.remotePolicy === true,
      });
      const currentMultiPlatformSettings = normalizeMultiPlatformSyncSettings(view.plugin.settings.multiPlatformSync);
      const connectionRecord = toRecord(currentMultiPlatformSettings.connection);
      if (result?.accepted === false) {
        notice.hide();
        modal.close();
        view.plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...currentMultiPlatformSettings,
          connection: {
            ...connectionRecord,
            status: 'connected',
            checkedAt: Date.now(),
            capabilities: {
              ...toRecord(connectionRecord.capabilities),
              ...detectedCapabilities,
            },
            message: result?.message || '浏览器插件已拒绝本次发布。',
          },
        });
        await view.plugin.saveSettings();
        view.showMultiPlatformQuotaBlockedModal({
          quotaResult: result,
          requestedPlatformIds,
        });
        return;
      }
      if (result?.syncId) notice.setMessage('已投递，正在读取插件任务状态...');
      const taskSnapshot = result?.syncId
        ? await view.getWechatsyncTaskSnapshot(bridge, result.syncId)
        : null;
      const immediateResults = toUnknownList(normalizeWechatSyncResponseResults(result));
      const taskSnapshotRecord = toRecord(taskSnapshot);
      const taskResults = toTaskResults(taskSnapshotRecord.platforms);
      const cachedPlatformsAfterSync = updateCachedPlatformsAfterSync(
        toRecordList(connectionRecord.platforms),
        immediateResults.length ? immediateResults : taskResults
      );
      notice.hide();
      modal.close();
      const nextRecentTasks = result?.syncId
        ? normalizeWechatSyncRecentTasks([
          {
            syncId: result.syncId,
            title,
            platforms: getRecentTaskPlatforms(result, requestedPlatformIds),
            createdAt: Date.now(),
          },
          ...toUnknownList(currentMultiPlatformSettings.recentTasks),
        ])
        : currentMultiPlatformSettings.recentTasks;
      view.plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
        ...currentMultiPlatformSettings,
        recentTasks: nextRecentTasks,
        connection: {
          ...connectionRecord,
          status: 'connected',
          checkedAt: Date.now(),
          platforms: cachedPlatformsAfterSync,
          capabilities: {
            ...toRecord(connectionRecord.capabilities),
            ...detectedCapabilities,
          },
          message: '',
        },
      });
      await view.plugin.saveSettings();
      view.showWechatsyncEnqueueAcceptedModal({
        syncId: result?.syncId || '',
        title,
        platforms: requestedPlatformIds,
        task: taskSnapshot,
        usedFallbackSend,
        quotaResult: result,
      });
    } catch (error) {
      notice.hide();
      const readableError = toReadableError(error);
      console.error('[Wechatsync] enqueueSyncArticle failed', {
        elapsedMs: Date.now() - sendStartedAt,
        code: readableError.code,
        message: readableError.message,
        stack: readableError.stack,
        requestedPlatformIds,
      });
      // §4.1: surface EXTENSION_NOT_AUTHENTICATED with a dedicated message
      // so users know the extension is reachable but failed the handshake,
      // rather than reusing the generic "connection failed" copy.
      const displayMessage = readableError.code === 'EXTENSION_NOT_AUTHENTICATED'
        ? '浏览器插件已连接但未通过握手认证。如果你刚刚在浏览器插件设置中重置过令牌，请到本插件的"多平台同步"设置页粘贴新令牌；否则请确认插件已升级到支持安全握手的版本。'
        : (readableError.message || '浏览器插件连接失败');
      if (isWechatSyncConnectionFailure(readableError)) {
        const currentMultiPlatformSettings = normalizeMultiPlatformSyncSettings(view.plugin.settings.multiPlatformSync);
        view.plugin.settings.multiPlatformSync = normalizeMultiPlatformSyncSettings({
          ...currentMultiPlatformSettings,
          connection: {
            ...toRecord(currentMultiPlatformSettings.connection),
            status: 'failed',
            checkedAt: Date.now(),
            message: displayMessage,
          },
        });
        await view.plugin.saveSettings();
      }
      modal.close();
      new Notice(`❌ 发送到浏览器插件失败：${displayMessage}`, 10000);
      view.showMultiPlatformSyncResultModal({
        requestedPlatformIds,
        fatalError: error,
      });
    } finally {
      updateSyncButtonState();
    }
  };

  if (shouldOpenModal) modal.open();
}

export { showMultiPlatformPublishModal };

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
