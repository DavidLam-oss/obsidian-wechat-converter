/*
## 核心功能

承接 Obsidian triplet renderer 的视频预处理与占位符保护能力，防止 MarkdownRenderer 在 detached DOM 中加载本地视频触发 Electron 主进程 crash。

## 输入

接收 Markdown 文本或 DOM 容器与视频源信息。

## 输出

输出 `isVideoPath`、`extractVideoTitleFromPath`、`preProcessVideoEmbeds`、`createWechatVideoCardElement`、`renderVideoPlaceholders` 与 `injectVideoCardHtml`，用于在 Obsidian 渲染前保护视频并在序列化时输出微信友好的视频卡片。

## 定位

位于 services/，属于 triplet renderer 的视频子模块；保持主 renderer 与 serializer 逻辑轻量。

## 依赖

依赖 `./image-source-utils.js`、`./dom-utils.js`。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: dynamic DOM and regex parsing without TypeScript types */

import { getActiveDocument } from './dom-utils.js';
import { resolveVaultResourceSrc } from './image-source-utils.js';

export const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogg']);

/**
 * 校验路径是否包含视频后缀
 * @param {string} pathOrUrl
 * @returns {boolean}
 */
export function isVideoPath(pathOrUrl) {
  const value = String(pathOrUrl || '').trim();
  if (!value) return false;
  const cleanPath = value.split('?')[0].split('#')[0];
  const ext = (cleanPath.split('.').pop() || '').toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * 从路径或 Alt 中提取视频标题
 * @param {string} pathOrUrl
 * @param {string} [alt]
 * @returns {string}
 */
export function extractVideoTitleFromPath(pathOrUrl, alt = '') {
  const customTitle = String(alt || '').trim();
  if (customTitle) return customTitle;

  const value = String(pathOrUrl || '').trim();
  if (!value) return '视频';

  const clean = value.split('?')[0].split('#')[0];
  const filename = clean.split('/').pop().split('\\').pop() || clean;
  return filename.replace(/\.(mp4|webm|mov|m4v|ogg)$/i, '') || '视频';
}

/**
 * HTML 转义
 * @param {string} text
 * @returns {string}
 */
function escapeHtmlAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 赋予元素内联样式（遵守动态变量规范）
 * @param {Element | null | undefined} el
 * @param {string} styleText
 */
function applyElementInlineStyle(el, styleText) {
  if (!el || !styleText) return;
  el.setAttribute('style', styleText);
}

/**
 * @typedef {{
 *   id: string,
 *   src: string,
 *   title: string,
 *   original: string,
 * }} PreprocessedVideo
 */

/**
 * 在进入 MarkdownRenderer 之前，提取并保护 Markdown 中的视频嵌入
 * @param {string} markdown
 * @returns {{ markdown: string, videos: PreprocessedVideo[] }}
 */
export function preProcessVideoEmbeds(markdown) {
  const source = String(markdown || '');
  if (!source) {
    return { markdown: '', videos: [] };
  }

  /** @type {PreprocessedVideo[]} */
  const videos = [];
  let videoCounter = 0;

  /**
   * @param {string} src
   * @param {string} [alt]
   * @param {string} [original]
   * @returns {string}
   */
  const registerVideo = (src, alt = '', original = '') => {
    const normalizedSrc = String(src || '').trim();
    const title = extractVideoTitleFromPath(normalizedSrc, alt);
    const id = `OWC_VID_${videoCounter++}`;
    videos.push({
      id,
      src: normalizedSrc,
      title,
      original,
    });
    return `\n\n<section data-owc-video-placeholder="${id}"></section>\n\n`;
  };

  // 1. 处理 Obsidian 双链视频嵌入: ![[video.mp4]] 或 ![[video.mp4|标题]]
  let processed = source.replace(/!\[\[([^[\]|]+)(?:\|([^[\]]+))?]]/g, (match, filePath, alt) => {
    const rawPath = String(filePath || '').trim();
    if (isVideoPath(rawPath)) {
      return registerVideo(rawPath, alt, match);
    }
    return match;
  });

  // 2. 处理标准 Markdown 视频语法: ![标题](video.mp4) 或 ![标题](<video.mp4>)
  processed = processed.replace(/!\[([^\]]*)\]\(([^)\r\n]+)\)/g, (match, alt, target) => {
    let cleanTarget = String(target || '').trim();
    if (cleanTarget.startsWith('<') && cleanTarget.includes('>')) {
      cleanTarget = cleanTarget.slice(1, cleanTarget.indexOf('>')).trim();
    } else {
      cleanTarget = cleanTarget.split(/\s+/)[0].trim();
    }
    if (isVideoPath(cleanTarget)) {
      return registerVideo(cleanTarget, alt, match);
    }
    return match;
  });

  // 3. 处理原生 HTML <video> 标签: <video src="..."></video> 或嵌套 <source>
  processed = processed.replace(/<video\b([^>]*)>([\s\S]*?)<\/video>|<video\b([^>]*)\/?>/gi, (match, openAttrs, innerHtml, selfAttrs) => {
    const attrs = openAttrs || selfAttrs || '';
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    let src = srcMatch ? (srcMatch[1] || srcMatch[2] || srcMatch[3] || '') : '';

    if (!src && innerHtml) {
      const sourceMatch = innerHtml.match(/<source\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (sourceMatch) {
        src = sourceMatch[1] || sourceMatch[2] || sourceMatch[3] || '';
      }
    }

    if (src && isVideoPath(src)) {
      return registerVideo(src, '', match);
    }
    return match;
  });

  return { markdown: processed, videos };
}

/**
 * 通过纯原生 DOM 构造微信视频卡片节点（杜绝 innerHTML 以遵守审计规范）
 * @param {PreprocessedVideo} video
 * @param {{ app?: any, sourcePath?: string }} [options]
 * @returns {HTMLElement | null}
 */
export function createWechatVideoCardElement(video, options = {}) {
  const activeDocument = getActiveDocument();
  if (!activeDocument) return null;

  const { src, title } = video;
  let displaySrc = src;
  if (options.app && !/^(?:https?:)?\/\//i.test(src) && !src.startsWith('data:')) {
    displaySrc = resolveVaultResourceSrc(options.app, src, options.sourcePath || '') || src;
  }

  const card = activeDocument.createElement('section');
  card.setAttribute('class', 'wechat-video-card');
  card.setAttribute('data-video-src', src);
  card.setAttribute('data-video-title', title);
  const cardStyle = 'display:block;margin:18px 0;text-align:center;box-sizing:border-box;';
  applyElementInlineStyle(card, cardStyle);

  const playerWrapper = activeDocument.createElement('section');
  const playerWrapperStyle = 'display:block;width:100%;border-radius:8px;overflow:hidden;background-color:#0f1419;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.08);';
  applyElementInlineStyle(playerWrapper, playerWrapperStyle);

  const videoEl = activeDocument.createElement('video');
  videoEl.setAttribute('class', 'wechat-video-player');
  videoEl.setAttribute('controls', 'controls');
  videoEl.setAttribute('preload', 'metadata');
  videoEl.setAttribute('src', displaySrc);
  videoEl.setAttribute('data-video-src', src);
  videoEl.setAttribute('data-video-title', title);
  const videoStyle = 'display:block;width:100%;max-height:480px;border-radius:8px;margin:0 auto;outline:none;';
  applyElementInlineStyle(videoEl, videoStyle);

  playerWrapper.appendChild(videoEl);
  card.appendChild(playerWrapper);

  if (title) {
    const titleEl = activeDocument.createElement('section');
    titleEl.setAttribute('class', 'wechat-video-title');
    const titleStyle = 'margin-top:8px;font-size:13px;color:#888888;text-align:center;line-height:1.5;';
    applyElementInlineStyle(titleEl, titleStyle);
    titleEl.textContent = `🎬 ${title}`;
    card.appendChild(titleEl);
  }

  return card;
}

/**
 * 组装微信友好的视频预览卡片 HTML（用于字符串兜底）
 * @param {PreprocessedVideo} video
 * @param {{ app?: any, sourcePath?: string }} [options]
 * @returns {string}
 */
export function buildWechatVideoCardHtml(video, { app, sourcePath = '' } = {}) {
  const { src, title } = video;
  let displaySrc = src;
  if (app && !/^(?:https?:)?\/\//i.test(src) && !src.startsWith('data:')) {
    displaySrc = resolveVaultResourceSrc(app, src, sourcePath) || src;
  }

  const escapedSrc = escapeHtmlAttr(src);
  const escapedDisplaySrc = escapeHtmlAttr(displaySrc);
  const escapedTitle = escapeHtmlAttr(title);

  return (
    `<section class="wechat-video-card" data-video-src="${escapedSrc}" data-video-title="${escapedTitle}" style="display:block;margin:18px 0;text-align:center;box-sizing:border-box;">` +
      `<section style="display:block;width:100%;border-radius:8px;overflow:hidden;background-color:#0f1419;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.08);">` +
        `<video class="wechat-video-player" controls="controls" preload="metadata" src="${escapedDisplaySrc}" data-video-src="${escapedSrc}" data-video-title="${escapedTitle}" style="display:block;width:100%;max-height:480px;border-radius:8px;margin:0 auto;outline:none;"></video>` +
      `</section>` +
      (title ? `<section class="wechat-video-title" style="margin-top:8px;font-size:13px;color:#888888;text-align:center;line-height:1.5;">🎬 ${escapedTitle}</section>` : '') +
    `</section>`
  );
}

/**
 * 在 DOM 树中渲染并替换视频占位节点（纯原生 DOM 替换，零 innerHTML 风险）
 * @param {Element | null | undefined} container
 * @param {PreprocessedVideo[]} videos
 * @param {{ app?: any, sourcePath?: string }} [options]
 */
export function renderVideoPlaceholders(container, videos, options = {}) {
  if (!container || !Array.isArray(videos) || videos.length === 0) return;

  const videoMap = new Map(videos.map((v) => [v.id, v]));
  const placeholders = Array.from(container.querySelectorAll('section[data-owc-video-placeholder]'));

  for (const placeholder of placeholders) {
    const id = placeholder.getAttribute('data-owc-video-placeholder') || '';
    const video = videoMap.get(id);
    if (!video) continue;

    const card = createWechatVideoCardElement(video, options);
    if (card) {
      placeholder.replaceWith(card);
    }
  }
}

/**
 * 字符串级别兜底注入视频卡片 HTML
 * @param {string} html
 * @param {PreprocessedVideo[]} videos
 * @param {{ app?: any, sourcePath?: string }} [options]
 * @returns {string}
 */
export function injectVideoCardHtml(html, videos, options = {}) {
  if (!html || !Array.isArray(videos) || videos.length === 0) return html;

  let result = html;
  for (const video of videos) {
    const placeholderMarkup = `<section data-owc-video-placeholder="${video.id}"></section>`;
    if (result.includes(placeholderMarkup)) {
      const cardHtml = buildWechatVideoCardHtml(video, options);
      result = result.split(placeholderMarkup).join(cardHtml);
    }
  }
  return result;
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- reason: close scoped disable block */
