import { describe, it, expect, vi } from 'vitest';
const {
  LegacyRenderPipeline,
  NativeRenderPipeline,
  createRenderPipelines,
} = require('../services/render-pipeline');

describe('Render Pipeline Switch (Native + Legacy Fallback)', () => {
  it('legacy pipeline should throw when converter is missing', async () => {
    const legacy = new LegacyRenderPipeline(null);
    await expect(legacy.renderForPreview('# title')).rejects.toThrow('Legacy converter is not ready');
  });

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

  it('native pipeline should fallback to legacy when renderer throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const legacy = {
      renderForPreview: vi.fn().mockResolvedValue('<section>legacy-fallback</section>'),
    };
    const nativeRenderer = vi.fn().mockRejectedValue(new Error('native crashed'));

    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({ useNativePipeline: true, enableLegacyFallback: true }),
    });

    const html = await native.renderForPreview('body', { sourcePath: 'note.md' });
    expect(html).toBe('<section>legacy-fallback</section>');
    expect(nativeRenderer).toHaveBeenCalledWith('body', { sourcePath: 'note.md' });
    expect(legacy.renderForPreview).toHaveBeenCalledWith('body', { sourcePath: 'note.md' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('native pipeline should rethrow when renderer throws and fallback is disabled', async () => {
    const nativeRenderer = vi.fn().mockRejectedValue(new Error('native crashed'));
    const legacy = { renderForPreview: vi.fn() };

    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({ useNativePipeline: true, enableLegacyFallback: false }),
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('native crashed');
    expect(legacy.renderForPreview).not.toHaveBeenCalled();
  });

  it('native pipeline should use native renderer result when successful', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn() };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({ useNativePipeline: true, enableLegacyFallback: true }),
    });

    const html = await native.renderForPreview('body');
    expect(html).toBe('<section>native</section>');
    expect(legacy.renderForPreview).not.toHaveBeenCalled();
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
