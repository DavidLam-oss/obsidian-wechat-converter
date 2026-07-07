/*
## 核心功能

覆盖 feishu sync 基础服务 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护Markdown 处理、设置归一化、块转换和 API 客户端行为不回归。

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

let FeishuApiClient;
let stripYamlFrontmatter;
let parseYamlTitle;
let convertWikilinks;
let convertObsidianImageSyntax;
let extractImagesFromMarkdown;
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
  getFeishuDirectChildBlocks = syncMod.getFeishuDirectChildBlocks;
  summarizeFeishuBlockChunk = syncMod.summarizeFeishuBlockChunk;
  buildFeishuCreatePayloadBlocks = syncMod.buildFeishuCreatePayloadBlocks;

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
