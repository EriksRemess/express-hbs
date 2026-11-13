# Benchmarks

Run `npm run bench`, `npm run bench:async`, `npm run bench:large`, or
`npm run bench:compiler` from the repository root. These compare the working
tree with upstream `express-hbs` (install its dependency with
`npm install --prefix benchmark`).

To measure a local change against an earlier version of this fork, save a
baseline before editing:

```sh
baseline_dir=$(mktemp -d /tmp/express-hbs-baseline.XXXXXX)
git archive HEAD lib package.json | tar -x -C "$baseline_dir"
```

Then run the same workloads against that snapshot:

```sh
BENCH_REFERENCE_MODULE="$baseline_dir/lib/hbs.js" BENCH_ROUNDS=7 npm run bench:large
```

`BENCH_REFERENCE_MODULE` accepts an absolute path to an ESM engine module with
a default export. This mode needs no upstream dependency. It checks exact
output equality for both cold and warmed renders before timing, alternates
engine order across rounds, and reports medians. A positive percentage in the
comparison means a reduction in render time relative to the reference.

Use `BENCH_ITERATIONS`, `BENCH_WARMUP`, and `BENCH_ROUNDS` to control sampling.
Set `BENCH_SHOW_RAW=1` to include individual rounds and `BENCH_JSON_PATH` to
save a report. Run benchmarks without other tests or benchmarks competing for
CPU time; compare multiple workloads and both cache modes.
