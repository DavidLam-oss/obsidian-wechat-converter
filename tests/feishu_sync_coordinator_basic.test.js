/*
## 核心功能

覆盖 Feishu Sync Coordinator basic import and preparation 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护本地图片准备、Mermaid 处理、基础导入和默认标题行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的飞书同步模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
const obsidianMock = require('obsidian');

if (!obsidianMock.requestUrl || typeof obsidianMock.requestUrl.mockReset !== 'function') {
  obsidianMock.requestUrl = vi.fn();
}

let prepareLocalImagesForFeishu;
let prepareMermaidDiagramsForFeishu;
let syncNoteToFeishu;
let createDefaultFeishuSyncSettings;

function makePngBytes(width = 100, height = 50) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes.buffer;
}

function makeGifBytes(width = 100, height = 50) {
  const bytes = new Uint8Array(10);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes.buffer;
}

beforeAll(async () => {
  globalThis.obsidian = obsidianMock;

  const syncMod = await import('../services/feishu-sync.js');
  prepareLocalImagesForFeishu = syncMod.prepareLocalImagesForFeishu;
  syncNoteToFeishu = syncMod.syncNoteToFeishu;

  const mermaidMod = await import('../services/feishu-mermaid-renderer.js');
  prepareMermaidDiagramsForFeishu = mermaidMod.prepareMermaidDiagramsForFeishu;

  const settingsMod = await import('../services/feishu-settings.js');
  createDefaultFeishuSyncSettings = settingsMod.createDefaultFeishuSyncSettings;
});

describe('Feishu Sync Coordinator basic import and preparation', () => {
  let app;
  let settings;
  let activeFile;

  beforeEach(() => {
    settings = createDefaultFeishuSyncSettings();
    settings.appId = 'app-id';
    settings.appSecret = 'app-secret';
    settings.folderToken = 'folder-token';

    activeFile = {
      path: 'notes/test-note.md',
      basename: 'test-note',
    };

    app = {
      metadataCache: {
        getFirstLinkpathDest: vi.fn(),
      },
      vault: {
        readBinary: vi.fn(),
      },
    };

    obsidianMock.requestUrl.mockReset();
    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('files/upload_all')) {
        return { json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('import_tasks')) {
        if (options.method === 'POST') {
          return { json: { code: 0, data: { ticket: 'ticket_123' } } };
        } else {
          return { json: { code: 0, data: { result: { job_status: 0, token: 'doc_token_456', url: 'https://feishu.cn/docx/doc_token_456' } } } };
        }
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { json: { code: 0, msg: 'success' } };
      }
      if (url.includes('files?folder_token')) {
        return { json: { code: 0, data: { files: [] } } };
      }
      return { json: { code: 0 } };
    });
  });

  it('should prepare local Markdown images as Feishu replacement assets', async () => {
    const localFile = {
      path: 'notes/attachments/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: makePngBytes(100, 50),
    };
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath) => (
      linkpath === 'attachments/local.png' ? localFile : null
    ));
    app.vault.getAbstractFileByPath = vi.fn((filePath) => (
      filePath === 'notes/attachments/local.png' ? localFile : null
    ));
    app.vault.getResourcePath = vi.fn(() => 'app://local/local.png');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

    const result = await prepareLocalImagesForFeishu(
      app,
      activeFile,
      '# Test\n![Local](attachments/local.png)\n![Remote](https://cdn.example.com/a.png)'
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      filename: 'local.png',
      mimeType: 'image/png',
      source: {
        vaultRelativePath: 'notes/attachments/local.png',
      },
    });
    expect(result.assets[0].base64).toBeUndefined();
    expect(result.markdown).toContain('![Local](https://obsidian-wechat-converter.invalid/feishu-local-image/image-1.png)');
    expect(result.markdown).toContain('![Remote](https://cdn.example.com/a.png)');
  });

  it('should prepare Obsidian wiki image embeds with Chinese paths for Feishu replacement', async () => {
    const localFile = {
      path: 'notes/attachments/音乐卡点调整.png',
      name: '音乐卡点调整.png',
      extension: 'png',
      bytes: makePngBytes(100, 50),
    };
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(localFile);
    app.vault.getAbstractFileByPath = vi.fn(() => null);
    app.vault.getResourcePath = vi.fn(() => 'app://local/music.png');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

    const result = await prepareLocalImagesForFeishu(
      app,
      activeFile,
      '![[attachments/音乐卡点调整.png|音乐|510]]'
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets[0]).toMatchObject({
      filename: '音乐卡点调整.png',
      source: {
        vaultRelativePath: 'notes/attachments/音乐卡点调整.png',
      },
    });
    expect(result.assets[0].base64).toBeUndefined();
    expect(result.markdown).toBe('![音乐](https://obsidian-wechat-converter.invalid/feishu-local-image/image-1.png)');
  });

  it('should prepare local GIF files as Feishu replacement assets', async () => {
    const gifFile = {
      path: 'notes/attachments/demo.gif',
      name: 'demo.gif',
      extension: 'gif',
      bytes: makeGifBytes(320, 180),
    };
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(gifFile);
    app.vault.getAbstractFileByPath = vi.fn(() => gifFile);
    app.vault.getResourcePath = vi.fn(() => 'app://local/demo.gif');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

    const result = await prepareLocalImagesForFeishu(
      app,
      activeFile,
      '![Gif](attachments/demo.gif)'
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      filename: 'demo.gif',
      mimeType: 'image/gif',
      source: {
        vaultRelativePath: 'notes/attachments/demo.gif',
      },
    });
    expect(result.assets[0].base64).toBeUndefined();
    expect(result.markdown).toBe('![Gif](https://obsidian-wechat-converter.invalid/feishu-local-image/image-1.gif)');
    expect(app.vault.readBinary).toHaveBeenCalledTimes(1);
  });

  it('should prepare Mermaid fences as Feishu image placeholder assets', async () => {
    const renderMermaidFenceToDataUrl = vi.fn(async () => 'data:image/png;base64,bWVybWFpZA==');

    const result = await prepareMermaidDiagramsForFeishu(
      'Before\n```mermaid\ngraph TD\nA-->B\n```\nAfter',
      {
        renderMermaidFenceToDataUrl,
        localImageSrcFactory: (asset) => `https://obsidian-wechat-converter.invalid/feishu-local-image/${asset.id}.png`,
        notePath: activeFile.path,
      }
    );

    expect(result.warnings).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      id: 'feishu-mermaid-1',
      filename: 'mermaid-diagram-1.png',
      mimeType: 'image/png',
      base64: 'bWVybWFpZA==',
    });
    expect(result.markdown).toContain('![Mermaid diagram 1](https://obsidian-wechat-converter.invalid/feishu-local-image/feishu-mermaid-1.png)');
    expect(result.markdown).not.toContain('```mermaid');
  });

  it('should keep Mermaid source when local rendering is unavailable', async () => {
    const result = await prepareMermaidDiagramsForFeishu(
      '```mermaid\ngraph TD\nA-->B\n```',
      { mermaidApi: null }
    );

    expect(result.assets).toEqual([]);
    expect(result.markdown).toContain('```mermaid');
    expect(result.warnings[0]).toMatchObject({
      code: 'feishu_mermaid_render_unavailable',
      severity: 'info',
    });
  });

  it('should keep Mermaid source when an explicitly injected renderer fails', async () => {
    const renderMermaidFenceToDataUrl = vi.fn(async () => {
      throw new Error('renderer unavailable');
    });

    const result = await prepareMermaidDiagramsForFeishu(
      '```mermaid\ngraph TD\nA-->B\n```',
      { renderMermaidFenceToDataUrl }
    );

    expect(renderMermaidFenceToDataUrl).toHaveBeenCalledTimes(1);
    expect(result.assets).toEqual([]);
    expect(result.markdown).toContain('```mermaid');
    expect(result.warnings[0]).toMatchObject({
      code: 'feishu_mermaid_render_failed',
      severity: 'warning',
    });
  });

  it('should leave missing local images unchanged and report a warning', async () => {
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(null);
    app.vault.getAbstractFileByPath = vi.fn(() => null);

    const result = await prepareLocalImagesForFeishu(
      app,
      activeFile,
      '![Missing](attachments/missing.png)'
    );

    expect(result.markdown).toBe('![Missing](attachments/missing.png)');
    expect(result.warnings.map((warning) => warning.code)).toEqual(['image_local_missing']);
  });

  it('should import new note successfully', async () => {
    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\nSome text.',
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(result.url).toBe('https://feishu.cn/docx/doc_token_456');
    expect(settings.uploadHistory.length).toBe(1);
    expect(settings.uploadHistory[0].docToken).toBe('doc_token_456');
  });

  it('should keep Mermaid source during Feishu sync instead of rasterizing in Obsidian renderer', async () => {
    const mermaidApi = {
      render: vi.fn(async () => ({
        svg: '<svg id="feishu-mermaid-sync" viewBox="0 0 120 80"><rect width="120" height="80"></rect></svg>',
      })),
    };
    const rasterizeSvg = vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,bWVybWFpZA==',
      width: 120,
      height: 80,
      style: '',
    }));

    await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Diagram\n```mermaid\ngraph TD\nA-->B\n```',
      mermaidApi,
      rasterizeSvg,
    });

    const uploadCall = obsidianMock.requestUrl.mock.calls.find((call) => (
      call[0].url.includes('files/upload_all') && call[0].method === 'POST'
    ));
    const bodyText = new TextDecoder().decode(new Uint8Array(uploadCall[0].body));
    expect(mermaidApi.render).not.toHaveBeenCalled();
    expect(rasterizeSvg).not.toHaveBeenCalled();
    expect(bodyText).toContain('```mermaid');
    expect(bodyText).toContain('graph TD');
  });

  it('should render Mermaid as Feishu image assets only when remote-image mode is selected', async () => {
    const renderMermaidFenceToDataUrl = vi.fn(async () => 'data:image/png;base64,bWVybWFpZA==');

    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { status: 200, json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('files/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('import_tasks')) {
        if (options.method === 'POST') {
          return { status: 200, json: { code: 0, data: { ticket: 'ticket_123' } } };
        }
        return { status: 200, json: { code: 0, data: { result: { job_status: 0, token: 'doc_token_456', url: 'https://feishu.cn/docx/doc_token_456' } } } };
      }
      if (url.includes('blocks?page_size')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [{ block_id: 'image_block_1', parent_id: 'doc_token_456', block_type: 27 }],
            },
          },
        };
      }
      if (url.includes('medias/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'mermaid_image_token' } } };
      }
      if (url.includes('/blocks/image_block_1')) {
        return { status: 200, json: { code: 0, data: {} } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Diagram\n```mermaid\ngraph TD\nA-->B\n```',
      mermaidRenderMode: 'remote-image',
      renderMermaidFenceToDataUrl,
    });

    expect(renderMermaidFenceToDataUrl).toHaveBeenCalledTimes(1);
    expect(result.imageSummary).toMatchObject({
      uploaded: 1,
      skipped: 0,
      failed: 0,
    });

    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    const markdownUpload = calls.find((request) => request.url.includes('files/upload_all'));
    const markdownBody = new TextDecoder().decode(new Uint8Array(markdownUpload.body));
    expect(markdownBody).toContain('![Mermaid diagram 1](https://obsidian-wechat-converter.invalid/feishu-local-image/feishu-mermaid-1.png)');
    expect(markdownBody).not.toContain('```mermaid');

    const imageUpload = calls.find((request) => request.url.includes('medias/upload_all'));
    expect(imageUpload).toBeTruthy();
    const imageUploadBody = new TextDecoder().decode(new Uint8Array(imageUpload.body));
    expect(imageUploadBody).toContain('filename="mermaid-diagram-1.png"');
    expect(imageUploadBody).toContain('Content-Type: image/png');
  });

  it('should keep Mermaid source and continue sync when remote rendering fails', async () => {
    const renderMermaidFenceToDataUrl = vi.fn(async () => {
      throw new Error('remote renderer unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Diagram\n```mermaid\ngraph TD\nA-->B\n```',
      mermaidRenderMode: 'remote-image',
      renderMermaidFenceToDataUrl,
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(result.imageSummary.skipped).toBe(1);
    expect(result.imageSummary.details[0]).toMatchObject({
      filename: 'mermaid-diagram-1.png',
      status: 'skipped',
      reason: 'feishu_mermaid_render_failed',
    });

    const uploadCall = obsidianMock.requestUrl.mock.calls.find((call) => (
      call[0].url.includes('files/upload_all') && call[0].method === 'POST'
    ));
    const bodyText = new TextDecoder().decode(new Uint8Array(uploadCall[0].body));
    expect(bodyText).toContain('```mermaid');
    expect(bodyText).toContain('graph TD');

    warnSpy.mockRestore();
  });

  it('should use the Obsidian file basename as the default Feishu document title', async () => {
    await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# 一级标题\nSome text.',
    });

    const importTaskRequest = obsidianMock.requestUrl.mock.calls.find((call) => (
      call[0].url.includes('import_tasks') && call[0].method === 'POST'
    ))[0];
    expect(JSON.parse(importTaskRequest.body).file_name).toBe('test-note');
  });

  it('should prefer an edited title, trim it, and enforce the Feishu title limit', async () => {
    const requestedTitle = `  ${'自定义标题'.repeat(60)}  `;
    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '---\ntitle: Frontmatter 标题\n---\n正文',
      titleOverride: requestedTitle,
    });

    const expectedTitle = requestedTitle.trim().substring(0, 250);
    const importTaskRequest = obsidianMock.requestUrl.mock.calls.find((call) => (
      call[0].url.includes('import_tasks') && call[0].method === 'POST'
    ))[0];
    expect(result.title).toBe(expectedTitle);
    expect(JSON.parse(importTaskRequest.body).file_name).toBe(expectedTitle);
    expect(settings.uploadHistory[0].title).toBe(expectedTitle);
  });

  it('should restore frontmatter title resolution when an edited title is blank', async () => {
    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '---\ntitle: Frontmatter 标题\n---\n正文',
      titleOverride: '   ',
    });

    expect(result.title).toBe('Frontmatter 标题');
  });
});
