import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AppleStyleView - Frontmatter Meta & Configured Directory Cleanup', () => {
  let AppleStyleView;
  let WechatAPI;
  let view;
  let plugin;
  let frontmatter;
  let files;
  let activeFile;

  beforeEach(() => {
    vi.resetModules();
    const obsidianMock = require('obsidian');
    if (obsidianMock?.Notice?.prototype) {
      if (typeof obsidianMock.Notice.prototype.setMessage !== 'function') {
        obsidianMock.Notice.prototype.setMessage = function noop() {};
      }
      if (typeof obsidianMock.Notice.prototype.hide !== 'function') {
        obsidianMock.Notice.prototype.hide = function noop() {};
      }
    }

    const inputModule = require('../input.js');
    AppleStyleView = inputModule.AppleStyleView;
    WechatAPI = inputModule.WechatAPI;

    plugin = {
      settings: {
        cleanupAfterSync: false,
        cleanupUseSystemTrash: true,
        cleanupDirTemplate: '',
        wechatAccounts: [{
          id: 'acc1',
          name: '测试号',
          appId: 'appid',
          appSecret: 'appsecret',
          author: 'tester',
        }],
        defaultAccountId: 'acc1',
        proxyUrl: '',
      },
    };

    view = new AppleStyleView(null, plugin);
    activeFile = { path: 'published/post.md', basename: 'post' };
    frontmatter = {
      excerpt: '这是 frontmatter 摘要',
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
    };

    files = new Map([
      ['published/post_img/post-cover.jpg', { path: 'published/post_img/post-cover.jpg', extension: 'jpg' }],
      ['published/post_img', { path: 'published/post_img' }],
      ['published/single-file.jpg', { path: 'published/single-file.jpg', extension: 'jpg' }],
    ]);

    view.app = {
      metadataCache: {
        getFileCache: vi.fn(() => ({ frontmatter })),
      },
      vault: {
        getAbstractFileByPath: vi.fn((p) => files.get(p) || null),
        getResourcePath: vi.fn((file) => `app://local/${file.path}`),
        trash: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      fileManager: {
        processFrontMatter: vi.fn(async (_file, updater) => {
          updater(frontmatter);
        }),
      },
      workspace: {
        getActiveFile: vi.fn(() => activeFile),
      },
    };
  });

  it('should read excerpt/cover/cover_dir and resolve cover resource from frontmatter', () => {
    const meta = view.getFrontmatterPublishMeta(activeFile);

    expect(meta.excerpt).toBe('这是 frontmatter 摘要');
    expect(meta.cover).toBe('published/post_img/post-cover.jpg');
    expect(meta.cover_dir).toBe('published/post_img');
    expect(meta.coverSrc).toBe('app://local/published/post_img/post-cover.jpg');
  });

  it('should fallback silently when frontmatter cover path cannot be resolved', () => {
    files.delete('published/post_img/post-cover.jpg');

    const meta = view.getFrontmatterPublishMeta(activeFile);

    expect(meta.excerpt).toBe('这是 frontmatter 摘要');
    expect(meta.coverSrc).toBeNull();
  });

  it('should read frontmatter keys with case variants', () => {
    frontmatter = {
      Excerpt: '大小写摘要',
      Cover: 'published/post_img/post-cover.jpg',
      CoverDIR: 'published/post_img',
    };
    view.app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter }));

    const meta = view.getFrontmatterPublishMeta(activeFile);
    expect(meta.excerpt).toBe('大小写摘要');
    expect(meta.cover).toBe('published/post_img/post-cover.jpg');
    expect(meta.cover_dir).toBe('published/post_img');
  });

  it('should resolve cleanup directory with {{note}} placeholder', () => {
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';
    const resolved = view.resolveCleanupDirPath(activeFile);

    expect(resolved.path).toBe('published/post_img');
    expect(resolved.warning).toBeUndefined();
  });

  it('should return warning when {{note}} exists but no active file', () => {
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';
    const resolved = view.resolveCleanupDirPath(null);

    expect(resolved.path).toBe('');
    expect(resolved.warning).toContain('{{note}}');
  });

  it('should enforce cleanup dir safety guards', () => {
    expect(view.isSafeCleanupDirPath('published/post_img')).toBe(true);
    expect(view.isSafeCleanupDirPath('published/../secret')).toBe(false);
    expect(view.isSafeCleanupDirPath('.obsidian')).toBe(false);
    expect(view.isSafeCleanupDirPath('')).toBe(false);
  });

  it('should cleanup configured directory after sync success', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupUseSystemTrash = true;
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';

    const result = await view.cleanupConfiguredDirectory(activeFile);

    expect(view.app.vault.trash).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'published/post_img' }),
      true
    );
    expect(result.success).toBe(true);
    expect(frontmatter.cover).toBe('');
    expect(frontmatter.cover_dir).toBe('');
  });

  it('should skip cleanup with warning when cleanup directory is not configured', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = '';

    const result = await view.cleanupConfiguredDirectory(activeFile);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('未配置清理目录');
    expect(view.app.vault.trash).not.toHaveBeenCalled();
  });

  it('should refuse cleanup when configured path points to a file', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = 'published/single-file.jpg';

    const result = await view.cleanupConfiguredDirectory(activeFile);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('不是目录');
    expect(view.app.vault.trash).not.toHaveBeenCalled();
  });

  it('should return warning (not throw) when cleanup delete fails', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';
    view.app.vault.trash.mockRejectedValueOnce(new Error('boom'));

    const result = await view.cleanupConfiguredDirectory(activeFile);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('删除失败');
  });

  it('should clear only frontmatter paths that are inside cleaned directory', async () => {
    frontmatter = {
      excerpt: '摘要',
      cover: 'assets/shared-cover.jpg',
      cover_dir: 'published/post_img',
      Cover: 'published/post_img/post-cover.jpg',
      CoverDIR: 'published/post_img',
    };
    view.app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter }));

    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';

    const result = await view.cleanupConfiguredDirectory(activeFile);

    expect(result.success).toBe(true);
    expect(frontmatter.cover).toBe('assets/shared-cover.jpg');
    expect(frontmatter.cover_dir).toBe('');
    expect(frontmatter.Cover).toBe('');
    expect(frontmatter.CoverDIR).toBe('');
  });

  it('should return success with warning when frontmatter cleanup fails', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';
    view.app.fileManager.processFrontMatter.mockRejectedValueOnce(new Error('fm failed'));

    const result = await view.cleanupConfiguredDirectory(activeFile);

    expect(result.success).toBe(true);
    expect(result.warning).toContain('frontmatter');
  });

  it('should trigger cleanup only after createDraft succeeds', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';

    view.currentHtml = '<p>正文</p>';
    view.selectedAccountId = 'acc1';
    view.sessionDigest = '摘要';

    view.getFrontmatterPublishMeta = vi.fn(() => ({
      excerpt: '摘要',
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
      coverSrc: 'app://local/published/post_img/post-cover.jpg',
    }));
    view.getFirstImageFromArticle = vi.fn(() => 'app://local/published/post_img/post-cover.jpg');
    view.srcToBlob = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    view.processAllImages = vi.fn().mockResolvedValue('<p>正文</p>');
    view.cleanHtmlForDraft = vi.fn((html) => html);
    view.cleanupConfiguredDirectory = vi.fn().mockResolvedValue({ attempted: true, success: true });

    const uploadCoverSpy = vi.spyOn(WechatAPI.prototype, 'uploadCover').mockResolvedValue({ media_id: 'mid_1' });
    const createDraftSpy = vi.spyOn(WechatAPI.prototype, 'createDraft').mockResolvedValue({});

    await view.onSyncToWechat();

    expect(createDraftSpy).toHaveBeenCalledTimes(1);
    expect(view.cleanupConfiguredDirectory).toHaveBeenCalledTimes(1);
    expect(createDraftSpy.mock.invocationCallOrder[0]).toBeLessThan(view.cleanupConfiguredDirectory.mock.invocationCallOrder[0]);

    uploadCoverSpy.mockRestore();
    createDraftSpy.mockRestore();
  });

  it('should not trigger cleanup when createDraft fails', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupDirTemplate = 'published/{{note}}_img';

    view.currentHtml = '<p>正文</p>';
    view.selectedAccountId = 'acc1';

    view.getFrontmatterPublishMeta = vi.fn(() => ({
      excerpt: '摘要',
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
      coverSrc: 'app://local/published/post_img/post-cover.jpg',
    }));
    view.getFirstImageFromArticle = vi.fn(() => 'app://local/published/post_img/post-cover.jpg');
    view.srcToBlob = vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    view.processAllImages = vi.fn().mockResolvedValue('<p>正文</p>');
    view.cleanHtmlForDraft = vi.fn((html) => html);
    view.cleanupConfiguredDirectory = vi.fn();

    const uploadCoverSpy = vi.spyOn(WechatAPI.prototype, 'uploadCover').mockResolvedValue({ media_id: 'mid_1' });
    const createDraftSpy = vi.spyOn(WechatAPI.prototype, 'createDraft').mockRejectedValue(new Error('create failed'));

    await view.onSyncToWechat();

    expect(createDraftSpy).toHaveBeenCalledTimes(1);
    expect(view.cleanupConfiguredDirectory).not.toHaveBeenCalled();

    uploadCoverSpy.mockRestore();
    createDraftSpy.mockRestore();
  });
});
