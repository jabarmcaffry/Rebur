---
name: VM script wrapper
description: Why user scripts are wrapped in an async IIFE in loadScript, and what the pattern looks like.
---

# VM Script Wrapper in loadScript

## The Rule
Every user script loaded via `ScriptRunner.loadScript()` is wrapped in an `async` IIFE before being run in the Node.js VM context. All documented globals (`Rebur`, `after`, `every`, `wait`, etc.) are passed as explicit function parameters.

## Why
Node.js 20 VM module: async continuations (resumed `await`, timer callbacks, event handlers fired from `tick()`) may not retain the VM context's global object in their scope chain. This causes "Rebur is not defined" ReferenceErrors even though `Rebur` is correctly in the `createContext` sandbox.

**How to apply:** Any time `loadScript` is modified, keep the IIFE wrapper. The PARAM_LIST constant in `script-runner.ts` lists every global that must be passed.

## Pattern (server/script-runner.ts ~line 1337)
```js
const PARAM_LIST =
  "Rebur,after,every,wait,random,randInt,pick,log,warn,error,Vector3,Color3," +
  "Math,JSON,String,Number,Boolean,Array,Object,Date," +
  "parseInt,parseFloat,isNaN,isFinite,Symbol,Promise";

const wrappedCode =
  `(async function(${PARAM_LIST}){\n` +
  code +
  `\n})(${PARAM_LIST}).catch(function(__err){` +
  `error("Unhandled async error: "+(__err&&__err.message||String(__err)));` +
  `});`;
```

## Side-effects / benefits
- Top-level `await wait(n)` now works in user scripts
- Unhandled promise rejections are caught and routed to the in-game console
- VM context still has all globals set (belt-and-suspenders)
- `function` declarations inside scripts are scoped to the IIFE (fine — scripts are isolated)
