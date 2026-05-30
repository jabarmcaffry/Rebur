---
name: Gui.bind enforcement
description: Calling Gui.text/bar/image/button on a bound ID is now a dev-mode throw, not just docs advice.
---

## Rule
After `Gui.bind(id, stateKey, fn)` is called, any direct call to `Gui.text(id, ...)`, `Gui.bar(id, ...)`, `Gui.image(id, ...)`, or `Gui.button(id, ...)` on the same ID will:
- **Dev mode** (`IS_DEV = process.env.NODE_ENV !== "production"`): throw immediately.
- **Production**: warn and no-op the direct call.

**Why:** Prevents silent drift/double-render bugs from mixing bind + direct calls on the same element.

## Implementation
`guiBoundIds` is a `Set<string>` closure-scoped inside `run()` in script-runner.ts. `Gui.bind` adds to it; `Gui.clear` removes from it. Direct Gui methods check the set before executing.

## How to apply
Once an element is bound to state, never call Gui.text/etc on that same ID in game logic. Use State mutations to update the value instead.
