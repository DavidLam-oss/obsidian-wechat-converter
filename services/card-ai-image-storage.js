/*
## 核心功能

卡片 AI 封面图片的持久化管理与导出/复制服务（方式二：无感知跨关闭保活 + 按需复制/存入仓库/另存为）。
1. 跨侧边栏关闭/重开与重启保活：
   - 内存级缓存在 `plugin`（或回退 `view`）实例上保存「每篇笔记的 AI 封面历史列表」与「当前生效封面字段快照」，
     确保侧边栏关闭再打开时零 I/O 损耗瞬间恢复封面画面与灵感画廊；
   - 磁盘级惰性异步持久化至插件目录独立缓存文件（`.card-ai-cover-cache.json`），不写入 `data.json`、
     不在 `onload` 启动阶段读取、不污染用户 Vault 根目录。
2. 按需图片操作：
   - 复制图片到系统剪贴板（`copyAiCoverImageToClipboard`）；
   - 存入卡片导出目录（`saveAiCoverImageToVaultExportDir`）：复用卡片导出目录规范（`<导出目录>/<笔记名>/ai-cover-<时间戳>.png`）；
   - 另存为本地文件（`downloadAiCoverImageAsFile`）：触发浏览器/桌面端文件保存。

## 定位

位于 services/，服务于 `views/converter/card-media-picker-ai.js`、`card-preview.js`、`card-settings.js` 与 `card-cover-settings.js`。

## 维护规则

- 严格遵守无 emoji 规范。
- 严格遵守 `no-fetch-data-url`、`no-document-create-element`、`no-global-this-production` 等扫描守卫规则。
- 严格遵守单文件 800 行软线约束。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: storage service interacts with untyped view, plugin, and vault adapter runtime objects */

import { dataUrlToBlob } from './image-source-utils.js';
import { getActiveDocument } from './dom-utils.js';
import { loadCommonJsDependency } from './obsidian-compat.js';
import {
  DEFAULT_EXPORT_ROOT,
  buildBatchDirName,
  buildNoteDirName,
  validateExportRoot,
} from './card-export-paths.js';
import { normalizeVaultPath } from './path-utils.js';

/** 内存中最多缓存多少篇笔记的 AI 生图历史 */
export const MAX_MEMORY_CACHED_NOTES = 10;
/** 单篇笔记在内存中最多保留多少张历史图片 */
export const MAX_MEMORY_HISTORY_PER_NOTE = 10;
/** 磁盘缓存文件中最多保留多少篇近期笔记（控制单文件体积） */
export const MAX_DISK_CACHED_NOTES = 5;
/** 单篇笔记在磁盘缓存文件中最多保留多少张图片 */
export const MAX_DISK_HISTORY_PER_NOTE = 4;
/** 插件目录下的独立缓存文件名 */
export const AI_COVER_CACHE_FILE_NAME = '.card-ai-cover-cache.json';

/**
 * 获取持久化宿主对象：优先挂载在 `view.plugin` 上，使侧边栏关闭再打开后依然存活；
 * 测试环境若无 `view.plugin` 则安全回退到 `view`。
 * @param {any} view
 * @returns {Record<string, any>}
 */
export function resolveAiCoverPersistenceHost(view) {
  if (view && view.plugin && typeof view.plugin === 'object') {
    // 若测试直接预置在 view._cardAiImageHistory 上，首次同步迁移至 plugin
    if (view._cardAiImageHistory && !view.plugin._cardAiImageHistory) {
      view.plugin._cardAiImageHistory = view._cardAiImageHistory;
    }
    return /** @type {Record<string, any>} */ (view.plugin);
  }
  return /** @type {Record<string, any>} */ (view || {});
}

/**
 * 获取指定笔记的 AI 生图历史数组（自动维护 LRU/FIFO 笔记数上限与双向引用）。
 * @param {any} view
 * @param {string} noteKey
 * @param {{ currentCoverFields?: Record<string, any>, defaultStyleId?: string }} [options]
 * @returns {Array<{ id: string, dataUrl: string, prompt: string, styleId: string, coverMode?: string, timestamp: number }>}
 */
export function getOrCreateNoteAiImageHistory(view, noteKey, options = {}) {
  const host = resolveAiCoverPersistenceHost(view);
  if (!host._cardAiImageHistory || typeof host._cardAiImageHistory !== 'object') {
    host._cardAiImageHistory = {};
  }
  if (view && typeof view === 'object') {
    view._cardAiImageHistory = host._cardAiImageHistory;
  }

  const map = /** @type {Record<string, Array<any>>} */ (host._cardAiImageHistory);
  const cachedKeys = Object.keys(map);
  if (!map[noteKey] && cachedKeys.length >= MAX_MEMORY_CACHED_NOTES) {
    delete map[cachedKeys[0]];
  }

  if (!Array.isArray(map[noteKey])) {
    map[noteKey] = [];
    const fields = options.currentCoverFields;
    if (fields && fields.coverImage && fields.coverImageSource === 'ai') {
      map[noteKey].push({
        id: 'initial_cover',
        dataUrl: String(fields.coverImage),
        prompt: String(fields.coverPrompt || ''),
        styleId: String(fields.coverImageStyle || options.defaultStyleId || '3d-clay'),
        coverMode: String(fields.coverMode || 'adaptive'),
        timestamp: Date.now(),
      });
    }
  }

  return map[noteKey];
}

/**
 * 向指定笔记的 AI 历史记录压入新生成的封面图（去重 + 截断上限 + 触发异步磁盘缓存）。
 * @param {any} view
 * @param {string} noteKey
 * @param {{ dataUrl: string, prompt: string, styleId: string, coverMode?: string }} entry
 */
export function pushNoteAiImageHistory(view, noteKey, entry) {
  const historyList = getOrCreateNoteAiImageHistory(view, noteKey);
  const existingIdx = historyList.findIndex((h) => h.dataUrl === entry.dataUrl);
  if (existingIdx >= 0) {
    historyList.splice(existingIdx, 1);
  }
  historyList.unshift({
    id: `ai_${Date.now()}`,
    dataUrl: entry.dataUrl,
    prompt: entry.prompt || '',
    styleId: entry.styleId || '3d-clay',
    coverMode: entry.coverMode || 'adaptive',
    timestamp: Date.now(),
  });
  if (historyList.length > MAX_MEMORY_HISTORY_PER_NOTE) {
    historyList.length = MAX_MEMORY_HISTORY_PER_NOTE;
  }
  scheduleDiskCacheSave(view);
  return historyList;
}

/**
 * 记住笔记的封面覆盖状态（用于侧边栏关闭后再打开时恢复封面配图与版式）。
 * @param {any} view
 * @param {string} noteKey
 * @param {Record<string, any> | null} coverFields
 */
export function rememberNoteCoverState(view, noteKey, coverFields) {
  const key = String(noteKey || '').trim();
  if (!key) return;
  const host = resolveAiCoverPersistenceHost(view);
  if (!host._cardCoverStateCache || typeof host._cardCoverStateCache !== 'object') {
    host._cardCoverStateCache = {};
  }
  const cache = /** @type {Record<string, Record<string, any>>} */ (host._cardCoverStateCache);
  if (!coverFields) {
    delete cache[key];
    scheduleDiskCacheSave(view);
    return;
  }
  const keys = Object.keys(cache);
  if (!cache[key] && keys.length >= MAX_MEMORY_CACHED_NOTES) {
    delete cache[keys[0]];
  }
  cache[key] = {
    coverImage: String(coverFields.coverImage || ''),
    coverImageSource: String(coverFields.coverImageSource || ''),
    coverMode: String(coverFields.coverMode || 'none'),
    coverImageStyle: String(coverFields.coverImageStyle || '3d-clay'),
    coverPrompt: String(coverFields.coverPrompt || ''),
    coverImageScale: typeof coverFields.coverImageScale === 'number' ? coverFields.coverImageScale : 1.0,
    coverImagePosition: coverFields.coverImagePosition && typeof coverFields.coverImagePosition === 'object'
      ? { x: Number(coverFields.coverImagePosition.x ?? 50), y: Number(coverFields.coverImagePosition.y ?? 50) }
      : { x: 50, y: 50 },
  };
  scheduleDiskCacheSave(view);
}

/**
 * 读取指定笔记已缓存的封面状态。
 * @param {any} view
 * @param {string} noteKey
 * @returns {Record<string, any> | null}
 */
export function getRememberedNoteCoverState(view, noteKey) {
  const key = String(noteKey || '').trim();
  if (!key) return null;
  const host = resolveAiCoverPersistenceHost(view);
  const cache = host._cardCoverStateCache;
  if (!cache || typeof cache !== 'object') return null;
  return cache[key] || null;
}

/**
 * 解析插件目录下的独立缓存文件路径。
 * @param {any} view
 * @returns {string}
 */
export function resolvePluginAiCoverCachePath(view) {
  const manifestDir = normalizeVaultPath(view?.plugin?.manifest?.dir || '');
  if (manifestDir) {
    return `${manifestDir}/${AI_COVER_CACHE_FILE_NAME}`;
  }
  const app = view?.app || view?.plugin?.app;
  const configDir = normalizeVaultPath(String(app?.vault?.configDir || ''));
  const pluginId = String(view?.plugin?.manifest?.id || 'obsidian-wechat-converter').trim();
  if (configDir) {
    return `${configDir}/plugins/${pluginId}/${AI_COVER_CACHE_FILE_NAME}`;
  }
  return '';
}

/**
 * 惰性从插件目录独立缓存文件加载历史与封面状态（仅首次需要时调用，不阻塞插件启动）。
 * @param {any} view
 * @returns {Promise<boolean>}
 */
export async function ensureDiskCacheLoaded(view) {
  const host = resolveAiCoverPersistenceHost(view);
  if (host._cardAiDiskCacheLoaded) return false;
  host._cardAiDiskCacheLoaded = true;

  const app = view?.app || view?.plugin?.app;
  const adapter = app?.vault?.adapter;
  if (!adapter || typeof adapter.read !== 'function') return false;

  const cachePath = resolvePluginAiCoverCachePath(view);
  if (!cachePath) return false;
  try {
    if (typeof adapter.exists === 'function') {
      const exists = await adapter.exists(cachePath);
      if (!exists) return false;
    }
    const raw = await adapter.read(cachePath);
    if (typeof raw !== 'string' || !raw.trim()) return false;
    const parsed = /** @type {Record<string, any>} */ (JSON.parse(raw));
    if (!parsed || typeof parsed !== 'object') return false;

    if (!host._cardAiImageHistory || typeof host._cardAiImageHistory !== 'object') {
      host._cardAiImageHistory = {};
    }
    if (!host._cardCoverStateCache || typeof host._cardCoverStateCache !== 'object') {
      host._cardCoverStateCache = {};
    }

    let restored = false;
    const diskHistories = parsed.histories && typeof parsed.histories === 'object' ? parsed.histories : {};
    for (const [k, list] of Object.entries(diskHistories)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      if (!Array.isArray(host._cardAiImageHistory[k]) || host._cardAiImageHistory[k].length === 0) {
        host._cardAiImageHistory[k] = list.filter((item) => item && typeof item.dataUrl === 'string');
        restored = true;
      }
    }

    const diskCoverStates = parsed.coverStates && typeof parsed.coverStates === 'object' ? parsed.coverStates : {};
    for (const [k, state] of Object.entries(diskCoverStates)) {
      if (!state || typeof state !== 'object') continue;
      if (!host._cardCoverStateCache[k]) {
        host._cardCoverStateCache[k] = state;
        restored = true;
      }
    }

    if (view && typeof view === 'object') {
      view._cardAiImageHistory = host._cardAiImageHistory;
    }
    return restored;
  } catch {
    return false;
  }
}

/**
 * 节流将最近的 AI 封面历史与封面状态写入插件目录独立缓存文件。
 * @param {any} view
 */
export function scheduleDiskCacheSave(view) {
  const host = resolveAiCoverPersistenceHost(view);
  const app = view?.app || view?.plugin?.app;
  const adapter = app?.vault?.adapter;
  if (!adapter || typeof adapter.write !== 'function') return;

  const win = typeof window !== 'undefined' ? window : null;
  if (host._cardAiDiskCacheTimer && win && typeof win.clearTimeout === 'function') {
    win.clearTimeout(host._cardAiDiskCacheTimer);
  }

  const doWrite = async () => {
    host._cardAiDiskCacheTimer = null;
    try {
      const histories = /** @type {Record<string, any[]>} */ (host._cardAiImageHistory || {});
      const coverStates = /** @type {Record<string, any>} */ (host._cardCoverStateCache || {});

      const trimmedHistories = /** @type {Record<string, any[]>} */ ({});
      const noteKeys = Object.keys(histories).slice(-MAX_DISK_CACHED_NOTES);
      for (const key of noteKeys) {
        const list = Array.isArray(histories[key]) ? histories[key] : [];
        if (list.length > 0) {
          trimmedHistories[key] = list.slice(0, MAX_DISK_HISTORY_PER_NOTE);
        }
      }

      const trimmedStates = /** @type {Record<string, any>} */ ({});
      const stateKeys = Object.keys(coverStates).slice(-MAX_DISK_CACHED_NOTES);
      for (const key of stateKeys) {
        if (coverStates[key]) {
          trimmedStates[key] = coverStates[key];
        }
      }

      const payload = JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        histories: trimmedHistories,
        coverStates: trimmedStates,
      });
      const cachePath = resolvePluginAiCoverCachePath(view);
      if (!cachePath) return;
      await adapter.write(cachePath, payload);
    } catch {
      // 独立缓存写入失败时静默降级，不影响主流程
    }
  };

  if (win && typeof win.setTimeout === 'function') {
    host._cardAiDiskCacheTimer = win.setTimeout(() => {
      void doWrite();
    }, 350);
  } else {
    void doWrite();
  }
}

/**
 * 将 Data URL 本地解析为 Uint8Array 二进制字节与扩展名（严禁调用 fetch(data:)）。
 * @param {string} dataUrl
 * @returns {{ bytes: Uint8Array, mimeType: string, ext: string }}
 */
export function parseDataUrlBytes(dataUrl) {
  const source = String(dataUrl || '').trim();
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(source);
  if (!match) {
    throw new Error('无效的图片数据格式');
  }
  const mimeType = (match[1] || 'image/png').toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  let ext = 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('webp')) ext = 'webp';
  return { bytes, mimeType, ext };
}

/**
 * 将任意格式的图片 Data URL 标准化为 PNG Blob（系统剪贴板 ClipboardItem 仅标准支持 image/png）。
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
async function ensurePngBlob(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  if (blob.type === 'image/png') {
    return blob;
  }
  const activeDocument = getActiveDocument();
  if (!activeDocument || typeof Image === 'undefined') {
    return new Blob([await blob.arrayBuffer()], { type: 'image/png' });
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = activeDocument.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 1024;
        canvas.height = img.naturalHeight || img.height || 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof canvas.toBlob !== 'function') {
          resolve(new Blob([blob], { type: 'image/png' }));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          resolve(pngBlob || new Blob([blob], { type: 'image/png' }));
        }, 'image/png');
      } catch {
        resolve(new Blob([blob], { type: 'image/png' }));
      }
    };
    img.onerror = () => {
      resolve(new Blob([blob], { type: 'image/png' }));
    };
    img.src = dataUrl;
  });
}

/**
 * 将 AI 生成的封面图复制到系统剪贴板。
 * @param {string} dataUrl
 * @returns {Promise<boolean>}
 */
export async function copyAiCoverImageToClipboard(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (clipboard && typeof clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
      const pngBlob = await ensurePngBlob(dataUrl);
      await clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      return true;
    }
  } catch {
    // 浏览器 ClipboardItem 失败时尝试退回桌面端 Electron clipboard
  }

  try {
    const electron = /** @type {any} */ (loadCommonJsDependency('electron'));
    if (electron?.clipboard?.writeImage && electron?.nativeImage?.createFromDataURL) {
      const img = electron.nativeImage.createFromDataURL(dataUrl);
      if (img && (typeof img.isEmpty !== 'function' || !img.isEmpty())) {
        electron.clipboard.writeImage(img);
        return true;
      }
    }
  } catch {
    // 忽略回退异常
  }
  return false;
}

/**
 * 将 AI 生成的封面图存入当前 Vault 的卡片导出目录（`<导出目录>/<笔记名>/ai-cover-<时间戳>.png`）。
 * @param {{ view: any, dataUrl: string, sourcePath?: string, now?: () => Date }} input
 * @returns {Promise<{ ok: boolean, path?: string, message?: string }>}
 */
export async function saveAiCoverImageToVaultExportDir(input) {
  const { view, dataUrl } = input;
  const app = view?.app || view?.plugin?.app;
  const adapter = app?.vault?.adapter;
  const vault = app?.vault;
  if (!adapter && !vault) {
    return { ok: false, message: '当前环境不支持写入仓库文件' };
  }

  const rawRoot = String(
    view?.cardExportRootPath
    || view?.plugin?.settings?.cardDefaults?.exportRoot
    || DEFAULT_EXPORT_ROOT,
  ).trim();
  const configDir = String(app?.vault?.configDir || '');
  const validated = validateExportRoot(rawRoot, { configDir });
  const exportRoot = validated.ok ? validated.root : DEFAULT_EXPORT_ROOT;

  const sourcePath = String(
    input.sourcePath
    || view?.cardPreviewPendingInput?.sourcePath
    || view?.lastResolvedSourcePath
    || '',
  ).trim();
  const { dirName: noteDirName } = buildNoteDirName(sourcePath || '未命名笔记');
  const folderPath = `${exportRoot}/${noteDirName}`;

  const { bytes, ext } = parseDataUrlBytes(dataUrl);

  const ensureDir = async (dirPath) => {
    const segments = String(dirPath).split('/').filter(Boolean);
    let current = '';
    for (const seg of segments) {
      current = current ? `${current}/${seg}` : seg;
      const exists = typeof adapter?.exists === 'function'
        ? await adapter.exists(current)
        : Boolean(vault?.getAbstractFileByPath?.(current));
      if (!exists) {
        if (typeof adapter?.mkdir === 'function') {
          await adapter.mkdir(current);
        } else if (typeof vault?.createFolder === 'function') {
          await vault.createFolder(current);
        }
      }
    }
  };

  try {
    await ensureDir(folderPath);
    const nowFn = typeof input.now === 'function' ? input.now : () => new Date();
    let targetPath = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const stamp = buildBatchDirName({ now: nowFn, attempt });
      const candidate = `${folderPath}/ai-cover-${stamp}.${ext}`;
      const exists = typeof adapter?.exists === 'function'
        ? await adapter.exists(candidate)
        : Boolean(vault?.getAbstractFileByPath?.(candidate));
      if (!exists) {
        targetPath = candidate;
        break;
      }
    }
    if (!targetPath) {
      targetPath = `${folderPath}/ai-cover-${Date.now()}.${ext}`;
    }

    if (typeof adapter?.writeBinary === 'function') {
      await adapter.writeBinary(targetPath, bytes);
    } else if (typeof vault?.createBinary === 'function') {
      await vault.createBinary(targetPath, bytes);
    } else {
      return { ok: false, message: '当前环境不支持写入二进制文件' };
    }

    return { ok: true, path: targetPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

/**
 * 触发「另存为」文件下载，将 AI 封面保存到用户计算机任意位置。
 * @param {{ dataUrl: string, sourcePath?: string, now?: () => Date }} input
 * @returns {boolean}
 */
export function downloadAiCoverImageAsFile(input) {
  const activeDocument = getActiveDocument();
  if (!activeDocument || !activeDocument.body) return false;
  try {
    const { ext } = parseDataUrlBytes(input.dataUrl);
    const { noteSegment } = buildNoteDirName(input.sourcePath || 'card');
    const stamp = buildBatchDirName({ now: input.now });
    const fileName = `${noteSegment}-ai-cover-${stamp}.${ext}`;

    const link = activeDocument.createElement('a');
    link.href = input.dataUrl;
    link.download = fileName;
    link.setCssStyles({ display: 'none' });
    activeDocument.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */
