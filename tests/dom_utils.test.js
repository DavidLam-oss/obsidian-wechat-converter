/*
## 核心功能

覆盖 dom utils 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 dom utils 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, afterEach } from 'vitest';

const {
  createHtmlContainer,
  findAllElements,
  getActiveWindowValue,
  parseHtmlFragment,
  setElementHtml,
} = require('../services/dom-utils');

describe('DOM utilities', () => {
  const originalDOMParser = global.DOMParser;

  afterEach(() => {
    global.DOMParser = originalDOMParser;
  });

  it('parses normal article markup with DOMParser', () => {
    const fragment = parseHtmlFragment('<section><p>正文</p><strong>重点</strong></section>');

    expect(fragment.childNodes.length).toBe(1);
    expect(fragment.querySelector('p')?.textContent).toBe('正文');
    expect(fragment.querySelector('strong')?.textContent).toBe('重点');
  });

  it('returns an empty fragment for empty input', () => {
    const fragment = parseHtmlFragment('');

    expect(fragment.childNodes.length).toBe(0);
  });

  it('does not fall back to createContextualFragment when DOMParser is unavailable', () => {
    const originalCreateRange = document.createRange;
    global.DOMParser = undefined;
    document.createRange = () => {
      throw new Error('createRange should not be used');
    };

    try {
      const container = createHtmlContainer('div', '<p>unsafe fallback should not run</p>');

      expect(container).not.toBeNull();
      expect(container.childNodes.length).toBe(0);
    } finally {
      document.createRange = originalCreateRange;
    }
  });

  it('replaces existing children using parsed fragments', () => {
    const container = document.createElement('div');
    container.textContent = '旧内容';

    setElementHtml(container, '<p>新内容</p>');

    expect(container.textContent).toBe('新内容');
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('finds matching elements without relying on direct querySelectorAll calls', () => {
    const container = createHtmlContainer('div', '<p class="target">A</p><section><p>B</p><p class="target">C</p></section>');

    const matches = findAllElements(container, '.target');

    expect(matches.map((el) => el.textContent)).toEqual(['A', 'C']);
  });

  it('uses Obsidian-style findAll when provided by the element', () => {
    const first = document.createElement('span');
    const second = document.createElement('span');
    const host = {
      findAll(selector) {
        return selector === '.chip' ? [first, 'not-an-element', second] : [];
      },
    };

    expect(findAllElements(host, '.chip')).toEqual([first, second]);
  });

  it('reads values from the active window helper', () => {
    window.__domUtilsTestValue = 'ok';

    try {
      expect(getActiveWindowValue('__domUtilsTestValue')).toBe('ok');
    } finally {
      delete window.__domUtilsTestValue;
    }
  });
});
