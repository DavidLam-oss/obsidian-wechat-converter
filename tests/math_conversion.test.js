import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock Obsidian & DOM Environment
vi.mock('obsidian', () => ({
  Notice: class {
    setMessage() {}
    hide() {}
  },
  requestUrl: vi.fn(),
}));

// Mock pMap to run sequentially in tests for easier assertion
// Note: In input.js, pMap is defined globally or locally.
// Since we are importing AppleStyleView which uses pMap internally (defined in module scope),
// we might need to mock global pMap or just let it run if it's exported.
// Looking at input.js, pMap is defined in module scope but not exported.
// However, since it's just a helper, it should work fine in jsdom environment.

const { AppleStyleView } = require('../input.js');

describe('AppleStyleView - Math Formula Processing', () => {
  let view;
  let mockApi;

  beforeEach(() => {
    view = new AppleStyleView(null, null);

    // Mock the WechatAPI object
    mockApi = {
      uploadImage: vi.fn().mockResolvedValue({ url: 'http://weixin.qq.com/math.png' })
    };

    // Mock svgToPngBlob (Critical: bypass Canvas requirement)
    // We attach it to the instance because it's a method of the class
    view.svgToPngBlob = vi.fn().mockResolvedValue(new Blob(['fake-png'], { type: 'image/png' }));
  });

  it('should skip processing if no math formulas exist', async () => {
    const inputHtml = '<div><p>No math here</p></div>';

    const outputHtml = await view.processMathFormulas(inputHtml, mockApi);

    expect(outputHtml).toBe(inputHtml);
    expect(view.svgToPngBlob).not.toHaveBeenCalled();
    expect(mockApi.uploadImage).not.toHaveBeenCalled();
  });

  it('should process a single math formula', async () => {
    // Construct HTML simulating MathJax output
    // MathJax usually wraps SVG in mjx-container
    const inputHtml = `
      <div>
        <p>Formula:</p>
        <mjx-container class="MathJax" jax="SVG">
          <svg viewBox="0 0 100 20" width="10ex" height="2ex"></svg>
        </mjx-container>
      </div>
    `;

    const outputHtml = await view.processMathFormulas(inputHtml, mockApi);

    // 1. Check if conversion was attempted
    expect(view.svgToPngBlob).toHaveBeenCalledTimes(1);

    // 2. Check if upload was attempted
    expect(mockApi.uploadImage).toHaveBeenCalledTimes(1);

    // 3. Check if DOM was replaced
    // The <mjx-container> should be replaced or contain the <img>
    // Our implementation replaces the svg's parent (mjx-container) if it exists
    expect(outputHtml).toContain('<img');
    expect(outputHtml).toContain('src="http://weixin.qq.com/math.png"');
    expect(outputHtml).not.toContain('<svg'); // SVG should be gone
    expect(outputHtml).toContain('class="math-formula-image"');
  });

  it('should process multiple formulas concurrently', async () => {
    const inputHtml = `
      <div>
        <mjx-container><svg id="eq1"></svg></mjx-container>
        <p>Text</p>
        <mjx-container><svg id="eq2"></svg></mjx-container>
      </div>
    `;

    const outputHtml = await view.processMathFormulas(inputHtml, mockApi);

    expect(view.svgToPngBlob).toHaveBeenCalledTimes(2);
    expect(mockApi.uploadImage).toHaveBeenCalledTimes(2);

    // Should contain two images
    const matches = outputHtml.match(/<img/g);
    expect(matches.length).toBe(2);
  });

  it('should handle upload failures gracefully (keep original SVG)', async () => {
    // Simulate upload failure for the first call
    view.svgToPngBlob.mockRejectedValueOnce(new Error('Canvas failed'));

    const inputHtml = `
      <div>
        <mjx-container><svg id="broken"></svg></mjx-container>
      </div>
    `;

    // Mock console.error to keep test output clean
    const spyConsole = vi.spyOn(console, 'error').mockImplementation(() => {});

    const outputHtml = await view.processMathFormulas(inputHtml, mockApi);

    // Should still contain SVG because conversion failed
    expect(outputHtml).toContain('<svg');
    expect(outputHtml).not.toContain('<img');

    spyConsole.mockRestore();
  });

  it('should preserve inline styles from mjx-container', async () => {
    const inputHtml = `
      <mjx-container style="vertical-align: -0.5ex; margin: 10px;">
        <svg></svg>
      </mjx-container>
    `;

    const outputHtml = await view.processMathFormulas(inputHtml, mockApi);

    // The img tag should inherit styles
    expect(outputHtml).toContain('style="vertical-align: -0.5ex; margin: 10px;"');
  });
});
