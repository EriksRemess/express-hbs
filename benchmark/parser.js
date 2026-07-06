import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  parse as forkParse,
  parseWithoutProcessing as forkParseWithoutProcessing
} from '../lib/handlebars/compiler/parser.js'

const require = createRequire(import.meta.url)

let originalParser
try {
  originalParser = require('handlebars/dist/cjs/handlebars/compiler/base.js')
} catch (error) {
  console.error('Missing benchmark dependency "handlebars". Run: npm install --prefix benchmark')
  throw error
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baselineTemplateFile = path.join(__dirname, 'fixtures', 'views', 'index.hbs')

const profile = process.env.PARSER_PROFILE ?? 'quick'
const profileDefaults = {
  smoke: { rounds: 1, iterationScale: 0.2, warmupRatio: 0.05 },
  quick: { rounds: 3, iterationScale: 1, warmupRatio: 0.1 },
  stable: { rounds: 7, iterationScale: 4, warmupRatio: 0.15 }
}
const selectedProfile = profileDefaults[profile] ?? profileDefaults.quick

const rounds = readPositiveInteger('PARSER_ROUNDS', selectedProfile.rounds)
const largeSectionCount = readPositiveIntegerWithFallback('PARSER_LARGE_SECTIONS', 'BENCH_LARGE_SECTIONS', 12)
const compilerBlockCount = readPositiveIntegerWithFallback('PARSER_COMPILER_BLOCKS', 'BENCH_COMPILER_BLOCKS', 180)
const showRawSamples = process.env.PARSER_SHOW_RAW === '1'
const jsonOutputPath = process.env.PARSER_JSON_PATH ?? ''
const sourceFilter = process.env.PARSER_SOURCE ?? 'all'
const stageFilter = process.env.PARSER_STAGE ?? 'all'

let sink = 0

function readPositiveInteger(name, fallback) {
  const rawValue = process.env[name]
  const value = rawValue == null ? fallback : Number.parseInt(rawValue, 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${rawValue}`)
  }
  return value
}

function readPositiveIntegerWithFallback(name, fallbackName, fallback) {
  if (process.env[name] != null) {
    return readPositiveInteger(name, fallback)
  }

  return readPositiveInteger(fallbackName, fallback)
}

function readNonNegativeInteger(name, fallback) {
  const rawValue = process.env[name]
  const value = rawValue == null ? fallback : Number.parseInt(rawValue, 10)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be an integer >= 0, got: ${rawValue}`)
  }
  return value
}

function buildLargeTemplate() {
  const lines = [
    '{{!< default}}',
    '<article class="large-benchmark">',
    '<h1>LARGE BENCHMARK</h1>'
  ]

  for (let section = 0; section < largeSectionCount; section += 1) {
    lines.push(
      `<section class="benchmark-section" data-section="${section}">`,
      `<h2>{{title}} section ${section}</h2>`,
      '<ul>',
      '{{#each items}}',
      '  {{> large-card}}',
      '  {{#if featured}}',
      `    <p class="featured">featured:${section}:{{name}}:{{kind}}</p>`,
      '  {{else}}',
      `    <p class="standard">standard:${section}:{{name}}:{{kind}}</p>`,
      '  {{/if}}',
      '  {{#with meta}}',
      `    <span class="meta">meta:${section}:{{label}}:{{index}}</span>`,
      '    {{#if active}}<span class="active">active</span>{{else}}<span class="inactive">inactive</span>{{/if}}',
      '  {{/with}}',
      '  {{#each tags}}<em>{{this}}</em>{{/each}}',
      '{{/each}}',
      '</ul>',
      '</section>'
    )
  }

  lines.push(
    '{{#contentFor "scripts"}}',
    '<script>window.__LARGE_BENCHMARK = true;</script>',
    '{{/contentFor}}',
    '<p>LARGE BENCHMARK COMPLETE</p>',
    '</article>',
    ''
  )

  return lines.join('\n')
}

function buildCompilerTemplate() {
  const lines = [
    '{{!< default}}',
    '<article class="compiler-benchmark">',
    '<h1>COMPILER STRESS BENCHMARK</h1>',
    '<section class="items">',
    '{{#each items}}',
    '  {{#if featured}}',
    '    <b>{{formatCell name kind label="item-featured"}}</b>',
    '  {{else}}',
    '    <i>{{formatCell name kind label="item-standard"}}</i>',
    '  {{/if}}',
    '{{/each}}',
    '</section>'
  ]

  for (let index = 0; index < compilerBlockCount; index += 1) {
    lines.push(
      `<div class="compiler-slot" data-slot="${index}">`,
      `{{#if flag${index}}}`,
      `  <span>{{formatCell value${index} alt${index} label="flag-${index}" order=${index}}}</span>`,
      `  {{#with group${index}}}<small>{{name}}/{{kind}}/{{meta.label}}</small>{{/with}}`,
      '{{else}}',
      `  <span>{{formatCell fallback${index} alt${index} label="fallback-${index}" order=${index}}}</span>`,
      '{{/if}}',
      '</div>'
    )
  }

  lines.push(
    '{{#contentFor "scripts"}}',
    '<script>window.__COMPILER_STRESS_BENCHMARK = true;</script>',
    '{{/contentFor}}',
    '<p>COMPILER STRESS BENCHMARK COMPLETE</p>',
    '</article>',
    ''
  )

  return lines.join('\n')
}

function getSelectedNames(filter, allNames, label) {
  if (filter === 'all') {
    return allNames
  }

  const names = filter.split(',').map((name) => name.trim()).filter(Boolean)
  for (const name of names) {
    if (!allNames.includes(name)) {
      throw new Error(`Unknown ${label} "${name}". Expected one of: all, ${allNames.join(', ')}`)
    }
  }
  return names
}

function getIterationCount(source) {
  if (process.env.PARSER_ITERATIONS != null) {
    return readPositiveInteger('PARSER_ITERATIONS', source.defaultIterations)
  }

  return Math.max(1, Math.round(source.defaultIterations * selectedProfile.iterationScale))
}

function getWarmupIterations(iterations) {
  if (process.env.PARSER_WARMUP != null) {
    return readNonNegativeInteger('PARSER_WARMUP', Math.round(iterations * selectedProfile.warmupRatio))
  }

  return Math.round(iterations * selectedProfile.warmupRatio)
}

function assertProgram(result, engine, stage, source) {
  if (result?.type !== 'Program' || !Array.isArray(result.body)) {
    throw new Error(`Unexpected parser result for ${engine} ${stage} ${source}`)
  }
}

function runParser(parser, stage, source) {
  if (stage === 'raw') {
    return parser.parseWithoutProcessing(source)
  }

  return parser.parse(source)
}

function createParser(engine) {
  if (engine === 'fork') {
    return {
      parse: forkParse,
      parseWithoutProcessing: forkParseWithoutProcessing
    }
  }

  return originalParser
}

function runScenario(engine, stage, sourceConfig, iterations, warmupIterations) {
  const parser = createParser(engine)
  const firstResult = runParser(parser, stage, sourceConfig.source)
  assertProgram(firstResult, engine, stage, sourceConfig.name)
  sink ^= firstResult.body.length

  for (let i = 0; i < warmupIterations; i += 1) {
    const result = runParser(parser, stage, sourceConfig.source)
    sink ^= result.body.length
  }

  const start = performance.now()
  for (let i = 0; i < iterations; i += 1) {
    const result = runParser(parser, stage, sourceConfig.source)
    sink ^= result.body.length
  }
  const totalMs = performance.now() - start

  return {
    source: sourceConfig.name,
    chars: sourceConfig.source.length,
    engine,
    stage,
    iterations,
    totalMs: Number(totalMs.toFixed(2)),
    avgMs: Number((totalMs / iterations).toFixed(4)),
    opsPerSec: Number(((iterations / totalMs) * 1000).toFixed(2))
  }
}

function median(values) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function mean(values) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stddev(values) {
  if (values.length < 2) {
    return 0
  }
  const average = mean(values)
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance)
}

function getOrCreate(map, key) {
  let value = map.get(key)
  if (value == null) {
    value = []
    map.set(key, value)
  }
  return value
}

function aggregateResults(samples) {
  const grouped = new Map()

  for (const sample of samples) {
    const key = `${sample.source}|${sample.stage}|${sample.engine}`
    getOrCreate(grouped, key).push(sample)
  }

  const aggregates = []
  for (const [key, group] of grouped.entries()) {
    const [source, stage, engine] = key.split('|')
    const avgMsValues = group.map((sample) => sample.avgMs)
    const opsValues = group.map((sample) => sample.opsPerSec)
    aggregates.push({
      source,
      stage,
      engine,
      chars: group[0].chars,
      iterations: group[0].iterations,
      rounds: group.length,
      avgMsMean: Number(mean(avgMsValues).toFixed(4)),
      avgMsMedian: Number(median(avgMsValues).toFixed(4)),
      avgMsStdDev: Number(stddev(avgMsValues).toFixed(4)),
      opsMean: Number(mean(opsValues).toFixed(2)),
      opsMedian: Number(median(opsValues).toFixed(2))
    })
  }

  return aggregates
}

function printSummary(aggregates, sourceNames, stageNames) {
  const summaryRows = []

  for (const source of sourceNames) {
    for (const stage of stageNames) {
      const fork = aggregates.find((item) => item.source === source && item.stage === stage && item.engine === 'fork')
      const original = aggregates.find((item) => item.source === source && item.stage === stage && item.engine === 'original')

      if (fork && original) {
        const deltaPct = ((original.avgMsMedian - fork.avgMsMedian) / original.avgMsMedian) * 100
        summaryRows.push({
          source,
          stage,
          comparison: 'fork vs original',
          fasterPctMedian: Number(deltaPct.toFixed(2)),
          interpretation: deltaPct >= 0 ? 'fork faster' : 'original faster'
        })
      }
    }
  }

  if (summaryRows.length > 0) {
    console.log('\nComparison (positive means the left side is faster):')
    console.table(summaryRows)
  }
}

function getRuntimeInfo() {
  return {
    name: process.release?.name ?? 'node',
    version: process.versions?.node ?? process.version,
    executable: process.execPath
  }
}

async function main() {
  const baselineSource = await fs.readFile(baselineTemplateFile, 'utf8')
  const sourceDefinitions = {
    baseline: {
      name: 'baseline',
      source: baselineSource,
      defaultIterations: 2000
    },
    large: {
      name: 'large',
      source: buildLargeTemplate(),
      defaultIterations: 80
    },
    compiler: {
      name: 'compiler',
      source: buildCompilerTemplate(),
      defaultIterations: 80
    }
  }
  const stageDefinitions = ['raw', 'processed']
  const sourceNames = getSelectedNames(sourceFilter, Object.keys(sourceDefinitions), 'source')
  const stageNames = getSelectedNames(stageFilter, stageDefinitions, 'stage')
  const sources = sourceNames.map((name) => sourceDefinitions[name])
  const samples = []
  const runtime = getRuntimeInfo()
  const engineVariants = ['fork', 'original']

  console.log(`Runtime ${runtime.name} ${runtime.version} (${runtime.executable})`)
  console.log(`Profile=${profile}`)
  console.log(`Sources=${sourceNames.join(', ')}`)
  console.log(`Stages=${stageNames.join(', ')}`)
  console.log(`Rounds=${rounds}, LargeSections=${largeSectionCount}, CompilerBlocks=${compilerBlockCount}`)

  for (let round = 0; round < rounds; round += 1) {
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const source = sources[sourceIndex]
      const iterations = getIterationCount(source)
      const warmupIterations = getWarmupIterations(iterations)

      for (let stageIndex = 0; stageIndex < stageNames.length; stageIndex += 1) {
        const stage = stageNames[stageIndex]
        const shift = (round + sourceIndex + stageIndex) % engineVariants.length
        const engineOrder = engineVariants.map((_, index) => engineVariants[(index + shift) % engineVariants.length])

        for (const engine of engineOrder) {
          const sample = runScenario(engine, stage, source, iterations, warmupIterations)
          sample.round = round + 1
          samples.push(sample)
        }
      }
    }
  }

  if (showRawSamples) {
    console.log('\nRaw benchmark samples:')
    console.table(samples)
  }

  const aggregates = aggregateResults(samples)
  console.log('\nAggregated parser benchmark results:')
  console.table(aggregates)
  printSummary(aggregates, sourceNames, stageNames)

  if (jsonOutputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      runtime,
      settings: {
        profile,
        sourceNames,
        stageNames,
        rounds,
        largeSectionCount,
        compilerBlockCount
      },
      aggregates,
      samples: showRawSamples ? samples : undefined
    }

    await fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nWrote JSON report to ${jsonOutputPath}`)
  }

  if (sink === 0) {
    console.log('')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
