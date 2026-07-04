import { normalizeVaultPath } from './path-utils.js';
import {
  createDefaultMultiPlatformSyncSettings,
  normalizeMultiPlatformSyncSettings,
} from './wechatsync-settings.js';
import {
  createDefaultFeishuSyncSettings,
  normalizeFeishuSyncSettings,
} from './feishu-settings.js';
import {
  createEmptyDraftCache,
  normalizeDraftCache,
} from './wechat-draft-cache.js';
import {
  createDefaultAiSettings,
  normalizeAiSettings,
} from './ai-layout.js';

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value) {
  return isRecord(value) ? value : {};
}

function generateFallbackId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function createDefaultSettings() {
  return {
    theme: 'github',
    themeColor: 'blue',
    customColor: '#0366d6',
    quoteCalloutStyleMode: 'theme',
    fontFamily: 'sans-serif',
    fontSize: 3,
    macCodeBlock: true,
    codeLineNumber: true,
    avatarUrl: '',
    avatarBase64: '',
    enableWatermark: false,
    showImageCaption: true,
    normalizeChinesePunctuation: true,
    wechatAccounts: [],
    defaultAccountId: '',
    proxyUrl: '',
    clientId: '',
    draftCache: createEmptyDraftCache(),
    usePhoneFrame: true,
    sidePadding: 16,
    coloredHeader: false,
    cleanupAfterSync: false,
    cleanupUseSystemTrash: true,
    cleanupDirTemplate: '',
    multiPlatformSync: createDefaultMultiPlatformSyncSettings(),
    feishuSync: createDefaultFeishuSyncSettings(),
    wechatAppId: '',
    wechatAppSecret: '',
    ai: createDefaultAiSettings(),
  };
}

/**
 * @param {unknown} loadedData
 * @param {{ generateId?: () => string }} [options]
 * @returns {{ settings: Record<string, unknown>, didMigrate: boolean }}
 */
export function normalizeLoadedSettings(loadedData, options = {}) {
  const data = toRecord(loadedData);
  const settings = Object.assign(createDefaultSettings(), data);
  const generateId = typeof options.generateId === 'function'
    ? options.generateId
    : generateFallbackId;
  let didMigrate = false;

  if (!settings.clientId) {
    settings.clientId = `wp_dev_${generateId()}`;
    didMigrate = true;
  }

  settings.multiPlatformSync = normalizeMultiPlatformSyncSettings(settings.multiPlatformSync);
  settings.feishuSync = normalizeFeishuSyncSettings(settings.feishuSync);

  const normalizedDraftCache = normalizeDraftCache(settings.draftCache);
  settings.draftCache = normalizedDraftCache.cache;
  if (normalizedDraftCache.changed) {
    didMigrate = true;
  }

  const rawAiSettings = data.ai;
  settings.ai = normalizeAiSettings(rawAiSettings || settings.ai || {});
  if (rawAiSettings !== undefined) {
    const normalizedRawAi = normalizeAiSettings(toRecord(rawAiSettings));
    if (JSON.stringify(normalizedRawAi) !== JSON.stringify(rawAiSettings)) {
      didMigrate = true;
    }
  }

  if (!Array.isArray(settings.wechatAccounts)) {
    settings.wechatAccounts = [];
    didMigrate = true;
  }

  if (settings.wechatAppId && settings.wechatAccounts.length === 0) {
    const migratedAccount = {
      id: generateId(),
      name: '我的公众号',
      appId: String(settings.wechatAppId || ''),
      appSecret: String(settings.wechatAppSecret || ''),
    };
    settings.wechatAccounts.push(migratedAccount);
    settings.defaultAccountId = migratedAccount.id;
    settings.wechatAppId = '';
    settings.wechatAppSecret = '';
    didMigrate = true;
    console.log('✅ 已将旧账号配置迁移到新格式');
  }

  settings.wechatAccounts = settings.wechatAccounts.map((account) => {
    if (!isRecord(account)) {
      didMigrate = true;
      return { id: '', name: '', appId: '', appSecret: '' };
    }
    const nextAccount = { ...account };
    let changed = false;

    if (Object.prototype.hasOwnProperty.call(nextAccount, 'enableOriginal')) {
      delete nextAccount.enableOriginal;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(nextAccount, 'allowReprint')) {
      delete nextAccount.allowReprint;
      changed = true;
    }

    if (changed) {
      didMigrate = true;
    }
    return nextAccount;
  });

  const currentTemplate = normalizeVaultPath(settings.cleanupDirTemplate || '');
  const legacyRootDir = normalizeVaultPath(settings.cleanupRootDir || '');
  const legacyTarget = settings.cleanupTarget;

  if (!currentTemplate && legacyRootDir && legacyTarget === 'folder') {
    settings.cleanupDirTemplate = `${legacyRootDir}/{{note}}_img`;
    didMigrate = true;
    console.log('✅ 已将旧清理配置迁移为目录模板 cleanupDirTemplate');
  }

  if (Object.prototype.hasOwnProperty.call(settings, 'cleanupRootDir')) {
    delete settings.cleanupRootDir;
    didMigrate = true;
  }
  if (Object.prototype.hasOwnProperty.call(settings, 'cleanupTarget')) {
    delete settings.cleanupTarget;
    didMigrate = true;
  }

  const deprecatedRenderKeys = [
    'useTripletPipeline',
    'tripletFallbackToPhase2',
    'enforceTripletParity',
    'tripletParityMaxLengthDelta',
    'tripletParityMaxSegmentCount',
    'tripletParityVerboseLog',
    'useNativePipeline',
    'enableLegacyFallback',
    'enforceNativeParity',
  ];
  for (const key of deprecatedRenderKeys) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      delete settings[key];
      didMigrate = true;
    }
  }

  return { settings, didMigrate };
}
