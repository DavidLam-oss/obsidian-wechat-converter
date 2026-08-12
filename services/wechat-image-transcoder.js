/*
## 核心功能

在微信公众号素材上传前识别 WebP 图片，并按原始尺寸转换为 PNG Blob。

## 输入

接收待上传的图片 Blob，以及测试或特殊运行环境可选注入的 DOM/图片解码依赖。

## 输出

输出可直接上传微信的图片 Blob；非 WebP 保持原对象，WebP 统一输出 `image/png`。

## 定位

位于 services/，属于微信媒体上传前的格式兼容层；不修改 Markdown、预览 DOM 或图床资源。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 转码只发生在内存中，不写回源文件或 Vault。
- WebP 以 MIME 或 RIFF/WEBP 文件头任一命中为准。
- 保持原始像素尺寸，不在本层增加压缩或缩放策略。
*/

import { getActiveDocument } from './dom-utils.js';

const WEBP_HEADER_SIZE = 12;
const PNG_MIME_TYPE = 'image/png';

/**
 * @typedef {{
 *   document?: Document | null,
 *   createImage?: (() => HTMLImageElement) | null,
 *   createObjectUrl?: ((blob: Blob) => string) | null,
 *   revokeObjectUrl?: ((url: string) => void) | null,
 * }} WebpTranscodeOptions
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

/**
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
async function readBlobArrayBuffer(blob) {
  if (typeof blob?.arrayBuffer === 'function') {
    return await blob.arrayBuffer();
  }

  if (typeof FileReader !== 'function') {
    throw new Error('当前环境无法读取图片数据');
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('读取图片数据失败'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('读取图片数据失败'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * @param {Blob | null | undefined} blob
 * @returns {Promise<boolean>}
 */
export async function isWebpBlob(blob) {
  if (!blob) return false;
  if (normalizeMimeType(blob.type) === 'image/webp') return true;
  if (typeof blob.slice !== 'function') return false;

  const headerBuffer = await readBlobArrayBuffer(blob.slice(0, WEBP_HEADER_SIZE));
  const bytes = new Uint8Array(headerBuffer);
  if (bytes.length < WEBP_HEADER_SIZE) return false;

  return bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
function canvasToPngBlob(canvas) {
  if (typeof canvas?.toBlob !== 'function') {
    return Promise.reject(new Error('当前环境不支持 Canvas PNG 转换'));
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas 未生成 PNG 数据'));
        return;
      }
      resolve(normalizeMimeType(blob.type) === PNG_MIME_TYPE
        ? blob
        : new Blob([blob], { type: PNG_MIME_TYPE }));
    }, PNG_MIME_TYPE);
  });
}

/**
 * @param {string} objectUrl
 * @param {WebpTranscodeOptions} options
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(objectUrl, options) {
  return new Promise((resolve, reject) => {
    const image = typeof options.createImage === 'function'
      ? options.createImage()
      : (typeof Image === 'function' ? new Image() : null);

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
 * @param {Blob} blob
 * @param {WebpTranscodeOptions} [options]
 * @returns {Promise<Blob>}
 */
export async function normalizeWechatUploadImageBlob(blob, options = {}) {
  if (!(await isWebpBlob(blob))) return blob;

  const activeDocument = options.document || getActiveDocument();
  const createObjectUrl = options.createObjectUrl
    || (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? (value) => URL.createObjectURL(value)
      : null);
  const revokeObjectUrl = options.revokeObjectUrl
    || (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function'
      ? (value) => URL.revokeObjectURL(value)
      : null);

  if (!activeDocument || typeof createObjectUrl !== 'function') {
    throw new Error('WebP 转 PNG 失败：当前环境缺少图片转换能力');
  }

  let objectUrl = '';
  try {
    objectUrl = createObjectUrl(blob);
    const image = await loadImage(objectUrl, options);
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

    context.drawImage(image, 0, 0, width, height);
    return await canvasToPngBlob(canvas);
  } catch (error) {
    throw new Error(`WebP 转 PNG 失败：${getErrorMessage(error)}`);
  } finally {
    if (objectUrl && typeof revokeObjectUrl === 'function') {
      revokeObjectUrl(objectUrl);
    }
  }
}
