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

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseArgs(argv) {
  const options = {
    rounds: 1,
    warmup: 3,
    switchIterations: 20,
    editIterations: 20,
    jsonOut: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--rounds' && argv[i + 1]) {
      options.rounds = parsePositiveInt(argv[i + 1], options.rounds);
      i += 1;
      continue;
    }
    if (arg.startsWith('--rounds=')) {
      options.rounds = parsePositiveInt(arg.split('=')[1], options.rounds);
      continue;
    }
    if (arg === '--warmup' && argv[i + 1]) {
      options.warmup = parsePositiveInt(argv[i + 1], options.warmup);
      i += 1;
      continue;
    }
    if (arg.startsWith('--warmup=')) {
      options.warmup = parsePositiveInt(arg.split('=')[1], options.warmup);
      continue;
    }
    if (arg === '--switch-iterations' && argv[i + 1]) {
      options.switchIterations = parsePositiveInt(argv[i + 1], options.switchIterations);
      i += 1;
      continue;
    }
    if (arg.startsWith('--switch-iterations=')) {
      options.switchIterations = parsePositiveInt(arg.split('=')[1], options.switchIterations);
      continue;
    }
    if (arg === '--edit-iterations' && argv[i + 1]) {
      options.editIterations = parsePositiveInt(argv[i + 1], options.editIterations);
      i += 1;
      continue;
    }
    if (arg.startsWith('--edit-iterations=')) {
      options.editIterations = parsePositiveInt(arg.split('=')[1], options.editIterations);
      continue;
    }
    if (arg === '--json-out' && argv[i + 1]) {
      options.jsonOut = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--json-out=')) {
      options.jsonOut = arg.split('=')[1];
    }
  }

  return options;
}

function summarizeRange(values) {
  if (!values.length) {
    return { min: 0, max: 0, delta: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, delta: max - min };
}

function printSummary(summary) {
  for (const [name, stats] of Object.entries(summary)) {
    console.log(
      `${name.padEnd(6)} count=${String(stats.count).padStart(2)} ` +
      `min=${formatMs(stats.min)} p50=${formatMs(stats.p50)} p95=${formatMs(stats.p95)} ` +
      `max=${formatMs(stats.max)} mean=${formatMs(stats.mean)}`
    );
  }
}

function summarizeStability(rounds) {
  const scenarios = ['open', 'switch', 'edit'];
  const result = {};
  for (const scenario of scenarios) {
    const p50Values = rounds.map((round) => round.summary[scenario].p50);
    const p95Values = rounds.map((round) => round.summary[scenario].p95);
    result[scenario] = {
      p50: summarizeRange(p50Values),
      p95: summarizeRange(p95Values),
    };
  }
  return result;
}

async function runRound({ corpus, measure, options }) {
  const warmupFixture = corpus[0]?.fixture || 'control-micro.md';
  const warmupMarkdown = readFixture(warmupFixture);
  for (let i = 0; i < options.warmup; i += 1) {
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
  for (let i = 0; i < options.switchIterations; i += 1) {
    const sample = switchFixtures[i % switchFixtures.length];
    const markdown = readFixture(sample.fixture);
    // eslint-disable-next-line no-await-in-loop
    const elapsed = await measure(markdown, sample.sourcePath || sample.fixture);
    switchSamples.push(elapsed);
  }

  const editSamples = [];
  const editBase = readFixture(corpus[0]?.fixture || 'control-main.md');
  for (let i = 0; i < options.editIterations; i += 1) {
    const edited = `${editBase}\n\n<!-- synthetic-edit-${i} -->\n`;
    // eslint-disable-next-line no-await-in-loop
    const elapsed = await measure(edited, corpus[0]?.sourcePath || 'fixtures/control-main.md');
    editSamples.push(elapsed);
  }

  return {
    samples: {
      open: openSamples,
      switch: switchSamples,
      edit: editSamples,
    },
    summary: {
      open: summarize(openSamples),
      switch: summarize(switchSamples),
      edit: summarize(editSamples),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
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

  const rounds = [];
  for (let i = 0; i < options.rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const round = await runRound({ corpus, measure, options });
    rounds.push(round);
  }

  const mergedSummary = {
    open: summarize(rounds.flatMap((round) => round.samples.open)),
    switch: summarize(rounds.flatMap((round) => round.samples.switch)),
    edit: summarize(rounds.flatMap((round) => round.samples.edit)),
  };
  const stability = summarizeStability(rounds);

  console.log(
    '[native-latency:e2e] Measures end-to-end preview latency ' +
    '(fixture IO + render pipeline + DOM settle wait).'
  );
  console.log('[native-latency:e2e] Not a renderer-only microbenchmark.');
  console.log(
    `[native-latency:e2e] corpus=${corpus.length} rounds=${options.rounds} ` +
    `warmup=${options.warmup} switch=${options.switchIterations} edit=${options.editIterations}`
  );
  for (let i = 0; i < rounds.length; i += 1) {
    console.log(`[native-latency:e2e] Round ${i + 1}/${rounds.length} summary`);
    printSummary(rounds[i].summary);
  }
  console.log('[native-latency:e2e] Aggregate summary');
  printSummary(mergedSummary);

  if (rounds.length > 1) {
    console.log('[native-latency:e2e] Stability (range across rounds)');
    for (const [name, metrics] of Object.entries(stability)) {
      console.log(
        `${name.padEnd(6)} ` +
        `p50[min=${formatMs(metrics.p50.min)} max=${formatMs(metrics.p50.max)} delta=${formatMs(metrics.p50.delta)}] ` +
        `p95[min=${formatMs(metrics.p95.min)} max=${formatMs(metrics.p95.max)} delta=${formatMs(metrics.p95.delta)}]`
      );
    }
  }

  if (options.jsonOut) {
    const outputPath = path.resolve(repoRoot, options.jsonOut);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        mode: 'native-latency-e2e',
        generatedAt: new Date().toISOString(),
        corpusSize: corpus.length,
        options,
        rounds: rounds.map((round, index) => ({
          round: index + 1,
          summary: round.summary,
        })),
        aggregate: mergedSummary,
        stability,
      }, null, 2)
    );
    console.log(`[native-latency:e2e] wrote json report to ${outputPath}`);
  }
}

main().catch((error) => {
  console.error('[native-latency:e2e] failed:', error);
  process.exitCode = 1;
});
