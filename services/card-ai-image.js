/*
## 核心功能

实现小红书卡片导出（Image Card）的 AI 封面图片生成服务。
对接 OpenAI 兼容格式的生图 API（`/images/generations`），提供预设风格模版、动态 Prompt 变量替换、比例适配以及自动将远程 URL 转换为 Base64 内联格式。

## 输入

- `provider`: 符合 `AiProviderLike` 契约的对象（包含 `baseUrl`, `apiKey`, `imageModel`, `kind`）。
- `prompt`: 生图提示词或模版。
- `aspectRatio`: 比例规格（如 `'3:4'`, `'3:5'`, `'9:16'`, `'1:1'`）。
- `articleMeta`: 文章元数据（`title`, `excerpt`, `topic` 等）。

## 输出

- `AI_CARD_COVER_STYLES`: 内置生图风格模版列表。
- `resolveCardCoverPrompt()`: 提示词变量解析与填充函数。
- `resolveCardImageDimensions()`: 比例到 API 像素分辨率映射函数。
- `generateCardCoverImage()`: 核心生图请求函数，返回 `data:image/png;base64,...` 字符串。

## 定位

位于 `services/`，属于纯服务层无状态模块；不包含 UI 状态或 DOM 操作。

## 依赖

- `./obsidian-compat.js`（`getObsidianRequestUrl`）。
- `./dom-utils.js`（`getActiveWindowValue`）。
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
    name: '3D 粘土质感',
    description: '立体软萌、微缩景观、黏土材质与柔和棚拍光',
    promptTemplate:
      '3D clay render style, soft rounded shapes, vibrant pastel colors, tactile matte texture, miniature isometric scene illustrating {title}, visual metaphor for {topic}, cute playful aesthetic, studio lighting, C4D octane render style, clean background, high detail, no text',
  },
  {
    id: 'minimal-vector',
    name: '扁平矢量插画',
    description: '清晰线条、现代扁平几何图形与优雅留白',
    promptTemplate:
      'Flat vector illustration, clean lines, minimalist modern graphic design, solid bold shapes, harmonious color palette, editorial visual metaphor for {title} ({topic}), white space, elegant composition, high resolution, vector graphics, no text',
  },
  {
    id: 'cyberpunk-tech',
    name: '未来科技赛博',
    description: '黑曜底色、霓虹青紫辉光与全息科技几何',
    promptTemplate:
      'Futuristic cyberpunk aesthetic, glowing neon cyan and magenta accents, holographic geometric elements, dark obsidian background, high-tech interface concept representing {title}: {topic}, cinematic lighting, 8k render, unreal engine 5, detailed, no text',
  },
  {
    id: 'warm-healing',
    name: '温暖治愈手绘',
    description: '温馨水彩/水粉手绘质感与故事感意境',
    promptTemplate:
      'Warm healing gouache illustration, hand-painted texture, cozy atmospheric lighting, soft pastel hues, comforting gentle storytelling for {title}, conveying {topic}, artistic brushstrokes, aesthetic wallpaper quality, no text',
  },
  {
    id: 'editorial-magazine',
    name: '新潮杂志封面',
    description: '先锋艺术构图、大色块撞色与杂志海报视觉',
    promptTemplate:
      'Contemporary editorial magazine cover background, bold modern abstract composition, sophisticated color blocking, high fashion elegance, conceptual visual metaphor representing {title} and {topic}, museum poster quality, sleek clean aesthetic, no text',
  },
  {
    id: 'custom',
    name: '自定义 Prompt',
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
  const effectiveTopic = safeTopic || safeExcerpt || safeTitle;

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

  if (typeof requestUrlFn === 'function') {
    try {
      const resp = await requestUrlFn({
        url,
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        throw: false,
      });
      const typed = /** @type {{ status?: number, text?: string, json?: unknown, headers?: Record<string, string> }} */ (resp);
      return {
        status: typed?.status || 0,
        text: typeof typed?.text === 'string' ? typed.text : '',
        json: typed?.json || null,
        headers: typed?.headers || {},
      };
    } catch (networkErr) {
      const errMessage = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new Error(`网络请求失败: ${errMessage}`);
    }
  }

  if (typeof fetch === 'function') {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    /** @type {Record<string, string>} */
    const headersMap = {};
    if (res.headers && typeof res.headers.forEach === 'function') {
      res.headers.forEach((v, k) => { headersMap[k] = v; });
    }
    return {
      status: res.status,
      text,
      json,
      headers: headersMap,
    };
  }

  throw new Error('当前环境缺少 requestUrl 与 fetch，无法发起网络请求');
}

/**
 * 下载远程图片并转为 Base64 Data URL
 * @param {string} url
 * @param {((options: Record<string, unknown>) => Promise<unknown>) | null} [requestUrlFn]
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
async function downloadImageAsBase64(url, requestUrlFn, signal) {
  if (typeof requestUrlFn === 'function') {
    const imageRes = await requestUrlFn({
      url,
      method: 'GET',
      throw: false,
    });
    const imgObj = /** @type {{ status?: number, arrayBuffer?: ArrayBuffer }} */ (imageRes);
    if (imgObj?.arrayBuffer) {
      const b64 = bufferToBase64(imgObj.arrayBuffer);
      return `data:image/png;base64,${b64}`;
    }
  } else if (typeof fetch === 'function') {
    const imgRes = await fetch(url, { signal });
    const buf = await imgRes.arrayBuffer();
    const b64 = bufferToBase64(buf);
    return `data:image/png;base64,${b64}`;
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

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const { setTimeoutFn, clearTimeoutFn } = getWindowTimers();
  const timer = controller ? setTimeoutFn(() => controller.abort(), timeoutMs) : null;

  try {
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
      signal: controller ? controller.signal : undefined,
    });

    if (resp.status === 400) {
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
          signal: controller ? controller.signal : undefined,
        });
        if (fallbackResp.status < 400) {
          resp = fallbackResp;
        }
      } catch {
        // 保持原 400 resp 供报错处理
      }
    }

    const respJson = /** @type {Record<string, any>} */ (resp.json || {});
    const status = resp.status;

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
          return await downloadImageAsBase64(firstItem.url, requestUrlFn, controller ? controller.signal : undefined);
        } catch (downloadErr) {
          const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
          throw new Error(`生图完成但下载图片失败: ${msg}`);
        }
      }
    }

    const taskTokenInfo = findTaskTokenAndStatus(respJson);
    if (taskTokenInfo && taskTokenInfo.taskId) {
      const pollingUrl = taskTokenInfo.pollingUrl || `${provider.baseUrl.replace(/\/+$/, '')}/tasks/${encodeURIComponent(taskTokenInfo.taskId)}`;
      return await pollImageGenerationTask({
        pollingUrl,
        apiKey: provider.apiKey,
        requestUrlFn,
        timeoutMs,
        intervalMs: pollIntervalMs,
        signal: controller ? controller.signal : undefined,
      });
    }

    throw new Error('生图 API 未返回有效的图片数据（无 b64_json 或 url）');
  } finally {
    if (timer) clearTimeoutFn(timer);
  }
}
