/*
## 核心功能

处理图片、SVG 或 Mermaid 资源的 article image assets 能力。

## 输入

接收本地资源路径、DOM 节点、图片字节、渲染选项和上传上下文。

## 输出

输出 `DEFAULT_MAX_IMAGE_SIZE_BYTES`、`DEFAULT_MAX_TOTAL_IMAGE_SIZE_BYTES`、`collectArticleImageReferences`、`findAssetForCover`、`findAssetForRenderedSrc`、`formatArticleImageWarnings`、`getFirstMarkdownImageSrc`、`mapAppUrlImagesToAssetUrls`、`replaceArticleContentImageSources`、`resolveArticleImages`，用于资源解析、栅格化、缓存或同步前替换。

## 定位

位于 services/，属于资源处理层；调用方只消费归一化结果。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

const DEFAULT_MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * @typedef {Record<string, unknown>} UnknownRecord
 * @typedef {{ path?: string, name?: string, extension?: string }} VaultFileLike
 * @typedef {{
 *   metadataCache?: { getFirstLinkpathDest?: (linkpath: string, sourcePath: string) => unknown },
 *   vault?: {
 *     adapter?: { basePath?: string },
 *     getAbstractFileByPath?: (path: string) => unknown,
 *     readBinary?: (file: VaultFileLike) => Promise<unknown>,
 *     getResourcePath?: (file: VaultFileLike) => string,
 *   },
 * }} ObsidianAppLike
 * @typedef {{ start: number, end: number }} TextRange
 * @typedef {{ type: string, start: number, end: number, raw: string, src: string, alt: string, sizeHint?: ImageSizeHint | null }} ImageReference
 * @typedef {{ code: string, message: string, severity: string, src: string, filename: string, size: number }} ImageWarning
 * @typedef {{
 *   kind: string,
 *   originalSrc: string,
 *   notePath: string,
 *   vaultRelativePath: string,
 *   resourceSrc?: string,
 *   placeholderSrc?: string,
 * }} ImageAssetSource
 * @typedef {{
 *   id: string,
 *   filename: string,
 *   mimeType: string,
 *   size: number,
 *   base64: string,
 *   source: ImageAssetSource,
 * }} ImageAsset
 * @typedef {{ start: number, end: number, value: string }} ReplacementRange
 * @typedef {{ width: number, height: number | null }} ImageSizeHint
 * @typedef {{ type: string, originalSrc: string, resolvedSrc: string, alt: string, sizeHint: ImageSizeHint | null }} ResolvedImageReference
 */

const SUPPORTED_IMAGE_MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** @type {Record<string, string>} */
const SUPPORTED_IMAGE_MIME_LOOKUP = SUPPORTED_IMAGE_MIME_BY_EXT;

const RECOGNIZED_UNSUPPORTED_IMAGE_MIME_BY_EXT = {
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
};

/** @type {Record<string, string>} */
const RECOGNIZED_UNSUPPORTED_IMAGE_MIME_LOOKUP = RECOGNIZED_UNSUPPORTED_IMAGE_MIME_BY_EXT;

/**
 * @param {unknown} value
 * @returns {value is UnknownRecord}
 */
function isRecord(value) {
  return !!value && typeof value === 'object';
}

/**
 * @param {unknown} value
 * @returns {UnknownRecord}
 */
function asRecord(value) {
  return isRecord(value) ? /** @type {UnknownRecord} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {VaultFileLike | null}
 */
function asVaultFile(value) {
  if (!isRecord(value)) return null;
  const source = asRecord(value);
  if (typeof source.path !== 'string' && typeof source.name !== 'string' && typeof source.extension !== 'string') return null;
  return /** @type {VaultFileLike} */ (value);
}

/**
 * @param {unknown} value
 * @returns {ObsidianAppLike}
 */
function asApp(value) {
  return /** @type {ObsidianAppLike} */ (isRecord(value) ? value : {});
}

/** @param {unknown} value */
function normalizePath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

/** @param {unknown} value */
function normalizeAbsoluteLocalPath(value) {
  let pathValue = String(value || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const hasDrivePrefix = /^[a-zA-Z]:\//.test(pathValue);
  if (!hasDrivePrefix) {
    pathValue = pathValue.replace(/\/+/g, '/');
  }
  if (pathValue.endsWith('/') && pathValue.length > (hasDrivePrefix ? 3 : 1)) {
    pathValue = pathValue.replace(/\/+$/, '');
  }
  return pathValue;
}

/** @param {unknown} filePath */
function getDirname(filePath) {
  const normalized = normalizePath(filePath);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
}

/** @param {...unknown} parts */
function joinVaultPath(...parts) {
  return normalizePath(parts.filter(Boolean).join('/'));
}

/** @param {unknown} filename */
function getExtension(filename) {
  const ext = String(filename || '').split('?')[0].split('#')[0].split('.').pop();
  return ext && ext !== filename ? ext.toLowerCase() : '';
}

/** @param {unknown} src */
function isRemoteImageSrc(src) {
  return /^https?:\/\//i.test(String(src || '').trim());
}

/** @param {unknown} src */
function isDataImageSrc(src) {
  return /^data:image\//i.test(String(src || '').trim());
}

/** @param {unknown} src */
function isAssetImageSrc(src) {
  return /^asset:\/\//i.test(String(src || '').trim());
}

/** @param {unknown} src */
function isFileUrl(src) {
  return /^file:\/\//i.test(String(src || '').trim());
}

/** @param {unknown} value */
function decodeLocalPath(value) {
  try {
    return decodeURI(String(value || '').trim());
  } catch {
    return String(value || '').trim();
  }
}

/** @param {unknown} src */
function getFileUrlPath(src) {
  try {
    const url = new URL(String(src || '').trim());
    if (url.protocol !== 'file:') return '';
    if (url.hostname && url.hostname !== 'localhost') return '';
    const pathname = decodeURIComponent(url.pathname || '');
    if (/^\/[a-zA-Z]:\//.test(pathname)) {
      return pathname.slice(1);
    }
    return pathname;
  } catch {
    return '';
  }
}

/**
 * @param {unknown} app
 * @param {unknown} localPath
 * @returns {string}
 */
function getVaultRelativePathFromLocalPath(app, localPath) {
  const appRef = asApp(app);
  const basePath = appRef.vault?.adapter?.basePath;
  if (!basePath || !localPath) return '';
  const normalizedBase = normalizeAbsoluteLocalPath(basePath);
  const normalizedLocal = normalizeAbsoluteLocalPath(localPath);
  if (!normalizedBase || !normalizedLocal) return '';
  if (normalizedLocal === normalizedBase) return '';
  if (!normalizedLocal.startsWith(`${normalizedBase}/`)) return '';
  return normalizePath(normalizedLocal.slice(normalizedBase.length + 1));
}

/** @param {unknown} src */
function getFilenameFromPath(src) {
  const value = String(src || '').split('?')[0].split('#')[0].replace(/\\/g, '/');
  const filename = value.split('/').filter(Boolean).pop();
  return filename || 'image';
}

/** @param {unknown} rawDestination */
function stripMarkdownDestination(rawDestination) {
  const raw = String(rawDestination || '').trim();
  if (raw.startsWith('<')) {
    const end = raw.indexOf('>');
    if (end > 0) return raw.slice(1, end).trim();
  }
  return raw.replace(/\\([()])/g, '$1').trim();
}

/** @param {unknown} rawTarget */
function splitWikiEmbedTarget(rawTarget) {
  const parts = String(rawTarget || '').split('|');
  const src = (parts.shift() || '').trim();
  let aliasParts = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  if (aliasParts.length > 1 && isLikelyWikiImageSizeHint(aliasParts[aliasParts.length - 1])) {
    aliasParts = aliasParts.slice(0, -1);
  }
  const alias = aliasParts.join('|').trim();
  return { src, alias };
}

/** @param {unknown} value */
function isLikelyWikiImageSizeHint(value) {
  return /^\d+(?:\s*x\s*\d+)?$/i.test(String(value || '').trim());
}

/**
 * @param {unknown} value
 * @returns {ImageSizeHint | null}
 */
function parseImageSizeHint(value) {
  const match = String(value || '').trim().match(/^(\d+)(?:\s*x\s*(\d+))?$/i);
  if (!match) return null;
  const width = Number(match[1] || 0);
  const height = match[2] ? Number(match[2]) : null;
  if (!Number.isFinite(width) || width <= 0) return null;
  if (height !== null && (!Number.isFinite(height) || height <= 0)) return null;
  return { width, height };
}

/**
 * @param {unknown} altText
 * @returns {ImageSizeHint | null}
 */
function extractSizeHintFromAltText(altText) {
  const raw = String(altText || '').trim();
  if (!raw) return null;
  if (!raw.includes('|')) return parseImageSizeHint(raw);
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  return parseImageSizeHint(parts[parts.length - 1]);
}

/**
 * @param {unknown} src
 * @param {string} fallback
 */
function createAltFromSrc(src, fallback = '图片') {
  const filename = getFilenameFromPath(src);
  return filename.replace(/\.(png|jpe?g|gif|webp|svg|heic|heif|avif)$/i, '') || fallback;
}

/**
 * @param {unknown} markdown
 * @returns {ImageReference[]}
 */
function collectWikiImageEmbeds(markdown) {
  const sourceMarkdown = String(markdown || '');
  /** @type {ImageReference[]} */
  const results = [];
  const pattern = /!\[\[([^\]\n]+?)\]\]/g;
  let match;
  while ((match = pattern.exec(sourceMarkdown)) !== null) {
    const { src, alias } = splitWikiEmbedTarget(match[1]);
    if (!src) continue;
    results.push({
      type: 'wiki',
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      src,
      alt: alias || createAltFromSrc(src),
      sizeHint: parseImageSizeHint(String(match[1] || '').split('|').map((part) => part.trim()).filter(Boolean).pop() || ''),
    });
  }
  return results;
}

/** @param {unknown} src */
function isImageWikiTarget(src) {
  const ext = getExtension(String(src || '').split('#')[0]);
  return !!(SUPPORTED_IMAGE_MIME_BY_EXT[ext] || RECOGNIZED_UNSUPPORTED_IMAGE_MIME_BY_EXT[ext]);
}

/**
 * @param {unknown} markdown
 * @returns {ImageReference[]}
 */
function collectPlainWikiImageLinks(markdown) {
  const sourceMarkdown = String(markdown || '');
  /** @type {ImageReference[]} */
  const results = [];
  const pattern = /\[\[([^\]\n]+?)\]\]/g;
  let match;
  while ((match = pattern.exec(sourceMarkdown)) !== null) {
    if (sourceMarkdown[match.index - 1] === '!') continue;
    const { src, alias } = splitWikiEmbedTarget(match[1]);
    if (!src || !isImageWikiTarget(src)) continue;
    results.push({
      type: 'wiki-link',
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      src,
      alt: alias || createAltFromSrc(src),
      sizeHint: parseImageSizeHint(String(match[1] || '').split('|').map((part) => part.trim()).filter(Boolean).pop() || ''),
    });
  }
  return results;
}

/**
 * @param {unknown} markdown
 * @returns {ImageReference[]}
 */
function collectMarkdownImages(markdown) {
  const sourceMarkdown = String(markdown || '');
  /** @type {ImageReference[]} */
  const results = [];
  let index = 0;
  while (index < sourceMarkdown.length) {
    const start = sourceMarkdown.indexOf('![', index);
    if (start < 0) break;

    let cursor = start + 2;
    let escaped = false;
    let altEnd = -1;
    while (cursor < sourceMarkdown.length) {
      const char = sourceMarkdown[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === ']') {
        altEnd = cursor;
        break;
      }
      cursor += 1;
    }
    if (altEnd < 0 || sourceMarkdown[altEnd + 1] !== '(') {
      index = start + 2;
      continue;
    }

    const destinationStart = altEnd + 2;
    cursor = destinationStart;
    let depth = 0;
    escaped = false;
    let destinationEnd = -1;
    while (cursor < sourceMarkdown.length) {
      const char = sourceMarkdown[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        if (depth === 0) {
          destinationEnd = cursor;
          break;
        }
        depth -= 1;
      }
      cursor += 1;
    }
    if (destinationEnd < 0) {
      index = start + 2;
      continue;
    }

    const alt = sourceMarkdown.slice(start + 2, altEnd);
    const destination = stripMarkdownDestination(sourceMarkdown.slice(destinationStart, destinationEnd));
    if (destination) {
      const sizeHint = extractSizeHintFromAltText(alt);
      results.push({
        type: 'markdown',
        start,
        end: destinationEnd + 1,
        raw: sourceMarkdown.slice(start, destinationEnd + 1),
        src: destination,
        alt,
        sizeHint,
      });
    }
    index = destinationEnd + 1;
  }
  return results;
}

/**
 * @param {unknown} markdown
 * @returns {TextRange[]}
 */
function collectFencedCodeRanges(markdown) {
  const sourceMarkdown = String(markdown || '');
  /** @type {TextRange[]} */
  const ranges = [];
  const fencePattern = /^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  let match;
  /** @type {{ start: number, marker: string, length: number } | null} */
  let open = null;
  while ((match = fencePattern.exec(sourceMarkdown)) !== null) {
    const marker = match[2][0];
    const length = match[2].length;
    if (!open) {
      open = { start: match.index, marker, length };
      continue;
    }
    if (open.marker === marker && length >= open.length) {
      ranges.push({ start: open.start, end: match.index + match[0].length });
      open = null;
    }
  }
  if (open) ranges.push({ start: open.start, end: sourceMarkdown.length });
  return ranges;
}

/**
 * @param {unknown} markdown
 * @param {TextRange[]} blockedRanges
 * @returns {TextRange[]}
 */
function collectInlineCodeRanges(markdown, blockedRanges = []) {
  const sourceMarkdown = String(markdown || '');
  /** @type {TextRange[]} */
  const ranges = [];
  let index = 0;
  while (index < sourceMarkdown.length) {
    const blocked = blockedRanges.find((range) => index >= range.start && index < range.end);
    if (blocked) {
      index = blocked.end;
      continue;
    }

    if (sourceMarkdown[index] !== '`') {
      index += 1;
      continue;
    }

    let runEnd = index + 1;
    while (runEnd < sourceMarkdown.length && sourceMarkdown[runEnd] === '`') runEnd += 1;
    const tickRun = sourceMarkdown.slice(index, runEnd);
    const closing = sourceMarkdown.indexOf(tickRun, runEnd);
    if (closing < 0) {
      index = runEnd;
      continue;
    }

    ranges.push({ start: index, end: closing + tickRun.length });
    index = closing + tickRun.length;
  }
  return ranges;
}

/**
 * @param {number} index
 * @param {TextRange[]} ranges
 */
function isInsideRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

/**
 * @param {unknown} markdown
 * @returns {ImageReference[]}
 */
function collectArticleImageReferences(markdown) {
  const sourceMarkdown = String(markdown || '');
  const fencedCodeRanges = collectFencedCodeRanges(sourceMarkdown);
  const codeRanges = [
    ...fencedCodeRanges,
    ...collectInlineCodeRanges(sourceMarkdown, fencedCodeRanges),
  ];
  return [
    ...collectWikiImageEmbeds(sourceMarkdown),
    ...collectPlainWikiImageLinks(sourceMarkdown),
    ...collectMarkdownImages(sourceMarkdown),
  ]
    .filter((ref) => !isInsideRanges(ref.start, codeRanges))
    .sort((a, b) => a.start - b.start);
}

/** @param {unknown} binary */
function bufferFromBinary(binary) {
  if (Buffer.isBuffer(binary)) return binary;
  if (binary instanceof ArrayBuffer) return Buffer.from(binary);
  if (ArrayBuffer.isView(binary)) {
    return Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength);
  }
  return Buffer.from(binary || []);
}

/**
 * @param {unknown} filename
 * @param {Buffer} buffer
 * @returns {string}
 */
function inferMimeType(filename, buffer) {
  const ext = getExtension(filename);
  if (SUPPORTED_IMAGE_MIME_LOOKUP[ext]) return SUPPORTED_IMAGE_MIME_LOOKUP[ext];
  if (RECOGNIZED_UNSUPPORTED_IMAGE_MIME_LOOKUP[ext]) {
    return RECOGNIZED_UNSUPPORTED_IMAGE_MIME_LOOKUP[ext];
  }
  if (buffer?.length >= 12) {
    if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG') return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  }
  return ext ? `image/${ext}` : 'application/octet-stream';
}

/**
 * @param {string} code
 * @param {string} message
 * @param {Partial<ImageWarning>} details
 * @returns {ImageWarning}
 */
function createWarning(code, message, details = {}) {
  const severity = typeof details.severity === 'string' ? details.severity : 'error';
  return {
    code,
    message,
    severity,
    src: details.src || '',
    filename: details.filename || '',
    size: details.size || 0,
  };
}

/** @param {unknown} filename */
function isSupportedImageFile(filename) {
  return !!SUPPORTED_IMAGE_MIME_LOOKUP[getExtension(filename)];
}

/** @param {unknown} filename */
function isRecognizedUnsupportedImageFile(filename) {
  return !!RECOGNIZED_UNSUPPORTED_IMAGE_MIME_LOOKUP[getExtension(filename)];
}

/** @param {unknown} noteFile */
function getNoteSourcePath(noteFile) {
  const file = asVaultFile(noteFile);
  return file?.path || '';
}

/**
 * @param {unknown} app
 * @param {unknown} src
 * @param {unknown} noteFile
 * @returns {VaultFileLike | null}
 */
function resolveVaultFile(app, src, noteFile) {
  const appRef = asApp(app);
  if (!appRef || !src) return null;
  const decoded = String((() => {
    try {
      return decodeURI(src);
    } catch {
      return src;
    }
  })() || '');
  const sourcePath = getNoteSourcePath(noteFile);
  const metadataCache = appRef.metadataCache;
  const vault = appRef.vault;
  const lookupSrc = getVaultRelativePathFromLocalPath(appRef, decoded) || decoded;

  try {
    const linked = asVaultFile(metadataCache?.getFirstLinkpathDest?.(lookupSrc, sourcePath));
    if (linked?.extension) return linked;
  } catch {
    // Fall through to path-based candidates.
  }

  /** @type {string[]} */
  const candidates = [];
  const normalized = normalizePath(lookupSrc);
  if (normalized) candidates.push(normalized);
  if (sourcePath && normalized && !normalized.startsWith('/')) {
    const noteDir = getDirname(sourcePath);
    candidates.push(joinVaultPath(noteDir, normalized));
  }

  for (const candidate of candidates) {
    try {
      const file = asVaultFile(vault?.getAbstractFileByPath?.(candidate));
      if (file?.extension) return file;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * @param {unknown} app
 * @param {VaultFileLike} file
 * @returns {Promise<{ buffer: Buffer, filename: string, vaultRelativePath: string, resourceSrc: string }>}
 */
async function readVaultAsset(app, file) {
  const appRef = asApp(app);
  const binary = await appRef.vault?.readBinary?.(file);
  const buffer = bufferFromBinary(binary);
  let resourceSrc = '';
  try {
    resourceSrc = appRef.vault?.getResourcePath?.(file) || '';
  } catch {
    resourceSrc = '';
  }
  return {
    buffer,
    filename: file.name || getFilenameFromPath(file.path),
    vaultRelativePath: file.path || '',
    resourceSrc,
  };
}

function makeAssetId(index) {
  return `image-${index}`;
}

function createMarkdownImage(alt, src) {
  const safeAlt = String(alt || createAltFromSrc(src)).replace(/\]/g, '\\]');
  return `![${safeAlt}](${src})`;
}

/**
 * @param {unknown} markdown
 * @param {ReplacementRange[]} replacements
 * @returns {string}
 */
function replaceRanges(markdown, replacements) {
  const sourceMarkdown = String(markdown || '');
  return replacements
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((output, item) => (
      output.slice(0, item.start) + item.value + output.slice(item.end)
    ), sourceMarkdown);
}

/** @param {unknown} src */
function isLocalLikeSrc(src) {
  if (!src) return false;
  if (isRemoteImageSrc(src) || isDataImageSrc(src) || isAssetImageSrc(src)) return false;
  return true;
}

/**
 * @param {{
 *   app: unknown,
 *   src: string,
 *   noteFile: unknown,
 *   assetIndex: number,
 *   originalSrc?: string,
 *   existingByKey: Map<string, ImageAsset>,
 *   limits: { maxImageSizeBytes: number, maxTotalImageSizeBytes: number, unsupportedExtensions?: Set<string> },
 *   embedAssetBase64?: boolean,
 * }} params
 * @returns {Promise<{ asset?: ImageAsset, warning?: ImageWarning, reused?: boolean }>}
 */
async function resolveLocalImageAsset({
  app,
  src,
  noteFile,
  assetIndex,
  originalSrc = src,
  existingByKey,
  limits,
  embedAssetBase64 = true,
}) {
  /** @type {VaultFileLike | null} */
  let file = null;
  /** @type {{ buffer: Buffer, filename: string, vaultRelativePath: string, resourceSrc: string } | null} */
  let readResult = null;
  let cacheKey = '';

  if (isFileUrl(src)) {
    const filePath = getFileUrlPath(src);
    const vaultRelativePath = getVaultRelativePathFromLocalPath(app, filePath);
    if (!vaultRelativePath) {
      return {
        warning: createWarning('image_outside_vault_unsupported', '只支持读取当前 vault 内的 file:// 图片', { src: originalSrc }),
      };
    }
    file = resolveVaultFile(app, vaultRelativePath, noteFile);
    if (!file) {
      return {
        warning: createWarning('image_local_missing', '本地图片未找到', { src: originalSrc }),
      };
    }
    cacheKey = `vault:${file.path || vaultRelativePath}`;
  } else {
    file = resolveVaultFile(app, decodeLocalPath(src), noteFile);
    if (!file) {
      return {
        warning: createWarning('image_local_missing', '本地图片未找到', { src: originalSrc }),
      };
    }
    cacheKey = `vault:${file.path || src}`;
  }

  if (existingByKey.has(cacheKey)) {
    const cached = existingByKey.get(cacheKey);
    return cached ? { asset: cached, reused: true } : {};
  }

  const fileNameBeforeRead = file?.name || getFilenameFromPath(file?.path || src);
  const fileExtension = getExtension(fileNameBeforeRead);
  if (limits.unsupportedExtensions?.has(fileExtension)) {
    return {
      warning: createWarning('image_unsupported_for_target', `当前目标暂不支持该图片格式：${fileNameBeforeRead}`, {
        src: originalSrc,
        filename: fileNameBeforeRead,
      }),
    };
  }

  try {
    readResult = await readVaultAsset(app, file);
  } catch (error) {
    const errorMessage = isRecord(error) && typeof error.message === 'string' ? error.message : String(error);
    return {
      warning: createWarning('image_local_read_failed', `读取本地图片失败：${errorMessage}`, {
        src: originalSrc,
        filename: file?.name || getFilenameFromPath(src),
      }),
    };
  }

  const { buffer, filename, vaultRelativePath, resourceSrc } = readResult;
  const mimeType = inferMimeType(filename, buffer);
  const size = buffer.length;

  if (!isSupportedImageFile(filename)) {
    const code = isRecognizedUnsupportedImageFile(filename) ? 'image_invalid_mime' : 'image_invalid_mime';
    return {
      warning: createWarning(code, `暂不支持该图片格式：${filename}`, {
        src: originalSrc,
        filename,
        size,
      }),
    };
  }

  if (size > limits.maxImageSizeBytes) {
    return {
      warning: createWarning('image_too_large', `图片超过 ${Math.round(limits.maxImageSizeBytes / 1024 / 1024)} MB：${filename}`, {
        src: originalSrc,
        filename,
        size,
      }),
    };
  }

  const asset = /** @type {ImageAsset} */ ({
    id: makeAssetId(assetIndex),
    filename,
    mimeType,
    size,
    source: {
      kind: 'obsidian-local',
      originalSrc,
      notePath: getNoteSourcePath(noteFile),
      vaultRelativePath,
    },
  });
  if (embedAssetBase64 !== false) {
    asset.base64 = buffer.toString('base64');
  }
  if (resourceSrc) asset.source.resourceSrc = resourceSrc;

  existingByKey.set(cacheKey, asset);
  return { asset };
}

/** @param {unknown} markdown */
function getFirstMarkdownImageSrc(markdown) {
  const first = collectArticleImageReferences(markdown)[0];
  return first?.src || '';
}

/**
 * @param {unknown} html
 * @param {ImageAsset[]} assets
 * @returns {string}
 */
function replaceArticleContentImageSources(html, assets = []) {
  let output = String(html || '');
  for (const asset of assets) {
    const assetSrc = `asset://${asset.id}`;
    const candidates = /** @type {string[]} */ ([
      asset?.source?.resourceSrc,
      asset?.source?.originalSrc,
      asset?.source?.vaultRelativePath,
    ].filter(Boolean));
    for (const candidate of candidates) {
      output = output.replace(
        new RegExp(`(<img\\b[^>]*\\bsrc=["'])${escapeRegExp(candidate)}(["'][^>]*>)`, 'gi'),
        `$1${assetSrc}$2`
      );
    }
  }
  return output;
}

/** @param {unknown} value */
function stripUrlQueryHash(value) {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw.split('?')[0].split('#')[0];
  }
}

/** @param {unknown} renderedSrc */
function getRenderedSrcVaultPath(renderedSrc) {
  // Obsidian renders local images as `app://<vault-id>/<vault-relative-path>?<hash>`.
  // The pathname (after URL-decode + leading-slash strip) recovers the vault path.
  try {
    const url = new URL(String(renderedSrc || ''));
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return '';
  }
}

/**
 * @param {unknown} renderedSrc
 * @param {ImageAsset[]} assets
 * @returns {ImageAsset | null}
 */
function findAssetForRenderedSrc(renderedSrc, assets = []) {
  const src = String(renderedSrc || '');
  if (!src || !Array.isArray(assets) || !assets.length) return null;

  // 1) Exact resourceSrc match (ignoring query/hash) — most reliable since
  //    both Obsidian's renderer and resolveArticleImages call getResourcePath.
  const renderedKey = stripUrlQueryHash(src);
  for (const asset of assets) {
    const resourceSrc = asset?.source?.resourceSrc || '';
    if (!resourceSrc) continue;
    if (stripUrlQueryHash(resourceSrc) === renderedKey) return asset;
  }

  // 2) URL pathname suffix match against vaultRelativePath / originalSrc.
  //    Use exact equality or '/' + candidate suffix to avoid filename-only
  //    false positives across different folders.
  const pathInRenderedSrc = getRenderedSrcVaultPath(src);
  if (!pathInRenderedSrc) return null;

  for (const asset of assets) {
    const candidates = /** @type {string[]} */ ([
      asset?.source?.vaultRelativePath,
      asset?.source?.originalSrc,
    ].filter(Boolean));
    for (const candidate of candidates) {
      if (pathInRenderedSrc === candidate) return asset;
      if (pathInRenderedSrc.endsWith(`/${candidate}`)) return asset;
    }
  }

  return null;
}

// Bridge publish flow helper: given a cover string ('asset://<id>',
// 'https://...', 'data:...', or empty), return the matching asset entry
// when the cover refers to a local asset, else null. Used to pull the
// asset bytes for inline thumbnail generation.
/**
 * @param {unknown} coverString
 * @param {ImageAsset[]} assets
 * @returns {ImageAsset | null}
 */
function findAssetForCover(coverString, assets = []) {
  const cover = String(coverString || '').trim();
  if (!cover.startsWith('asset://')) return null;
  if (!Array.isArray(assets) || !assets.length) return null;
  const id = cover.slice('asset://'.length);
  if (!id) return null;
  for (const asset of assets) {
    if (asset && asset.id === id) return asset;
  }
  return null;
}

// Bridge publish flow: rewrite every <img src="app://..."> (or capacitor://)
// in the rendered HTML back to asset://<id>, using the same assets[] that
// resolveArticleImages produced. Remote https://, data:, and unmatched
// app:// urls are left untouched (the latter become a downstream warning,
// which is preferable to silently inlining base64).
/**
 * @param {unknown} html
 * @param {ImageAsset[]} assets
 * @returns {string}
 */
function mapAppUrlImagesToAssetUrls(html, assets = []) {
  if (!html) return '';
  return String(html).replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix, src, suffix) => {
      const source = /** @type {unknown} */ (src);
      const srcValue = String(source || '');
      if (!/^(app|capacitor):\/\//i.test(srcValue)) return String(match || '');
      const asset = findAssetForRenderedSrc(srcValue, assets);
      if (!asset) return String(match || '');
      return `${String(prefix || '')}asset://${asset.id}${String(suffix || '')}`;
    }
  );
}

/** @param {unknown} value */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {ImageWarning[]} warnings
 * @returns {string}
 */
function formatArticleImageWarnings(warnings = []) {
  const items = warnings.filter((warning) => warning?.severity !== 'info');
  if (!items.length) return '';
  const preview = items.slice(0, 3).map((warning) => {
    const target = warning.filename || warning.src || '图片';
    return `${warning.message || '图片处理失败'}（${target}）`;
  }).join('；');
  const suffix = items.length > 3 ? `，另有 ${items.length - 3} 项` : '';
  return `${preview}${suffix}`;
}

/**
 * @param {unknown} markdown
 * @param {unknown} noteFile
 * @param {{ app?: unknown, maxImageSizeBytes?: number, maxTotalImageSizeBytes?: number, unsupportedImageExtensions?: string[], cover?: string, localImageSrcFactory?: (asset: ImageAsset) => string, embedAssetBase64?: boolean }} options
 * @returns {Promise<{ markdown: string, assets: ImageAsset[], warnings: ImageWarning[], cover: string, firstImageSrc: string, references: ResolvedImageReference[] }>}
 */
async function resolveArticleImages(markdown, noteFile, options = {}) {
  const app = options.app;
  const limits = {
    maxImageSizeBytes: options.maxImageSizeBytes || DEFAULT_MAX_IMAGE_SIZE_BYTES,
    maxTotalImageSizeBytes: options.maxTotalImageSizeBytes || DEFAULT_MAX_TOTAL_IMAGE_SIZE_BYTES,
    unsupportedExtensions: new Set((options.unsupportedImageExtensions || []).map((ext) => String(ext || '').toLowerCase().replace(/^\./, '')).filter(Boolean)),
  };
  const sourceMarkdown = String(markdown || '');
  const references = collectArticleImageReferences(sourceMarkdown);
  /** @type {ImageWarning[]} */
  const warnings = [];
  /** @type {ReplacementRange[]} */
  const replacements = [];
  /** @type {ImageAsset[]} */
  const assets = [];
  /** @type {Map<string, ImageAsset>} */
  const existingByKey = new Map();
  /** @type {ResolvedImageReference[]} */
  const resolvedReferences = [];

  /**
   * @param {unknown} src
   * @param {unknown} originalSrc
   * @returns {Promise<{ src: string, asset?: ImageAsset, warning?: ImageWarning }>}
   */
  const resolveSrc = async (src, originalSrc = src) => {
    const trimmed = String(src || '').trim();
    const original = String(originalSrc || '');
    if (!trimmed) return { src: trimmed };
    if (!isLocalLikeSrc(trimmed)) return { src: trimmed };
    if (!isFileUrl(trimmed) && /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return {
        src: trimmed,
        warning: createWarning('image_unsupported_protocol', '不支持的图片地址', { src: original }),
      };
    }

    const result = await resolveLocalImageAsset({
      app,
      src: trimmed,
      noteFile,
      assetIndex: assets.length + 1,
      originalSrc: original,
      existingByKey,
      limits,
      embedAssetBase64: options.embedAssetBase64 !== false,
    });
    if (result.warning) return { src: trimmed, warning: result.warning };
    if (result.asset && !result.reused) assets.push(result.asset);
    if (!result.asset) return { src: trimmed };
    const replacementSrc = typeof options.localImageSrcFactory === 'function'
      ? options.localImageSrcFactory(result.asset)
      : `asset://${result.asset.id}`;
    if (replacementSrc && replacementSrc !== `asset://${result.asset.id}`) {
      result.asset.source.placeholderSrc = replacementSrc;
    }
    return { src: replacementSrc || `asset://${result.asset.id}`, asset: result.asset };
  };

  for (const ref of references) {
    const result = await resolveSrc(ref.src, ref.src);
    resolvedReferences.push({
      type: ref.type,
      originalSrc: ref.src,
      resolvedSrc: result.src,
      alt: ref.alt,
      sizeHint: ref.sizeHint || null,
    });
    if (result.warning) {
      warnings.push(result.warning);
      continue;
    }
    if (result.src !== ref.src) {
      replacements.push({
        start: ref.start,
        end: ref.end,
        value: createMarkdownImage(ref.alt, result.src),
      });
    }
  }

  let cover = options.cover || '';
  if (cover && isLocalLikeSrc(cover)) {
    const coverResult = await resolveSrc(cover, cover);
    if (coverResult.warning) {
      warnings.push(coverResult.warning);
    } else {
      cover = coverResult.src;
    }
  }

  const totalSize = assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
  if (totalSize > limits.maxTotalImageSizeBytes) {
    warnings.push(createWarning('image_too_large', `文章图片总量超过 ${Math.round(limits.maxTotalImageSizeBytes / 1024 / 1024)} MB`, {
      size: totalSize,
    }));
  }

  const resolvedMarkdown = replaceRanges(sourceMarkdown, replacements);
  return {
    markdown: resolvedMarkdown,
    assets,
    warnings,
    cover,
    firstImageSrc: getFirstMarkdownImageSrc(resolvedMarkdown),
    references: resolvedReferences,
  };
}

export {
  DEFAULT_MAX_IMAGE_SIZE_BYTES,
  DEFAULT_MAX_TOTAL_IMAGE_SIZE_BYTES,
  collectArticleImageReferences,
  findAssetForCover,
  findAssetForRenderedSrc,
  formatArticleImageWarnings,
  getFirstMarkdownImageSrc,
  mapAppUrlImagesToAssetUrls,
  replaceArticleContentImageSources,
  resolveArticleImages,
};
