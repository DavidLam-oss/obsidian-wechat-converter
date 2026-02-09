import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AppleStyleView - Frontmatter Publish Meta & Cleanup', () => {
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
        cleanupTarget: 'file',
        cleanupUseSystemTrash: true,
        cleanupRootDir: '',
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

  it('should enforce cleanup path safety guards', () => {
    plugin.settings.cleanupRootDir = 'published';
    expect(view.isSafeCleanupPath('published/post_img/post-cover.jpg', 'file')).toBe(true);
    expect(view.isSafeCleanupPath('published/post_img', 'folder')).toBe(true);

    expect(view.isSafeCleanupPath('published', 'folder')).toBe(false);
    expect(view.isSafeCleanupPath('notes/post_img', 'folder')).toBe(false);
    expect(view.isSafeCleanupPath('published/../secret', 'file')).toBe(false);
    expect(view.isSafeCleanupPath('published/post-assets', 'folder')).toBe(false);
  });

  it('should respect custom cleanup root directory', () => {
    plugin.settings.cleanupRootDir = 'articles';
    expect(view.isSafeCleanupPath('published/post_img/post-cover.jpg', 'file')).toBe(false);
    expect(view.isSafeCleanupPath('articles/post_img/post-cover.jpg', 'file')).toBe(true);
  });

  it('should cleanup cover file after sync and clear frontmatter fields', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'file';
    plugin.settings.cleanupUseSystemTrash = true;
    plugin.settings.cleanupRootDir = 'published';

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
    }, activeFile);

    expect(view.app.vault.trash).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'published/post_img/post-cover.jpg' }),
      true
    );
    expect(result.success).toBe(true);
    expect(frontmatter.cover).toBe('');
    expect(frontmatter.cover_dir).toBe('');
  });

  it('should cleanup folder using cover_dir first in folder mode', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'folder';
    plugin.settings.cleanupRootDir = 'published';

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
    }, activeFile);

    expect(view.app.vault.trash).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'published/post_img' }),
      true
    );
    expect(result.success).toBe(true);
  });

  it('should fallback to dirname(cover) when cleanupTarget=folder and cover_dir is empty', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'folder';
    plugin.settings.cleanupRootDir = 'published';

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: '',
    }, activeFile);

    expect(view.app.vault.trash).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'published/post_img' }),
      true
    );
    expect(result.success).toBe(true);
  });

  it('should return warning (not throw) when cleanup fails', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'file';
    plugin.settings.cleanupRootDir = 'published';
    view.app.vault.trash.mockRejectedValueOnce(new Error('boom'));

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
    }, activeFile);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('删除失败');
  });

  it('should refuse deleting a folder in file mode', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'file';
    plugin.settings.cleanupRootDir = 'published';

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img',
      cover_dir: 'published/post_img',
    }, activeFile);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('不是文件');
    expect(view.app.vault.trash).not.toHaveBeenCalled();
  });

  it('should clear alias frontmatter keys after cleanup success', async () => {
    frontmatter = {
      Cover: 'published/post_img/post-cover.jpg',
      CoverDIR: 'published/post_img',
    };
    view.app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter }));

    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'folder';
    plugin.settings.cleanupRootDir = 'published';

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
    }, activeFile);

    expect(result.success).toBe(true);
    expect(frontmatter.Cover).toBe('');
    expect(frontmatter.CoverDIR).toBe('');
  });

  it('should skip cleanup with warning when cleanup root dir is not configured', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'file';
    plugin.settings.cleanupRootDir = '';

    const result = await view.cleanupCoverAssets({
      cover: 'published/post_img/post-cover.jpg',
      cover_dir: 'published/post_img',
    }, activeFile);

    expect(result.success).toBe(false);
    expect(result.warning).toContain('未配置清理根目录');
    expect(view.app.vault.trash).not.toHaveBeenCalled();
  });

  it('should trigger cleanup only after createDraft succeeds', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'file';
    plugin.settings.cleanupRootDir = 'published';

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
    view.cleanupCoverAssets = vi.fn().mockResolvedValue({ attempted: true, success: true });

    const uploadCoverSpy = vi.spyOn(WechatAPI.prototype, 'uploadCover').mockResolvedValue({ media_id: 'mid_1' });
    const createDraftSpy = vi.spyOn(WechatAPI.prototype, 'createDraft').mockResolvedValue({});

    await view.onSyncToWechat();

    expect(createDraftSpy).toHaveBeenCalledTimes(1);
    expect(view.cleanupCoverAssets).toHaveBeenCalledTimes(1);
    expect(createDraftSpy.mock.invocationCallOrder[0]).toBeLessThan(view.cleanupCoverAssets.mock.invocationCallOrder[0]);

    uploadCoverSpy.mockRestore();
    createDraftSpy.mockRestore();
  });

  it('should not trigger cleanup when createDraft fails', async () => {
    plugin.settings.cleanupAfterSync = true;
    plugin.settings.cleanupTarget = 'file';
    plugin.settings.cleanupRootDir = 'published';

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
    view.cleanupCoverAssets = vi.fn();

    const uploadCoverSpy = vi.spyOn(WechatAPI.prototype, 'uploadCover').mockResolvedValue({ media_id: 'mid_1' });
    const createDraftSpy = vi.spyOn(WechatAPI.prototype, 'createDraft').mockRejectedValue(new Error('create failed'));

    await view.onSyncToWechat();

    expect(createDraftSpy).toHaveBeenCalledTimes(1);
    expect(view.cleanupCoverAssets).not.toHaveBeenCalled();

    uploadCoverSpy.mockRestore();
    createDraftSpy.mockRestore();
  });
});
