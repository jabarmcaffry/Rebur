---
name: Rebur API implementation
description: How the Rebur.* scripting global is wired in the engine and what is/isn't real.
---

## Rule
`Rebur` is the primary global exposed in the VM sandbox (server/script-runner.ts). All documented APIs are implemented.

## What is real (server-side, actually works)
- `Rebur.on/off` — global events (tick, playerJoined/playeradded, playerLeft/playerremoving, playerDied, playerRespawned)
- `Rebur.Scene.find/findById/all/query/create` — entity access and creation
- `Rebur.Scene.raycast` — stub, always returns null
- `Rebur.Players.all/find/get` — player access
- Entity proxy: mutable `position/rotation/scale` proxies (entity.position.x = 5 works), `destroyed`, `body.*`, `on/off/emit`, `destroy()`
- Player proxy: `username`, `id`, `isPlayer`, `health`, `maxHealth`, `walkSpeed`, `runSpeed`, `jumpPower`, `onGround`, `teleport/respawn/kill/takeDamage/heal`
- `Rebur.State.set/get/on` — shared session key-value
- `Rebur.DataStore.get/set/delete/increment` — in-memory per-session (not DB-persisted yet)
- `Rebur.Gui.text/button/bar/image/clear(id, ...)` — string-ID-based HUD (NEW API)
- `player.gui.text/button/bar/clear(id, ...)` — per-player string-ID-based GUI
- `Rebur.Sound.play` — broadcasts to all clients
- `Rebur.Tween(target, to, duration, easing?, onDone?)` — target-based, works with entity.position proxy
- `Rebur.Tags.add/remove/has/get/all` — tag system
- `Rebur.Network.broadcast/broadcastTo/on/off` — server→client messaging
- `Rebur.RunService.on(phase, fn)` — all phases currently map to tick
- `Rebur.Input.onPress/onRelease/onMouseClick` — handlers stored at class level (not per-script)
- `Rebur.Camera` — settable proxy, not yet applied to client
- `Rebur.Physics` — settable proxy, not yet applied to physics engine
- `after(s, fn)`, `every(s, fn)`, `wait(s)` — top-level timer helpers; wait() returns Promise
- `random`, `randInt`, `pick`, `log`, `warn`, `error` — top-level utility globals
- `Promise` — exposed (not undefined anymore)

## Drain queues added to GameRoom
- `drainDestroyQueue()` — removes objects from allObjs/dynamics/statics/scriptObjs
- `drainNetworkMessages()` — broadcasts networkMessage events
- `drainNetworkToPlayer()` — sends targeted networkMessage events

## GUI anchor mapping
New short-form anchors (tl/tc/tr/cl/cc/cr/bl/bc/br) are mapped to old full-form in mapGuiOpts().

**Why:** The old engine used Roblox-style APIs (game.*, Scene.*, Players.*) and had no Rebur global at all. This caused "Rebur is undefined" errors in all scripts using the documented API.

**How to apply:** When adding new APIs to docs.ts/monaco-config.ts, always implement them in script-runner.ts first.
