/* eslint-disable no-unused-vars -- Transitional method group keeps original free identifiers available after extraction. */
import * as shared from '../apple-style-view-shared.js';

const {
  createRenderPipelines,
  buildRenderRuntime,
  resolveMarkdownSource,
  normalizeVaultPath,
  isAbsolutePathLike,
  renderObsidianTripletMarkdown,
  canUseNativePreviewFastPath,
  renderNativeMarkdown,
  convertRenderedMermaidDiagramsToImages,
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  AI_PROVIDER_KINDS,
  createDefaultAiSettings,
  normalizeAiSettings,
  normalizeAiProvider,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  getLayoutFamilyList,
  getLayoutFamilyById,
  getColorPaletteList,
  getColorPaletteById,
  resolveColorPaletteForRender,
  normalizeHexColor,
  normalizeLayoutSelection,
  getArticleLayoutSelectionState,
  resolveAiProvider,
  deriveArticleLayoutStateForSelection,
  normalizeArticleLayoutState,
  normalizeArticleLayoutCacheEntry,
  extractImageRefsFromHtml,
  extractRenderedSectionFragments,
  generateArticleLayout,
  renderArticleLayoutHtml,
  testAiProviderConnection,
  createWechatSyncService,
  createWechatSyncBridgeService,
  isWechatSyncUnsupportedMethodError,
  getMultiPlatformResultSummary,
  getWechatSyncResultError,
  getWechatSyncResultPlatformId,
  getWechatSyncResultUrl,
  normalizeWechatsyncPlatform,
  sortWechatsyncPlatformItemsForDisplay,
  resolveSyncAccount,
  toSyncFriendlyMessage,
  createEmptyDraftCache,
  normalizeDraftCache,
  getDraftAssociation,
  setDraftAssociation,
  clearDraftAssociation,
  processAllImagesService,
  processMathFormulasService,
  cleanHtmlForDraftService,
  rasterizeSvgToPngBlob,
  createObsidianFetchAdapter,
  stripMarkdownFrontmatter,
  mapAppUrlImagesToAssetUrls,
  createHtmlContainer,
  getActiveDocument,
  getActiveWindowValue,
  htmlToText,
  setElementHtml,
  createDefaultMultiPlatformSyncSettings,
  parseWechatsyncPlatformIds,
  hasWechatSyncCapability,
  normalizeMultiPlatformSyncSettings,
  getAvailableWechatsyncPlatforms,
  formatWechatsyncCheckedAt,
  describeWechatsyncConnectionState,
  renderWechatsyncConnectionStatusBar,
  renderMultiPlatformSettingsTab,
  showMultiPlatformPublishModal,
  renderFeishuSettingsTab,
  renderFeishuPublishTab,
  createDefaultFeishuSyncSettings,
  normalizeFeishuSyncSettings,
  updateFeishuHistoryPath,
  WechatAPI,
  loadCommonJsDependency,
  obsidianApi,
  Plugin,
  MarkdownView,
  ItemView,
  Notice,
  Platform,
  PluginSettingTab,
  Setting,
  LEGACY_SETTING_RENDER_KEY,
  getActiveDocumentCompat,
  createFallbackSvgElement,
  revealLeafCompat,
  getPluginSettings,
  setPluginSettings,
  setDestructiveButtonCompat,
  refreshSettingTabCompat,
  toReadableError,
  isRecord,
  toRecord,
  toAiLayoutState,
  toAiLayoutJson,
  toAiLayoutBlock,
  toAiLayoutGenerationMeta,
  toAiLayoutSelection,
  toAiLayoutFamilyStates,
  toOptionalText,
  toImageElements,
  removeElementClass,
  toOptionalNumber,
  parseJsonRecord,
  normalizeRequestUrlResponse,
  getResponseJsonRecord,
  getProxyErrorMessage,
  createProxyError,
  formatWechatApiError,
  hasWechatUploadResult,
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
  APPLE_STYLE_VIEW,
  APPLE_STYLE_VIEW_TITLE,
  PLACEHOLDER_ICON_DATA_URL,
  GITHUB_REPOSITORY_URL,
  OBSIDIAN_PUBLISHER_PRO_URL,
  OBSIDIAN_PUBLISHER_GUIDE_URL,
  OBSIDIAN_PUBLISHER_EXTENSION_GUIDE_URL,
  OBSIDIAN_PUBLISHER_BRIDGE_GUIDE_URL,
  MULTI_PLATFORM_TAB_LABEL,
  getObsidianModalClass,
  createObsidianModal,
  getObsidianSetIcon,
  getObsidianRequestUrl,
  getObsidianRequest,
  getAppleThemeApi,
  getValueElementFromEvent,
  getEventTargetValue,
  IMAGE_SWIPE_COMMAND_COPY,
  getObsidianLocale,
  isChineseObsidianLocale,
  getImageSwipeCommandCopy,
  quoteLinesForImageSwipeCallout,
  createImageSwipeCalloutMarkdown,
  DEFAULT_SETTINGS,
  MAX_ACCOUNTS,
  AI_LAYOUT_SOURCE_SWITCH_STALE_SUPPRESS_MS,
  DEFAULT_WECHAT_ACCOUNT_PUBLISH_OPTIONS,
  getWechatAccountPublishOptions,
  normalizeWechatAccountPublishOptions,
  isMobileClient,
  generateId,
  sleep,
  pMap
} = shared;

export const clipboardMethods = {
resolveLocalImageFileForUpload(src) {
  const raw = String(src || '').trim();
  if (!raw || /^(data:|https?:\/\/|app:\/\/|capacitor:\/\/)/i.test(raw)) return null;

  const activeFile = this.getPublishContextFile();
  const sourcePath = activeFile?.path || this.lastResolvedSourcePath || '';
  const decoded = safeDecodeUriText(raw);
  const fromFileUrl = /^file:\/\//i.test(decoded)
    ? getVaultRelativePathFromLocalPath(this.app, getFileUrlLocalPath(decoded))
    : '';

  if (/^file:\/\//i.test(decoded) && !fromFileUrl) {
    throw new Error('只支持读取当前 vault 内的 file:// 图片');
  }

  const lookupSrc = fromFileUrl || decoded;
  try {
    const linked = this.app?.metadataCache?.getFirstLinkpathDest?.(lookupSrc, sourcePath);
    if (linked && typeof linked === 'object' && typeof linked['extension'] === 'string') return linked;
  } catch {
    // Continue with direct path candidates.
  }

  const candidates = [];
  const normalized = normalizeVaultPath(lookupSrc);
  if (normalized) candidates.push(normalized);
  const noteDir = getVaultDirnameFromPath(sourcePath);
  if (normalized && noteDir && !isAbsolutePathLike(normalized)) {
    candidates.push(normalizeVaultPath(`${noteDir}/${normalized}`));
  }

  for (const candidate of Array.from(new Set(candidates))) {
    try {
      const file = this.app?.vault?.getAbstractFileByPath?.(candidate);
      if (file && typeof file === 'object' && typeof file['extension'] === 'string') return file;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
,

async vaultFileToBlob(file) {
  const readBinary = this.app?.vault?.readBinary;
  if (typeof readBinary !== 'function') {
    throw new Error('当前 Obsidian 版本不支持读取本地图片');
  }
  const binary = await readBinary.call(this.app.vault, file);
  const buffer = bufferFromBinary(binary);
  const fileName = typeof file === 'object' && file && typeof file['name'] === 'string'
    ? file['name']
    : (typeof file === 'object' && file && typeof file['path'] === 'string' ? file['path'] : 'image');
  return new Blob([buffer], { type: inferLocalImageMimeType(fileName) });
}
,

async srcToBlob(src) {
  const localFile = this.resolveLocalImageFileForUpload(src);
  if (localFile) {
    return this.vaultFileToBlob(localFile);
  }

  // Base64/data URL 图片直接本地解析，避免对 data: URL 发起 fetch。
  if (src.startsWith('data:')) {
    return dataUrlToBlob(src);
  }

  // Obsidian 本地资源 (app:// 或 capacitor://) 可以直接 fetch
  if (src.startsWith('app://') || src.startsWith('capacitor://')) {
    const resp = await window.fetch(src);
    return await resp.blob();
  }

  // HTTP/HTTPS 图床链接需要使用 requestUrl 绕过 CORS
  if (src.startsWith('http')) {
    const requestUrl = getObsidianRequestUrl();
    if (typeof requestUrl !== 'function') {
      throw new Error('当前 Obsidian 版本不支持 requestUrl');
    }
    const response = /** @type {{ arrayBuffer?: ArrayBuffer, headers?: Record<string, string> }} */ (await requestUrl({ url: src }));
    // requestUrl 返回 ArrayBuffer，需要转换为 Blob
    const headers = response.headers || {};
    const contentType = headers['content-type'] || headers['Content-Type'] || 'image/jpeg';
    const buffer = response.arrayBuffer instanceof ArrayBuffer ? response.arrayBuffer : new ArrayBuffer(0);
    return new Blob([buffer], { type: contentType });
  }

  throw new Error(`不支持的图片来源或本地图片未找到：${src || '空地址'}`);
}
,

async processAllImages(html, api, progressCallback, cacheContext = {}) {
  const accountId = cacheContext?.accountId || '';
  return /** @type {Promise<string>} */ (processAllImagesService({
    html,
    api,
    progressCallback,
    pMap,
    srcToBlob: (src) => this.srcToBlob(String(src || '')),
    imageUploadCache: this.imageUploadCache,
    cacheNamespace: accountId,
    onImageFailure: cacheContext?.onImageFailure,
  }));
}
,

async processMathFormulas(html, api, progressCallback) {
  return /** @type {Promise<string>} */ (processMathFormulasService({
    html,
    api,
    progressCallback,
    pMap,
    simpleHash: (value) => this.simpleHash(String(value || '')),
    svgUploadCache: this.svgUploadCache,
    svgToPngBlob: (svgElement, scale) => this.svgToPngBlob(
      svgElement instanceof SVGElement ? svgElement : createFallbackSvgElement(),
      typeof scale === 'number' ? scale : 3
    ),
  }));
}
,

async svgToPngBlob(svgElement, scale = 3) {
  return rasterizeSvgToPngBlob(svgElement, { scale });
}
,

cleanHtmlForDraft(html) {
  return cleanHtmlForDraftService(html);
}
,

renderHTML(html) {
  if (!this.previewContainer) return;
  this.previewContainer.empty();
  setElementHtml(this.previewContainer, html);
}
,

async copyRichHTMLByClipboard(htmlContent) {
  if (
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== 'function' ||
    typeof ClipboardItem === 'undefined'
  ) {
    return false;
  }

  const item = new ClipboardItem({
    'text/html': new Blob([htmlContent], { type: 'text/html' }),
  });
  await navigator.clipboard.write([item]);
  return true;
}
,

normalizeClipboardText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
,

setCopyButtonIcon(icon) {
  if (!this.copyBtn) return;
  this.copyBtn.replaceChildren();
  const setIcon = getObsidianSetIcon();
  if (typeof setIcon === 'function') {
    setIcon(this.copyBtn, icon);
  }
}
,

setCopyButtonSpinner() {
  if (!this.copyBtn) return;
  this.copyBtn.replaceChildren();
  const activeDocument = getActiveDocumentCompat();
  if (!activeDocument) return;
  const spinner = activeDocument.createElement('span');
  spinner.className = 'apple-copy-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  this.copyBtn.appendChild(spinner);
}
,

async enhanceHtmlForWechatPublishing(root) {
  if (!root) return;
  const activeDocument = getActiveDocumentCompat();
  /** @type {HTMLElement | null} */
  let mount = null;
  try {
    if (activeDocument?.body && !root.isConnected) {
      mount = activeDocument.createElement('div');
      mount.setCssStyles({
        position: 'fixed',
        left: '-99999px',
        top: '0',
        width: '760px',
        opacity: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
      });
      activeDocument.body.appendChild(mount);
      mount.appendChild(root);
    }
    await convertRenderedMermaidDiagramsToImages(root, {
      simpleHash: (value) => this.simpleHash(String(value || '')),
      mermaidImageCache: this.mermaidImageCache,
    });
    this.transformCodeBlocksForClipboard(root);
  } finally {
    if (mount) {
      mount.remove();
    }
  }
}
,

async prepareHtmlForWechatDraft(html) {
  const tempDiv = createHtmlContainer('div', html || '');
  if (!tempDiv) return '';
  await this.enhanceHtmlForWechatPublishing(tempDiv);
  return tempDiv.innerHTML;
}
,

async prepareHtmlForWechatsyncArticle(html) {
  const tempDiv = createHtmlContainer('div', html || '');
  if (!tempDiv) return '';
  await this.processImagesToDataURL(tempDiv);
  this.transformCodeBlocksForWechatsync(tempDiv);
  return tempDiv.innerHTML;
}
,

async prepareHtmlForWechatsyncArticleViaBridge(html, assets = []) {
  const mapped = mapAppUrlImagesToAssetUrls(html || '', assets);
  const tempDiv = createHtmlContainer('div', mapped);
  if (!tempDiv) return '';
  this.transformCodeBlocksForWechatsync(tempDiv);
  return tempDiv.innerHTML;
}
,

async generateCoverThumbnailFromAsset(asset) {
  try {
    if (!asset || typeof asset !== 'object') return '';
    const base64 = typeof asset.base64 === 'string' ? asset.base64 : '';
    const mimeType = typeof asset.mimeType === 'string' ? asset.mimeType : '';
    if (!base64 || !mimeType) return '';
    // GIFs would lose animation if we re-encode to JPEG; skip and let
    // the extension fall back to its local-thumbnail path (which can
    // keep the first frame). Plugin keeps the implementation small.
    if (mimeType === 'image/gif') return '';

    const sourceDataUrl = `data:${mimeType};base64,${base64}`;
    const image = /** @type {HTMLImageElement} */ (await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_decode_failed'));
      img.src = sourceDataUrl;
    }));

    const naturalW = image.naturalWidth || image.width || 0;
    const naturalH = image.naturalHeight || image.height || 0;
    if (!naturalW || !naturalH) return '';

    const MAX_DIM = 256;
    const scale = Math.min(1, MAX_DIM / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const activeDocument = getActiveDocumentCompat();
    if (!activeDocument) return '';
    const canvas = activeDocument.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(image, 0, 0, targetW, targetH);

    const MAX_BYTES = 8 * 1024;
    // The data URL prefix `data:image/jpeg;base64,` adds ~22 bytes; we
    // compare the whole string length against MAX_BYTES, accepting
    // that the prefix counts toward the budget (negligible).
    for (const quality of [0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (typeof dataUrl === 'string' && dataUrl.length <= MAX_BYTES) {
        return dataUrl;
      }
    }
    // Even the lowest quality is too big; return empty so the
    // extension does the local fallback instead of carrying a payload
    // that bloats `chrome.storage.local`.
    return '';
  } catch (err) {
    console.warn('[Wechatsync] generateCoverThumbnailFromAsset failed', err);
    return '';
  }
}
,

extractCodeTextForWechatsync(block) {
  const codePre = block?.querySelector?.('pre');
  if (!codePre) return '';

  const sectionNodes = /** @type {HTMLElement[]} */ (Array.from(codePre.querySelectorAll('section')));
  const codeLinesNode = sectionNodes
    .filter((node) => {
      const style = (node.getAttribute('style') || '').toLowerCase();
      return style.includes('white-space:nowrap') || style.includes('white-space: nowrap');
    })
    .sort((a, b) => {
      /** @param {HTMLElement} node */
      const score = (node) => {
        const html = node.innerHTML || '';
        return (html.includes('<br') ? 10000 : 0) + (node.textContent || '').length;
      };
      return score(b) - score(a);
    })[0];

  if (codeLinesNode) {
    return (codeLinesNode.innerHTML || '')
      .split(/<br\s*\/?>/i)
      .map((lineHtml) => {
        return htmlToText(lineHtml || '').replace(/\u00a0/g, ' ');
      })
      .join('\n');
  }

  const codeEl = codePre.querySelector('code');
  return ((codeEl ? codeEl.textContent : codePre.textContent) || '').replace(/\u00a0/g, ' ');
}
,

transformCodeBlocksForWechatsync(root) {
  if (!root) return;

  const codeBlocks = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.code-snippet__fix')));
  codeBlocks.forEach((block) => {
    const codeText = this.extractCodeTextForWechatsync(block);

    const activeDocument = getActiveDocumentCompat();
    if (!activeDocument) return;
    const pre = activeDocument.createElement('pre');
    pre.setAttribute('style', [
      'display:block !important',
      'width:100% !important',
      'max-width:100% !important',
      'margin:14px 0 !important',
      'padding:12px 14px !important',
      'box-sizing:border-box !important',
      'background:#f6f8fa !important',
      'border:1px solid #e5e7eb !important',
      'border-radius:8px !important',
      'overflow-x:auto !important',
      'overflow-y:hidden !important',
      '-webkit-overflow-scrolling:touch !important',
      "font-family:'SF Mono',Consolas,Monaco,monospace !important",
      'font-size:13px !important',
      'line-height:1.65 !important',
      'color:#24292f !important',
      'text-indent:0 !important',
      'white-space:pre !important',
    ].join(';'));

    const code = activeDocument.createElement('code');
    code.setAttribute('style', [
      'display:block !important',
      'margin:0 !important',
      'padding:0 !important',
      'background:transparent !important',
      'color:#24292f !important',
      'font:inherit !important',
      'line-height:inherit !important',
      'white-space:pre !important',
      'text-indent:0 !important',
    ].join(';'));
    code.textContent = codeText;
    pre.appendChild(code);
    block.replaceWith(pre);
  });
}
,

transformCodeBlocksForClipboard(root) {
  if (!root) return;

  const codeBlocks = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll('.code-snippet__fix')));
  codeBlocks.forEach((block) => {
    const codePre = block.querySelector('pre');
    if (!codePre) return;

    const codeHtml = codePre.innerHTML || '';
    const styleText = block.getAttribute('style') || '';
    const backgroundMatch = styleText.match(/background:([^;!]+)(?:\s*!important)?/i);
    const borderMatch = styleText.match(/border:([^;!]+)(?:\s*!important)?/i);
    const radiusMatch = styleText.match(/border-radius:([^;!]+)(?:\s*!important)?/i);
    const background = backgroundMatch ? backgroundMatch[1].trim() : '#0d1117';
    const border = borderMatch ? borderMatch[1].trim() : '1px solid #30363d';
    const borderRadius = radiusMatch ? radiusMatch[1].trim() : '8px';
    const sectionNodes = /** @type {HTMLElement[]} */ (Array.from(codePre.querySelectorAll('section')));
    const lineNumberColumn = sectionNodes.find((node) => {
      const style = (node.getAttribute('style') || '').toLowerCase();
      return style.includes('border-right') && style.includes('user-select');
    });
    const codeLinesNode = sectionNodes
      .filter((node) => {
        const style = (node.getAttribute('style') || '').toLowerCase();
        return style.includes('white-space:nowrap') || style.includes('white-space: nowrap');
      })
      .sort((a, b) => {
        /** @param {HTMLElement} node */
        const score = (node) => {
          const html = node.innerHTML || '';
          return (html.includes('<br') ? 10000 : 0) + (node.textContent || '').length;
        };
        return score(b) - score(a);
      })[0];
    const codeLinesHtml = codeLinesNode ? codeLinesNode.innerHTML : codeHtml;
    const directMacHeader = Array.from(block.children).find((child) =>
      child !== codePre &&
      !child.querySelector('pre') &&
      child.querySelector('span') &&
      !(child.textContent || '').trim()
    );
    const hasMacHeader = !!directMacHeader;
    const codeLineParts = codeLinesNode
      ? codeLinesHtml.split(/<br\s*\/?>/i)
      : [codeLinesHtml];
    const lineNumberLabels = lineNumberColumn
      ? Array.from(lineNumberColumn.children).map((node) => (node.textContent || '').trim()).filter(Boolean)
      : [];
    const shouldKeepFixedLineNumbers = lineNumberLabels.length > 0 && codeLineParts.length > 0;

    const activeDocument = getActiveDocumentCompat();
    if (!activeDocument) return;
    const pre = activeDocument.createElement('pre');
    pre.setAttribute('class', 'hljs code__pre');
    pre.setAttribute('style', `width:100% !important;max-width:100% !important;margin:12px 0 !important;background:${background} !important;border:${border} !important;border-radius:${borderRadius} !important;box-shadow:0 4px 12px rgba(0,0,0,0.3) !important;overflow-x:scroll !important;overflow-y:hidden !important;-webkit-overflow-scrolling:touch !important;scrollbar-gutter:stable !important;scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18) !important;box-sizing:border-box !important;font-family:'SF Mono',Consolas,Monaco,monospace !important;font-size:13px !important;line-height:1.75 !important;color:#f0f6fc !important;white-space:normal !important;`);

    if (hasMacHeader) {
      const toolbar = activeDocument.createElement('section');
      const toolbarStyle = 'display:block !important;background:#161b22 !important;padding:6px 10px 6px 10px !important;border:none !important;border-bottom:1px solid #30363d !important;border-radius:8px 8px 0 0 !important;line-height:1 !important;box-sizing:border-box !important;width:100% !important;';
      toolbar.setAttribute('style', toolbarStyle);
      setElementHtml(toolbar, [
      '<span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#ff5f57 !important;margin-right:7px !important;font-size:0 !important;line-height:0 !important;color:transparent !important;vertical-align:top !important;">&nbsp;</span>',
      '<span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#ffbd2e !important;margin-right:7px !important;font-size:0 !important;line-height:0 !important;color:transparent !important;vertical-align:top !important;">&nbsp;</span>',
      '<span style="display:inline-block !important;width:9px !important;height:9px !important;border-radius:50% !important;background:#28c840 !important;font-size:0 !important;line-height:0 !important;color:transparent !important;vertical-align:top !important;">&nbsp;</span>',
    ].join(''));
      pre.appendChild(toolbar);
    }

    const code = activeDocument.createElement('code');
    if (shouldKeepFixedLineNumbers) {
      const lineNumbersHtml = codeLineParts.map((_, index) => {
        const lineNumber = lineNumberLabels[index] || String(index + 1);
        return `<section style="display:block !important;height:1.75em !important;line-height:1.75 !important;padding:0 10px 0 0 !important;margin:0 !important;color:#95989C !important;white-space:nowrap !important;box-sizing:border-box !important;">${lineNumber}</section>`;
      }).join('');
      const codeInnerHtml = codeLineParts.map((lineHtml) => lineHtml || '&nbsp;').join('<br/>');
      const codeWithLineNumbersStyle = 'display:block !important;width:100% !important;min-width:100% !important;max-width:100% !important;padding:0 !important;box-sizing:border-box !important;background:transparent !important;color:#f0f6fc !important;font-family:inherit !important;font-size:13px !important;line-height:1.75 !important;white-space:normal !important;overflow:visible !important;text-indent:0 !important;margin:0 !important;';
      code.setAttribute('style', codeWithLineNumbersStyle);
      setElementHtml(code, `<section style="display:flex !important;align-items:flex-start !important;overflow-x:hidden !important;overflow-y:visible !important;width:100% !important;max-width:100% !important;padding:0 !important;box-sizing:border-box !important;margin:0 !important;"><section class="line-numbers" style="text-align:right !important;padding:12px 0 !important;border-right:1px solid rgba(255,255,255,0.1) !important;user-select:none !important;background:transparent !important;flex:0 0 auto !important;min-width:3.5em !important;box-sizing:border-box !important;margin:0 !important;">${lineNumbersHtml}</section><section class="code-scroll" style="flex:1 1 auto !important;overflow-x:scroll !important;overflow-y:visible !important;-webkit-overflow-scrolling:touch !important;scrollbar-gutter:stable !important;scrollbar-color:rgba(255,255,255,0.58) rgba(255,255,255,0.18) !important;padding:12px 12px 16px 16px !important;min-width:0 !important;box-sizing:border-box !important;margin:0 !important;"><section style="white-space:pre !important;min-width:max-content !important;line-height:1.75 !important;font-size:13px !important;margin:0 !important;">${codeInnerHtml}</section></section></section>`);
    } else {
      const codeScrollableStyle = 'display:block !important;width:max-content !important;min-width:100% !important;max-width:none !important;padding:12px 12px 16px 12px !important;box-sizing:border-box !important;background:transparent !important;color:#f0f6fc !important;font-family:inherit !important;font-size:13px !important;line-height:1.75 !important;white-space:nowrap !important;overflow:visible !important;text-indent:0 !important;margin:0 !important;';
      code.setAttribute('style', codeScrollableStyle);
      setElementHtml(code, codeLinesHtml);
    }
    pre.appendChild(code);

    block.replaceWith(pre);
  });
}
,

async readClipboardTextSnapshot() {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    return { supported: false, text: '' };
  }
  try {
    const text = await navigator.clipboard.readText();
    return { supported: true, text: this.normalizeClipboardText(text) };
  } catch {
    return { supported: false, text: '' };
  }
}
,

async copyHTML() {
  if (this.isCopying) return;

  if (!this.currentHtml) {
    new Notice(this.getMissingRenderNotice());
    return;
  }

  this.isCopying = true;
  if (this.copyBtn) {
    this.copyBtn.classList.add('is-copying');
    this.setCopyButtonSpinner();
  }

  try {
    const exportHtml = this.getCurrentExportHtml() || this.currentHtml;
    // 创建临时的 DOM 容器来解析和处理图片
    const tempDiv = createHtmlContainer('div', exportHtml);

    // 处理本地图片：转换为 JPEG Base64
    // 返回 true 表示有图片被处理了
    await this.processImagesToDataURL(tempDiv);

    await this.enhanceHtmlForWechatPublishing(tempDiv);

    // 清理 HTML 以适配微信编辑器（处理嵌套列表等）
    const cleanedHtml = this.cleanHtmlForDraft(tempDiv.innerHTML);

    const htmlContent = cleanedHtml;
    window.__OWC_LAST_CLIPBOARD_HTML = htmlContent;
    window.__OWC_LAST_CLIPBOARD_TEXT = htmlToText(cleanedHtml);
    const expectedPlainText = this.normalizeClipboardText(window.__OWC_LAST_CLIPBOARD_TEXT);

    const mobile = isMobileClient(this.app);
    let copied = false;
    try {
      copied = await this.copyRichHTMLByClipboard(htmlContent);
    } catch {
      copied = false;
    }
    if (mobile && copied) {
      const snapshot = await this.readClipboardTextSnapshot();
      copied = snapshot.supported && snapshot.text === expectedPlainText;
    }

    if (!copied) {
      throw new Error('rich copy unavailable');
    }

    // Success Feedback
    new Notice('✅ 已复制公众号格式，请直接粘贴到公众号编辑器');
    if (this.copyBtn) {
       this.copyBtn.classList.remove('is-copying');
       this.setCopyButtonIcon('check'); // 变成对勾图标
       window.setTimeout(() => {
         if (this.copyBtn) {
           this.setCopyButtonIcon('copy'); // 恢复复制图标
         }
       }, 2000);
    }
    return;

  } catch (error) {
    console.error('复制失败:', error);
    new Notice('❌ 复制失败，请使用「发布与分发」发送文章');
    if (this.copyBtn) {
      this.copyBtn.classList.remove('is-copying');
      this.setCopyButtonIcon('copy');
    }
  } finally {
    this.isCopying = false;
  }
}
,

async processImagesToDataURL(container) {
  const images = toImageElements(container.querySelectorAll('img'));
  const localImages = images.filter(img => img.src.startsWith('app://') || img.src.startsWith('capacitor://'));

  if (localImages.length === 0) return false;

  // Start time for minimum duration check (prevents UX flicker)
  const startTime = Date.now();

  // 并发控制：3个一组
  const concurrency = 3;
  for (let i = 0; i < localImages.length; i += concurrency) {
    const chunk = localImages.slice(i, i + concurrency);
    await Promise.all(chunk.map(img => this.convertImageToLocally(img)));
  }

  // Calculate elapsed time and wait if needed
  const elapsed = Date.now() - startTime;
  const minDuration = 800; // 800ms minimum duration
  if (elapsed < minDuration) {
    await new Promise(resolve => window.setTimeout(resolve, minDuration - elapsed));
  }

  return true;
}
,

async convertImageToLocally(img) {
  try {
    // CRITICAL FIX: app:// 资源在 Electron 中可以直接 fetch！
    // 我们不需要反向查找 TFile，直接 fetch(img.src) 拿 blob 即可！
    const response = await window.fetch(img.src);
    const blob = await response.blob();

    // 检查大小警告
    if (blob.size > 10 * 1024 * 1024) {
      new Notice(`⚠️ 发现大图 (${(blob.size / 1024 / 1024).toFixed(1)}MB)，处理可能较慢`, 5000);
    }

    /** @type {string} */
    let dataUrl;
    // GIF Protection: Bypass compression for GIFs to preserve animation
    if (blob.type === 'image/gif') {
      // Direct read for GIF
      dataUrl = await this.blobToDataUrl(blob);
    } else {
      // Compress others (JPG/PNG) to JPEG 80%
      dataUrl = await this.blobToJpegDataUrl(blob);
    }

    img.src = dataUrl;
    // 清除 Obsidian 特有的 dataset 属性，避免干扰
    delete img.dataset.src;
  } catch (error) {
    console.error('Image processing failed:', error);
    // 保持原样，至少不破图（虽然微信会看不到）
  }
}
,

blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
,

blobToJpegDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const activeDocument = getActiveDocumentCompat();
      if (!activeDocument) {
        URL.revokeObjectURL(url);
        reject(new Error('Document unavailable'));
        return;
      }
      const canvas = activeDocument.createElement('canvas');
      let width = image.width;
      let height = image.height;

      // Resize slightly if too massive (e.g. > 1920)
      if (width > 1920) {
        height = Math.round(height * (1920 / width));
        width = 1920;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);

      // Compress to JPEG 80%
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    image.src = url;
  });
}
,
};
