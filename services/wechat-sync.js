/*
## 核心功能

实现微信公众号同步链路的 wechat sync 服务能力。

## 输入

接收插件设置、账号凭证、文章 HTML、图片资源、frontmatter 元数据和微信 API 响应。

## 输出

输出 `inspectWechatDraftContent`、`replaceUnuploadedDraftImagesWithPlaceholders`、`createWechatSyncService`，用于草稿创建/更新、素材上传、清洗、缓存或错误呈现。

## 定位

位于 services/，属于微信发布服务层；不直接操作设置页 DOM。

## 依赖

关键依赖：`./dom-utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { createHtmlContainer, getActiveDocument } from './dom-utils.js';

/**
 * @typedef {{ mediaId: string, fingerprint?: string, uploadedAt?: number }} CoverCacheEntry
 * @typedef {{ src: string, message?: string }} ImageUploadFailure
 * @typedef {{ code: string, message: string, value: string }} DraftContentIssue
 * @typedef {{
 *   id?: string,
 *   appId: string,
 *   appSecret: string,
 *   author?: string,
 *   contentSourceUrl?: string,
 *   openComment?: boolean,
 *   onlyFansCanComment?: boolean,
 * }} WechatAccountLike
 * @typedef {{ title?: string, coverSrc?: string }} PublishMetaLike
 * @typedef {{ basename?: string }} ActiveFileLike
 * @typedef {{ title: string, content: string, thumb_media_id: string, author: string, digest: string, content_source_url?: string, need_open_comment?: number, only_fans_can_comment?: number }} DraftArticleLike
 * @typedef {{
 *   uploadCover: (blob: Blob) => Promise<{ media_id?: string }>,
 *   updateDraft: (mediaId: string, draftIndex: number, article: DraftArticleLike) => Promise<unknown>,
 *   createDraft: (article: DraftArticleLike) => Promise<{ media_id?: string }>,
 * }} WechatDraftApiLike
 * @typedef {{
 *   createApi: (appId: string, appSecret: string, proxyUrl?: string) => WechatDraftApiLike,
 *   srcToBlob: (src: string) => Promise<Blob>,
 *   coverUploadCache?: Map<string, string | CoverCacheEntry> | null,
 *   processAllImages: (html: string, api: WechatDraftApiLike, progressCallback: (current: number, total: number) => void, options: { accountId: string, onImageFailure: (failures: ImageUploadFailure[]) => void }) => Promise<string>,
 *   processMathFormulas: (html: string, api: WechatDraftApiLike, progressCallback: (current: number, total: number) => void) => Promise<string>,
 *   prepareHtmlForDraft?: (html: string) => Promise<string>,
 *   cleanHtmlForDraft: (html: string) => string,
 *   cleanupConfiguredDirectory: (activeFile?: ActiveFileLike | null) => Promise<unknown>,
 *   getFirstImageFromArticle: () => string,
 * }} WechatSyncDeps
 * @typedef {{
 *   account: WechatAccountLike,
 *   proxyUrl?: string,
 *   currentHtml: string,
 *   activeFile?: ActiveFileLike | null,
 *   publishMeta?: PublishMetaLike | null,
 *   sessionTitle?: string,
 *   sessionCoverBase64?: string,
 *   sessionThumbMediaId?: string,
 *   sessionDigest?: string,
 *   draftMediaId?: string,
 *   draftIndex?: number,
 *   onStatus?: (stage: string) => void,
 *   onImageProgress?: (current: number, total: number) => void,
 *   onMathProgress?: (current: number, total: number) => void,
 * }} SyncToDraftOptions
 */

/**
 * @param {string} code
 * @param {string} message
 * @param {unknown} value
 * @returns {DraftContentIssue}
 */
function createDraftContentIssue(code, message, value = '') {
  return {
    code,
    message,
    value: String(value || ''),
  };
}

/**
 * @param {unknown} src
 * @returns {boolean}
 */
function isWechatDraftImageSrc(src) {
  const value = String(src || '').trim();
  return /^https?:\/\/mmbiz\.qpic\.cn\//i.test(value)
    || /^https?:\/\/mmbiz\.qlogo\.cn\//i.test(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isWechatUnsafeLocalResource(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^(app|capacitor|file|obsidian):\/\//i.test(text)) return true;
  if (/^data:/i.test(text)) return true;
  if (/^(https?:|mailto:|tel:|#)/i.test(text)) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(text);
}

/**
 * @param {unknown} value
 * @returns {URL | null}
 */
function parseHttpUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

/**
 * @param {URL} url
 * @returns {boolean}
 */
function isPublicWechatArticleUrl(url) {
  const pathname = url.pathname || '/';
  if (pathname === '/s' || pathname.startsWith('/s/')) return true;
  if (pathname === '/mp/appmsgalbum') return true;
  if (pathname === '/mp/profile_ext' && url.searchParams.has('__biz')) return true;
  return false;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUnsupportedWechatDraftLink(value) {
  const url = parseHttpUrl(value);
  if (!url) return false;

  const host = url.hostname.toLowerCase();
  if (host === 'developers.weixin.qq.com') return true;
  if (host !== 'mp.weixin.qq.com') return false;
  return !isPublicWechatArticleUrl(url);
}

/**
 * @param {string} html
 * @returns {{ blockingIssues: DraftContentIssue[], warnings: DraftContentIssue[] }}
 */
export function inspectWechatDraftContent(html) {
  /** @type {DraftContentIssue[]} */
  const blockingIssues = [];
  /** @type {DraftContentIssue[]} */
  const warnings = [];
  const source = String(html || '');
  const div = createHtmlContainer('div', source);

  if (div) {
    Array.from(div.querySelectorAll('img')).forEach((img) => {
      const src = String(img.getAttribute('src') || '').trim();
      if (src && isWechatDraftImageSrc(src)) return;
      blockingIssues.push(createDraftContentIssue(
        'draft_image_not_uploaded',
        '正文仍有未上传到微信的图片',
        src,
      ));
    });

    Array.from(div.querySelectorAll('[src], [href]')).forEach((element) => {
      for (const attrName of ['src', 'href']) {
        const value = String(element.getAttribute(attrName) || '').trim();
        if (!value || (element.tagName === 'IMG' && attrName === 'src')) continue;
        if (isWechatUnsafeLocalResource(value)) {
          blockingIssues.push(createDraftContentIssue(
            'draft_local_resource',
            '正文仍有微信草稿不支持的本地资源链接',
            value,
          ));
          continue;
        }
        if (attrName === 'href' && isUnsupportedWechatDraftLink(value)) {
          blockingIssues.push(createDraftContentIssue(
            'draft_unsupported_wechat_link',
            '正文里有微信草稿接口可能拒收的后台/开发者平台链接，请改成纯文本或代码格式',
            value,
          ));
        }
      }
    });

    if (div.querySelector('svg, mjx-container')) {
      blockingIssues.push(createDraftContentIssue(
        'draft_unconverted_vector',
        '正文仍有未转换的 SVG 或数学公式节点',
        '',
      ));
    }
  }

  const brokenUrlPattern = /https?:\/\/[^\s<>"']+\s+[A-Za-z0-9][^\s<>"']*/g;
  const punctuationUrlPattern = /https?:\/\/[^\s<>"']+[，。；、]/g;
  Array.from(source.matchAll(brokenUrlPattern)).forEach((match) => {
    warnings.push(createDraftContentIssue(
      'draft_suspicious_url_space',
      '正文里有疑似被空格截断的链接',
      match[0],
    ));
  });
  Array.from(source.matchAll(punctuationUrlPattern)).forEach((match) => {
    warnings.push(createDraftContentIssue(
      'draft_suspicious_url_punctuation',
      '正文里有 URL 与中文标点紧贴的可疑链接',
      match[0],
    ));
  });

  return { blockingIssues, warnings };
}

/**
 * @param {DraftContentIssue[]} issues
 * @returns {string}
 */
function formatDraftContentIssues(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const preview = list.slice(0, 3).map((issue) => {
    const value = issue.value ? `：${issue.value}` : '';
    return `${issue.message}${value}`;
  }).join('；');
  const suffix = list.length > 3 ? `；另有 ${list.length - 3} 项` : '';
  return `微信草稿内容检查未通过，共 ${list.length} 项问题。${preview}${suffix}`;
}

/**
 * @param {string} html
 * @returns {{ html: string, imageSources: string[] }}
 */
export function replaceUnuploadedDraftImagesWithPlaceholders(html) {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return { html, imageSources: [] };
  }

  const div = createHtmlContainer('div', html || '');
  if (!div) return { html, imageSources: [] };
  /** @type {string[]} */
  const imageSources = [];

  Array.from(div.querySelectorAll('img')).forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    if (src && isWechatDraftImageSrc(src)) return;

    imageSources.push(src);
    const placeholder = activeDocument.createElement('p');
    const missingImagePlaceholderStyle = 'margin:12px 0;padding:10px 12px;border:1px dashed #d0d7de;border-radius:6px;color:#8c6d1f;background:#fff8e5;font-size:13px;line-height:1.7;';
    placeholder.setAttribute('style', missingImagePlaceholderStyle);
    placeholder.textContent = src
      ? `图片未同步，请在微信后台手动补传：${src}`
      : '图片未同步，请在微信后台手动补传。';
    img.replaceWith(placeholder);
  });

  return {
    html: div.innerHTML,
    imageSources,
  };
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function hashBytesFNV1a(bytes) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {Blob | null | undefined} blob
 * @returns {Promise<string>}
 */
async function computeBlobFingerprint(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return 'unknown';
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentHash = hashBytesFNV1a(bytes);
  const type = blob.type || 'application/octet-stream';
  return `${type}:${bytes.length}:${contentHash}`;
}

/**
 * @param {Map<string, string | CoverCacheEntry> | null | undefined} cache
 * @param {string} key
 * @returns {CoverCacheEntry | null}
 */
function getCachedCoverEntry(cache, key) {
  if (!cache || !cache.has(key)) return null;
  const value = cache.get(key);
  if (typeof value === 'string') {
    return { mediaId: value, fingerprint: '' };
  }
  if (value && typeof value === 'object' && typeof value.mediaId === 'string') {
    return {
      mediaId: value.mediaId,
      fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint : '',
      uploadedAt: typeof value.uploadedAt === 'number' ? value.uploadedAt : undefined,
    };
  }
  return null;
}

/**
 * @param {WechatAccountLike} account
 * @param {string} coverSrc
 * @returns {string}
 */
function buildCoverUploadCacheKey(account, coverSrc) {
  const namespace = String(account?.id || account?.appId || '').trim();
  return `${namespace}::cover::${String(coverSrc || '')}`;
}

/**
 * @param {WechatSyncDeps} deps
 */
export function createWechatSyncService(deps) {
  const {
    createApi,
    srcToBlob,
    coverUploadCache = null,
    processAllImages,
    processMathFormulas,
    prepareHtmlForDraft = async (html) => html,
    cleanHtmlForDraft,
    cleanupConfiguredDirectory,
    getFirstImageFromArticle,
  } = deps;

  return {
    /**
     * @param {SyncToDraftOptions} options
     */
    async syncToDraft({
      account,
      proxyUrl,
      currentHtml,
      activeFile,
      publishMeta,
      sessionTitle,
      sessionCoverBase64,
      sessionThumbMediaId,
      sessionDigest,
      draftMediaId,
      draftIndex = 0,
      onStatus,
      onImageProgress,
      onMathProgress,
    }) {
      const api = createApi(account.appId, account.appSecret, proxyUrl);
      /** @type {ImageUploadFailure[]} */
      const imageUploadFailures = [];

      let thumbMediaId = typeof sessionThumbMediaId === 'string'
        ? sessionThumbMediaId.trim()
        : '';
      if (!thumbMediaId) {
        if (onStatus) onStatus('cover');
        const coverSrc = sessionCoverBase64 || publishMeta?.coverSrc || getFirstImageFromArticle();
        if (!coverSrc) {
          throw new Error('未设置封面图，同步失败。请在弹窗中上传封面。');
        }

        const coverBlob = await srcToBlob(coverSrc);
        const fingerprint = await computeBlobFingerprint(coverBlob);
        const coverCacheKey = buildCoverUploadCacheKey(account, coverSrc);
        const cachedCover = getCachedCoverEntry(coverUploadCache, coverCacheKey);
        if (
          cachedCover &&
          cachedCover.fingerprint &&
          cachedCover.fingerprint === fingerprint &&
          cachedCover.mediaId &&
          (!cachedCover.uploadedAt || Date.now() - cachedCover.uploadedAt < 2.5 * 24 * 60 * 60 * 1000)
        ) {
          thumbMediaId = cachedCover.mediaId;
        } else {
          const coverRes = await api.uploadCover(coverBlob);
          thumbMediaId = coverRes.media_id;
          if (coverUploadCache && thumbMediaId) {
            coverUploadCache.set(coverCacheKey, {
              mediaId: thumbMediaId,
              fingerprint,
              uploadedAt: Date.now(),
            });
          }
        }
      }

      let draftHtml = await prepareHtmlForDraft(currentHtml);

      if (onStatus) onStatus('images');
      let processedHtml = await processAllImages(draftHtml, api, (current, total) => {
        if (onImageProgress) onImageProgress(current, total);
      }, {
        accountId: account.id || '',
        onImageFailure: (failures) => {
          if (Array.isArray(failures)) imageUploadFailures.push(...failures);
        },
      });

      if (processedHtml.includes('mjx-container') || processedHtml.includes('<svg')) {
        if (onStatus) onStatus('math');
        processedHtml = await processMathFormulas(processedHtml, api, (current, total) => {
          if (onMathProgress) onMathProgress(current, total);
        });
      }

      const cleanedResult = replaceUnuploadedDraftImagesWithPlaceholders(cleanHtmlForDraft(processedHtml));
      const cleanedHtml = cleanedResult.html;
      const draftInspection = inspectWechatDraftContent(cleanedHtml);
      if (draftInspection.blockingIssues.length > 0) {
        throw new Error(formatDraftContentIssues(draftInspection.blockingIssues));
      }

      const title = String(sessionTitle || publishMeta?.title || activeFile?.basename || '无标题文章');
      const article = {
        title: title.substring(0, 64),
        content: cleanedHtml,
        thumb_media_id: thumbMediaId,
        author: account.author || '',
        digest: sessionDigest || '一键同步自 Obsidian',
      };
      const contentSourceUrl = String(account.contentSourceUrl || '').trim();
      if (contentSourceUrl) {
        article.content_source_url = contentSourceUrl;
      }
      if (typeof account.openComment === 'boolean') {
        article.need_open_comment = account.openComment ? 1 : 0;
      }
      if (typeof account.onlyFansCanComment === 'boolean') {
        article.only_fans_can_comment = account.onlyFansCanComment ? 1 : 0;
      }

      if (onStatus) onStatus('draft');
      const normalizedDraftMediaId = typeof draftMediaId === 'string' ? draftMediaId.trim() : '';
      const isUpdate = !!normalizedDraftMediaId;
      let mediaId = '';

      if (isUpdate) {
        await api.updateDraft(normalizedDraftMediaId, draftIndex, article);
        mediaId = normalizedDraftMediaId;
      } else {
        const draftRes = await api.createDraft(article);
        mediaId = draftRes?.media_id || '';
      }

      const cleanupResult = await cleanupConfiguredDirectory(activeFile);

      return {
        article,
        mediaId,
        isUpdate,
        draftIndex,
        cleanupResult,
        imageUploadFailures,
        placeholderImageSources: cleanedResult.imageSources,
        draftWarnings: draftInspection.warnings,
      };
    },
  };
}

/**
 * @typedef {{ createImageDraft?: (options: Record<string, unknown>) => Promise<{ media_id?: string }> }} StickerApiLike
 */

/**
 * 微信贴图（newspic）草稿发布函数
 *
 * @param {object} options
 * @param {WechatAccountLike} options.account
 * @param {StickerApiLike} options.api - WechatAPI 实例
 * @param {string} options.title - 贴图标题
 * @param {string} [options.content=''] - 贴图纯文本描述
 * @param {string[]} options.imageMediaIds - 图片素材 media_id 列表
 * @returns {Promise<{ mediaId: string }>}
 */
export async function syncStickerDraft({ account, api, title, content = '', imageMediaIds }) {
  const stickerApi = /** @type {StickerApiLike} */ (api);
  if (!stickerApi || typeof stickerApi.createImageDraft !== 'function') {
    throw new Error('当前微信 API 实例未支持 createImageDraft 方法');
  }

  const res = await stickerApi.createImageDraft({
    title,
    content,
    imageMediaIds,
    needOpenComment: account.openComment ? 1 : 0,
    onlyFansCanComment: account.onlyFansCanComment ? 1 : 0
  });

  const mediaId = res && typeof res.media_id === 'string' ? res.media_id : '';

  return {
    mediaId
  };
}
