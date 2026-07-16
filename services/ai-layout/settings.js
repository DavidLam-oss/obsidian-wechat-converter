/*
## 核心功能

实现 AI layout 服务的 settings 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `createDefaultAiSettings`、`normalizeAiSettings`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./catalog.js`、`./color.js`、`./providers.js`、`./state-cache.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import {
  AI_LAYOUT_DEFAULT_COLOR_PALETTE,
  AI_LAYOUT_SELECTION_AUTO,
  DEFAULT_AI_REQUEST_TIMEOUT_MS,
} from './constants.js';
import {
  normalizeColorPalette,
  normalizeLayoutFamily,
  normalizeResolvedColorPalette,
} from './catalog.js';
import { normalizeHexColor } from './color.js';
import { normalizeAiProvider } from './providers.js';
import { normalizeArticleLayoutCacheEntry } from './state-cache.js';
import { clampNumber, isRecord, toRecord } from './utils.js';

/** @returns {AiSettingsLike} */
function createDefaultAiSettings() {
  return {
    enabled: true,
    defaultProviderId: '',
    defaultLayoutFamily: AI_LAYOUT_SELECTION_AUTO,
    defaultColorPalette: AI_LAYOUT_SELECTION_AUTO,
    customColor: '#7c3aed',
    includeImagesInLayout: true,
    requestTimeoutMs: DEFAULT_AI_REQUEST_TIMEOUT_MS,
    providers: [],
    articleLayoutsByPath: {},
  };
}

/** @param {unknown} raw @returns {AiSettingsLike} */
function normalizeAiSettings(raw = {}) {
  const source = toRecord(raw);
  const defaults = createDefaultAiSettings();
  /** @type {AiProviderLike[]} */
  const providers = Array.isArray(source.providers) ? source.providers.map(normalizeAiProvider) : defaults.providers;
  /** @type {Record<string, AiLayoutCacheEntryLike>} */
  const articleLayoutsByPath = {};
  if (isRecord(source.articleLayoutsByPath)) {
    for (const [path, value] of Object.entries(source.articleLayoutsByPath)) {
      if (!path || typeof path !== 'string') continue;
      const normalized = normalizeArticleLayoutCacheEntry(value);
      if (normalized) {
        articleLayoutsByPath[path] = normalized;
      }
    }
  }

  let defaultProviderId = typeof source.defaultProviderId === 'string' ? source.defaultProviderId : defaults.defaultProviderId;
  if (defaultProviderId && !providers.some((provider) => provider.id === defaultProviderId && provider.enabled !== false)) {
    defaultProviderId = '';
  }

  return {
    enabled: Object.prototype.hasOwnProperty.call(source, 'enabled')
      ? source.enabled === true
      : defaults.enabled,
    defaultProviderId,
    defaultLayoutFamily: normalizeLayoutFamily(source.defaultLayoutFamily, AI_LAYOUT_SELECTION_AUTO),
    defaultColorPalette: normalizeColorPalette(
      source.defaultColorPalette ?? source.defaultStylePack,
      AI_LAYOUT_SELECTION_AUTO
    ),
    defaultStylePack: normalizeResolvedColorPalette(source.defaultStylePack, AI_LAYOUT_DEFAULT_COLOR_PALETTE),
    customColor: normalizeHexColor(source.customColor, defaults.customColor),
    includeImagesInLayout: source.includeImagesInLayout !== false,
    requestTimeoutMs: clampNumber(source.requestTimeoutMs, defaults.requestTimeoutMs, 5000, 180000),
    providers,
    articleLayoutsByPath,
  };
}

export {
  createDefaultAiSettings,
  normalizeAiSettings,
};
