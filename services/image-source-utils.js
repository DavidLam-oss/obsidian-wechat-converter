import { normalizeVaultPath } from './path-utils.js';

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

/**
 * @param {string} dataUrl
 * @returns {Blob}
 */
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

/**
 * @param {unknown} binary
 * @returns {ArrayBuffer}
 */
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

/**
 * @param {string} filename
 * @returns {string}
 */
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

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeDecodeUriText(value) {
  const text = String(value || '').trim();
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

/**
 * @param {string} src
 * @returns {string}
 */
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

/**
 * @param {{ vault?: { adapter?: unknown } } | null | undefined} app
 * @returns {string}
 */
function getVaultAdapterBasePath(app) {
  const adapter = app?.vault?.adapter;
  if (!adapter || typeof adapter !== 'object') return '';
  const basePath = adapter['basePath'];
  return typeof basePath === 'string' ? basePath : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAbsoluteLocalPath(value) {
  let pathValue = String(value || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const hasDrivePrefix = /^[a-zA-Z]:\//.test(pathValue);
  if (!hasDrivePrefix) {
    pathValue = pathValue.replace(/\/+/g, '/');
  }
  return pathValue.replace(/\/+$/, '');
}

/**
 * @param {{ vault?: { adapter?: unknown } } | null | undefined} app
 * @param {string} localPath
 * @returns {string}
 */
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

/**
 * @param {string} filePath
 * @returns {string}
 */
function getVaultDirnameFromPath(filePath) {
  const normalized = normalizeVaultPath(String(filePath || ''));
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

export {
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
};
