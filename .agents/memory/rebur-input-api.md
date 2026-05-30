---
name: Rebur.Input unified API
description: The Input API uses .on()/.off()/isDown() only — matching every other Rebur API. Old onPress/onRelease/onMouseClick are removed.
---

## Rule
`Rebur.Input` exposes exactly three methods:
- `.on(event, fn)` → returns unsubscribe
- `.off(event, fn)`
- `.isDown(key)` → boolean

Events: `"press"`, `"release"`, `"mouseClick"`.

## Callback signatures
- `"press"` / `"release"` → `fn(player, key: string)`
- `"mouseClick"` → `fn(player, entity | null)`

Callbacks always receive the **player** who triggered the event — no need to cross-reference Players.all().

**Why:** Old API (`onPress`, `onRelease`, `onMouseClick`) was inconsistent with every other Rebur API that uses `.on()`. The new API is uniform and gives you the acting player directly, which was the main pain point.

## How to apply
- Key down/up WS messages flow: browser keydown → `renderClient.sendKeyDown(key)` → server `keyDown` WS handler → `game-room.handleKeyDown()` → updates `playerHeldKeys` Map → `_rebuildHeldKeys()` updates `heldKeys` Set in script-runner → `fireInputPress()` calls all `"press"` handlers.
- `isDown(key)` reads from the `heldKeys` Set which is rebuilt every time any player's held-key state changes.
- `collisionStarted/collisionEnded` events: tracked in `collisionPairs` Set in game-room, emitted with `(other, impulse)`.
- `player.body.applyImpulse({x,y,z})` adds to `ScriptPlayerMutation.impulseX/Y/Z`; game-room applies it to player velocity each step.
- `ChaseCameraRig` accepts `serverCamera?: RenderState["camera"]` and applies mode/fov/position from server scripts.
