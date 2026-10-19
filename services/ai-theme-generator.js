/*
## 核心功能

调用已配置的 AI 文本模型（OpenAI 兼容协议、Gemini、Anthropic 等），根据用户个性化设计诉求，
自动生成合法的 CustomThemeToken，并返回经过校验规范化的 JSON 字符串与 Token 结构。

## 输入

- `options`:
  - `aiSettings`: 插件配置中的 `settings.ai`
  - `userRequirement`: 用户输入的排版诉求（如：“偏暖的秋日森林系，主色用琥珀黄”）
  - `providerId` (可选): 指定要使用的 AI provider ID
  - `fetchImpl` (可选): fetch 注入，默认取 getDefaultFetch()
  - `timeoutMs` (可选): 超时时间，默认 45000ms

## 输出

- 返回 `Promise<{ success: boolean, token?: import('./theme-token-validator.js').CustomThemeToken, json?: string, error?: string }>`

## 定位

位于 services/，业务服务层，无 DOM 宿主依赖，可在 Node 环境下独立单测。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- reason: LLM network responses and JSON payloads are untrusted and heterogeneous */

import {
  AI_PROVIDER_KINDS,
  resolveAiProvider,
  listTextAiProviders,
  readChatCompletionContent,
  readGeminiContent,
  readAnthropicContent,
  extractJsonPayload,
  getDefaultFetch,
  setAiLayoutTimeout,
  clearAiLayoutTimeout,
} from './ai-layout/index.js';
import {
  AI_THEME_PROMPT_TEMPLATE,
  validateCustomThemeToken,
  normalizeCustomThemeToken,
} from './theme-token-validator.js';

const DEFAULT_TIMEOUT_MS = 45000;

export const AI_THEME_SYSTEM_PROMPT = `你是一个专业的微信公众号排版设计专家与视觉色彩搭配大师。
请根据用户的风格诉求，为用户设计一套优雅、克制、耐看且在微信生态内具有极高排版兼容性的文章主题配置。

【极其重要的输出要求】：
1. 必须输出且仅输出一个合法的 JSON 对象，不要包含任何前导问候、解释说明或结束语。
2. 严禁使用任何微信不支持的复杂 CSS，所有色值必须是有效的 3 位或 6 位 Hex 颜色值（如 #007AFF 或 #111）。
3. 必须包含如下规范字段：
   - "schemaVersion": 1
   - "id": 英文小写连字符命名（如 "autumn-forest"）
   - "name": 主题中文名称（如 "秋日森林"）
   - "description": 主题设计理念与适用文风简述
   - "headingStyle": "default" | "serial-number" | "badge" | "zen"（必须根据主题文风场景精准挑选，切忌全部盲目设为 zen）：
     * "serial-number"：醒目大数字序号（34px 现代科技双位数 01、02 分节），极力推荐用于科技数码、代码教程、方法论、步骤清单与硬核评测；
     * "badge"：精致胶囊徽标（主色圆角徽章标签），极力推荐用于商业财经、深度专栏、新闻资讯与行业周刊；
     * "default"：经典极简边框（无多余修饰条），推荐用于通用科普、生活方式、日常记叙与轻量阅读；
     * "zen"：留白禅意（居中 PART 01 纤细线），仅适合东方美学、哲学思辨、文艺散文与诗歌随笔。
   - "colors": 包含 "accent"（必填主色调）、"light"（浅色背景）、"highlight"（金句高亮底色）、"title"（大标题字色）、"text"（正文字色，推荐 #222222~#333333）、"muted"（辅助弱化字色，推荐 #888888~#999999）、"border"（边框与分割线色）
   - "typography": "fontPreset" ("sans-serif" | "serif" | "monospace")、"baseFontSize" (14~18)、"lineHeight" (1.6~2.0)、"paragraphGap" (12~24)
   - "footer": "showEngagementCard": true, "ctaText": "..."
`;

/**
 * 组装发送给 AI 的完整提示词
 * @param {string} userRequirement
 * @returns {string}
 */
export function buildThemePromptWithRequirement(userRequirement = '') {
  const req = String(userRequirement || '').trim();
  const reqText = req
    ? `【用户具体风格诉求】：\n${req}`
    : '【用户风格诉求】：\n请自由设计一套优雅克制、具有鲜明行业场景辨识度的排版主题（如科技数码、现代商业、清新生活、或深度人文等，根据你构思的主题定位自由发挥，展现丰富的版式与色彩搭配）。';

  return `${reqText}\n\n请严格依据上述诉求生成纯 JSON，格式参考规范如下：\n${AI_THEME_PROMPT_TEMPLATE}`;
}

/**
 * 检查当前是否有可用的 AI 文本模型
 * @param {unknown} aiSettings
 * @returns {boolean}
 */
export function hasRunnableTextProvider(aiSettings) {
  const providers = listTextAiProviders(/** @type {any} */ (aiSettings));
  return providers.length > 0;
}

/**
 * 调用已配置的 AI 文本模型自动生成排版主题
 *
 * @param {{
 *   aiSettings: unknown,
 *   userRequirement?: string,
 *   providerId?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{
 *   success: boolean,
 *   token?: import('./theme-token-validator.js').CustomThemeToken,
 *   json?: string,
 *   error?: string,
 * }>}
 */
export async function generateCustomThemeWithAi({
  aiSettings,
  userRequirement = '',
  providerId = '',
  fetchImpl = getDefaultFetch(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const provider = resolveAiProvider(/** @type {any} */ (aiSettings), providerId);
  if (!provider) {
    return {
      success: false,
      error: '未找到已启用的 AI 文本模型，请先在插件设置中配置 API Key 与模型。',
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      success: false,
      error: '当前运行环境不支持网络请求 (fetch is not available)。',
    };
  }

  const prompt = buildThemePromptWithRequirement(userRequirement);
  const controller = new AbortController();
  const timer = setAiLayoutTimeout(() => controller.abort(), timeoutMs);

  try {
    let content = '';

    switch (provider.kind) {
      case AI_PROVIDER_KINDS.OPENAI_COMPATIBLE: {
        const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model: provider.textModel || provider.model,
            temperature: 0.7,
            messages: [
              { role: 'system', content: AI_THEME_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`AI 请求失败 (${response.status}): ${text || response.statusText}`);
        }

        const data = await response.json();
        content = readChatCompletionContent(data);
        break;
      }

      case AI_PROVIDER_KINDS.GEMINI: {
        const endpoint = `${provider.baseUrl}/models/${encodeURIComponent(provider.textModel || provider.model)}:generateContent`;
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': provider.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: AI_THEME_SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.7,
            },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`AI 请求失败 (${response.status}): ${text || response.statusText}`);
        }

        const data = await response.json();
        content = readGeminiContent(data);
        break;
      }

      case AI_PROVIDER_KINDS.ANTHROPIC: {
        const response = await fetchImpl(`${provider.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.textModel || provider.model,
            system: AI_THEME_SYSTEM_PROMPT,
            messages: [
              { role: 'user', content: prompt },
            ],
            max_tokens: 3000,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`AI 请求失败 (${response.status}): ${text || response.statusText}`);
        }

        const data = await response.json();
        content = readAnthropicContent(data);
        break;
      }

      default:
        throw new Error(`暂不支持的 AI Provider 类型: ${provider.kind}`);
    }

    // 提取并校验 JSON
    let jsonPayload = '';
    try {
      jsonPayload = extractJsonPayload(content);
    } catch {
      throw new Error(`AI 返回的内容未包含合法的 JSON 格式。返回片段: ${content.slice(0, 150)}...`);
    }

    const validation = validateCustomThemeToken(jsonPayload);
    if (!validation.valid || !validation.token) {
      throw new Error(`AI 生成的主题配置校验失败: ${validation.errors.join('; ')}`);
    }

    const normalized = normalizeCustomThemeToken(validation.token);
    const jsonString = JSON.stringify(normalized, null, 2);

    return {
      success: true,
      token: normalized,
      json: jsonString,
    };
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        success: false,
        error: `AI 请求超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请检查网络连接或稍后重试。`,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  } finally {
    clearAiLayoutTimeout(timer);
  }
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment -- reason: close the scoped disable block above */

