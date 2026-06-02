---
name: Worker threads + tsx/esbuild
description: Why tsx loader flags fail in Worker threads and how to fix it with esbuild compile-once.
---

## The Problem

In a Node 20 + ESM project running under `npx tsx`, spawning a `Worker` with a `.ts` entry point fails with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` even when you pass `execArgv: process.execArgv`.

**Why:** tsx uses an IPC pipe between its CJS preflight module and the ESM loader hook. Each Worker thread is a fresh V8 isolate — the pipe connection from the main process is not inherited. So even though the execArgv flags (`--require preflight.cjs` + `--import loader.mjs`) are present in the Worker, the CJS↔ESM transform channel is broken and `.ts` files cannot be transpiled.

Attempts that also fail:
- `execArgv: ['--import', 'tsx']` — wrong specifier
- `execArgv: ['--import', 'tsx/esm']` — tsx/esm registers via the hooks API but the IPC pipe is still absent
- `module.register('tsx/esm', ...)` — tsx/esm throws "must be loaded with --import instead of --loader"

## The Fix

Use **esbuild** (already a project dependency) to compile the TypeScript worker file to a plain `.mjs` bundle once at startup. The Worker runs from pure compiled JavaScript — no tsx flags, no execArgv needed.

```typescript
import { buildSync } from 'esbuild';
import os from 'os';

private static _compiledPath: string | null = null;

private static _ensureCompiled(tsSrcPath: string): string {
  if (WorkerRoom._compiledPath) return WorkerRoom._compiledPath;
  const outPath = path.join(os.tmpdir(), 'rebur-game-room-worker.mjs');
  buildSync({
    entryPoints: [tsSrcPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outPath,
    packages: 'external',  // keep node_modules as external imports
    logLevel: 'silent',
  });
  WorkerRoom._compiledPath = outPath;
  return outPath;
}

// In constructor:
this.worker = new Worker(WorkerRoom._ensureCompiled(tsWorkerPath));
```

`packages: 'external'` keeps all npm packages as external runtime imports (they exist in `node_modules` at runtime), while all local `.ts` source files are bundled into the `.mjs`. The static cache means compile happens once per server process (~50ms).

**Why:** The compile-once approach avoids tsx entirely for the Worker context. The resulting `.mjs` is self-contained for all local TS files and delegates npm imports to the existing node_modules.
