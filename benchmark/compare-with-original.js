import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import forkHbs from '../index.js';

const require = createRequire(import.meta.url);

let originalHbs;
try {
  originalHbs = require('tryghost-express-hbs');
} catch (error) {
  console.error('Missing benchmark dependency "tryghost-express-hbs". Run: npm install --prefix benchmark');
  throw error;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const viewsDir = path.join(fixturesDir, 'views');
const partialsDir = path.join(fixturesDir, 'partials');
const layoutsDir = path.join(fixturesDir, 'layouts');
const baselineTemplateFile = path.join(viewsDir, 'index.hbs');
const asyncTemplateFile = path.join(viewsDir, 'async-heavy.hbs');
const scenario = process.env.BENCH_SCENARIO ?? 'baseline';
const scenarioDefaults = {
  baseline: {
    templateFile: baselineTemplateFile,
    verifyText: 'BENCHMARK FOOTER',
    defaultItems: 30
  },
  async: {
    templateFile: asyncTemplateFile,
    verifyText: 'ASYNC BENCHMARK',
    defaultItems: 40
  }
};
const selectedScenarioName = scenarioDefaults[scenario] ? scenario : 'baseline';
const selectedScenario = scenarioDefaults[selectedScenarioName];

const profile = process.env.BENCH_PROFILE ?? 'default';
const profileDefaults = {
  default: { iterations: 1000, warmup: 120, rounds: 9 },
  quick: { iterations: 250, warmup: 40, rounds: 3 },
  stable: { iterations: 1500, warmup: 180, rounds: 9 }
};
const selectedProfile = profileDefaults[profile] ?? profileDefaults.default;

const iterations = Number.parseInt(process.env.BENCH_ITERATIONS ?? String(selectedProfile.iterations), 10);
const warmupIterations = Number.parseInt(process.env.BENCH_WARMUP ?? String(selectedProfile.warmup), 10);
const itemCount = Number.parseInt(process.env.BENCH_ITEMS ?? String(selectedScenario.defaultItems), 10);
const rounds = Number.parseInt(process.env.BENCH_ROUNDS ?? String(selectedProfile.rounds), 10);
const showRawSamples = process.env.BENCH_SHOW_RAW === '1';
const jsonOutputPath = process.env.BENCH_JSON_PATH ?? '';

if (!Number.isInteger(iterations) || iterations <= 0) {
  throw new Error(`BENCH_ITERATIONS must be a positive integer, got: ${process.env.BENCH_ITERATIONS}`);
}

if (!Number.isInteger(warmupIterations) || warmupIterations < 0) {
  throw new Error(`BENCH_WARMUP must be an integer >= 0, got: ${process.env.BENCH_WARMUP}`);
}

if (!Number.isInteger(itemCount) || itemCount <= 0) {
  throw new Error(`BENCH_ITEMS must be a positive integer, got: ${process.env.BENCH_ITEMS}`);
}

if (!Number.isInteger(rounds) || rounds <= 0) {
  throw new Error(`BENCH_ROUNDS must be a positive integer, got: ${process.env.BENCH_ROUNDS}`);
}

const items = Array.from({ length: itemCount }, (_, index) => ({
  name: `Item ${index}`,
  kind: index % 2 === 0 ? 'fruit' : 'veg'
}));

function getExpressFactory(engine) {
  if (typeof engine.express === 'function') {
    return engine.express.bind(engine);
  }

  if (typeof engine.express4 === 'function') {
    return engine.express4.bind(engine);
  }

  throw new Error('Engine instance does not expose express()/express4()');
}

function createRenderer(engineModule, scenarioName) {
  const engine = engineModule.create();

  engine.registerAsyncHelper('delayUpper', (value, cb) => {
    queueMicrotask(() => cb(String(value).toUpperCase()));
  });

  if (scenarioName === 'async') {
    engine.registerAsyncHelper('delayWrap', (value, cb) => {
      queueMicrotask(() => cb(`[${String(value)}]`));
    });

    engine.registerAsyncHelper('delayPair', (value, cb) => {
      queueMicrotask(() => cb(`${String(value)}|${String(value)}`));
    });
  }

  const express = getExpressFactory(engine);

  return express({
    extname: '.hbs',
    partialsDir: partialsDir,
    layoutsDir: layoutsDir,
    defaultLayout: path.join(layoutsDir, 'default'),
    viewsDir: viewsDir
  });
}

function createRenderOptions(cacheEnabled) {
  return {
    cache: cacheEnabled,
    settings: {
      views: viewsDir
    },
    title: 'Benchmark Title',
    items: items
  };
}

function renderOnce(renderer, cacheEnabled, templateFile) {
  return new Promise((resolve, reject) => {
    renderer(templateFile, createRenderOptions(cacheEnabled), (error, html) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(html);
    });
  });
}

async function runScenario(name, engineModule, cacheEnabled, scenarioConfig) {
  const renderer = createRenderer(engineModule, selectedScenarioName);

  for (let i = 0; i < warmupIterations; i += 1) {
    await renderOnce(renderer, cacheEnabled, scenarioConfig.templateFile);
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await renderOnce(renderer, cacheEnabled, scenarioConfig.templateFile);
  }
  const totalMs = performance.now() - start;

  const firstRender = await renderOnce(renderer, cacheEnabled, scenarioConfig.templateFile);
  if (!firstRender.includes(scenarioConfig.verifyText)) {
    throw new Error(`Unexpected output while benchmarking ${name}`);
  }

  return {
    engine: name,
    mode: cacheEnabled ? 'cache=true' : 'cache=false',
    iterations: iterations,
    totalMs: Number(totalMs.toFixed(2)),
    avgMs: Number((totalMs / iterations).toFixed(3)),
    opsPerSec: Number(((iterations / totalMs) * 1000).toFixed(2))
  };
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

function aggregateResults(samples) {
  const grouped = new Map();

  for (const sample of samples) {
    const key = `${sample.engine}|${sample.mode}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(sample);
  }

  const aggregates = [];
  for (const [key, group] of grouped.entries()) {
    const [engine, mode] = key.split('|');
    const avgMsValues = group.map((sample) => sample.avgMs);
    const opsValues = group.map((sample) => sample.opsPerSec);
    aggregates.push({
      engine,
      mode,
      rounds: group.length,
      avgMsMean: Number(mean(avgMsValues).toFixed(3)),
      avgMsMedian: Number(median(avgMsValues).toFixed(3)),
      avgMsStdDev: Number(stddev(avgMsValues).toFixed(3)),
      opsMean: Number(mean(opsValues).toFixed(2)),
      opsMedian: Number(median(opsValues).toFixed(2))
    });
  }

  return aggregates;
}

function printSummary(aggregates) {
  const summaryRows = [];
  for (const mode of ['cache=false', 'cache=true']) {
    const fork = aggregates.find((item) => item.engine === 'fork' && item.mode === mode);
    const original = aggregates.find((item) => item.engine === 'original' && item.mode === mode);

    if (fork && original) {
      const deltaPct = ((original.avgMsMedian - fork.avgMsMedian) / original.avgMsMedian) * 100;
      summaryRows.push({
        mode,
        comparison: 'fork vs original',
        fasterPctMedian: Number(deltaPct.toFixed(2)),
        interpretation: deltaPct >= 0 ? 'fork faster' : 'original faster'
      });
    }
  }

  if (summaryRows.length > 0) {
    console.log('\nComparison (positive means the left side is faster):');
    console.table(summaryRows);
  }
}

function getRuntimeInfo() {
  if (typeof Bun !== 'undefined') {
    return {
      name: 'bun',
      version: Bun.version,
      executable: process.execPath
    };
  }

  if (typeof Deno !== 'undefined') {
    return {
      name: 'deno',
      version: Deno.version?.deno ?? 'unknown',
      executable: process.execPath
    };
  }

  return {
    name: process.release?.name ?? 'node',
    version: process.versions?.node ?? process.version,
    executable: process.execPath
  };
}

async function main() {
  const samples = [];
  const runtime = getRuntimeInfo();

  console.log(`Runtime ${runtime.name} ${runtime.version} (${runtime.executable})`);
  console.log(`Scenario=${selectedScenarioName}`);
  console.log(`Profile=${profile}`);
  console.log(`Iterations=${iterations}, Warmup=${warmupIterations}, Items=${itemCount}, Rounds=${rounds}`);

  const engineVariants = [
    ['fork', forkHbs],
    ['original', originalHbs]
  ];

  for (let round = 0; round < rounds; round += 1) {
    for (const cacheEnabled of [false, true]) {
      const shift = (round + (cacheEnabled ? 1 : 0)) % engineVariants.length;
      const scenarioOrder = engineVariants.map((_, index) => engineVariants[(index + shift) % engineVariants.length]);

      for (const [name, engine] of scenarioOrder) {
        const sample = await runScenario(name, engine, cacheEnabled, selectedScenario);
        sample.round = round + 1;
        samples.push(sample);
      }
    }
  }

  if (showRawSamples) {
    console.log('\nRaw benchmark samples:');
    console.table(samples);
  }

  const aggregates = aggregateResults(samples);
  console.log('\nAggregated benchmark results:');
  console.table(aggregates);
  printSummary(aggregates);

  if (jsonOutputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      runtime,
      settings: {
        scenario: selectedScenarioName,
        profile,
        iterations,
        warmupIterations,
        itemCount,
        rounds,
        showRawSamples
      },
      aggregates,
      samples: showRawSamples ? samples : undefined
    };

    await fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nWrote JSON report to ${jsonOutputPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
