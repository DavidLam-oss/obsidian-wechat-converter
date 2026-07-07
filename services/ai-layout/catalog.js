/*
## 核心功能

实现 AI layout 服务的 catalog 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `normalizeLayoutFamily`、`normalizeColorPalette`、`normalizeResolvedLayoutFamily`、`normalizeResolvedColorPalette`、`normalizeAutoRecommendedColorPalette`、`normalizeLayoutSelection`、`normalizeResolvedSelection`、`getArticleLayoutSelectionKey`、`getLayoutFamilyList`、`getLayoutFamilyById`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./utils.js`、`./color.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import {
  AI_LAYOUT_SELECTION_AUTO,
  AI_LAYOUT_DEFAULT_FAMILY,
  AI_LAYOUT_DEFAULT_COLOR_PALETTE,
  AI_LAYOUT_IMPLEMENTED_FAMILIES,
  AI_LAYOUT_RESERVED_FAMILY_FALLBACKS,
  AI_LAYOUT_FAMILY_DEFS,
  AI_COLOR_PALETTES,
  AI_WECHAT_SAFE_STYLE_PRIMITIVES,
  getAiLayoutSkillById,
} from './constants.js';
import { coerceString, toRecord, toSelectionRecord } from './utils.js';
import { createColorPaletteFromAccent, normalizeHexColor } from './color.js';

function normalizeLayoutFamily(value, fallback = AI_LAYOUT_SELECTION_AUTO) {
  const normalized = coerceString(value);
  if (normalized === AI_LAYOUT_SELECTION_AUTO) return AI_LAYOUT_SELECTION_AUTO;
  return AI_LAYOUT_FAMILY_DEFS[normalized] ? normalized : fallback;
}

function normalizeColorPalette(value, fallback = AI_LAYOUT_SELECTION_AUTO) {
  const normalized = coerceString(value);
  if (normalized === AI_LAYOUT_SELECTION_AUTO) return AI_LAYOUT_SELECTION_AUTO;
  return AI_COLOR_PALETTES[normalized] ? normalized : fallback;
}

function normalizeResolvedLayoutFamily(value, fallback = AI_LAYOUT_DEFAULT_FAMILY) {
  const normalized = coerceString(value);
  if (!normalized) return fallback;
  if (AI_LAYOUT_IMPLEMENTED_FAMILIES.has(normalized)) return normalized;
  if (AI_LAYOUT_RESERVED_FAMILY_FALLBACKS[normalized]) {
    return AI_LAYOUT_RESERVED_FAMILY_FALLBACKS[normalized];
  }
  return AI_LAYOUT_IMPLEMENTED_FAMILIES.has(fallback) ? fallback : AI_LAYOUT_DEFAULT_FAMILY;
}

function normalizeResolvedColorPalette(value, fallback = AI_LAYOUT_DEFAULT_COLOR_PALETTE) {
  const normalized = coerceString(value);
  if (AI_COLOR_PALETTES[normalized]) return normalized;
  return AI_COLOR_PALETTES[fallback] ? fallback : AI_LAYOUT_DEFAULT_COLOR_PALETTE;
}

function normalizeAutoRecommendedColorPalette(value, fallback = AI_LAYOUT_DEFAULT_COLOR_PALETTE) {
  const normalized = normalizeResolvedColorPalette(value, fallback);
  if (normalized === 'custom') {
    const fallbackPalette = normalizeResolvedColorPalette(fallback, AI_LAYOUT_DEFAULT_COLOR_PALETTE);
    return fallbackPalette === 'custom' ? AI_LAYOUT_DEFAULT_COLOR_PALETTE : fallbackPalette;
  }
  return normalized;
}

function normalizeLayoutSelection(raw = {}, fallback = {}) {
  const candidate = (typeof raw === 'string')
    ? (AI_COLOR_PALETTES[raw]
      ? { colorPalette: raw }
      : (AI_LAYOUT_FAMILY_DEFS[raw] ? { layoutFamily: raw } : {}))
    : toSelectionRecord(raw);
  const fallbackRecord = toSelectionRecord(fallback);
  return {
    layoutFamily: normalizeLayoutFamily(
      candidate.layoutFamily ?? candidate.layout ?? candidate.family ?? fallbackRecord.layoutFamily,
      normalizeLayoutFamily(fallbackRecord.layoutFamily, AI_LAYOUT_SELECTION_AUTO)
    ),
    colorPalette: normalizeColorPalette(
      candidate.colorPalette ?? candidate.palette ?? candidate.stylePack ?? fallbackRecord.colorPalette,
      normalizeColorPalette(fallbackRecord.colorPalette, AI_LAYOUT_SELECTION_AUTO)
    ),
  };
}

function normalizeResolvedSelection(raw = {}, fallback = {}) {
  const candidate = (typeof raw === 'string')
    ? (AI_COLOR_PALETTES[raw]
      ? { colorPalette: raw }
      : (AI_LAYOUT_FAMILY_DEFS[raw] ? { layoutFamily: raw } : {}))
    : toSelectionRecord(raw);
  const fallbackRecord = toSelectionRecord(fallback);
  return {
    layoutFamily: normalizeResolvedLayoutFamily(
      candidate.layoutFamily ?? candidate.layout ?? candidate.family ?? fallbackRecord.layoutFamily,
      normalizeResolvedLayoutFamily(fallbackRecord.layoutFamily, AI_LAYOUT_DEFAULT_FAMILY)
    ),
    colorPalette: normalizeResolvedColorPalette(
      candidate.colorPalette ?? candidate.palette ?? candidate.stylePack ?? fallbackRecord.colorPalette,
      normalizeResolvedColorPalette(fallbackRecord.colorPalette, AI_LAYOUT_DEFAULT_COLOR_PALETTE)
    ),
  };
}

function getArticleLayoutSelectionKey(selection = {}) {
  const normalized = normalizeLayoutSelection(selection);
  return `${normalized.layoutFamily || AI_LAYOUT_SELECTION_AUTO}::${normalized.colorPalette || AI_LAYOUT_SELECTION_AUTO}`;
}

function getLayoutFamilyList({ includeAuto = true, includeReserved = false } = {}) {
  const list = [];
  if (includeAuto) {
    list.push({
      value: AI_LAYOUT_SELECTION_AUTO,
      label: '自动推荐',
      description: '由 AI 根据文章内容自动推荐布局。',
    });
  }
  Object.values(AI_LAYOUT_FAMILY_DEFS).forEach((family) => {
    if (!includeReserved && !AI_LAYOUT_IMPLEMENTED_FAMILIES.has(family.id)) return;
    list.push({
      value: family.id,
      label: family.label,
      description: family.description,
    });
  });
  return list;
}

function getLayoutFamilyById(id) {
  const normalizedId = normalizeResolvedLayoutFamily(id, AI_LAYOUT_DEFAULT_FAMILY);
  return AI_LAYOUT_FAMILY_DEFS[normalizedId] || AI_LAYOUT_FAMILY_DEFS[AI_LAYOUT_DEFAULT_FAMILY];
}

function getLayoutSkillById(id) {
  const normalizedId = normalizeResolvedLayoutFamily(id, AI_LAYOUT_DEFAULT_FAMILY);
  return getAiLayoutSkillById(normalizedId) || getAiLayoutSkillById(AI_LAYOUT_DEFAULT_FAMILY);
}

function getWechatSafeRenderProfile(layoutFamilyId) {
  const normalizedId = normalizeResolvedLayoutFamily(layoutFamilyId, AI_LAYOUT_DEFAULT_FAMILY);
  const profiles = AI_WECHAT_SAFE_STYLE_PRIMITIVES.profiles || {};
  return toRecord(profiles[normalizedId] || profiles[AI_LAYOUT_DEFAULT_FAMILY] || {});
}

function getColorPaletteList({ includeAuto = true } = {}) {
  const list = [];
  if (includeAuto) {
    list.push({
      value: AI_LAYOUT_SELECTION_AUTO,
      label: '自动推荐',
      description: '由 AI 根据文章内容自动推荐颜色。',
    });
  }
  Object.values(AI_COLOR_PALETTES).forEach((pack) => {
    list.push({
      value: pack.id,
      label: pack.label,
      description: pack.description,
    });
  });
  return list;
}

function getColorPaletteById(id) {
  return AI_COLOR_PALETTES[normalizeResolvedColorPalette(id)] || AI_COLOR_PALETTES[AI_LAYOUT_DEFAULT_COLOR_PALETTE];
}

function resolveColorPaletteForRender(id, override = {}) {
  const normalizedId = normalizeResolvedColorPalette(id);
  const customColor = normalizeHexColor(
    override?.customColor || override?.accentColor || override?.accent || '',
    ''
  );
  if (normalizedId === 'custom' && customColor) {
    return createColorPaletteFromAccent(customColor, {
      id: 'custom',
      label: getColorPaletteById('custom')?.label || '自定义',
    });
  }
  return getColorPaletteById(normalizedId);
}

function getStylePackList() {
  return getColorPaletteList({ includeAuto: false });
}

function getStylePackById(id) {
  return getColorPaletteById(id);
}

export {
  normalizeLayoutFamily,
  normalizeColorPalette,
  normalizeResolvedLayoutFamily,
  normalizeResolvedColorPalette,
  normalizeAutoRecommendedColorPalette,
  normalizeLayoutSelection,
  normalizeResolvedSelection,
  getArticleLayoutSelectionKey,
  getLayoutFamilyList,
  getLayoutFamilyById,
  getLayoutSkillById,
  getWechatSafeRenderProfile,
  getColorPaletteList,
  getColorPaletteById,
  resolveColorPaletteForRender,
  getStylePackList,
  getStylePackById,
};
