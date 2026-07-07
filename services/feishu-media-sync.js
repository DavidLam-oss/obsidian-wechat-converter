/*
## 核心功能

实现飞书云文档同步链路的 feishu media sync 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `createImageSummary`、`replaceFeishuImageBlocks`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: JS module integrates dynamic Feishu block responses and Obsidian file objects */
// services/feishu-media-sync.js
//
// Feishu docx image replacement adapter. It consumes prepared local image
// assets and leaves remote images to Feishu's import pipeline.

import { getActiveWindow, getActiveWindowValue } from './dom-utils.js';

/**
 * @typedef {{ originalSrc: string, path: string, fileName: string, isRemote: boolean, sizeHint?: { width: number, height: number | null } | null }} FeishuMarkdownImageLike
 * @typedef {{ id: string, filename: string, mimeType: string, base64?: string, source?: { vaultRelativePath?: string, originalSrc?: string, placeholderSrc?: string } }} FeishuLocalImageAssetLike
 * @typedef {{ uploaded: number, skipped: number, failed: number, details: Array<{ filename: string, status: string, reason: string }> }} FeishuImageSummary
 */

/**
 * @param {unknown} binary
 * @returns {Uint8Array}
 */
function toUint8Array(binary) {
  if (binary instanceof Uint8Array) return binary;
  if (binary instanceof ArrayBuffer) return new Uint8Array(binary);
  if (ArrayBuffer.isView(binary)) {
    return new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function getPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height) return null;
  return { width, height };
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function getGifDimensions(bytes) {
  if (bytes.length < 10) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'GIF') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  if (!width || !height) return null;
  return { width, height };
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function getJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return null;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (!width || !height) return null;
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function getWebpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width && height ? { width, height } : null;
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return width && height ? { width, height } : null;
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = view.getUint32(21, true);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width && height ? { width, height } : null;
  }
  return null;
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
function getImageDimensions(bytes) {
  return getPngDimensions(bytes)
    || getGifDimensions(bytes)
    || getJpegDimensions(bytes)
    || getWebpDimensions(bytes);
}

/**
 * Keep the original image dimensions when replacing Feishu image blocks so
 * authors can resize freely inside Feishu without inheriting Obsidian preview
 * width hints.
 *
 * @param {Uint8Array} bytes
 * @param {{ width: number, height: number | null } | null | undefined} _sizeHint
 * @returns {{ width: number, height?: number } | null}
 */
function buildReplacementSize(bytes, _sizeHint) {
  const original = getImageDimensions(bytes);
  if (!original || !original.width || !original.height) return null;
  return {
    width: Math.round(original.width),
    height: Math.round(original.height),
  };
}

/**
 * @returns {FeishuImageSummary}
 */
function createImageSummary() {
  return {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function guessMimeTypeFromFileName(fileName) {
  const normalized = String(fileName || '').trim().toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

/**
 * @param {string} contentType
 * @param {string} fallbackFileName
 * @returns {string}
 */
function normalizeRemoteImageMimeType(contentType, fallbackFileName) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (normalized.startsWith('image/')) return normalized;
  return guessMimeTypeFromFileName(fallbackFileName);
}

/**
 * @param {string} base64
 * @returns {Uint8Array}
 */
function decodeBase64ImageBytes(base64) {
  const activeWindow = getActiveWindow() || window;
  const binary = activeWindow.atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * @returns {(((options: Record<string, unknown>) => Promise<unknown>) | null)}
 */
function getRequestUrlImplementation() {
  const obsidianApi = getActiveWindowValue('obsidian');
  const requestUrl = obsidianApi && typeof obsidianApi.requestUrl === 'function'
    ? obsidianApi.requestUrl
    : null;
  if (typeof requestUrl !== 'function') return null;
  return (options) => Promise.resolve(requestUrl(options));
}

/**
 * @returns {(((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null)}
 */
function getFetchImplementation() {
  const activeWindow = getActiveWindow() || window;
  if (typeof activeWindow.fetch === 'function') {
    return (input, init) => activeWindow.fetch(input, init);
  }
  return null;
}

/**
 * @param {string} dataUrl
 * @returns {{ bytes: Uint8Array, mimeType: string }}
 */
function readDataUrlImageBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) {
    throw new Error('不支持的 data URL 图片格式');
  }

  const mimeType = normalizeRemoteImageMimeType(match[1] || '', 'image');
  const base64 = match[2] || '';
  return { bytes: decodeBase64ImageBytes(base64), mimeType };
}

/**
 * @param {FeishuMarkdownImageLike} image
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null | undefined} requestUrl
 * @returns {Promise<{ bytes: Uint8Array, mimeType: string }>}
 */
async function readRemoteImageBytes(image, requestUrl) {
  const src = String(image?.path || image?.originalSrc || '').trim();
  if (!src) {
    throw new Error('远程图片地址为空，无法同步到飞书文档');
  }

  if (src.startsWith('data:')) {
    return readDataUrlImageBytes(src);
  }

  const requestUrlImpl = typeof requestUrl === 'function' ? requestUrl : getRequestUrlImplementation();
  if (requestUrlImpl) {
    const response = await requestUrlImpl({
      url: src,
      method: 'GET',
      throw: false,
    });
    const status = Number(response?.status || 0);
    if (status >= 400) {
      throw new Error(`下载远程图片失败 (${status})`);
    }
    const binary = response?.arrayBuffer
      || response?.raw
      || response?.buffer
      || new Uint8Array(0);
    const bytes = toUint8Array(binary);
    if (!bytes.byteLength) {
      throw new Error('下载远程图片失败 (empty body)');
    }
    return {
      bytes,
      mimeType: normalizeRemoteImageMimeType(response?.headers?.['content-type'] || response?.headers?.['Content-Type'] || '', image?.fileName || 'image'),
    };
  }

  const fetchImpl = getFetchImplementation();
  if (!fetchImpl) {
    throw new Error('当前环境缺少 requestUrl/fetch，无法重新上传远程图片到飞书文档');
  }

  const response = await fetchImpl(src);
  if (!response || !response.ok) {
    throw new Error(`下载远程图片失败 (${response?.status || 0})`);
  }

  const buffer = await response.arrayBuffer();
  return {
    bytes: toUint8Array(buffer),
    mimeType: normalizeRemoteImageMimeType(response.headers?.get?.('content-type') || '', image?.fileName || 'image'),
  };
}

/**
 * @param {FeishuImageSummary} summary
 * @param {string} filename
 * @param {string} status
 * @param {string} reason
 */
function addImageDetail(summary, filename, status, reason) {
  summary.details.push({ filename, status, reason });
  if (status === 'uploaded') summary.uploaded += 1;
  else if (status === 'skipped') summary.skipped += 1;
  else summary.failed += 1;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'unknown_error');
}

/**
 * @param {unknown} app
 * @param {FeishuLocalImageAssetLike} asset
 * @returns {Promise<Uint8Array>}
 */
async function readAssetBytes(app, asset) {
  const vaultRelativePath = asset?.source?.vaultRelativePath || '';
  const file = vaultRelativePath && app?.vault?.getAbstractFileByPath
    ? app.vault.getAbstractFileByPath(vaultRelativePath)
    : null;
  if (file) {
    return toUint8Array(await app.vault.readBinary(file));
  }

  if (asset?.base64) {
    return decodeBase64ImageBytes(String(asset.base64 || ''));
  }

  throw new Error(`找不到本地图片文件: ${vaultRelativePath || asset.filename}`);
}

/**
 * @param {FeishuMarkdownImageLike} image
 * @param {FeishuLocalImageAssetLike[]} assets
 * @returns {FeishuLocalImageAssetLike | null}
 */
function findLocalAssetForImage(image, assets) {
  const originalSrc = String(image?.originalSrc || '');
  if (originalSrc.startsWith('asset://')) {
    return assets.find((asset) => originalSrc === `asset://${asset.id}`) || null;
  }
  return assets.find((asset) => (
    asset?.source?.placeholderSrc === originalSrc ||
    asset?.source?.originalSrc === originalSrc ||
    asset?.source?.vaultRelativePath === image.path
  )) || null;
}

/**
 * @param {{
 *   app: unknown,
 *   client: { getDocumentBlocks: Function, uploadImageMaterialBytes: Function, updateBlock: Function },
 *   docToken: string,
 *   images: FeishuMarkdownImageLike[],
 *   assets: FeishuLocalImageAssetLike[],
 *   requestUrl?: ((options: Record<string, unknown>) => Promise<unknown>) | null,
 *   includeRemoteImages?: boolean,
 *   onProgress?: Function,
 * }} params
 * @returns {Promise<FeishuImageSummary>}
 */
async function replaceFeishuImageBlocks({ app, client, docToken, images, assets, requestUrl = null, includeRemoteImages = false, onProgress }) {
  const summary = createImageSummary();
  const imageItems = (images || []).map((image, index) => ({
    image,
    imageIndex: index,
    asset: findLocalAssetForImage(image, assets || []),
  }));
  const selectedImageItems = imageItems.filter((item) => item.asset || (includeRemoteImages && item.image?.isRemote));
  if (selectedImageItems.length === 0) return summary;

  const blocks = await client.getDocumentBlocks(docToken);
  const imageBlocks = (blocks || []).filter((block) => block.block_type === 27);

  for (let i = 0; i < selectedImageItems.length; i++) {
    const { image, imageIndex, asset } = selectedImageItems[i];
    const block = imageBlocks[imageIndex];
    const filename = asset?.filename || image.fileName || 'image';

    if (typeof onProgress === 'function') {
      onProgress('processing_images', `正在同步正文图片 (${i + 1}/${selectedImageItems.length})...`);
    }

    if (!block) {
      addImageDetail(summary, filename, 'skipped', 'feishu_image_block_missing');
      continue;
    }

    try {
      const { bytes, mimeType } = asset
        ? {
            bytes: await readAssetBytes(app, asset),
            mimeType: asset.mimeType || 'application/octet-stream',
          }
        : await readRemoteImageBytes(image, requestUrl);
      const replacementSize = buildReplacementSize(bytes, image?.sizeHint || null);
      const imageToken = await client.uploadImageMaterialBytes(
        filename,
        bytes,
        docToken,
        block.block_id,
        mimeType
      );

      await client.updateBlock(docToken, block.block_id, {
        replace_image: {
          token: imageToken,
          align: 2,
          ...(replacementSize?.width ? { width: replacementSize.width } : {}),
          ...(replacementSize?.height ? { height: replacementSize.height } : {}),
        },
      });
      addImageDetail(summary, filename, 'uploaded', 'ok');
    } catch (err) {
      console.error(`[飞书同步] 图片 ${filename} 同步失败:`, err);
      addImageDetail(summary, filename, 'failed', getErrorMessage(err));
    }
  }

  return summary;
}

export {
  createImageSummary,
  replaceFeishuImageBlocks,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: resume typed linting after Feishu media adapter boundary */
