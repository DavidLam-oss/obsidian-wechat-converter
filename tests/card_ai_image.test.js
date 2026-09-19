/*
## 核心功能

覆盖小红书卡片导出 AI 封面生成服务（services/card-ai-image.js）的 Vitest 测试用例。

## 输入

接收 mock 的 AI Provider、提示词、比例参数与 mock 的 requestUrl 响应数据。

## 输出

输出自动化断言结果，确保风格模版解析、尺寸映射、b64_json 与 URL 下载内联为 Base64 逻辑不回归。

## 定位

位于 tests/，是针对 C06.2 的服务层单元测试。

## 依赖

关键依赖：Vitest、`services/card-ai-image.js`。
*/

import { describe, it, expect, vi } from 'vitest';
import {
  AI_CARD_COVER_STYLES,
  resolveCardCoverPrompt,
  resolveCardImageDimensions,
  generateCardCoverImage,
} from '../services/card-ai-image.js';

describe('Card AI Image Service (C06.2)', () => {
  describe('AI_CARD_COVER_STYLES & resolveCardCoverPrompt', () => {
    it('provides preset styles including 3d-clay, minimal-vector, cyberpunk-tech, warm-healing, editorial-magazine, custom', () => {
      const styleIds = AI_CARD_COVER_STYLES.map((s) => s.id);
      expect(styleIds).toContain('3d-clay');
      expect(styleIds).toContain('minimal-vector');
      expect(styleIds).toContain('cyberpunk-tech');
      expect(styleIds).toContain('warm-healing');
      expect(styleIds).toContain('editorial-magazine');
      expect(styleIds).toContain('custom');
    });

    it('interpolates {title}, {excerpt}, {topic} into preset prompt', () => {
      const prompt = resolveCardCoverPrompt({
        styleId: '3d-clay',
        title: '我的Obsidian工作流',
        excerpt: '探索高效知识管理技巧',
        topic: '知识管理',
      });

      expect(prompt).toContain('我的Obsidian工作流');
      expect(prompt).toContain('3D clay render style');
      expect(prompt).not.toContain('{title}');
      expect(prompt).not.toContain('{excerpt}');
    });

    it('handles custom style with user prompt', () => {
      const prompt = resolveCardCoverPrompt({
        styleId: 'custom',
        customPrompt: 'Cyberpunk cat reading a book titled {title}',
        title: '猫咪笔记',
      });

      expect(prompt).toBe('Cyberpunk cat reading a book titled 猫咪笔记');
    });

    it('appends customPrompt to preset style when both provided', () => {
      const prompt = resolveCardCoverPrompt({
        styleId: 'minimal-vector',
        customPrompt: 'golden sunset lighting',
        title: '文章标题',
      });

      expect(prompt).toContain('Flat vector illustration');
      expect(prompt).toContain('文章标题');
      expect(prompt).toContain('golden sunset lighting');
    });
  });

  describe('resolveCardImageDimensions', () => {
    it('maps aspect ratios for standard models', () => {
      expect(resolveCardImageDimensions('3:4', 'flux')).toBe('768x1024');
      expect(resolveCardImageDimensions('3:5', 'flux')).toBe('864x1440');
      expect(resolveCardImageDimensions('9:16', 'flux')).toBe('1024x1792');
      expect(resolveCardImageDimensions('1:1', 'flux')).toBe('1024x1024');
    });

    it('adapts aspect ratios for dall-e-3', () => {
      expect(resolveCardImageDimensions('3:4', 'dall-e-3')).toBe('1024x1792');
      expect(resolveCardImageDimensions('9:16', 'dall-e-3')).toBe('1024x1792');
      expect(resolveCardImageDimensions('1:1', 'dall-e-3')).toBe('1024x1024');
    });
  });

  describe('generateCardCoverImage', () => {
    const validProvider = {
      id: 'p-img',
      name: 'Test Image Provider',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-key',
      imageModel: 'black-forest-labs/FLUX.1-schnell',
    };

    it('validates provider credentials and prompt', async () => {
      await expect(generateCardCoverImage({
        provider: null,
        prompt: 'test',
      })).rejects.toThrow('未配置生图 AI Provider');

      await expect(generateCardCoverImage({
        provider: { baseUrl: '', apiKey: '' },
        prompt: 'test',
      })).rejects.toThrow('缺少 Base URL 或 API Key');

      await expect(generateCardCoverImage({
        provider: { baseUrl: 'https://api.example.com', apiKey: 'sk-123' },
        prompt: 'test',
      })).rejects.toThrow('缺少生图模型名称');

      await expect(generateCardCoverImage({
        provider: validProvider,
        prompt: '',
      })).rejects.toThrow('生图提示词不能为空');
    });

    it('successfully processes b64_json response', async () => {
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 200,
        json: {
          data: [{
            b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          }],
        },
      });

      const result = await generateCardCoverImage({
        provider: validProvider,
        prompt: 'Cute clay figurine',
        aspectRatio: '3:4',
        requestUrl: mockRequestUrl,
      });

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const callArgs = mockRequestUrl.mock.calls[0][0];
      expect(callArgs.url).toBe('https://api.example.com/v1/images/generations');
      expect(callArgs.method).toBe('POST');
      expect(callArgs.headers.Authorization).toBe('Bearer sk-secret-key');

      const body = JSON.parse(callArgs.body);
      expect(body.model).toBe('black-forest-labs/FLUX.1-schnell');
      expect(body.prompt).toBe('Cute clay figurine');
      expect(body.size).toBe('768x1024');
      expect(body.response_format).toBe('b64_json');

      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('downloads remote URL and inlines as Base64 data URL', async () => {
      const fakePngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
      const mockRequestUrl = vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          json: {
            data: [{
              url: 'https://cdn.example.com/generated-cover-123.png',
            }],
          },
        })
        .mockResolvedValueOnce({
          status: 200,
          arrayBuffer: fakePngBytes,
        });

      const result = await generateCardCoverImage({
        provider: validProvider,
        prompt: 'Futuristic city',
        aspectRatio: '9:16',
        requestUrl: mockRequestUrl,
      });

      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
      expect(mockRequestUrl.mock.calls[1][0].url).toBe('https://cdn.example.com/generated-cover-123.png');
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('handles API error status gracefully', async () => {
      const mockRequestUrl = vi.fn().mockResolvedValue({
        status: 400,
        json: {
          error: {
            message: 'Billing quota exceeded',
          },
        },
      });

      await expect(generateCardCoverImage({
        provider: validProvider,
        prompt: 'Some prompt',
        requestUrl: mockRequestUrl,
      })).rejects.toThrow('生图服务返回失败 (400): Billing quota exceeded');
    });
  });
});
