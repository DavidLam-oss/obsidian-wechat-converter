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

import {
  createWechatSyncService,
  resolveSyncAccount,
  toSyncFriendlyMessage,
  setDraftAssociation,
  WechatAPI,
  Notice,
  toReadableError,
  isRecord,
} from '../apple-style-view-shared.js';
import { STICKER_MAX_CONTENT_LENGTH } from '../../services/sticker-extractor.js';
import { createBodyStickerImageItem } from '../../services/sticker-image-items.js';
import { resolveStickerMediaIds } from '../../services/sticker-media-resolver.js';
import { syncStickerDraft } from '../../services/wechat-sync.js';

/** @type {WechatSyncActionMethodsContract & ThisType<AppleStyleViewContract>} */
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

  const isStickerMode = this.previewMode === 'sticker';

  // 贴图发布不依赖文章 HTML 渲染结果，只有文章模式需要这层拦截。
  if (!isStickerMode && !this.currentHtml) {
    new Notice(this.getMissingRenderNotice());
    return;
  }

  if (isStickerMode) {
    await this.onSyncStickerToWechat(account);
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
,

async onSyncStickerToWechat(account) {
  const notice = new Notice(`🚀 正在使用 ${account.name} 同步贴图...`, 0);

  try {
    // 以侧边栏最新的提取结果为准（含用户拖拽后的顺序与排除项）。
    const sourcePath = typeof this.sessionStickerSourcePath === 'string'
      ? this.sessionStickerSourcePath
      : '';
    const stickerData = await this.buildStickerData(sourcePath ? { sourcePath } : {});
    const imageItems = Array.isArray(stickerData.imageItems)
      ? stickerData.imageItems
      : (Array.isArray(stickerData.images) ? stickerData.images : [])
        .map((src) => createBodyStickerImageItem(src))
        .filter(Boolean);
    const content = typeof stickerData.content === 'string' ? stickerData.content : '';

    if (imageItems.length === 0) {
      notice.hide();
      new Notice('⚠️ 微信贴图至少需要 1 张图片，请先在笔记正文中插入图片');
      return;
    }

    if (content.length > STICKER_MAX_CONTENT_LENGTH) {
      notice.hide();
      new Notice(`⚠️ 贴图文案 ${content.length} 字，超出微信 ${STICKER_MAX_CONTENT_LENGTH} 字上限，请精简后再同步`);
      return;
    }

    const api = new WechatAPI(account.appId, account.appSecret, this.plugin.settings.proxyUrl, this.plugin.settings.clientId);
    if (!this.stickerUploadCache) this.stickerUploadCache = new Map();
    const imageMediaIds = await resolveStickerMediaIds({
      items: imageItems,
      account,
      api,
      srcToBlob: (src) => this.srcToBlob(src),
      cache: this.stickerUploadCache,
      onProgress: (current, total) => {
        notice.setMessage(`🚀 正在准备贴图图片 (${current}/${total})...`);
      },
    });

    notice.setMessage('🚀 正在创建微信贴图草稿...');
    const title = (this.sessionTitle || stickerData.title || '未命名贴图').slice(0, 64);
    const stickerDraftRes = await syncStickerDraft({
      account,
      api,
      title,
      content,
      imageMediaIds,
    });

    notice.hide();
    const mediaIdHint = stickerDraftRes?.mediaId ? `（MediaID: ${stickerDraftRes.mediaId.slice(0, 8)}...）` : '';
    new Notice(`✅ 贴图已发送到微信草稿箱${mediaIdHint}，请前往公众号后台查看`);
  } catch (error) {
    notice.hide();
    console.error('Wechat Sticker Sync Error:', error);
    const readableError = toReadableError(error);
    new Notice(`❌ 贴图同步失败：${toSyncFriendlyMessage(readableError.message)}`, 10000);
  }
}
};

export { wechatSyncActionMethods };
