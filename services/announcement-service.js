/*
## 核心功能

获取和管理远程活动通知与特惠状态 (Announcement & Promotion)。

## 输入

接收网络响应、插件设置和多平台授权状态。

## 输出

输出 `fetchActiveAnnouncement`、`isAnnouncementEligible`、`dismissAnnouncement`。

## 定位

位于 services/，属于服务层；不直接创建 DOM 元素。

## 依赖

关键依赖：`./obsidian-compat.js`、`./wechatsync-settings.js`。

## 维护规则

- 修改逻辑后同步更新本文件说明书。
- 保证离线或网络故障时静默降级，绝不阻塞主流程。
*/

import { getObsidianRequestUrl } from './obsidian-compat.js';
import { resolveWechatSyncProLicense } from './wechatsync-settings.js';

/**
 * @typedef {Object} AnnouncementPayload
 * @property {string} id
 * @property {boolean} active
 * @property {string} [tag]
 * @property {string} [title]
 * @property {string} [couponCode]
 * @property {string} [highlightPrice]
 * @property {string} [originalPrice]
 * @property {string} [shortText]
 * @property {string} [description]
 * @property {string} [actionText]
 * @property {string} [actionUrl]
 * @property {string} [startTime]
 * @property {string} [endTime]
 */

/**
 * @typedef {Object} AnnouncementResponse
 * @property {boolean} ok
 * @property {AnnouncementPayload} [announcement]
 */

/**
 * @typedef {Object} RequestUrlResponseLike
 * @property {number} status
 * @property {unknown} [json]
 * @property {string} [text]
 */

const PRIMARY_ANNOUNCEMENT_URL = 'https://license.xiaoweibox.top/announcement';
const FALLBACK_ANNOUNCEMENT_URL = 'https://xiaoweibox.top/api/announcement';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时内存缓存

/** @type {{ data: AnnouncementPayload | null, fetchedAt: number }} */
let memoryCache = {
  data: null,
  fetchedAt: 0,
};

/**
 * @param {string} url
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<AnnouncementResponse | null>}
 */
async function fetchJsonWithTimeout(url, timeoutMs = 3000) {
  const requestUrl = /** @type {((options: Record<string, unknown>) => Promise<RequestUrlResponseLike>) | undefined} */ (
    getObsidianRequestUrl()
  );
  if (typeof requestUrl !== 'function') return null;

  let timeoutId = 0;
  /** @type {Promise<AnnouncementResponse | null>} */
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
  });

  /** @type {Promise<AnnouncementResponse | null>} */
  const requestPromise = Promise.resolve(
    requestUrl({
      url,
      method: 'GET',
      headers: { Accept: 'application/json' },
      throw: false,
    })
  )
    .then((res) => {
      window.clearTimeout(timeoutId);
      if (!res || res.status < 200 || res.status >= 300) return null;
      if (res.json && typeof res.json === 'object') {
        const rawJson = /** @type {unknown} */ (res.json);
        return /** @type {AnnouncementResponse} */ (rawJson);
      }
      if (typeof res.text === 'string' && res.text.trim().startsWith('{')) {
        try {
          const parsed = /** @type {unknown} */ (JSON.parse(res.text));
          if (parsed && typeof parsed === 'object') {
            return /** @type {AnnouncementResponse} */ (parsed);
          }
          return null;
        } catch {
          return null;
        }
      }
      return null;
    })
    .catch(() => {
      window.clearTimeout(timeoutId);
      return null;
    });

  const raceResult = /** @type {AnnouncementResponse | null} */ (
    await Promise.race([requestPromise, timeoutPromise])
  );
  return raceResult;
}

/**
 * 拉取当前活动通知（带 1 小时内存缓存与主/备容灾）
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<AnnouncementPayload | null>}
 */
export async function fetchActiveAnnouncement(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && memoryCache.data && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  // 1. 优先请求 Cloudflare Worker（国内访问稳定）
  let body = await fetchJsonWithTimeout(PRIMARY_ANNOUNCEMENT_URL, 1200);

  // 2. 备用请求主站 Vercel API
  if (!body || !body.ok || !body.announcement) {
    body = await fetchJsonWithTimeout(FALLBACK_ANNOUNCEMENT_URL, 1200);
  }

  if (body && body.ok && body.announcement) {
    memoryCache = {
      data: body.announcement,
      fetchedAt: now,
    };
    return body.announcement;
  }

  return null;
}

/**
 * 判断某个通知对当前用户是否有效且应展示
 * @param {AnnouncementPayload | null | undefined} announcement
 * @param {Record<string, unknown> | null | undefined} settings
 * @param {number} [now=Date.now()]
 * @param {{ ignoreDismissed?: boolean }} [options={}]
 * @returns {boolean}
 */
export function isAnnouncementEligible(announcement, settings, now = Date.now(), options = {}) {
  if (!announcement || !announcement.id || !announcement.active) {
    return false;
  }

  // 1. 时间校验
  if (announcement.startTime) {
    const start = new Date(announcement.startTime).getTime();
    if (Number.isFinite(start) && now < start) return false;
  }
  if (announcement.endTime) {
    const end = new Date(announcement.endTime).getTime();
    if (Number.isFinite(end) && now > end) return false;
  }

  // 2. 已激活 Pro 的尊贵用户完全免打扰
  const multiPlatform = (settings && typeof settings === 'object') ? /** @type {Record<string, unknown>} */ (settings.multiPlatformSync) : {};
  if (resolveWechatSyncProLicense(multiPlatform, now).pro) {
    return false;
  }

  // 3. 用户是否已主动点击关闭（在设置页等常驻入口可选择忽略已关闭标记，保持入口可用）
  const ignoreDismissed = Boolean(options && typeof options === 'object' && options.ignoreDismissed);
  if (!ignoreDismissed) {
    const dismissed = (settings && Array.isArray(settings.dismissedPromoIds))
      ? /** @type {string[]} */ (settings.dismissedPromoIds)
      : [];
    if (dismissed.includes(announcement.id)) {
      return false;
    }
  }

  return true;
}

/**
 * 记录用户关闭通知状态
 * @param {{ settings?: Record<string, unknown>, saveSettings?: () => Promise<unknown> } | null | undefined} plugin
 * @param {string} announcementId
 * @returns {Promise<void>}
 */
export async function dismissAnnouncement(plugin, announcementId) {
  if (!plugin || !announcementId || !plugin.settings) return;
  const settings = plugin.settings;
  if (!Array.isArray(settings.dismissedPromoIds)) {
    settings.dismissedPromoIds = [];
  }
  const dismissed = /** @type {string[]} */ (settings.dismissedPromoIds);
  if (!dismissed.includes(announcementId)) {
    dismissed.push(announcementId);
    try {
      if (typeof plugin.saveSettings === 'function') {
        await plugin.saveSettings();
      }
    } catch (e) {
      console.warn('[Announcement] 保存关闭状态失败', e);
    }
  }
}
