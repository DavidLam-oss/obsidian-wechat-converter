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

describe('AppleStyleView parity mismatch + lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('convertCurrent should render parity mismatch placeholder in silent mode', async () => {
    const view = new AppleStyleView(null, { settings: {} });
    view.previewContainer = createObsidianLikeElement();
    view.previewContainer.addClass('apple-has-content');
    view.currentHtml = '<p>old</p>';

    view.app = {
      workspace: {
        getActiveViewOfType: vi.fn(() => ({
          editor: { getValue: () => '# micro sample' },
          file: { path: 'fixtures/micro.md', basename: 'micro' },
        })),
      },
    };

    const mismatchError = new Error('mismatch');
    mismatchError.code = 'TRIPLET_PARITY_MISMATCH';
    mismatchError.parity = {
      index: 12,
      segmentCount: 2,
      segments: [
        { index: 12, legacyLine: 1, legacyColumn: 13 },
        { index: 48, legacyLine: 2, legacyColumn: 7 },
      ],
    };
    vi.spyOn(view, 'renderMarkdownForPreview').mockRejectedValue(mismatchError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await view.convertCurrent(true);

    expect(view.currentHtml).toBeNull();
    expect(view.previewContainer.classList.contains('apple-has-content')).toBe(false);
    expect(view.previewContainer.textContent).toContain('三件套渲染未通过零差异门禁');
    expect(view.previewContainer.textContent).toContain('micro.md 与 Phase2 基线输出存在差异（首个 index 12，共 2 段差异）。');
    expect(view.previewContainer.textContent).toContain('#1: index 12（legacy 1:13）');
    expect(view.lastParityMismatchNoticeKey).toBe('fixtures/micro.md:12:2');
  });

  it('logParityMismatchDetails should emit full payload logs only in verbose mode', () => {
    const view = new AppleStyleView(null, { settings: { tripletParityVerboseLog: true } });
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const segments = Array.from({ length: 8 }, (_, i) => ({
      index: i * 10,
      legacyLine: i + 1,
      legacyColumn: 2,
      candidateLine: i + 1,
      candidateColumn: 2,
      legacySnippet: `legacy-${i}`,
      candidateSnippet: `candidate-${i}`,
    }));

    view.logParityMismatchDetails('fixtures/micro.md', {
      index: 10,
      segmentCount: segments.length,
      lengthDelta: 4,
      legacyLength: 120,
      candidateLength: 124,
      truncated: false,
      segments,
    });

    expect(console.log).toHaveBeenCalledWith('[Triplet Parity] full-details', expect.objectContaining({
      sourcePath: 'fixtures/micro.md',
      segmentCount: 8,
      segments: expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 70 }),
      ]),
    }));
    expect(console.error).toHaveBeenCalledWith(
      '[Triplet Parity] full-details-json',
      expect.stringContaining('"sourcePath":"fixtures/micro.md"')
    );
    expect(window.__OWC_LAST_PARITY_DETAILS).toEqual(expect.objectContaining({
      sourcePath: 'fixtures/micro.md',
      segmentCount: 8,
    }));
  });

  it('logParityMismatchDetails should keep machine payload but skip full logs by default', () => {
    const view = new AppleStyleView(null, { settings: {} });
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    view.logParityMismatchDetails('fixtures/default.md', {
      index: 1,
      segmentCount: 1,
      segments: [{ index: 1, legacyLine: 1, legacyColumn: 1 }],
    });

    expect(console.log).not.toHaveBeenCalledWith(
      '[Triplet Parity] full-details',
      expect.anything()
    );
    expect(console.error).not.toHaveBeenCalledWith(
      '[Triplet Parity] full-details-json',
      expect.any(String)
    );
    expect(window.__OWC_LAST_PARITY_DETAILS).toEqual(expect.objectContaining({
      sourcePath: 'fixtures/default.md',
      segmentCount: 1,
    }));
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
