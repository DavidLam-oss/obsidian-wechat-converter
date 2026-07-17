/*
## 核心功能

提供飞书文档块结构转换、分批写入和范围删除能力。

## 输入

接收飞书转换 API 返回的块、目标文档信息、写入位置和进度回调。

## 输出

输出块树构建、摘要、分批插入和范围删除函数，供飞书同步编排层复用。

## 定位

位于 services/，是 feishu-sync.js 的文档块子模块；不处理标题、历史记录、图片或文档创建决策。

## 依赖

依赖飞书 API 客户端传入的块写入与删除方法，以及浏览器窗口计时器。

## 维护规则

- 保持块结构转换与网络编排解耦。
- 新增飞书块类型时优先补充本模块测试，不把规则堆回同步编排层。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic Feishu block responses without strict typescript type annotations */

/**
 * @param {unknown} error
 * @returns {string}
 */
function getErrorText(error) {
  if (error instanceof Error) return error.message || String(error);
  return String(error || '');
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

export {
  getFeishuRootBlockId,
  getFeishuDirectChildBlocks,
  summarizeFeishuBlockChunk,
  buildFeishuCreatePayloadBlocks,
  insertFeishuBlocksInChunks,
  deleteFeishuChildRange,
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: resume typed linting after Feishu block boundary */
