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

    await expect(native.renderForPreview('body')).rejects.toThrow('Triplet render pipeline is not implemented yet');
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

  it('native pipeline should fallback to legacy on parity mismatch when gate is enabled', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const paritySpy = vi.fn();
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: true,
        enforceNativeParity: true,
        onParityMismatch: paritySpy,
      }),
    });

    const html = await native.renderForPreview('body', { sourcePath: 'a.md' });
    expect(html).toBe('<section>legacy</section>');
    expect(paritySpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('native pipeline should throw on parity mismatch when fallback is disabled', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: false,
        enforceNativeParity: true,
      }),
    });

    await expect(native.renderForPreview('body')).rejects.toMatchObject({
      code: 'PARITY_MISMATCH',
    });
  });

  it('native pipeline should honor triplet-prefixed flags', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useTripletPipeline: true,
        tripletFallbackToPhase2: false,
        enforceTripletParity: true,
      }),
    });

    await expect(native.renderForPreview('body')).rejects.toMatchObject({
      code: 'PARITY_MISMATCH',
    });
    expect(nativeRenderer).toHaveBeenCalledTimes(1);
    expect(legacy.renderForPreview).toHaveBeenCalledTimes(1);
  });

  it('native pipeline should expose custom parity error code when configured', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useTripletPipeline: true,
        tripletFallbackToPhase2: false,
        enforceTripletParity: true,
        parityErrorCode: 'TRIPLET_PARITY_MISMATCH',
      }),
    });

    await expect(native.renderForPreview('body')).rejects.toMatchObject({
      code: 'TRIPLET_PARITY_MISMATCH',
    });
  });

  it('native pipeline should pass parity gate when html is exactly equal', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>same</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>same</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: true,
        enforceNativeParity: true,
      }),
    });

    const html = await native.renderForPreview('body');
    expect(html).toBe('<section>same</section>');
  });

  it('native pipeline should use parityTransform output for parity check', async () => {
    const paritySpy = vi.fn();
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native:<strong>x</strong></section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy:**x**</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: true,
        enforceNativeParity: true,
        parityTransform: (html) => html.replace('<strong>x</strong>', '**x**').replace('native:', 'legacy:'),
        onParityMismatch: paritySpy,
      }),
    });

    const html = await native.renderForPreview('body');
    expect(html).toBe('<section>native:<strong>x</strong></section>');
    expect(paritySpy).not.toHaveBeenCalled();
  });

  it('native pipeline should fallback to legacy when parityTransform throws and fallback is enabled', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: true,
        enforceNativeParity: true,
        parityTransform: () => {
          throw new Error('transform crashed');
        },
      }),
    });

    const html = await native.renderForPreview('body');
    expect(html).toBe('<section>legacy</section>');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('native pipeline should throw when parityTransform throws and fallback is disabled', async () => {
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: false,
        enforceNativeParity: true,
        parityTransform: () => {
          throw new Error('transform crashed');
        },
      }),
    });

    await expect(native.renderForPreview('body')).rejects.toThrow('transform crashed');
  });

  it('native pipeline should pass detailed payload to onParityMismatch', async () => {
    const paritySpy = vi.fn();
    const nativeRenderer = vi.fn().mockResolvedValue('<section>native</section>');
    const legacy = { renderForPreview: vi.fn().mockResolvedValue('<section>legacy</section>') };
    const native = new NativeRenderPipeline({
      nativeRenderer,
      legacyPipeline: legacy,
      getFlags: () => ({
        useNativePipeline: true,
        enableLegacyFallback: true,
        enforceNativeParity: true,
        onParityMismatch: paritySpy,
      }),
    });

    await native.renderForPreview('# title', { sourcePath: 'docs/a.md' });
    expect(paritySpy).toHaveBeenCalledTimes(1);

    const payload = paritySpy.mock.calls[0][0];
    expect(payload.context).toEqual({ sourcePath: 'docs/a.md' });
    expect(payload.mismatch.index).toBeGreaterThanOrEqual(9);
    expect(payload.mismatch.legacySnippet).toContain('legacy');
    expect(payload.mismatch.candidateSnippet).toContain('native');
    expect(payload.mismatch.segmentCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(payload.mismatch.segments)).toBe(true);
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
