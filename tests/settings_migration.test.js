import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AppleStylePlugin - Settings Migration', () => {
  let AppleStylePlugin;

  beforeEach(() => {
    vi.resetModules();
    AppleStylePlugin = require('../input.js');
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
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});
