import { describe, it, expect, beforeEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const { AppleStyleView } = require('../input.js');

describe('AppleStyleView - HTML Cleaning', () => {
  let view;

  beforeEach(() => {
    view = new AppleStyleView(null, null);
  });

  it('should remove margins from nested lists', () => {
    const inputHtml = `
      <ul>
        <li>
          Parent
          <ul style="margin-left: 20px;">
            <li>Child</li>
          </ul>
        </li>
      </ul>
    `;
    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    expect(outputHtml).not.toContain('margin-left: 20px');
    expect(outputHtml).toContain('margin: 0');
  });

  it('should remove empty list items', () => {
    const inputHtml = `
      <ul>
        <li>Valid</li>
        <li>   </li>
        <li></li>
      </ul>
    `;
    const outputHtml = view.cleanHtmlForDraft(inputHtml);

    // Use jsdom to parse output
    const div = document.createElement('div');
    div.innerHTML = outputHtml;
    const lis = div.querySelectorAll('li');

    expect(lis.length).toBe(1);
    expect(lis[0].textContent).toBe('Valid');
  });

  it('should unwrap paragraphs inside list items (when nested list exists)', () => {
    const inputHtml = `
      <ul>
        <li>
          <p>Content</p>
          <ul><li>Nested</li></ul>
        </li>
      </ul>
    `;
    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    expect(outputHtml).not.toContain('<p>');
    expect(outputHtml).toContain('Content');
  });

  it('should force strong and code inside list items to inline display', () => {
    const inputHtml = `
      <ol>
        <li>
          <strong style="font-weight:bold;color:#0366d6;display:block;width:100%;">清理时机</strong>：正文
        </li>
        <li>
          <code style="background:#eee;display:block;float:left;">cover</code> 字段
        </li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const firstLi = div.querySelector('ol > li:first-child');
    const secondLi = div.querySelector('ol > li:nth-child(2)');

    // 冒号标签词保留样式，并包裹在 block span 里，避免微信在列表项首段强制断行
    const firstWrapper = firstLi.querySelector(':scope > span');
    const firstLabel = firstWrapper?.querySelector('span');
    expect(firstWrapper).not.toBeNull();
    expect(firstLabel).not.toBeNull();
    expect(firstLabel.getAttribute('style')).toContain('display:inline !important;');
    expect(firstLi.textContent.replace(/\s+/g, ' ').trim()).toBe('清理时机： 正文');

    // 无冒号的 code 前缀仍保留为行内样式
    const secondLabel = secondLi.querySelector('span');
    expect(secondLabel).not.toBeNull();
    expect(secondLabel.getAttribute('style')).toContain('display:inline !important;');
    expect(secondLi.textContent.replace(/\s+/g, ' ').trim()).toBe('cover 字段');
  });

  it('should not force code block inside list item to inline display', () => {
    const inputHtml = `
      <ol>
        <li>
          <pre><code style="display:block; background:#111;">const x = 1;</code></pre>
        </li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const code = div.querySelector('li pre code');
    expect(code).not.toBeNull();
    expect(code.getAttribute('style')).not.toContain('display:inline !important;');
  });

  it('should collapse line break after strong label in list item paragraph', () => {
    const inputHtml = `
      <ol>
        <li>
          <p><strong>第三步：</strong><br>评估结果</p>
        </li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('li');
    expect(li.innerHTML).not.toContain('<br');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toMatch(/^第三步：\s*评估结果$/);
  });

  it('should merge split label/content paragraphs in list item', () => {
    const inputHtml = `
      <ol>
        <li>
          <p><strong>第三步：</strong></p>
          <p>评估结果</p>
        </li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const paragraphs = div.querySelectorAll('li > p');
    expect(paragraphs.length).toBe(0);
    expect(div.querySelector('li').textContent.replace(/\s+/g, ' ').trim()).toMatch(/^第三步：\s*评估结果$/);
  });

  it('should unwrap simple list-item paragraphs into one inline flow', () => {
    const inputHtml = `
      <ol>
        <li>
          <p><strong>第三步：</strong></p>
          <p>评估结果</p>
        </li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    expect(li.querySelector('p')).toBeNull();
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toMatch(/^第三步：\s*评估结果$/);
  });

  it('should support label prefix when colon is outside strong', () => {
    const inputHtml = `
      <ol>
        <li><strong>清理时机</strong>：<br>只有创建草稿成功后才清理</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    expect(li.innerHTML).not.toContain('<br');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toBe('清理时机： 只有创建草稿成功后才清理');
  });

  it('should keep non-leading strong untouched (no label rewrite)', () => {
    const inputHtml = `
      <ol>
        <li>前缀文本 <strong style="font-weight:bold;color:#0366d6;">标签：</strong> 内容</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    const strong = li.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong.textContent).toBe('标签：');
    expect(li.querySelector(':scope > span[style*="display:block"]')).toBeNull();
  });

  it('should not wrap leading formatted text when no colon is present', () => {
    const inputHtml = `
      <ol>
        <li><strong style="font-weight:bold;color:#0366d6;">说明</strong> 纯文本内容</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    const directSpan = li.querySelector(':scope > span');
    expect(directSpan).not.toBeNull();
    expect(directSpan.getAttribute('style')).toContain('display:inline !important;');
    expect(directSpan.getAttribute('style')).not.toContain('display:block');
  });

  it('should collapse newline before parenthetical note after leading strong label', () => {
    const inputHtml = `
      <ol>
        <li><strong style="font-weight:bold;color:#0366d6;">SSH 端口</strong>
        （通常是 22）</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toBe('SSH 端口（通常是 22）');
    expect(li.innerHTML).not.toContain('\n（');
  });

  it('should collapse newline before plain text after leading strong label', () => {
    const inputHtml = `
      <ol>
        <li><strong style="font-weight:bold;color:#0366d6;">登录用</strong>
        的用户名</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toBe('登录用的用户名');
    expect(li.innerHTML).not.toContain('\n的用户名');
  });

  it('should wrap plain-text continuation after leading prefix into inline span', () => {
    const inputHtml = `
      <ol>
        <li><span style="font-weight:bold;color:#0366d6;">登录用</span>的用户名</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    const spans = li.querySelectorAll('span');
    const texts = Array.from(spans).map((s) => (s.textContent || '').trim()).filter(Boolean);
    expect(texts).toContain('登录用');
    expect(texts).toContain('的用户名');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toBe('登录用的用户名');
  });

  it('should collapse br before parenthetical note after leading strong label', () => {
    const inputHtml = `
      <ol>
        <li><strong style="font-weight:bold;color:#0366d6;">SSH 私钥路径</strong><br>（或者密码）</li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toBe('SSH 私钥路径（或者密码）');
    expect(li.innerHTML).not.toContain('<br');
  });

  it('should remove newline-only spacer before element continuation after leading prefix', () => {
    const inputHtml = `
      <ol>
        <li><span style="font-weight:bold;color:#0366d6;">SSH 端口</span>
        <span>（通常是 22）</span></li>
      </ol>
    `;

    const outputHtml = view.cleanHtmlForDraft(inputHtml);
    const div = document.createElement('div');
    div.innerHTML = outputHtml;

    const li = div.querySelector('ol > li');
    expect(li.textContent.replace(/\s+/g, ' ').trim()).toBe('SSH 端口（通常是 22）');
    expect(li.innerHTML).not.toContain('\n<span>（通常是 22）</span>');
  });

  it('should be idempotent for list label cleanup', () => {
    const inputHtml = `
      <ol>
        <li><strong>第三步：</strong><br>评估结果</li>
      </ol>
    `;

    const once = view.cleanHtmlForDraft(inputHtml);
    const twice = view.cleanHtmlForDraft(once);
    expect(twice).toBe(once);
  });
});
