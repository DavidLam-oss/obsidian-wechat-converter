/*
## 核心功能

覆盖 ai-layout service generation providers 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护AI 生成、schema 错误、JSON 修复、provider 格式和超时行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 AI layout service 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, expect, it, vi } from 'vitest';
const {
  generateArticleLayout,
  AiLayoutSchemaError,
  AiLayoutTimeoutError,
} = require('../services/ai-layout');

describe('ai-layout service generation providers', () => {
  it('should return generation meta and fallback info for sparse model output', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'lead-quote', text: '模型只给了一句摘要' },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/1.png', alt: '截图', caption: '截图' }],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.blocks.length).toBeGreaterThan(1);
    expect(result.generationMeta.providerName).toBe('测试 Provider');
    expect(result.generationMeta.imageCount).toBe(1);
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.generationMeta.blockOrigins.some((item) => item.source === 'fallback')).toBe(true);
  });

  it('should preserve schema validation warnings in generation meta', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'lead-quote', text: '模型给了一句摘要', extraField: 'should-warn' },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.generationMeta.schemaValidation.issueCount).toBeGreaterThan(0);
    expect(result.generationMeta.schemaValidation.fatal).toBe(false);
  });

  it('should infer missing block types from structured ai payloads', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { blockType: 'hero', title: '文章标题', subtitle: '导语' },
                  { blockType: 'lead-quote', text: '一句重点摘要' },
                  { blockType: 'section-block', sectionIndex: 0 },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这里是正文。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.blocks[0].type).toBe('hero');
    expect(result.layoutJson.blocks[1].type).toBe('lead-quote');
    expect(result.layoutJson.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(result.generationMeta.schemaValidation.issueCount).toBe(0);
  });

  it('should throw schema error when ai payload is fatally invalid', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'unknown-block' },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    })).rejects.toMatchObject({
      name: 'AiLayoutSchemaError',
      code: 'ai-layout-schema-invalid',
    });

    try {
      await generateArticleLayout({
        provider,
        title: 'AI 编排实践',
        markdown: '这是一段导语。',
        stylePack: 'tech-green',
        imageRefs: [],
        fetchImpl,
        timeoutMs: 2000,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AiLayoutSchemaError);
      expect(error.schemaValidation.fatal).toBe(true);
      expect(error.generationMeta.schemaValidation.issueCount).toBeGreaterThan(0);
    }
  });

  it('should truncate oversized markdown before sending provider request', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    let requestBody = null;
    const longMarkdown = `# 标题\n\n${'长内容 '.repeat(5000)}\n\n## 尾部\n${'收尾 '.repeat(1000)}`;
    const fetchImpl = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  articleType: 'tutorial',
                  stylePack: 'tech-green',
                  title: 'AI 编排实践',
                  summary: '一句摘要',
                  blocks: [
                    { type: 'lead-quote', text: '模型只给了一句摘要' },
                  ],
                }),
              },
            },
          ],
        }),
      };
    };

    await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: longMarkdown,
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    const userMessage = requestBody.messages[1].content;
    expect(userMessage.length).toBeLessThan(longMarkdown.length);
    expect(userMessage).toContain('内容已截断');
    expect(userMessage).toContain('原文如下');
  });

  it('should recover from raw control characters inside ai json strings', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const brokenJson = `{
  "articleType": "article",
  "selection": { "layoutFamily": "source-first", "colorPalette": "auto" },
  "resolved": { "layoutFamily": "source-first", "colorPalette": "tech-green" },
  "recommendedLayoutFamily": "source-first",
  "recommendedColorPalette": "tech-green",
  "title": "测试标题",
  "summary": "一句摘要",
  "blocks": [
    { "type": "lead-quote", "text": "第一行
第二行" }
  ]
}`;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${brokenJson}\n\`\`\``,
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: '测试标题',
      markdown: '## 第一部分\n这里是正文。',
      selection: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'auto',
      },
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    const quoteBlock = result.layoutJson.blocks.find((block) => block.type === 'lead-quote');
    expect(quoteBlock).toBeTruthy();
    expect(quoteBlock.text).toContain('第一行');
    expect(quoteBlock.text).toContain('第二行');
  });

  it('should fall back to local source-first layout when ai json stays malformed', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const brokenJson = `{
  "articleType": "article",
  "selection": { "layoutFamily": "source-first", "colorPalette": "auto" },
  "resolved": { "layoutFamily": "source-first", "colorPalette": "tech-green" },
  "recommendedLayoutFamily": "source-first",
  "recommendedColorPalette": "tech-green",
  "title": "测试标题",
  "summary": "一句摘要",
  "blocks": [
    { "type": "lead-quote", "text": "第一行\x00第二行" }
  ]`;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${brokenJson}\n\`\`\``,
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: '测试标题',
      markdown: '# 标题\n\n## 第一部分\n这里是正文。\n\n## 第二部分\n继续补充内容。',
      selection: {
        layoutFamily: 'source-first',
        colorPalette: 'auto',
      },
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.layoutFamily).toBe('source-first');
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.layoutJson.blocks.some((block) => block.type === 'section-block')).toBe(true);
  });

  it('should support gemini provider format', async () => {
    const provider = {
      id: 'g1',
      name: 'Gemini',
      kind: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'secret',
      model: 'gemini-2.5-flash',
      enabled: true,
    };
    let request = null;
    const fetchImpl = vi.fn(async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      articleType: 'tutorial',
                      selection: { layoutFamily: 'tutorial-cards', colorPalette: 'tech-green' },
                      resolved: { layoutFamily: 'tutorial-cards', colorPalette: 'tech-green' },
                      recommendedLayoutFamily: 'tutorial-cards',
                      recommendedColorPalette: 'tech-green',
                      title: 'Gemini 测试',
                      summary: '一句摘要',
                      blocks: [{ type: 'lead-quote', text: 'Gemini 结果' }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const result = await generateArticleLayout({
      provider,
      title: 'Gemini 测试',
      markdown: '## 第一部分\n正文',
      imageRefs: [],
      timeoutMs: 2000,
      fetchImpl,
    });

    expect(request.url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(request.options.headers['x-goog-api-key']).toBe('secret');
    expect(result.layoutJson.blocks.some((block) => block.type === 'lead-quote')).toBe(true);
  });

  it('should support anthropic provider format', async () => {
    const provider = {
      id: 'a1',
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'secret',
      model: 'claude-3-5-haiku-latest',
      enabled: true,
    };
    let request = null;
    const fetchImpl = vi.fn(async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                articleType: 'tutorial',
                selection: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
                resolved: { layoutFamily: 'source-first', colorPalette: 'tech-green' },
                recommendedLayoutFamily: 'source-first',
                recommendedColorPalette: 'tech-green',
                title: 'Claude 测试',
                summary: '一句摘要',
                blocks: [{ type: 'lead-quote', text: 'Anthropic 结果' }],
              }),
            },
          ],
        }),
      };
    });

    const result = await generateArticleLayout({
      provider,
      title: 'Claude 测试',
      markdown: '## 第一部分\n正文',
      imageRefs: [],
      timeoutMs: 2000,
      fetchImpl,
    });

    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.options.headers['x-api-key']).toBe('secret');
    expect(request.options.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(request.options.body).max_tokens).toBe(8192);
    expect(result.layoutJson.blocks[0].type).toBe('lead-quote');
  });

  it('should report a clear error when anthropic truncates output at max_tokens', async () => {
    const provider = {
      id: 'a1',
      name: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'secret',
      model: 'claude-3-5-haiku-latest',
      enabled: true,
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        stop_reason: 'max_tokens',
        content: [
          {
            type: 'text',
            text: '{"articleType":"tutorial","blocks":[',
          },
        ],
      }),
    }));

    await expect(generateArticleLayout({
      provider,
      title: 'Claude 测试',
      markdown: '## 第一部分\n正文',
      imageRefs: [],
      timeoutMs: 2000,
      fetchImpl,
    })).rejects.toThrow('max_tokens 输出上限');
  });

  it('should convert aborted provider requests into timeout errors', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new Error('signal is aborted without reason'));
      }, { once: true });
    });

    await expect(generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 10,
    })).rejects.toMatchObject({
      name: 'AiLayoutTimeoutError',
      code: 'ai-layout-timeout',
      message: 'AI 请求超时（1s）',
    });

    try {
      await generateArticleLayout({
        provider,
        title: 'AI 编排实践',
        markdown: '这是一段导语。',
        stylePack: 'tech-green',
        imageRefs: [],
        fetchImpl,
        timeoutMs: 10,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AiLayoutTimeoutError);
      expect(error.timeoutMs).toBe(10);
    }
  });
});
