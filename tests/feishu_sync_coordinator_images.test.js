/*
## 核心功能

覆盖 Feishu Sync Coordinator image post processing 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护飞书图片后处理、远程图片重传、进度提示和 GIF 上传行为不回归。

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
  syncNoteToFeishu = syncMod.syncNoteToFeishu;

  const settingsMod = await import('../services/feishu-settings.js');
  createDefaultFeishuSyncSettings = settingsMod.createDefaultFeishuSyncSettings;
});

describe('Feishu Sync Coordinator image post processing', () => {
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

  it('should keep the imported document when image block scanning fails after import', async () => {
    const localFile = {
      path: 'notes/attachments/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: makePngBytes(640, 320),
    };
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath) => (
      linkpath === 'attachments/local.png' ? localFile : null
    ));
    app.vault.getAbstractFileByPath = vi.fn((filePath) => (
      filePath === 'notes/attachments/local.png' ? localFile : null
    ));
    app.vault.getResourcePath = vi.fn(() => 'app://local/local.png');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

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
          status: 404,
          json: { code: 404, msg: 'document block not found' },
          text: '',
        };
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { status: 200, json: { code: 0, msg: 'success' } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\n![Local](attachments/local.png)',
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(result.url).toBe('https://feishu.cn/docx/doc_token_456');
    expect(settings.uploadHistory.length).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[飞书同步] 图片后处理跳过，文档正文已导入:',
      expect.any(Error)
    );
    expect(result.imageSummary.failed).toBe(1);
    warnSpy.mockRestore();
  });

  it('should upload prepared local image assets and replace Feishu image blocks', async () => {
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
        return { status: 200, json: { code: 0, data: { file_token: 'image_token_1' } } };
      }
      if (url.includes('/blocks/image_block_1')) {
        return { status: 200, json: { code: 0, data: {} } };
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { status: 200, json: { code: 0, msg: 'success' } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\n![Local](attachments/local.png)',
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(result.imageSummary).toMatchObject({
      uploaded: 1,
      skipped: 0,
      failed: 0,
    });
    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    const markdownUpload = calls.find((request) => request.url.includes('files/upload_all'));
    const markdownBody = new TextDecoder().decode(new Uint8Array(markdownUpload.body));
    expect(markdownBody).toContain('![Local](https://obsidian-wechat-converter.invalid/feishu-local-image/image-1.png)');
    expect(calls.some((request) => request.url.includes('medias/upload_all'))).toBe(true);
    expect(calls.some((request) => request.url.includes('/blocks/image_block_1') && request.method === 'PATCH')).toBe(true);
    const imagePatch = calls.find((request) => request.url.includes('/blocks/image_block_1') && request.method === 'PATCH');
    expect(JSON.parse(imagePatch.body).replace_image).toEqual({
      token: 'image_token_1',
      width: 100,
      height: 50,
      align: 2,
    });
    const imageUpload = calls.find((request) => request.url.includes('medias/upload_all'));
    const imageUploadBody = new TextDecoder().decode(new Uint8Array(imageUpload.body));
    expect(imageUploadBody).toContain('Content-Type: image/png');
  });

  it('should leave remote images to Feishu import without re-uploading them', async () => {
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
        throw new Error('remote images should not trigger image block replacement');
      }
      return { status: 200, json: { code: 0 } };
    });

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\n![Remote](https://cdn.example.com/a.png)',
    });

    expect(result.imageSummary).toEqual({
      uploaded: 0,
      skipped: 0,
      failed: 0,
      details: [],
    });
    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    expect(calls.some((request) => request.url.includes('medias/upload_all'))).toBe(false);
  });

  it('should re-upload remote images when smart updating an existing document', async () => {
    settings.uploadHistory = [{
      title: 'test-note',
      url: 'https://feishu.cn/docx/doc_token_456',
      docToken: 'doc_token_456',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    let didInsertNewBlocks = false;

    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { status: 200, json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('/documents/doc_token_456/blocks?page_size')) {
        if (didInsertNewBlocks) {
          return {
            status: 200,
            json: {
              code: 0,
              data: {
                items: [
                  { block_id: 'doc_token_456', parent_id: '', block_type: 1, children: ['created_heading_1', 'created_remote_image_1'] },
                  { block_id: 'created_heading_1', parent_id: 'doc_token_456', block_type: 3, heading1: { elements: [{ text_run: { content: 'Updated title' } }] } },
                  { block_id: 'created_remote_image_1', parent_id: 'doc_token_456', block_type: 27, image: { token: '', width: 1303, height: 409 } },
                ],
              },
            },
          };
        }
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'doc_token_456', parent_id: '', block_type: 1, children: ['old_child_1'] },
                { block_id: 'old_child_1', parent_id: 'doc_token_456', block_type: 2, text: { elements: [{ text_run: { content: 'old' } }] } },
              ],
            },
          },
        };
      }
      if (url.includes('/documents/temp_doc_token/blocks?page_size')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'temp_doc_token', parent_id: '', block_type: 1, children: ['temp_heading', 'temp_image'] },
                { block_id: 'temp_heading', parent_id: 'temp_doc_token', block_type: 3, heading1: { elements: [{ text_run: { content: 'Updated title' } }] } },
                { block_id: 'temp_image', parent_id: 'temp_doc_token', block_type: 27, image: { token: 'remote_file_token', width: 1303, height: 409, scale: 1 } },
              ],
            },
          },
        };
      }
      if (url.includes('files/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('import_tasks') && options.method === 'POST') {
        return { status: 200, json: { code: 0, data: { ticket: 'ticket_temp_update' } } };
      }
      if (url.includes('/import_tasks/ticket_temp_update')) {
        return { status: 200, json: { code: 0, data: { result: { job_status: 0, token: 'temp_doc_token', url: 'https://feishu.cn/docx/temp_doc_token' } } } };
      }
      if (url.includes('/documents/doc_token_456/blocks/doc_token_456/children?document_revision_id=-1') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        expect(body).toEqual({
          index: 1,
          children: [
            { block_type: 3, heading1: { elements: [{ text_run: { content: 'Updated title' } }] } },
            { block_type: 27, image: { file_token: 'remote_file_token', width: 1303, height: 409 } },
          ],
        });
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              children: [
                { block_id: 'created_heading_1', block_type: 3, parent_id: 'doc_token_456' },
                { block_id: 'created_remote_image_1', block_type: 27, parent_id: 'doc_token_456', image: { token: '', width: 1303, height: 409 } },
              ],
            },
          },
        };
      }
      if (url.includes('/blocks/doc_token_456/children/batch_delete') && options.method === 'DELETE') {
        didInsertNewBlocks = true;
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_doc_token?type=docx') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_file_token?type=file') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url === 'https://cdn.example.com/remote.png') {
        return {
          status: 200,
          headers: { 'content-type': 'image/png' },
          arrayBuffer: makePngBytes(1303, 409),
        };
      }
      if (url.includes('medias/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'reuploaded_remote_image_token' } } };
      }
      if (url.includes('/documents/doc_token_456/blocks/created_remote_image_1?document_revision_id=-1') && options.method === 'PATCH') {
        return { status: 200, json: { code: 0, data: {} } };
      }
      return { status: 200, json: { code: 0 } };
    });

    try {
      const result = await syncNoteToFeishu({
        app,
        settings,
        activeFile,
        markdown: '# test-note\n![bob](https://cdn.example.com/remote.png)',
      });

      expect(result.docToken).toBe('doc_token_456');
      expect(result.imageSummary).toMatchObject({
        uploaded: 1,
        skipped: 0,
        failed: 0,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
      expect(calls.some((request) => request.url === 'https://cdn.example.com/remote.png')).toBe(true);
      expect(calls.some((request) => request.url.includes('medias/upload_all'))).toBe(true);
      const imagePatch = calls.find((request) => request.url.includes('/documents/doc_token_456/blocks/created_remote_image_1?document_revision_id=-1') && request.method === 'PATCH');
      expect(JSON.parse(imagePatch.body).replace_image).toEqual({
        token: 'reuploaded_remote_image_token',
        width: 1303,
        height: 409,
        align: 2,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should replace local images at their original markdown image block positions', async () => {
    const localFile = {
      path: 'notes/attachments/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: makePngBytes(640, 320),
    };
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath) => (
      linkpath === 'attachments/local.png' ? localFile : null
    ));
    app.vault.getAbstractFileByPath = vi.fn((filePath) => (
      filePath === 'notes/attachments/local.png' ? localFile : null
    ));
    app.vault.getResourcePath = vi.fn(() => 'app://local/local.png');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

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
              items: [
                { block_id: 'remote_image_block', parent_id: 'doc_token_456', block_type: 27 },
                { block_id: 'local_image_block', parent_id: 'doc_token_456', block_type: 27 },
              ],
            },
          },
        };
      }
      if (url.includes('medias/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'image_token_1' } } };
      }
      if (url.includes('/blocks/local_image_block')) {
        return { status: 200, json: { code: 0, data: {} } };
      }
      if (url.includes('/blocks/remote_image_block')) {
        throw new Error('remote image block must not be replaced by local image upload');
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { status: 200, json: { code: 0, msg: 'success' } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: [
        '# Test Note',
        '![Remote](https://cdn.example.com/a.png)',
        '![Local](attachments/local.png)',
      ].join('\n'),
    });

    expect(result.imageSummary).toMatchObject({
      uploaded: 1,
      skipped: 0,
      failed: 0,
    });
    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    expect(calls.some((request) => request.url.includes('/blocks/remote_image_block'))).toBe(false);
    expect(calls.some((request) => request.url.includes('/blocks/local_image_block') && request.method === 'PATCH')).toBe(true);
    const imagePatch = calls.find((request) => request.url.includes('/blocks/local_image_block') && request.method === 'PATCH');
    expect(JSON.parse(imagePatch.body).replace_image).toEqual({
      token: 'image_token_1',
      width: 640,
      height: 320,
      align: 2,
    });
  });

  it('should keep wiki image and relative image replacements aligned after a remote image', async () => {
    const wikiFile = {
      path: 'notes/attachments/音乐卡点调整.png',
      name: '音乐卡点调整.png',
      extension: 'png',
      bytes: makePngBytes(1000, 500),
    };
    const relativeFile = {
      path: 'notes/attachments/打工.png',
      name: '打工.png',
      extension: 'png',
      bytes: makePngBytes(800, 400),
    };
    const gifFile = {
      path: 'notes/测试.gif',
      name: '测试.gif',
      extension: 'gif',
      bytes: makeGifBytes(480, 270),
    };
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath) => {
      if (linkpath === 'attachments/音乐卡点调整.png') return wikiFile;
      if (linkpath === 'attachments/打工.png') return relativeFile;
      if (linkpath === '测试.gif') return gifFile;
      return null;
    });
    app.vault.getAbstractFileByPath = vi.fn((filePath) => {
      if (filePath === 'notes/attachments/音乐卡点调整.png') return wikiFile;
      if (filePath === 'notes/attachments/打工.png') return relativeFile;
      if (filePath === 'notes/测试.gif') return gifFile;
      return null;
    });
    app.vault.getResourcePath = vi.fn((file) => `app://local/${encodeURIComponent(file.path)}`);
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

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
              items: [
                { block_id: 'remote_image_block', parent_id: 'doc_token_456', block_type: 27 },
                { block_id: 'wiki_image_block', parent_id: 'doc_token_456', block_type: 27 },
                { block_id: 'relative_image_block', parent_id: 'doc_token_456', block_type: 27 },
                { block_id: 'gif_image_block', parent_id: 'doc_token_456', block_type: 27 },
              ],
            },
          },
        };
      }
      if (url.includes('medias/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: url.includes('token-two') ? 'image_token_2' : 'image_token_1' } } };
      }
      if (url.includes('/blocks/wiki_image_block') || url.includes('/blocks/relative_image_block') || url.includes('/blocks/gif_image_block')) {
        return { status: 200, json: { code: 0, data: {} } };
      }
      if (url.includes('/blocks/remote_image_block')) {
        throw new Error('non-local prepared image block must not be replaced');
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { status: 200, json: { code: 0, msg: 'success' } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: [
        '# Test Note',
        '![Remote](https://cdn.example.com/a.png)',
        '![[attachments/音乐卡点调整.png|音乐|510]]',
        '![测试](attachments/打工.png)',
        '![不对](测试.gif)',
      ].join('\n'),
    });

    expect(result.imageSummary).toMatchObject({
      uploaded: 3,
      skipped: 0,
      failed: 0,
    });
    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    const markdownUpload = calls.find((request) => request.url.includes('files/upload_all'));
    const markdownBody = new TextDecoder().decode(new Uint8Array(markdownUpload.body));
    expect(markdownBody).toContain('![音乐](https://obsidian-wechat-converter.invalid/feishu-local-image/image-1.png)');
    expect(markdownBody).toContain('![测试](https://obsidian-wechat-converter.invalid/feishu-local-image/image-2.png)');
    expect(markdownBody).toContain('![不对](https://obsidian-wechat-converter.invalid/feishu-local-image/image-3.gif)');
    expect(calls.some((request) => request.url.includes('/blocks/remote_image_block'))).toBe(false);
    expect(calls.some((request) => request.url.includes('/blocks/wiki_image_block') && request.method === 'PATCH')).toBe(true);
    expect(calls.some((request) => request.url.includes('/blocks/relative_image_block') && request.method === 'PATCH')).toBe(true);
    expect(calls.some((request) => request.url.includes('/blocks/gif_image_block') && request.method === 'PATCH')).toBe(true);
    const wikiPatch = calls.find((request) => request.url.includes('/blocks/wiki_image_block') && request.method === 'PATCH');
    expect(JSON.parse(wikiPatch.body).replace_image).toEqual({
      token: 'image_token_1',
      width: 1000,
      height: 500,
      align: 2,
    });
    const relativePatch = calls.find((request) => request.url.includes('/blocks/relative_image_block') && request.method === 'PATCH');
    expect(JSON.parse(relativePatch.body).replace_image).toEqual({
      token: 'image_token_1',
      width: 800,
      height: 400,
      align: 2,
    });
    const gifPatch = calls.find((request) => request.url.includes('/blocks/gif_image_block') && request.method === 'PATCH');
    expect(JSON.parse(gifPatch.body).replace_image).toEqual({
      token: 'image_token_1',
      width: 480,
      height: 270,
      align: 2,
    });
  });

  it('should report Feishu image progress without exposing filenames', async () => {
    const localFile = {
      path: 'notes/attachments/local.png',
      name: 'local.png',
      extension: 'png',
      bytes: makePngBytes(640, 320),
    };
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath) => (
      linkpath === 'attachments/local.png' ? localFile : null
    ));
    app.vault.getAbstractFileByPath = vi.fn((filePath) => (
      filePath === 'notes/attachments/local.png' ? localFile : null
    ));
    app.vault.getResourcePath = vi.fn(() => 'app://local/local.png');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

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
        return { status: 200, json: { code: 0, data: { file_token: 'image_token_1' } } };
      }
      if (url.includes('/blocks/image_block_1')) {
        return { status: 200, json: { code: 0, data: {} } };
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { status: 200, json: { code: 0, msg: 'success' } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const progressMessages = [];
    await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\n![Local|320](attachments/local.png)',
      onProgress: (_stage, message) => {
        progressMessages.push(message);
      },
    });

    expect(progressMessages).toContain('正在同步正文图片 (1/1)...');
    expect(progressMessages.some((message) => String(message).includes('local.png'))).toBe(false);
  });

  it('should upload local GIF placeholders during Feishu image post-processing', async () => {
    const gifFile = {
      path: 'notes/attachments/demo.gif',
      name: 'demo.gif',
      extension: 'gif',
      bytes: makeGifBytes(300, 200),
    };
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(gifFile);
    app.vault.getAbstractFileByPath = vi.fn(() => gifFile);
    app.vault.getResourcePath = vi.fn(() => 'app://local/demo.gif');
    app.vault.readBinary.mockImplementation(async (file) => file.bytes);

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
        return { status: 200, json: { code: 0, data: { file_token: 'image_token_1' } } };
      }
      if (url.includes('/blocks/image_block_1')) {
        return { status: 200, json: { code: 0, data: {} } };
      }
      if (url.includes('permissions') && url.includes('transfer_owner')) {
        return { status: 200, json: { code: 0, msg: 'success' } };
      }
      return { status: 200, json: { code: 0 } };
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\n![Gif](attachments/demo.gif)',
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(result.imageSummary.uploaded).toBe(1);
    expect(result.imageSummary.skipped).toBe(0);
    expect(result.imageSummary.failed).toBe(0);
    expect(app.vault.readBinary).toHaveBeenCalled();
    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    expect(calls.some((request) => request.url.includes('medias/upload_all'))).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('should prefer vault bytes over asset base64 when uploading local GIFs', async () => {
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
        const bodyText = new TextDecoder().decode(new Uint8Array(options.body));
        expect(bodyText).toContain('filename="demo.gif"');
        expect(bodyText).not.toContain('not-a-real-gif');
        return { status: 200, json: { code: 0, data: { file_token: 'image_token_1' } } };
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
      markdown: '# Test Note\n![Gif](attachments/demo.gif)',
      renderMermaidFenceToDataUrl: async () => 'data:image/png;base64,bm90LWEtcmVhbC1naWY=',
    });

    expect(result.imageSummary).toMatchObject({
      uploaded: 1,
      failed: 0,
    });
    expect(app.vault.readBinary).toHaveBeenCalledTimes(2);
  });
});
