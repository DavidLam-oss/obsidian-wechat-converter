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
});

