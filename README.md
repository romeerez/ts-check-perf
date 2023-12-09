# ts-check-perf

A tool for measuring and comparing type-checking speed of TS samples.

```shell
npm i -D ts-check-perf
```

It runs TS type-checked many times over the same samples to measure type-checking performance.

Optionally, define a preparation code that is loaded by TS only once.

Samples can import files of your project, project files are also loaded by TS only once,
so only the performance of samples is measured.

## Defining samples

For example, we want to know which is faster: extending `type` with new properties, or `interface`.

Define a common code that is **not** wanted to be measured as a `preparation`:

```ts
const preparation = `
  type Type = {
    one: 1
    two: 2
    three: 3
  }
  
  interface Interface = {
    one: 1
    two: 2
    three: 3
  }
`;
```

Next, we can define our samples, one will extend the type, and the second will extend the interface.

Types in samples must be exported, otherwise TS compiler will throw an error about name collision.

Sample code can be defined as object where keys are sample names and values are TS code:

```ts
const samples = {
  type: `
    export type Obj = {
      one: 1
      two: 2
      three: 3
    }
  `,
  interface: `
    export interface Obj {
      one: 1
      two: 2
      three: 3
    }
  `,
};
```

Or, samples can be defined as array, samples names will be `1st`, `2nd`, `3rd`:

```ts
const samples = [
  `
    export type Extended = Type & {
      four: 4
      five: 5
      six: 6
    }
  `,
  `
    export interface Extended extends Interface {
      four: 4
      five: 5
      six: 6
    }
  `,
];
```

## Measure time

`measureTime` type checks first sample, second, first, second, and does so 1000 times for each sample.

```ts
import { measureTime } from "ts-check-perf";

measureTime({
  preparation,
  samples,
})
```

Outputs:

```
1st.ts (slowest): 35ms
2nd.ts +1.06x (fastest): 33ms
```

Measurement numbers below 1 second should not be trusted, such results will be different on every benchmark run. 
Changing it to type-check million times:

```ts
measureTime({
  runTimes: 1_000_000,
  preparation,
  samples,
})
```
```
1st.ts (slowest): 2899ms
2nd.ts +1.22x (fastest): 2385ms
```

## Measure speed

`measureTime` type checks first sample, second, first, second, and continues for 100ms for each sample,
measuring how many operations per second each sample gives.

```ts
import { measureSpeed } from "ts-check-perf";

measureSpeed({
  preparation,
  samples,
})
```
```
1st.ts (slowest): 289k ops/s
2nd.ts +1.4x (fastest): 404.1k ops/s
```

Change the duration by setting `durationMs`:

```ts
measureSpeed({
  durationMs: 1000,
  preparation,
  samples,
})
```
```
1st.ts (slowest): 332.4k ops/s
2nd.ts +1.37x (fastest): 454.9k ops/s
```

## benchmark.js

You can use `ts-check-perf` in together with other benchmarking tools which provides more metrics.

```ts
import { setupTsBenchmark } from "ts-check-perf";
import * as Benchmark from 'benchmark'

const { typeChecker, sourceFiles } = setupTsBenchmark({
  preparation,
  samples,
})

const suite = new Benchmark.Suite()

suite
  .add('type', () => {
    typeChecker.checkFileForBenchmark(sourceFiles[0]);
  })
  .add('interface', () => {
    typeChecker.checkFileForBenchmark(sourceFiles[1]);
  })
  .on('cycle', (e) => {
    console.log(String(e.target));
  })
  .on('complete', () => {
    console.log('Fastest is ' + suite.filter('fastest').map('name').join(', '));
  })
  .run()
```
```
type x 349,530 ops/sec ±6.94% (74 runs sampled)
interface x 286,340 ops/sec ±17.00% (63 runs sampled)
Fastest is type
```

## Common parameters

Set `log: false` to `measureTime` and `measureSpeed` to disable logging, they return a result `Record<'sample name', number>` you can use programmatically.

By default, this tool is looking for `tsconfig.json` for configuring TS,
you can change this file name by setting `tsconfigName` parameter to options of `measureTime`, `measureSpeed`, `setupTsBenchmark`.

## ESM

This tools works by patching TS source code on-the-fly: it reads TypeScript's compiler code from node_modules,
injects own function into it, and saves the result to `require.cache`.

Such trick only works with CommonJS module system, there is no official way to do this for ESM,
so this library doesn't support ESM and have no plans for it.

## Bun

Interesting observation, running the example from above with `measureSpeed`:

```shell
$ node -v
v20.8.1
$ node bench.js
1st.ts (slowest): 323.5k ops/s
2nd.ts +1.27x (fastest): 412.1k ops/s
```

Running the same file with Bun:

```shell
$ bun -v
1.0.15
$ bun bench.js
1st.ts (slowest): 562.0k ops/s
2nd.ts +1.12x (fastest): 631.9k ops/s
```
