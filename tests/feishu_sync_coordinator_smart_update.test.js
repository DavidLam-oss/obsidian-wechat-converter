/*
## 核心功能

覆盖 Feishu Sync Coordinator smart update 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护智能覆盖、历史重绑定、写入失败保护和降级新建行为不回归。

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

beforeAll(async () => {
  globalThis.obsidian = obsidianMock;

  const syncMod = await import('../services/feishu-sync.js');
  syncNoteToFeishu = syncMod.syncNoteToFeishu;

  const settingsMod = await import('../services/feishu-settings.js');
  createDefaultFeishuSyncSettings = settingsMod.createDefaultFeishuSyncSettings;
});

describe('Feishu Sync Coordinator smart update recovery', () => {
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

  it('should keep old document content when smart update insertion schema is rejected', async () => {
    settings.uploadHistory = [{
      title: 'test-note',
      url: 'https://feishu.cn/docx/doc_token_456',
      docToken: 'doc_token_456',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { status: 200, json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('blocks?page_size')) {
        if (url.includes('/documents/doc_token_456/blocks?page_size')) {
          return {
            status: 200,
            json: {
              code: 0,
              data: {
                items: [
                  { block_id: 'doc_token_456', parent_id: '', block_type: 1, children: ['block_child_1'] },
                  { block_id: 'block_child_1', parent_id: 'doc_token_456', block_type: 2, text: {} },
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
                { block_id: 'temp_doc_token', parent_id: '', block_type: 1, children: ['temp_paragraph_1'] },
                { block_id: 'temp_paragraph_1', parent_id: 'temp_doc_token', block_type: 2, text: { elements: [{ text_run: { content: 'Updated content.' } }] } },
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
      if (url.includes('/documents/doc_token_456/blocks/doc_token_456/children?document_revision_id=-1')) {
        return {
          status: 400,
          json: { code: 1770006, msg: 'schema mismatch' },
          text: '',
        };
      }
      if (url.includes('/drive/v1/files/temp_doc_token?type=docx') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_file_token?type=file') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/blocks/doc_token_456/children/batch_delete')) {
        throw new Error('old blocks must not be deleted before new blocks are inserted successfully');
      }
      return { status: 200, json: { code: 0 } };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# test-note\nUpdated content.',
    })).rejects.toThrow('schema mismatch');

    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    expect(calls.some((request) => request.url.includes('/children?document_revision_id=-1'))).toBe(true);
    expect(calls.some((request) => request.url.includes('children/batch_delete'))).toBe(false);
    expect(settings.uploadHistory[0].docToken).toBe('doc_token_456');
    expect(warnSpy).toHaveBeenCalledWith(
      '[飞书同步] 智能覆盖写入失败，旧文档内容已保留:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('should not create a duplicate document when Feishu rejects nested children with invalid parameter 9499', async () => {
    settings.uploadHistory = [{
      title: 'test-note',
      url: 'https://feishu.cn/docx/doc_token_456',
      docToken: 'doc_token_456',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    let markdownUploadCount = 0;
    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { status: 200, json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('/documents/doc_token_456/blocks?page_size')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'doc_token_456', parent_id: '', block_type: 1, children: ['old_child_1'] },
                { block_id: 'old_child_1', parent_id: 'doc_token_456', block_type: 2, text: {} },
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
                { block_id: 'temp_doc_token', parent_id: '', block_type: 1, children: ['temp_paragraph_1'] },
                {
                  block_id: 'temp_paragraph_1',
                  parent_id: 'temp_doc_token',
                  block_type: 2,
                  text: { elements: [{ text_run: { content: 'Updated content.' } }] },
                },
              ],
            },
          },
        };
      }
      if (url.includes('files/upload_all')) {
        markdownUploadCount += 1;
        return { status: 200, json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('import_tasks') && options.method === 'POST') {
        return { status: 200, json: { code: 0, data: { ticket: 'ticket_temp_update' } } };
      }
      if (url.includes('/import_tasks/ticket_temp_update')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              result: {
                job_status: 0,
                token: 'temp_doc_token',
                url: 'https://feishu.cn/docx/temp_doc_token',
              },
            },
          },
        };
      }
      if (url.includes('/documents/doc_token_456/blocks/doc_token_456/children?document_revision_id=-1')) {
        return {
          status: 400,
          json: {
            code: 9499,
            msg: 'Invalid parameter type in json: children. Invalid parameter value: {"block_type":12,"bullet":{"elements":[{"text_run":{"content":"清洗数据 (Python)"}}]}}. Please check and modify accordingly.',
          },
          text: '',
        };
      }
      if (url.includes('/drive/v1/files/temp_doc_token?type=docx') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_file_token?type=file') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/blocks/doc_token_456/children/batch_delete')) {
        throw new Error('old blocks must not be deleted when new block insertion is rejected');
      }
      return { status: 200, json: { code: 0 } };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# test-note\nUpdated content.',
    })).rejects.toThrow('Invalid parameter type in json: children');

    const calls = obsidianMock.requestUrl.mock.calls.map((call) => call[0]);
    expect(markdownUploadCount).toBe(1);
    expect(calls.some((request) => request.url.includes('children/batch_delete'))).toBe(false);
    expect(calls.some((request) => request.url.includes('/drive/v1/files/temp_doc_token?type=docx') && request.method === 'DELETE')).toBe(true);
    expect(settings.uploadHistory[0].docToken).toBe('doc_token_456');
    expect(warnSpy).toHaveBeenCalledWith(
      '[飞书同步] 智能覆盖写入失败，旧文档内容已保留:',
      expect.any(Error)
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[飞书同步] 智能覆盖更新失败，降级为新建文档:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('should relink a stale history token from folder and continue smart update', async () => {
    settings.uploadHistory = [{
      title: 'test-note',
      url: 'https://feishu.cn/docx/stale_doc_token',
      docToken: 'stale_doc_token',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { status: 200, json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('files?folder_token')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              files: [
                { type: 'docx', name: 'test-note', token: 'relinked_doc_token' },
              ],
            },
          },
        };
      }
      if (url.includes('/documents/stale_doc_token/blocks?page_size')) {
        return {
          status: 400,
          json: { code: 1770003, msg: 'resource deleted' },
          text: '',
        };
      }
      if (url.includes('/documents/relinked_doc_token/blocks?page_size')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'relinked_doc_token', parent_id: '', block_type: 1, children: ['relinked_child_1'] },
                { block_id: 'relinked_child_1', parent_id: 'relinked_doc_token', block_type: 2, text: { elements: [{ text_run: { content: 'old content' } }] } },
              ],
            },
          },
        };
      }
      if (url.includes('/blocks/relinked_doc_token/children/batch_delete') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
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
      if (url.includes('/documents/temp_doc_token/blocks?page_size')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'temp_doc_token', parent_id: '', block_type: 1, children: ['temp_paragraph_1'] },
                { block_id: 'temp_paragraph_1', parent_id: 'temp_doc_token', block_type: 2, text: { elements: [{ text_run: { content: 'Updated content.' } }] } },
              ],
            },
          },
        };
      }
      if (url.includes('/documents/relinked_doc_token/blocks/relinked_doc_token/children?document_revision_id=-1')) {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_doc_token?type=docx') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_file_token?type=file') && options.method === 'DELETE') {
        return { status: 200, json: { code: 0 } };
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
      markdown: '# test-note\nUpdated content.',
    });

    expect(result.docToken).toBe('relinked_doc_token');
    expect(result.url).toBe('https://open.feishu.cn/docx/relinked_doc_token');
    expect(settings.uploadHistory[0]).toMatchObject({
      docToken: 'relinked_doc_token',
      sourcePath: 'notes/test-note.md',
    });
    expect(warnSpy).toHaveBeenCalledWith('[飞书同步] 检测到历史飞书 token 已失效，已清理本地关联记录');
    warnSpy.mockRestore();
  });

  it('should fall back to creating a new document when smart update deletion fails', async () => {
    settings.uploadHistory = [{
      title: 'test-note',
      url: 'https://feishu.cn/docx/old_doc_token',
      docToken: 'old_doc_token',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    obsidianMock.requestUrl.mockImplementation(async (options) => {
      const url = options.url || '';
      if (url.includes('tenant_access_token')) {
        return { status: 200, json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('blocks?page_size')) {
        return {
          status: 200,
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'old_child_1', parent_id: 'old_doc_token', block_type: 1 },
              ],
            },
          },
        };
      }
      if (url.includes('/blocks/old_doc_token/children/batch_delete') && options.method === 'DELETE') {
        return {
          status: 404,
          text: '404 page not found',
        };
      }
      if (url.includes('files/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('import_tasks')) {
        if (options.method === 'POST') {
          return { status: 200, json: { code: 0, data: { ticket: 'ticket_123' } } };
        }
        return { status: 200, json: { code: 0, data: { result: { job_status: 0, token: 'new_doc_token', url: 'https://feishu.cn/docx/new_doc_token' } } } };
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
      markdown: '# test-note\nUpdated content.',
    });

    expect(result.docToken).toBe('new_doc_token');
    expect(result.url).toBe('https://feishu.cn/docx/new_doc_token');
    expect(settings.uploadHistory[0].docToken).toBe('new_doc_token');
    expect(warnSpy).toHaveBeenCalledWith(
      '[飞书同步] 智能覆盖更新失败，降级为新建文档:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });
});
