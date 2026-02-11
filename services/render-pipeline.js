const { isStrictHtmlParity, buildParityMismatchDetails } = require('./parity-gate');

function pickFlag(flags, primaryKey, legacyKey, defaultValue) {
  if (Object.prototype.hasOwnProperty.call(flags || {}, primaryKey)) {
    return flags[primaryKey];
  }
  if (Object.prototype.hasOwnProperty.call(flags || {}, legacyKey)) {
    return flags[legacyKey];
  }
  return defaultValue;
}

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
  constructor({ nativeRenderer, candidateRenderer, legacyPipeline, getFlags }) {
    this.nativeRenderer = candidateRenderer || nativeRenderer;
    this.legacyPipeline = legacyPipeline;
    this.getFlags = typeof getFlags === 'function' ? getFlags : () => ({});
  }

  async renderForPreview(markdown, context = {}) {
    const flags = this.getFlags() || {};
    const strictParity = pickFlag(flags, 'enforceTripletParity', 'enforceNativeParity', false) === true;
    const enableFallback = pickFlag(flags, 'tripletFallbackToPhase2', 'enableLegacyFallback', true) !== false;
    const mismatchCode = flags.parityErrorCode || 'PARITY_MISMATCH';
    const parityTransform = typeof flags.parityTransform === 'function' ? flags.parityTransform : null;

    // Candidate renderer is the new path (Triplet). Legacy pipeline is current Phase 2 baseline.
    if (typeof this.nativeRenderer !== 'function') {
      if (enableFallback && this.legacyPipeline) {
        return this.legacyPipeline.renderForPreview(markdown, context);
      }
      throw new Error('Triplet render pipeline is not implemented yet');
    }

    try {
      const nativeHtml = await this.nativeRenderer(markdown, context);

      if (!strictParity || !this.legacyPipeline) {
        return nativeHtml;
      }

      const legacyHtml = await this.legacyPipeline.renderForPreview(markdown, context);
      const parityLegacyHtml = parityTransform
        ? parityTransform(legacyHtml, { markdown, context, pipeline: 'legacy' })
        : legacyHtml;
      const parityNativeHtml = parityTransform
        ? parityTransform(nativeHtml, { markdown, context, pipeline: 'native' })
        : nativeHtml;

      if (isStrictHtmlParity(parityLegacyHtml, parityNativeHtml)) {
        return nativeHtml;
      }

      const mismatch = buildParityMismatchDetails(parityLegacyHtml, parityNativeHtml);
      const parityError = new Error(
        `[RenderPipeline] Parity mismatch at index ${mismatch.index} (segments ${mismatch.segmentCount}, delta ${mismatch.lengthDelta})`
      );
      parityError.code = mismatchCode;
      parityError.parity = mismatch;

      if (typeof flags.onParityMismatch === 'function') {
        flags.onParityMismatch({
          markdown,
          context,
          mismatch,
        });
      }

      if (enableFallback && this.legacyPipeline) {
        console.warn('[RenderPipeline] Triplet parity mismatch, fallback to Phase2 baseline:', mismatch.index);
        return legacyHtml;
      }

      throw parityError;
    } catch (error) {
      if (enableFallback && this.legacyPipeline) {
        console.warn('[RenderPipeline] Triplet render failed, fallback to Phase2 baseline:', error?.message || error);
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

function createRenderPipelines({ converter, getFlags, nativeRenderer, candidateRenderer }) {
  const legacyPipeline = new LegacyRenderPipeline(converter);
  const nativePipeline = new NativeRenderPipeline({
    nativeRenderer,
    candidateRenderer,
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
