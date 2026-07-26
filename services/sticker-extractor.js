/*
## 核心功能

提取 Obsidian 笔记中的微信贴图素材（图片列表、标题、清洗后的纯文本文案）。

## 输入

接收原始 Markdown、frontmatter、备用标题，以及用户在侧边栏调整过的图片顺序与删除记录。

## 输出

输出 `STICKER_MAX_IMAGES`、`STICKER_MAX_CONTENT_LENGTH`、`extractMarkdownImageSources`、
`reconcileStickerImageOrder`、`extractStickerData`，供贴图预览与发布链路复用。

## 定位

位于 services/，是共享服务模块；只做数据提取，不访问 Obsidian API 或 DOM。

## 依赖

关键依赖：`./markdown-cleaner.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { cleanMarkdownToPlainText, normalizeImageKey } from './markdown-cleaner.js';

/** 微信贴图九宫格图片上限 */
const STICKER_MAX_IMAGES = 9;

/** 微信贴图文案字数上限 */
const STICKER_MAX_CONTENT_LENGTH = 1000;

/**
 * 从 Markdown 源码中提取正文内包含的所有图片路径/URL
 *
 * @param {string} markdown
 * @returns {string[]}
 */
function extractMarkdownImageSources(markdown) {
  if (typeof markdown !== 'string') return [];

  /** @type {string[]} */
  const sources = [];
  /** @type {Set<string>} */
  const seenKeys = new Set();

  /** @param {string} raw */
  const push = (raw) => {
    const src = raw.trim();
    if (!src) return;
    const key = normalizeImageKey(src) || src;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    sources.push(src);
  };

  // 1. Wiki link 图片格式: ![[path/to/image.png]] 或 ![[path/to/image.png|alt]]
  const wikiRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiRegex.exec(markdown)) !== null) {
    push(match[1]);
  }

  // 2. 标准 Markdown 图片格式: ![alt](path/to/image.png)
  const stdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  while ((match = stdRegex.exec(markdown)) !== null) {
    push(match[1]);
  }

  return sources;
}

/**
 * 把用户在侧边栏调整过的顺序与最新笔记内容对齐。
 *
 * 用户拖拽排序、删除图片后，笔记正文仍可能继续被编辑（新增/删除图片）。这里做三件事：
 * 1. 保留用户排好的顺序，但丢掉正文中已不存在的图片；
 * 2. 正文新增的图片追加到末尾（除非用户明确删除过它）；
 * 3. 统一裁剪到九宫格上限。
 *
 * @param {object} params
 * @param {string[]} params.defaultImages - 按正文顺序提取出的图片
 * @param {string[]} [params.order] - 用户调整后的顺序
 * @param {string[]} [params.removedKeys] - 用户明确删除过的图片 key
 * @param {number} [params.limit=STICKER_MAX_IMAGES]
 * @returns {string[]}
 */
function reconcileStickerImageOrder({ defaultImages, order = [], removedKeys = [], limit = STICKER_MAX_IMAGES }) {
  const available = Array.isArray(defaultImages) ? defaultImages.filter((item) => typeof item === 'string') : [];
  const userOrder = Array.isArray(order) ? order.filter((item) => typeof item === 'string') : [];
  const removed = new Set(
    (Array.isArray(removedKeys) ? removedKeys : [])
      .filter((item) => typeof item === 'string')
      .map((item) => normalizeImageKey(item) || item)
  );

  if (userOrder.length === 0 && removed.size === 0) {
    return available.slice(0, limit);
  }

  /** @type {Map<string, string>} */
  const availableByKey = new Map();
  for (const src of available) {
    availableByKey.set(normalizeImageKey(src) || src, src);
  }

  /** @type {string[]} */
  const result = [];
  /** @type {Set<string>} */
  const used = new Set();

  // 1. 用户顺序优先，但只保留正文中依然存在的图片
  for (const src of userOrder) {
    const key = normalizeImageKey(src) || src;
    if (!availableByKey.has(key) || used.has(key) || removed.has(key)) continue;
    used.add(key);
    // 以正文中的最新写法为准，避免路径改名后失效
    result.push(availableByKey.get(key) || src);
  }

  // 2. 正文新增的图片补到末尾
  for (const src of available) {
    const key = normalizeImageKey(src) || src;
    if (used.has(key) || removed.has(key)) continue;
    used.add(key);
    result.push(src);
  }

  return result.slice(0, limit);
}

/**
 * 提取并构建贴图数据包
 *
 * @param {object} params
 * @param {string} [params.markdown=''] - 原始 Markdown 字符串
 * @param {Record<string, unknown>} [params.frontmatter={}] - 解析后的 Frontmatter 对象
 * @param {string} [params.fallbackTitle='未命名贴图'] - 备用标题 (文件 basename)
 * @param {boolean} [params.insertImageIndex=false] - 是否在正文插入 [配图 N] 指引
 * @param {string[]} [params.imageOrder] - 用户在侧边栏调整后的图片顺序
 * @param {string[]} [params.removedImageKeys] - 用户在侧边栏删除过的图片 key
 * @returns {{
 *   title: string,
 *   content: string,
 *   images: string[],
 *   hasCodeBlocks: boolean,
 *   hasTables: boolean
 * }}
 */
function extractStickerData({
  markdown = '',
  frontmatter = {},
  fallbackTitle = '未命名贴图',
  insertImageIndex = false,
  imageOrder = [],
  removedImageKeys = []
}) {
  const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  const rawTitle = typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : fallbackTitle;
  const title = rawTitle || '未命名贴图';

  // 1. 从 Frontmatter 收集 cover 和 images
  /** @type {string[]} */
  const frontmatterImages = [];
  /** @type {Set<string>} */
  const frontmatterKeys = new Set();
  /** @param {unknown} value */
  const pushFrontmatterImage = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = normalizeImageKey(trimmed) || trimmed;
    if (frontmatterKeys.has(key)) return;
    frontmatterKeys.add(key);
    frontmatterImages.push(trimmed);
  };

  pushFrontmatterImage(fm.cover);
  if (Array.isArray(fm.images)) {
    for (const img of fm.images) {
      pushFrontmatterImage(img);
    }
  }

  // 2. 从正文中提取图片
  const bodyImages = extractMarkdownImageSources(markdown);

  // 3. 合并去重（frontmatter 优先），得到默认顺序
  /** @type {string[]} */
  const combined = [...frontmatterImages];
  for (const img of bodyImages) {
    const key = normalizeImageKey(img) || img;
    if (frontmatterKeys.has(key)) continue;
    frontmatterKeys.add(key);
    combined.push(img);
  }

  // 4. 与用户在侧边栏的排序/删除操作对齐
  const finalImages = reconcileStickerImageOrder({
    defaultImages: combined,
    order: imageOrder,
    removedKeys: removedImageKeys,
    limit: STICKER_MAX_IMAGES
  });

  // 5. 清洗得出纯文本 content 及代码块/表格识别
  const cleaned = cleanMarkdownToPlainText(markdown, { insertImageIndex, imageOrder: finalImages });

  return {
    title: String(title).trim(),
    content: cleaned.text,
    images: finalImages,
    hasCodeBlocks: cleaned.hasCodeBlocks,
    hasTables: cleaned.hasTables
  };
}

export {
  STICKER_MAX_IMAGES,
  STICKER_MAX_CONTENT_LENGTH,
  extractMarkdownImageSources,
  reconcileStickerImageOrder,
  extractStickerData
};
