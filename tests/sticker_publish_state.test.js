/*
## 核心功能

验证微信贴图共享发布状态模型与用户可见转换摘要。

## 输入

接收不同标题、文案、图片和素材归属组合。

## 输出

输出 Vitest 断言，保护超限阈值、阻断优先级和按钮文案。

## 定位

位于 tests/，是贴图发布状态纯函数的单元测试。

## 依赖

依赖 Vitest 与 `services/sticker-publish-state.js`。

## 维护规则

- 平台限制或阻断顺序变化时同步更新用例。
- 断言用户文案时使用完整预期，防止内部字段名泄漏。
*/

import { describe, expect, it } from 'vitest';
import {
  getStickerPublishState,
  getStickerTransformParts,
} from '../services/sticker-publish-state.js';

describe('sticker publish state', () => {
  it.each([
    [18, 900],
    [20, 1000],
  ])('keeps title %i and content %i neutral while they remain within the limit', (titleLength, contentLength) => {
    const state = getStickerPublishState({
      title: '标'.repeat(titleLength),
      content: '文'.repeat(contentLength),
      imageCount: 1,
    });

    expect(state.canSync).toBe(true);
    expect(state.buttonText).toBe('同步到贴图草稿');
    expect(state.counters.title.status).toBe('normal');
    expect(state.counters.content.status).toBe('normal');
  });

  it('marks text counters as errors only after their limits are exceeded', () => {
    const state = getStickerPublishState({
      title: '标'.repeat(21),
      content: '文'.repeat(1001),
      imageCount: 1,
    });

    expect(state.canSync).toBe(false);
    expect(state.counters.title.status).toBe('error');
    expect(state.counters.content.status).toBe('error');
  });

  it('prioritizes missing images before other blocking issues', () => {
    const state = getStickerPublishState({
      title: '',
      content: '文'.repeat(1001),
      imageCount: 0,
    });

    expect(state.canSync).toBe(false);
    expect(state.issueCode).toBe('images-required');
    expect(state.buttonText).toBe('图片不足，无法同步');
    expect(state.counters.title.status).toBe('normal');
  });

  it('returns specific copy for title, content, and account blockers', () => {
    expect(getStickerPublishState({
      title: '标'.repeat(21),
      imageCount: 1,
    }).buttonText).toBe('标题超长，无法同步');

    expect(getStickerPublishState({
      title: '标题',
      content: '文'.repeat(1001),
      imageCount: 1,
    }).buttonText).toBe('文案超长，无法同步');

    expect(getStickerPublishState({
      title: '标题',
      imageCount: 1,
      foreignMaterialCount: 1,
    }).buttonText).toBe('素材账号不符');
  });

  it('maps internal transform kinds to user-facing labels', () => {
    expect(getStickerTransformParts([
      { kind: 'codeBlocks', count: 1 },
      { kind: 'tables', count: 2 },
      { kind: 'unknown', count: 0 },
    ])).toEqual(['代码块 1 处', '表格 2 处']);
  });
});
