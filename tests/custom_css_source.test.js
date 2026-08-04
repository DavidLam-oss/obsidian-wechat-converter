/*
## 核心功能

验证自定义 CSS 来源优先级，以及 Markdown frontmatter / fenced CSS 提取合同。

## 输入

接收插件设置、vault 笔记路径与 Markdown/CSS 文本。

## 输出

输出规范化来源、提取结果和结构化诊断断言。

## 定位

位于 tests/，覆盖自定义 CSS 来源解析边界。

## 依赖

Vitest 与 custom-css-source。

## 维护规则

来源优先级或 Markdown 提取规则变化时同步更新回退用例。
*/

import { describe, expect, it } from 'vitest';
import {
  extractCustomCssFromMarkdown,
  normalizeCustomCssNotePath,
  resolveCustomCssSource,
} from '../services/custom-css-source.js';

describe('custom-css-source', () => {
  it('规范化 vault 路径并兼容省略 .md', async () => {
    const file = { extension: 'md', path: 'Meta/custom-css.md' };
    const plugin = {
      settings: {
        enableCustomCss: true,
        customCss: 'p { color: black; }',
        customCssNote: '\\Meta//custom-css',
      },
      app: {
        vault: {
          getAbstractFileByPath: (path) => path === 'Meta/custom-css.md' ? file : null,
          read: async () => 'h2 { color: blue; }',
        },
      },
    };

    expect(normalizeCustomCssNotePath('\\Meta//custom-css')).toBe('Meta/custom-css');
    await expect(resolveCustomCssSource(plugin)).resolves.toMatchObject({
      kind: 'note',
      identity: 'note:Meta/custom-css.md',
      path: 'Meta/custom-css.md',
      cssText: 'h2 { color: blue; }',
    });
  });

  it('移除 frontmatter 并按顺序合并多个 css fenced block', () => {
    const result = extractCustomCssFromMarkdown([
      '---',
      'tags: [排版]',
      '---',
      '# 样式说明',
      '```css',
      'h2 { color: blue; }',
      '```',
      '```js',
      'alert(1)',
      '```',
      '~~~CSS',
      'p { line-height: 1.9; }',
      '~~~',
    ].join('\n'));

    expect(result.diagnostics).toEqual([]);
    expect(result.cssText).toBe('h2 { color: blue; }\n\np { line-height: 1.9; }');
  });

  it('没有 css fence 时把 frontmatter 后内容作为裸 CSS', () => {
    const result = extractCustomCssFromMarkdown('---\nname: demo\n---\np { color: red; }');
    expect(result.cssText).toBe('p { color: red; }');
  });

  it('未闭合 frontmatter 与 fence 返回 fatal 诊断', () => {
    expect(extractCustomCssFromMarkdown('---\nname: demo').diagnostics[0]).toMatchObject({
      severity: 'fatal',
      code: 'custom-css-frontmatter-unclosed',
    });
    expect(extractCustomCssFromMarkdown('```css\np { color: red; }').diagnostics[0]).toMatchObject({
      severity: 'fatal',
      code: 'custom-css-fence-unclosed',
    });
  });

  it('笔记不存在时回退 textarea 并保留 warning', async () => {
    const result = await resolveCustomCssSource({
      settings: {
        enableCustomCss: true,
        customCss: 'p { color: red; }',
        customCssNote: 'Missing',
      },
      app: {
        vault: {
          getAbstractFileByPath: () => null,
          read: async () => '',
        },
      },
    });

    expect(result).toMatchObject({
      kind: 'textarea',
      identity: 'textarea',
      cssText: 'p { color: red; }',
    });
    expect(result.diagnostics[0].code).toBe('custom-css-note-not-found');
  });
});
