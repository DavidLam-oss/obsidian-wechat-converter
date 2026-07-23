/*
## 核心功能

覆盖 settings migration 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 settings migration 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');
describe('AppleStylePlugin - Settings Migration', () => {
  let AppleStylePlugin;

  beforeEach(() => {
    vi.resetModules();
    AppleStylePlugin = loadInputModule().default;
  });

  it('serializes bridge lifecycle operations across configuration changes', async () => {
    const plugin = new AppleStylePlugin();
    const events = [];
    let releaseStop;

    const stop = plugin._queueWechatSyncBridgeLifecycle('stop', async () => {
      events.push('stop:start');
      await new Promise((resolve) => {
        releaseStop = resolve;
      });
      events.push('stop:end');
    });
    const start = plugin._queueWechatSyncBridgeLifecycle('start', async () => {
      events.push('start');
    });

    await vi.waitFor(() => {
      expect(events).toEqual(['stop:start']);
    });
    releaseStop();
    await Promise.all([stop, start]);
    expect(events).toEqual(['stop:start', 'stop:end', 'start']);
  });

  it('should migrate legacy folder cleanup config to cleanupDirTemplate', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      cleanupAfterSync: true,
      cleanupUseSystemTrash: true,
      cleanupRootDir: 'published',
      cleanupTarget: 'folder',
      cleanupDirTemplate: '',
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.cleanupDirTemplate).toBe('published/{{note}}_img');
    expect(plugin.settings.cleanupRootDir).toBeUndefined();
    expect(plugin.settings.cleanupTarget).toBeUndefined();
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should not override existing cleanupDirTemplate during migration', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      cleanupAfterSync: true,
      cleanupUseSystemTrash: true,
      cleanupRootDir: 'published',
      cleanupTarget: 'folder',
      cleanupDirTemplate: 'articles/{{note}}_img',
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.cleanupDirTemplate).toBe('articles/{{note}}_img');
    expect(plugin.settings.cleanupRootDir).toBeUndefined();
    expect(plugin.settings.cleanupTarget).toBeUndefined();
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should remove deprecated legacy/parity render flags in native-only mode', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      useTripletPipeline: false,
      tripletFallbackToPhase2: false,
      enforceTripletParity: false,
      tripletParityMaxLengthDelta: 8,
      tripletParityMaxSegmentCount: 2,
      tripletParityVerboseLog: true,
      useNativePipeline: true,
      enableLegacyFallback: false,
      enforceNativeParity: false,
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.useTripletPipeline).toBeUndefined();
    expect(plugin.settings.tripletFallbackToPhase2).toBeUndefined();
    expect(plugin.settings.enforceTripletParity).toBeUndefined();
    expect(plugin.settings.tripletParityMaxLengthDelta).toBeUndefined();
    expect(plugin.settings.tripletParityMaxSegmentCount).toBeUndefined();
    expect(plugin.settings.tripletParityVerboseLog).toBeUndefined();
    expect(plugin.settings.useNativePipeline).toBeUndefined();
    expect(plugin.settings.enableLegacyFallback).toBeUndefined();
    expect(plugin.settings.enforceNativeParity).toBeUndefined();
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should not write settings when no migration is needed', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      cleanupDirTemplate: '',
      cleanupAfterSync: false,
      cleanupUseSystemTrash: true,
      clientId: 'client-123456',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('should normalize partial ai settings without forcing a save when field is missing', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      cleanupDirTemplate: '',
      clientId: 'client-123456',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.ai).toBeTruthy();
    expect(plugin.settings.ai.enabled).toBe(true);
    expect(plugin.settings.ai.defaultStylePack).toBe('tech-green');
    expect(plugin.settings.ai.providers).toEqual([]);
    expect(plugin.settings.ai.articleLayoutsByPath).toEqual({});
    expect(plugin.settings.quoteCalloutStyleMode).toBe('theme');
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('should keep legacy wechat accounts unchanged until publish defaults are explicitly saved', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [{
        id: 'acc-1',
        name: '公众号 A',
        appId: 'wx123',
        appSecret: 'sec',
        author: '作者',
      }],
      defaultAccountId: 'acc-1',
      clientId: 'client-123456',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('contentSourceUrl');
    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('enableOriginal');
    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('allowReprint');
    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('openComment');
    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('onlyFansCanComment');
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('should remove deprecated originality and reprint flags from stored wechat accounts', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [{
        id: 'acc-1',
        name: '公众号 A',
        appId: 'wx123',
        appSecret: 'sec',
        author: '作者',
        enableOriginal: true,
        allowReprint: false,
        openComment: true,
      }],
      defaultAccountId: 'acc-1',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('enableOriginal');
    expect(plugin.settings.wechatAccounts[0]).not.toHaveProperty('allowReprint');
    expect(plugin.settings.wechatAccounts[0].openComment).toBe(true);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should normalize legacy flat draft cache shape', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      draftCache: {
        'folder\\note.md': {
          mediaId: 'draft-media',
          accountId: 'acc-1',
          title: 'Note',
          updatedAt: 100,
        },
      },
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.draftCache).toEqual({
      version: 1,
      articles: {
        'folder/note.md': {
          sourcePath: 'folder/note.md',
          mediaId: 'draft-media',
          accountId: 'acc-1',
          title: 'Note',
          index: 0,
          updatedAt: 100,
        },
      },
    });
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should preserve explicit disabled ai setting during normalization', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      ai: {
        enabled: false,
        providers: [],
        articleLayoutsByPath: {},
      },
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.ai.enabled).toBe(false);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should normalize stored ai settings when provider metadata is incomplete', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      ai: {
        enabled: true,
        defaultProviderId: 'p1',
        providers: [{ id: 'p1', apiKey: 'secret' }],
        articleLayoutsByPath: {
          'notes/demo.md': {
            layoutJson: { articleType: 'tutorial', stylePack: 'tech-green', blocks: [{ type: 'lead-quote', text: 'hello' }] }
          }
        }
      },
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.ai.providers[0].name).toBe('未命名 Provider');
    expect(plugin.settings.ai.providers[0].model).toBe('gpt-4.1-mini');
    expect(plugin.settings.ai.articleLayoutsByPath['notes/demo.md']).toBeTruthy();
    expect(plugin.settings.ai.articleLayoutsByPath['notes/demo.md'].stylePackStates['tech-green'].lastAttemptStatus).toBe('idle');
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('should let auto selection reuse migrated legacy stylePack cache', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      ai: {
        enabled: true,
        providers: [],
        articleLayoutsByPath: {
          'notes/demo.md': {
            updatedAt: Date.now(),
            stylePack: 'tech-green',
            layoutJson: {
              articleType: 'tutorial',
              stylePack: 'tech-green',
              blocks: [{ type: 'hero', title: 'legacy cache' }],
            },
          },
        },
      },
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.getArticleLayoutState('notes/demo.md', {
      layoutFamily: 'auto',
      colorPalette: 'auto',
    })?.layoutJson?.blocks?.[0]?.title).toBe('legacy cache');
    expect(plugin.getArticleLayoutState('notes/demo.md', {
      layoutFamily: 'auto',
      colorPalette: 'tech-green',
    })?.stylePack).toBe('tech-green');
  });

  it('should keep one cached layout per note layout family across style packs', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      ai: {
        enabled: true,
        defaultStylePack: 'tech-green',
        providers: [],
        articleLayoutsByPath: {},
      },
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    await plugin.saveArticleLayoutState('notes/demo.md', {
      layoutJson: { articleType: 'tutorial', stylePack: 'tech-green', blocks: [{ type: 'hero', title: 'green' }] },
      stylePack: 'tech-green',
    });

    await plugin.saveArticleLayoutState('notes/demo.md', {
      layoutJson: { articleType: 'tutorial', stylePack: 'ocean-blue', blocks: [{ type: 'hero', title: 'blue' }] },
      stylePack: 'ocean-blue',
    });

    expect(plugin.getArticleLayoutState('notes/demo.md', 'tech-green')?.layoutJson?.blocks?.[0]?.title).toBe('blue');
    expect(plugin.getArticleLayoutState('notes/demo.md', 'ocean-blue')?.layoutJson?.blocks?.[0]?.title).toBe('blue');
    expect(Object.keys(plugin.settings.ai.articleLayoutsByPath['notes/demo.md'].familyStates)).toEqual(['tutorial-cards']);
  });

  it('should auto-generate clientId when it is missing and trigger a save', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      cleanupDirTemplate: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.clientId).toBeTruthy();
    expect(plugin.settings.clientId.startsWith('wp_dev_')).toBe(true);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it('resets persisted bridge and Pro runtime state on Obsidian startup', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
      multiPlatformSync: {
        enabled: true,
        token: 'migration-token',
        connectedClients: [{
          extensionInstanceId: 'browser-A',
          status: 'connected',
          capabilities: { proLicensed: true },
          license: { state: 'pro', observedAt: Date.now() - 1000 },
        }],
        connection: {
          status: 'connected',
          capabilities: { proLicensed: true, quotaPolicy: true },
        },
      },
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.multiPlatformSync.connectedClients[0].status).toBe('disconnected');
    expect(plugin.settings.multiPlatformSync.connection.status).toBe('untested');
    expect(plugin.settings.multiPlatformSync.connection.capabilities).toEqual({ quotaPolicy: true });
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });
});
