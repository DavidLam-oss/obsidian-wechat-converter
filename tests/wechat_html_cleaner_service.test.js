/*
## 核心功能

覆盖 wechat html cleaner service 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 wechat html cleaner service 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');

describe('Wechat HTML Cleaner Service', () => {
  it('should keep list label and body on one line in a simple case', () => {
    const input = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('清理时机');
    expect(output).toContain('正文');
    expect(output).not.toContain('<br>');
  });

  it('should unwrap fragment-only links such as rendered Obsidian tags', () => {
    const input = '<p><a href="#执业医师">#执业医师</a> <a href="#方剂学">#方剂学</a></p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('#执业医师 #方剂学');
    expect(output).not.toContain('href="#执业医师"');
    expect(output).not.toContain('href="#方剂学"');
  });

  it('should preserve ordinary in-document anchors', () => {
    const input = '<p><a href="#toc-1">目录跳转</a> <a href="#fnref-1">↩ 返回</a></p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('href="#toc-1"');
    expect(output).toContain('href="#fnref-1"');
    expect(output).toContain('目录跳转');
    expect(output).toContain('↩ 返回');
  });

  it('should unwrap encoded fragment links when they render as Obsidian tags', () => {
    const input = '<p><a href="#%E6%89%A7%E4%B8%9A%E5%8C%BB%E5%B8%88">#执业医师</a></p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('#执业医师');
    expect(output).not.toContain('href="#%E6%89%A7%E4%B8%9A%E5%8C%BB%E5%B8%88"');
  });
});
