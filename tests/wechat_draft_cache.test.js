/*
## 核心功能

覆盖 wechat draft cache 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 wechat draft cache 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';

const {
  DRAFT_CACHE_VERSION,
  createEmptyDraftCache,
  normalizeDraftCache,
  getDraftAssociation,
  setDraftAssociation,
  clearDraftAssociation,
} = require('../services/wechat-draft-cache');

describe('wechat draft cache', () => {
  it('creates the versioned empty cache shape', () => {
    expect(createEmptyDraftCache()).toEqual({
      version: DRAFT_CACHE_VERSION,
      articles: {},
    });
  });

  it('normalizes legacy flat cache entries', () => {
    const { cache, changed } = normalizeDraftCache({
      'folder\\note.md': {
        mediaId: ' media-1 ',
        accountId: 'acc-1',
        title: 'Note',
        updatedAt: 100,
      },
    });

    expect(changed).toBe(true);
    expect(cache.articles['folder/note.md']).toEqual({
      sourcePath: 'folder/note.md',
      mediaId: 'media-1',
      accountId: 'acc-1',
      title: 'Note',
      index: 0,
      updatedAt: 100,
    });
  });

  it('drops invalid entries while keeping valid ones', () => {
    const { cache, changed } = normalizeDraftCache({
      version: DRAFT_CACHE_VERSION,
      articles: {
        'ok.md': { mediaId: 'media-ok', accountId: 'acc' },
        'bad.md': { accountId: 'acc' },
      },
    });

    expect(changed).toBe(true);
    expect(Object.keys(cache.articles)).toEqual(['ok.md']);
  });

  it('returns associations only for the matching account', () => {
    const settings = {
      draftCache: {
        version: DRAFT_CACHE_VERSION,
        articles: {
          'note.md': {
            sourcePath: 'note.md',
            mediaId: 'media-1',
            accountId: 'acc-1',
            title: 'Note',
            index: 0,
            updatedAt: 100,
          },
        },
      },
    };

    expect(getDraftAssociation(settings, 'note.md', 'acc-1')?.mediaId).toBe('media-1');
    expect(getDraftAssociation(settings, 'note.md', 'acc-2')).toBeNull();
  });

  it('sets and clears associations in place', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const settings = {};

    setDraftAssociation(settings, {
      sourcePath: '/folder/note.md',
      mediaId: 'media-1',
      accountId: 'acc-1',
      title: 'Note',
    });

    expect(settings.draftCache.articles['folder/note.md']).toMatchObject({
      mediaId: 'media-1',
      accountId: 'acc-1',
      title: 'Note',
      updatedAt: 1234,
    });

    clearDraftAssociation(settings, 'folder/note.md');
    expect(settings.draftCache.articles).toEqual({});
    Date.now.mockRestore();
  });
});
