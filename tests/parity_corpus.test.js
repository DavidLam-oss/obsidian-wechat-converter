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

describe('Native Corpus Regression Gate', () => {
  let converter;
  let nativePipeline;

  beforeAll(async () => {
    converter = await createLegacyConverter();
    nativePipeline = createRenderPipelines({
      nativeRenderer: (markdown, context = {}) =>
        renderNativeMarkdown({
          converter,
          markdown,
          sourcePath: context.sourcePath || '',
        }),
    }).nativePipeline;
  });

  it('corpus samples should explicitly declare expectedCleanHtml', () => {
    for (const sample of corpus) {
      expect(typeof sample.expectedCleanHtml).toBe('string');
      expect(sample.expectedCleanHtml.length).toBeGreaterThan(0);
    }
  });

  for (const sample of corpus) {
    it(`should keep cleaned html stable for ${sample.id}`, async () => {
      const markdown = readFixture(sample.fixture);
      const context = { sourcePath: sample.sourcePath || '' };

      const rawHtml = await nativePipeline.renderForPreview(markdown, context);
      const cleaned = cleanHtmlForDraft(rawHtml);
      const expected = readFixture(sample.expectedCleanHtml);

      expect(cleaned).toBe(expected);
      expect(cleaned).not.toContain('<script');

      const container = document.createElement('div');
      container.innerHTML = cleaned;
      const unsafeLinks = Array.from(container.querySelectorAll('a[href]')).filter(
        (a) => /^javascript:/i.test(a.getAttribute('href') || '')
      );
      expect(unsafeLinks).toHaveLength(0);
    });
  }
});
