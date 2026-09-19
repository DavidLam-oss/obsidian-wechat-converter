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
      '3D clay render style, soft rounded shapes, vibrant pastel colors, tactile matte texture, miniature isometric scene illustrating {title}, cute playful aesthetic, studio lighting, C4D octane render style, clean background, high detail, no text',
  },
  {
    id: 'minimal-vector',
    name: '扁平矢量插画',
    description: '清晰线条、现代扁平几何图形与优雅留白',
    promptTemplate:
      'Flat vector illustration, clean lines, minimalist modern graphic design, solid bold shapes, harmonious color palette, editorial style metaphor for {title}, white space, elegant composition, high resolution, vector graphics, no text',
  },
  {
    id: 'cyberpunk-tech',
    name: '未来科技赛博',
    description: '黑曜底色、霓虹青紫辉光与全息科技几何',
    promptTemplate:
      'Futuristic cyberpunk aesthetic, glowing neon cyan and magenta accents, holographic geometric elements, dark obsidian background, high-tech interface concept representing {title}, cinematic lighting, 8k render, unreal engine 5, detailed, no text',
  },
  {
    id: 'warm-healing',
    name: '温暖治愈手绘',
    description: '温馨水彩/水粉手绘质感与故事感意境',
    promptTemplate:
      'Warm healing gouache illustration, hand-painted texture, cozy atmospheric lighting, soft pastel hues, comforting gentle metaphor for {title}, artistic storytelling, delicate brushstrokes, aesthetic wallpaper quality, no text',
  },
  {
    id: 'editorial-magazine',
    name: '新潮杂志封面',
    description: '先锋艺术构图、大色块撞色与杂志海报视觉',
    promptTemplate:
      'Contemporary editorial magazine cover background, bold modern abstract composition, sophisticated color blocking, high fashion elegance, conceptual visual metaphor representing {title}, museum poster quality, sleek clean aesthetic, no text',
  },
  {
    id: 'custom',
    name: '自定义 Prompt',
    description: '完全由用户编写提示词，支持 {title} / {excerpt} 变量',
    promptTemplate: '{title}',
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
    template = (customPrompt && customPrompt.trim()) ? customPrompt.trim() : '{title}';
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

  return template
    .replace(/\{title\}/g, safeTitle)
    .replace(/\{excerpt\}/g, safeExcerpt)
    .replace(/\{topic\}/g, safeTopic)
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

  const payload = {
    model: imageModel,
    prompt: prompt.trim(),
    n: 1,
    size,
    response_format: 'b64_json',
  };

  /** @type {unknown} */
  let rawResponse;

  if (typeof requestUrlFn === 'function') {
    try {
      rawResponse = await requestUrlFn({
        url: endpoint,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        throw: false,
      });
    } catch (networkErr) {
      const errMessage = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new Error(`请求生图 API 网络错误: ${errMessage}`);
    }
  } else if (typeof fetch === 'function') {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      });
      const text = await res.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = {};
      }
      rawResponse = {
        status: res.status,
        text,
        json,
      };
    } catch (fetchErr) {
      const errMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      throw new Error(`生图请求异常: ${errMessage}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } else {
    throw new Error('当前环境缺少 requestUrl 与 fetch，无法发起生图请求');
  }

  const resp = /** @type {{ status?: number, text?: string, json?: { data?: Array<{ b64_json?: string, url?: string }>, error?: { message?: string } } }} */ (rawResponse);
  const status = resp?.status || 0;

  if (status >= 400 || (status === 0 && !resp?.json?.data)) {
    const errorMsg = resp?.json?.error?.message || resp?.text || `HTTP 错误状态码 ${status}`;
    throw new Error(`生图服务返回失败 (${status}): ${errorMsg}`);
  }

  const dataList = resp?.json?.data;
  if (!Array.isArray(dataList) || dataList.length === 0) {
    throw new Error('生图服务未返回有效的图片列表');
  }

  const firstItem = dataList[0];

  // 优先返回 Base64 格式
  if (firstItem.b64_json && typeof firstItem.b64_json === 'string') {
    const b64 = firstItem.b64_json.trim();
    return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  }

  // 若返回远程 URL，使用 requestUrl 立即拉取并内联为 Base64，防止外部 URL 失效及跨域导出失败
  if (firstItem.url && typeof firstItem.url === 'string') {
    const remoteUrl = firstItem.url;
    try {
      if (typeof requestUrlFn === 'function') {
        const imageRes = await requestUrlFn({
          url: remoteUrl,
          method: 'GET',
          throw: false,
        });
        const imgObj = /** @type {{ status?: number, arrayBuffer?: ArrayBuffer }} */ (imageRes);
        if (imgObj?.arrayBuffer) {
          const b64 = bufferToBase64(imgObj.arrayBuffer);
          return `data:image/png;base64,${b64}`;
        }
      } else if (typeof fetch === 'function') {
        const imgRes = await fetch(remoteUrl);
        const buf = await imgRes.arrayBuffer();
        const b64 = bufferToBase64(buf);
        return `data:image/png;base64,${b64}`;
      }
    } catch (downloadErr) {
      const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
      throw new Error(`生图完成但下载图片失败: ${msg}`);
    }
  }

  throw new Error('生图 API 未返回有效的图片数据（无 b64_json 或 url）');
}
