import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('AppleStyleConverter - validateLink', () => {
  let AppleStyleConverter;
  let converter;

  beforeAll(() => {
    // 1. Read the converter.js file content
    const converterPath = path.resolve(__dirname, '../converter.js');
    const code = fs.readFileSync(converterPath, 'utf8');

    // 2. Simulate the browser environment (window)
    // Vitest with environment: 'jsdom' already provides 'window'
    if (typeof window === 'undefined') {
      throw new Error('This test requires jsdom environment');
    }

    // 3. Eval the code to load AppleStyleConverter into window
    // We wrap it in a function or just eval it in global scope
    // The file assigns: window.AppleStyleConverter = ...
    try {
        // eslint-disable-next-line no-eval
        (0, eval)(code);
    } catch (e) {
        console.error("Error evaluating converter.js:", e);
    }

    AppleStyleConverter = window.AppleStyleConverter;

    if (!AppleStyleConverter) {
        throw new Error('Failed to load AppleStyleConverter from converter.js');
    }

    // 4. Initialize converter instance with a mock theme
    const mockTheme = {
      getStyle: () => '',
      getThemeColorValue: () => '#000000',
      getSizes: () => ({ base: 16 }),
      getFontFamily: () => 'sans-serif',
      themeName: 'default'
    };
    converter = new AppleStyleConverter(mockTheme);
  });

  it('should allow http and https protocols', () => {
    expect(converter.validateLink('http://example.com')).toBe('http://example.com');
    expect(converter.validateLink('https://example.com/image.png')).toBe('https://example.com/image.png');
  });

  it('should allow obsidian internal links', () => {
    expect(converter.validateLink('obsidian://open?vault=MyVault&file=Note')).toBe('obsidian://open?vault=MyVault&file=Note');
  });

  it('should allow mailto and tel protocols', () => {
    expect(converter.validateLink('mailto:user@example.com')).toBe('mailto:user@example.com');
    expect(converter.validateLink('tel:+1234567890')).toBe('tel:+1234567890');
  });

  // 🔥 The Critical Fix Test Cases
  it('should allow app: protocol for local resources (Desktop)', () => {
    const localPath = 'app://local/path/to/image.png';
    expect(converter.validateLink(localPath, false)).toBe(localPath);
    expect(converter.validateLink(localPath, true)).toBe(localPath);
  });

  it('should allow capacitor: protocol for local resources (Mobile)', () => {
    const mobilePath = 'capacitor://localhost/_/image.png';
    expect(converter.validateLink(mobilePath, false)).toBe(mobilePath);
    expect(converter.validateLink(mobilePath, true)).toBe(mobilePath);
  });

  it('should allow data: protocol ONLY for images', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    // As image source: Allowed
    expect(converter.validateLink(dataUri, true)).toBe(dataUri);

    // As regular link (href): Blocked -> #unsafe
    expect(converter.validateLink(dataUri, false)).toBe('#unsafe');
  });

  it('should block javascript: protocol', () => {
    expect(converter.validateLink('javascript:alert(1)')).toBe('#');
  });

  it('should block unknown protocols', () => {
    expect(converter.validateLink('unknown://example.com')).toBe('#');
    expect(converter.validateLink('vbscript:msgbox "hello"')).toBe('#');
  });

  it('should handle relative paths gracefully', () => {
    expect(converter.validateLink('/assets/image.png')).toBe('/assets/image.png');
    expect(converter.validateLink('image.png')).toBe('image.png');
    expect(converter.validateLink('#section-1')).toBe('#section-1');
  });
});
