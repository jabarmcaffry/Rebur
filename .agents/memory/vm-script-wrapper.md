---
name: Server script execution
description: How server-side user scripts are executed — AsyncFunction, not VM module
---

# Server Script Execution in loadScript

## The Rule
User scripts MUST be run via `AsyncFunction` (not `vm.createContext` + `vm.Script`). The VM module is removed entirely.

## Why
`vm.createContext({ Rebur })` does NOT reliably make `Rebur` available as a global in the VM's scope chain on Node.js 20. Even with an IIFE wrapper that passes globals as parameters (`})(Rebur,...)`), the argument evaluation `Rebur` itself fails with "ReferenceError: Rebur is not defined" because the VM context lookup is broken. The VM module approach was tested and confirmed broken.

**AsyncFunction approach works because:**
- `Rebur` and all other globals are explicit named parameters — never looked up via the scope chain
- Parameters are local to the function, always in scope after `await` and in all closures
- This is exactly what `ClientScriptRunner` does client-side, and it works there

## Pattern (server/script-runner.ts ~line 1310)
```typescript
const PARAMS = [
  "Rebur",
  "after", "every", "wait", "random", "randInt", "pick",
  "log", "warn", "error",
  "Vector3", "Color3",
  "Math", "JSON", "String", "Number", "Boolean", "Array", "Object", "Date",
  "parseInt", "parseFloat", "isNaN", "isFinite", "Symbol", "Promise",
  // Blocked — shadowed to undefined for security
  "process", "require", "fetch", "__filename", "__dirname",
  "global", "globalThis", "Buffer",
  "setInterval", "setTimeout", "clearInterval", "clearTimeout",
];

const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor as any;
const fn = new AsyncFunc(...PARAMS, code);
fn(Rebur, after, every, wait, ..., undefined, undefined, ...).catch(...);
```

## Do NOT go back to vm.createContext
The VM module import (`import { createContext, Script } from "vm"`) was removed. Do not re-add it.
