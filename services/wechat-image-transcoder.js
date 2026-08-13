/*
## 核心功能

在微信公众号上传前识别 WebP 容器，并将静态图片转换成真实 PNG 或 JPEG Blob。

## 输入

接收待上传的图片 Blob，以及测试环境可选注入的 active document、图片和 Object URL 能力。

## 输出

输出 WebP 检查结果或微信可上传的图片 Blob；非 WebP 保持原对象，动画 WebP 明确拒绝。

## 定位

位于 services/，属于微信媒体上传前的格式兼容层；不修改 Markdown、预览 DOM 或图片源文件。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 必须按 RIFF chunk 边界解析，不能通过全文字符串搜索识别 WebP 特征。
- 照片型静态 WebP 输出 JPEG；透明或无损型静态 WebP 输出 PNG；动画 WebP 不静默截帧。
- 输出 MIME、文件签名和实际字节必须一致，所有 Object URL 都要在 finally 中释放。
*/

import { getActiveDocument } from './dom-utils.js';

const WEBP_MIME_TYPE = 'image/webp';
const PNG_MIME_TYPE = 'image/png';
const JPEG_MIME_TYPE = 'image/jpeg';
const RIFF_HEADER_SIZE = 12;
const VP8X_PAYLOAD_SIZE = 10;
const VP8X_ALPHA_FLAG = 0x10;
const VP8X_ANIMATION_FLAG = 0x02;
const JPEG_QUALITY = 0.9;

/**
 * @typedef {{
 *   isWebp: boolean,
 *   isAnimated: boolean,
 *   hasAlpha: boolean,
 *   isLossless: boolean,
 *   targetMimeType: '' | 'image/png' | 'image/jpeg',
 *   imageChunk: '' | 'VP8 ' | 'VP8L',
 * }} WebpInspection
 * @typedef {{
 *   document?: Document | null,
 *   createImage?: (() => WebpImageLike) | null,
 *   createObjectUrl?: ((blob: Blob) => string) | null,
 *   revokeObjectUrl?: ((url: string) => void) | null,
 * }} WebpTranscodeOptions
 * @typedef {{
 *   naturalWidth?: number,
 *   naturalHeight?: number,
 *   width?: number,
 *   height?: number,
 *   onload: (() => void) | null,
 *   onerror: (() => void) | null,
 *   src: string,
 * }} WebpImageLike
 * @typedef {new () => WebpImageLike} WebpImageConstructor
 * @typedef {{
 *   Image?: WebpImageConstructor,
 *   URL?: {
 *     createObjectURL?: (blob: Blob) => string,
 *     revokeObjectURL?: (url: string) => void,
 *   },
 * }} WebpActiveWindowLike
 */

/** @param {unknown} value */
function normalizeMimeType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

/** @param {unknown} error */
function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && typeof error['message'] === 'string') {
    return error['message'];
  }
  return String(error || '未知错误');
}

/** @param {Uint8Array} bytes @param {number} offset */
function readUint32Le(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

/** @param {Uint8Array} bytes @param {number} offset @param {string} text */
function matchesAscii(bytes, offset, text) {
  if (offset < 0 || offset + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/** @param {Uint8Array} bytes @param {number} offset */
function readFourCc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/**
 * @param {Blob} blob
 * @param {number} start
 * @param {number} end
 * @returns {Promise<Uint8Array>}
 */
async function readBlobRange(blob, start, end) {
  if (!blob || typeof blob.slice !== 'function') {
    throw new Error('当前环境无法读取图片数据');
  }
  const part = blob.slice(start, end);
  if (part && typeof part.arrayBuffer === 'function') {
    return new Uint8Array(await part.arrayBuffer());
  }
  // Some Blob implementations expose arrayBuffer() on the original object but
  // not on sliced child Blobs. Keep the current runtime baseline without adding
  // a FileReader fallback, and only read the full source in that compatibility case.
  if (typeof blob.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return bytes.slice(start, Math.min(end, bytes.length));
  }
  throw new Error('当前环境无法读取图片数据');
}

/** @returns {WebpInspection} */
function createNonWebpInspection() {
  return {
    isWebp: false,
    isAnimated: false,
    hasAlpha: false,
    isLossless: false,
    targetMimeType: '',
    imageChunk: '',
  };
}

/**
 * @param {Uint8Array} bytes
 * @returns {WebpInspection}
 */
function inspectWebpBytes(bytes) {
  if (bytes.length < RIFF_HEADER_SIZE || !matchesAscii(bytes, 0, 'RIFF') || !matchesAscii(bytes, 8, 'WEBP')) {
    throw new Error('WebP 文件头无效或图片已损坏');
  }

  const declaredEnd = readUint32Le(bytes, 4) + 8;
  if (declaredEnd < RIFF_HEADER_SIZE || declaredEnd > bytes.length) {
    throw new Error('WebP RIFF 长度无效或图片数据不完整');
  }

  let offset = RIFF_HEADER_SIZE;
  let hasVp8x = false;
  let hasAlpha = false;
  let isAnimated = false;
  let imageChunkCount = 0;
  /** @type {Set<'VP8 ' | 'VP8L'>} */
  const imageChunks = new Set();

  while (offset < declaredEnd) {
    if (offset + 8 > declaredEnd) {
      throw new Error('WebP chunk 头部不完整');
    }

    const chunkType = readFourCc(bytes, offset);
    const chunkSize = readUint32Le(bytes, offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (payloadEnd > declaredEnd) {
      throw new Error(`WebP ${chunkType} chunk 长度越界`);
    }

    if (chunkType === 'VP8X') {
      if (chunkSize < VP8X_PAYLOAD_SIZE) {
        throw new Error('WebP VP8X chunk 数据不完整');
      }
      hasVp8x = true;
      const flags = bytes[payloadStart];
      if ((flags & VP8X_ALPHA_FLAG) !== 0) hasAlpha = true;
      if ((flags & VP8X_ANIMATION_FLAG) !== 0) isAnimated = true;
    } else if (chunkType === 'ALPH') {
      hasAlpha = true;
    } else if (chunkType === 'ANIM' || chunkType === 'ANMF') {
      isAnimated = true;
    } else if (chunkType === 'VP8 ' || chunkType === 'VP8L') {
      imageChunkCount += 1;
      imageChunks.add(chunkType);
    }

    const paddedEnd = payloadEnd + (chunkSize % 2);
    if (paddedEnd > declaredEnd) {
      throw new Error(`WebP ${chunkType} chunk padding 越界`);
    }
    offset = paddedEnd;
  }

  if (offset !== declaredEnd) {
    throw new Error('WebP RIFF 结构不完整');
  }
  if (isAnimated) {
    return {
      isWebp: true,
      isAnimated: true,
      hasAlpha,
      isLossless: false,
      targetMimeType: '',
      imageChunk: '',
    };
  }
  if (imageChunks.size !== 1 || imageChunkCount !== 1) {
    throw new Error(imageChunkCount === 0 ? 'WebP 缺少可解码的图像数据' : 'WebP 包含冲突的图像数据');
  }

  const imageChunk = /** @type {'VP8 ' | 'VP8L'} */ (Array.from(imageChunks)[0]);
  const isLossless = imageChunk === 'VP8L';
  if (hasAlpha && !hasVp8x && imageChunk !== 'VP8L') {
    throw new Error('WebP 透明通道结构无效');
  }

  return {
    isWebp: true,
    isAnimated: false,
    hasAlpha,
    isLossless,
    targetMimeType: hasAlpha || isLossless ? PNG_MIME_TYPE : JPEG_MIME_TYPE,
    imageChunk,
  };
}

/**
 * @param {Blob | null | undefined} blob
 * @returns {Promise<WebpInspection>}
 */
export async function inspectWebpBlob(blob) {
  if (!blob) return createNonWebpInspection();

  const mimeType = normalizeMimeType(blob.type);
  const header = await readBlobRange(blob, 0, RIFF_HEADER_SIZE);
  const hasWebpHeader = header.length >= RIFF_HEADER_SIZE
    && matchesAscii(header, 0, 'RIFF')
    && matchesAscii(header, 8, 'WEBP');

  if (!hasWebpHeader) {
    if (mimeType === WEBP_MIME_TYPE) {
      throw new Error('WebP 文件头无效或图片已损坏');
    }
    return createNonWebpInspection();
  }

  if (typeof blob.arrayBuffer !== 'function') {
    throw new Error('当前环境无法读取 WebP 图片数据');
  }
  return inspectWebpBytes(new Uint8Array(await blob.arrayBuffer()));
}

/**
 * @param {string} objectUrl
 * @param {WebpTranscodeOptions} options
 * @param {WebpActiveWindowLike | null} activeWindow
 * @returns {Promise<WebpImageLike>}
 */
function loadImage(objectUrl, options, activeWindow) {
  return new Promise((resolve, reject) => {
    const ImageCtor = activeWindow?.Image;
    const image = typeof options.createImage === 'function'
      ? options.createImage()
      : (typeof ImageCtor === 'function' ? new ImageCtor() : null);

    if (!image) {
      reject(new Error('当前环境无法解码 WebP 图片'));
      return;
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('WebP 图片解码失败'));
    image.src = objectUrl;
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {'image/png' | 'image/jpeg'} targetMimeType
 * @returns {Promise<Blob>}
 */
function canvasToTargetBlob(canvas, targetMimeType) {
  if (typeof canvas?.toBlob !== 'function') {
    return Promise.reject(new Error('当前环境不支持 Canvas 图片转换'));
  }

  return new Promise((resolve, reject) => {
    const quality = targetMimeType === JPEG_MIME_TYPE ? JPEG_QUALITY : undefined;
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas 未生成图片数据'));
        return;
      }
      if (normalizeMimeType(blob.type) !== targetMimeType) {
        reject(new Error(`Canvas 输出格式错误：预期 ${targetMimeType}，实际 ${blob.type || '未知'}`));
        return;
      }
      resolve(blob);
    }, targetMimeType, quality);
  });
}

/**
 * @param {Blob} blob
 * @param {'image/png' | 'image/jpeg'} targetMimeType
 */
async function assertImageSignature(blob, targetMimeType) {
  const signatureSize = targetMimeType === PNG_MIME_TYPE ? 8 : 3;
  const bytes = await readBlobRange(blob, 0, signatureSize);
  const valid = targetMimeType === PNG_MIME_TYPE
    ? bytes.length === 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a
    : bytes.length === 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff;

  if (!valid) {
    throw new Error(`Canvas 输出的 ${targetMimeType === PNG_MIME_TYPE ? 'PNG' : 'JPEG'} 文件签名无效`);
  }
}

/**
 * @param {Blob} blob
 * @param {WebpTranscodeOptions} [options]
 * @returns {Promise<Blob>}
 */
export async function normalizeWechatUploadImageBlob(blob, options = {}) {
  /** @type {WebpInspection} */
  let inspection;
  try {
    inspection = await inspectWebpBlob(blob);
  } catch (error) {
    throw new Error(`WebP 转换失败：${getErrorMessage(error)}`);
  }
  if (!inspection.isWebp) return blob;
  if (inspection.isAnimated) {
    throw new Error('WebP 转换失败：暂不支持动画 WebP，请先转换为 GIF、PNG 或 JPEG');
  }
  if (inspection.targetMimeType !== PNG_MIME_TYPE && inspection.targetMimeType !== JPEG_MIME_TYPE) {
    throw new Error('WebP 转换失败：无法确定安全的输出格式');
  }

  const activeDocument = options.document || getActiveDocument();
  const activeWindow = /** @type {WebpActiveWindowLike | null} */ (activeDocument?.defaultView || null);
  const activeUrlApi = activeWindow?.URL || null;
  const activeCreateObjectUrl = /** @type {((blob: Blob) => string) | undefined} */ (activeUrlApi?.createObjectURL);
  const activeRevokeObjectUrl = /** @type {((url: string) => void) | undefined} */ (activeUrlApi?.revokeObjectURL);
  /** @type {((blob: Blob) => string) | null} */
  const createObjectUrl = typeof options.createObjectUrl === 'function'
    ? options.createObjectUrl
    : (activeUrlApi && typeof activeCreateObjectUrl === 'function'
      ? (value) => activeCreateObjectUrl(value)
      : null);
  /** @type {((url: string) => void) | null} */
  const revokeObjectUrl = typeof options.revokeObjectUrl === 'function'
    ? options.revokeObjectUrl
    : (activeUrlApi && typeof activeRevokeObjectUrl === 'function'
      ? (value) => {
          activeRevokeObjectUrl(value);
        }
      : null);

  if (!activeDocument || !createObjectUrl || !revokeObjectUrl) {
    throw new Error('WebP 转换失败：当前环境缺少图片转换能力');
  }

  let objectUrl = '';
  try {
    objectUrl = createObjectUrl(blob);
    const image = await loadImage(objectUrl, options, activeWindow);
    const width = Number(image.naturalWidth || image.width) || 0;
    const height = Number(image.naturalHeight || image.height) || 0;
    if (width <= 0 || height <= 0) {
      throw new Error('无法获取 WebP 图片尺寸');
    }

    const canvas = activeDocument.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建 Canvas 2D 上下文');

    context.drawImage(/** @type {CanvasImageSource} */ (image), 0, 0, width, height);
    const targetMimeType = inspection.targetMimeType;
    const outputBlob = await canvasToTargetBlob(canvas, targetMimeType);
    await assertImageSignature(outputBlob, targetMimeType);
    return outputBlob;
  } catch (error) {
    throw new Error(`WebP 转换失败：${getErrorMessage(error)}`);
  } finally {
    if (objectUrl) {
      revokeObjectUrl(objectUrl);
    }
  }
}

export {
  JPEG_QUALITY,
  JPEG_MIME_TYPE,
  PNG_MIME_TYPE,
};
