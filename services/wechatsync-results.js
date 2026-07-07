/*
## 核心功能

实现浏览器发布助手桥接的 wechatsync results 能力。

## 输入

接收多平台发布任务、浏览器扩展回传、平台设置和同步结果。

## 输出

输出 `FEATURED_WECHATSYNC_PLATFORM_ORDER`、`getFallbackWechatsyncPlatforms`、`normalizeWechatsyncCapabilities`、`normalizeWechatsyncPlatform`、`getWechatsyncPlatformStatus`、`getWechatsyncPlatformStatusBadge`、`sortWechatsyncPlatformItemsForDisplay`、`sortWechatsyncPlatformsForDisplay`、`buildWechatsyncPlatformCatalog`、`normalizeWechatsyncCheckAuthResult`，用于桥接调用、结果归一化和平台状态展示。

## 定位

位于 services/，属于多平台桥接服务层；保持与发布弹窗 UI 解耦。

## 依赖

关键依赖：无直接模块导入；依赖当前运行环境或同文件内工具函数。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 services 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

export const FEATURED_WECHATSYNC_PLATFORM_ORDER = [
  'xiaohongshu',
  'zhihu',
  'weibo',
  'douyin',
  'toutiao',
  'bilibili',
  'csdn',
  'yuque',
  'jianshu',
  'smzdm',
];

/**
 * @typedef {Record<string, unknown>} UnknownRecord
 * @typedef {{
 *   id: string,
 *   name: string,
 *   homepage: string,
 *   icon: string,
 *   capabilities: string[],
 *   authStatus?: string,
 *   authKnown?: boolean,
 *   authenticated?: boolean,
 *   username?: string,
 *   error?: string,
 *   checkedAt?: number,
 *   lastSuccessAt?: number,
 *   lastFailureAt?: number,
 * }} WechatsyncPlatform
 * @typedef {{
 *   success?: boolean,
 *   platform?: string,
 *   id?: string,
 *   type?: string,
 *   error?: string,
 *   message?: string,
 *   postUrl?: string,
 *   draftUrl?: string,
 *   editUrl?: string,
 *   url?: string,
 *   link?: string,
 * }} WechatSyncResult
 * @typedef {{ checkAuth: (id: string, options: { timeoutMs: number }) => Promise<unknown> }} WechatsyncBridgeLike
 * @typedef {{ debug?: (...args: unknown[]) => void }} LoggerLike
 */

const FEATURED_WECHATSYNC_PLATFORM_RANK = new Map(
  FEATURED_WECHATSYNC_PLATFORM_ORDER.map((id, index) => [id, index])
);

const FALLBACK_WECHATSYNC_PLATFORMS = [
  { id: 'xiaohongshu', name: '小红书', homepage: 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=article', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'zhihu', name: '知乎', homepage: 'https://www.zhihu.com', capabilities: ['article', 'draft', 'image_upload', 'tags', 'cover'] },
  { id: 'weibo', name: '微博', homepage: 'https://card.weibo.com/article/v5/editor', capabilities: ['article', 'draft', 'image_upload', 'cover'] },
  { id: 'douyin', name: '抖音图文', homepage: 'https://creator.douyin.com', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'toutiao', name: '头条号', homepage: 'https://mp.toutiao.com/profile_v4/graphic/publish', capabilities: ['article', 'draft', 'image_upload', 'cover'] },
  { id: 'bilibili', name: 'B站专栏', homepage: 'https://member.bilibili.com/platform/upload/text', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'csdn', name: 'CSDN', homepage: 'https://editor.csdn.net/md/', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'yuque', name: '语雀', homepage: 'https://www.yuque.com/dashboard', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'jianshu', name: '简书', homepage: 'https://www.jianshu.com', capabilities: ['article', 'draft', 'image_upload', 'categories'] },
  { id: 'smzdm', name: '什么值得买', homepage: 'https://post.smzdm.com/tougao/', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'juejin', name: '掘金', homepage: 'https://juejin.cn', capabilities: ['article', 'draft', 'image_upload', 'categories', 'tags', 'cover'] },
  { id: 'baijiahao', name: '百家号', homepage: 'https://baijiahao.baidu.com/', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'douban', name: '豆瓣', homepage: 'https://www.douban.com/note/create', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'sohu', name: '搜狐号', homepage: 'https://mp.sohu.com/mpfe/v3/main/first/page?newsType=1', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'xueqiu', name: '雪球', homepage: 'https://mp.xueqiu.com/writeV2', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'woshipm', name: '人人都是产品经理', homepage: 'https://www.woshipm.com', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'dayu', name: '大鱼号', homepage: 'https://mp.dayu.com/dashboard/account/profile', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'yidian', name: '一点号', homepage: 'https://mp.yidianzixun.com', capabilities: ['article', 'draft', 'image_upload'] },
  { id: '51cto', name: '51CTO', homepage: 'https://blog.51cto.com/blogger/publish', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'imooc', name: '慕课手记', homepage: 'https://www.imooc.com/article', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'oschina', name: '开源中国', homepage: 'https://my.oschina.net', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'segmentfault', name: '思否', homepage: 'https://segmentfault.com/user/draft', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'cnblogs', name: '博客园', homepage: 'https://www.cnblogs.com', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'sohufocus', name: '搜狐焦点', homepage: 'https://mp.focus.cn/fe/index.html#/info/draft', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'x', name: 'X (Twitter)', homepage: 'https://x.com/compose/articles', capabilities: ['article', 'draft', 'image_upload'] },
  { id: 'eastmoney', name: '东方财富', homepage: 'https://mp.eastmoney.com', capabilities: ['article', 'draft', 'image_upload', 'cover'] },
  { id: 'netease', name: '网易号', homepage: 'https://mp.163.com/#/article-publish', capabilities: ['article', 'draft', 'image_upload'] },
];

/**
 * @param {unknown} value
 * @returns {value is UnknownRecord}
 */
function isRecord(value) {
  return !!value && typeof value === 'object';
}

/**
 * @param {unknown} value
 * @returns {UnknownRecord}
 */
function asRecord(value) {
  return isRecord(value) ? /** @type {UnknownRecord} */ (value) : {};
}

/**
 * @param {UnknownRecord} source
 * @param {string} key
 * @returns {boolean}
 */
function hasOwn(source, key) {
  return Boolean(Object.prototype.hasOwnProperty.call(source, key));
}

/**
 * @param {UnknownRecord} source
 * @param {string} key
 * @returns {string}
 */
function stringField(source, key) {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/**
 * @param {UnknownRecord} source
 * @param {string} key
 * @returns {boolean}
 */
function booleanField(source, key) {
  return source[key] === true;
}

/**
 * @param {unknown} value
 * @returns {WechatSyncResult}
 */
function asSyncResult(value) {
  return /** @type {WechatSyncResult} */ (asRecord(value));
}

/**
 * @returns {WechatsyncPlatform[]}
 */
export function getFallbackWechatsyncPlatforms() {
  return FALLBACK_WECHATSYNC_PLATFORMS.map((platform) => ({ ...platform }));
}

function isPlatformNotFoundError(error = '') {
  return /platform not found|adapter not found|not found/i.test(String(error || ''));
}

/**
 * @param {unknown} platform
 * @returns {string[]}
 */
export function normalizeWechatsyncCapabilities(platform = {}) {
  const source = asRecord(platform);
  const rawCapabilities = Array.isArray(source.capabilities) ? source.capabilities : [];
  const capabilitySet = new Set(rawCapabilities.map((capability) => String(capability || '').trim()).filter(Boolean));
  if (booleanField(source, 'supportsArticle')) capabilitySet.add('article');
  if (booleanField(source, 'supportsDraft') || booleanField(source, 'draft')) capabilitySet.add('draft');
  if (booleanField(source, 'supportsImageUpload') || booleanField(source, 'imageUpload') || booleanField(source, 'supportsImages')) {
    capabilitySet.add('image_upload');
  }
  if (booleanField(source, 'supportsCover') || booleanField(source, 'cover')) capabilitySet.add('cover');
  if (booleanField(source, 'supportsTags') || booleanField(source, 'tags')) capabilitySet.add('tags');
  if (booleanField(source, 'supportsCategories') || booleanField(source, 'categories')) capabilitySet.add('categories');
  return Array.from(capabilitySet);
}

/**
 * @param {unknown} platform
 * @returns {WechatsyncPlatform | null}
 */
export function normalizeWechatsyncPlatform(platform = {}) {
  const source = asRecord(platform);
  const id = String(source.id || source.type || source.platform || '').trim();
  if (!id || id === 'weixin') return null;
  const nestedAuth = asRecord(source.auth);
  const user = asRecord(source.user);
  const rawStatus = String(source.status || source.authStatus || source.authState || '').trim();
  const authStatus = ['available', 'login_required', 'unknown', 'bridge_required'].includes(rawStatus)
    ? rawStatus
    : '';
  const hasExplicitAuthKnown = hasOwn(source, 'authKnown');
  const authKnown = hasExplicitAuthKnown
    ? source.authKnown === true
    : (hasOwn(source, 'isAuthenticated')
      || hasOwn(source, 'authenticated')
      || hasOwn(source, 'isAuth')
      || hasOwn(source, 'loggedIn')
      || hasOwn(nestedAuth, 'isAuthenticated')
      || hasOwn(nestedAuth, 'authenticated')
      || hasOwn(nestedAuth, 'loggedIn')
      || typeof source.status === 'string');
  return {
    id,
    name: String(source.name || source.title || source.platformName || id),
    homepage: stringField(source, 'homepage'),
    icon: stringField(source, 'icon'),
    capabilities: normalizeWechatsyncCapabilities(source),
    authStatus,
    authKnown,
    authenticated: booleanField(source, 'isAuthenticated')
      || booleanField(source, 'authenticated')
      || booleanField(source, 'isAuth')
      || booleanField(source, 'loggedIn')
      || booleanField(nestedAuth, 'isAuthenticated')
      || booleanField(nestedAuth, 'authenticated')
      || booleanField(nestedAuth, 'loggedIn')
      || authStatus === 'available'
      || source.status === 'authenticated'
      || source.status === 'logged_in'
      || source.status === '已登录',
    username: stringField(source, 'username')
      || stringField(source, 'accountName')
      || stringField(nestedAuth, 'username')
      || stringField(user, 'name'),
    error: stringField(source, 'error'),
  };
}

/**
 * @param {unknown} platform
 * @param {unknown} options
 * @returns {string}
 */
export function getWechatsyncPlatformStatus(platform = {}, options = {}) {
  const source = asRecord(platform);
  const opts = asRecord(options);
  if (opts.bridgeConnected === false || source.authStatus === 'bridge_required') return 'bridge_required';
  const explicitStatus = String(source.authStatus || source.authState || '').trim();
  if (['available', 'login_required', 'unknown', 'bridge_required'].includes(explicitStatus)) return explicitStatus;
  if (!source.authKnown) return 'unknown';
  return source.authenticated ? 'available' : 'login_required';
}

/**
 * @param {unknown} platform
 * @param {unknown} options
 * @returns {{ status: string, text: string, cls: string }}
 */
export function getWechatsyncPlatformStatusBadge(platform = {}, options = {}) {
  const source = asRecord(platform);
  const status = getWechatsyncPlatformStatus(platform, options);
  if (status === 'bridge_required') return { status, text: '需连接浏览器插件', cls: 'is-bridge' };
  if (status === 'available') {
    const username = stringField(source, 'username');
    return {
      status,
      text: username ? `上次可用 · ${username}` : '上次可用',
      cls: 'is-ok',
    };
  }
  if (status === 'login_required') {
    return { status, text: stringField(source, 'error') || '需登录', cls: 'is-error' };
  }
  return { status: 'unknown', text: '未检测', cls: 'is-unknown' };
}

function getWechatsyncPlatformIdFromItem(item = {}) {
  const source = asRecord(item);
  return String(source.id || source.platform || source.type || item || '').trim();
}

function getWechatsyncPlatformSortRank(platformId = '') {
  return FEATURED_WECHATSYNC_PLATFORM_RANK.has(platformId)
    ? FEATURED_WECHATSYNC_PLATFORM_RANK.get(platformId)
    : FEATURED_WECHATSYNC_PLATFORM_ORDER.length + 1000;
}

function isWechatsyncPlatformAuthenticated(platform = {}, bridgeConnected = true) {
  if (bridgeConnected === false) return false;
  const source = asRecord(platform);
  const status = getWechatsyncPlatformStatus(platform, { bridgeConnected });
  return status === 'available' || source.authenticated === true;
}

/**
 * @template T
 * @param {T[]} items
 * @param {object} options
 * @param {boolean=} options.bridgeConnected
 * @param {boolean=} options.authenticatedFirst
 * @param {(item: T) => string=} options.getPlatformId
 * @param {(item: T) => unknown=} options.getPlatform
 * @returns {T[]}
 */
export function sortWechatsyncPlatformItemsForDisplay(items = [], options = {}) {
  const {
    bridgeConnected = true,
    authenticatedFirst = bridgeConnected !== false,
    getPlatformId = getWechatsyncPlatformIdFromItem,
    getPlatform = (item) => item,
  } = options;
  const safeItems = Array.isArray(items) ? items : [];
  return safeItems
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const aPlatform = getPlatform(a.item) || {};
      const bPlatform = getPlatform(b.item) || {};
      if (authenticatedFirst) {
        const authDiff = Number(isWechatsyncPlatformAuthenticated(bPlatform, bridgeConnected))
          - Number(isWechatsyncPlatformAuthenticated(aPlatform, bridgeConnected));
        if (authDiff !== 0) return authDiff;
      }

      const aRank = getWechatsyncPlatformSortRank(getPlatformId(a.item));
      const bRank = getWechatsyncPlatformSortRank(getPlatformId(b.item));
      return aRank - bRank || a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);
}

/**
 * @param {WechatsyncPlatform[]} platforms
 * @param {unknown} options
 * @returns {WechatsyncPlatform[]}
 */
export function sortWechatsyncPlatformsForDisplay(platforms = [], options = {}) {
  const opts = asRecord(options);
  return sortWechatsyncPlatformItemsForDisplay(platforms, {
    ...opts,
    getPlatformId: (platform) => platform?.id,
    getPlatform: (platform) => platform,
  });
}

/**
 * @param {unknown} options
 * @returns {WechatsyncPlatform[]}
 */
export function buildWechatsyncPlatformCatalog(options = {}) {
  const source = asRecord(options);
  const {
    fallbackPlatforms = getFallbackWechatsyncPlatforms(),
    supportedPlatforms = [],
    authSnapshotPlatforms = [],
    bridgeConnected = true,
  } = source;
  const normalizedSupported = normalizeWechatsyncPlatformList(supportedPlatforms);
  const basePlatforms = bridgeConnected && normalizedSupported.length
    ? normalizedSupported
    : normalizeWechatsyncPlatformList(fallbackPlatforms);
  /** @type {Map<string, WechatsyncPlatform>} */
  const authById = new Map(
    normalizeWechatsyncPlatformList(authSnapshotPlatforms).map((platform) => [platform.id, platform])
  );
  /** @type {WechatsyncPlatform[]} */
  const catalog = [];
  const seen = new Set();

  for (const base of basePlatforms) {
    const auth = authById.get(base.id);
    const merged = {
      ...base,
      ...(auth || {}),
      name: base.name || auth?.name || base.id,
      homepage: base.homepage || auth?.homepage || '',
      icon: base.icon || auth?.icon || '',
      capabilities: base.capabilities?.length ? base.capabilities : (auth?.capabilities || []),
    };
    catalog.push(bridgeConnected
      ? (auth ? merged : { ...merged, authKnown: false, authenticated: false, username: '', error: '' })
      : { ...merged, authStatus: 'bridge_required', authKnown: true, authenticated: false, username: '', error: '' });
    seen.add(base.id);
  }

  if (bridgeConnected) {
    for (const auth of authById.values()) {
      if (seen.has(auth.id)) continue;
      catalog.push(auth);
    }
  }

  return sortWechatsyncPlatformsForDisplay(catalog, {
    bridgeConnected,
    authenticatedFirst: bridgeConnected,
  });
}

/**
 * @param {unknown} candidate
 * @param {unknown} auth
 * @returns {WechatsyncPlatform | null}
 */
export function normalizeWechatsyncCheckAuthResult(candidate = {}, auth = {}) {
  const candidateSource = asRecord(candidate);
  const authSource = asRecord(auth);
  const error = stringField(authSource, 'error');
  if (isPlatformNotFoundError(error)) return null;
  return normalizeWechatsyncPlatform({
    ...authSource,
    id: candidateSource.id,
    name: candidateSource.name,
    type: candidateSource.id,
    platform: candidateSource.id,
  });
}

/**
 * @param {WechatsyncBridgeLike} bridge
 * @param {object} options
 * @param {WechatsyncPlatform[]=} options.candidates
 * @param {number=} options.timeoutMs
 * @param {number=} options.concurrency
 * @param {LoggerLike=} options.logger
 * @returns {Promise<WechatsyncPlatform[]>}
 */
export async function probeWechatsyncPlatformsIndividually(bridge, options = {}) {
  const {
    candidates = getFallbackWechatsyncPlatforms(),
    timeoutMs = 6000,
    concurrency = 4,
    logger = console,
  } = options;
  /** @type {WechatsyncPlatform[]} */
  const results = [];

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (candidate) => {
      try {
        const auth = await bridge.checkAuth(candidate.id, { timeoutMs });
        const authSource = asRecord(auth);
        const normalized = normalizeWechatsyncCheckAuthResult(candidate, auth);
        logger.debug?.('[Wechatsync] fallback checkAuth result', {
          id: candidate.id,
          name: candidate.name,
          authenticated: normalized?.authenticated,
          error: stringField(authSource, 'error'),
        });
        return normalized;
      } catch (error) {
        const errorSource = asRecord(error);
        logger.debug?.('[Wechatsync] fallback checkAuth failed', {
          id: candidate.id,
          name: candidate.name,
          code: errorSource.code,
          message: stringField(errorSource, 'message') || String(error),
        });
        return null;
      }
    }));
    results.push(.../** @type {WechatsyncPlatform[]} */ (batchResults.filter(Boolean)));
  }

  /** @type {Map<string, WechatsyncPlatform>} */
  const byId = new Map();
  for (const platform of results) {
    if (!byId.has(platform.id)) byId.set(platform.id, platform);
  }
  return Array.from(byId.values());
}

/**
 * @param {unknown} response
 * @returns {WechatsyncPlatform[]}
 */
export function normalizeWechatsyncPlatformList(response) {
  const source = asRecord(response);
  const candidates = Array.isArray(response)
    ? response
    : (Array.isArray(source.platforms)
      ? source.platforms
      : (Array.isArray(source.result)
        ? source.result
        : (Array.isArray(source.data) ? source.data : [])));

  return candidates
    .map((platform) => normalizeWechatsyncPlatform(platform))
    .filter(Boolean);
}

/**
 * @param {unknown} response
 * @param {unknown[]} fallbackPlatforms
 * @returns {{ source: string, checkedAt: number, platforms: WechatsyncPlatform[] }}
 */
export function normalizeWechatsyncAuthSnapshot(response = {}, fallbackPlatforms = []) {
  const source = asRecord(response);
  /** @type {Map<string, WechatsyncPlatform>} */
  const fallbackById = new Map(
    (Array.isArray(fallbackPlatforms) ? fallbackPlatforms : [])
      .map((platform) => normalizeWechatsyncPlatform(platform))
      .filter(Boolean)
      .map((platform) => [platform.id, platform])
  );
  const platforms = normalizeWechatsyncPlatformList(source).map((platform) => {
    const fallback = fallbackById.get(platform.id);
    return {
      ...(fallback || {}),
      ...platform,
      name: platform.name && platform.name !== platform.id ? platform.name : (fallback?.name || platform.name),
    };
  });
  const checkedAt = Number.isFinite(Number(source.checkedAt))
    ? Number(source.checkedAt)
    : platforms.reduce((latest, platform) => {
      const candidate = Number(platform.checkedAt || platform.lastSuccessAt || platform.lastFailureAt || 0);
      return Number.isFinite(candidate) && candidate > latest ? candidate : latest;
    }, 0);
  return {
    source: typeof source.source === 'string' ? source.source : 'cache',
    checkedAt,
    platforms,
  };
}

/**
 * @param {unknown} response
 * @returns {{
 *   responseKind: string,
 *   rawCount: number,
 *   normalizedCount: number,
 *   authenticatedCount: number,
 *   platforms: Array<{ id: string, name: string, authenticated?: boolean, username?: string }>
 * }}
 */
export function summarizeWechatsyncPlatformResponse(response) {
  const source = asRecord(response);
  const rawPlatforms = Array.isArray(response)
    ? response
    : (Array.isArray(source.platforms)
      ? source.platforms
      : (Array.isArray(source.result)
        ? source.result
        : (Array.isArray(source.data) ? source.data : [])));
  const normalized = normalizeWechatsyncPlatformList(response);
  return {
    responseKind: Array.isArray(response) ? 'array' : typeof response,
    rawCount: rawPlatforms.length,
    normalizedCount: normalized.length,
    authenticatedCount: normalized.filter((platform) => platform.authenticated).length,
    platforms: normalized.map((platform) => ({
      id: platform.id,
      name: platform.name,
      authenticated: platform.authenticated,
      username: platform.username,
    })),
  };
}

/**
 * @param {unknown} result
 * @returns {string}
 */
export function getWechatSyncResultPlatformId(result = {}) {
  const source = asRecord(result);
  return String(source.platform || source.id || source.type || '').trim();
}

/**
 * @param {unknown} result
 * @returns {string}
 */
export function getWechatSyncResultError(result = {}) {
  const source = asRecord(result);
  return String(source.error || source.message || '').trim();
}

/**
 * @param {unknown} result
 * @returns {string}
 */
export function getWechatSyncResultUrl(result = {}) {
  const source = asRecord(result);
  return String(source.postUrl || source.draftUrl || source.editUrl || source.url || source.link || '').trim();
}

export function isWechatSyncAuthFailureMessage(message = '') {
  return /未登录|登录|auth|unauthori[sz]ed|forbidden|cookie|token|鉴权|401|403/i.test(String(message || ''));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isWechatSyncConnectionFailure(error = {}) {
  const source = asRecord(error);
  return ['AUTH_FAILED', 'EXTENSION_NOT_CONNECTED', 'EXTENSION_NOT_AUTHENTICATED', 'BRIDGE_UNAVAILABLE', 'PLATFORM_LIST_TIMEOUT'].includes(String(source.code || ''));
}

/**
 * @param {unknown} result
 * @returns {WechatSyncResult[]}
 */
export function normalizeWechatSyncResponseResults(result) {
  const source = asRecord(result);
  if (Array.isArray(source.results)) return source.results.filter(Boolean).map((item) => asSyncResult(item));
  if (Array.isArray(result)) return result.filter(Boolean).map((item) => asSyncResult(item));
  if (isRecord(result) && hasOwn(result, 'success')) return [asSyncResult(result)];
  return [];
}

/**
 * @param {unknown} results
 * @param {unknown[]} requestedPlatformIds
 * @param {unknown} fatalError
 * @returns {{
 *   normalizedResults: WechatSyncResult[],
 *   successResults: WechatSyncResult[],
 *   failedResults: WechatSyncResult[],
 *   authFailedResults: WechatSyncResult[],
 *   successCount: number,
 *   failedCount: number,
 *   totalCount: number,
 *   isAllSuccess: boolean,
 * }}
 */
export function getMultiPlatformResultSummary(results = [], requestedPlatformIds = [], fatalError = null) {
  const normalizedResults = normalizeWechatSyncResponseResults(results);
  const successResults = normalizedResults.filter((item) => item.success === true);
  const failedResults = normalizedResults.filter((item) => item.success === false);
  const authFailedResults = failedResults.filter((item) => isWechatSyncAuthFailureMessage(getWechatSyncResultError(item)));
  const totalCount = normalizedResults.length || requestedPlatformIds.length;
  return {
    normalizedResults,
    successResults,
    failedResults,
    authFailedResults,
    successCount: successResults.length,
    failedCount: failedResults.length,
    totalCount,
    isAllSuccess: totalCount > 0 && !fatalError && successResults.length === totalCount,
  };
}

/**
 * @param {unknown[]} cachedPlatforms
 * @param {unknown} results
 * @returns {WechatsyncPlatform[]}
 */
export function updateCachedPlatformsAfterSync(cachedPlatforms = [], results = []) {
  /** @type {Map<string, WechatsyncPlatform>} */
  const byId = new Map();
  for (const platform of cachedPlatforms) {
    const normalized = normalizeWechatsyncPlatform(platform);
    if (normalized) byId.set(normalized.id, normalized);
  }

  for (const result of normalizeWechatSyncResponseResults(results)) {
    const platformId = getWechatSyncResultPlatformId(result);
    if (!platformId || platformId === 'weixin') continue;
    const previous = byId.get(platformId) || normalizeWechatsyncPlatform(result) || {
      id: platformId,
      name: platformId,
      authenticated: false,
    };
    const errorMessage = getWechatSyncResultError(result);

    if (result.success === true) {
      byId.set(platformId, {
        ...previous,
        authenticated: true,
        error: '',
      });
      continue;
    }

    if (isWechatSyncAuthFailureMessage(errorMessage)) {
      byId.set(platformId, {
        ...previous,
        authenticated: false,
        error: errorMessage,
      });
    }
  }

  return Array.from(byId.values());
}
