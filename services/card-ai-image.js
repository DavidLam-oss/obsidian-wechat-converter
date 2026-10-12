/*
 * ## 核心功能: 小红书卡片导出（Image Card）AI 封面生成服务。
 * - 对接 OpenAI 兼容生图 API（/images/generations），提供预设风格模版与动态 Prompt 变量替换；
 * - 比例适配与 Base64 内联转码；支持 AbortSignal 取消与超时保护。
 * ## 输出: AI_CARD_COVER_STYLES, resolveCardCoverPrompt, resolveCardImageDimensions, generateCardCoverImage, extractVisualTopicWithAi.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: JS file handles dynamic API responses without strict typescript type annotations */

import { getObsidianRequestUrl } from './obsidian-compat.js';
import { getActiveWindowValue } from './dom-utils.js';

/**
 * 预设生图风格模版列表
 */
export const AI_CARD_COVER_STYLES = [
  {
    id: '3d-clay',
    name: '3D 粘土',
    description: '立体软萌、微缩景观与哑光磨砂质感',
    promptTemplate:
      '3D 黏土微缩场景，柔和圆润造型，马卡龙暖色调，哑光磨砂黏土质感，棚拍柔光照明，C4D 渲染风格，微缩景观展现主题：{topic}，纯净背景，超清细节，画面无文字',
  },
  {
    id: 'minimal-vector',
    name: '扁平矢量',
    description: '清晰线条、几何色块与优雅留白',
    promptTemplate:
      '扁平矢量插画风格，极简现代设计，线条利落流畅，高雅撞色与留白构图，视觉化隐喻表达：{topic}，杂志海报质感，矢量图形，超清画质，画面无文字',
  },
  {
    id: 'cyberpunk-tech',
    name: '未来科技',
    description: '黑曜底色、全息几何与霓虹科技感',
    promptTemplate:
      '未来主义赛博朋克科技感，深色黑曜背景，霓虹青紫辉光与全息光效，几何科技线条，概念化科技场景诠释：{topic}，电影级光影，超清细节，画面无文字',
  },
  {
    id: 'warm-healing',
    name: '温暖手绘',
    description: '温馨水彩水粉手绘质感与治愈意境',
    promptTemplate:
      '温馨治愈水粉水彩手绘风，细腻笔触与纸张纹理，温润柔和暖光，治愈系慢生活意境，故事感画面呼应：{topic}，唯美插画壁纸质感，画面无文字',
  },
  {
    id: 'editorial-magazine',
    name: '新潮杂志',
    description: '先锋艺术构图、撞色大色块与杂志海报',
    promptTemplate:
      '当代艺术先锋杂志封面背景，大胆现代抽象几何构图，高级撞色色块，前卫高级感，视觉概念象征：{topic}，美术馆海报美学，纯净大气，画面无文字',
  },
  {
    id: 'custom',
    name: '自定义',
    description: '完全由用户编写提示词，支持 {topic} / {title} / {excerpt} 变量',
    promptTemplate: '{topic}',
  },
];

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToBase64(buffer) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const win = getActiveWindowValue('window') || (typeof window !== 'undefined' ? window : null);
  const btoaFn = win && typeof win.btoa === 'function' ? win.btoa.bind(win) : null;
  if (!btoaFn) {
    throw new Error('当前环境缺少 Buffer 或 btoa，无法转换图片 Base64');
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoaFn(binary);
}

/**
 * 变量替换生成最终提示词
 * @param {object} options
 * @param {string} [options.styleId]
 * @param {string} [options.customPrompt]
 * @param {string} [options.title]
 * @param {string} [options.excerpt]
 * @param {string} [options.topic]
 * @returns {string}
 */
export function resolveCardCoverPrompt(options = {}) {
  const {
    styleId = '3d-clay',
    customPrompt = '',
    title = '精选笔记',
    excerpt = '',
    topic = '',
  } = options;

  let template = '';
  if (styleId === 'custom') {
    template = (customPrompt && customPrompt.trim()) ? customPrompt.trim() : '{topic}';
  } else {
    const matched = AI_CARD_COVER_STYLES.find((s) => s.id === styleId);
    template = matched ? matched.promptTemplate : AI_CARD_COVER_STYLES[0].promptTemplate;
    if (customPrompt && customPrompt.trim()) {
      template = `${template}, ${customPrompt.trim()}`;
    }
  }

  const safeTitle = (title || '精选笔记').replace(/[\r\n]+/g, ' ').trim();
  const safeExcerpt = (excerpt || '').replace(/[\r\n]+/g, ' ').slice(0, 100).trim();
  const safeTopic = (topic || '').replace(/[\r\n]+/g, ' ').trim();
  const effectiveTopic = safeTopic || (safeExcerpt ? `${safeTitle} (${safeExcerpt})` : safeTitle);

  return template
    .replace(/\{title\}/g, safeTitle)
    .replace(/\{excerpt\}/g, safeExcerpt)
    .replace(/\{topic\}/g, effectiveTopic)
    .trim();
}

/**
 * 比例映射为 API 分辨率
 * @param {string} aspectRatio 比例，如 '3:4', '3:5', '9:16', '1:1'
 * @param {string} [modelName] 模型名称，用于兼容 DALL-E-3 等严格限制尺寸的模型
 * @returns {string}
 */
export function resolveCardImageDimensions(aspectRatio = '3:4', modelName = '') {
  const isDallE3 = typeof modelName === 'string' && /dall-e-3/i.test(modelName);

  if (isDallE3) {
    if (aspectRatio === '1:1') return '1024x1024';
    return '1024x1792'; // DALL-E-3 竖屏标准分辨率
  }

  switch (aspectRatio) {
    case '1:1':
      return '1024x1024';
    case '9:16':
      return '1024x1792';
    case '3:5':
      return '864x1440';
    case '3:4':
    default:
      return '768x1024';
  }
}

/**
 * 请求生图 API 并返回 Base64 格式的 Data URL
 * @param {object} options
 * @param {import('../project-types.js').AiProviderLike} options.provider
 * @param {string} options.prompt
 * @param {string} [options.aspectRatio='3:4']
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [options.requestUrl]
/**
 * 获取环境安全的 window 定时器函数
 */
function getWindowTimers() {
  const win = getActiveWindowValue('window') || (typeof window !== 'undefined' ? window : null);
  const setTimeoutFn = win && typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : setTimeout;
  const clearTimeoutFn = win && typeof win.clearTimeout === 'function' ? win.clearTimeout.bind(win) : clearTimeout;
  return { setTimeoutFn, clearTimeoutFn };
}

/**
 * 为异步 Promise 附加 AbortSignal 监听
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal | undefined} signal
 * @param {string} [errorMsg]
 * @returns {Promise<T>}
 */
function withAbortSignal(promise, signal, errorMsg = '生图任务已被取消') {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error(errorMsg));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error(errorMsg));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

/**
 * 构造统一的 Signal 控制器与超时管理
 */
function setupSignalTimeout(externalSignal, timeoutMs, timeoutMsg, cancelMsg) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const { setTimeoutFn, clearTimeoutFn } = getWindowTimers();
  let externalListener = null;
  if (externalSignal && controller) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalListener = () => controller.abort();
      externalSignal.addEventListener('abort', externalListener, { once: true });
    }
  }
  let isTimedOut = false;
  let timer = null;
  if (controller && timeoutMs > 0) {
    timer = setTimeoutFn(() => { isTimedOut = true; controller.abort(); }, timeoutMs);
  }
  return {
    signal: controller ? controller.signal : (externalSignal || undefined),
    cleanup: () => {
      if (timer) clearTimeoutFn(timer);
      if (externalSignal && externalListener) externalSignal.removeEventListener('abort', externalListener);
    },
    checkError: (err) => {
      if (isTimedOut) throw new Error(timeoutMsg);
      if (controller?.signal?.aborted || externalSignal?.aborted) throw new Error(cancelMsg);
      throw err;
    },
  };
}

/**
 * 统一网络请求封装
 * @param {object} options
 * @param {string} options.url
 * @param {string} [options.method='POST']
 * @param {Record<string, string>} [options.headers]
 * @param {unknown} [options.body]
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [options.requestUrlFn]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ status: number, text: string, json: unknown, headers: Record<string, string> }>}
 */
async function performHttpRequest(options) {
  const { url, method = 'POST', headers = {}, body = null, requestUrlFn, signal } = options;
  if (signal?.aborted) throw new Error('生图任务已被取消');

  if (typeof requestUrlFn === 'function') {
    try {
      const fetchPromise = requestUrlFn({
        url,
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        throw: false,
      });
      const resp = await withAbortSignal(fetchPromise, signal, '生图任务已被取消');
      const typed = /** @type {{ status?: number, text?: string, json?: unknown, headers?: Record<string, string> }} */ (resp);
      return {
        status: typed?.status || 0,
        text: typeof typed?.text === 'string' ? typed.text : '',
        json: typed?.json || null,
        headers: typed?.headers || {},
      };
    } catch (networkErr) {
      if (signal?.aborted) throw new Error('生图任务已被取消');
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new Error(`网络请求失败: ${msg}`);
    }
  }

  throw new Error('当前环境缺少 requestUrl，无法发起网络请求');
}

/**
 * 下载远程图片并转为 Base64 Data URL
 * @param {string} url
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [requestUrlFn]
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
async function downloadImageAsBase64(url, requestUrlFn, signal) {
  if (signal?.aborted) throw new Error('生图任务已被取消');

  if (typeof requestUrlFn === 'function') {
    try {
      const fetchPromise = requestUrlFn({ url, method: 'GET', throw: false });
      const imageRes = await withAbortSignal(fetchPromise, signal, '生图任务已被取消');
      const imgObj = /** @type {{ status?: number, arrayBuffer?: ArrayBuffer }} */ (imageRes);
      if (imgObj?.arrayBuffer) {
        return `data:image/png;base64,${bufferToBase64(imgObj.arrayBuffer)}`;
      }
    } catch (downloadErr) {
      if (signal?.aborted) throw new Error('生图任务已被取消');
      throw downloadErr;
    }
  }
  throw new Error('无法下载生成的图片内容');
}

/**
 * 深度嗅探响应中的异步任务凭证与状态
 * @param {unknown} data
 * @returns {{ taskId: string, status: string, pollingUrl: string | null } | null}
 */
function findTaskTokenAndStatus(data) {
  if (!data || typeof data !== 'object') return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findTaskTokenAndStatus(item);
      if (found) return found;
    }
    return null;
  }

  const rec = /** @type {Record<string, any>} */ (data);

  const directId = rec.task_id || rec.taskId || (rec.id && typeof rec.id === 'string' && rec.id.startsWith('task_') ? rec.id : null);
  const directStatus = String(rec.status || rec.task_status || '').toLowerCase();
  const pollingUrl = rec.task_url || rec.status_url || rec.polling_url || null;

  if (directId) {
    return {
      taskId: String(directId),
      status: directStatus || 'submitted',
      pollingUrl: typeof pollingUrl === 'string' ? pollingUrl : null,
    };
  }

  if (rec.output && typeof rec.output === 'object') {
    const outId = rec.output.task_id || rec.output.taskId || rec.output.id;
    if (outId) {
      return {
        taskId: String(outId),
        status: String(rec.output.task_status || rec.output.status || 'submitted').toLowerCase(),
        pollingUrl: typeof rec.output.task_url === 'string' ? rec.output.task_url : null,
      };
    }
  }

  if (rec.data && typeof rec.data === 'object') {
    const nested = findTaskTokenAndStatus(rec.data);
    if (nested) return nested;
  }

  return null;
}

/**
 * 从已完成的任务结果对象中提取图片 URL 或 Base64
 * @param {unknown} source
 * @returns {string | null}
 */
function extractImageUrlFromTaskResult(source) {
  if (!source || typeof source !== 'object') return null;
  const rec = /** @type {Record<string, any>} */ (source);
  const result = rec.result || rec;

  if (Array.isArray(result.images) && result.images.length > 0) {
    const firstImg = result.images[0];
    if (Array.isArray(firstImg.url) && firstImg.url.length > 0) {
      return String(firstImg.url[0]);
    }
    if (typeof firstImg.url === 'string' && firstImg.url) {
      return firstImg.url;
    }
  }

  const results = result.output?.results || result.results;
  if (Array.isArray(results) && results.length > 0) {
    if (results[0].url && typeof results[0].url === 'string') {
      return String(results[0].url);
    }
    if (results[0].b64_image && typeof results[0].b64_image === 'string') {
      return `data:image/png;base64,${results[0].b64_image}`;
    }
  }

  if (Array.isArray(result.data) && result.data.length > 0) {
    if (result.data[0].url && typeof result.data[0].url === 'string') {
      return String(result.data[0].url);
    }
    if (result.data[0].b64_json && typeof result.data[0].b64_json === 'string') {
      return `data:image/png;base64,${result.data[0].b64_json}`;
    }
  }

  if (typeof result.url === 'string' && result.url) return result.url;
  if (typeof rec.url === 'string' && rec.url) return rec.url;

  return null;
}

/**
 * 校验并构造同源安全的异步任务轮询地址，防范 API Key 外泄到第三方域名
 * @param {string | null | undefined} rawPollingUrl API 返回的 task_url / status_url
 * @param {string} baseUrl 用户配置的 Provider Base URL
 * @param {string} [taskId] 任务 ID
 * @returns {string} 验证通过的完整 URL
 */
export function resolveSafePollingUrl(rawPollingUrl, baseUrl, taskId = '') {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('缺少有效的 Provider Base URL，无法验证轮询地址安全性');
  }

  let baseParsed;
  try {
    baseParsed = new URL(baseUrl);
  } catch {
    throw new Error(`Provider Base URL 格式无效: ${baseUrl}`);
  }

  const trimmedRaw = typeof rawPollingUrl === 'string' ? rawPollingUrl.trim() : '';

  // 若未指定 pollingUrl，基于 baseUrl 拼接默认 tasks 路径
  if (!trimmedRaw) {
    if (!taskId) {
      throw new Error('缺少任务 ID，无法构建默认任务轮询地址');
    }
    return `${baseUrl.replace(/\/+$/, '')}/tasks/${encodeURIComponent(taskId)}`;
  }

  let resolvedParsed;
  try {
    resolvedParsed = new URL(trimmedRaw, baseParsed);
  } catch {
    throw new Error(`生图任务轮询地址格式无效: ${trimmedRaw}`);
  }

  // 严格比对协议与主机（origin）
  if (resolvedParsed.origin.toLowerCase() !== baseParsed.origin.toLowerCase()) {
    throw new Error(`生图任务轮询地址域名 (${resolvedParsed.origin}) 与配置的 Provider (${baseParsed.origin}) 不一致，已拦截请求以防 API Key 泄露`);
  }

  return resolvedParsed.href;
}

/**
 * 轮询异步生图任务状态直到完成
 * @param {object} options
 * @param {string} options.pollingUrl
 * @param {string} options.apiKey
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [options.requestUrlFn]
 * @param {number} [options.timeoutMs=90000]
 * @param {number} [options.intervalMs=2500]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>}
 */
async function pollImageGenerationTask(options) {
  const {
    pollingUrl,
    apiKey,
    requestUrlFn,
    timeoutMs = 90000,
    intervalMs = 2500,
    signal,
  } = options;

  const { setTimeoutFn } = getWindowTimers();
  const startTime = Date.now();
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (Date.now() - startTime < timeoutMs) {
    if (signal?.aborted) {
      throw new Error('生图任务已被取消');
    }

    await new Promise((resolve) => {
      setTimeoutFn(resolve, intervalMs);
    });

    let taskResp;
    try {
      taskResp = await performHttpRequest({
        url: pollingUrl,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        requestUrlFn,
        signal,
      });
      consecutiveErrors = 0;
    } catch (netErr) {
      if (signal?.aborted) throw new Error('生图任务已被取消');
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        const msg = netErr instanceof Error ? netErr.message : String(netErr);
        throw new Error(`轮询任务状态网络异常: ${msg}`);
      }
      continue;
    }

    const status = taskResp.status;
    if (status === 401 || status === 403) {
      throw new Error(`查询任务状态鉴权失败 (${status})`);
    }
    if (status === 429) {
      throw new Error('生图任务请求超限或配额不足 (HTTP 429)，已终止轮询');
    }
    if (status >= 500) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw new Error(`生图服务端持续返回异常 (${status})`);
      }
      continue;
    }

    const taskJson = /** @type {Record<string, any>} */ (taskResp.json || {});
    const taskData = taskJson.data || taskJson;
    const taskStatus = String(taskData?.status || taskJson?.status || '').toLowerCase();

    if (taskStatus === 'completed' || taskStatus === 'succeeded' || taskStatus === 'success') {
      const imageUrl = extractImageUrlFromTaskResult(taskData || taskJson);
      if (!imageUrl) {
        throw new Error('生图任务已完成，但未解析到图片 URL');
      }
      if (imageUrl.startsWith('data:')) {
        return imageUrl;
      }
      try {
        return await downloadImageAsBase64(imageUrl, requestUrlFn, signal);
      } catch (downloadErr) {
        if (signal?.aborted) throw new Error('生图任务已被取消');
        const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
        throw new Error(`生图完成但下载图片失败: ${msg}`);
      }
    }

    if (taskStatus === 'failed' || taskStatus === 'error') {
      const errMsg = taskData?.error?.message || taskJson?.error?.message || taskData?.message || '生成失败';
      throw new Error(`生图任务失败: ${errMsg}`);
    }
  }

  throw new Error(`生图任务处理超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请稍后重试`);
}

/**
 * 请求生图 API 并返回 Base64 格式的 Data URL
 * @param {object} options
 * @param {import('../project-types.js').AiProviderLike} options.provider
 * @param {string} options.prompt
 * @param {string} [options.aspectRatio='3:4']
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [options.requestUrl]
 * @param {number} [options.timeoutMs=90000]
 * @param {number} [options.pollIntervalMs=2500]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<string>} 返回 `data:image/png;base64,...`
 */
export async function generateCardCoverImage(options) {
  const {
    provider,
    prompt,
    aspectRatio = '3:4',
    requestUrl: injectedRequestUrl = null,
    timeoutMs = 90000,
    pollIntervalMs = 2500,
    signal: externalSignal = null,
  } = options || {};

  if (!provider) {
    throw new Error('未配置生图 AI Provider，请前往插件设置【AI 服务】进行配置');
  }
  if (!provider.baseUrl || !provider.apiKey) {
    throw new Error('生图 AI Provider 缺少 Base URL 或 API Key，请检查配置');
  }
  const imageModel = provider.imageModel || provider.model;
  if (!imageModel) {
    throw new Error('生图 AI Provider 缺少生图模型名称（如 FLUX.1-schnell 或 dall-e-3）');
  }
  if (!prompt || !prompt.trim()) {
    throw new Error('生图提示词不能为空');
  }

  const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/images/generations`;
  const size = resolveCardImageDimensions(aspectRatio, imageModel);

  const requestUrlFn = typeof injectedRequestUrl === 'function'
    ? injectedRequestUrl
    : getObsidianRequestUrl();

  const { signal: effectiveSignal, cleanup, checkError } = setupSignalTimeout(
    externalSignal,
    timeoutMs,
    `生图任务处理超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请稍后重试`,
    '生图任务已被取消',
  );

  try {
    if (effectiveSignal?.aborted) {
      throw new Error('生图任务已被取消');
    }

    const payload = {
      model: imageModel,
      prompt: prompt.trim(),
      n: 1,
      size,
      response_format: 'b64_json',
    };

    let resp = await performHttpRequest({
      url: endpoint,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
      requestUrlFn,
      signal: effectiveSignal,
    });

    if (resp.status === 400 && !effectiveSignal?.aborted) {
      const respJsonForRetry = /** @type {Record<string, any>} */ (resp.json || {});
      const respErrorStr = `${respJsonForRetry?.error?.message || ''} ${resp.text || ''}`.toLowerCase();
      const isParamOrDimensionError = respErrorStr.includes('size')
        || respErrorStr.includes('dimension')
        || respErrorStr.includes('resolution')
        || respErrorStr.includes('format')
        || respErrorStr.includes('parameter');
      const isAlreadyFallbackSize = size === (aspectRatio || '3:4');
      if (isParamOrDimensionError && !isAlreadyFallbackSize) {
        const fallbackPayload = {
          model: imageModel,
          prompt: prompt.trim(),
          n: 1,
          size: aspectRatio || '3:4',
        };
        try {
          const fallbackResp = await performHttpRequest({
            url: endpoint,
            method: 'POST',
            headers: {
              Authorization: `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: fallbackPayload,
            requestUrlFn,
            signal: effectiveSignal,
          });
          if (fallbackResp.status < 400) {
            resp = fallbackResp;
          }
        } catch {
          // 保持原 400 resp 供报错处理
        }
      }
    }

    const respJson = /** @type {Record<string, any>} */ (resp.json || {});
    const status = resp.status;

    if (status === 429) {
      throw new Error('生图服务请求频率超限或配额耗尽 (HTTP 429)，请检查账号额度');
    }

    if (status >= 400 || (status === 0 && !resp.json)) {
      const errorMsg = respJson?.error?.message || resp.text || `HTTP 错误状态码 ${status}`;
      throw new Error(`生图服务返回失败 (${status}): ${errorMsg}`);
    }

    const dataList = respJson.data;
    if (Array.isArray(dataList) && dataList.length > 0) {
      const firstItem = dataList[0];
      if (firstItem.b64_json && typeof firstItem.b64_json === 'string') {
        const b64 = firstItem.b64_json.trim();
        return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
      }
      if (firstItem.url && typeof firstItem.url === 'string') {
        try {
          return await downloadImageAsBase64(firstItem.url, requestUrlFn, effectiveSignal);
        } catch (downloadErr) {
          if (effectiveSignal?.aborted) throw new Error('生图任务已被取消');
          const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
          throw new Error(`生图完成但下载图片失败: ${msg}`);
        }
      }
    }

    const taskTokenInfo = findTaskTokenAndStatus(respJson);
    if (taskTokenInfo && taskTokenInfo.taskId) {
      const pollingUrl = resolveSafePollingUrl(taskTokenInfo.pollingUrl, provider.baseUrl, taskTokenInfo.taskId);
      return await pollImageGenerationTask({
        pollingUrl,
        apiKey: provider.apiKey,
        requestUrlFn,
        timeoutMs,
        intervalMs: pollIntervalMs,
        signal: effectiveSignal,
      });
    }

    throw new Error('生图 API 未返回有效的图片数据（无 b64_json 或 url）');
  } catch (err) {
    checkError(err);
  } finally {
    cleanup();
  }
}

/**
 * 使用配置的文本 AI Provider 智能提炼文章视觉核心观点
 * @param {object} options
 * @param {any} options.provider 文本 AI Provider
 * @param {string} options.title 文章标题
 * @param {string} options.content 文章正文或摘要内容
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [options.requestUrlFn]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs=30000]
 * @returns {Promise<string>}
 */
export async function extractVisualTopicWithAi(options) {
  const {
    provider,
    title = '',
    content = '',
    requestUrlFn: injectedRequestUrl = null,
    signal: externalSignal = null,
    timeoutMs = 30000,
  } = options || {};

  if (!provider || !provider.baseUrl || !provider.apiKey) {
    throw new Error('未配置可用的文本 AI Provider，请检查【AI 服务】设置');
  }

  const textModel = provider.textModel || provider.model || 'gpt-4o-mini';
  const requestUrlFn = typeof injectedRequestUrl === 'function' ? injectedRequestUrl : getObsidianRequestUrl();
  const cleanContent = String(content || '').slice(0, 2500);

  const systemPrompt = '你是一位视觉设计与小红书封面策划专家。请根据用户提供的文章标题和内容，提炼出最核心、最具画面感的一句话视觉主题意象。要求：20字以内，语言生动形象，适合交给生图模型绘制，直接输出该短句，不要输出任何引言、解释、标点或序号。';
  const userPrompt = `文章标题：${title || '无标题'}\n\n文章内容摘要：${cleanContent}`;

  const payload = {
    model: textModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    stream: false,
  };

  const { signal: effectiveSignal, cleanup, checkError } = setupSignalTimeout(
    externalSignal,
    timeoutMs,
    `AI 提炼观点超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请稍后重试`,
    '提炼观点任务已被取消',
  );

  try {
    if (effectiveSignal?.aborted) {
      throw new Error('提炼观点任务已被取消');
    }

    const resp = await performHttpRequest({
      url: `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: payload,
      requestUrlFn,
      signal: effectiveSignal,
    });

    const respJson = /** @type {Record<string, any>} */ (resp.json || {});
    if (resp.status === 429) {
      throw new Error('文本 AI 服务请求频率超限或配额耗尽 (HTTP 429)');
    }
    if (resp.status >= 400) {
      const msg = respJson?.error?.message || resp.text || `HTTP ${resp.status}`;
      throw new Error(`AI 提炼失败: ${msg}`);
    }

    const choice = respJson.choices?.[0];
    const text = choice?.message?.content || choice?.delta?.content || '';
    const trimmed = String(text || '').replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '').trim();
    if (!trimmed) {
      throw new Error('AI 未返回有效提炼内容');
    }
    return trimmed;
  } catch (err) {
    checkError(err);
  } finally {
    cleanup();
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- reason: close the scoped disable block above */
