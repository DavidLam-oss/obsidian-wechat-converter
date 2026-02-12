import { describe, it, expect, vi } from 'vitest';

const AppleStylePlugin = require('../input.js');
const { AppleStyleView } = require('../input.js');

describe('Render Pipeline Wiring (Native-only)', () => {
  it('should always route preview rendering to native pipeline', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};
    const view = new AppleStyleView({}, plugin);
    const renderForPreview = vi.fn().mockResolvedValue('<section>ok</section>');
    view.nativeRenderPipeline = { renderForPreview };

    const html = await view.renderMarkdownForPreview('# title', 'notes/a.md');

    expect(view.getActiveRenderPipeline()).toBe(view.nativeRenderPipeline);
    expect(renderForPreview).toHaveBeenCalledWith('# title', { sourcePath: 'notes/a.md' });
    expect(html).toBe('<section>ok</section>');
  });

  it('should throw when native pipeline is not initialized', async () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};
    const view = new AppleStyleView({}, plugin);

    await expect(view.renderMarkdownForPreview('# title', 'notes/a.md')).rejects.toThrow('渲染管线未初始化');
  });
});
