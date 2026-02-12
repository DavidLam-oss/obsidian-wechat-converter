import { describe, it, expect, vi, afterEach } from 'vitest';

const { AppleStyleView } = require('../input.js');

function createObsidianLikeElement(tag = 'div') {
  const el = document.createElement(tag);
  el.empty = function empty() {
    this.innerHTML = '';
  };
  el.addClass = function addClass(cls) {
    this.classList.add(cls);
  };
  el.removeClass = function removeClass(cls) {
    this.classList.remove(cls);
  };
  el.createEl = function createEl(childTag, opts = {}) {
    const child = createObsidianLikeElement(childTag);
    if (opts.cls) child.className = opts.cls;
    if (opts.text) child.textContent = opts.text;
    this.appendChild(child);
    return child;
  };
  return el;
}

describe('AppleStyleView native render + lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('convertCurrent should render native html in silent mode', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockResolvedValue('<section><p>native</p></section>');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBe('<section><p>native</p></section>');
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(true);
    expect(view.previewContainer.innerHTML).toContain('<p>native</p>');
  });

  it('convertCurrent should invalidate stale html on silent render failure', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.addClass('apple-has-content');
    view.previewContainer.innerHTML = '<section><p>stale</p></section>';
    view.currentHtml = '<section><p>stale</p></section>';
    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    vi.spyOn(view, 'renderMarkdownForPreview').mockRejectedValue(new Error('native boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBeNull();
    expect(view.lastRenderError).toBe('native boom');
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(false);
    expect(view.previewContainer.textContent).toContain('渲染失败');
    expect(view.previewContainer.textContent).toContain('native boom');
  });

  it('onSyncToWechat should stop before sync when render result is unavailable', async () => {
    const view = new AppleStyleView(null, {
      settings: {
        wechatAccounts: [{ id: 'acc-1', name: '账号1', appId: 'wx-1', appSecret: 'sec-1' }],
        defaultAccountId: 'acc-1',
        proxyUrl: '',
      },
    });
    view.currentHtml = null;
    view.lastRenderError = 'native boom';
    view.selectedAccountId = 'acc-1';

    const processAllImagesSpy = vi.spyOn(view, 'processAllImages');

    await view.onSyncToWechat();

    expect(processAllImagesSpy).not.toHaveBeenCalled();
  });

  it('onClose should detach listeners and clear all view-level caches', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    const removeEditorScroll = vi.fn();
    const removePreviewScroll = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    view.activeEditorScroller = {
      removeEventListener: removeEditorScroll,
    };
    view.editorScrollListener = vi.fn();

    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.innerHTML = '<p>preview</p>';
    view.previewContainer.removeEventListener = removePreviewScroll;
    view.previewScrollListener = vi.fn();

    view.articleStates = new Map([['note-a', { coverBase64: 'x', digest: 'd' }]]);
    view.svgUploadCache = new Map([['svg-hash', 'https://wx/svg.png']]);
    view.imageUploadCache = new Map([['acc-1::app://img', 'https://wx/img.png']]);

    await view.onClose();

    expect(removeEditorScroll).toHaveBeenCalledWith('scroll', view.editorScrollListener);
    expect(removePreviewScroll).toHaveBeenCalledWith('scroll', view.previewScrollListener);
    expect(view.previewContainer.innerHTML).toBe('');
    expect(view.articleStates.size).toBe(0);
    expect(view.svgUploadCache.size).toBe(0);
    expect(view.imageUploadCache.size).toBe(0);
  });
});
