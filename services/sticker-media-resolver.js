/*
## 核心功能

把微信贴图图片项解析成草稿所需的永久素材 media_id，并复用本次视图中已成功上传的结果。

## 输入

接收统一图片项、目标公众号账号、微信 API、源地址转 Blob 方法、缓存与进度回调。

## 输出

输出与图片顺序一致的 media_id 数组；素材库项直接复用，其他来源按需上传。

## 定位

位于 services/，是贴图同步动作与微信 API 之间的业务服务，不依赖 DOM。

## 依赖

关键依赖：`./sticker-image-items.js` 的统一图片源读取与账号身份规范化。

## 维护规则

- 素材 media_id 只允许在所属公众号账号内复用。
- 只有成功且返回 media_id 的上传才能写入缓存。
- 缓存 key 必须包含账号身份，失败重试不得跨账号复用。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- reason: service normalizes dynamic account, upload reference, and WeChat API response records */

/**
 * @param {object} account
 * @returns {string}
 */
function getStickerAccountKey(account) {
  return String(account?.id || account?.appId || '').trim();
}

/**
 * @param {object} item
 * @param {object} account
 * @returns {string}
 */
function getStickerUploadCacheKey(item, account) {
  const accountKey = getStickerAccountKey(account);
  const itemKey = String(item?.fingerprint || item?.key || '').trim();
  return accountKey && itemKey ? `${accountKey}::${itemKey}` : '';
}

/**
 * @param {object} params
 * @param {object[]} params.items
 * @param {object} params.account
 * @param {{uploadCover:(blob:unknown)=>Promise<{media_id?:unknown}>}} params.api
 * @param {(src:string)=>Promise<unknown>} params.srcToBlob
 * @param {Map<string,string>} [params.cache]
 * @param {(current:number,total:number,item:object)=>void} [params.onProgress]
 * @returns {Promise<string[]>}
 */
async function resolveStickerMediaIds({
  items,
  account,
  api,
  srcToBlob,
  cache = new Map(),
  onProgress,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const accountKey = getStickerAccountKey(account);
  if (!accountKey) throw new Error('当前公众号账号缺少可用身份');

  /** @type {string[]} */
  const mediaIds = [];
  for (let index = 0; index < safeItems.length; index += 1) {
    const item = safeItems[index];
    onProgress?.(index + 1, safeItems.length, item);
    const uploadRef = item?.uploadRef;

    if (uploadRef?.kind === 'media') {
      if (uploadRef.accountId !== accountKey && uploadRef.accountId !== account?.id) {
        throw new Error(`第 ${index + 1} 张素材属于其他公众号，请移除后重新选择`);
      }
      mediaIds.push(uploadRef.mediaId);
      continue;
    }

    const cacheKey = getStickerUploadCacheKey(item, account);
    const cachedMediaId = cacheKey ? cache.get(cacheKey) : '';
    if (cachedMediaId) {
      mediaIds.push(cachedMediaId);
      continue;
    }

    let mediaId = '';
    try {
      let blob;
      if (uploadRef?.kind === 'blob') {
        blob = uploadRef.blob;
      } else if (uploadRef?.kind === 'src') {
        blob = await srcToBlob(uploadRef.src);
      } else {
        throw new Error('缺少可上传内容');
      }

      const response = await api.uploadCover(blob);
      mediaId = typeof response?.media_id === 'string' ? response.media_id.trim() : '';
      if (!mediaId) throw new Error('上传后未返回 media_id');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '未知错误');
      const label = item?.name || uploadRef?.src || item?.key || '未知图片';
      throw new Error(`第 ${index + 1} 张图片上传失败（${label}）：${message}`);
    }
    if (cacheKey) cache.set(cacheKey, mediaId);
    mediaIds.push(mediaId);
  }

  return mediaIds;
}

export {
  getStickerAccountKey,
  getStickerUploadCacheKey,
  resolveStickerMediaIds,
};
