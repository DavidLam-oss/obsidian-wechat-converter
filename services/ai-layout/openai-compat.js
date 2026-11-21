/*
## 核心功能

实现 OpenAI 兼容接口在推理模型（如 o1, o3）与现代参数规范下的自适应协议处理。
针对新模型废弃 `max_tokens`（改用 `max_completion_tokens`）以及不支持自定义 `temperature` 等报错，
提供自适应重试与平滑回退，确保第三方网关与官方新模型双向兼容。

## 输入

接收 API Provider 配置、fetch 实现、待调用的 endpoint、model、messages、token 限制与 signal。

## 输出

输出 `isMaxCompletionTokensRequiredError`、`isTemperatureNotSupportedError`、`isKnownReasoningModelName`、`testOpenAiTextProviderConnection`。

## 定位

位于 services/ai-layout/，是 AI layout 模块内部实现，保持无 DOM 宿主依赖，纯逻辑模块。
*/

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: LLM network responses and JSON payloads are untrusted and heterogeneous */

/**
 * 判断错误文本是否明确指示需要使用 max_completion_tokens 代替 max_tokens
 * @param {string} text
 * @returns {boolean}
 */
export function isMaxCompletionTokensRequiredError(text) {
  const content = String(text || '');
  return (
    /(?:max_tokens.*(?:not supported|unsupported)|(?:not supported|unsupported).*max_tokens)/i.test(content) ||
    /max_completion_tokens/i.test(content)
  );
}

/**
 * 判断错误文本是否明确指示当前模型不支持 temperature 参数
 * @param {string} text
 * @returns {boolean}
 */
export function isTemperatureNotSupportedError(text) {
  const content = String(text || '');
  return (
    /(?:temperature.*(?:not supported|unsupported)|(?:not supported|unsupported).*temperature)/i.test(content) ||
    /temperature.*only supports/i.test(content)
  );
}

/**
 * 判断模型名称是否命中已知的 OpenAI 推理模型族（o1, o3, o4 系列）
 * @param {string} model
 * @returns {boolean}
 */
export function isKnownReasoningModelName(model) {
  const name = String(model || '').trim();
  return /^(?:o1|o3|o4|chatgpt-4o-latest)(?:-|$)/i.test(name);
}

/**
 * 针对 OpenAI 兼容接口执行文本连通性测试，自动适配 max_completion_tokens 与 temperature 约束
 * @param {{
 *   safeProvider: { baseUrl: string, apiKey: string, textModel?: string, model?: string },
 *   fetchImpl: Function,
 *   signal: AbortSignal,
 *   maxTokens?: number,
 *   prompt?: string,
 * }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function testOpenAiTextProviderConnection({
  safeProvider,
  fetchImpl,
  signal,
  maxTokens = 16,
  prompt = 'Reply with OK only.',
}) {
  const modelName = safeProvider.textModel || safeProvider.model;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${safeProvider.apiKey}`,
  };

  const isReasoning = isKnownReasoningModelName(modelName);
  let tokenKey = isReasoning ? 'max_completion_tokens' : 'max_tokens';
  let includeTemperature = !isReasoning;
  let lastErrorText = '';
  let response;

  for (let attempt = 0; attempt < 3; attempt++) {
    /** @type {Record<string, unknown>} */
    const payload = {
      model: modelName,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    };
    if (includeTemperature) {
      payload.temperature = 0;
    }
    if (tokenKey) {
      payload[tokenKey] = maxTokens;
    }

    response = await fetchImpl(`${safeProvider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });

    if (response.ok) {
      lastErrorText = '';
      break;
    }

    try {
      lastErrorText = await response.text();
    } catch {
      lastErrorText = '';
    }

    if (response.status === 400) {
      let adjusted = false;
      if (tokenKey === 'max_tokens' && isMaxCompletionTokensRequiredError(lastErrorText)) {
        tokenKey = 'max_completion_tokens';
        adjusted = true;
      }
      if (includeTemperature && isTemperatureNotSupportedError(lastErrorText)) {
        includeTemperature = false;
        adjusted = true;
      }

      if (adjusted) {
        continue;
      }
    }

    throw new Error(`AI 请求失败 (${response.status || 0}): ${lastErrorText || response.statusText || ''}`);
  }

  if (!response || !response.ok) {
    throw new Error(`AI 请求失败 (${response?.status || 0}): ${lastErrorText || response?.statusText || ''}`);
  }

  return await response.json();
}

/**
 * 执行 OpenAI 兼容 Chat Completions 请求，针对 reasoning 模型与 temperature 限制提供自适应容错
 * @param {{
 *   fetchImpl: Function,
 *   baseUrl: string,
 *   apiKey: string,
 *   model: string,
 *   messages: any[],
 *   temperature?: number,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export async function requestOpenAiChatCompletionAdaptive({
  fetchImpl,
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.2,
  signal,
}) {
  const isReasoning = isKnownReasoningModelName(model);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  let response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      ...(isReasoning ? {} : { temperature }),
      messages,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && isTemperatureNotSupportedError(text)) {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
        }),
        signal,
      });
    }
    if (!response.ok) {
      const retryText = response.status === 400 ? await response.text().catch(() => '') : '';
      throw new Error(`AI 请求失败 (${response.status}): ${retryText || text || response.statusText}`);
    }
  }

  return await response.json();
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- reason: close the scoped disable block above */


