import { describe, it, expect, vi } from 'vitest';
const { resolveMarkdownSource } = require('../services/markdown-source');

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
