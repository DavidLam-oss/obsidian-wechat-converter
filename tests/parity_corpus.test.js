import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
const { createRenderPipelines } = require('../services/render-pipeline');
const { renderNativeMarkdown } = require('../services/native-renderer');
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');
const { createLegacyConverter } = require('./helpers/render-runtime');

const fixtureRoot = path.resolve(__dirname, 'fixtures');
const corpusPath = path.resolve(__dirname, 'fixtures/parity/corpus.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

function readFixture(name) {
  return fs.readFileSync(path.resolve(fixtureRoot, name), 'utf8');
}

describe('Parity Corpus (Phase 2 Strict No-Diff Gate)', () => {
  let converter;

  beforeAll(async () => {
    converter = await createLegacyConverter();
  });

  it('corpus samples should explicitly declare expectParityMismatch', () => {
    for (const sample of corpus) {
      expect(sample).toHaveProperty('expectParityMismatch');
      expect(typeof sample.expectParityMismatch).toBe('boolean');
    }
  });

  for (const sample of corpus) {
    it(`should keep final html byte-equal for ${sample.id}`, async () => {
      let parityMismatchCount = 0;
      const flags = {
        useNativePipeline: true,
        enableLegacyFallback: true,
        enforceNativeParity: true,
        parityTransform: (html) => cleanHtmlForDraft(html),
        onParityMismatch: () => {
          parityMismatchCount += 1;
        },
      };

      const { legacyPipeline, nativePipeline } = createRenderPipelines({
        converter,
        getFlags: () => flags,
        nativeRenderer: (markdown, context = {}) =>
          renderNativeMarkdown({
            converter,
            markdown,
            sourcePath: context.sourcePath || '',
            strictLegacyParity: flags.enforceNativeParity === true,
          }),
      });

      const markdown = readFixture(sample.fixture);
      const context = { sourcePath: sample.sourcePath || '' };

      const legacyRawHtml = await legacyPipeline.renderForPreview(markdown, context);
      const nativeGuardedRawHtml = await nativePipeline.renderForPreview(markdown, context);

      const legacyFinalHtml = cleanHtmlForDraft(legacyRawHtml);
      const nativeGuardedFinalHtml = cleanHtmlForDraft(nativeGuardedRawHtml);

      expect(nativeGuardedFinalHtml).toBe(legacyFinalHtml);
      if (sample.expectParityMismatch === true) {
        expect(parityMismatchCount).toBeGreaterThan(0);
      } else {
        expect(parityMismatchCount).toBe(0);
      }
    });
  }
});
