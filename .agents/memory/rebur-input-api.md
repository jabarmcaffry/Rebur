---
name: Rebur.Input unified API
description: Global input event API shape — what exists, what was removed, and why.
---

## Rule
`Rebur.Input` exposes only `.on(event, fn)` and `.off(event, fn)`. There is NO `isDown()` or `isDownAny()` — those were removed. Callbacks always receive `(player, key|entity)`.

Events: `"press"`, `"release"`, `"mouseClick"`.

**Why:** isDown/isDownAny had no per-player scope, causing multiplayer logic bugs (any player's held key would affect all players).

## Per-player held state
Use `player.input.key(keyName)` for per-player polling. Use `player.input.on("press"|"release", fn)` for per-player edge events. See player-input-api.md.

## How to apply
- Global any-player reactions: `Rebur.Input.on("press", (player, key) => {})` — fn receives the triggering player.
- Per-player polling in tick: `player.input.key("shift")` inside a `Rebur.on("tick")` loop.
- mouseClick events: `Rebur.Input.on("mouseClick", (player, entity) => {})` — entity is null for sky clicks.
- Key down/up WS messages: browser keydown → server `keyDown` WS handler → `game-room.handleKeyDown()` → updates `playerHeldKeys` Map → `_rebuildHeldKeys()` updates per-player held keys in script-runner.
