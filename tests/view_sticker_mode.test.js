import { describe, it, expect, beforeEach, vi } from 'vitest';

const { loadInputModule } = require('./helpers/input-module.cjs');

describe('AppleStyleView - Sticker Mode Integration', () => {
  let AppleStyleView;
  let obsidianMock;

  beforeEach(() => {
    vi.resetModules();
    obsidianMock = require('obsidian');
    obsidianMock.requestUrl = vi.fn().mockResolvedValue({
      json: { media_id: 'draft-123' },
      status: 200
    });

    const inputModule = loadInputModule();
    AppleStyleView = inputModule.AppleStyleView;
  });

  it('should initialize with default previewMode as article', () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);

    expect(view.previewMode).toBe('article');
  });

  it('should toggle previewMode between article and sticker', () => {
    const leaf = { view: null };
    const plugin = { settings: { wechatAccounts: [] } };
    const view = new AppleStyleView(leaf, plugin);

    view.convertCurrent = vi.fn();
    view.renderStickerPreview = vi.fn();
    view.closeTransientPanels = vi.fn();

    view.switchPreviewMode('sticker');
    expect(view.previewMode).toBe('sticker');
    expect(view.renderStickerPreview).toHaveBeenCalled();

    view.switchPreviewMode('article');
    expect(view.previewMode).toBe('article');
    expect(view.convertCurrent).toHaveBeenCalled();
  });
});
