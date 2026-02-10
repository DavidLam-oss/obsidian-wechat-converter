import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Alias configured in vitest.config.mjs handles the mock
const { AppleStyleView } = require('../input.js');

describe('AppleStyleView - copyHTML clipboard behavior', () => {
  let view;
  let writeMock;
  let realBlob;
  const blobToText = async (blob) => {
    if (blob && typeof blob.text === 'function') return blob.text();
    return new Response(blob).text();
  };

  beforeEach(() => {
    view = new AppleStyleView(null, null);
    view.currentHtml = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    view.processImagesToDataURL = vi.fn().mockResolvedValue(false);
    view.cleanHtmlForDraft = vi.fn(() => '<ol><li>清理时机： 正文</li></ol>');

    writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { write: writeMock },
      configurable: true,
    });

    global.ClipboardItem = class ClipboardItemMock {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items);
      }
    };

    realBlob = global.Blob;
    global.Blob = class BlobMock {
      constructor(parts = [], options = {}) {
        this.parts = parts;
        this.type = options.type || '';
      }
      async text() {
        return this.parts
          .map((part) => (typeof part === 'string' ? part : String(part)))
          .join('');
      }
    };

    window.__OWC_LAST_CLIPBOARD_HTML = undefined;
    window.__OWC_LAST_CLIPBOARD_TEXT = undefined;
  });

  afterEach(() => {
    delete global.ClipboardItem;
    global.Blob = realBlob;
  });

  it('should prefer html-only clipboard write and expose debug snapshots', async () => {
    await view.copyHTML();

    expect(writeMock).toHaveBeenCalledTimes(1);
    const item = writeMock.mock.calls[0][0][0];
    expect(Object.keys(item.items)).toEqual(['text/html']);

    const html = await blobToText(item.items['text/html']);
    expect(html).toBe('<ol><li>清理时机： 正文</li></ol>');
    expect(window.__OWC_LAST_CLIPBOARD_HTML).toBe(html);
    expect(window.__OWC_LAST_CLIPBOARD_TEXT).toBe('清理时机： 正文');
  });

  it('should fallback to html+plain when html-only write fails', async () => {
    writeMock
      .mockRejectedValueOnce(new Error('html-only blocked'))
      .mockResolvedValueOnce(undefined);

    await view.copyHTML();

    expect(writeMock).toHaveBeenCalledTimes(2);

    const firstItem = writeMock.mock.calls[0][0][0];
    expect(Object.keys(firstItem.items)).toEqual(['text/html']);

    const secondItem = writeMock.mock.calls[1][0][0];
    expect(Object.keys(secondItem.items).sort()).toEqual(['text/html', 'text/plain']);

    const plain = await blobToText(secondItem.items['text/plain']);
    expect(plain).toBe('清理时机： 正文');
  });
});
