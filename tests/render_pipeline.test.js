import { describe, it, expect, vi } from 'vitest';
const {
  LegacyRenderPipeline,
  NativeRenderPipeline,
  createRenderPipelines,
} = require('../services/render-pipeline');

describe('Render Pipeline Switch (Native + Legacy Fallback)', () => {
  it('legacy pipeline should update sourcePath and return converter html', async () => {
    const updateSourcePath = vi.fn();
    const convert = vi.fn().mockResolvedValue('<section>ok</section>');
    const legacy = new LegacyRenderPipeline({ updateSourcePath, convert });

    const html = await legacy.renderForPreview('# title', { sourcePath: 'notes/a.md' });

    expect(updateSourcePath).toHaveBeenCalledWith('notes/a.md');
    expect(convert).toHaveBeenCalledWith('# title');
    expect(html).toBe('<section>ok</section>');
  });

  it('native pipeline should fallback to legacy when renderer is not implemented', async () => {
    const legacy = {
      renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>'),
    };

    const native = new NativeRenderPipeline({
      nativeRenderer: undefined,
      legacyPipeline: legacy,
      getFlags: () => ({ useNativePipeline: true, enableLegacyFallback: true }),
    });

    const html = await native.renderForPreview('body', { sourcePath: 'x.md' });
    expect(html).toBe('<section>legacy</section>');
    expect(legacy.renderForPreview).toHaveBeenCalledWith('body', { sourcePath: 'x.md' });
  });

  it('native pipeline should throw when renderer is missing and fallback is disabled', async () => {
    const native = new NativeRenderPipeline({
      nativeRenderer: undefined,
      legacyPipeline: { renderForPreview: vi.fn() },
      getFlags: () => ({ useNativePipeline: true, enableLegacyFallback: false }),
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('Native render pipeline is not implemented yet');
  });

  it('createRenderPipelines should expose both pipeline instances', async () => {
    const convert = vi.fn().mockResolvedValue('<section>html</section>');
    const pipelines = createRenderPipelines({
      converter: { convert },
      getFlags: () => ({ useNativePipeline: false, enableLegacyFallback: true }),
    });

    expect(pipelines.legacyPipeline).toBeInstanceOf(LegacyRenderPipeline);
    expect(pipelines.nativePipeline).toBeInstanceOf(NativeRenderPipeline);
  });
});
