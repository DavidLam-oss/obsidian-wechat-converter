/*
## 核心功能

归一化和维护插件设置相关的 plugin settings 能力。

## 输入

接收持久化设置、默认值、历史版本字段和用户表单输入。

## 输出

输出 `createDefaultSettings`、`normalizeLoadedSettings`，供入口、设置页和同步服务共享。

## 定位

位于 services/，属于设置数据层；不直接渲染 UI。

## 依赖

关键依赖：`./path-utils.js`、`./wechatsync-settings.js`、`./feishu-settings.js`、`./wechat-draft-cache.js`、`./ai-layout.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

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

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function toRecord(value) {
  return isRecord(value) ? value : {};
}

/**
 * 间距微调值校验：合法值 = null/undefined（表示继承主题默认）或在 [min, max] 内的有限数字。
 * 越界 / NaN / 非数 → 重置为 null（继承主题默认）。
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function normalizeSpacingValue(value, min, max) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

function generateFallbackId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** @returns {PluginSettingsLike} */
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
    // 间距微调（全局覆盖；null = 跟随当前主题默认）
    lineHeight: null,
    paragraphGap: null,
    letterSpacing: null,
    coloredHeader: false,
    cleanupAfterSync: false,
    cleanupUseSystemTrash: true,
    cleanupDirTemplate: '',
    // 自定义 CSS（Phase 1）
    enableCustomCss: false,
    customCss: '',
    customCssNote: '',
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
 * @returns {{ settings: PluginSettingsLike, didMigrate: boolean }}
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

  // 间距微调：越界 / 非数 → 回退继承（null）
  settings.lineHeight = normalizeSpacingValue(settings.lineHeight, 1.4, 2.2);
  settings.paragraphGap = normalizeSpacingValue(settings.paragraphGap, 8, 40);
  settings.letterSpacing = normalizeSpacingValue(settings.letterSpacing, 0, 2);

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
