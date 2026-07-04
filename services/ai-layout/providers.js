// Split from services/ai-layout.js. Keep changes behavior-compatible with the legacy entry.

import { AI_PROVIDER_KIND_DEFAULTS, AI_PROVIDER_KINDS } from './constants.js';
import { coerceString, toRecord } from './utils.js';

function normalizeAiProvider(raw = {}) {
  const source = toRecord(raw);
  const id = typeof source.id === 'string' && source.id.trim()
    ? source.id.trim()
    : `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const kind = typeof source.kind === 'string' && source.kind.trim()
    ? source.kind.trim()
    : AI_PROVIDER_KINDS.OPENAI_COMPATIBLE;
  const defaults = AI_PROVIDER_KIND_DEFAULTS[kind] || AI_PROVIDER_KIND_DEFAULTS[AI_PROVIDER_KINDS.OPENAI_COMPATIBLE];
  return {
    id,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : '未命名 Provider',
    kind,
    baseUrl: typeof source.baseUrl === 'string' && source.baseUrl.trim()
      ? source.baseUrl.trim().replace(/\/+$/, '')
      : defaults.baseUrl,
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : '',
    model: typeof source.model === 'string' && source.model.trim() ? source.model.trim() : defaults.model,
    enabled: source.enabled !== false,
  };
}

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

function getAiProviderIssues(provider = {}) {
  const source = toRecord(provider);
  const issues = [];
  const baseUrl = coerceString(source.baseUrl);
  const apiKey = coerceString(source.apiKey);
  const model = coerceString(source.model);

  if (!baseUrl) {
    issues.push('missing-base-url');
  } else if (!isAllowedAiProviderBaseUrl(baseUrl)) {
    issues.push('invalid-base-url');
  }

  if (!apiKey) issues.push('missing-api-key');
  if (!model) issues.push('missing-model');
  if (source.enabled === false) issues.push('disabled');

  return issues;
}

function isAiProviderRunnable(provider = {}) {
  const issues = getAiProviderIssues(provider);
  return !issues.some((issue) => issue !== 'disabled');
}

function summarizeAiProviderIssues(provider = {}) {
  const issues = getAiProviderIssues(provider);
  if (!issues.length) return '配置完整';

  /** @type {Record<string, string>} */
  const labels = {
    'missing-base-url': '缺少 Base URL',
    'invalid-base-url': 'Base URL 必须是 HTTPS，或指向本机/局域网的 HTTP 地址',
    'missing-api-key': '缺少 API Key',
    'missing-model': '缺少模型名',
    disabled: '已停用',
  };
  return issues.map((issue) => labels[issue] || issue).join(' / ');
}

function listEnabledAiProviders(aiSettings = {}) {
  return Array.isArray(aiSettings.providers)
    ? aiSettings.providers.map(normalizeAiProvider).filter((provider) => provider.enabled !== false && isAiProviderRunnable(provider))
    : [];
}

function resolveAiProvider(aiSettings = {}, providerId = '') {
  const providers = listEnabledAiProviders(aiSettings);
  if (providerId) {
    const matched = providers.find((provider) => provider.id === providerId);
    if (matched) return matched;
  }
  if (aiSettings.defaultProviderId) {
    const matched = providers.find((provider) => provider.id === aiSettings.defaultProviderId);
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
  resolveAiProvider,
};
