/*
## 核心功能

覆盖 converter image resolution 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 converter image resolution 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';
const { createLegacyConverter } = require('./helpers/render-runtime');

function makeApp(files = {}, adapter = {}) {
  const byPath = new Map(Object.entries(files));
  return {
    metadataCache: {
      getFirstLinkpathDest: vi.fn(() => null),
    },
    vault: {
      adapter: {
        basePath: adapter.basePath || '',
      },
      getAbstractFileByPath: vi.fn((filePath) => byPath.get(filePath) || null),
      getResourcePath: vi.fn((file) => `app://local/${encodeURIComponent(file.path)}`),
    },
  };
}

describe('converter local image resolution', () => {
  it('resolves note-relative markdown image paths when metadata cache misses', async () => {
    const imageFile = { path: 'notes/images/a.png', name: 'a.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const html = await converter.convert('![图](images/a.png)');

    expect(html).toContain('app://local/notes%2Fimages%2Fa.png');
  });

  it('resolves same-directory wiki images when metadata cache misses', async () => {
    const imageFile = { path: 'notes/local.png', name: 'local.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const html = await converter.convert('![[local.png]]');

    expect(html).toContain('app://local/notes%2Flocal.png');
  });

  it('resolves decoded Chinese paths with spaces and parentheses', async () => {
    const imageFile = { path: 'notes/images/中文 图(1).png', name: '中文 图(1).png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const src = converter.resolveImagePath('images/%E4%B8%AD%E6%96%87%20%E5%9B%BE(1).png');

    expect(src).toBe('app://local/notes%2Fimages%2F%E4%B8%AD%E6%96%87%20%E5%9B%BE(1).png');
  });

  it('resolves parent-relative markdown image paths', async () => {
    const imageFile = { path: 'assets/pic.png', name: 'pic.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/deep/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const src = converter.resolveImagePath('../../assets/pic.png');

    expect(src).toBe('app://local/assets%2Fpic.png');
  });

  it('resolves local file url paths', async () => {
    const imageFile = { path: 'notes/images/photo.png', name: 'photo.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const src = converter.resolveImagePath('file:///notes/images/photo.png');

    expect(src).toBe('app://local/notes%2Fimages%2Fphoto.png');
  });

  it('resolves vault-absolute local file url paths using adapter basePath', async () => {
    const imageFile = { path: 'notes/images/photo.png', name: 'photo.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp(
      { [imageFile.path]: imageFile },
      { basePath: '/Users/david/MyVault' }
    );

    const src = converter.resolveImagePath('file:///Users/david/MyVault/notes/images/photo.png');

    expect(src).toBe('app://local/notes%2Fimages%2Fphoto.png');
  });

  it('does not incorrectly match vault root file when note at root references ../photo.png', async () => {
    const imageFile = { path: 'photo.png', name: 'photo.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const src = converter.resolveImagePath('../photo.png');

    // 不应错误折叠成 photo.png 并命中根目录文件
    expect(src).toBe('../photo.png');
  });

  describe('H7 回归：resolveVaultImageFile 健壮性', () => {
    const { resolveVaultImageFile } = require('../services/image-source-utils.js');

    it('排除 TFolder：遇到目录对象时不误判为图片文件', () => {
      const folderRecord = { path: 'assets/images', name: 'images', children: [] };
      const app = {
        metadataCache: { getFirstLinkpathDest: vi.fn(() => null) },
        vault: { getAbstractFileByPath: vi.fn((p) => p === 'assets/images' ? folderRecord : null) },
      };

      const result = resolveVaultImageFile(app, 'assets/images', 'notes/post.md');
      expect(result).toBeNull();
    });

    it('移除 Step 4：多级不存在相对路径不会跨目录静默匹配到 vault 中同名图片', () => {
      const unrelatedPhoto = { path: 'archive/2021/cover.png', name: 'cover.png', extension: 'png' };
      const app = {
        metadataCache: {
          getFirstLinkpathDest: vi.fn((link) => {
            // 如果传入纯 basename "cover.png"，模拟全局附件匹配；但完整相对路径时不命中
            if (link === 'cover.png') return unrelatedPhoto;
            return null;
          }),
        },
        vault: { getAbstractFileByPath: vi.fn(() => null) },
      };

      // 用户引用了一个不存在的相对路径 ../nonexistent/assets/cover.png
      const result = resolveVaultImageFile(app, '../nonexistent/assets/cover.png', 'notes/post.md');
      expect(result).toBeNull();
    });
  });
});
