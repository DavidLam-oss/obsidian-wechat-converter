/*
## 核心功能

覆盖 Obsidian Triplet Serializer task lists 相关行为的 Vitest 测试用例。

## 输入

接收 serializer、模拟 DOM、主题 converter 和断言数据。

## 输出

输出自动化断言结果，保护 Obsidian Triplet Serializer task lists 行为不回归。

## 定位

位于 tests/，是 triplet serializer 的分场景回归测试。

## 依赖

关键依赖：Vitest、render-runtime helper 和 obsidian-triplet-serializer。

## 维护规则

- 只收纳 Obsidian Triplet Serializer task lists 场景，通用转换放在核心测试文件。
- 新增断言时保持用户可见结果和服务契约清晰。
*/

import { describe, it, expect, beforeAll } from 'vitest';
const { serializeObsidianRenderedHtml } = require('../services/obsidian-triplet-serializer');
const { createLegacyConverter } = require('./helpers/render-runtime');

describe('Obsidian Triplet Serializer task lists', () => {
  let converter;

  beforeAll(async () => {
    converter = await createLegacyConverter();
  });

  it('should serialize unchecked and checked task lists using the formatTaskListItems helper', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li>☐ 待办任务</li>',
      '  <li>☑ 已完成任务</li>',
      '  <li>普通列表项</li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const liElements = container.querySelectorAll('li');
    expect(liElements.length).toBe(3);

    // Unchecked list item asserts
    const uncheckedLi = liElements[0];
    expect(uncheckedLi.getAttribute('style')).toContain('list-style-type: none');
    expect(uncheckedLi.getAttribute('style')).toContain('margin-left: -20px');
    expect(uncheckedLi.querySelector('span')?.getAttribute('style')).toContain('color: #0366d6');
    expect(uncheckedLi.querySelector('span')?.textContent).toBe('☐');
    expect(uncheckedLi.textContent).toContain('待办任务');

    // Checked list item asserts
    const checkedLi = liElements[1];
    expect(checkedLi.getAttribute('style')).toContain('list-style-type: none');
    expect(checkedLi.getAttribute('style')).toContain('margin-left: -20px');
    expect(checkedLi.querySelector('span')?.getAttribute('style')).toContain('color: #8f959e');
    expect(checkedLi.querySelector('span')?.textContent).toBe('☑');

    // Strikethrough wrapper asserts
    const strikethroughSpan = checkedLi.querySelector('span[style*="text-decoration: line-through"]');
    expect(strikethroughSpan).not.toBeNull();
    expect(strikethroughSpan?.textContent).toBe('已完成任务');

    // Normal list item asserts
    const normalLi = liElements[2];
    expect(normalLi.getAttribute('style') || '').not.toContain('list-style-type: none');
  });

  it('should serialize loose task list items containing paragraphs correctly', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li><p>☐ 宽松待办任务</p></li>',
      '  <li><p>☑ 宽松已完成任务</p></li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const liElements = container.querySelectorAll('li');

    // Loose unchecked
    const uncheckedLi = liElements[0];
    expect(uncheckedLi.getAttribute('style')).toContain('list-style-type: none');
    const uncheckedP = uncheckedLi.querySelector('p');
    expect(uncheckedP?.querySelector('span')?.textContent).toBe('☐');
    expect(uncheckedP?.textContent).toContain('宽松待办任务');

    // Loose checked
    const checkedLi = liElements[1];
    expect(checkedLi.getAttribute('style')).toContain('list-style-type: none');
    const checkedP = checkedLi.querySelector('p');
    expect(checkedP?.querySelector('span')?.textContent).toBe('☑');
    expect(checkedP?.querySelector('span[style*="text-decoration: line-through"]')?.textContent).toBe('宽松已完成任务');
  });

  it('should serialize checked task list items containing inline formatting correctly', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li>☑ <strong>重要</strong> 任务内容</li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const li = container.querySelector('li');
    expect(li?.getAttribute('style')).toContain('list-style-type: none');
    expect(li?.querySelector('span')?.textContent).toBe('☑');

    const strikethroughSpan = li?.querySelector('span[style*="text-decoration: line-through"]');
    expect(strikethroughSpan?.querySelector('strong')?.textContent).toBe('重要');
    expect(strikethroughSpan?.textContent).toBe('重要 任务内容');
  });

  it('should serialize checked task lists with nested lists without wrapping nested items in strikethrough', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<ul>',
      '  <li>☑ 父级已完成任务',
      '    <ul>',
      '      <li>☐ 子级待办任务</li>',
      '    </ul>',
      '  </li>',
      '</ul>'
    ].join('\n');

    const html = serializeObsidianRenderedHtml({ root, converter });
    const container = document.createElement('div');
    container.innerHTML = html;

    const parentLi = container.querySelector('li');
    expect(parentLi?.getAttribute('style')).toContain('list-style-type: none');
    expect(parentLi?.querySelector('span')?.textContent).toBe('☑');

    // Verify parent text is strikethrough
    const strikethroughSpan = parentLi?.querySelector('span[style*="text-decoration: line-through"]');
    expect(strikethroughSpan?.textContent).toContain('父级已完成任务');

    // Verify child list is NOT wrapped in the parent's strikethrough span
    const childUl = parentLi?.querySelector('ul');
    expect(childUl?.parentElement).toBe(parentLi); // It is a direct child of parentLi, not of strikethroughSpan
    expect(strikethroughSpan?.contains(childUl)).toBe(false);

    // Verify child task item is not struck through
    const childLi = childUl?.querySelector('li');
    expect(childLi?.getAttribute('style')).toContain('list-style-type: none');
    expect(childLi?.querySelector('span')?.textContent).toBe('☐');
    expect(childLi?.querySelector('span[style*="text-decoration: line-through"]')).toBeNull();
  });
});
