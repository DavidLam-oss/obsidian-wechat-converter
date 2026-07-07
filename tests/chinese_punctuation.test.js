/*
## 核心功能

覆盖 chinese punctuation 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 chinese punctuation 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect } from 'vitest';
const { JSDOM } = require('jsdom');
const {
  normalizeTextForChinesePunctuation,
  normalizeRenderedDomPunctuation,
} = require('../services/chinese-punctuation');
const { renderObsidianTripletMarkdown } = require('../services/obsidian-triplet-renderer');

describe('Chinese punctuation normalization', () => {
  it('should normalize common ASCII punctuation in Chinese text', () => {
    const input = '他说, "你好". 这是测试: 没问题!';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('他说， “你好”。 这是测试： 没问题！');
  });

  it('should keep decimal points and English-only text unchanged', () => {
    expect(normalizeTextForChinesePunctuation('Version 2.1 is stable, right?')).toBe('Version 2.1 is stable, right?');
    expect(normalizeTextForChinesePunctuation('价格是 3.14 元.')).toBe('价格是 3.14 元。');
  });

  it('should keep URLs and function syntax unchanged inside Chinese paragraphs', () => {
    const input = '访问 https://example.com/a?b=1, 调用 foo(bar, baz), 然后继续处理.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('访问 https://example.com/a?b=1， 调用 foo(bar, baz)， 然后继续处理。');
  });

  it('should keep email, version, and file path tokens unchanged', () => {
    const input = '联系 support@example.com, 当前版本 v1.2.3, 配置文件在 ./docs/release-notes.md, 然后发布.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('联系 support@example.com， 当前版本 v1.2.3， 配置文件在 ./docs/release-notes.md， 然后发布。');
  });

  it('should keep windows paths, cli tokens, and datetime unchanged', () => {
    const input = '在 2026-03-09 09:15:11, 执行 npm run test:coverage -- --run tests/chinese_punctuation.test.js, 并查看 C:\\Users\\david\\notes\\draft.md, 然后结束.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('在 2026-03-09 09:15:11， 执行 npm run test:coverage -- --run tests/chinese_punctuation.test.js， 并查看 C:\\Users\\david\\notes\\draft.md， 然后结束。');
  });

  it('should keep env assignments and slash dates unchanged', () => {
    const input = '请在 2026/02/13 23:00, 设置 NODE_ENV=production, API_BASE_URL="https://api.example.com/v1", 然后重启.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('请在 2026/02/13 23:00， 设置 NODE_ENV=production， API_BASE_URL="https://api.example.com/v1"， 然后重启。');
  });

  it('should preserve ellipsis without corrupting period normalization', () => {
    expect(normalizeTextForChinesePunctuation('省略号... 然后继续.')).toBe('省略号... 然后继续。');
    expect(normalizeTextForChinesePunctuation('中文......继续')).toBe('中文......继续');
  });

  it('should keep technical parenthetical expressions unchanged', () => {
    const input = '公式(x+y), 矩阵(A,B), 然后继续.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('公式(x+y)， 矩阵(A,B)， 然后继续。');
  });

  it('should keep single-symbol technical parenthetical expressions unchanged', () => {
    const input = '变量(x), 见式(y), 以及(z1), 然后继续.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('变量(x)， 见式(y)， 以及(z1)， 然后继续。');
  });

  it('should keep ascii quotes unchanged when they are not in CJK quote context', () => {
    const input = '中文段落。 He said "hello", then left.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('中文段落。 He said "hello", then left.');
  });

  it('should normalize single quotes in Chinese context', () => {
    const input = "他说 'hello', 然后继续.";
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe("他说 ‘hello’， 然后继续。");
  });

  it('should keep non-technical function-like matches unchanged when custom protection rejects them', () => {
    const input = '说明 foo(中文), 然后继续.';
    const output = normalizeTextForChinesePunctuation(input);

    expect(output).toBe('说明 foo(中文)， 然后继续。');
  });

  it('should skip code and pre text nodes in rendered DOM', () => {
    const dom = new JSDOM('<div id="root"><p>中文, "引号"(示例).</p><p><code>code, "demo"(x).</code></p><pre>block, "demo"(x).</pre></div>');
    const root = dom.window.document.querySelector('#root');

    normalizeRenderedDomPunctuation(root, { enabled: true });

    expect(root.querySelector('p').textContent).toBe('中文， “引号”（示例）。');
    expect(root.querySelector('code').textContent).toBe('code, "demo"(x).');
    expect(root.querySelector('pre').textContent).toBe('block, "demo"(x).');
  });

  it('should no-op when rendered DOM normalization is disabled', () => {
    const dom = new JSDOM('<div id="root"><p>中文, "引号"(示例).</p></div>');
    const root = dom.window.document.querySelector('#root');

    normalizeRenderedDomPunctuation(root, { enabled: false });

    expect(root.querySelector('p').textContent).toBe('中文, "引号"(示例).');
  });

  it('should skip blank text nodes and skipped ancestor tags', () => {
    const dom = new JSDOM('<div id="root"><span>   </span><textarea>中文, "引号".</textarea><p>中文, "引号".</p></div>');
    const root = dom.window.document.querySelector('#root');

    normalizeRenderedDomPunctuation(root, { enabled: true });

    expect(root.querySelector('textarea').value).toBe('中文, "引号".');
    expect(root.querySelector('p').textContent).toBe('中文， “引号”。');
  });

  it('should apply normalization in triplet render flow only when enabled', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>中文, "引号"(示例).</p><p><code>code, "demo"(x).</code></p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const disabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: false },
        markdownRenderer,
        serializer,
      });
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(disabled).toContain('中文, "引号"(示例).');
      expect(enabled).toContain('中文， “引号”（示例）。');
      expect(enabled).toContain('<code>code, "demo"(x).</code>');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve url text and function syntax in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>访问 https://example.com/a?b=1, 调用 foo(bar, baz), 然后继续处理.</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('访问 https://example.com/a?b=1， 调用 foo(bar, baz)， 然后继续处理。');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve email, version, and path tokens in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>联系 support@example.com, 当前版本 v1.2.3, 配置文件在 ./docs/release-notes.md, 然后发布.</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('联系 support@example.com， 当前版本 v1.2.3， 配置文件在 ./docs/release-notes.md， 然后发布。');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve windows paths, cli tokens, and datetime in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>在 2026-03-09 09:15:11, 执行 npm run test:coverage -- --run tests/chinese_punctuation.test.js, 并查看 C:\\Users\\david\\notes\\draft.md, 然后结束.</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('在 2026-03-09 09:15:11， 执行 npm run test:coverage -- --run tests/chinese_punctuation.test.js， 并查看 C:\\Users\\david\\notes\\draft.md， 然后结束。');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve env assignments and slash dates in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>请在 2026/02/13 23:00, 设置 NODE_ENV=production, API_BASE_URL="https://api.example.com/v1", 然后重启.</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('请在 2026/02/13 23:00， 设置 NODE_ENV=production， API_BASE_URL="https://api.example.com/v1"， 然后重启。');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve ellipsis in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>省略号... 然后继续. 中文......继续</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('省略号... 然后继续。 中文......继续');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve technical parenthetical expressions in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>公式(x+y), 矩阵(A,B), 然后继续.</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('公式(x+y)， 矩阵(A,B)， 然后继续。');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });

  it('should preserve single-symbol technical parenthetical expressions in triplet render flow', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = dom.window;
    global.document = dom.window.document;

    const markdownRenderer = {
      renderMarkdown: async (_markdown, el) => {
        el.innerHTML = '<p>变量(x), 见式(y), 以及(z1), 然后继续.</p>';
      },
    };

    const serializer = ({ root }) => root.innerHTML;

    try {
      const enabled = await renderObsidianTripletMarkdown({
        converter: {},
        markdown: 'x',
        settings: { normalizeChinesePunctuation: true },
        markdownRenderer,
        serializer,
      });

      expect(enabled).toContain('变量(x)， 见式(y)， 以及(z1)， 然后继续。');
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
    }
  });
});
