---
name: Rebur API implementation
description: How the Rebur.* scripting global is built and what is/isn't real yet.
---

## Rule
`Rebur` is the ONLY global in the VM sandbox (server/script-runner.ts). No backward compat. No `game`, `workspace`, `Scene`, `Players`, `gui`, `task`, `runService`, legacy uppercase aliases, or `setTimeout`/`setInterval` in the VM context.

## VM context globals (exactly as documented)
- `Rebur` — engine global
- `after(s, fn)` → cancel fn, `every(s, fn)` → stop fn, `wait(s)` → Promise
- `random`, `randInt`, `pick`, `log`, `warn`, `error`
- `Vector3`, `Color3`
- `Math, JSON, String, Number, Boolean, Array, Object, Date, parseInt, parseFloat, isNaN, isFinite, Symbol, Promise`
- BLOCKED: `process`, `require`, `fetch`, `__filename`, `__dirname`

## Camera
Plain writable proxy — no preset modes. Users set `position`, `lookAt`, `fov` themselves each tick. Default cameraSettings is `{}` (empty). Docs updated to match.

## onGround
Removed from player proxy by user decision. Not in PlayerEntity interface. Not in ScriptPlayerState.

## Raycast
Real AABB slab-method in `Rebur.Scene.raycast()`. Tests all ScriptObjState objects (not players). Returns `{entity, distance, point, normal}` or null. Options: `maxDistance` (default 500), `ignore: Entity[]`, `tag: string`.

## What is real
- All Rebur.* subsystems: Scene, Lighting, Storage, Players, State, DataStore, Gui, Sound, Tween, Camera, Input, Physics, RunService, Network, Tags
- Rebur.Lighting — find/get/all filtered to container === "Lighting" objects
- Rebur.Storage — find/get/all filtered to container === "ReplicatedStorage" objects
- ScriptObjState now has `container?: string`; game-room setObjects passes it for all containers
- game-room setObjects: ALL containers go into scriptObjs; only Workspace goes into physics statics/dynamics
- Entity proxy: mutable position/rotation/scale sub-proxies, body with full physics props (anchored/canCollide/isTrigger/isKinematic/mass/friction/restitution/velocity + applyForce/applyImpulse/setVelocity), on/off/emit/destroy, setAttribute/getAttribute
- Player proxy: read-only position/rotation, health/maxHealth/walkSpeed/runSpeed/jumpPower/spawnPoint/color (r/w), gui/data/animator/inventory/motors, takeDamage/heal/kill/respawn/teleport
- Rebur.State: reactive key-value with on() subscriptions; keys()/getAll()
- Rebur.Gui + player.gui: string-ID HUD with text/button/bar/image/clear
- Rebur.Network: broadcast/broadcastTo/on/off
- Rebur.Tags: add/remove/has/get/all
- entityAdded fires from Scene.create(); entityRemoved fires from entity.destroy()

## player.input.on() auto-cleanup
`player.input.on(event, fn)` returns an unsubscribe fn AND registers it in `perPlayerInputUnsubs` (Map<playerId, unsub[]>). `clearPlayerHeldKeys(playerId)` calls all those unsubscribes automatically before clearing maps — no manual playerLeft bookkeeping needed in scripts. Both makePlayerProxy and _makePlayerProxy are in sync.

## Core gaps (not yet real)
1. `collisionStarted`/`collisionEnded` — never fired; only touched/untouched work
2. `player.body.applyImpulse` — stub; character controller owns velocity each tick
3. `Rebur.Input.isDown()` — always false; no continuous key state from client
4. `player.animator` — stub; animation auto-plays from movement, not scriptable
5. `player.inventory` + `player.motors` — stubs; no item rendering or slot attachment
6. `player.data` + `Rebur.DataStore` — in-memory only; resets on server restart (no DB)
7. `Rebur.Camera` — settings stored but NOT applied to the Three.js camera client-side
8. `entity.setParent()`/`parent`/`children` — stubs; hierarchy not replicated
9. Raycast doesn't hit players — only tests ScriptObjState (scene objects)
10. `Rebur.Network.on()` from client — no client LocalScript yet; clients can't send()
11. Rebur.Lighting / Rebur.Storage entities are read-only (no create/raycast); position writes replicate but no physics simulation for non-Workspace objects

**Why backward compat removed:** Explicit user decision on 2026-05-30. All scripts must use the documented Rebur.* API.
