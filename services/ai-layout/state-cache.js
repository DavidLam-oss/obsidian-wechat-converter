/*
## 核心功能

实现 AI layout 服务的 state cache 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `normalizeArticleLayoutState`、`getArticleLayoutFamilyCacheKey`、`shouldReplaceArticleLayoutFamilyState`、`normalizeArticleLayoutCacheEntry`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./catalog.js`、`./schema-validation.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import {
  AI_LAYOUT_DEFAULT_COLOR_PALETTE,
  AI_LAYOUT_DEFAULT_FAMILY,
  AI_LAYOUT_IMPLEMENTED_FAMILIES,
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
} from './constants.js';
import {
  getArticleLayoutSelectionKey,
  getLayoutFamilyById,
  normalizeLayoutSelection,
  normalizeResolvedColorPalette,
  normalizeResolvedLayoutFamily,
  normalizeResolvedSelection,
} from './catalog.js';
import { normalizeLayoutGenerationMeta, normalizeSchemaValidation } from './schema-validation.js';
import { clampNumber, coerceString, isRecord, toRecord } from './utils.js';

function normalizeArticleLayoutState(raw = {}) {
  const source = toRecord(raw);
  if (!Object.keys(source).length) return null;
  const layoutJson = isRecord(source.layoutJson) ? source.layoutJson : null;
  if (!layoutJson) return null;
  const selection = normalizeLayoutSelection(
    source.selection || layoutJson.selection || {
      layoutFamily: source.layoutFamily || layoutJson.layoutFamily || 'tutorial-cards',
      colorPalette: source.colorPalette || source.stylePack || layoutJson.stylePack || AI_LAYOUT_DEFAULT_COLOR_PALETTE,
    },
    {
      layoutFamily: 'tutorial-cards',
      colorPalette: AI_LAYOUT_DEFAULT_COLOR_PALETTE,
    }
  );
  const resolved = normalizeResolvedSelection(
    source.resolved || layoutJson.resolved || {
      layoutFamily: source.resolvedLayoutFamily || source.layoutFamily || layoutJson.layoutFamily || 'tutorial-cards',
      colorPalette: source.resolvedColorPalette || source.colorPalette || source.stylePack || layoutJson.stylePack || AI_LAYOUT_DEFAULT_COLOR_PALETTE,
    },
    {
      layoutFamily: AI_LAYOUT_DEFAULT_FAMILY,
      colorPalette: AI_LAYOUT_DEFAULT_COLOR_PALETTE,
    }
  );
  const dismissedBlockKeys = Array.isArray(source.dismissedBlockKeys)
    ? source.dismissedBlockKeys.map((item) => coerceString(item)).filter(Boolean).slice(0, 128)
    : [];
  return {
    version: clampNumber(source.version, AI_LAYOUT_SCHEMA_VERSION, 1, 999),
    updatedAt: clampNumber(source.updatedAt, Date.now(), 0, 9999999999999),
    sourceHash: typeof source.sourceHash === 'string' ? source.sourceHash : '',
    providerId: typeof source.providerId === 'string' ? source.providerId : '',
    model: typeof source.model === 'string' ? source.model : '',
    skillId: coerceString(source.skillId || source.layoutFamily || resolved.layoutFamily),
    skillVersion: coerceString(source.skillVersion || toRecord(source.generationMeta).skillVersion || getLayoutFamilyById(resolved.layoutFamily)?.version),
    selection,
    resolved,
    recommendedLayoutFamily: normalizeResolvedLayoutFamily(
      source.recommendedLayoutFamily || layoutJson.recommendedLayoutFamily,
      resolved.layoutFamily
    ),
    recommendedColorPalette: normalizeResolvedColorPalette(
      source.recommendedColorPalette || layoutJson.recommendedColorPalette || source.stylePack || layoutJson.stylePack,
      resolved.colorPalette
    ),
    stylePack: resolved.colorPalette,
    layoutFamily: resolved.layoutFamily,
    status: source.status === 'schema-error' ? 'schema-error' : (source.status === 'error' ? 'error' : 'ready'),
    lastError: typeof source.lastError === 'string' ? source.lastError : '',
    lastAttemptStatus: source.lastAttemptStatus === 'schema-error'
      ? 'schema-error'
      : (source.lastAttemptStatus === 'error' ? 'error' : (source.lastAttemptStatus === 'success' ? 'success' : 'idle')),
    lastAttemptError: typeof source.lastAttemptError === 'string' ? source.lastAttemptError : '',
    lastAttemptAt: clampNumber(source.lastAttemptAt, 0, 0, 9999999999999),
    lastAttemptSchemaValidation: normalizeSchemaValidation(source.lastAttemptSchemaValidation),
    dismissedBlockKeys,
    generationMeta: normalizeLayoutGenerationMeta(source.generationMeta, layoutJson),
    layoutJson,
  };
}

function getArticleLayoutFamilyCacheKey(state = {}, fallback = AI_LAYOUT_DEFAULT_FAMILY) {
  const layoutJson = toRecord(state?.layoutJson);
  const resolved = toRecord(state?.resolved);
  return normalizeResolvedLayoutFamily(
    resolved.layoutFamily
    || state?.layoutFamily
    || toRecord(layoutJson.resolved).layoutFamily
    || layoutJson.layoutFamily
    || fallback,
    AI_LAYOUT_DEFAULT_FAMILY
  );
}

/** @param {AiLayoutStateLike | null} currentState @param {AiLayoutStateLike | null} nextState @returns {boolean} */
function shouldReplaceArticleLayoutFamilyState(currentState = null, nextState = null) {
  if (!currentState) return true;
  if (!nextState) return false;
  /** @param {AiLayoutStateLike} state */
  const scoreState = (state) => {
    const hasBlocks = Array.isArray(state?.layoutJson?.blocks) && state.layoutJson.blocks.length > 0;
    return [
      state?.status === 'ready' ? 4 : 0,
      hasBlocks ? 2 : 0,
      state?.lastAttemptStatus === 'success' ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);
  };
  const currentScore = scoreState(currentState);
  const nextScore = scoreState(nextState);
  if (nextScore !== currentScore) return nextScore > currentScore;
  return Number(nextState.updatedAt || 0) > Number(currentState.updatedAt || 0);
}

function normalizeArticleLayoutCacheEntry(raw = {}) {
  if (!isRecord(raw)) return null;

  /** @type {Record<string, AiLayoutStateLike>} */
  const familyStates = {};
  let lastFamilyFromInput = '';

  /**
   * @param {unknown} value
   * @param {AiLayoutSelectionLike} [fallbackSelection={}]
   * @param {{ markLast?: boolean, overwrite?: boolean }} [options={}]
   */
  const ingestState = (value, fallbackSelection = {}, options = {}) => {
    const normalizedState = normalizeArticleLayoutState(value);
    if (!normalizedState) return;
    const effectiveSelection = normalizeLayoutSelection(normalizedState.selection, fallbackSelection);
    const resolvedLayoutFamily = getArticleLayoutFamilyCacheKey(normalizedState, effectiveSelection.layoutFamily);
    const resolved = normalizeResolvedSelection(normalizedState.resolved, {
      layoutFamily: resolvedLayoutFamily,
      colorPalette: normalizedState.stylePack || effectiveSelection.colorPalette,
    });
    const stylePack = normalizeResolvedColorPalette(normalizedState.stylePack || resolved.colorPalette);
    const layoutJson = {
      ...toRecord(normalizedState.layoutJson),
      selection: {
        ...toRecord(toRecord(normalizedState.layoutJson).selection),
        ...effectiveSelection,
      },
      resolved: {
        ...toRecord(toRecord(normalizedState.layoutJson).resolved),
        layoutFamily: resolvedLayoutFamily,
        colorPalette: stylePack,
      },
      layoutFamily: resolvedLayoutFamily,
      stylePack,
    };
    const nextState = {
      ...normalizedState,
      selection: effectiveSelection,
      resolved: {
        ...resolved,
        layoutFamily: resolvedLayoutFamily,
        colorPalette: stylePack,
      },
      stylePack,
      layoutFamily: resolvedLayoutFamily,
      layoutJson,
    };
    if (options.markLast) lastFamilyFromInput = resolvedLayoutFamily;
    if (options.overwrite === false && familyStates[resolvedLayoutFamily]) return;
    if (shouldReplaceArticleLayoutFamilyState(familyStates[resolvedLayoutFamily], nextState)) {
      familyStates[resolvedLayoutFamily] = nextState;
    }
  };

  const legacyState = normalizeArticleLayoutState(raw);
  if (legacyState) {
    ingestState(legacyState, legacyState.selection, { markLast: true });
  }

  if (isRecord(raw.familyStates)) {
    for (const [layoutFamilyId, value] of Object.entries(toRecord(raw.familyStates))) {
      const valueState = normalizeArticleLayoutState(value);
      ingestState(value, {
        layoutFamily: layoutFamilyId || AI_LAYOUT_DEFAULT_FAMILY,
        colorPalette: valueState?.selection?.colorPalette || valueState?.stylePack || AI_LAYOUT_DEFAULT_COLOR_PALETTE,
      }, { markLast: layoutFamilyId === raw.lastLayoutFamily });
    }
  }

  if (isRecord(raw.selectionStates)) {
    for (const [selectionKey, value] of Object.entries(toRecord(raw.selectionStates))) {
      const [layoutFamilyFromKey, colorPaletteFromKey] = String(selectionKey || '').split('::');
      ingestState(value, {
        layoutFamily: layoutFamilyFromKey || 'tutorial-cards',
        colorPalette: colorPaletteFromKey || AI_LAYOUT_DEFAULT_COLOR_PALETTE,
      }, { markLast: selectionKey === raw.lastSelectionKey });
    }
  }

  if (isRecord(raw.stylePackStates)) {
    for (const [stylePackId, value] of Object.entries(toRecord(raw.stylePackStates))) {
      ingestState(value, {
        layoutFamily: 'tutorial-cards',
        colorPalette: stylePackId || AI_LAYOUT_DEFAULT_COLOR_PALETTE,
      }, { overwrite: false, markLast: stylePackId === raw.lastStylePack });
    }
  }

  const familyKeys = Object.keys(familyStates);
  if (!familyKeys.length) return null;
  const requestedLastLayoutFamily = coerceString(raw.lastLayoutFamily);
  const rawLastLayoutFamily = AI_LAYOUT_IMPLEMENTED_FAMILIES.has(requestedLastLayoutFamily)
    ? requestedLastLayoutFamily
    : '';
  const lastLayoutFamily = familyStates[rawLastLayoutFamily]
    ? rawLastLayoutFamily
    : (familyStates[lastFamilyFromInput] ? lastFamilyFromInput : familyKeys[0]);
  const requestedLastAutoResolvedFamily = coerceString(raw.lastAutoResolvedFamily);
  const rawLastAutoResolvedFamily = AI_LAYOUT_IMPLEMENTED_FAMILIES.has(requestedLastAutoResolvedFamily)
    ? requestedLastAutoResolvedFamily
    : '';
  const lastAutoResolvedFamily = familyStates[rawLastAutoResolvedFamily]
    ? rawLastAutoResolvedFamily
    : (familyStates[lastFamilyFromInput]?.selection?.layoutFamily === AI_LAYOUT_SELECTION_AUTO ? lastFamilyFromInput : '');
  /** @type {Record<string, AiLayoutStateLike>} */
  const selectionStates = {};
  /** @type {Record<string, AiLayoutStateLike>} */
  const stylePackStates = {};
  Object.entries(familyStates).forEach(([layoutFamilyId, state]) => {
    const selectionKey = getArticleLayoutSelectionKey({
      layoutFamily: layoutFamilyId,
      colorPalette: state.selection?.colorPalette || AI_LAYOUT_SELECTION_AUTO,
    });
    selectionStates[selectionKey] = state;
    const stylePack = normalizeResolvedColorPalette(state.stylePack || state.resolved?.colorPalette);
    if (!stylePackStates[stylePack]) stylePackStates[stylePack] = state;
  });
  const lastState = familyStates[lastLayoutFamily] || null;
  const lastSelectionKey = getArticleLayoutSelectionKey({
    layoutFamily: lastLayoutFamily,
    colorPalette: lastState?.selection?.colorPalette || AI_LAYOUT_SELECTION_AUTO,
  });
  return {
    lastLayoutFamily,
    lastAutoResolvedFamily,
    familyStates,
    lastSelectionKey,
    selectionStates,
    lastStylePack: lastState?.stylePack || AI_LAYOUT_DEFAULT_COLOR_PALETTE,
    stylePackStates,
  };
}

export {
  normalizeArticleLayoutState,
  getArticleLayoutFamilyCacheKey,
  shouldReplaceArticleLayoutFamilyState,
  normalizeArticleLayoutCacheEntry,
};
