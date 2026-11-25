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
  isTemperatureNotSupportedError,
  isKnownReasoningModelName,
} from './ai-layout/index.js';
import {
  AI_THEME_PROMPT_TEMPLATE,
  CURATED_AI_HEADING_ORNAMENTS,
  validateCustomThemeToken,
  normalizeCustomThemeToken,
} from './theme-token-validator.js';

const DEFAULT_TIMEOUT_MS = 45000;

export const AI_THEME_SYSTEM_PROMPT = `你是一个专业的微信公众号视觉排版设计师与前端样式专家。
请根据用户的风格诉求，设计一套优雅、克制、高级且在微信生态内具有极高兼容性的文章主题配置（包含标准 CSS）。

【重要能力与架构说明】：
1. 插件内置 PostCSS 编译器、伪元素预渲染器与 Juice 内联引擎：
   - 你在 \`css\` 字段写的标准 CSS 会自动限定作用域并强制内联到每篇文章对应元素上；
   - 原生支持 \`::before\` / \`::after\` 以及 \`counter-reset\` / \`counter()\`（会被自动转为微信兼容的真实 \`<span>\`）；
   - 你**无需**手写 \`.owc-article-root\` 前缀，**无需**写 \`!important\`，也**无需**写 \`<style>\` 标签。
2. 审美与克制原则：
   - 请通过字体气质（衬线/无衬线/等宽）、字号对比、行高呼吸感、低饱和浅底、克制边框、\`::before\`/\`counter()\` 章节饰条来营造独特质感，避免模板化、廉价堆砌；
   - 支持覆盖的选择器：\`section, h1, h2, h3, h4, p, blockquote, blockquote p, .owc-callout, strong, em, code, hr, ul, ol, li, table, th, td, a\`（代码块已使用独立暗色主题，无需写 \`pre\`）；
   - 若修改正文字号、行高或文字颜色，请同时作用于 \`p, li\`（并建议补充 \`blockquote p { margin: 0; color: inherit; }\` 保持引用内段落紧凑且继承引用色）；
   - 正文文字 \`p, li\` 务必与 \`section\` 底色保持清晰对比度（浅底推荐 #222222~#3A3A3A）；
   - 严禁使用 Emoji、严禁手写 SVG \`customPath\`；
   - 仅当用户明确要求小图标装饰或主题高度契合时，才在可选字段 \`heading.ornament\` 中选用 1 个精选微件（仅限 ${CURATED_AI_HEADING_ORNAMENTS.join(' | ')}），H3/H4 不加图标。
3. 微信安全边界（严禁出现）：
   - 严禁 \`@import\`、\`@font-face\`、外部 \`url(...)\`、\`position: fixed/absolute\`、\`@keyframes\`、JS 事件、负 \`margin\` 横向溢出。

【唯一输出格式】：
只输出一个合法纯 JSON 对象（禁止任何问候语、解说或 Markdown 代码围栏），字段规范：
- "schemaVersion": 1
- "id": 英文小写连字符（如 "editorial-paper"）
- "name": 主题中文名称（2~6 个字）
- "description": 适用场景与设计简述（15~40 字）
- "colors": { "accent": "#RRGGBB"(必填), 可选 "canvas", "light", "title", "text", "muted", "border" }
- "css": 完整、可立即生效的标准微信安全 CSS 字符串
- "heading": 可选，仅在确实需要微件点缀时提供 { "ornament": "..." }
- "footer": { "showEngagementCard": true, "ctaText": "贴合文风的点赞/在看/转发引导语" }

【两套不同风格的 CSS 范例（仅作质感参考，请按用户诉求自由创作）】
范例1（人文刊物风）："css": "section { background: #FCF9F2; counter-reset: h2sec; } p, li { color: #3A332D; font-size: 15.5px; line-height: 1.9; } h1 { font-family: Georgia, 'Songti SC', serif; font-size: 24px; color: #2C241E; text-align: center; padding-bottom: 14px; border-bottom: 1px solid #D9CEBE; } h2 { counter-increment: h2sec; font-family: Georgia, 'Songti SC', serif; font-size: 20px; color: #2C241E; text-align: center; margin: 38px 0 18px; padding-bottom: 10px; border-bottom: 1px solid #8C5A3C; } h2::before { content: counter(h2sec, decimal-leading-zero) ' · '; color: #8C5A3C; font-size: 13px; letter-spacing: 2px; } h3 { font-size: 17px; color: #2C241E; border-left: 3px solid #8C5A3C; padding-left: 10px; margin: 26px 0 12px; } blockquote { background: #F4EDE2; border-left: 2px solid #8C5A3C; color: #5C5046; padding: 14px 18px; border-radius: 4px; } blockquote p { margin: 0; color: inherit; } strong { color: #8C5A3C; } hr { border: none; border-top: 1px solid #E5DDD0; margin: 36px auto; width: 48%; }"
范例2（现代简报风）："css": "section { background: #FFFFFF; } p, li { color: #334155; font-size: 15px; line-height: 1.82; } h1 { font-size: 23px; font-weight: 800; color: #0F172A; text-align: left; padding-bottom: 12px; border-bottom: 2px solid #0F172A; } h2 { font-size: 19px; font-weight: 700; color: #0F172A; text-align: left; margin: 34px 0 16px; padding: 8px 14px; background: linear-gradient(90deg, rgba(29, 78, 216, 0.08), rgba(29, 78, 216, 0.01)); border-left: 4px solid #1D4ED8; border-radius: 0 6px 6px 0; } h3 { font-size: 16.5px; font-weight: 700; color: #1E3A8A; margin: 22px 0 10px; } h3::before { content: '// '; color: #1D4ED8; font-weight: 700; } blockquote { background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 3px solid #1D4ED8; padding: 12px 16px; border-radius: 6px; color: #475569; } blockquote p { margin: 0; color: inherit; } strong { color: #0F172A; background: rgba(29, 78, 216, 0.1); padding: 1px 4px; border-radius: 3px; } th { background: #EFF6FF; color: #1E3A8A; }"
`;

/**
 * 组装发送给外部 AI 的完整提示词（包含完整规范说明，供“复制提示词”按钮使用）
 * @param {string} userRequirement
 * @returns {string}
 */
export function buildThemePromptWithRequirement(userRequirement = '') {
  const req = String(userRequirement || '').trim();
  const reqText = req
    ? `【用户具体风格诉求】：\n${req}`
    : '【用户风格诉求】：\n请自由设计一套优雅克制、具有鲜明场景辨识度的公众号排版主题，用字体、留白、色彩对比与 CSS 伪元素章节饰条体现高级感，严禁使用 Emoji 与手写 SVG 路径。';

  return `${reqText}\n\n请严格依据上述诉求生成纯 JSON，格式参考规范如下：\n${AI_THEME_PROMPT_TEMPLATE}`;
}

/**
 * 组装发送给内置 AI 的简洁 User Prompt（避免与 System Prompt 重复堆砌，并支持增量微调）
 * @param {{
 *   userRequirement?: string,
 *   currentTheme?: Record<string, any> | null,
 *   refineInstruction?: string,
 * }} [options]
 * @returns {string}
 */
export function buildAiThemeUserMessage(options = {}) {
  const refine = String(options.refineInstruction || '').trim();
  if (options.currentTheme && refine) {
    const t = options.currentTheme;
    const compactCurrent = JSON.stringify({
      schemaVersion: 1,
      id: t.id,
      name: t.name,
      description: t.description,
      ...(t.author ? { author: t.author } : {}),
      ...(t.headingStyle ? { headingStyle: t.headingStyle } : {}),
      ...(t.h3Style ? { h3Style: t.h3Style } : {}),
      ...(t.h4Style ? { h4Style: t.h4Style } : {}),
      ...(t.blockquote ? { blockquote: t.blockquote } : {}),
      ...(t.blockquoteStyle ? { blockquoteStyle: t.blockquoteStyle } : {}),
      ...(t.strongStyle ? { strongStyle: t.strongStyle } : {}),
      ...(t.typography ? { typography: t.typography } : {}),
      colors: t.colors,
      css: t.css || t.rawCssOverrides || '',
      ...(t.heading ? { heading: t.heading } : {}),
      ...(t.footer ? { footer: t.footer } : {}),
    }, null, 2);
    return `【当前主题配置】：\n${compactCurrent}\n\n【用户微调诉求】：\n${refine}\n\n请基于当前主题配置做精准的局部修改（保留原有 id，除非用户要求重命名），输出修改后的完整合法纯 JSON。`;
  }

  const req = String(options.userRequirement || '').trim();
  if (req) {
    return `【用户具体风格诉求】：\n${req}\n\n请据此设计一套完整且协调的公众号主题（包含 schemaVersion、id、name、description、colors、css、footer），只输出纯 JSON。`;
  }
  return '请自由构思并设计一套优雅克制、有鲜明杂志或现代编辑部质感的公众号排版主题（包含 schemaVersion、id、name、description、colors、css、footer），只输出纯 JSON。';
}

/**
 * @typedef {{
 *   kind: string,
 *   baseUrl: string,
 *   apiKey: string,
 *   textModel?: string,
 *   model?: string,
 * }} AiTextProviderLike
 */

/**
 * 向已解析的文本 AI Provider 发起单次补全请求
 * @param {AiTextProviderLike} provider
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {typeof fetch} fetchImpl
 * @param {AbortSignal} signal
 * @returns {Promise<string>}
 */
async function requestAiThemeCompletion(provider, systemPrompt, userPrompt, fetchImpl, signal) {
  switch (provider.kind) {
    case AI_PROVIDER_KINDS.OPENAI_COMPATIBLE: {
      const textModel = provider.textModel || provider.model;
      const isReasoning = isKnownReasoningModelName(textModel);
      let response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: textModel,
          ...(isReasoning ? {} : { temperature: 0.7 }),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 400 && isTemperatureNotSupportedError(text)) {
          response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
              model: textModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
            }),
            signal,
          });
        }
        if (!response.ok) {
          const retryText = response.status === 400 ? await response.text().catch(() => '') : '';
          throw new Error(`AI 请求失败 (${response.status}): ${retryText || text || response.statusText}`);
        }
      }

      const data = await response.json();
      return readChatCompletionContent(data);
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
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
          },
        }),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI 请求失败 (${response.status}): ${text || response.statusText}`);
      }

      const data = await response.json();
      return readGeminiContent(data);
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
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 3000,
          temperature: 0.7,
        }),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI 请求失败 (${response.status}): ${text || response.statusText}`);
      }

      const data = await response.json();
      return readAnthropicContent(data);
    }

    default:
      throw new Error(`暂不支持的 AI Provider 类型: ${provider.kind}`);
  }
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
 * 调用已配置的 AI 文本模型自动生成或微调排版主题
 *
 * @param {{
 *   aiSettings: unknown,
 *   userRequirement?: string,
 *   currentTheme?: Record<string, any> | null,
 *   refineInstruction?: string,
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
  currentTheme = null,
  refineInstruction = '',
  providerId = '',
  fetchImpl = /** @type {typeof fetch} */ (getDefaultFetch()),
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

  const prompt = buildAiThemeUserMessage({
    userRequirement,
    currentTheme,
    refineInstruction,
  });
  const controller = new AbortController();
  const timer = setAiLayoutTimeout(() => controller.abort(), timeoutMs);

  try {
    let content = await requestAiThemeCompletion(
      provider,
      AI_THEME_SYSTEM_PROMPT,
      prompt,
      fetchImpl,
      controller.signal
    );

    let jsonPayload = '';
    try {
      jsonPayload = extractJsonPayload(content);
    } catch {
      throw new Error(`AI 返回的内容未包含合法的 JSON 格式。返回片段: ${content.slice(0, 150)}...`);
    }

    let validation = validateCustomThemeToken(jsonPayload);
    // 若仅因 CSS 语法或被拦截规则校验失败，自动携带精确诊断自愈重试 1 次
    const hasCssValidationError = !validation.valid
      && validation.errors.some((err) => err.includes('CSS'));
    if (hasCssValidationError) {
      const repairPrompt = `${prompt}\n\n【上次输出存在 CSS 校验错误，请修复后重新输出完整纯 JSON】：\n${validation.errors.join('; ')}`;
      content = await requestAiThemeCompletion(
        provider,
        AI_THEME_SYSTEM_PROMPT,
        repairPrompt,
        fetchImpl,
        controller.signal
      );
      try {
        jsonPayload = extractJsonPayload(content);
        validation = validateCustomThemeToken(jsonPayload);
      } catch {
        // 保留首次校验错误提示
      }
    }

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

