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

  it('should default enforceTripletParity to true when setting is missing', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.enforceTripletParity).toBe(true);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('should keep enforceTripletParity false when explicitly configured', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      enforceTripletParity: false,
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.enforceTripletParity).toBe(false);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('should default tripletParityVerboseLog to false when setting is missing', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.tripletParityVerboseLog).toBe(false);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it('should migrate legacy render flags to triplet flags', async () => {
    const plugin = new AppleStylePlugin();
    plugin.loadData = vi.fn().mockResolvedValue({
      useNativePipeline: true,
      enableLegacyFallback: false,
      enforceNativeParity: false,
      wechatAccounts: [],
      defaultAccountId: '',
    });
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    expect(plugin.settings.useTripletPipeline).toBe(true);
    expect(plugin.settings.tripletFallbackToPhase2).toBe(false);
    expect(plugin.settings.enforceTripletParity).toBe(false);
    // compatibility mirror
    expect(plugin.settings.useNativePipeline).toBe(true);
    expect(plugin.settings.enableLegacyFallback).toBe(false);
    expect(plugin.settings.enforceNativeParity).toBe(false);
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });
});
