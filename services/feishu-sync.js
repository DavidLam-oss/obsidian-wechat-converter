/*
## 核心功能

实现飞书云文档同步链路的 feishu sync 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `prepareLocalImagesForFeishu`、`getFeishuRootBlockId`、`getFeishuDirectChildBlocks`、`summarizeFeishuBlockChunk`、`buildFeishuCreatePayloadBlocks`、`insertFeishuBlocksInChunks`、`deleteFeishuChildRange`、`syncNoteToFeishu`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：`./dom-utils.js`、`./article-image-assets.js`、`./feishu-api.js`、`./feishu-mermaid-renderer.js`、`./feishu-mermaid-remote-renderer.js`、`./feishu-media-sync.js`、`./feishu-markdown-processor.js`、`./feishu-settings.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic API responses without strict typescript type annotations */
// services/feishu-sync.js
//
// High-level orchestrator for Feishu cloud documents synchronization.
// Integrates settings, preprocessor, and low-level API client.
// Uses Obsidian APIs (via injected 'app' dependency) and requestUrl.

import { getActiveWindowValue } from './dom-utils.js';
import { resolveArticleImages } from './article-image-assets.js';
import { FeishuApiClient } from './feishu-api.js';
import { prepareMermaidDiagramsForFeishu } from './feishu-mermaid-renderer.js';
import { renderMermaidWithKroki } from './feishu-mermaid-remote-renderer.js';
import { createImageSummary, replaceFeishuImageBlocks } from './feishu-media-sync.js';
import {
  stripYamlFrontmatter,
  parseYamlTitle,
  convertWikilinks,
  getImageFileNameFromSrc,
} from './feishu-markdown-processor.js';
import {
  addFeishuUploadHistory,
  findFeishuHistoryByPath,
  incrementFeishuApiUsage,
  removeFeishuHistoryByPath,
} from './feishu-settings.js';

const FEISHU_LOCAL_IMAGE_PLACEHOLDER_BASE = 'https://obsidian-wechat-converter.invalid/feishu-local-image';

/**
 * @param {{ id?: string, filename?: string }} asset
 * @returns {string}
 */
function createFeishuLocalImagePlaceholder(asset) {
  const rawName = String(asset?.filename || '').trim();
  const extensionMatch = rawName.match(/\.([a-z0-9]+)$/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'png';
  return `${FEISHU_LOCAL_IMAGE_PLACEHOLDER_BASE}/${asset?.id || 'image'}.${extension}`;
}

/**
 * Converts an ArrayBuffer to a base64 string.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorText(error) {
  if (error instanceof Error) return error.message || String(error);
  return String(error || '');
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isRecoverableFeishuHistoryError(error) {
  const text = getErrorText(error);
  return text.includes('1770003') || /resource deleted/i.test(text) || /HTTP 404|404 page not found|not found/i.test(text);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isFeishuBlockSchemaMismatchError(error) {
  const text = getErrorText(error);
  return text.includes('1770006') || /schema mismatch/i.test(text);
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isFeishuBlockWriteError(error) {
  const text = getErrorText(error);
  return isFeishuBlockSchemaMismatchError(error)
    || text.includes('9499')
    || /Invalid parameter/i.test(text)
    || /插入飞书文档块|插入文档块|插入内容块|插入嵌套内容块/.test(text);
}

/**
 * Feishu docx page block id is the same as the document id.
 * @param {string} documentId
 * @returns {string}
 */
function getFeishuRootBlockId(documentId) {
  return documentId;
}

/**
 * @param {Array<{ block_id?: string, parent_id?: string, block_type?: number }>} blocks
 * @param {string} parentId
 * @returns {Array<{ block_id?: string, parent_id?: string, block_type?: number }>}
 */
function getFeishuDirectChildBlocks(blocks, parentId) {
  if (!Array.isArray(blocks) || !parentId) return [];
  return blocks.filter((block) => block?.parent_id === parentId && block?.block_id !== parentId);
}

/**
 * @param {Record<string, unknown>} block
 * @returns {string}
 */
function summarizeFeishuBlock(block) {
  const keys = Object.keys(block || {}).slice(0, 6);
  const blockType = block?.block_type ?? 'unknown';
  return `type=${blockType}, keys=${keys.join('|') || 'none'}`;
}

/**
 * @param {Array<Record<string, unknown>>} blocks
 * @returns {string}
 */
function summarizeFeishuBlockChunk(blocks) {
  const typeCounts = new Map();
  for (const block of blocks || []) {
    const blockType = String(block?.block_type ?? 'unknown');
    typeCounts.set(blockType, (typeCounts.get(blockType) || 0) + 1);
  }
  const typeSummary = Array.from(typeCounts.entries())
    .map(([type, count]) => `${type}:${count}`)
    .join(', ') || 'none';
  const firstBlock = blocks?.[0] ? summarizeFeishuBlock(blocks[0]) : 'empty';
  return `count=${blocks?.length || 0}; types=${typeSummary}; first=${firstBlock}`;
}

/**
 * @param {Record<string, unknown>} block
 * @returns {boolean}
 */
function feishuCreateBlockHasNestedChildren(block) {
  return Array.isArray(block?.children) && block.children.some((child) => child && typeof child === 'object');
}

/**
 * @param {Record<string, unknown>} block
 * @returns {Record<string, unknown> | null}
 */
function createFeishuBlockShell(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  const nextBlock = {};
  for (const [key, value] of Object.entries(block)) {
    if (key === 'children') continue;
    nextBlock[key] = value;
  }
  return Object.keys(nextBlock).length > 0 ? nextBlock : null;
}

/**
 * Feishu returns image blocks with `image.token`, but the create-children API
 * expects the same value as `image.file_token`.
 * @param {unknown} image
 * @returns {Record<string, unknown> | null}
 */
function sanitizeFeishuImageForCreate(image) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) return null;
  const source = /** @type {Record<string, unknown>} */ (image);
  const fileToken = typeof source.file_token === 'string' && source.file_token
    ? source.file_token
    : typeof source.token === 'string' && source.token
      ? source.token
      : '';
  if (!fileToken) return null;

  const nextImage = { file_token: fileToken };
  for (const key of ['width', 'height', 'align', 'caption']) {
    if (source[key] !== undefined && source[key] !== null) {
      nextImage[key] = source[key];
    }
  }
  return nextImage;
}

/**
 * @param {Record<string, unknown>} block
 * @returns {Record<string, unknown> | null}
 */
function sanitizeFeishuCreateBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;

  const nextBlock = {};
  for (const [key, value] of Object.entries(block)) {
    if (key === 'block_id' || key === 'parent_id' || key === 'index') continue;
    if (key === 'children') continue;
    if (key === 'image') {
      const image = sanitizeFeishuImageForCreate(value);
      if (image) nextBlock.image = image;
      continue;
    }
    nextBlock[key] = value;
  }

  if (Array.isArray(block.children) && block.children.length > 0) {
    const nextChildren = block.children
      .map((child) => sanitizeFeishuCreateBlock(child))
      .filter(Boolean);
    if (nextChildren.length > 0) {
      nextBlock.children = nextChildren;
    }
  }

  return Object.keys(nextBlock).length > 0 ? nextBlock : null;
}

/**
 * Convert the Markdown convert API response into tree-shaped create payloads.
 * The convert API may return generated identifiers and flat parent relations that
 * the create children API rejects with schema mismatch.
 * @param {Array<Record<string, unknown>>} blocks
 * @param {string} rootBlockId
 * @returns {Array<Record<string, unknown>>}
 */
function buildFeishuCreatePayloadBlocks(blocks, rootBlockId) {
  if (!Array.isArray(blocks) || !rootBlockId) return [];

  const clonedBlocks = blocks
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map((block) => ({ ...block }));

  /** @type {Map<string, Record<string, unknown>>} */
  const blockMap = new Map();
  for (const block of clonedBlocks) {
    const blockId = typeof block.block_id === 'string' ? block.block_id : '';
    if (blockId) blockMap.set(blockId, block);
  }

  const rootBlock = blockMap.get(rootBlockId);
  if (rootBlock && Array.isArray(rootBlock.children) && rootBlock.children.every((childId) => typeof childId === 'string')) {
    const visited = new Set();
    const buildFromDocumentGraph = (blockId) => {
      if (!blockId || visited.has(blockId)) return null;
      const block = blockMap.get(blockId);
      if (!block) return null;
      visited.add(blockId);

      const nextBlock = sanitizeFeishuCreateBlock(block);
      if (!nextBlock) return null;

      const childIds = Array.isArray(block.children)
        ? block.children.filter((childId) => typeof childId === 'string')
        : [];
      if (childIds.length > 0) {
        const childBlocks = childIds.map((childId) => buildFromDocumentGraph(childId)).filter(Boolean);
        if (childBlocks.length > 0) {
          nextBlock.children = childBlocks;
        }
      }

      return nextBlock;
    };

    return rootBlock.children
      .map((childId) => buildFromDocumentGraph(childId))
      .filter(Boolean);
  }

  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const childMap = new Map();
  for (const block of clonedBlocks) {
    const parentId = typeof block.parent_id === 'string' ? block.parent_id : '';
    if (!parentId) continue;
    const siblings = childMap.get(parentId) || [];
    siblings.push(block);
    childMap.set(parentId, siblings);
  }

  const attachChildren = (block) => {
    const blockId = typeof block?.block_id === 'string' ? block.block_id : '';
    const attachedChildren = blockId ? childMap.get(blockId) || [] : [];
    const explicitChildren = Array.isArray(block?.children) ? block.children : [];
    /** @type {Record<string, unknown>[]} */
    const mergedChildren = [];
    /** @type {Set<string>} */
    const seenChildIds = new Set();

    for (const child of explicitChildren) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const childId = typeof child.block_id === 'string' ? child.block_id : '';
      const resolvedChild = childId && blockMap.has(childId)
        ? blockMap.get(childId)
        : /** @type {Record<string, unknown>} */ ({ ...child, parent_id: blockId || rootBlockId });
      if (!resolvedChild) continue;
      if (childId) seenChildIds.add(childId);
      mergedChildren.push(attachChildren(resolvedChild));
    }

    for (const child of attachedChildren) {
      const childId = typeof child?.block_id === 'string' ? child.block_id : '';
      if (childId && seenChildIds.has(childId)) continue;
      mergedChildren.push(attachChildren(child));
    }

    const mergedBlock = { ...block };
    if (mergedChildren.length > 0) {
      mergedBlock.children = mergedChildren;
    } else {
      delete mergedBlock.children;
    }
    return mergedBlock;
  };

  const rootChildren = getFeishuDirectChildBlocks(clonedBlocks, rootBlockId)
    .map((block) => sanitizeFeishuCreateBlock(attachChildren(block)))
    .filter(Boolean);

  if (rootChildren.length > 0) {
    return rootChildren;
  }

  return clonedBlocks
    .filter((block) => {
      const parentId = typeof block.parent_id === 'string' ? block.parent_id : '';
      return !parentId || !blockMap.has(parentId);
    })
    .map((block) => sanitizeFeishuCreateBlock(attachChildren(block)))
    .filter(Boolean);
}

/**
 * @param {number} delayMs
 * @returns {Promise<void>}
 */
function waitForFeishuBlockThrottle(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

/**
 * @param {object} params
 * @param {FeishuApiClient} params.client
 * @param {string} params.docToken
 * @param {string} params.parentId
 * @param {number} params.startIndex
 * @param {Array<Record<string, unknown>>} params.blocks
 * @param {(stage: string, msg: string) => void} params.notify
 * @param {number} [params.chunkSize]
 * @returns {Promise<void>}
 */
async function insertFeishuBlocksInChunks({ client, docToken, parentId, startIndex, blocks, notify, chunkSize = 50 }) {
  if (!Array.isArray(blocks) || blocks.length === 0) return;

  let currentIndex = startIndex;
  let flatBuffer = [];

  const flushFlatBuffer = async () => {
    if (flatBuffer.length === 0) return;
    for (let i = 0; i < flatBuffer.length; i += chunkSize) {
      const chunk = flatBuffer.slice(i, i + chunkSize);
      notify('importing', `正在写入内容块 (${currentIndex + i + 1}/${startIndex + blocks.length})...`);
      try {
        await client.createDocumentBlocks(docToken, parentId, currentIndex + i, chunk);
      } catch (err) {
        const chunkIndex = Math.floor((currentIndex + i - startIndex) / chunkSize) + 1;
        const chunkSummary = summarizeFeishuBlockChunk(chunk);
        console.warn('[飞书同步] 插入内容块失败:', {
          docToken,
          parentId,
          index: currentIndex + i,
          chunkIndex,
          chunkSummary,
        }, err);
        const wrappedError = new Error(`${getErrorText(err)}；失败块摘要：第 ${chunkIndex} 批，${chunkSummary}`);
        wrappedError.cause = err;
        throw wrappedError;
      }
      if (i + chunkSize < flatBuffer.length) {
        await waitForFeishuBlockThrottle(300);
      }
    }
    currentIndex += flatBuffer.length;
    flatBuffer = [];
  };

  const insertNestedBlock = async (targetParentId, index, block) => {
    const shellBlock = createFeishuBlockShell(block);
    if (!shellBlock) return;
    const result = await client.createDocumentBlocks(docToken, targetParentId, index, [shellBlock]);
    const createdBlockId = result?.children?.[0]?.block_id;
    if (!createdBlockId) {
      throw new Error('飞书未返回新创建块的 block_id，无法继续写入嵌套内容');
    }

    const nestedChildren = Array.isArray(block?.children)
      ? block.children.filter((child) => child && typeof child === 'object')
      : [];
    if (nestedChildren.length > 0) {
      await insertFeishuBlocksInChunks({
        client,
        docToken,
        parentId: createdBlockId,
        startIndex: 0,
        blocks: nestedChildren,
        notify,
        chunkSize,
      });
    }
  };

  for (const block of blocks) {
    if (feishuCreateBlockHasNestedChildren(block)) {
      await flushFlatBuffer();
      notify('importing', `正在写入内容块 (${currentIndex + 1}/${startIndex + blocks.length})...`);
      try {
        await insertNestedBlock(parentId, currentIndex, block);
      } catch (err) {
        const chunkSummary = summarizeFeishuBlockChunk([block]);
        console.warn('[飞书同步] 插入嵌套内容块失败:', {
          docToken,
          parentId,
          index: currentIndex,
          chunkSummary,
        }, err);
        const wrappedError = new Error(`${getErrorText(err)}；失败块摘要：嵌套块，${chunkSummary}`);
        wrappedError.cause = err;
        throw wrappedError;
      }
      currentIndex += 1;
      await waitForFeishuBlockThrottle(200);
    } else {
      flatBuffer.push(block);
    }
  }

  await flushFlatBuffer();
}

/**
 * @param {object} params
 * @param {FeishuApiClient} params.client
 * @param {string} params.docToken
 * @param {string} params.parentId
 * @param {number} params.startIndex
 * @param {number} params.endIndex
 * @returns {Promise<void>}
 */
async function deleteFeishuChildRange({ client, docToken, parentId, startIndex, endIndex }) {
  if (endIndex <= startIndex) return;
  await client.batchDeleteBlocks(docToken, parentId, startIndex, endIndex);
}

/**
 * Imports markdown into a temporary Feishu docx so we can reuse Feishu's own
 * final block ordering for stable smart updates.
 * @param {object} params
 * @param {FeishuApiClient} params.client
 * @param {string} params.title
 * @param {string} params.markdown
 * @param {string} params.folderToken
 * @param {(stage: string, msg: string) => void} params.notify
 * @returns {Promise<{ tempDocToken: string, tempDocUrl: string, cleanup: () => Promise<void> }>}
 */
async function importTemporaryFeishuDocument({ client, title, markdown, folderToken, notify }) {
  notify('uploading_temp', '正在生成用于覆盖更新的临时 Markdown 文件...');
  const textEncoder = new TextEncoder();
  const mdBase64 = arrayBufferToBase64(textEncoder.encode(markdown).buffer);
  const tempBaseName = String(title || 'document').trim() || 'document';
  const tempFileName = `${tempBaseName}.md`;
  const tempImportTitle = `${tempBaseName} · Sync Temp`;

  const tempFileToken = await client.uploadFile(tempFileName, mdBase64, folderToken);
  let tempDocToken = '';
  let tempDocUrl = '';

  try {
    notify('importing', '正在导入临时飞书文档结构...');
    const ticket = await client.createImportTask(tempImportTitle, tempFileToken, folderToken);
    const result = await client.waitForImportTask(ticket);
    tempDocToken = result.token;
    tempDocUrl = result.url;
  } finally {
    client.deleteFile(tempFileToken, 'file').catch((err) => {
      console.warn('[飞书同步] 清理临时 Markdown 文件失败:', err);
    });
  }

  return {
    tempDocToken,
    tempDocUrl,
    cleanup: async () => {
      if (!tempDocToken) return;
      try {
        await client.deleteFile(tempDocToken, 'docx');
      } catch (err) {
        console.warn('[飞书同步] 清理临时飞书文档失败:', err);
      }
    },
  };
}

/**
 * @param {FeishuApiClient} client
 * @param {string} folderToken
 * @param {string[]} candidateTitles
 * @returns {Promise<{ title: string, url: string, docToken: string, sourcePath: string } | null>}
 */
async function findFeishuDocumentInFolder(client, folderToken, candidateTitles) {
  const normalizedTitles = candidateTitles
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!normalizedTitles.length) return null;

  const items = await client.listFolderItems(folderToken);
  const matched = items.find((item) => item.type === 'docx' && normalizedTitles.includes(String(item.name || '').trim()));
  if (!matched) return null;

  return {
    title: matched.name,
    url: `https://open.feishu.cn/docx/${matched.token}`,
    docToken: matched.token,
    sourcePath: '',
  };
}

/**
 * Resolves local Obsidian image references for Feishu block replacement while
 * keeping the Markdown import source readable for Feishu's converter.
 * @param {any} app Obsidian App instance
 * @param {any} activeFile TFile
 * @param {string} markdown
 * @returns {Promise<{ markdown: string, assets: Array<{ id: string, filename: string, mimeType: string, base64: string }>, warnings: Array<{ message?: string, src?: string, filename?: string }>, references: Array<{ originalSrc: string, path: string, fileName: string, isRemote: boolean, sizeHint?: { width: number, height: number | null } | null }> }>}
 */
async function prepareLocalImagesForFeishu(app, activeFile, markdown) {
  const result = await resolveArticleImages(markdown, activeFile, {
    app,
    localImageSrcFactory: createFeishuLocalImagePlaceholder,
    embedAssetBase64: false,
  });

  return {
    markdown: result.markdown,
    assets: result.assets || [],
    warnings: result.warnings || [],
    references: (result.references || []).map((ref) => {
      const resolvedSrc = String(ref?.resolvedSrc || ref?.originalSrc || '');
      const decodedPath = decodeURI(resolvedSrc);
      return {
        originalSrc: resolvedSrc,
        path: decodedPath,
        fileName: getImageFileNameFromSrc(String(ref?.originalSrc || resolvedSrc)),
        isRemote: /^https?:\/\//i.test(decodedPath) || decodedPath.startsWith('data:'),
        sizeHint: ref?.sizeHint || null,
      };
    }),
  };
}

/**
 * Orchestrates the sync flow.
 * @param {object} params
 * @param {any} params.app Obsidian App
 * @param {object} params.settings Feishu settings object
 * @param {any} params.activeFile TFile
 * @param {string} params.markdown Note content
 * @param {function} [params.onProgress] progress callback (stage, message)
 * @param {any} [params.requestUrl] requestUrl implementation
 * @param {'source' | 'remote-image'} [params.mermaidRenderMode] Mermaid handling mode for this sync
 * @param {'kroki'} [params.mermaidRenderProvider] Remote Mermaid renderer provider
 * @param {Function} [params.renderMermaidFenceToDataUrl] Injected remote renderer for tests/custom providers
 * @returns {Promise<{ title: string, url: string, docToken: string, transferOwnerWarning?: string, imageSummary: { uploaded: number, skipped: number, failed: number, details: Array<{ filename: string, status: string, reason: string }> } }>}
 */
async function syncNoteToFeishu({
  app,
  settings,
  activeFile,
  markdown,
  onProgress,
  requestUrl,
  mermaidRenderMode = 'source',
  mermaidRenderProvider = 'kroki',
  renderMermaidFenceToDataUrl,
}) {
  const notify = (stage, msg) => {
    if (typeof onProgress === 'function') {
      onProgress(stage, msg);
    }
  };

  const obsidianApi = getActiveWindowValue('obsidian');
  const requestUrlImpl = requestUrl || (obsidianApi && typeof obsidianApi.requestUrl === 'function' ? obsidianApi.requestUrl : null);

  // 1. Resolve document title
  let title = parseYamlTitle(markdown);
  if (!title) title = activeFile.basename;
  title = title.substring(0, 250); // limit Feishu title length

  // 2. Initialize API client
  const client = new FeishuApiClient(settings.appId, settings.appSecret, requestUrlImpl, {
    onApiCall: () => {
      incrementFeishuApiUsage(settings);
    },
  });

  // 3. Fallback Folder Search for lost history
  let historyItem = findFeishuHistoryByPath(settings, activeFile.path);
  if (!historyItem) {
    notify('searching_folder', '正在检索飞书目标文件夹中是否存在同名文档...');
    try {
      const matched = await findFeishuDocumentInFolder(client, settings.folderToken, [title]);
      if (matched) {
        historyItem = {
          title,
          url: matched.url,
          docToken: matched.docToken,
          sourcePath: activeFile.path,
        };
        addFeishuUploadHistory(settings, historyItem);
        notify('searching_folder', '命中飞书同名文档，自动关联并恢复更新链路');
      }
    } catch (err) {
      console.warn('[飞书同步] 文件夹检索失败 (不影响正常创建):', err);
    }
  }

  // 4. Preprocess Markdown body
  let processedMd = stripYamlFrontmatter(markdown);
  processedMd = convertWikilinks(processedMd, settings.uploadHistory);
  const imageSummary = createImageSummary();
  let mermaidImageResult = { markdown: processedMd, assets: [], warnings: [] };
  if (mermaidRenderMode === 'remote-image') {
    notify('processing_mermaid', '正在远端渲染 Mermaid 图表...');
    const renderMermaid = typeof renderMermaidFenceToDataUrl === 'function'
      ? renderMermaidFenceToDataUrl
      : (source) => renderMermaidWithKroki(source, {
          requestUrl: requestUrlImpl,
          provider: mermaidRenderProvider,
        });
    mermaidImageResult = await prepareMermaidDiagramsForFeishu(processedMd, {
      localImageSrcFactory: createFeishuLocalImagePlaceholder,
      notePath: activeFile.path,
      renderMermaidFenceToDataUrl: renderMermaid,
    });
    processedMd = mermaidImageResult.markdown;
  }
  const localImageResult = await prepareLocalImagesForFeishu(app, activeFile, processedMd);
  processedMd = localImageResult.markdown;
  for (const warning of [...(mermaidImageResult.warnings || []), ...localImageResult.warnings]) {
    const detail = warning.filename || warning.src || '';
    if (warning.severity !== 'info') {
      console.warn('[飞书同步] 图片预处理跳过:', detail ? `${warning.message || '图片无法处理'} (${detail})` : warning.message || warning);
    }
    imageSummary.skipped += 1;
    imageSummary.details.push({
      filename: warning.filename || warning.src || 'image',
      status: 'skipped',
      reason: warning.code || warning.message || 'image_prepare_warning',
    });
  }

  // 5. Check if it's a Smart Update or a New Document
  let docToken = '';
  let docUrl = '';
  let shouldTransferOwnership = false;
  let didUpdateExistingDocument = false;

  const importAsNewDocument = async () => {
    notify('uploading_temp', '正在生成临时 Markdown 上传文件...');
    const textEncoder = new TextEncoder();
    const mdBase64 = arrayBufferToBase64(textEncoder.encode(processedMd).buffer);
    
    const tempFileToken = await client.uploadFile(title + '.md', mdBase64, settings.folderToken);
    
    notify('importing', '正在导入为飞书云文档...');
    const ticket = await client.createImportTask(title, tempFileToken, settings.folderToken);
    
    const result = await client.waitForImportTask(ticket);
    docToken = result.token;
    docUrl = result.url;

    // Delete temp file silently in the background
    client.deleteFile(tempFileToken, 'file').catch((err) => {
      console.warn('[飞书同步] 清理临时 MD 文件失败:', err);
    });

    historyItem = {
      title,
      url: docUrl,
      docToken: docToken,
      sourcePath: activeFile.path,
    };
    shouldTransferOwnership = true;
  };

  const relinkExistingDocumentFromFolder = async (candidateTitles = []) => {
    notify('searching_folder', '历史同步记录已失效，正在目标文件夹中重新定位文档...');
    const matched = await findFeishuDocumentInFolder(client, settings.folderToken, candidateTitles);
    if (!matched) return null;

    const reboundHistoryItem = {
      title: matched.title || title,
      url: matched.url,
      docToken: matched.docToken,
      sourcePath: activeFile.path,
    };
    addFeishuUploadHistory(settings, reboundHistoryItem);
    notify('searching_folder', '已在目标文件夹中重新定位到原文档，继续执行覆盖更新');
    return reboundHistoryItem;
  };

  const updateExistingDocument = async () => {
    if (!historyItem || !historyItem.docToken) return false;

    docToken = historyItem.docToken;
    docUrl = historyItem.url;
    const rootBlockId = getFeishuRootBlockId(docToken);
    let cleanupTempDocument = async () => {};

    try {
      notify('deleting_blocks', '正在读取旧文档结构...');
      const blocks = await client.getDocumentBlocks(docToken);

      const oldChildBlockCount = getFeishuDirectChildBlocks(blocks, rootBlockId).length;

      const tempImport = await importTemporaryFeishuDocument({
        client,
        title,
        markdown: processedMd,
        folderToken: settings.folderToken,
        notify,
      });
      cleanupTempDocument = tempImport.cleanup;

      notify('importing', '正在读取临时飞书文档结构...');
      const importedBlocks = await client.getDocumentBlocks(tempImport.tempDocToken);
      const newBlocks = buildFeishuCreatePayloadBlocks(importedBlocks, tempImport.tempDocToken);

      // Write new blocks first. If Feishu rejects the block schema, the old
      // document remains intact instead of being cleared prematurely.
      await insertFeishuBlocksInChunks({
        client,
        docToken,
        parentId: rootBlockId,
        startIndex: oldChildBlockCount,
        blocks: newBlocks,
        notify,
      });

      if (oldChildBlockCount > 0) {
        notify('deleting_blocks', '正在清理旧文档内容...');
        await deleteFeishuChildRange({
          client,
          docToken,
          parentId: rootBlockId,
          startIndex: 0,
          endIndex: oldChildBlockCount,
        });
      }

      if (title !== historyItem.title) {
        notify('renaming', '正在更新飞书文档名称...');
        try {
          await client.renameFile(docToken, title);
          historyItem.title = title;
        } catch (err) {
          console.warn('[飞书同步] 重命名失败:', err);
        }
      }

      didUpdateExistingDocument = true;
      return true;
    } finally {
      await cleanupTempDocument();
    }
  };

  if (historyItem && historyItem.docToken) {
    try {
      await updateExistingDocument();
    } catch (err) {
      if (isFeishuBlockWriteError(err)) {
        console.warn('[飞书同步] 智能覆盖写入失败，旧文档内容已保留:', err);
        throw err;
      }
      let recoveredFromHistoryDrift = false;
      if (isRecoverableFeishuHistoryError(err)) {
        const previousTitle = historyItem?.title || '';
        const removed = removeFeishuHistoryByPath(settings, activeFile.path);
        if (removed) {
          console.warn('[飞书同步] 检测到历史飞书 token 已失效，已清理本地关联记录');
        }

        historyItem = await relinkExistingDocumentFromFolder([title, previousTitle]);
        if (historyItem?.docToken) {
          try {
            await updateExistingDocument();
            recoveredFromHistoryDrift = true;
          } catch (retryErr) {
            if (isFeishuBlockWriteError(retryErr)) {
              console.warn('[飞书同步] 智能覆盖写入失败，旧文档内容已保留:', retryErr);
              throw retryErr;
            }
            console.warn('[飞书同步] 重新绑定后覆盖更新仍然失败，降级为新建文档:', retryErr);
            notify('importing', '旧文档重新绑定后仍无法覆盖更新，正在新建飞书文档...');
            await importAsNewDocument();
            recoveredFromHistoryDrift = true;
          }
        } else {
          console.warn('[飞书同步] 历史飞书 token 已失效，且未能在目标文件夹中重新定位原文档');
        }
      }
      if (!recoveredFromHistoryDrift) {
        console.warn('[飞书同步] 智能覆盖更新失败，降级为新建文档:', err);
        notify('importing', '更新旧文档失败，正在新建飞书文档...');
        await importAsNewDocument();
      }
    }
  } else {
    await importAsNewDocument();
  }

  // 6. Image processing and patching
  const images = localImageResult.references || [];
  if (images.length > 0) {
    notify('processing_images', '正在扫描文档图片结构...');
    try {
      const replacementSummary = await replaceFeishuImageBlocks({
        app,
        client,
        docToken,
        images,
        assets: [
          ...(mermaidImageResult.assets || []),
          ...localImageResult.assets,
        ],
        requestUrl: requestUrlImpl,
        includeRemoteImages: didUpdateExistingDocument,
        onProgress: notify,
      });
      imageSummary.uploaded += replacementSummary.uploaded;
      imageSummary.skipped += replacementSummary.skipped;
      imageSummary.failed += replacementSummary.failed;
      imageSummary.details.push(...replacementSummary.details);
    } catch (err) {
      console.warn('[飞书同步] 图片后处理跳过，文档正文已导入:', err);
      imageSummary.failed += 1;
      imageSummary.details.push({
        filename: '文档图片结构',
        status: 'failed',
        reason: err?.message || String(err || 'image_post_process_failed'),
      });
    }
  }

  // 7. Non-blocking Ownership Transfer
  let transferOwnerWarning = '';
  if (settings.userId && shouldTransferOwnership) {
    notify('transfer_owner', '正在转移文档所有权至配置用户...');
    try {
      await client.transferDocumentOwnership(docToken, settings.userId);
    } catch (err) {
      console.warn('[飞书同步] 文档所有权转移失败:', err);
      transferOwnerWarning = err instanceof Error ? err.message : String(err || 'unknown_error');
    }
  }

  // 8. Update Settings History registry
  addFeishuUploadHistory(settings, historyItem);

  return {
    title,
    url: docUrl,
    docToken,
    transferOwnerWarning,
    imageSummary,
  };
}

export {
  prepareLocalImagesForFeishu,
  getFeishuRootBlockId,
  getFeishuDirectChildBlocks,
  summarizeFeishuBlockChunk,
  buildFeishuCreatePayloadBlocks,
  insertFeishuBlocksInChunks,
  deleteFeishuChildRange,
  syncNoteToFeishu,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after Feishu sync orchestration boundary */
