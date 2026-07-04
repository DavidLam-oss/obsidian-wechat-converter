import { describe, it, expect, vi } from 'vitest';
const { createLegacyConverter } = require('./helpers/render-runtime');

function makeApp(files = {}) {
  const byPath = new Map(Object.entries(files));
  return {
    metadataCache: {
      getFirstLinkpathDest: vi.fn(() => null),
    },
    vault: {
      getAbstractFileByPath: vi.fn((filePath) => byPath.get(filePath) || null),
      getResourcePath: vi.fn((file) => `app://local/${encodeURIComponent(file.path)}`),
    },
  };
}

describe('converter local image resolution', () => {
  it('resolves note-relative markdown image paths when metadata cache misses', async () => {
    const imageFile = { path: 'notes/images/a.png', name: 'a.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const html = await converter.convert('![图](images/a.png)');

    expect(html).toContain('app://local/notes%2Fimages%2Fa.png');
  });

  it('resolves same-directory wiki images when metadata cache misses', async () => {
    const imageFile = { path: 'notes/local.png', name: 'local.png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const html = await converter.convert('![[local.png]]');

    expect(html).toContain('app://local/notes%2Flocal.png');
  });

  it('resolves decoded Chinese paths with spaces and parentheses', async () => {
    const imageFile = { path: 'notes/images/中文 图(1).png', name: '中文 图(1).png', extension: 'png' };
    const converter = await createLegacyConverter({ sourcePath: 'notes/post.md' });
    converter.app = makeApp({ [imageFile.path]: imageFile });

    const src = converter.resolveImagePath('images/%E4%B8%AD%E6%96%87%20%E5%9B%BE(1).png');

    expect(src).toBe('app://local/notes%2Fimages%2F%E4%B8%AD%E6%96%87%20%E5%9B%BE(1).png');
  });
});
