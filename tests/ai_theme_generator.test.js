import { describe, it, expect, vi } from 'vitest';
import {
  buildThemePromptWithRequirement,
  hasRunnableTextProvider,
  generateCustomThemeWithAi,
} from '../services/ai-theme-generator.js';

describe('AI Theme Generator Service', () => {
  const mockValidTokenJson = JSON.stringify({
    schemaVersion: 1,
    id: 'autumn-forest',
    name: '秋日森林',
    description: '温润克制，适合户外与读书手记',
    headingStyle: 'badge',
    colors: {
      accent: '#d97706',
      light: '#fef3c7',
      highlight: '#fde68a',
      title: '#1c1917',
      text: '#292524',
      muted: '#78716c',
      border: '#e7e5e4',
    },
    typography: {
      fontPreset: 'sans-serif',
      baseFontSize: 15,
      lineHeight: 1.8,
      paragraphGap: 18,
    },
    footer: {
      showEngagementCard: true,
      ctaText: '如果对你有启发，欢迎点赞',
    },
  });

  describe('Prompt Builder & Helper Checks', () => {
    it('should build prompt with custom requirement', () => {
      const prompt = buildThemePromptWithRequirement('偏暖的秋日森林系，主色琥珀黄');
      expect(prompt).toContain('偏暖的秋日森林系，主色琥珀黄');
      expect(prompt).toContain('schemaVersion');
    });

    it('should use default prompt text when requirement is empty', () => {
      const prompt = buildThemePromptWithRequirement('');
      expect(prompt).toContain('请自由设计一套优雅克制');
    });

    it('should check if runnable text provider exists', () => {
      expect(hasRunnableTextProvider({})).toBe(false);
      expect(hasRunnableTextProvider({ providers: [] })).toBe(false);

      const validAiSettings = {
        providers: [
          {
            id: 'openai-1',
            enabled: true,
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            supportsText: true,
            textModel: 'gpt-4o',
          },
        ],
      };
      expect(hasRunnableTextProvider(validAiSettings)).toBe(true);
    });
  });

  describe('generateCustomThemeWithAi Execution', () => {
    it('should fail cleanly if no runnable provider configured', async () => {
      const result = await generateCustomThemeWithAi({
        aiSettings: {},
        userRequirement: '极简黑白',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到已启用的 AI 文本模型');
    });

    it('should successfully generate theme via OpenAI-compatible provider', async () => {
      const aiSettings = {
        providers: [
          {
            id: 'p1',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'sk-123',
            supportsText: true,
            textModel: 'deepseek-chat',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: `\`\`\`json\n${mockValidTokenJson}\n\`\`\``,
              },
            },
          ],
        }),
      });

      const result = await generateCustomThemeWithAi({
        aiSettings,
        userRequirement: '秋日森林',
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.token?.id).toBe('custom-autumn-forest');
      expect(result.token?.colors.accent).toBe('#d97706');
      expect(result.json).toContain('"name": "秋日森林"');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should successfully generate theme via Gemini provider', async () => {
      const aiSettings = {
        providers: [
          {
            id: 'p2',
            kind: 'gemini',
            enabled: true,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: 'gemini-key',
            supportsText: true,
            textModel: 'gemini-2.0-flash',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: mockValidTokenJson }],
              },
            },
          ],
        }),
      });

      const result = await generateCustomThemeWithAi({
        aiSettings,
        userRequirement: '秋日森林',
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.token?.id).toBe('custom-autumn-forest');
    });

    it('should successfully generate theme via Anthropic provider', async () => {
      const aiSettings = {
        providers: [
          {
            id: 'p3',
            kind: 'anthropic',
            enabled: true,
            baseUrl: 'https://api.anthropic.com/v1',
            apiKey: 'sk-ant-test',
            supportsText: true,
            textModel: 'claude-3-5-sonnet',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: `Here is the JSON you requested:\n${mockValidTokenJson}`,
            },
          ],
        }),
      });

      const result = await generateCustomThemeWithAi({
        aiSettings,
        userRequirement: '秋日森林',
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.token?.id).toBe('custom-autumn-forest');
    });

    it('should handle AI HTTP error response', async () => {
      const aiSettings = {
        providers: [
          {
            id: 'p1',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'sk-123',
            supportsText: true,
            textModel: 'gpt-4o',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API Key',
      });

      const result = await generateCustomThemeWithAi({
        aiSettings,
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI 请求失败 (401)');
    });

    it('should handle AI returning non-JSON text', async () => {
      const aiSettings = {
        providers: [
          {
            id: 'p1',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'sk-123',
            supportsText: true,
            textModel: 'gpt-4o',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: '对不起，我不能帮您生成这个设计。',
              },
            },
          ],
        }),
      });

      const result = await generateCustomThemeWithAi({
        aiSettings,
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('未包含合法的 JSON 格式');
    });

    it('should handle AI returning JSON with invalid schema', async () => {
      const aiSettings = {
        providers: [
          {
            id: 'p1',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'sk-123',
            supportsText: true,
            textModel: 'gpt-4o',
          },
        ],
      };

      const invalidJson = JSON.stringify({
        id: 'broken',
        // missing schemaVersion, name, colors.accent
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: invalidJson,
              },
            },
          ],
        }),
      });

      const result = await generateCustomThemeWithAi({
        aiSettings,
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('主题配置校验失败');
    });
  });
});
