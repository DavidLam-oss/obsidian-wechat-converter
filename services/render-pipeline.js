class LegacyRenderPipeline {
  constructor(converter) {
    this.converter = converter;
  }

  async renderForPreview(markdown, context = {}) {
    if (!this.converter || typeof this.converter.convert !== 'function') {
      throw new Error('Legacy converter is not ready');
    }

    if (typeof this.converter.updateSourcePath === 'function') {
      this.converter.updateSourcePath(context.sourcePath || '');
    }

    return this.converter.convert(markdown);
  }

  async renderForExport(markdown, context = {}) {
    return {
      html: await this.renderForPreview(markdown, context),
      diagnostics: [],
    };
  }
}

class NativeRenderPipeline {
  constructor({ nativeRenderer, legacyPipeline, getFlags }) {
    this.nativeRenderer = nativeRenderer;
    this.legacyPipeline = legacyPipeline;
    this.getFlags = typeof getFlags === 'function' ? getFlags : () => ({});
  }

  async renderForPreview(markdown, context = {}) {
    const flags = this.getFlags() || {};

    // Phase 1 behavior freeze: if native renderer is not implemented,
    // fallback to legacy path by default.
    if (typeof this.nativeRenderer !== 'function') {
      if (flags.enableLegacyFallback !== false && this.legacyPipeline) {
        return this.legacyPipeline.renderForPreview(markdown, context);
      }
      throw new Error('Native render pipeline is not implemented yet');
    }

    try {
      return await this.nativeRenderer(markdown, context);
    } catch (error) {
      if (flags.enableLegacyFallback !== false && this.legacyPipeline) {
        console.warn('[RenderPipeline] Native render failed, fallback to legacy:', error?.message || error);
        return this.legacyPipeline.renderForPreview(markdown, context);
      }
      throw error;
    }
  }

  async renderForExport(markdown, context = {}) {
    return {
      html: await this.renderForPreview(markdown, context),
      diagnostics: [],
    };
  }
}

function createRenderPipelines({ converter, getFlags, nativeRenderer }) {
  const legacyPipeline = new LegacyRenderPipeline(converter);
  const nativePipeline = new NativeRenderPipeline({
    nativeRenderer,
    legacyPipeline,
    getFlags,
  });

  return { legacyPipeline, nativePipeline };
}

module.exports = {
  LegacyRenderPipeline,
  NativeRenderPipeline,
  createRenderPipelines,
};
