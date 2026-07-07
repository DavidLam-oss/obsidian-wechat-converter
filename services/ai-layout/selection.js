/*
## 核心功能

实现 AI layout 服务的 selection 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `resolveLayoutSelection`、`getArticleLayoutSelectionState`、`deriveArticleLayoutStateForSelection`、`getArticleLayoutSelectionStateKey`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./catalog.js`、`./prompt-context.js`、`./schema-validation.js`、`./state-cache.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import {
  AI_LAYOUT_DEFAULT_COLOR_PALETTE,
  AI_LAYOUT_DEFAULT_FAMILY,
  AI_LAYOUT_SELECTION_AUTO,
} from './constants.js';
import {
  getColorPaletteById,
  normalizeAutoRecommendedColorPalette,
  normalizeColorPalette,
  normalizeLayoutFamily,
  normalizeLayoutSelection,
  normalizeResolvedColorPalette,
  normalizeResolvedLayoutFamily,
} from './catalog.js';
import { recommendColorPalette, recommendLayoutFamily } from './prompt-context.js';
import { normalizeLayoutGenerationMeta } from './schema-validation.js';
import { normalizeArticleLayoutCacheEntry, normalizeArticleLayoutState } from './state-cache.js';
import { toRecord, toSelectionRecord } from './utils.js';

function resolveLayoutSelection({
  requestedSelection = {},
  rawLayout = {},
  signals = null,
  imageRefs = [],
} = {}) {
  const selection = normalizeLayoutSelection(requestedSelection);
  const rawLayoutRecord = toRecord(rawLayout);
  const rawResolved = toSelectionRecord(rawLayoutRecord.resolved);
  const inferredLayoutFamily = recommendLayoutFamily({ rawLayout, signals, imageRefs });
  const inferredColorPalette = recommendColorPalette({ rawLayout, signals });
  const recommendedLayoutFamily = normalizeResolvedLayoutFamily(
    rawLayoutRecord.recommendedLayoutFamily || rawResolved.layoutFamily || rawLayoutRecord.layoutFamily,
    inferredLayoutFamily
  );
  const recommendedColorPalette = normalizeAutoRecommendedColorPalette(
    rawLayoutRecord.recommendedColorPalette || rawResolved.colorPalette || rawLayoutRecord.stylePack,
    inferredColorPalette
  );
  const resolved = {
    layoutFamily: selection.layoutFamily === AI_LAYOUT_SELECTION_AUTO
      ? recommendedLayoutFamily
      : normalizeResolvedLayoutFamily(selection.layoutFamily, recommendedLayoutFamily),
    colorPalette: selection.colorPalette === AI_LAYOUT_SELECTION_AUTO
      ? recommendedColorPalette
      : normalizeResolvedColorPalette(selection.colorPalette, recommendedColorPalette),
  };

  return {
    selection,
    resolved,
    recommendedLayoutFamily,
    recommendedColorPalette,
  };
}

function getArticleLayoutSelectionState(entry, selection = {}, defaults = {}) {
  const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
  if (!normalizedEntry) return null;
  const normalizedSelection = normalizeLayoutSelection(selection, defaults);
  const requestedLayoutFamily = normalizeLayoutFamily(normalizedSelection.layoutFamily, AI_LAYOUT_SELECTION_AUTO);
  const familyStates = normalizedEntry.familyStates || {};
  const familyKeys = Object.keys(familyStates);
  if (!familyKeys.length) return null;

  if (requestedLayoutFamily !== AI_LAYOUT_SELECTION_AUTO) {
    const requestedResolvedLayoutFamily = normalizeResolvedLayoutFamily(requestedLayoutFamily, AI_LAYOUT_DEFAULT_FAMILY);
    return familyStates[requestedResolvedLayoutFamily] || null;
  }

  if (normalizedEntry.lastAutoResolvedFamily && familyStates[normalizedEntry.lastAutoResolvedFamily]) {
    return familyStates[normalizedEntry.lastAutoResolvedFamily];
  }
  if (normalizedEntry.lastLayoutFamily && familyStates[normalizedEntry.lastLayoutFamily]) {
    return familyStates[normalizedEntry.lastLayoutFamily];
  }
  return familyStates[familyKeys[0]] || null;
}

function deriveArticleLayoutStateForSelection(state, selection = {}, defaults = {}) {
  const normalizedState = normalizeArticleLayoutState(state);
  if (!normalizedState?.layoutJson?.blocks?.length) return null;
  if (normalizedState.status !== 'ready') return null;

  const requestedSelection = normalizeLayoutSelection(selection, {
    layoutFamily: normalizedState.selection?.layoutFamily || toSelectionRecord(defaults).layoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: normalizedState.selection?.colorPalette || toSelectionRecord(defaults).colorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
  const requestedColorPalette = normalizeColorPalette(
    requestedSelection.colorPalette,
    normalizedState.selection?.colorPalette || toSelectionRecord(defaults).colorPalette || AI_LAYOUT_SELECTION_AUTO
  );
  if (!requestedColorPalette || requestedColorPalette === AI_LAYOUT_SELECTION_AUTO) return null;

  const baseResolvedLayoutFamily = normalizeResolvedLayoutFamily(
    normalizedState.resolved?.layoutFamily || normalizedState.layoutFamily,
    AI_LAYOUT_DEFAULT_FAMILY
  );
  const baseSelectedLayoutFamily = normalizeLayoutFamily(
    normalizedState.selection?.layoutFamily,
    AI_LAYOUT_SELECTION_AUTO
  );
  const requestedLayoutFamily = normalizeLayoutFamily(
    requestedSelection.layoutFamily,
    normalizedState.selection?.layoutFamily || toSelectionRecord(defaults).layoutFamily || AI_LAYOUT_SELECTION_AUTO
  );
  const isCompatibleLayout = (
    requestedLayoutFamily === AI_LAYOUT_SELECTION_AUTO
    || requestedLayoutFamily === baseSelectedLayoutFamily
    || requestedLayoutFamily === baseResolvedLayoutFamily
  );
  if (!isCompatibleLayout) return null;

  const nextResolvedColorPalette = normalizeResolvedColorPalette(
    requestedColorPalette,
    normalizedState.resolved?.colorPalette || AI_LAYOUT_DEFAULT_COLOR_PALETTE
  );
  const nextColorPaletteLabel = getColorPaletteById(nextResolvedColorPalette)?.label || nextResolvedColorPalette;
  const nextSelection = {
    layoutFamily: requestedLayoutFamily || normalizedState.selection?.layoutFamily || AI_LAYOUT_SELECTION_AUTO,
    colorPalette: requestedColorPalette,
  };
  const nextLayoutJson = {
    ...toRecord(normalizedState.layoutJson),
    selection: {
      ...toRecord(toRecord(normalizedState.layoutJson).selection),
      ...nextSelection,
    },
    resolved: {
      ...toRecord(toRecord(normalizedState.layoutJson).resolved),
      layoutFamily: baseResolvedLayoutFamily,
      colorPalette: nextResolvedColorPalette,
    },
    recommendedLayoutFamily: normalizedState.recommendedLayoutFamily,
    recommendedColorPalette: normalizedState.recommendedColorPalette,
    stylePack: nextResolvedColorPalette,
    layoutFamily: baseResolvedLayoutFamily,
  };
  const nextGenerationMeta = normalizeLayoutGenerationMeta({
    ...(normalizedState.generationMeta || {}),
    colorPaletteLabel: nextColorPaletteLabel,
    stylePackLabel: nextColorPaletteLabel,
  }, nextLayoutJson);

  return normalizeArticleLayoutState({
    ...normalizedState,
    selection: nextSelection,
    resolved: {
      layoutFamily: baseResolvedLayoutFamily,
      colorPalette: nextResolvedColorPalette,
    },
    recommendedLayoutFamily: normalizedState.recommendedLayoutFamily,
    recommendedColorPalette: normalizedState.recommendedColorPalette,
    stylePack: nextResolvedColorPalette,
    layoutFamily: baseResolvedLayoutFamily,
    generationMeta: nextGenerationMeta,
    layoutJson: nextLayoutJson,
  });
}

function getArticleLayoutSelectionStateKey(entry, selection = {}, defaults = {}) {
  const normalizedEntry = normalizeArticleLayoutCacheEntry(entry);
  if (!normalizedEntry) return '';
  const normalizedSelection = normalizeLayoutSelection(selection, defaults);
  const requestedLayoutFamily = normalizeLayoutFamily(normalizedSelection.layoutFamily, AI_LAYOUT_SELECTION_AUTO);
  if (requestedLayoutFamily !== AI_LAYOUT_SELECTION_AUTO) {
    const requestedResolvedLayoutFamily = normalizeResolvedLayoutFamily(requestedLayoutFamily, AI_LAYOUT_DEFAULT_FAMILY);
    return normalizedEntry.familyStates?.[requestedResolvedLayoutFamily] ? requestedResolvedLayoutFamily : '';
  }
  return normalizedEntry.lastAutoResolvedFamily || normalizedEntry.lastLayoutFamily || '';
}

export {
  resolveLayoutSelection,
  getArticleLayoutSelectionState,
  deriveArticleLayoutStateForSelection,
  getArticleLayoutSelectionStateKey,
};
