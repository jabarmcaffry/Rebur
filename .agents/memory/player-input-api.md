---
name: player.input API
description: Per-player key polling and edge events — implementation shape and sync requirement.
---

## Rule
`player.input` is the per-player input API. It has three methods:
- `player.input.key(keyName)` → boolean — is this player currently holding this key?
- `player.input.on("press"|"release", fn)` → unsubscribe — fn(key: string)
- `player.input.off(event, fn)` — remove listener

**Why:** Replacing global isDown/isDownAny, which had no per-player scope.

## Implementation
- `perPlayerHeldKeys: Map<string, Set<string>>` in GameRoom — keyed by player id.
- `perPlayerInputHandlers: Map<string, Map<string, Set<fn>>>` in GameRoom — keyed by player id, then event name.
- `_rebuildHeldKeys()` in game-room.ts calls `scriptRunner.updatePlayerHeldKeys(playerId, heldKeys)` for each player after any key state change.
- `removePlayer()` calls `scriptRunner.clearPlayerHeldKeys(playerId)`.

## Sync requirement
Two player proxies in script-runner.ts must always stay in sync:
1. Closure `makePlayerProxy` (~line 492) — used in run() for non-class scripts.
2. Class `_makePlayerProxy` (~line 1248) — used in the class-based script runner.

Both must expose the same `input` shape. Any change to one must be mirrored in the other.
