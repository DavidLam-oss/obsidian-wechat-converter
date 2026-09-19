/*
## 核心功能

覆盖 AI Provider 双模型（文本模型 + 生图模型）与能力标记过滤逻辑的 Vitest 测试用例。

## 输入

接收 mock 的 AI Provider 配置、AI 设置对象与断言数据。

## 输出

输出自动化断言结果，保证文本/生图能力区分、下拉列表过滤与向前兼容逻辑不回归。

## 定位

位于 tests/，是针对 C06.1 AI 服务能力增强的单元测试。

## 依赖

关键依赖：Vitest、`services/ai-layout/providers.js`、`services/ai-layout/settings.js`。
*/

import { describe, it, expect } from 'vitest';
import {
  normalizeAiProvider,
  getAiProviderIssues,
  isAiProviderRunnable,
  listTextAiProviders,
  listImageAiProviders,
  resolveImageAiProvider,
} from '../services/ai-layout/providers.js';
import {
  createDefaultAiSettings,
  normalizeAiSettings,
} from '../services/ai-layout/settings.js';

describe('AI Provider Capabilities (C06.1)', () => {
  it('normalizes legacy provider with backward compatibility for model and supportsText', () => {
    const legacy = {
      id: 'p1',
      name: 'DeepSeek Legacy',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-123',
      model: 'deepseek-chat',
    };
    const normalized = normalizeAiProvider(legacy);

    expect(normalized.id).toBe('p1');
    expect(normalized.model).toBe('deepseek-chat');
    expect(normalized.textModel).toBe('deepseek-chat');
    expect(normalized.supportsText).toBe(true);
    expect(normalized.supportsImage).toBe(false);
    expect(normalized.imageModel).toBe('');
    expect(normalized.notes).toBe('');
  });

  it('normalizes dual-capability provider with independent text and image models', () => {
    const dual = {
      id: 'p2',
      name: 'SiliconFlow Dual',
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: 'sk-silicon',
      supportsText: true,
      textModel: 'deepseek-ai/DeepSeek-V3',
      supportsImage: true,
      imageModel: 'black-forest-labs/FLUX.1-schnell',
      notes: '硅基流动，支持生图与对话',
    };
    const normalized = normalizeAiProvider(dual);

    expect(normalized.supportsText).toBe(true);
    expect(normalized.textModel).toBe('deepseek-ai/DeepSeek-V3');
    expect(normalized.supportsImage).toBe(true);
    expect(normalized.imageModel).toBe('black-forest-labs/FLUX.1-schnell');
    expect(normalized.notes).toBe('硅基流动，支持生图与对话');
  });

  it('detects issues for text capability vs image capability', () => {
    const textOnly = normalizeAiProvider({
      id: 'p3',
      name: 'Text Only',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      supportsText: true,
      textModel: 'gpt-4o',
      supportsImage: false,
    });

    // Text runnable
    expect(isAiProviderRunnable(textOnly, 'text')).toBe(true);
    expect(getAiProviderIssues(textOnly, 'text')).toEqual([]);

    // Image not runnable because supportsImage is false
    expect(isAiProviderRunnable(textOnly, 'image')).toBe(false);
    expect(getAiProviderIssues(textOnly, 'image')).toContain('image-not-supported');

    const imageOnlyWithoutModel = {
      id: 'p4',
      name: 'Image Provider Empty Model',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      supportsText: false,
      supportsImage: true,
      imageModel: '',
    };

    // Image not runnable because imageModel is empty
    expect(isAiProviderRunnable(imageOnlyWithoutModel, 'image')).toBe(false);
    expect(getAiProviderIssues(imageOnlyWithoutModel, 'image')).toContain('missing-image-model');
  });

  it('filters providers by text vs image capability', () => {
    const providers = [
      normalizeAiProvider({
        id: 'p-text',
        name: 'Text Provider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        supportsText: true,
        textModel: 'gpt-4',
        supportsImage: false,
      }),
      normalizeAiProvider({
        id: 'p-image',
        name: 'Image Provider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        supportsText: false,
        supportsImage: true,
        imageModel: 'dall-e-3',
      }),
      normalizeAiProvider({
        id: 'p-both',
        name: 'Both Provider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        supportsText: true,
        textModel: 'gpt-4',
        supportsImage: true,
        imageModel: 'dall-e-3',
      }),
    ];

    const textProviders = listTextAiProviders(providers);
    expect(textProviders.map((p) => p.id)).toEqual(['p-text', 'p-both']);

    const imageProviders = listImageAiProviders(providers);
    expect(imageProviders.map((p) => p.id)).toEqual(['p-image', 'p-both']);
  });

  it('resolves image provider correctly with fallback to first runnable', () => {
    const providers = [
      normalizeAiProvider({
        id: 'p-text',
        name: 'Text Provider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        supportsText: true,
        textModel: 'gpt-4',
        supportsImage: false,
      }),
      normalizeAiProvider({
        id: 'p-image-runnable',
        name: 'Image Provider Runnable',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        supportsText: false,
        supportsImage: true,
        imageModel: 'flux-schnell',
      }),
    ];

    // Explicit ID exists
    const resolvedById = resolveImageAiProvider(providers, 'p-image-runnable');
    expect(resolvedById?.id).toBe('p-image-runnable');

    // Invalid ID falls back to first runnable image provider
    const fallback = resolveImageAiProvider(providers, 'non-existent-id');
    expect(fallback?.id).toBe('p-image-runnable');

    // No runnable image providers returns null
    const emptyFallback = resolveImageAiProvider([providers[0]], '');
    expect(emptyFallback).toBeNull();
  });

  it('normalizes ai settings with defaultImageProviderId and cardCover settings', () => {
    const defaultSettings = createDefaultAiSettings();
    expect(defaultSettings.defaultImageProviderId).toBe('');
    expect(defaultSettings.cardCoverImageStyle).toBe('3d-clay');
    expect(defaultSettings.cardCoverMode).toBe('mixed');

    const custom = normalizeAiSettings({
      providers: [{
        id: 'p-img',
        name: 'Img Provider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'key',
        supportsImage: true,
        imageModel: 'flux',
      }],
      defaultImageProviderId: 'p-img',
      cardCoverImageStyle: 'editorial-magazine',
      cardCoverMode: 'full-bleed',
    });
    expect(custom.defaultImageProviderId).toBe('p-img');
    expect(custom.cardCoverImageStyle).toBe('editorial-magazine');
    expect(custom.cardCoverMode).toBe('full-bleed');
  });
});
