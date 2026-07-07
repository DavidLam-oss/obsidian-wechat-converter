/*
## 核心功能

覆盖 article image assets 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 article image assets 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';
const path = require('path');
const { pathToFileURL } = require('url');

const {
  collectArticleImageReferences,
  findAssetForCover,
  findAssetForRenderedSrc,
  mapAppUrlImagesToAssetUrls,
  replaceArticleContentImageSources,
  resolveArticleImages,
} = require('../services/article-image-assets');

function pngBytes(size = 16) {
  const bytes = Buffer.alloc(size);
  bytes[0] = 0x89;
  bytes.write('PNG', 1, 'ascii');
  return bytes;
}

function makeApp(files = {}, options = {}) {
  const byPath = new Map(Object.entries(files));
  return {
    metadataCache: {
      getFirstLinkpathDest: vi.fn((linkpath) => byPath.get(linkpath) || null),
    },
    vault: {
      adapter: {
        basePath: options.basePath || '',
      },
      getAbstractFileByPath: vi.fn((filePath) => byPath.get(filePath) || null),
      getResourcePath: vi.fn((file) => `app://local/${encodeURIComponent(file.path)}`),
      readBinary: vi.fn(async (file) => file.bytes),
    },
  };
}

describe('article image asset resolver', () => {
  it('collects markdown and wikilink image references', () => {
    const refs = collectArticleImageReferences('a ![[img one.png|示例]] b [[plain.jpg|普通双链]] c [[note]] d ![alt](https://example.com/a.png)');

    expect(refs.map((ref) => ({ type: ref.type, src: ref.src, alt: ref.alt }))).toEqual([
      { type: 'wiki', src: 'img one.png', alt: '示例' },
      { type: 'wiki-link', src: 'plain.jpg', alt: '普通双链' },
      { type: 'markdown', src: 'https://example.com/a.png', alt: 'alt' },
    ]);
  });

  it('drops trailing size hints from wiki image embed aliases', () => {
    const refs = collectArticleImageReferences('a ![[img one.png|示例|510]] b ![[img two.png|400]]');

    expect(refs.map((ref) => ({ src: ref.src, alt: ref.alt }))).toEqual([
      { src: 'img one.png', alt: '示例' },
      { src: 'img two.png', alt: '400' },
    ]);
  });

  it('ignores image-looking markdown inside fenced code blocks', () => {
    const refs = collectArticleImageReferences([
      '```md',
      '![example](local.png)',
      '![[also-local.png]]',
      '```',
      '',
      '![real](real.png)',
    ].join('\n'));

    expect(refs.map((ref) => ref.src)).toEqual(['real.png']);
  });

  it('ignores image-looking markdown inside inline code spans', () => {
    const refs = collectArticleImageReferences(
      '流程 `![[本地图片.png]]` 和 `![remote](https://example.com/a.png)`，正文 ![[real.png]]'
    );

    expect(refs.map((ref) => ref.src)).toEqual(['real.png']);
  });

  it('turns local wikilinks and relative markdown images into bridge assets', async () => {
    const imageFile = {
      path: 'notes/assets/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: pngBytes(24),
    };
    const app = makeApp({
      'assets/local.png': imageFile,
      'notes/assets/local.png': imageFile,
    });

    const result = await resolveArticleImages(
      '![[assets/local.png|图一]]\n\n![again](assets/local.png)\n\n![remote](https://cdn.example.com/a.png)',
      { path: 'notes/post.md', basename: 'post' },
      { app }
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      id: 'image-1',
      filename: 'local.png',
      mimeType: 'image/png',
      size: 24,
      source: {
        kind: 'obsidian-local',
        originalSrc: 'assets/local.png',
        notePath: 'notes/post.md',
        vaultRelativePath: 'notes/assets/local.png',
      },
    });
    expect(result.markdown).toContain('![图一](asset://image-1)');
    expect(result.markdown).toContain('![again](asset://image-1)');
    expect(result.markdown).toContain('![remote](https://cdn.example.com/a.png)');
  });

  it('resolves file URLs only when they point inside the current vault', async () => {
    const basePath = path.resolve('/tmp/owc-vault');
    const imageFile = {
      path: 'assets/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: pngBytes(24),
    };
    const app = makeApp({ 'assets/local.png': imageFile }, { basePath });
    const fileUrl = pathToFileURL(path.join(basePath, 'assets/local.png')).toString();

    const result = await resolveArticleImages(
      `![from file url](${fileUrl})`,
      { path: 'post.md', basename: 'post' },
      { app }
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].source.vaultRelativePath).toBe('assets/local.png');
    expect(result.markdown).toContain('![from file url](asset://image-1)');
  });

  it('resolves encoded file URLs inside the vault', async () => {
    const basePath = path.resolve('/tmp/owc-vault');
    const imageFile = {
      path: 'assets/local image.png',
      name: 'local image.png',
      extension: 'png',
      bytes: pngBytes(24),
    };
    const app = makeApp({ 'assets/local image.png': imageFile }, { basePath });
    const fileUrl = pathToFileURL(path.join(basePath, 'assets/local image.png')).toString();

    const result = await resolveArticleImages(
      `![from file url](${fileUrl})`,
      { path: 'post.md', basename: 'post' },
      { app }
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].source.vaultRelativePath).toBe('assets/local image.png');
    expect(result.markdown).toContain('![from file url](asset://image-1)');
  });

  it('rejects file URLs outside the current vault', async () => {
    const basePath = path.resolve('/tmp/owc-vault');
    const app = makeApp({}, { basePath });
    const fileUrl = pathToFileURL(path.resolve('/tmp/outside/local.png')).toString();

    const result = await resolveArticleImages(
      `![outside](${fileUrl})`,
      { path: 'post.md', basename: 'post' },
      { app }
    );

    expect(result.assets).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.code)).toEqual(['image_outside_vault_unsupported']);
  });

  it('turns Obsidian image wikilinks with Chinese paths and width hints into bridge assets', async () => {
    const imageFile = {
      path: 'Wechat/To-be-used/Project_Obsidian入门48_剪藏图片外链处理/attachments/6142f41a7643ed1da56cac43ad8d0359_MD5.png',
      name: '6142f41a7643ed1da56cac43ad8d0359_MD5.png',
      extension: 'png',
      bytes: pngBytes(24),
    };
    const app = makeApp({
      [imageFile.path]: imageFile,
    });

    const result = await resolveArticleImages(
      `![[${imageFile.path}|400]]`,
      { path: 'Wechat/To-be-used/post.md', basename: 'post' },
      { app }
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      id: 'image-1',
      filename: '6142f41a7643ed1da56cac43ad8d0359_MD5.png',
      source: {
        originalSrc: imageFile.path,
        vaultRelativePath: imageFile.path,
      },
    });
    expect(result.markdown).toBe('![400](asset://image-1)');
  });

  it('turns plain wikilinks that point to images into bridge assets', async () => {
    const imageFile = {
      path: 'notes/assets/plain local.png',
      name: 'plain local.png',
      extension: 'png',
      bytes: pngBytes(24),
    };
    const app = makeApp({
      'plain local.png': imageFile,
      'assets/plain local.png': imageFile,
      'notes/assets/plain local.png': imageFile,
    });

    const result = await resolveArticleImages(
      '正文 [[assets/plain local.png|普通双链图片]] 和 [[普通笔记]]',
      { path: 'notes/post.md', basename: 'post' },
      { app }
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.markdown).toContain('![普通双链图片](asset://image-1)');
    expect(result.markdown).toContain('[[普通笔记]]');
  });

  it('resolves a local cover and reuses the body asset when it points to the same file', async () => {
    const imageFile = {
      path: 'notes/assets/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: pngBytes(24),
    };
    const app = makeApp({
      'assets/local.png': imageFile,
      'notes/assets/local.png': imageFile,
    });

    const result = await resolveArticleImages('![正文图](assets/local.png)', { path: 'notes/post.md' }, {
      app,
      cover: 'assets/local.png',
    });

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.markdown).toBe('![正文图](asset://image-1)');
    expect(result.cover).toBe('asset://image-1');
  });

  it('adds a frontmatter-only local cover as an asset', async () => {
    const coverFile = {
      path: 'covers/post-cover.jpg',
      name: 'post-cover.jpg',
      extension: 'jpg',
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    };
    const app = makeApp({ 'covers/post-cover.jpg': coverFile });

    const result = await resolveArticleImages('正文', { path: 'post.md' }, {
      app,
      cover: 'covers/post-cover.jpg',
    });

    expect(result.warnings).toEqual([]);
    expect(result.cover).toBe('asset://image-1');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      id: 'image-1',
      filename: 'post-cover.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('reports missing and oversized local images before bridge delivery', async () => {
    const imageFile = {
      path: 'big.png',
      name: 'big.png',
      extension: 'png',
      bytes: pngBytes(8),
    };
    const app = makeApp({ 'big.png': imageFile });

    const result = await resolveArticleImages('![big](big.png)\n\n![missing](missing.png)', { path: 'post.md' }, {
      app,
      maxImageSizeBytes: 4,
    });

    expect(result.assets).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'image_too_large',
      'image_local_missing',
    ]);
  });

  it('rewrites prepared HTML local image src values with asset placeholders', () => {
    const html = '<p><img src="app://local/notes%2Fassets%2Flocal.png" alt="x"></p>';
    const output = replaceArticleContentImageSources(html, [{
      id: 'image-1',
      source: {
        originalSrc: 'assets/local.png',
        resourceSrc: 'app://local/notes%2Fassets%2Flocal.png',
        vaultRelativePath: 'notes/assets/local.png',
      },
    }]);

    expect(output).toContain('src="asset://image-1"');
  });

  describe('bridge flow helpers (findAssetForRenderedSrc / mapAppUrlImagesToAssetUrls)', () => {
    const sampleAsset = {
      id: 'image-7',
      source: {
        originalSrc: 'Wechat/img/cover.png',
        resourceSrc: 'app://abc/Wechat/img/cover.png',
        vaultRelativePath: 'Wechat/img/cover.png',
      },
    };

    it('findAssetForRenderedSrc: exact resourceSrc match', () => {
      const found = findAssetForRenderedSrc('app://abc/Wechat/img/cover.png', [sampleAsset]);
      expect(found).toBe(sampleAsset);
    });

    it('findAssetForRenderedSrc: ignores cache-buster query / hash on resourceSrc', () => {
      const renderedWithQuery = 'app://abc/Wechat/img/cover.png?1700000000000';
      expect(findAssetForRenderedSrc(renderedWithQuery, [sampleAsset])).toBe(sampleAsset);
    });

    it('findAssetForRenderedSrc: vaultRelativePath suffix match when resourceSrc differs', () => {
      const asset = {
        id: 'image-9',
        source: {
          originalSrc: 'attachments/photo.jpg',
          // resourceSrc was generated with a different vault id
          resourceSrc: 'app://OLD/attachments/photo.jpg',
          vaultRelativePath: 'attachments/photo.jpg',
        },
      };
      const found = findAssetForRenderedSrc('app://NEW/attachments/photo.jpg', [asset]);
      expect(found).toBe(asset);
    });

    it('findAssetForRenderedSrc: returns null when no asset matches', () => {
      expect(findAssetForRenderedSrc('app://abc/totally/unrelated.png', [sampleAsset])).toBeNull();
    });

    it('findAssetForRenderedSrc: handles URL-encoded vault paths', () => {
      const asset = {
        id: 'image-10',
        source: {
          originalSrc: 'Wechat/中文图.png',
          resourceSrc: 'app://abc/Wechat/%E4%B8%AD%E6%96%87%E5%9B%BE.png',
          vaultRelativePath: 'Wechat/中文图.png',
        },
      };
      const found = findAssetForRenderedSrc(
        'app://abc/Wechat/%E4%B8%AD%E6%96%87%E5%9B%BE.png?42',
        [asset],
      );
      expect(found).toBe(asset);
    });

    it('mapAppUrlImagesToAssetUrls: rewrites app:// to asset://<id>', () => {
      const html = '<p><img src="app://abc/Wechat/img/cover.png" alt="cover"></p>';
      const out = mapAppUrlImagesToAssetUrls(html, [sampleAsset]);
      expect(out).toContain('src="asset://image-7"');
      expect(out).not.toContain('app://');
    });

    it('mapAppUrlImagesToAssetUrls: NEVER produces data:image base64 (regression for double-encoding bug)', () => {
      const html = '<p><img src="app://abc/Wechat/img/cover.png"><img src="app://abc/another/x.jpg"></p>';
      const out = mapAppUrlImagesToAssetUrls(html, [sampleAsset]);
      expect(out).not.toMatch(/data:image\/[a-z]+;base64,/i);
    });

    it('mapAppUrlImagesToAssetUrls: leaves https:// and data: srcs untouched', () => {
      const html = [
        '<img src="https://example.com/remote.jpg">',
        '<img src="data:image/png;base64,iVBOR...">',
      ].join('');
      const out = mapAppUrlImagesToAssetUrls(html, [sampleAsset]);
      expect(out).toContain('src="https://example.com/remote.jpg"');
      expect(out).toContain('src="data:image/png;base64,iVBOR..."');
    });

    it('mapAppUrlImagesToAssetUrls: keeps unmatched app:// src as-is (no silent base64 inlining)', () => {
      const html = '<p><img src="app://abc/totally/unknown.png" alt="orphan"></p>';
      const out = mapAppUrlImagesToAssetUrls(html, [sampleAsset]);
      expect(out).toContain('src="app://abc/totally/unknown.png"');
      expect(out).not.toContain('asset://');
    });

    it('mapAppUrlImagesToAssetUrls: handles capacitor:// (mobile) the same way as app://', () => {
      const html = '<img src="capacitor://localhost/Wechat/img/cover.png">';
      const out = mapAppUrlImagesToAssetUrls(html, [{
        id: 'image-mob',
        source: {
          originalSrc: 'Wechat/img/cover.png',
          resourceSrc: 'capacitor://localhost/Wechat/img/cover.png',
          vaultRelativePath: 'Wechat/img/cover.png',
        },
      }]);
      expect(out).toContain('src="asset://image-mob"');
    });

    it('mapAppUrlImagesToAssetUrls: empty / null input is safe', () => {
      expect(mapAppUrlImagesToAssetUrls('', [sampleAsset])).toBe('');
      expect(mapAppUrlImagesToAssetUrls(null, [sampleAsset])).toBe('');
      expect(mapAppUrlImagesToAssetUrls('<img src="app://x/y.png">', [])).toContain('app://x/y.png');
    });

    it('findAssetForCover: returns matching asset for asset://<id> cover', () => {
      expect(findAssetForCover('asset://image-7', [sampleAsset])).toBe(sampleAsset);
    });

    it('findAssetForCover: returns null for asset://<id> with no matching id', () => {
      expect(findAssetForCover('asset://image-999', [sampleAsset])).toBeNull();
    });

    it('findAssetForCover: returns null for non-asset covers (https / data / empty)', () => {
      expect(findAssetForCover('https://example.com/cover.jpg', [sampleAsset])).toBeNull();
      expect(findAssetForCover('data:image/png;base64,iVBOR...', [sampleAsset])).toBeNull();
      expect(findAssetForCover('', [sampleAsset])).toBeNull();
      expect(findAssetForCover(null, [sampleAsset])).toBeNull();
    });

    it('findAssetForCover: returns null when assets list is empty / malformed', () => {
      expect(findAssetForCover('asset://image-7', [])).toBeNull();
      expect(findAssetForCover('asset://image-7', null)).toBeNull();
      expect(findAssetForCover('asset://', [sampleAsset])).toBeNull();
    });
  });
});
