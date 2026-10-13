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

  it('should convert blockquote to section with identical inline styles to avoid WeChat default border', () => {
    const input = '<blockquote style="font-size: 16px; border-left: 3px solid #8a2be2; background: #f8fafc; padding: 16px;"><p>这是一个引用</p></blockquote>';
    const output = cleanHtmlForDraft(input);

    expect(output).not.toContain('<blockquote');
    expect(output).not.toContain('</blockquote>');
    expect(output).toContain('<section');
    expect(output).toContain('border-left: 3px solid #8a2be2');
    expect(output).toContain('background: #f8fafc');
    expect(output).toContain('<p>这是一个引用</p>');
    expect(output).toContain('</section>');
  });

  describe('issue #78 - unordered list hanging indent conversion', () => {
    it('should convert single-level unordered list into hanging indent paragraphs', () => {
      const input = `
        <ul style="font-size: 16px; line-height: 1.8; color: #3b4648; margin: 12px 0; padding-left: 20px; list-style-type: disc;">
          <li style="font-size: 16px; line-height: 1.8; color: #3b4648; margin: 4px 0;">第一项内容</li>
          <li style="font-size: 16px; line-height: 1.8; color: #3b4648; margin: 4px 0;">第二项长内容，用于测试悬挂缩进排版</li>
        </ul>
      `;
      const output = cleanHtmlForDraft(input);

      expect(output).not.toContain('<ul');
      expect(output).not.toContain('</ul>');
      expect(output).not.toContain('<li');
      expect(output).not.toContain('</li>');
      expect(output).toContain('padding-left: 20px');
      expect(output).toContain('text-indent: -14px');
      expect(output).toContain('<span>• </span>第一项内容');
      expect(output).toContain('<span>• </span>第二项长内容，用于测试悬挂缩进排版');
    });

    it('should convert nested unordered lists with increasing indentation per level', () => {
      const input = `
        <ul>
          <li>顶级父项
            <ul>
              <li>二级子项 A</li>
              <li>二级子项 B</li>
            </ul>
          </li>
        </ul>
      `;
      const output = cleanHtmlForDraft(input);

      expect(output).not.toContain('<ul');
      expect(output).not.toContain('<li');
      expect(output).toContain('padding-left: 20px');
      expect(output).toContain('padding-left: 40px');
      expect(output).toContain('<span>• </span>顶级父项');
      expect(output).toContain('<span>• </span>二级子项 A');
      expect(output).toContain('<span>• </span>二级子项 B');
    });

    it('should preserve task item checkboxes without adding duplicate bullet markers', () => {
      const input = `
        <ul>
          <li style="list-style-type: none; margin-left: -20px;"><span style="color: #576b95;">☐</span> 待办任务项</li>
          <li style="list-style-type: none; margin-left: -20px;"><span style="color: #8f959e;">☑</span> 已完成任务项</li>
        </ul>
      `;
      const output = cleanHtmlForDraft(input);

      expect(output).not.toContain('<ul');
      expect(output).not.toContain('<span>• </span>');
      expect(output).toContain('text-indent: -20px');
      expect(output).toContain('待办任务项');
      expect(output).toContain('已完成任务项');
    });

    it('should keep leading strong label and list text in same paragraph flow', () => {
      const input = `
        <ul>
          <li><strong>核心指标：</strong>准确率达到 99%</li>
        </ul>
      `;
      const output = cleanHtmlForDraft(input);

      expect(output).not.toContain('<ul');
      expect(output).toContain('padding-left: 20px');
      expect(output).toContain('text-indent: -14px');
      expect(output).toContain('<span>• </span>');
      expect(output).toContain('核心指标：');
      expect(output).toContain('准确率达到 99%');
    });

    it('遇列表内代码块/表格等块级元素，解构为同级兄弟并保持缩进，避免 p 标签提前闭合', () => {
      const input = `
        <ul>
          <li>示例文本：<pre><code>const a = 1;</code></pre>尾部说明</li>
        </ul>
      `;
      const output = cleanHtmlForDraft(input);

      expect(output).not.toContain('<ul');
      expect(output).not.toContain('<li');
      // pre 不应被包裹在 p 内部
      const dom = document.createElement('div');
      dom.innerHTML = output;
      expect(dom.querySelector('p pre')).toBeNull();
      // pre 作为同级存在并具有 margin-left 缩进
      expect(output).toContain('<pre style=" margin-left: 20px;">');
      // 首段有标点与文本
      expect(output).toContain('<span>• </span>示例文本：');
      // 尾段为独立段落
      expect(output).toContain('尾部说明');
    });

    it('遇列表内嵌套 div 与 hr 等长尾块级元素，解构为同级兄弟，避免 p 标签提前闭合', () => {
      const input = `
        <ul>
          <li>第一行<div>块级内容</div><hr>第二行</li>
        </ul>
      `;
      const output = cleanHtmlForDraft(input);

      expect(output).not.toContain('<ul');
      expect(output).not.toContain('<li');
      const dom = document.createElement('div');
      dom.innerHTML = output;
      expect(dom.querySelector('p div')).toBeNull();
      expect(dom.querySelector('p hr')).toBeNull();
      expect(output).toContain('<div style=" margin-left: 20px;">块级内容</div>');
      expect(output).toContain('<hr style=" margin-left: 20px;">');
      expect(output).toContain('<span>• </span>第一行');
      expect(output).toContain('第二行');
    });
  });

  describe('等宽字体的列表缩进与主题共享同一份数据', () => {
    it('比例字体第 1 层列表使用 20px 缩进', () => {
      const input = '<section style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;"><ul><li>条目</li></ul></section>';
      const output = cleanHtmlForDraft(input);

      expect(output).toContain('padding-left: 20px');
    });

    it('等宽字体的第 1 层列表使用更大的 32px 缩进，避免标记越过正文左缘', () => {
      const input = `<section style="font-family: 'SF Mono', Consolas, Menlo, Courier, monospace;"><ul><li>条目</li></ul></section>`;
      const output = cleanHtmlForDraft(input);

      expect(output).toContain('padding-left: 32px');
      expect(output).not.toContain('padding-left: 20px');
    });

    it('等宽字体的嵌套层级按层累加同一基准缩进（32 / 64）', () => {
      const input = `<section style="font-family: 'SF Mono', Consolas, monospace;"><ul><li>父项<ul><li>子项</li></ul></li></ul></section>`;
      const output = cleanHtmlForDraft(input);

      expect(output).toContain('padding-left: 32px');
      expect(output).toContain('padding-left: 64px');
    });

    it('无 section / 未声明字体时回退到 20px 基准缩进', () => {
      const output = cleanHtmlForDraft('<ul><li>条目</li></ul>');

      expect(output).toContain('padding-left: 20px');
    });

    it('预览（主题）与发布（清洗）对等宽列表使用同一缩进值，保证两处一致', () => {
      const { LIST_INDENT, resolveListIndent } = require('../themes/apple-theme-config');
      const AppleTheme = require('../themes/apple-theme.js').default || require('../themes/apple-theme.js');

      // 主题：预览渲染路径
      const theme = new AppleTheme({ fontFamily: 'monospace' });
      const olStyle = theme.getStyle('ol');
      const themePx = Number(olStyle.match(/padding-left:\s*(\d+)px/)?.[1]);

      // 清洗：复制/发布路径（从渲染产物的 font-family 探测）
      const monospaceStack = AppleTheme.FONTS.monospace;
      const cleaned = cleanHtmlForDraft(
        `<section style="font-family: ${monospaceStack};"><ul><li>条目</li></ul></section>`
      );
      const cleanPx = Number(cleaned.match(/padding-left:\s*(\d+)px/)?.[1]);

      expect(themePx).toBe(LIST_INDENT.monospace);
      expect(cleanPx).toBe(themePx);
      expect(resolveListIndent('monospace')).toBe(LIST_INDENT.monospace);
      expect(resolveListIndent(monospaceStack)).toBe(LIST_INDENT.monospace);
    });
  });
});


