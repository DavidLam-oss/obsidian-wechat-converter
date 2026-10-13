/*
## 核心功能

实现 AI layout 服务的 providers 子能力，支撑文章结构到微信安全版式的生成和归一化。

## 输入

接收 Markdown 结构、AI provider 响应、布局选择、色彩/组件配置和缓存状态。

## 输出

输出 `normalizeAiProvider`、`isAllowedAiProviderBaseUrl`、`getAiProviderIssues`、`isAiProviderRunnable`、`summarizeAiProviderIssues`、`listEnabledAiProviders`、`resolveAiProvider`，供 AI layout 入口和转换器面板调用。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现；保持与旧 services/ai-layout.js 兼容。

## 依赖

关键依赖：`./constants.js`、`./utils.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services/ai-layout 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { AI_PROVIDER_KIND_DEFAULTS, AI_PROVIDER_KINDS, DEFAULT_IMAGE_MODELS } from './constants.js';
import { coerceString, toRecord } from './utils.js';

/** @param {unknown} raw @returns {AiProviderLike} */
function normalizeAiProvider(raw = {}) {
  const source = toRecord(raw);
  const id = typeof source.id === 'string' && source.id.trim()
    ? source.id.trim()
    : `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const kind = typeof source.kind === 'string' && source.kind.trim()
    ? source.kind.trim()
    : AI_PROVIDER_KINDS.OPENAI_COMPATIBLE;
  const defaults = AI_PROVIDER_KIND_DEFAULTS[kind] || AI_PROVIDER_KIND_DEFAULTS[AI_PROVIDER_KINDS.OPENAI_COMPATIBLE];

  // 能力标记与向下平滑兼容：存量未设置时默认为文本模型
  const supportsText = source.supportsText !== undefined ? Boolean(source.supportsText) : true;
  const supportsImage = source.supportsImage !== undefined ? Boolean(source.supportsImage) : false;

  const textModel = typeof source.textModel === 'string' && source.textModel.trim()
    ? source.textModel.trim()
    : (typeof source.model === 'string' && source.model.trim() ? source.model.trim() : defaults.model);

  const defaultImageModel = DEFAULT_IMAGE_MODELS[kind] || '';
  const imageModel = typeof source.imageModel === 'string' && source.imageModel.trim()
    ? source.imageModel.trim()
    : (supportsImage ? defaultImageModel : '');

  // 保持旧属性 model 兼容性：优先 textModel，再旧 model，再 imageModel
  const model = textModel || (typeof source.model === 'string' && source.model.trim() ? source.model.trim() : imageModel);
  const notes = typeof source.notes === 'string' ? source.notes.trim() : '';

  return {
    id,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : '未命名 Provider',
    kind,
    baseUrl: typeof source.baseUrl === 'string' && source.baseUrl.trim()
      ? source.baseUrl.trim().replace(/\/+$/, '')
      : defaults.baseUrl,
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : '',
    model,
    supportsText,
    textModel,
    supportsImage,
    imageModel,
    notes,
    enabled: source.enabled !== false,
  };
}

/** @param {unknown} baseUrl @returns {boolean} */
function isAllowedAiProviderBaseUrl(baseUrl) {
  try {
    const parsed = new URL(String(baseUrl || ''));
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol !== 'http:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (/^10\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;

    const private172 = hostname.match(/^172\.(\d+)\./);
    if (private172) {
      const secondOctet = Number(private172[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    }

    return false;
  } catch {
    return false;
  }
}

/** @param {unknown} provider @param {'text'|'image'|'any'} [capability='any'] @returns {string[]} */
function getAiProviderIssues(provider = {}, capability = 'any') {
  const source = toRecord(provider);
  const issues = [];
  const baseUrl = coerceString(source.baseUrl);
  const apiKey = coerceString(source.apiKey);
  const supportsText = source.supportsText !== undefined ? Boolean(source.supportsText) : true;
  const supportsImage = Boolean(source.supportsImage);
  const textModel = coerceString(source.textModel || source.model);
  const imageModel = coerceString(source.imageModel);

  if (!baseUrl) {
    issues.push('missing-base-url');
  } else if (!isAllowedAiProviderBaseUrl(baseUrl)) {
    issues.push('invalid-base-url');
  }

  if (!apiKey) issues.push('missing-api-key');

  if (capability === 'text') {
    if (!supportsText) {
      issues.push('text-not-supported');
    } else if (!textModel) {
      issues.push('missing-model');
    }
  } else if (capability === 'image') {
    if (!supportsImage) {
      issues.push('image-not-supported');
    } else if (!imageModel) {
      issues.push('missing-image-model');
    }
  } else {
    // capability === 'any'
    if (!supportsText && !supportsImage) {
      issues.push('missing-capabilities');
    } else {
      if (supportsText && !textModel) issues.push('missing-model');
      if (supportsImage && !imageModel) issues.push('missing-image-model');
    }
  }

  if (source.enabled === false) issues.push('disabled');

  return issues;
}

/** @param {unknown} provider @param {'text'|'image'|'any'} [capability='text'] @returns {boolean} */
function isAiProviderRunnable(provider = {}, capability = 'text') {
  const issues = getAiProviderIssues(provider, capability);
  return !issues.some((issue) => issue !== 'disabled');
}

/** @param {unknown} provider @param {'text'|'image'|'any'} [capability='any'] @returns {string} */
function summarizeAiProviderIssues(provider = {}, capability = 'any') {
  const issues = getAiProviderIssues(provider, capability);
  if (!issues.length) return '配置完整';

  /** @type {Record<string, string>} */
  const labels = {
    'missing-base-url': '缺少 Base URL',
    'invalid-base-url': 'Base URL 必须是 HTTPS，或指向本机/局域网的 HTTP 地址',
    'missing-api-key': '缺少 API Key',
    'missing-model': '缺少文本模型名',
    'missing-image-model': '缺少生图模型名',
    'missing-capabilities': '未启用任何服务能力（请勾选文本模型或生图模型）',
    'text-not-supported': '未启用文本模型能力',
    'image-not-supported': '未启用生图模型能力',
    disabled: '已停用',
  };
  return issues.map((issue) => labels[issue] || issue).join(' / ');
}

/** @param {{ providers?: unknown[] } | unknown[]} [aiSettings={}] @param {'text'|'image'|'any'} [capability='text'] @returns {AiProviderLike[]} */
function listEnabledAiProviders(aiSettings = {}, capability = 'text') {
  const rawList = Array.isArray(aiSettings) ? aiSettings : aiSettings?.providers;
  return Array.isArray(rawList)
    ? rawList.map(normalizeAiProvider).filter((provider) => provider.enabled !== false && isAiProviderRunnable(provider, capability))
    : [];
}

/** @param {{ providers?: unknown[] } | unknown[]} [aiSettings={}] @returns {AiProviderLike[]} */
function listTextAiProviders(aiSettings = {}) {
  return listEnabledAiProviders(aiSettings, 'text');
}

/** @param {{ providers?: unknown[] } | unknown[]} [aiSettings={}] @returns {AiProviderLike[]} */
function listImageAiProviders(aiSettings = {}) {
  return listEnabledAiProviders(aiSettings, 'image');
}

/** @param {{ providers?: unknown[], defaultProviderId?: string } | unknown[]} [aiSettings={}] @param {string} [providerId=''] @returns {AiProviderLike | null} */
function resolveAiProvider(aiSettings = {}, providerId = '') {
  const providers = listEnabledAiProviders(aiSettings, 'text');
  if (providerId) {
    const matched = providers.find((provider) => provider.id === providerId);
    if (matched) return matched;
  }
  const defaultProviderId = Array.isArray(aiSettings) ? '' : aiSettings?.defaultProviderId;
  if (defaultProviderId) {
    const matched = providers.find((provider) => provider.id === defaultProviderId);
    if (matched) return matched;
  }
  return providers[0] || null;
}

/** @param {{ providers?: unknown[], defaultImageProviderId?: string } | unknown[]} [aiSettings={}] @param {string} [providerId=''] @returns {AiProviderLike | null} */
function resolveImageAiProvider(aiSettings = {}, providerId = '') {
  const providers = listEnabledAiProviders(aiSettings, 'image');
  if (providerId) {
    const matched = providers.find((provider) => provider.id === providerId);
    if (matched) return matched;
  }
  const defaultImageProviderId = Array.isArray(aiSettings) ? '' : aiSettings?.defaultImageProviderId;
  if (defaultImageProviderId) {
    const matched = providers.find((provider) => provider.id === defaultImageProviderId);
    if (matched) return matched;
  }
  return providers[0] || null;
}

export {
  normalizeAiProvider,
  isAllowedAiProviderBaseUrl,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  listEnabledAiProviders,
  listTextAiProviders,
  listImageAiProviders,
  resolveAiProvider,
  resolveImageAiProvider,
};
