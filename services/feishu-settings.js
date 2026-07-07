/*
## 核心功能

实现飞书云文档同步链路的 feishu settings 服务能力。

## 输入

接收飞书设置、Markdown/HTML 内容、本地图片、Mermaid 图和飞书 API 响应。

## 输出

输出 `createDefaultFeishuSyncSettings`、`FEISHU_FREE_MONTHLY_API_LIMIT`、`getFeishuApiUsageMonthKey`、`createDefaultFeishuApiUsageStats`、`normalizeFeishuApiUsageStats`、`incrementFeishuApiUsage`、`resetFeishuApiUsage`、`normalizeFeishuSyncSettings`、`parseFeishuDocUrlOrToken`、`addFeishuUploadHistory`，用于文档创建/更新、媒体上传、块写入或错误恢复。

## 定位

位于 services/，属于飞书发布服务层；不承载微信专属逻辑。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

// services/feishu-settings.js
//
// Pure settings data helper functions for Feishu cloud document sync.
// Handles defaults creation, settings normalization, and upload history management.
// No DOM, no Obsidian API, no side effects.

/**
 * @typedef {{ title: string, url: string, uploadTime: string, docToken: string, sourcePath: string }} FeishuUploadHistoryItemLike
 * @typedef {{ mode: 'source' | 'remote-image', provider: 'kroki', updatedAt: number }} FeishuMermaidPreferenceLike
 * @typedef {{ month: string, count: number, updatedAt: number }} FeishuApiUsageStatsLike
 * @typedef {{ enabled: boolean, appId: string, appSecret: string, folderToken: string, userId: string, enableSmartUpdate: boolean, enableDoubleLinkMode: boolean, debugLoggingEnabled: boolean, uploadHistory: FeishuUploadHistoryItemLike[], mermaidPreferences: Record<string, FeishuMermaidPreferenceLike>, apiUsage: FeishuApiUsageStatsLike }} FeishuSyncSettingsLike
 */

const FEISHU_FREE_MONTHLY_API_LIMIT = 10000;

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function toRecord(value) {
  return value && typeof value === 'object'
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function toStringWithFallback(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function isSafeFeishuDocToken(token) {
  return /^[A-Za-z0-9_-]{8,}$/.test(String(token || '').trim());
}

/**
 * @param {URL} parsedUrl
 * @returns {boolean}
 */
function isFeishuDocHost(parsedUrl) {
  const hostname = parsedUrl.hostname.toLowerCase();
  return hostname === 'feishu.cn'
    || hostname.endsWith('.feishu.cn')
    || hostname === 'larksuite.com'
    || hostname.endsWith('.larksuite.com');
}

/**
 * Extracts a Feishu docx token from a pasted URL or a plain token.
 * @param {unknown} value
 * @returns {{ docToken: string, url: string } | null}
 */
function parseFeishuDocUrlOrToken(value) {
  const input = toTrimmedString(value);
  if (!input) return null;

  const urlMatch = input.match(/\/docx\/([A-Za-z0-9_-]+)/);
  const plainToken = isSafeFeishuDocToken(input) ? input : '';
  const docToken = urlMatch ? urlMatch[1] : plainToken;
  if (!isSafeFeishuDocToken(docToken)) return null;

  if (urlMatch) {
    try {
      const parsedUrl = new URL(input);
      if (!isFeishuDocHost(parsedUrl)) return null;
      return {
        docToken,
        url: `${parsedUrl.origin}/docx/${docToken}`,
      };
    } catch {
      return null;
    }
  }

  return {
    docToken,
    url: `https://open.feishu.cn/docx/${docToken}`,
  };
}

function createDefaultFeishuSyncSettings() {
  return {
    enabled: false,
    appId: '',
    appSecret: '',
    folderToken: '',
    userId: '', // Required for transferring ownership from Bot to User
    enableSmartUpdate: true,
    enableDoubleLinkMode: false,
    debugLoggingEnabled: false,
    uploadHistory: [], // [{ title, url, uploadTime, docToken, sourcePath }]
    mermaidPreferences: {},
    apiUsage: createDefaultFeishuApiUsageStats(),
  };
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function getFeishuApiUsageMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * @returns {FeishuApiUsageStatsLike}
 */
function createDefaultFeishuApiUsageStats() {
  return {
    month: getFeishuApiUsageMonthKey(),
    count: 0,
    updatedAt: 0,
  };
}

/**
 * @param {unknown} value
 * @param {Date} [now]
 * @returns {FeishuApiUsageStatsLike}
 */
function normalizeFeishuApiUsageStats(value, now = new Date()) {
  const source = toRecord(value);
  const currentMonth = getFeishuApiUsageMonthKey(now);
  const month = toStringWithFallback(source.month, currentMonth);
  const count = Math.max(0, Math.floor(Number(source.count) || 0));
  const updatedAt = Math.max(0, Math.floor(Number(source.updatedAt) || 0));
  if (month !== currentMonth) {
    return {
      month: currentMonth,
      count: 0,
      updatedAt: 0,
    };
  }
  return {
    month,
    count,
    updatedAt,
  };
}

/**
 * @param {unknown} value
 * @returns {'source' | 'remote-image'}
 */
function normalizeMermaidRenderMode(value) {
  return value === 'remote-image' ? 'remote-image' : 'source';
}

/**
 * @param {unknown} value
 * @returns {'kroki'}
 */
function normalizeMermaidRenderProvider(value) {
  return value === 'kroki' ? 'kroki' : 'kroki';
}

/**
 * @param {unknown} value
 * @returns {Record<string, FeishuMermaidPreferenceLike>}
 */
function normalizeMermaidPreferences(value) {
  const source = toRecord(value);
  /** @type {Record<string, FeishuMermaidPreferenceLike>} */
  const result = {};
  for (const [path, rawPreference] of Object.entries(source)) {
    const normalizedPath = toTrimmedString(path);
    if (!normalizedPath) continue;
    const preference = toRecord(rawPreference);
    result[normalizedPath] = {
      mode: normalizeMermaidRenderMode(preference.mode),
      provider: normalizeMermaidRenderProvider(preference.provider),
      updatedAt: Number.isFinite(Number(preference.updatedAt)) ? Number(preference.updatedAt) : 0,
    };
  }
  return result;
}

/**
 * @param {unknown} value
 * @returns {FeishuSyncSettingsLike}
 */
function normalizeFeishuSyncSettings(value) {
  const source = toRecord(value);
  const rawUploadHistory = source.uploadHistory;
  const rawMermaidPreferences = source.mermaidPreferences || source.feishuMermaidPreferences;

  const uploadHistory = Array.isArray(rawUploadHistory)
    ? rawUploadHistory.map((item) => {
        const historyItem = toRecord(item);
        if (!Object.keys(historyItem).length) return null;
        return {
          title: toStringWithFallback(historyItem.title, '无标题文章'),
          url: toStringWithFallback(historyItem.url),
          uploadTime: toStringWithFallback(historyItem.uploadTime),
          docToken: toStringWithFallback(historyItem.docToken),
          sourcePath: toStringWithFallback(historyItem.sourcePath),
        };
      }).filter(Boolean)
    : [];

  return {
    enabled: source.enabled === true,
    appId: toTrimmedString(source.appId),
    appSecret: toTrimmedString(source.appSecret),
    folderToken: toTrimmedString(source.folderToken),
    userId: toTrimmedString(source.userId),
    enableSmartUpdate: source.enableSmartUpdate !== false,
    enableDoubleLinkMode: source.enableDoubleLinkMode === true,
    debugLoggingEnabled: source.debugLoggingEnabled === true,
    uploadHistory,
    mermaidPreferences: normalizeMermaidPreferences(rawMermaidPreferences),
    apiUsage: normalizeFeishuApiUsageStats(source.apiUsage || source.apiUsageStats),
  };
}

/**
 * @param {unknown} settings
 * @param {number} [delta]
 * @param {Date} [now]
 * @returns {FeishuApiUsageStatsLike}
 */
function incrementFeishuApiUsage(settings, delta = 1, now = new Date()) {
  const source = toRecord(settings);
  const current = normalizeFeishuApiUsageStats(source.apiUsage, now);
  const amount = Math.max(0, Math.floor(Number(delta) || 0));
  const next = {
    month: current.month,
    count: current.count + amount,
    updatedAt: now.getTime(),
  };
  source.apiUsage = next;
  return next;
}

/**
 * @param {unknown} settings
 * @param {Date} [now]
 * @returns {FeishuApiUsageStatsLike}
 */
function resetFeishuApiUsage(settings, now = new Date()) {
  const source = toRecord(settings);
  const next = {
    month: getFeishuApiUsageMonthKey(now),
    count: 0,
    updatedAt: now.getTime(),
  };
  source.apiUsage = next;
  return next;
}

/**
 * @param {unknown} settings
 * @param {unknown} item
 * @returns {void}
 */
function addFeishuUploadHistory(settings, item) {
  const targetSettings = toRecord(settings);
  if (!Object.keys(targetSettings).length) return;
  const rawUploadHistory = targetSettings.uploadHistory;
  if (!Array.isArray(rawUploadHistory)) {
    targetSettings.uploadHistory = [];
  }
  const uploadHistory = /** @type {FeishuUploadHistoryItemLike[]} */ (targetSettings.uploadHistory);
  const sourceItem = toRecord(item);

  const normalizedItem = {
    title: toStringWithFallback(sourceItem.title, '无标题文章'),
    url: toStringWithFallback(sourceItem.url),
    uploadTime: toStringWithFallback(sourceItem.uploadTime, new Date().toISOString()),
    docToken: toStringWithFallback(sourceItem.docToken),
    sourcePath: toStringWithFallback(sourceItem.sourcePath),
  };

  // Prevent duplicates by docToken or sourcePath
  targetSettings.uploadHistory = uploadHistory.filter(
    (x) => x.docToken !== normalizedItem.docToken && x.sourcePath !== normalizedItem.sourcePath
  );

  /** @type {FeishuUploadHistoryItemLike[]} */ (targetSettings.uploadHistory).unshift(normalizedItem);
  
  // Cap at 100 entries to prevent settings file bloat
  if (targetSettings.uploadHistory.length > 100) {
    targetSettings.uploadHistory = /** @type {FeishuUploadHistoryItemLike[]} */ (targetSettings.uploadHistory).slice(0, 100);
  }
}

/**
 * Rebinds one Obsidian note path to a specific Feishu docx URL/token.
 * @param {unknown} settings
 * @param {unknown} sourcePath
 * @param {unknown} value URL, plain token, or object containing url/docToken/title
 * @returns {FeishuUploadHistoryItemLike | null}
 */
function rebindFeishuHistoryByPath(settings, sourcePath, value) {
  const source = toRecord(value);
  const targetPath = toTrimmedString(sourcePath);
  if (!targetPath) return null;

  const parsed = parseFeishuDocUrlOrToken(source.url || source.docToken || value);
  if (!parsed) return null;

  const historyItem = {
    title: toStringWithFallback(source.title, '无标题文章'),
    url: parsed.url,
    uploadTime: toStringWithFallback(source.uploadTime, new Date().toISOString()),
    docToken: parsed.docToken,
    sourcePath: targetPath,
  };
  addFeishuUploadHistory(settings, historyItem);
  return historyItem;
}

/**
 * @param {unknown} settings
 * @param {unknown} path
 * @returns {FeishuUploadHistoryItemLike | null}
 */
function findFeishuHistoryByPath(settings, path) {
  const source = toRecord(settings);
  if (!Array.isArray(source.uploadHistory)) return null;
  const targetPath = String(path || '').trim();
  if (!targetPath) return null;
  return /** @type {FeishuUploadHistoryItemLike[]} */ (source.uploadHistory).find((x) => x.sourcePath === targetPath) || null;
}

/**
 * @param {unknown} settings
 * @param {unknown} path
 * @returns {boolean}
 */
function removeFeishuHistoryByPath(settings, path) {
  const source = toRecord(settings);
  if (!Array.isArray(source.uploadHistory)) return false;
  const targetPath = String(path || '').trim();
  if (!targetPath) return false;

  const history = /** @type {FeishuUploadHistoryItemLike[]} */ (source.uploadHistory);
  const nextHistory = history.filter((item) => item.sourcePath !== targetPath);
  if (nextHistory.length === history.length) return false;

  source.uploadHistory = nextHistory;
  return true;
}

/**
 * @param {unknown} settings
 * @param {unknown} oldPath
 * @param {unknown} newPath
 * @returns {boolean}
 */
function updateFeishuHistoryPath(settings, oldPath, newPath) {
  const source = toRecord(settings);
  if (!Array.isArray(source.uploadHistory)) return false;
  const targetOld = String(oldPath || '').trim();
  const targetNew = String(newPath || '').trim();
  if (!targetOld || !targetNew) return false;

  let changed = false;
  /** @type {FeishuUploadHistoryItemLike[]} */ (source.uploadHistory).forEach((x) => {
    if (x.sourcePath === targetOld) {
      x.sourcePath = targetNew;
      changed = true;
    }
  });
  return changed;
}

/**
 * @param {unknown} settings
 * @param {unknown} path
 * @returns {FeishuMermaidPreferenceLike | null}
 */
function getFeishuMermaidPreferenceByPath(settings, path) {
  const source = toRecord(settings);
  const targetPath = toTrimmedString(path);
  if (!targetPath) return null;
  const preferences = normalizeMermaidPreferences(source.mermaidPreferences || source.feishuMermaidPreferences);
  return preferences[targetPath] || null;
}

/**
 * @param {unknown} settings
 * @param {unknown} path
 * @param {unknown} value
 * @returns {FeishuMermaidPreferenceLike | null}
 */
function setFeishuMermaidPreferenceByPath(settings, path, value) {
  const source = toRecord(settings);
  if (!Object.keys(source).length) return null;
  const targetPath = toTrimmedString(path);
  if (!targetPath) return null;
  const preference = toRecord(value);
  const normalized = {
    mode: normalizeMermaidRenderMode(preference.mode),
    provider: normalizeMermaidRenderProvider(preference.provider),
    updatedAt: Number.isFinite(Number(preference.updatedAt)) ? Number(preference.updatedAt) : Date.now(),
  };
  const preferences = normalizeMermaidPreferences(source.mermaidPreferences || source.feishuMermaidPreferences);
  preferences[targetPath] = normalized;
  source.mermaidPreferences = preferences;
  return normalized;
}

/**
 * @param {unknown} settings
 * @param {unknown} path
 * @returns {boolean}
 */
function removeFeishuMermaidPreferenceByPath(settings, path) {
  const source = toRecord(settings);
  if (!Object.keys(source).length) return false;
  const targetPath = toTrimmedString(path);
  if (!targetPath) return false;
  const preferences = normalizeMermaidPreferences(source.mermaidPreferences || source.feishuMermaidPreferences);
  if (!preferences[targetPath]) return false;
  delete preferences[targetPath];
  source.mermaidPreferences = preferences;
  return true;
}

export {
  createDefaultFeishuSyncSettings,
  FEISHU_FREE_MONTHLY_API_LIMIT,
  getFeishuApiUsageMonthKey,
  createDefaultFeishuApiUsageStats,
  normalizeFeishuApiUsageStats,
  incrementFeishuApiUsage,
  resetFeishuApiUsage,
  normalizeFeishuSyncSettings,
  parseFeishuDocUrlOrToken,
  addFeishuUploadHistory,
  rebindFeishuHistoryByPath,
  findFeishuHistoryByPath,
  removeFeishuHistoryByPath,
  updateFeishuHistoryPath,
  getFeishuMermaidPreferenceByPath,
  setFeishuMermaidPreferenceByPath,
  removeFeishuMermaidPreferenceByPath,
  normalizeMermaidRenderMode,
  normalizeMermaidRenderProvider,
};
