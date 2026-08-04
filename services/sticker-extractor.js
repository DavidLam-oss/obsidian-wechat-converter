/*
## 核心功能

提取 Obsidian 笔记中的微信贴图素材（图片列表、标题、清洗后的纯文本文案）。

## 输入

接收原始 Markdown、frontmatter、备用标题，以及用户在侧边栏调整过的图片顺序与删除记录。

## 输出

输出 `STICKER_MAX_IMAGES`、`STICKER_MAX_TITLE_LENGTH`、`STICKER_MAX_CONTENT_LENGTH`、`extractMarkdownImageItems`、
兼容的图片地址数组与 `extractStickerData`，供贴图预览与发布链路复用。

## 定位

位于 services/，是共享服务模块；只做数据提取，不访问 Obsidian API 或 DOM。

## 依赖

关键依赖：`./markdown-cleaner.js`、`./sticker-image-items.js`、`./sticker-constants.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- reason: compatibility order inputs intentionally accept legacy strings and unified image items */

import { cleanMarkdownToPlainText, isImageEmbedTarget } from './markdown-cleaner.js';
import {
  createBodyStickerImageItem,
  getStickerImageItemSrc,
  reconcileStickerImageItems,
} from './sticker-image-items.js';
import {
  STICKER_MAX_IMAGES,
  STICKER_MAX_TITLE_LENGTH,
  STICKER_MAX_CONTENT_LENGTH,
} from './sticker-constants.js';

/**
 * @param {string} markdown
 * @returns {string}
 */
function stripNonBodyImageRegions(markdown) {
  const withoutFrontmatter = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const lines = withoutFrontmatter.split('\n');
  const kept = [];
  let fenceChar = '';
  let fenceLength = 0;

  for (const line of lines) {
    if (fenceChar) {
      const close = line.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLength) {
        fenceChar = '';
        fenceLength = 0;
      }
      continue;
    }
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (open) {
      fenceChar = open[1][0];
      fenceLength = open[1].length;
      continue;
    }
    kept.push(line);
  }

  return kept.join('\n').replace(/%%[\s\S]*?%%/g, '');
}

/**
 * 从 Markdown 源码中提取正文内包含的所有图片项。
 * fenced code、Mermaid、Obsidian 注释和 Frontmatter 内的伪图片不会进入正文候选。
 *
 * @param {string} markdown
 * @param {{resolveBodyImageIdentity?:(src:string)=>string}} [options]
 * @returns {import('./sticker-image-items.js').StickerImageItem[]}
 */
function extractMarkdownImageItems(markdown, options = {}) {
  if (typeof markdown !== 'string') return [];

  const source = stripNonBodyImageRegions(markdown);

  /** @type {import('./sticker-image-items.js').StickerImageItem[]} */
  const items = [];
  /** @type {Set<string>} */
  const seenKeys = new Set();

  /** @param {string} raw */
  const push = (raw) => {
    const src = raw.trim();
    if (!src) return;
    const item = createBodyStickerImageItem(src, options.resolveBodyImageIdentity);
    if (!item || seenKeys.has(item.key)) return;
    seenKeys.add(item.key);
    items.push(item);
  };

  // 1. Wiki link 图片格式: ![[path/to/image.png]] 或 ![[path/to/image.png|alt]]
  const wikiRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(source)) !== null) {
    if (!isImageEmbedTarget(match[1])) continue;
    push(match[1]);
  }

  // 2. 标准 Markdown 图片格式: ![alt](path/to/image.png)
  const stdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((match = stdRegex.exec(source)) !== null) {
    push(match[1]);
  }

  return items;
}

/**
 * 兼容旧调用方的图片地址数组。
 *
 * @param {string} markdown
 * @param {{resolveBodyImageIdentity?:(src:string)=>string}} [options]
 * @returns {string[]}
 */
function extractMarkdownImageSources(markdown, options = {}) {
  return extractMarkdownImageItems(markdown, options)
    .map((item) => getStickerImageItemSrc(item))
    .filter(Boolean);
}

/**
 * 把用户在侧边栏调整过的顺序与最新笔记内容对齐。
 *
 * 用户拖拽排序、删除图片后，笔记正文仍可能继续被编辑（新增/删除图片）。这里做三件事：
 * 1. 保留用户排好的顺序，但丢掉正文中已不存在的图片；
 * 2. 正文新增的图片追加到末尾（除非用户明确删除过它）；
 * 3. 统一裁剪到微信贴图公共接口上限。
 *
 * @param {object} params
 * @param {string[]} params.defaultImages - 按正文顺序提取出的图片
 * @param {string[]} [params.order] - 用户调整后的顺序
 * @param {string[]} [params.removedKeys] - 用户明确删除过的图片 key
 * @param {number} [params.limit=STICKER_MAX_IMAGES]
 * @returns {string[]}
 */
function reconcileStickerImageOrder({ defaultImages, order = [], removedKeys = [], limit = STICKER_MAX_IMAGES }) {
  const defaultItems = (Array.isArray(defaultImages) ? defaultImages : [])
    .filter((item) => typeof item === 'string')
    .map((src) => createBodyStickerImageItem(src))
    .filter(Boolean);
  return reconcileStickerImageItems({
    defaultItems,
    order,
    removedKeys,
    limit,
  }).map((item) => getStickerImageItemSrc(item));
}

/**
 * 提取并构建贴图数据包
 *
 * @param {object} params
 * @param {string} [params.markdown=''] - 原始 Markdown 字符串
 * @param {Record<string, unknown>} [params.frontmatter={}] - 解析后的 Frontmatter 对象
 * @param {string} [params.fallbackTitle='未命名贴图'] - 备用标题 (文件 basename)
 * @param {boolean} [params.insertImageIndex=false] - 是否在正文插入 [配图 N] 指引
 * @param {Array<string|object>} [params.imageOrder] - 用户在侧边栏调整后的图片 key/旧路径
 * @param {string[]} [params.removedImageKeys] - 用户在侧边栏删除过的图片 key
 * @param {import('./sticker-image-items.js').StickerImageItem[]} [params.manualImageItems]
 * @param {(src:string)=>string} [params.resolveBodyImageIdentity]
 * @returns {{
 *   title: string,
 *   content: string,
 *   images: string[],
 *   imageItems: import('./sticker-image-items.js').StickerImageItem[],
 *   omittedImageCount: number,
 *   hasCodeBlocks: boolean,
 *   hasTables: boolean,
 *   hasMath: boolean,
 *   hasFootnotes: boolean,
 *   removed: Array<{kind:string,count:number}>
 * }}
 */
function extractStickerData({
  markdown = '',
  frontmatter = {},
  fallbackTitle = '未命名贴图',
  insertImageIndex = false,
  imageOrder = [],
  removedImageKeys = [],
  manualImageItems = [],
  resolveBodyImageIdentity,
}) {
  const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  const rawTitle = typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : fallbackTitle;
  const title = rawTitle || '未命名贴图';

  // 1. 从 Frontmatter 收集 cover 和 images
  /** @type {import('./sticker-image-items.js').StickerImageItem[]} */
  const frontmatterItems = [];
  /** @type {Set<string>} */
  const frontmatterKeys = new Set();
  /** @param {unknown} value */
  const pushFrontmatterImage = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const item = createBodyStickerImageItem(trimmed, resolveBodyImageIdentity);
    if (!item || frontmatterKeys.has(item.key)) return;
    frontmatterKeys.add(item.key);
    frontmatterItems.push(item);
  };

  pushFrontmatterImage(fm.cover);
  if (Array.isArray(fm.images)) {
    for (const img of fm.images) {
      pushFrontmatterImage(img);
    }
  }

  // 2. 从正文中提取图片
  const bodyItems = extractMarkdownImageItems(markdown, { resolveBodyImageIdentity });

  // 3. 同来源去重（frontmatter 优先），跨来源手动项不自动合并
  const defaultItems = [...frontmatterItems];
  for (const item of bodyItems) {
    if (frontmatterKeys.has(item.key)) continue;
    frontmatterKeys.add(item.key);
    defaultItems.push(item);
  }

  // 4. 与用户排序/删除和本地/素材手动项对齐
  const allAvailableImageItems = reconcileStickerImageItems({
    defaultItems,
    manualItems: Array.isArray(manualImageItems) ? manualImageItems : [],
    order: imageOrder,
    removedKeys: removedImageKeys,
    limit: Number.MAX_SAFE_INTEGER
  });
  const finalImageItems = reconcileStickerImageItems({
    defaultItems,
    manualItems: Array.isArray(manualImageItems) ? manualImageItems : [],
    order: imageOrder,
    removedKeys: removedImageKeys,
    limit: STICKER_MAX_IMAGES
  });
  const finalImages = finalImageItems.map((item) => getStickerImageItemSrc(item)).filter(Boolean);

  // 5. 清洗得出纯文本 content 及代码块/表格识别
  const cleaned = cleanMarkdownToPlainText(markdown, {
    insertImageIndex,
    imageOrder: finalImageItems,
    title: String(title).trim(),
  });

  return {
    title: String(title).trim(),
    content: cleaned.text,
    images: finalImages,
    imageItems: finalImageItems,
    omittedImageCount: Math.max(0, allAvailableImageItems.length - finalImageItems.length),
    hasCodeBlocks: cleaned.hasCodeBlocks,
    hasTables: cleaned.hasTables,
    hasMath: cleaned.hasMath,
    hasFootnotes: cleaned.hasFootnotes,
    removed: cleaned.removed,
  };
}

export {
  STICKER_MAX_IMAGES,
  STICKER_MAX_TITLE_LENGTH,
  STICKER_MAX_CONTENT_LENGTH,
  extractMarkdownImageItems,
  extractMarkdownImageSources,
  reconcileStickerImageOrder,
  extractStickerData
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment -- reason: resume typed linting after legacy sticker order normalization */
