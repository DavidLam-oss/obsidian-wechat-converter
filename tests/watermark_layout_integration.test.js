import { describe, it, expect } from 'vitest';

const { createLegacyConverter } = require('./helpers/render-runtime');

describe('Watermark layout integration', () => {
  it('should render avatar and caption as inline-safe siblings in watermark mode', async () => {
    const converter = await createLegacyConverter();
    converter.updateConfig({
      avatarUrl: 'https://example.com/avatar.png',
      showImageCaption: true,
    });

    const html = await converter.convert('![图片说明](https://example.com/body.png)');
    const container = document.createElement('div');
    container.innerHTML = html;

    const header = container.querySelector('figure > div');
    expect(header).not.toBeNull();

    const avatar = header.querySelector('img[alt="logo"]');
    const caption = header.querySelector('span');

    expect(avatar).not.toBeNull();
    expect(caption).not.toBeNull();
    expect(caption.textContent).toBe('图片说明');
    expect(avatar.nextElementSibling).toBe(caption);

    expect(header.getAttribute('style')).toContain('flex-wrap: nowrap !important;');
    expect(avatar.getAttribute('style')).toContain('display: inline-block !important;');
    expect(caption.getAttribute('style')).toContain('display: inline-block !important;');
  });
});
