import { describe, it, expect, vi } from 'vitest';
const {
  NativeRenderPipeline,
  createRenderPipelines,
} = require('../services/render-pipeline');

describe('Render Pipeline (Native-only)', () => {
  it('native pipeline should throw when renderer is missing', async () => {
    const native = new NativeRenderPipeline({
      nativeRenderer: undefined,
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('Triplet render pipeline is not implemented yet');
  });

  it('native pipeline should use native renderer result when successful', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const native = new NativeRenderPipeline({
      nativeRenderer,
    });

    const html = await native.renderForPreview('body', { sourcePath: 'a.md' });
    expect(html).toBe('<section>native</section>');
    expect(nativeRenderer).toHaveBeenCalledWith('body', { sourcePath: 'a.md' });
  });

  it('native pipeline should prioritize candidateRenderer over nativeRenderer', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const candidateRenderer = vi.fn().mockResolvedValue('<section>candidate</section>');
    const native = new NativeRenderPipeline({
      nativeRenderer,
      candidateRenderer,
    });

    const html = await native.renderForPreview('body');
    expect(html).toBe('<section>candidate</section>');
    expect(candidateRenderer).toHaveBeenCalledTimes(1);
    expect(nativeRenderer).not.toHaveBeenCalled();
  });

  it('native pipeline should rethrow renderer errors', async () => {
    const nativeRenderer = vi.fn().mockRejectedValue(new Error('native crashed'));
    const native = new NativeRenderPipeline({
      nativeRenderer,
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('native crashed');
  });

  it('native pipeline renderForExport should wrap html with diagnostics array', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const native = new NativeRenderPipeline({
      nativeRenderer,
    });

    const result = await native.renderForExport('body', { sourcePath: 'x.md' });
    expect(result).toEqual({
      html: '<section>native</section>',
      diagnostics: [],
    });
  });

  it('createRenderPipelines should expose native pipeline instance', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const pipelines = createRenderPipelines({
      nativeRenderer,
    });

    expect(pipelines.nativePipeline).toBeInstanceOf(NativeRenderPipeline);
    const html = await pipelines.nativePipeline.renderForPreview('x');
    expect(html).toBe('<section>native</section>');
  });
});
