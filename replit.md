# PyGame Engine

## Overview

PyGame Engine is a browser-based game development platform inspired by Roblox Studio.
Users build 3D scenes by adding primitives, write **JavaScript** scripts that drive
gameplay, and press Play to drop a personal avatar into their world. The whole
experience runs in the browser, supports mobile devices, and uses in-memory storage
on the server (no external database).

## User Preferences

- Communication style: simple, everyday language.
- Scripting language: JavaScript (chosen by the user as the better fit for a browser game engine).
- No avatar creation flow — the user's avatar spawns automatically based on their account name.
- No external database — all server state lives in-memory.

## System Architecture

### Frontend
- **React + TypeScript + Vite**
- **Wouter** for routing
- **TanStack Query v5** for server state
- **shadcn/ui + Tailwind CSS** (dark theme by default)
- **React Three Fiber + drei** for 3D rendering
- **Monaco Editor** for code editing (JavaScript)

### Editor (`/editor/:gameId`)
- Top toolbar: add primitives (cube/sphere/cylinder/plane/light), transform mode toggles (desktop), Play button
- Left panel (desktop): **Roblox-style hierarchy tree** — every service container is shown, scripts are nested as children of the container or of a specific object they're attached to. Each container header has a "+" button that creates a new script there (with the right default ScriptType per container); each object row has a "+" button that attaches a script directly to that object. Clicking a script row selects it AND switches the center pane to the Scripts tab.
- Center: tabbed panel — **Scene** (3D viewport with grid + gizmo) and **Scripts** (Monaco JS editor). The Scripts tab no longer has its own list — script selection is driven entirely from the Hierarchy.
- Right panel (desktop): Properties (name, color, position/rotation/scale vectors, container, delete)
- **Mobile (<768px)**: Hierarchy and Properties collapse into Sheet drawers triggered by Menu / PanelRight buttons; transform-mode buttons are hidden; the toolbar tightens
- **Mobile-friendly script toolbar** sits above the Monaco editor on every screen size: Undo / Redo / Copy (selection or all) / Paste / Select All / Toggle comment / A− / A+ font size / **Snippets** popover with prefab code blocks (key press, every/after timers, spawn from ReplicatedStorage, create object, planet w/ per-object gravity, global state machine, super-jump, take damage / heal, GUI text+button, inventory). Toolbar buttons drive Monaco via a captured editor ref (`monacoRef`).
- All edits persist via `/api/objects/*` and `/api/scripts/*` (in-memory MemStorage)

### Containers (`CONTAINERS` in `Editor.tsx`)
The hierarchy mirrors Roblox's services. Six top-level containers, each with a `defaultScriptType` used when the user clicks "+ script" on the container header:
- **Workspace** — Live 3D objects in the world. Default for new primitives. Rendered, collidable. (Default script: `Script`.)
- **Lighting** — Lights and lighting helpers. Default for the "Add Light" button. Rendered. (Default script: `Script`.)
- **Players** — Per-player non-physical data. Not rendered. (Default script: `LocalScript`.)
- **ServerScriptService** — Server-authoritative scripts. Not rendered. (Default script: `Script`.)
- **StarterPlayer** — Scripts/objects cloned to each player on join. Not rendered. (Default script: `LocalScript`.)
- **ReplicatedStorage** — Shared templates `spawn("Name")` reads from + ModuleScripts. Not rendered. (Default script: `ModuleScript`.)

Both the Editor viewport and `PlayMode.tsx` filter `renderableObjects` to **only `Workspace` + `Lighting`** — every other container is logical (templates / scripts) and never drawn. Backwards-compat for the old Storage / *Engine names was intentionally **dropped** as part of this reshape; localStorage was bumped to `v2` to wipe stale games.

### Renderer Fallback
- WebGL availability is detected at mount via `client/src/lib/webgl.ts`.
- When WebGL is available the editor and Play mode use **R3F + drei** (full lighting, shadows, gizmos, OrbitControls).
- When WebGL is **not** available, both surfaces fall back to **`client/src/components/SVGScene.tsx`**, which builds a Three.js scene and renders it with the official `SVGRenderer` from `three/examples/jsm/renderers/SVGRenderer`. This means scenes still render (as inline SVG paths/polygons) on browsers / contexts without WebGL, and a small "SVG fallback (no WebGL)" badge is shown.
- `SVGScene` supports drag-to-orbit, wheel-to-zoom, click-to-select, syncs meshes with the latest `objects` prop each frame, and (in Play mode) reads positions from the `GameRuntime` to animate the avatar and scripted objects.

### Play Mode (`client/src/components/PlayMode.tsx`)
- Full-screen overlay that runs the user's game.
- Spawns a personal **avatar** at the SpawnLocation (or origin if none): torso (capsule), head (sphere), eyes, smile, hair cap, swinging arms (with hands) and legs that animate based on horizontal velocity. While `player.flying` is true the avatar gently bobs.
- **Chase camera** (`ChaseCameraRig`) follows both the player's translation **and** their up vector — each frame it rotates the camera's offset around the player by the quaternion that takes the previous up to the current up, so the camera-to-player relationship looks identical regardless of gravity orientation (walking around a spherical planet, flipped gravity, etc). Yaw is intentionally **not** followed (would feedback-loop with camera-relative movement); horizon level is smoothed by lerping `camera.up`.
- **Inputs**: WASD / arrow keys + Space (jump) on desktop. **Shift** maps to fly-down when `player.canFly` is on. On touch devices a **virtual joystick** (left) is always present; the right side shows a **JUMP** button by default — when `player.canFly` is true it switches to **Up / Down** fly buttons.
- **Health bar HUD** (`data-testid="hud-health"`) appears automatically whenever `player.health < player.maxHealth`.
- **Script-driven HUD overlay** (`GuiOverlay`) renders every element in `runtime.gui` as an absolutely-positioned div/button (test ids `gui-text-<id>` / `gui-button-<id>`). Buttons call back into `runtime.invokeGuiClick(id)` which executes the script's `onClick(game)` handler.
- **Console** panel toggleable from the HUD shows everything emitted by `game.log(...)`.
- The R3F `Canvas` is wrapped in its own error boundary so a missing WebGL context shows a fallback message instead of crashing the page.
- **The script game-loop runs in a standalone `requestAnimationFrame` loop**, independent of the Three.js Canvas, so user scripts execute (and the console populates) even when WebGL is unavailable.

### Game Runtime (`client/src/lib/gameRuntime.ts`) — event-first
- `GameRuntime` class instantiates a JS sandbox per Play session.
- Scripts are **event-first** — there is no `onStart`/`onUpdate` boilerplate. Each script is compiled with the `AsyncFunction` constructor so the body runs **once at start** (top level) and may `await wait(s)`. Devs subscribe to events for ongoing work. Every API is injected as a **bare global** (`events`, `keyboard`, `mouse`, `world`, `workspace`, `player`, `state`, `log`, `find`, `spawn`, `wait`, `every`, `after`, `onUpdate`, `onKey`, …).
- All runtime errors (compile + top-level + handler) are caught and routed to the in-game console with the script name.
- Event API surface (every `on*` returns an `unsubscribe()`):
  - `events.on("start" | "update" | "step" | "playerSpawned" | "playerDied" | "keyDown" | "keyUp" | "objectAdded" | "objectRemoved", fn)` — global bus.
  - `obj.on("touched" | "clicked" | "destroyed", fn)` / `obj.off(...)` — per-object events. `touched` fires once per contact-enter from the player (re-fires on re-entry); `clicked` fires from 3D viewport raycasts and HUD buttons.
  - `keyboard.onPress(key, fn)` / `keyboard.onRelease(key, fn)` — per-key edge events.
  - `mouse.onClick(fn)` — fires on every viewport click; receives `(hitObject | null)`.
  - `world.onPlayerSpawned(fn)` / `world.onPlayerDied(fn)`.
  - Convenience: `every(seconds, fn)`, `after(seconds, fn)`, `onUpdate(fn)`, `onKey(key, fn)`.
- Exposes a `game` object to scripts (still available alongside the bare globals):
  - **Service containers** (one record per Roblox service): `game.workspace.<name>`, `game.lighting.<name>`, `game.replicatedStorage.<name>`, `game.serverScriptService.<name>`, `game.starterPlayer.<name>`, `game.players.<name>`. `game.objects` is an alias for `game.workspace`.
  - `game.find("Name")` searches every service. `game.spawn("TemplateName", overrides?)` clones a `ReplicatedStorage` template into Workspace. `game.destroy(objOrName)` / `game.create({ primitiveType, position, color, ... })` round out object lifecycle.
  - **Player** (read/write): `position`, `rotation`, `color`, `health`, `maxHealth`, `speed`, `jumpPower`, `size`, `canFly`, `flying`. Methods: `takeDamage(n)`, `heal(n)`, `teleport(x,y,z)`, `respawn()`. When `health` reaches 0 the player auto-respawns at the spawn point and `playerDied` + `playerSpawned` fire.
  - **Physics** (`game.physics`): `gravity`, `airDrag`. Tweak at runtime, or use per-object gravity by setting `gravityEnabled = true` on any object (with `gravityStrength` + `gravityRadius`).
  - **State machine** (`game.state`): `state.set(key, value)`, `state.get(key)`, `state.on(key, fn)` returns an unsubscribe, `state.keys()`.
  - **GUI** (`game.gui`): `text(id, text, opts)` / `button(id, text, opts, onClick)` populate the HUD overlay. Buttons call back via `runtime.invokeGuiClick(id)`.
  - `game.input` — `{ moveX, moveZ, jump, flyUp, flyDown, keys }` populated by PlayMode.
  - `game.time`, `game.dt`, `game.now()`, `game.wait(s)`.
- Each step:
  1. Applies camera-relative WASD/joystick input. If `player.canFly` is true, gravity is disabled and Space/Shift drive vertical motion.
  2. **Player rotation** — when the player has horizontal movement intent, target yaw is `atan2(wantX, wantZ)` (matches the avatar's mesh facing) and is slerped at `dt*12`. Idle frames leave rotation alone so the camera/orbit can swing freely without forcing the body to face the camera.
  3. Otherwise runs simple physics (`physics.gravity`, ground clamp, AABB collisions; lights/service-only containers skipped).
  4. Sweeps player↔object contacts (radius 0.45, half-height 0.95) and emits `touched` for new contacts.
  5. Emits `update` / `step` and key edge events; fires registered handlers.
- `PlayMode` wires 3D-viewport clicks through R3F's raycaster: each `Primitive` mesh forwards `onClick` to `runtime.emitClick(id)` (with `stopPropagation`), and the Canvas's `onPointerMissed` fires `runtime.emitClick(null)` so `mouse.onClick` always sees a hit-or-null. `runtime.stop()` runs on unmount to clear timers/handlers.
- `rebuildIndexes()` routes each runtime object into its service record based on its `container` field; only `Workspace` + `Lighting` are pushed into `objectList` for rendering.
- The runtime detects an object named `SpawnLocation` (or with `type: "spawn"`) on start and uses its position as the player's `spawnPoint`.
- `DEFAULT_SCRIPT` and `SCRIPTING_DOCS` document the event-first API. The Editor snippet menu (`SCRIPT_SNIPPETS`) and server/client welcome scripts mirror the same style. The local-storage cache key was bumped to `pygame_engine_data_v3` to invalidate any old `onStart`/`onUpdate` boilerplate.

### Backend
- **Node.js + Express + TypeScript (ESM)**
- RESTful endpoints under `/api/*`
- `multer` for asset uploads, `ws` for the multiplayer scaffolding
- Hardcoded login (`test` / `pass123`) backed by `express-session`
- All game data (users, games, objects, scripts, assets) stored in **MemStorage** (in-memory `Map`s), seeded with a default `test` user
- **Game seeding** — `POST /api/games` automatically creates a starter scene so every new game is immediately playable:
  - Workspace/`World` — large green sphere (scale 8) acting as the planet
  - Workspace/`SpawnLocation` — flat blue cylinder (`type: "spawn"`) the runtime auto-detects as the player's spawn point
  - Lighting/`Sun` — warm point light
  - A `Welcome` script demonstrating `game.gui.text`, `game.find`, plus commented examples for `player.canFly` and `physics.gravity`. Users can edit, delete, or replace any of these.
- The Editor auto-saves script edits on a 500ms debounce and force-flushes any pending save before launching Play Mode, so PlayMode always runs the latest code.

### Project Structure
```
├── client/src/
│   ├── components/
│   │   ├── PlayMode.tsx       # Full-screen play overlay (avatar + camera + HUD)
│   │   └── ui/                # shadcn/ui components
│   ├── hooks/
│   ├── lib/
│   │   └── gameRuntime.ts     # GameRuntime + JS sandbox + DEFAULT_SCRIPT
│   └── pages/
│       └── Editor.tsx         # Toolbar / Hierarchy / Viewport / Scripts / Properties
├── server/
│   ├── routes.ts              # API endpoints
│   └── storage.ts             # MemStorage (in-memory Maps)
└── shared/
    └── schema.ts              # Drizzle table defs reused as plain TS types
```

### Build and Development
- Dev: `npm run dev` (tsx + Vite, Express on port 5000 serves both API and frontend)
- Production build: `npm run build` — Vite -> `dist/public`, esbuild -> `dist/index.js`
- Production start: `npm run start` — runs `node dist/index.js`
- Replit deployment is configured for **autoscale** with the build/start commands above.

## External Dependencies

### Key NPM Packages
- `@tanstack/react-query`, `wouter`, `drizzle-zod`, `zod`
- `@monaco-editor/react`
- `@react-three/fiber`, `@react-three/drei`, `three`
- `express`, `express-session`, `multer`, `ws`

### Environment Variables
- `SESSION_SECRET` (optional, defaults to a development value)

(No `DATABASE_URL` is required — storage is in-memory.)
