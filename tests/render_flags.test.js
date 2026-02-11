import { describe, it, expect } from 'vitest';

const AppleStylePlugin = require('../input.js');
const { AppleStyleView } = require('../input.js');

describe('Render Pipeline Flags', () => {
  it('should map explicit parity settings from plugin', () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {
      useTripletPipeline: true,
      tripletFallbackToPhase2: false,
      enforceTripletParity: false,
    };

    const view = new AppleStyleView({}, plugin);
    const flags = view.getRenderPipelineFlags();

    expect(flags.useTripletPipeline).toBe(true);
    expect(flags.tripletFallbackToPhase2).toBe(false);
    expect(flags.enforceTripletParity).toBe(false);
    // Backward compatibility aliases
    expect(flags.useNativePipeline).toBe(true);
    expect(flags.enableLegacyFallback).toBe(false);
    expect(flags.enforceNativeParity).toBe(false);
    expect(flags.parityErrorCode).toBe('TRIPLET_PARITY_MISMATCH');
    expect(typeof flags.parityTransform).toBe('function');
  });

  it('should default parity flags when settings are missing', () => {
    const plugin = new AppleStylePlugin();
    plugin.settings = {};

    const view = new AppleStyleView({}, plugin);
    const flags = view.getRenderPipelineFlags();

    expect(flags.useTripletPipeline).toBe(false);
    expect(flags.tripletFallbackToPhase2).toBe(true);
    expect(flags.enforceTripletParity).toBe(true);
  });
});
