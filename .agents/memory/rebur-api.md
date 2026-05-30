---
name: Rebur API implementation
description: How the Rebur.* scripting global is built and what is/isn't real yet.
---

## Rule
`Rebur` is the ONLY global in the VM sandbox (server/script-runner.ts). No backward compat. No `game`, `workspace`, `gui`, `task`, `runService`, legacy uppercase aliases, or `setTimeout`/`setInterval` in the VM context.

## VM context globals (exactly as documented)
- `Rebur` — engine global
- `after(s, fn)` → cancel fn, `every(s, fn)` → stop fn, `wait(s)` → Promise
- `random`, `randInt`, `pick`, `log`, `warn`, `error`
- `Vector3`, `Color3`
- `Math, JSON, String, Number, Boolean, Array, Object, Date, parseInt, parseFloat, isNaN, isFinite, Symbol, Promise`
- BLOCKED: `process`, `require`, `fetch`, `__filename`, `__dirname`

## Naming: Workspace not Scene
`Rebur.Workspace` is the 3D world container — NOT `Rebur.Scene`. The old `Scene` name was removed. The `isWorkspaceObj()` helper in script-runner.ts still accepts `container === "Scene"` as a backward-compat fallback (and `""`) but the public API is `Rebur.Workspace`.

## Container naming (canonical, as of 2026-05-30)
- `Workspace` — live 3D world (rendered + physics simulated)
- `Lighting` — lights (queryable via `Rebur.Lighting`, not physics)
- `ReplicatedStorage` — shared templates, visible to all; NOT safe for server secrets
- `ServerStorage` — server-only storage, never replicated to clients (like Roblox)
- `Players`, `ServerScriptService`, `StarterPlayer` — logical only

## game-room.ts setObjects
ALL containers go into `scriptObjs` with their `container` field. Only Workspace objects go into physics statics/dynamics. `isWorkspace` check: `c === "Workspace" || c === "Scene" || c === ""`.

## Rebur subsystems (all real, no undefined)
- `Workspace` — find/get/all/query/raycast/create (Workspace-only objects)
- `Lighting` — find/get/all (Lighting-only objects)
- `ReplicatedStorage` — find/get/all (ReplicatedStorage objects)
- `ServerStorage` — find/get/all (ServerStorage objects)
- `Players`, `State`, `DataStore`, `Gui`, `Sound`, `Tween`, `Camera`, `Input`, `Physics`, `RunService`, `Network`, `Tags`

## Camera
Plain writable proxy — no preset modes.

## onGround
Removed from player proxy by user decision.

## Raycast
Real AABB slab-method in `Rebur.Workspace.raycast()`. Tests Workspace objects only.

## player.input.on() auto-cleanup
Returns an unsubscribe fn AND registers it in `perPlayerInputUnsubs`. `clearPlayerHeldKeys(playerId)` calls all those unsubscribes automatically. No manual playerLeft bookkeeping needed.

## Core gaps (not yet real)
1. `collisionStarted`/`collisionEnded` — never fired
2. `player.body.applyImpulse` — stub
3. `Rebur.Input.isDown()` — always false
4. `player.animator` — stub
5. `player.inventory` + `player.motors` — stubs
6. `player.data` + `Rebur.DataStore` — in-memory only
7. `Rebur.Camera` — settings not applied client-side
8. `entity.setParent()`/`parent`/`children` — stubs
9. Raycast doesn't hit players
10. `Rebur.Network.on()` from client — no client LocalScript yet
11. `Rebur.Lighting` / `Rebur.ReplicatedStorage` / `Rebur.ServerStorage` entities are read-only (no create/raycast)
