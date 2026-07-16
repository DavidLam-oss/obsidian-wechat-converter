/*
## 核心功能

实现 AI layout 服务的 layout normalization 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `buildFallbackLayout`、`mergeBlocksWithFallback`、`mergeBlocksWithFallbackDetailed`、`normalizeArticleLayout`、`createLayoutGenerationMeta`、`buildLayoutResult`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./catalog.js`、`./block-utils.js`、`./prompt-context.js`、`./schema-validation.js`、`./selection.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import {
  AI_LAYOUT_SCHEMA_VERSION,
  MAX_CASE_BLOCK_IMAGE_IDS,
  MAX_LAYOUT_BLOCKS,
  MAX_PART_NAV_ITEMS,
  validateAiLayoutPayload,
} from './constants.js';
import { getColorPaletteById, getLayoutFamilyById, getLayoutSkillById } from './catalog.js';
import { getLayoutBlockKey, getLayoutBlockLabel } from './block-utils.js';
import {
  buildSectionBlockFromSource,
  extractMarkdownSections,
  extractMarkdownSignals,
  looksLikeScreenshotRef,
  mergeSectionBlocksByBudget,
  normalizeLayoutBlock,
  summarizeText,
} from './prompt-context.js';
import { AiLayoutSchemaError, normalizeSchemaValidation } from './schema-validation.js';
import { resolveLayoutSelection } from './selection.js';
import { coerceString, toAiImageRefs, toAiLayoutBlocks, toRecord } from './utils.js';

function buildFallbackLayout(context = {}) {
  const source = toRecord(context);
  const title = coerceString(source.title || '未命名文章');
  const selectionResolution = resolveLayoutSelection({
    requestedSelection: source.selection || { colorPalette: source.stylePack },
    rawLayout: source.rawLayout,
    signals: /** @type {MarkdownSignals | null} */ (source.signals || extractMarkdownSignals(source.markdown || '')),
    imageRefs: Array.isArray(source.imageRefs)
      ? /** @type {AiImageRefLike[]} */ (source.imageRefs)
      : [],
  });
  const resolved = selectionResolution.resolved;
  const skill = getLayoutSkillById(resolved.layoutFamily);
  const fallbackConfig = toRecord(skill?.fallback);
  /** @type {AiImageRefLike[]} */
  const imageRefs = Array.isArray(source.imageRefs) ? source.imageRefs.map((item) => /** @type {AiImageRefLike} */ (toRecord(item))) : [];
  const signals = /** @type {MarkdownSignals} */ (source.signals || extractMarkdownSignals(source.markdown || ''));
  const sourceSections = Array.isArray(source.sourceSections)
    ? /** @type {AiLayoutSourceSectionLike[]} */ (source.sourceSections.map((item) => toRecord(item)))
    : extractMarkdownSections(source.markdown || '').sections;
  const firstImageId = coerceString(imageRefs[0]?.id);
  const leadText = summarizeText(signals.leadParagraphs[0] || signals.paragraphs[0] || '');
  const leadNote = summarizeText(signals.leadParagraphs[1] || '');
  const partItems = signals.sectionTitles.slice(0, MAX_PART_NAV_ITEMS).map((text, index) => ({
    label: `PART ${String(index + 1).padStart(2, '0')}`,
    text,
  }));

  /** @type {AiLayoutBlockLike[]} */
  const headBlocks = [];
  /** @type {AiLayoutBlockLike[]} */
  const bodyBlocks = [];
  if (fallbackConfig.includeHero) {
    headBlocks.push({
      type: 'hero',
      eyebrow: signals.sectionTitles[0] ? (fallbackConfig.heroEyebrow || 'AI Layout Draft') : (fallbackConfig.heroEyebrow || 'AI Article Layout'),
      title,
      subtitle: leadText || summarizeText(signals.lastParagraph || title, 64),
      coverImageId: firstImageId,
      variant: fallbackConfig.heroVariant || 'cover-right',
    });
  }

  if (fallbackConfig.includePartNav && partItems.length >= 2) {
    headBlocks.push({ type: 'part-nav', items: partItems });
  }

  if (fallbackConfig.includeLeadQuote && leadText) {
    headBlocks.push({
      type: 'lead-quote',
      text: leadText,
      note: leadNote,
    });
  }

  const heroCoverImageId = coerceString(headBlocks.find((block) => block?.type === 'hero')?.coverImageId);
  const safeSourceSections = Array.isArray(sourceSections)
    ? sourceSections.map((section) => /** @type {AiLayoutSourceSectionLike} */ (toRecord(section)))
    : [];
  safeSourceSections.forEach((section, index) => {
    const block = buildSectionBlockFromSource(section, {
      imageIds: index === 0 && firstImageId && heroCoverImageId !== firstImageId ? [firstImageId] : [],
      fallbackIndex: index,
    });
    if (block) bodyBlocks.push(block);
  });
  const maxSectionBlocks = Number.isInteger(fallbackConfig.maxSectionBlocks) ? fallbackConfig.maxSectionBlocks : 0;
  const budgetedBodyBlocks = mergeSectionBlocksByBudget(bodyBlocks, maxSectionBlocks);

  const screenshotImage = imageRefs.find((image, index) => index > 0 && looksLikeScreenshotRef(image)) || null;
  if (fallbackConfig.includePhoneFrame && screenshotImage?.id) {
    budgetedBodyBlocks.push({
      type: 'phone-frame',
      imageId: screenshotImage.id,
      caption: screenshotImage.caption || screenshotImage.alt || '示意截图',
    });
  }

  /**
   * @param {AiLayoutBlockLike[]} blocks
   * @returns {Set<string>}
   */
  const collectUsedImageIds = (blocks = []) => {
    /** @type {Set<string>} */
    const used = new Set();
    blocks.forEach((block) => {
      const blockRecord = toRecord(block);
      const coverImageId = coerceString(blockRecord.coverImageId);
      if (coverImageId) used.add(coverImageId);
      const singleImageId = coerceString(blockRecord.imageId);
      if (singleImageId) used.add(singleImageId);
      if (Array.isArray(blockRecord.imageIds)) {
        blockRecord.imageIds.map((item) => coerceString(item)).filter(Boolean).forEach((item) => used.add(item));
      }
    });
    return used;
  };
  /**
   * @param {AiLayoutBlockLike[]} blocks
   * @param {string[]} remainingImageIds
   * @param {string} familyId
   * @returns {AiLayoutBlockLike[]}
   */
  const appendRemainingImages = (blocks = [], remainingImageIds = [], familyId = '') => {
    const queue = remainingImageIds.slice();
    if (!queue.length) return blocks;

    /** @type {number[]} */
    const attachableIndexes = [];
    blocks.forEach((block, index) => {
      const blockType = coerceString(toRecord(block).type);
      if (blockType === 'section-block' || blockType === 'case-block') {
        attachableIndexes.push(index);
      }
    });

    attachableIndexes.forEach((blockIndex) => {
      if (!queue.length) return;
      const block = blocks[blockIndex];
      const blockRecord = toRecord(block);
      const limit = blockRecord.type === 'case-block' ? MAX_CASE_BLOCK_IMAGE_IDS : 3;
      const currentImageIds = Array.isArray(blockRecord.imageIds)
        ? blockRecord.imageIds.map((item) => coerceString(item)).filter(Boolean)
        : [];
      const availableSlots = Math.max(0, limit - currentImageIds.length);
      if (!availableSlots) return;
      blocks[blockIndex] = {
        ...block,
        imageIds: currentImageIds.concat(queue.splice(0, availableSlots)),
      };
    });

    while (queue.length) {
      blocks.push({
        type: 'case-block',
        caseLabel: fallbackConfig.galleryCaseLabel || (familyId === 'editorial-lite' ? 'IMAGES' : 'GALLERY'),
        title: fallbackConfig.galleryTitle || (familyId === 'editorial-lite' ? '图像摘录' : '配图补充'),
        summary: '',
        bullets: [],
        imageIds: queue.splice(0, MAX_CASE_BLOCK_IMAGE_IDS),
        highlight: '',
      });
    }

    return blocks;
  };
  const usedImageIds = collectUsedImageIds([...headBlocks, ...budgetedBodyBlocks]);
  const remainingImageIds = imageRefs
    .map((image) => coerceString(image?.id))
    .filter(Boolean)
    .filter((imageId) => !usedImageIds.has(imageId));
  appendRemainingImages(budgetedBodyBlocks, remainingImageIds, resolved.layoutFamily);

  return {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: signals.sectionTitles.length >= 2 ? 'tutorial' : 'article',
    selection: selectionResolution.selection,
    resolved,
    recommendedLayoutFamily: selectionResolution.recommendedLayoutFamily,
    recommendedColorPalette: selectionResolution.recommendedColorPalette,
    stylePack: resolved.colorPalette,
    layoutFamily: resolved.layoutFamily,
    title,
    summary: summarizeText(leadText || signals.lastParagraph || title, 90),
    blocks: [...headBlocks, ...budgetedBodyBlocks].filter(Boolean).slice(0, MAX_LAYOUT_BLOCKS),
  };
}

/** @param {AiLayoutBlockLike[]} aiBlocks @param {AiLayoutBlockLike[]} fallbackBlocks @returns {AiLayoutBlockLike[]} */
function mergeBlocksWithFallback(aiBlocks = [], fallbackBlocks = []) {
  return mergeBlocksWithFallbackDetailed(aiBlocks, fallbackBlocks).map((entry) => entry.block);
}

/** @param {AiLayoutBlockLike[]} aiBlocks @param {AiLayoutBlockLike[]} fallbackBlocks @returns {Array<{ block: AiLayoutBlockLike, source: 'ai' | 'fallback' }>} */
function mergeBlocksWithFallbackDetailed(aiBlocks = [], fallbackBlocks = []) {
  const introOrder = ['hero', 'part-nav', 'lead-quote'];
  /** @type {Map<string, AiLayoutBlockLike>} */
  const introAiByType = new Map();
  /** @type {Map<string, AiLayoutBlockLike>} */
  const introFallbackByType = new Map();
  /** @type {Map<number, AiLayoutBlockLike>} */
  const fallbackSectionsByIndex = new Map();
  /** @type {Array<{ block: AiLayoutBlockLike, source: 'ai' }>} */
  const deferredAi = [];
  /** @type {Array<{ block: AiLayoutBlockLike, source: 'ai' | 'fallback' }>} */
  const deferredFallback = [];
  /** @type {Set<string>} */
  const seenKeys = new Set();
  /** @type {Array<{ block: AiLayoutBlockLike, source: 'ai' | 'fallback' }>} */
  const merged = [];

  /**
   * @param {AiLayoutBlockLike | null | undefined} block
   * @param {'ai' | 'fallback'} source
   */
  const addBlock = (block, source) => {
    const blockRecord = toRecord(block);
    if (!block || !coerceString(blockRecord.type)) return;
    const dedupeKey = getLayoutBlockKey(block);
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    merged.push({ block, source });
  };

  /** @type {number[]} */
  const fallbackSectionIndices = [];
  fallbackBlocks.forEach((block) => {
    const blockRecord = toRecord(block);
    const blockType = coerceString(blockRecord.type);
    if (!block || !blockType) return;
    if (introOrder.includes(blockType)) {
      if (!introFallbackByType.has(blockType)) {
        introFallbackByType.set(blockType, block);
      }
      return;
    }
    if (blockType === 'section-block' && Number.isInteger(blockRecord.sectionIndex) && blockRecord.sectionIndex >= 0) {
      const sectionIndex = Number(blockRecord.sectionIndex);
      if (!fallbackSectionsByIndex.has(sectionIndex)) {
        fallbackSectionsByIndex.set(sectionIndex, block);
        fallbackSectionIndices.push(sectionIndex);
      }
      return;
    }
    deferredFallback.push({ block, source: 'fallback' });
  });

  aiBlocks.forEach((block) => {
    const blockType = coerceString(toRecord(block).type);
    if (!block || !blockType) return;
    if (introOrder.includes(blockType)) {
      if (!introAiByType.has(blockType)) {
        introAiByType.set(blockType, block);
      }
      return;
    }
    deferredAi.push({ block, source: 'ai' });
  });

  introOrder.forEach((type) => {
    const aiBlock = introAiByType.get(type);
    const fallbackBlock = introFallbackByType.get(type);
    if (aiBlock) {
      addBlock(aiBlock, 'ai');
    } else if (fallbackBlock) {
      addBlock(fallbackBlock, 'fallback');
    }
  });

  const sortedFallbackIndices = Array.from(new Set(fallbackSectionIndices)).sort((a, b) => a - b);
  let fallbackPointer = 0;
  /** @param {number} targetIndex */
  const flushFallbackSectionsBefore = (targetIndex) => {
    while (fallbackPointer < sortedFallbackIndices.length && sortedFallbackIndices[fallbackPointer] < targetIndex) {
      const sectionIndex = sortedFallbackIndices[fallbackPointer];
      addBlock(fallbackSectionsByIndex.get(sectionIndex), 'fallback');
      fallbackPointer += 1;
    }
  };
  /** @param {number} sectionIndex */
  const consumeFallbackSection = (sectionIndex) => {
    while (fallbackPointer < sortedFallbackIndices.length && sortedFallbackIndices[fallbackPointer] <= sectionIndex) {
      fallbackPointer += 1;
    }
  };

  deferredAi.forEach((entry) => {
    const block = entry.block;
    const blockRecord = toRecord(block);
    if (blockRecord.type === 'section-block' && Number.isInteger(blockRecord.sectionIndex) && blockRecord.sectionIndex >= 0) {
      const sectionIndex = Number(blockRecord.sectionIndex);
      flushFallbackSectionsBefore(sectionIndex);
      addBlock(block, 'ai');
      consumeFallbackSection(sectionIndex);
      return;
    }
    if (blockRecord.type === 'hero' || blockRecord.type === 'part-nav' || blockRecord.type === 'lead-quote') {
      return;
    }
    deferredFallback.push(entry);
  });

  flushFallbackSectionsBefore(Number.POSITIVE_INFINITY);
  deferredFallback.forEach((entry) => addBlock(entry.block, entry.source));

  return merged.slice(0, MAX_LAYOUT_BLOCKS);
}

function normalizeArticleLayout(rawLayout = {}, context = {}) {
  const rawLayoutRecord = toRecord(rawLayout);
  const contextRecord = toRecord(context);
  const imageRefs = toAiImageRefs(contextRecord.imageRefs);
  const imageIds = new Set(imageRefs.map((image) => coerceString(image.id)).filter(Boolean));
  const selectionResolution = resolveLayoutSelection({
    requestedSelection: contextRecord.selection || { colorPalette: contextRecord.stylePack },
    rawLayout: rawLayoutRecord,
    signals: /** @type {MarkdownSignals | null} */ (contextRecord.signals || extractMarkdownSignals(contextRecord.markdown || '')),
    imageRefs,
  });
  const sourceSections = Array.isArray(contextRecord.sourceSections)
    ? /** @type {AiLayoutSourceSectionLike[]} */ (contextRecord.sourceSections.map((section) => toRecord(section)))
    : extractMarkdownSections(contextRecord.markdown || '').sections;
  const rawBlocks = toAiLayoutBlocks(rawLayoutRecord.blocks);
  const normalizedAiBlocks = rawBlocks.length
    ? rawBlocks
      .map((block, index) => normalizeLayoutBlock(block, imageIds, sourceSections, index))
      .filter(Boolean)
    : [];
  const fallbackLayout = buildFallbackLayout({
    title: rawLayoutRecord.title || contextRecord.title,
    markdown: contextRecord.markdown,
    selection: selectionResolution.selection,
    rawLayout: rawLayoutRecord,
    imageRefs,
    signals: contextRecord.signals,
    sourceSections,
  });
  const blocks = mergeBlocksWithFallback(
    /** @type {AiLayoutBlockLike[]} */ (normalizedAiBlocks.filter(Boolean)),
    toAiLayoutBlocks(fallbackLayout.blocks)
  );

  return {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: coerceString(rawLayoutRecord.articleType || fallbackLayout.articleType || 'article'),
    selection: selectionResolution.selection,
    resolved: selectionResolution.resolved,
    recommendedLayoutFamily: selectionResolution.recommendedLayoutFamily,
    recommendedColorPalette: selectionResolution.recommendedColorPalette,
    stylePack: selectionResolution.resolved.colorPalette,
    layoutFamily: selectionResolution.resolved.layoutFamily,
    title: coerceString(rawLayoutRecord.title || contextRecord.title || fallbackLayout.title),
    summary: coerceString(rawLayoutRecord.summary || fallbackLayout.summary),
    blocks,
  };
}

/**
 * @param {{ provider?: AiProviderLike | null, layoutFamily: string, colorPalette: string, recommendedLayoutFamily: string, recommendedColorPalette: string, signals?: MarkdownSignals, imageRefs?: AiImageRefLike[], normalizedAiBlocks?: AiLayoutBlockLike[], mergedEntries?: Array<{ source?: 'ai' | 'fallback', block?: AiLayoutBlockLike }>, schemaValidation?: AiSchemaValidationLike | null }} options
 * @returns {AiLayoutGenerationMetaLike}
 */
function createLayoutGenerationMeta({
  provider,
  layoutFamily,
  colorPalette,
  recommendedLayoutFamily,
  recommendedColorPalette,
  signals,
  imageRefs = [],
  normalizedAiBlocks = [],
  mergedEntries = [],
  schemaValidation = null,
}) {
  const safeSignals = signals || extractMarkdownSignals('');
  const safeImageRefs = toAiImageRefs(imageRefs);
  const safeNormalizedAiBlocks = toAiLayoutBlocks(normalizedAiBlocks);
  /** @type {Array<{ source?: 'ai' | 'fallback', block?: AiLayoutBlockLike }>} */
  const safeMergedEntries = Array.isArray(mergedEntries)
    ? mergedEntries.map((entry) => {
      const entryRecord = toRecord(entry);
      return {
        source: entryRecord.source === 'fallback' ? 'fallback' : 'ai',
        block: /** @type {AiLayoutBlockLike} */ (toRecord(entryRecord.block)),
      };
    })
    : [];
  const layoutFamilyInfo = getLayoutFamilyById(layoutFamily);
  const colorPaletteInfo = getColorPaletteById(colorPalette);
  const fallbackEntries = safeMergedEntries.filter((entry) => entry.source === 'fallback');
  const executionMode = fallbackEntries.length > 0 && safeNormalizedAiBlocks.length === 0
    ? 'local-fallback'
    : 'ai-enhanced';
  return {
    providerName: coerceString(provider?.name),
    providerModel: coerceString(provider?.model),
    skillId: layoutFamilyInfo?.id || coerceString(layoutFamily),
    skillLabel: layoutFamilyInfo?.label || '',
    skillVersion: layoutFamilyInfo?.version || '',
    executionMode,
    layoutFamilyLabel: layoutFamilyInfo?.label || '',
    colorPaletteLabel: colorPaletteInfo?.label || '',
    stylePackLabel: colorPaletteInfo?.label || '',
    recommendedLayoutFamilyLabel: getLayoutFamilyById(recommendedLayoutFamily)?.label || '',
    recommendedColorPaletteLabel: getColorPaletteById(recommendedColorPalette)?.label || '',
    headingCount: safeSignals.headings.length,
    sectionCount: safeSignals.sectionTitles.length,
    leadParagraphCount: safeSignals.leadParagraphs.length,
    bulletGroupCount: safeSignals.bulletGroups.length,
    imageCount: safeImageRefs.length,
    aiBlockCount: safeNormalizedAiBlocks.length,
    finalBlockCount: safeMergedEntries.length,
    fallbackUsed: fallbackEntries.length > 0,
    fallbackBlockCount: fallbackEntries.length,
    fallbackBlockTypes: Array.from(new Set(fallbackEntries.map((entry) => entry.block?.type).filter(Boolean))).slice(0, 6),
    schemaValidation: normalizeSchemaValidation(schemaValidation),
    blockOrigins: safeMergedEntries.map((entry, index) => ({
      index,
      type: coerceString(entry.block?.type),
      source: entry.source === 'fallback' ? 'fallback' : 'ai',
      label: getLayoutBlockLabel(entry.block),
    })),
  };
}

function buildLayoutResult(rawLayout = {}, context = {}) {
  const rawLayoutRecord = toRecord(rawLayout);
  const contextRecord = toRecord(context);
  const validation = validateAiLayoutPayload(rawLayout);
  const signals = /** @type {MarkdownSignals} */ (contextRecord.signals || extractMarkdownSignals(contextRecord.markdown || ''));
  const imageRefs = toAiImageRefs(contextRecord.imageRefs);
  const selectionResolution = resolveLayoutSelection({
    requestedSelection: contextRecord.selection || { colorPalette: contextRecord.stylePack },
    rawLayout: rawLayoutRecord,
    signals,
    imageRefs,
  });
  if (validation.fatal) {
    const generationMeta = createLayoutGenerationMeta({
      provider: /** @type {AiProviderLike} */ (toRecord(contextRecord.provider)),
      layoutFamily: selectionResolution.resolved.layoutFamily,
      colorPalette: selectionResolution.resolved.colorPalette,
      recommendedLayoutFamily: selectionResolution.recommendedLayoutFamily,
      recommendedColorPalette: selectionResolution.recommendedColorPalette,
      signals,
      imageRefs,
      normalizedAiBlocks: [],
      mergedEntries: [],
      schemaValidation: validation,
    });
    throw new AiLayoutSchemaError(`AI 返回的布局结果未通过 schema 校验（${validation.issueCount} 项）`, validation, generationMeta);
  }

  const imageIds = new Set(imageRefs.map((image) => coerceString(image.id)).filter(Boolean));
  const sourceSections = Array.isArray(contextRecord.sourceSections)
    ? /** @type {AiLayoutSourceSectionLike[]} */ (contextRecord.sourceSections.map((section) => toRecord(section)))
    : extractMarkdownSections(contextRecord.markdown || '').sections;
  const rawBlocks = toAiLayoutBlocks(rawLayoutRecord.blocks);
  const normalizedAiBlocks = rawBlocks.length
    ? rawBlocks
      .map((block, index) => normalizeLayoutBlock(block, imageIds, sourceSections, index))
      .filter(Boolean)
    : [];
  const fallbackLayout = buildFallbackLayout({
    title: rawLayoutRecord.title || contextRecord.title,
    markdown: contextRecord.markdown,
    selection: selectionResolution.selection,
    rawLayout: rawLayoutRecord,
    imageRefs,
    signals,
    sourceSections,
  });
  const mergedEntries = mergeBlocksWithFallbackDetailed(
    /** @type {AiLayoutBlockLike[]} */ (normalizedAiBlocks.filter(Boolean)),
    toAiLayoutBlocks(fallbackLayout.blocks)
  );
  const layoutJson = {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: coerceString(rawLayoutRecord.articleType || fallbackLayout.articleType || 'article'),
    selection: selectionResolution.selection,
    resolved: selectionResolution.resolved,
    recommendedLayoutFamily: selectionResolution.recommendedLayoutFamily,
    recommendedColorPalette: selectionResolution.recommendedColorPalette,
    stylePack: selectionResolution.resolved.colorPalette,
    layoutFamily: selectionResolution.resolved.layoutFamily,
    title: coerceString(rawLayoutRecord.title || contextRecord.title || fallbackLayout.title),
    summary: coerceString(rawLayoutRecord.summary || fallbackLayout.summary),
    blocks: mergedEntries.map((entry) => entry.block),
  };

  return {
    layoutJson,
    generationMeta: createLayoutGenerationMeta({
      provider: /** @type {AiProviderLike} */ (toRecord(contextRecord.provider)),
      layoutFamily: layoutJson.resolved.layoutFamily,
      colorPalette: layoutJson.resolved.colorPalette,
      recommendedLayoutFamily: layoutJson.recommendedLayoutFamily,
      recommendedColorPalette: layoutJson.recommendedColorPalette,
      signals,
      imageRefs,
      normalizedAiBlocks,
      mergedEntries,
      schemaValidation: validation,
    }),
  };
}

export {
  buildFallbackLayout,
  mergeBlocksWithFallback,
  mergeBlocksWithFallbackDetailed,
  normalizeArticleLayout,
  createLayoutGenerationMeta,
  buildLayoutResult,
};
