import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

// This benchmark intentionally measures end-to-end preview latency:
// fixture read + native preview pipeline + triplet DOM settle wait.
// It is a smoke baseline, not a renderer-only microbenchmark.
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = global;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.HTMLElement = dom.window.HTMLElement;
global.MutationObserver = dom.window.MutationObserver;

const { createLegacyConverter } = require('../tests/helpers/render-runtime');
const { createRenderPipelines } = require('../services/render-pipeline');
const { renderObsidianTripletMarkdown } = require('../services/obsidian-triplet-renderer');

function readFixture(name) {
  return fs.readFileSync(path.resolve(repoRoot, 'tests/fixtures', name), 'utf8');
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(ratio * sortedValues.length) - 1)
  );
  return sortedValues[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const mean = sorted.length ? sum / sorted.length : 0;
  return {
    count: sorted.length,
    min: sorted[0] || 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] || 0,
    mean,
  };
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

async function main() {
  const converter = await createLegacyConverter();
  const markdownRenderer = {
    async renderMarkdown(markdown, el) {
      el.innerHTML = converter.md.render(markdown);
    },
  };

  const { nativePipeline } = createRenderPipelines({
    candidateRenderer: (markdown, context = {}) =>
      renderObsidianTripletMarkdown({
        app: {},
        converter,
        markdown,
        sourcePath: context.sourcePath || '',
        markdownRenderer,
      }),
  });

  const corpusPath = path.resolve(repoRoot, 'tests/fixtures/parity/corpus.json');
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

  const measure = async (markdown, sourcePath) => {
    const start = performance.now();
    await nativePipeline.renderForPreview(markdown, { sourcePath });
    return performance.now() - start;
  };

  const warmupFixture = corpus[0]?.fixture || 'control-micro.md';
  const warmupMarkdown = readFixture(warmupFixture);
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await measure(warmupMarkdown, `warmup/${i}.md`);
  }

  const openSamples = [];
  for (const sample of corpus) {
    const markdown = readFixture(sample.fixture);
    // eslint-disable-next-line no-await-in-loop
    const elapsed = await measure(markdown, sample.sourcePath || sample.fixture);
    openSamples.push(elapsed);
  }

  const switchSamples = [];
  const switchFixtures = corpus.slice(0, 2).length >= 2
    ? corpus.slice(0, 2)
    : [
      { fixture: 'control-main.md', sourcePath: 'fixtures/control-main.md' },
      { fixture: 'control-micro.md', sourcePath: 'fixtures/control-micro.md' },
    ];
  for (let i = 0; i < 20; i += 1) {
    const sample = switchFixtures[i % switchFixtures.length];
    const markdown = readFixture(sample.fixture);
    // eslint-disable-next-line no-await-in-loop
    const elapsed = await measure(markdown, sample.sourcePath || sample.fixture);
    switchSamples.push(elapsed);
  }

  const editSamples = [];
  const editBase = readFixture(corpus[0]?.fixture || 'control-main.md');
  for (let i = 0; i < 20; i += 1) {
    const edited = `${editBase}\n\n<!-- synthetic-edit-${i} -->\n`;
    // eslint-disable-next-line no-await-in-loop
    const elapsed = await measure(edited, corpus[0]?.sourcePath || 'fixtures/control-main.md');
    editSamples.push(elapsed);
  }

  const summary = {
    open: summarize(openSamples),
    switch: summarize(switchSamples),
    edit: summarize(editSamples),
  };

  console.log(
    '[native-latency:e2e] Measures end-to-end preview latency ' +
    '(fixture IO + render pipeline + DOM settle wait).'
  );
  console.log('[native-latency:e2e] Not a renderer-only microbenchmark.');
  console.log('[native-latency:e2e] Scenario summary');
  for (const [name, stats] of Object.entries(summary)) {
    console.log(
      `${name.padEnd(6)} count=${String(stats.count).padStart(2)} ` +
      `min=${formatMs(stats.min)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)} ` +
      `max=${formatMs(stats.max)} mean=${formatMs(stats.mean)}`
    );
  }
}

main().catch((error) => {
  console.error('[native-latency:e2e] failed:', error);
  process.exitCode = 1;
});
