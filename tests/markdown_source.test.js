/*
## 核心功能

覆盖 markdown source 相关行为的 Vitest 测试用例。

## 输入

接收被测模块、mock 的 Obsidian/jsdom 环境、fixture Markdown/HTML 和断言数据。

## 输出

输出自动化断言结果，保护渲染、同步、设置、安全或 UI 行为不回归。

## 定位

位于 tests/，是回归测试层；测试应描述用户可见或服务契约行为。

## 依赖

关键依赖：Vitest、项目 mock/helper，以及被测的 markdown source 模块。

## 维护规则

- 修改逻辑后同步更新本文件说明书，并检查 tests 的文件夹 README 是否仍准确。
- 保持职责边界清晰，跨层行为优先通过既有服务、视图或测试 helper 协作。
*/

import { describe, it, expect, vi } from 'vitest';
const {
  getMarkdownViewFromLeaf,
  resolveMarkdownContext,
  resolveMarkdownSource,
} = require('../services/markdown-source');

describe('Markdown Source Resolver', () => {
  const MarkdownViewType = class MockMarkdownView {};

  it('should read from active markdown view when present', async () => {
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# from editor' },
          file: { path: 'notes/editor.md' },
        })),
      },
      vault: {
        read: vi.fn(),
      },
    };

    const result = await resolveMarkdownSource({
      app,
      lastActiveFile: { path: 'fallback.md' },
      MarkdownViewType,
    });

    expect(result.ok).toBe(true);
    expect(result.markdown).toBe('# from editor');
    expect(result.sourcePath).toBe('notes/editor.md');
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it('should fallback to last active file when no active view', async () => {
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
      },
      vault: {
        read: vi.fn(async () => '# from vault'),
      },
    };

    const result = await resolveMarkdownSource({
      app,
      lastActiveFile: { path: 'notes/fallback.md' },
      MarkdownViewType,
    });

    expect(result.ok).toBe(true);
    expect(result.markdown).toBe('# from vault');
    expect(result.sourcePath).toBe('notes/fallback.md');
    expect(app.vault.read).toHaveBeenCalledWith({ path: 'notes/fallback.md' });
  });

  it('should read the workspace active file when the converter sidebar is active', async () => {
    const activeFile = { path: 'notes/current.md', extension: 'md' };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => activeFile),
      },
      vault: {
        read: vi.fn(async () => '# from recent workspace file'),
      },
    };

    const result = await resolveMarkdownSource({
      app,
      lastActiveFile: { path: 'notes/stale.md' },
      MarkdownViewType,
    });

    expect(result).toMatchObject({
      ok: true,
      markdown: '# from recent workspace file',
      sourcePath: 'notes/current.md',
    });
    expect(app.vault.read).toHaveBeenCalledWith(activeFile);
  });

  it('should keep event Markdown editor content ahead of workspace file reads', async () => {
    const eventView = {
      editor: { getValue: () => '# unsaved editor content' },
      file: { path: 'notes/event.md', extension: 'md' },
      getViewType: () => 'markdown',
    };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => ({ path: 'notes/recent.md', extension: 'md' })),
      },
      vault: { read: vi.fn() },
    };

    const result = await resolveMarkdownSource({
      app,
      lastActiveFile: null,
      MarkdownViewType,
      activeViewOverride: eventView,
    });

    expect(result).toMatchObject({
      ok: true,
      markdown: '# unsaved editor content',
      sourcePath: 'notes/event.md',
    });
    expect(app.workspace.getActiveViewOfType).not.toHaveBeenCalled();
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it('should ignore non-Markdown workspace files and fallback to the last Markdown file', () => {
    const lastActiveFile = { path: 'notes/fallback.md', extension: 'md' };
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
        getActiveFile: vi.fn(() => ({ path: 'boards/plan.canvas', extension: 'canvas' })),
      },
      vault: { read: vi.fn() },
    };

    const context = resolveMarkdownContext({
      app,
      lastActiveFile,
      MarkdownViewType,
    });

    expect(context).toEqual({ view: null, file: lastActiveFile });
  });

  it('should resolve a Markdown view directly from the active-leaf event', () => {
    const eventView = {
      file: { path: 'notes/event.md' },
      editor: { getValue: () => '# event' },
      getViewType: () => 'markdown',
    };

    expect(getMarkdownViewFromLeaf({ view: eventView }, MarkdownViewType)).toBe(eventView);
    expect(getMarkdownViewFromLeaf({ view: { getViewType: () => 'apple-style-converter' } }, MarkdownViewType)).toBeNull();
  });

  it('should return NO_ACTIVE_FILE when nothing is available', async () => {
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
      },
      vault: {
        read: vi.fn(),
      },
    };

    const result = await resolveMarkdownSource({
      app,
      lastActiveFile: null,
      MarkdownViewType,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NO_ACTIVE_FILE');
  });

  it('should return NO_ACTIVE_FILE when fallback read fails', async () => {
    const app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => null),
      },
      vault: {
        read: vi.fn(async () => {
          throw new Error('read failed');
        }),
      },
    };

    const result = await resolveMarkdownSource({
      app,
      lastActiveFile: { path: 'notes/fallback.md' },
      MarkdownViewType,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NO_ACTIVE_FILE');
    expect(result.error).toBeInstanceOf(Error);
  });
});
