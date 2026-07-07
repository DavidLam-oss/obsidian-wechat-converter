/*
## 核心功能

覆盖 feishu sync 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 feishu sync 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
const obsidianMock = require('obsidian');

// Mock requestUrl BEFORE requiring modules under test so they destructure the spy
obsidianMock.requestUrl = vi.fn();

let FeishuApiClient;
let stripYamlFrontmatter;
let parseYamlTitle;
let convertWikilinks;
let convertObsidianImageSyntax;
let extractImagesFromMarkdown;
let prepareLocalImagesForFeishu;
let prepareMermaidDiagramsForFeishu;
let syncNoteToFeishu;
let createDefaultFeishuSyncSettings;
let FEISHU_FREE_MONTHLY_API_LIMIT;
let normalizeFeishuSyncSettings;
let incrementFeishuApiUsage;
let resetFeishuApiUsage;
let parseFeishuDocUrlOrToken;
let rebindFeishuHistoryByPath;
let getFeishuMermaidPreferenceByPath;
let setFeishuMermaidPreferenceByPath;
let removeFeishuMermaidPreferenceByPath;
let getFeishuDirectChildBlocks;
let summarizeFeishuBlockChunk;
let buildFeishuCreatePayloadBlocks;

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

  const apiMod = await import('../services/feishu-api.js');
  FeishuApiClient = apiMod.FeishuApiClient;

  const processorMod = await import('../services/feishu-markdown-processor.js');
  stripYamlFrontmatter = processorMod.stripYamlFrontmatter;
  parseYamlTitle = processorMod.parseYamlTitle;
  convertWikilinks = processorMod.convertWikilinks;
  convertObsidianImageSyntax = processorMod.convertObsidianImageSyntax;
  extractImagesFromMarkdown = processorMod.extractImagesFromMarkdown;

  const syncMod = await import('../services/feishu-sync.js');
  prepareLocalImagesForFeishu = syncMod.prepareLocalImagesForFeishu;
  syncNoteToFeishu = syncMod.syncNoteToFeishu;

  const mermaidMod = await import('../services/feishu-mermaid-renderer.js');
  prepareMermaidDiagramsForFeishu = mermaidMod.prepareMermaidDiagramsForFeishu;

  const settingsMod = await import('../services/feishu-settings.js');
  createDefaultFeishuSyncSettings = settingsMod.createDefaultFeishuSyncSettings;
  FEISHU_FREE_MONTHLY_API_LIMIT = settingsMod.FEISHU_FREE_MONTHLY_API_LIMIT;
  normalizeFeishuSyncSettings = settingsMod.normalizeFeishuSyncSettings;
  incrementFeishuApiUsage = settingsMod.incrementFeishuApiUsage;
  resetFeishuApiUsage = settingsMod.resetFeishuApiUsage;
  parseFeishuDocUrlOrToken = settingsMod.parseFeishuDocUrlOrToken;
  rebindFeishuHistoryByPath = settingsMod.rebindFeishuHistoryByPath;
  getFeishuMermaidPreferenceByPath = settingsMod.getFeishuMermaidPreferenceByPath;
  setFeishuMermaidPreferenceByPath = settingsMod.setFeishuMermaidPreferenceByPath;
  removeFeishuMermaidPreferenceByPath = settingsMod.removeFeishuMermaidPreferenceByPath;
  getFeishuDirectChildBlocks = syncMod.getFeishuDirectChildBlocks;
  summarizeFeishuBlockChunk = syncMod.summarizeFeishuBlockChunk;
  buildFeishuCreatePayloadBlocks = syncMod.buildFeishuCreatePayloadBlocks;
});

describe('Feishu Markdown Processor', () => {
  it('should strip YAML frontmatter', () => {
    const md = '---\ntitle: "Test Title"\n---\n# Main Content';
    expect(stripYamlFrontmatter(md)).toBe('# Main Content');
  });

  it('should parse YAML title', () => {
    const md = '---\ntitle: "Test Title"\n---\n# Main Content';
    expect(parseYamlTitle(md)).toBe('Test Title');
  });

  it('should convert wikilinks with history matching', () => {
    const history = [{ title: 'Linked Note', url: 'https://feishu.cn/docx/token123' }];
    const md = 'Check [[Linked Note]] and [[Unlinked Note|Alias]]';
    expect(convertWikilinks(md, history)).toBe('Check [Linked Note](https://feishu.cn/docx/token123) and Alias');
  });

  it('should not convert Obsidian image embeds as normal wikilinks', () => {
    const md = 'Local ![[attachments/音乐卡点调整.png|音乐|510]] and [[Unlinked Note|Alias]]';
    expect(convertWikilinks(md, [])).toBe('Local ![[attachments/音乐卡点调整.png|音乐|510]] and Alias');
  });

  it('should convert Obsidian image syntax to standard Markdown image syntax', () => {
    const md = 'Embed ![[photo.png|My Photo]]';
    expect(convertObsidianImageSyntax(md)).toBe('Embed ![My Photo](photo.png)');
  });

  it('should ignore trailing wiki image size hints when converting Obsidian image syntax', () => {
    const md = 'Embed ![[photo.png|封面图|510]]';
    expect(convertObsidianImageSyntax(md)).toBe('Embed ![封面图](photo.png)');
  });

  it('should extract images from Markdown', () => {
    const md = '![Alt](local.png)\n![Remote](https://example.com/remote.jpg)\n![[wiki.png|Wiki]]';
    const images = extractImagesFromMarkdown(md);
    expect(images.length).toBe(3);
    expect(images[0]).toEqual({
      originalSrc: 'local.png',
      path: 'local.png',
      fileName: 'local.png',
      isRemote: false,
      sizeHint: null,
    });
    expect(images[1].isRemote).toBe(true);
    expect(images[2].fileName).toBe('wiki.png');
  });

  it('should extract width hints from markdown images', () => {
    const images = extractImagesFromMarkdown('![封面|320](local.png)\n![[wiki.png|插图|510]]');
    expect(images[0].sizeHint).toEqual({ width: 320, height: null });
    expect(images[1].sizeHint).toBeNull();
  });

  it('should extract asset image placeholders without regex stack overflow', () => {
    const images = extractImagesFromMarkdown('![Local](asset://image-1)');

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      originalSrc: 'asset://image-1',
      fileName: 'image-1',
      isRemote: false,
    });
  });
});

describe('Feishu settings helpers', () => {
  it('should initialize and normalize monthly API usage stats', () => {
    const settings = createDefaultFeishuSyncSettings();
    expect(FEISHU_FREE_MONTHLY_API_LIMIT).toBe(10000);
    expect(settings.apiUsage).toMatchObject({
      month: expect.stringMatching(/^\d{4}-\d{2}$/),
      count: 0,
    });

    const normalized = normalizeFeishuSyncSettings({
      enabled: true,
      apiUsage: {
        month: '2026-05',
        count: 88,
        updatedAt: 123,
      },
    });

    expect(normalized.apiUsage).toEqual({
      month: expect.stringMatching(/^\d{4}-\d{2}$/),
      count: 0,
      updatedAt: 0,
    });
  });

  it('should increment and reset Feishu API usage stats', () => {
    const settings = createDefaultFeishuSyncSettings();
    const now = new Date('2026-06-21T08:00:00Z');

    expect(incrementFeishuApiUsage(settings, 3, now)).toEqual({
      month: '2026-06',
      count: 3,
      updatedAt: now.getTime(),
    });
    expect(incrementFeishuApiUsage(settings, 2, now).count).toBe(5);
    expect(resetFeishuApiUsage(settings, now)).toEqual({
      month: '2026-06',
      count: 0,
      updatedAt: now.getTime(),
    });
  });

  it('should parse Feishu docx URLs and plain tokens', () => {
    expect(parseFeishuDocUrlOrToken('https://o7y2a6yi3x.feishu.cn/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa?from=copy')).toEqual({
      docToken: 'FZJjdrUPIoMPUpxpOTVcOpdInIa',
      url: 'https://o7y2a6yi3x.feishu.cn/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa',
    });
    expect(parseFeishuDocUrlOrToken('FZJjdrUPIoMPUpxpOTVcOpdInIa')).toEqual({
      docToken: 'FZJjdrUPIoMPUpxpOTVcOpdInIa',
      url: 'https://open.feishu.cn/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa',
    });
    expect(parseFeishuDocUrlOrToken('https://example.com/wiki/not-docx')).toBeNull();
    expect(parseFeishuDocUrlOrToken('https://example.com/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa')).toBeNull();
  });

  it('should rebind one Obsidian source path and replace stale history', () => {
    const settings = createDefaultFeishuSyncSettings();
    settings.uploadHistory = [{
      title: 'Old Title',
      url: 'https://feishu.cn/docx/old_doc_token',
      docToken: 'old_doc_token',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }, {
      title: 'Other Note',
      url: 'https://feishu.cn/docx/other_doc_token',
      docToken: 'other_doc_token',
      sourcePath: 'notes/other-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    const rebound = rebindFeishuHistoryByPath(settings, 'notes/test-note.md', {
      title: 'New Title',
      url: 'https://o7y2a6yi3x.feishu.cn/docx/FZJjdrUPIoMPUpxpOTVcOpdInIa',
      uploadTime: '2026-06-20T10:00:00Z',
    });

    expect(rebound).toMatchObject({
      title: 'New Title',
      docToken: 'FZJjdrUPIoMPUpxpOTVcOpdInIa',
      sourcePath: 'notes/test-note.md',
    });
    expect(settings.uploadHistory).toHaveLength(2);
    expect(settings.uploadHistory[0].docToken).toBe('FZJjdrUPIoMPUpxpOTVcOpdInIa');
    expect(settings.uploadHistory.some((item) => item.docToken === 'old_doc_token')).toBe(false);
    expect(settings.uploadHistory.some((item) => item.docToken === 'other_doc_token')).toBe(true);
  });

  it('should store Mermaid render preferences per note path', () => {
    const settings = createDefaultFeishuSyncSettings();

    expect(getFeishuMermaidPreferenceByPath(settings, 'notes/a.md')).toBeNull();

    const saved = setFeishuMermaidPreferenceByPath(settings, 'notes/a.md', {
      mode: 'remote-image',
      provider: 'kroki',
      updatedAt: 123,
    });

    expect(saved).toEqual({
      mode: 'remote-image',
      provider: 'kroki',
      updatedAt: 123,
    });
    expect(getFeishuMermaidPreferenceByPath(settings, 'notes/a.md')).toEqual(saved);
    expect(getFeishuMermaidPreferenceByPath(settings, 'notes/b.md')).toBeNull();
  });

  it('should remove Mermaid render preferences per note path', () => {
    const settings = createDefaultFeishuSyncSettings();
    setFeishuMermaidPreferenceByPath(settings, 'notes/a.md', {
      mode: 'remote-image',
      provider: 'kroki',
      updatedAt: 123,
    });
    setFeishuMermaidPreferenceByPath(settings, 'notes/b.md', {
      mode: 'remote-image',
      provider: 'kroki',
      updatedAt: 456,
    });

    expect(removeFeishuMermaidPreferenceByPath(settings, 'notes/a.md')).toBe(true);
    expect(getFeishuMermaidPreferenceByPath(settings, 'notes/a.md')).toBeNull();
    expect(getFeishuMermaidPreferenceByPath(settings, 'notes/b.md')).toMatchObject({
      mode: 'remote-image',
      provider: 'kroki',
    });
    expect(removeFeishuMermaidPreferenceByPath(settings, 'notes/a.md')).toBe(false);
  });
});

describe('Feishu smart update block helpers', () => {
  it('should only count direct children of the document root block', () => {
    const children = getFeishuDirectChildBlocks([
      { block_id: 'doc-token', parent_id: '', block_type: 1 },
      { block_id: 'child-1', parent_id: 'doc-token', block_type: 2 },
      { block_id: 'child-2', parent_id: 'doc-token', block_type: 3 },
      { block_id: 'grandchild-1', parent_id: 'child-1', block_type: 2 },
    ], 'doc-token');

    expect(children.map((block) => block.block_id)).toEqual(['child-1', 'child-2']);
  });

  it('should summarize failing block chunks for diagnostics', () => {
    expect(summarizeFeishuBlockChunk([
      { block_type: 2, text: {} },
      { block_type: 2, text: {} },
      { block_type: 31, table: {} },
    ])).toBe('count=3; types=2:2, 31:1; first=type=2, keys=block_type|text');
  });

  it('should convert flattened convert-api blocks into clean create payload trees', () => {
    const payload = buildFeishuCreatePayloadBlocks([
      { block_id: 'doc-token', parent_id: '', block_type: 1 },
      {
        block_id: 'list-1',
        parent_id: 'doc-token',
        block_type: 12,
        bullet: { style: 'unordered' },
        children: [{ block_id: 'list-item-1' }],
      },
      {
        block_id: 'list-item-1',
        parent_id: 'list-1',
        block_type: 2,
        text: { elements: [{ text_run: { content: 'hello' } }] },
      },
      {
        block_id: 'paragraph-1',
        parent_id: 'doc-token',
        block_type: 2,
        text: { elements: [{ text_run: { content: 'world' } }] },
        index: 3,
      },
    ], 'doc-token');

    expect(payload).toEqual([
      {
        block_type: 12,
        bullet: { style: 'unordered' },
        children: [{
          block_type: 2,
          text: { elements: [{ text_run: { content: 'hello' } }] },
        }],
      },
      {
        block_type: 2,
        text: { elements: [{ text_run: { content: 'world' } }] },
      },
    ]);
  });

  it('should build ordered create payload trees from document root children ids', () => {
    const payload = buildFeishuCreatePayloadBlocks([
      { block_id: 'doc-token', parent_id: '', block_type: 1, children: ['ordered-1', 'paragraph-1'] },
      {
        block_id: 'ordered-1',
        parent_id: 'doc-token',
        block_type: 13,
        ordered: { elements: [{ text_run: { content: '第一步' } }], style: { align: 1 } },
        children: ['bullet-1'],
      },
      {
        block_id: 'bullet-1',
        parent_id: 'ordered-1',
        block_type: 12,
        bullet: { elements: [{ text_run: { content: '子项' } }], style: { align: 1 } },
      },
      {
        block_id: 'paragraph-1',
        parent_id: 'doc-token',
        block_type: 2,
        text: { elements: [{ text_run: { content: '尾段' } }] },
      },
    ], 'doc-token');

    expect(payload).toEqual([
      {
        block_type: 13,
        ordered: { elements: [{ text_run: { content: '第一步' } }], style: { align: 1 } },
        children: [
          {
            block_type: 12,
            bullet: { elements: [{ text_run: { content: '子项' } }], style: { align: 1 } },
          },
        ],
      },
      {
        block_type: 2,
        text: { elements: [{ text_run: { content: '尾段' } }] },
      },
    ]);
  });

  it('should convert imported Feishu image tokens into create payload file tokens', () => {
    const payload = buildFeishuCreatePayloadBlocks([
      { block_id: 'doc-token', parent_id: '', block_type: 1, children: ['image-1'] },
      {
        block_id: 'image-1',
        parent_id: 'doc-token',
        block_type: 27,
        image: {
          token: 'imported-image-token',
          width: 640,
          height: 360,
          scale: 1,
        },
      },
    ], 'doc-token');

    expect(payload).toEqual([
      {
        block_type: 27,
        image: {
          file_token: 'imported-image-token',
          width: 640,
          height: 360,
        },
      },
    ]);
  });
});

describe('Feishu Api Client', () => {
  beforeEach(() => {
    obsidianMock.requestUrl.mockReset();
    obsidianMock.requestUrl.mockResolvedValue({
      status: 200,
      json: { code: 0, msg: 'success', tenant_access_token: 't-123456', expire: 7200 }
    });
  });

  it('should fetch and cache access token', async () => {
    const client = new FeishuApiClient('appid', 'appsecret');
    const token = await client.getAccessToken();
    expect(token).toBe('t-123456');
    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);

    // Call again, should return cached token
    const cachedToken = await client.getAccessToken();
    expect(cachedToken).toBe('t-123456');
    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
  });

  it('should count actual OpenAPI requests without double-counting cached tokens', async () => {
    const onApiCall = vi.fn();
    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl, { onApiCall });
    const token = await client.getAccessToken();

    expect(token).toBe('t-123456');
    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(onApiCall).toHaveBeenCalledTimes(1);
    expect(onApiCall.mock.calls[0][0]).toBe('获取飞书 tenant_access_token');

    await client.getAccessToken();
    expect(obsidianMock.requestUrl).toHaveBeenCalledTimes(1);
    expect(onApiCall).toHaveBeenCalledTimes(1);
  });

  it('should handle list folder items', async () => {
    obsidianMock.requestUrl.mockResolvedValue({
      status: 200,
      json: {
        code: 0,
        data: {
          files: [
            { type: 'docx', name: 'My Doc', token: 'doc_token_abc' }
          ]
        }
      }
    });

    const client = new FeishuApiClient('appid', 'appsecret');
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    const items = await client.listFolderItems('folder_token_xyz');
    expect(items.length).toBe(1);
    expect(items[0]).toEqual({
      type: 'docx',
      name: 'My Doc',
      token: 'doc_token_abc'
    });
  });

  it('should expose Feishu HTTP error details instead of a generic 400', async () => {
    obsidianMock.requestUrl.mockResolvedValue({
      status: 400,
      json: {
        code: 99991663,
        msg: 'invalid multipart payload',
        request_id: 'req-debug-1',
      },
      text: '',
    });

    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl);
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    await expect(client.uploadFile('test.md', 'IyBUZXN0', 'folder-token')).rejects.toThrow(
      '上传飞书临时 Markdown 文件 请求失败，HTTP 400：code 99991663, invalid multipart payload, request_id req-debug-1'
    );
    expect(obsidianMock.requestUrl.mock.calls[0][0].throw).toBe(false);
  });

  it('should safely report non-json Feishu HTTP errors', async () => {
    const response = {
      status: 404,
      text: '404 page not found',
    };
    Object.defineProperty(response, 'json', {
      get() {
        throw new SyntaxError('Unexpected non-whitespace character after JSON');
      },
    });
    obsidianMock.requestUrl.mockResolvedValue(response);

    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl);
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    await expect(client.batchDeleteBlocks('doc-token', 'doc-token', 0, 1)).rejects.toThrow(
      '批量删除飞书文档块 请求失败，HTTP 404：404 page not found'
    );
  });

  it('should delete one block by id through the parent children batch endpoint', async () => {
    obsidianMock.requestUrl.mockResolvedValue({
      status: 200,
      json: { code: 0 },
    });

    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl);
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    await client.deleteBlock('doc-token', 'child-block-1', 'doc-token');

    const request = obsidianMock.requestUrl.mock.calls[0][0];
    expect(request.method).toBe('DELETE');
    expect(request.url).toContain('/docx/v1/documents/doc-token/blocks/doc-token/children/batch_delete');
    expect(JSON.parse(request.body)).toEqual({ block_ids: ['child-block-1'] });
  });

  it('should upload markdown with the original .md filename in multipart payload', async () => {
    obsidianMock.requestUrl.mockResolvedValue({
      status: 200,
      json: { code: 0, data: { file_token: 'temp_file_token' } },
    });

    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl);
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    await client.uploadFile('测试.md', 'IyBUZXN0', 'folder-token');

    const request = obsidianMock.requestUrl.mock.calls[0][0];
    const bodyText = new TextDecoder().decode(new Uint8Array(request.body));
    expect(bodyText).toContain('filename="测试.md"');
    expect(bodyText).toContain('Content-Type: text/markdown; charset=utf-8');
    expect(request.throw).toBe(false);
  });

  it('should upload image material with binary bytes and the real mime type', async () => {
    obsidianMock.requestUrl.mockResolvedValue({
      status: 200,
      json: { code: 0, data: { file_token: 'image_token_1' } },
    });

    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl);
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    await client.uploadImageMaterialBytes(
      'local.png',
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      'doc-token',
      'image-block-id',
      'image/png'
    );

    const request = obsidianMock.requestUrl.mock.calls[0][0];
    const bodyText = new TextDecoder().decode(new Uint8Array(request.body));
    expect(bodyText).toContain('name="parent_type"');
    expect(bodyText).toContain('docx_image');
    expect(bodyText).toContain('name="parent_node"');
    expect(bodyText).toContain('image-block-id');
    expect(bodyText).toContain('filename="local.png"');
    expect(bodyText).toContain('Content-Type: image/png');
    expect(request.throw).toBe(false);
  });

  it('should transfer document ownership with Feishu userid member type', async () => {
    obsidianMock.requestUrl.mockResolvedValue({
      status: 200,
      json: { code: 0, msg: 'success' },
    });

    const client = new FeishuApiClient('appid', 'appsecret', obsidianMock.requestUrl);
    client.accessToken = 't-123';
    client.tokenExpiry = Date.now() + 100000;

    await client.transferDocumentOwnership('doc-token', 'ou-user-123');

    const request = obsidianMock.requestUrl.mock.calls[0][0];
    expect(request.url).toContain('/drive/v1/permissions/doc-token/members/transfer_owner');
    expect(JSON.parse(request.body)).toEqual({
      member_id: 'ou-user-123',
      member_type: 'userid',
    });
  });
});

describe('Feishu Sync Coordinator', () => {
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

  it('should perform smart update for previously synced note via temporary imported document order', async () => {
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
        return { json: { code: 0, tenant_access_token: 't-123', expire: 7200 } };
      }
      if (url.includes('blocks?page_size')) {
        if (url.includes('/documents/doc_token_456/blocks?page_size')) {
          return {
            json: {
              code: 0,
              data: {
                items: [
                  { block_id: 'doc_token_456', parent_id: '', block_type: 1, children: ['old_child_1'] },
                  { block_id: 'old_child_1', parent_id: 'doc_token_456', block_type: 2, text: { elements: [{ text_run: { content: 'old' } }] } },
                ]
              }
            }
          };
        }
        return {
          json: {
            code: 0,
            data: {
              items: [
                { block_id: 'temp_doc_token', parent_id: '', block_type: 1, children: ['temp_heading', 'temp_paragraph'] },
                { block_id: 'temp_heading', parent_id: 'temp_doc_token', block_type: 3, heading1: { elements: [{ text_run: { content: 'Updated title' } }] } },
                { block_id: 'temp_paragraph', parent_id: 'temp_doc_token', block_type: 2, text: { elements: [{ text_run: { content: 'Updated content.' } }] } },
              ]
            }
          }
        };
      }
      if (url.includes('/blocks/doc_token_456/children/batch_delete') && options.method === 'DELETE') {
        return { json: { code: 0 } };
      }
      if (url.includes('import_tasks') && options.method === 'POST') {
        return { json: { code: 0, data: { ticket: 'ticket_temp_update' } } };
      }
      if (url.includes('/import_tasks/ticket_temp_update')) {
        return { json: { code: 0, data: { result: { job_status: 0, token: 'temp_doc_token', url: 'https://feishu.cn/docx/temp_doc_token' } } } };
      }
      if (url.includes('files/upload_all')) {
        return { json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('children?document_revision_id')) {
        return { json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_doc_token?type=docx') && options.method === 'DELETE') {
        return { json: { code: 0 } };
      }
      if (url.includes('/drive/v1/files/temp_file_token?type=file') && options.method === 'DELETE') {
        return { json: { code: 0 } };
      }
      return { json: { code: 0 } };
    });

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# test-note\nUpdated content.',
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(settings.uploadHistory.length).toBe(1);
    const calls = obsidianMock.requestUrl.mock.calls;
    const deleteCall = calls.find(c => c[0].url.includes('/blocks/doc_token_456/children/batch_delete') && c[0].method === 'DELETE');
    expect(deleteCall).toBeTruthy();
    expect(JSON.parse(deleteCall[0].body)).toEqual({ start_index: 0, end_index: 1 });
    const createCall = calls.find(c => c[0].url.includes('/documents/doc_token_456/blocks/doc_token_456/children?document_revision_id=-1'));
    expect(JSON.parse(createCall[0].body)).toEqual({
      index: 1,
      children: [
        { block_type: 3, heading1: { elements: [{ text_run: { content: 'Updated title' } }] } },
        { block_type: 2, text: { elements: [{ text_run: { content: 'Updated content.' } }] } },
      ],
    });
    expect(calls.some(c => c[0].url.includes('children?document_revision_id'))).toBe(true);
    expect(calls.some(c => c[0].url.includes('transfer_owner'))).toBe(false);
    expect(calls.some(c => c[0].url.includes('/drive/v1/files/temp_doc_token?type=docx') && c[0].method === 'DELETE')).toBe(true);
  });

  it('should build create payload from imported document root children order', async () => {
    settings.uploadHistory = [{
      title: 'test-note',
      url: 'https://feishu.cn/docx/doc_token_456',
      docToken: 'doc_token_456',
      sourcePath: 'notes/test-note.md',
      uploadTime: '2026-06-19T00:00:00Z',
    }];

    let rootCreateCount = 0;
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
                  { block_id: 'doc_token_456', parent_id: '', block_type: 1, children: ['old_child_1'] },
                  { block_id: 'old_child_1', parent_id: 'doc_token_456', block_type: 2 },
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
                { block_id: 'temp_doc_token', parent_id: '', block_type: 1, children: ['bullet_1', 'paragraph_2'] },
                {
                  block_id: 'bullet_1',
                  parent_id: 'temp_doc_token',
                  block_type: 13,
                  ordered: { elements: [{ text_run: { content: '第一步' } }], style: { align: 1 } },
                  children: ['paragraph_1'],
                },
                {
                  block_id: 'paragraph_1',
                  parent_id: 'bullet_1',
                  block_type: 12,
                  bullet: { elements: [{ text_run: { content: 'item 1' } }], style: { align: 1 } },
                },
                {
                  block_id: 'paragraph_2',
                  parent_id: 'temp_doc_token',
                  block_type: 2,
                  text: { elements: [{ text_run: { content: 'tail' } }] },
                },
              ],
            },
          },
        };
      }
      if (url.includes('import_tasks') && options.method === 'POST') {
        return { status: 200, json: { code: 0, data: { ticket: 'ticket_temp_update' } } };
      }
      if (url.includes('/import_tasks/ticket_temp_update')) {
        return { status: 200, json: { code: 0, data: { result: { job_status: 0, token: 'temp_doc_token', url: 'https://feishu.cn/docx/temp_doc_token' } } } };
      }
      if (url.includes('files/upload_all')) {
        return { status: 200, json: { code: 0, data: { file_token: 'temp_file_token' } } };
      }
      if (url.includes('/documents/doc_token_456/blocks/created_ordered_1/children?document_revision_id=-1')) {
        const body = JSON.parse(options.body);
        expect(body).toEqual({
          index: 0,
          children: [
            {
              block_type: 12,
              bullet: { elements: [{ text_run: { content: 'item 1' } }], style: { align: 1 } },
            },
          ],
        });
        return { status: 200, json: { code: 0, data: { children: [{ block_id: 'created_bullet_1' }] } } };
      }
      if (url.includes('/documents/doc_token_456/blocks/doc_token_456/children?document_revision_id=-1') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        if (rootCreateCount === 0) {
          expect(body).toEqual({
            index: 1,
            children: [
              {
                block_type: 13,
                ordered: { elements: [{ text_run: { content: '第一步' } }], style: { align: 1 } },
              },
            ],
          });
          rootCreateCount += 1;
          return { status: 200, json: { code: 0, data: { children: [{ block_id: 'created_ordered_1' }] } } };
        }

        expect(body).toEqual({
          index: 2,
          children: [
            {
              block_type: 2,
              text: { elements: [{ text_run: { content: 'tail' } }] },
            },
          ],
        });
        rootCreateCount += 1;
        return { status: 200, json: { code: 0, data: { children: [{ block_id: 'created_top_1' }] } } };
      }
      if (url.includes('/blocks/doc_token_456/children/batch_delete') && options.method === 'DELETE') {
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

    expect(result.docToken).toBe('doc_token_456');
    expect(rootCreateCount).toBe(2);
    expect(obsidianMock.requestUrl.mock.calls.some((call) => call[0].url.includes('transfer_owner'))).toBe(false);
  });

  it('should transfer ownership only for newly created documents', async () => {
    settings.userId = 'ou-user-123';

    const result = await syncNoteToFeishu({
      app,
      settings,
      activeFile,
      markdown: '# Test Note\nSome text.',
    });

    expect(result.docToken).toBe('doc_token_456');
    expect(obsidianMock.requestUrl.mock.calls.some((call) => call[0].url.includes('transfer_owner'))).toBe(true);
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
