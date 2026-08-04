/*
## 核心功能

验证发布目录清理服务的路径安全、frontmatter 清理和删除编排。

## 输入

接收目录模板、frontmatter 数据及 mock Obsidian vault/fileManager。

## 输出

输出服务层断言，保护发布后清理规则脱离视图层后不回归。

## 定位

位于 tests/，覆盖 services/publish-cleanup.js 的独立业务契约。

## 依赖

关键依赖：Vitest、services/publish-cleanup.js。

## 维护规则

- 修改发布清理规则或安全边界时同步更新本测试。
- 删除流程必须覆盖安全拒绝、成功清理和 frontmatter 失败警告。
*/

import { describe, expect, it, vi } from 'vitest';
import {
  cleanupConfiguredDirectory,
  clearInvalidPublishMetaInFrontmatter,
  isPathInsideDirectoryByTail,
  isSafeCleanupDirPath,
  resolveCleanupDirPath,
  shouldClearFrontmatterPathAfterCleanup,
} from '../services/publish-cleanup.js';

describe('publish cleanup service', () => {
  it('resolves note placeholders without accepting an absent context file', () => {
    expect(resolveCleanupDirPath('published/{{note}}_img', { basename: 'post' }))
      .toEqual({ path: 'published/post_img' });
    expect(resolveCleanupDirPath('published/{{note}}_img', null).warning)
      .toContain('{{note}}');
  });

  it('rejects root traversal and the active Obsidian config directory', () => {
    expect(isSafeCleanupDirPath('published/post_img', '.obsidian')).toBe(true);
    expect(isSafeCleanupDirPath('published/../secret', '.obsidian')).toBe(false);
    expect(isSafeCleanupDirPath('.obsidian', '.obsidian')).toBe(false);
    expect(isSafeCleanupDirPath('.obsidian/plugins', '.obsidian')).toBe(false);
  });

  it('matches frontmatter paths when the configured directory has an extra root prefix', () => {
    expect(isPathInsideDirectoryByTail(
      'published/post_img/cover.jpg',
      'Wechat/published/post_img'
    )).toBe(true);
    expect(shouldClearFrontmatterPathAfterCleanup(
      'published/post_img/cover.jpg',
      'Wechat/published/post_img'
    )).toBe(true);
  });

  it('clears only cover fields that point inside the deleted directory', () => {
    const frontmatter = {
      cover: 'published/post_img/cover.jpg',
      CoverDIR: 'published/post_img',
      unrelated: 'published/other/file.jpg',
    };

    expect(clearInvalidPublishMetaInFrontmatter(frontmatter, 'published/post_img')).toBe(true);
    expect(frontmatter).toEqual({
      cover: '',
      CoverDIR: '',
      unrelated: 'published/other/file.jpg',
    });
  });

  it('deletes a safe directory and clears invalid publish metadata', async () => {
    const directory = { path: 'published/post_img' };
    const frontmatter = {
      cover: 'published/post_img/cover.jpg',
      cover_dir: 'published/post_img',
    };
    const trash = vi.fn().mockResolvedValue(undefined);
    const app = {
      vault: {
        configDir: '.obsidian',
        getAbstractFileByPath: vi.fn(() => directory),
        trash,
      },
      fileManager: {
        processFrontMatter: vi.fn(async (_file, update) => update(frontmatter)),
      },
    };

    const result = await cleanupConfiguredDirectory({
      app,
      settings: {
        cleanupAfterSync: true,
        cleanupUseSystemTrash: true,
        cleanupDirTemplate: 'published/{{note}}_img',
      },
      activeFile: { basename: 'post' },
    });

    expect(result).toEqual({
      attempted: true,
      success: true,
      cleanedPath: 'published/post_img',
    });
    expect(trash).toHaveBeenCalledWith(directory, true);
    expect(frontmatter.cover).toBe('');
    expect(frontmatter.cover_dir).toBe('');
  });

  it('does not call the vault delete API for an unsafe directory', async () => {
    const trash = vi.fn();
    const app = {
      vault: {
        configDir: '.obsidian',
        getAbstractFileByPath: vi.fn(),
        trash,
      },
    };

    const result = await cleanupConfiguredDirectory({
      app,
      settings: {
        cleanupAfterSync: true,
        cleanupDirTemplate: '.obsidian',
      },
      activeFile: { basename: 'post' },
    });

    expect(result.success).toBe(false);
    expect(result.warning).toContain('不安全');
    expect(trash).not.toHaveBeenCalled();
    expect(app.vault.getAbstractFileByPath).not.toHaveBeenCalled();
  });
});
