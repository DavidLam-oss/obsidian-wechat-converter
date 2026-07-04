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

function normalizeAiSettings(raw = {}) {
  const source = toRecord(raw);
  const defaults = createDefaultAiSettings();
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
