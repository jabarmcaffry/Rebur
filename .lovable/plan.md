
# Engine upgrade plan

This request touches a lot of independent systems (editor UI, hierarchy rename, materials/textures, terrain, GUI authoring, physics constraints, script runtime, docs). I want to land it in clearly separated phases so each one is reviewable and the preview stays runnable between phases, instead of one giant unreviewable change.

Before I start, two things I need from you so I build the right thing:

1. **Asset pipeline**: for textures/materials/models, do you want users to upload their own files (image/glb/fbx) that we store and stream, or only pick from a built-in library for now? (Upload = bigger change: storage + asset records + signed URLs.)
2. **Terrain style**: heightmap-based terrain (paintable hills + texture layers, Unity/Roblox-style) or voxel/blocky terrain (Minecraft-style)? Pick one — they're very different systems.

Default if you don't answer: **uploads enabled** + **heightmap terrain**.

## Phase 1 — Hierarchy + Properties foundation (no behavior change)
- Rename `UI` container tree to `GUI` everywhere (`types.ts` `ContainerName`, `script-runner.ts`, `game-room.ts`, default starter content, hierarchy panel, docs). Hard rename, no legacy aliases — matches the existing "no backward compat" rule.
- Properties panel: add grouped sections (Transform, Appearance, Physics, Material, Behavior, Attributes) and surface every field already on `RuntimeObject` (currently most are hidden).
- Hierarchy panel: drag-to-reparent, multi-select, search/filter, right-click context menu (duplicate, group, delete, copy/paste, set container).

## Phase 2 — Materials & Textures
- New `Material` asset type stored under `Assets/Shared/Materials` with: baseColor, baseColorMap (texture ref), roughness, metallic, normalMap, emissive, emissiveMap, opacity, tiling (uv repeat), offset.
- New `Texture` asset stored under `Assets/Shared/Textures` (image upload → asset record → CDN URL).
- Object property: `materialId` (overrides flat `color`). Renderer (`Primitive.tsx`) reads material and applies a `MeshStandardMaterial` with the maps.
- Editor: Material inspector with live preview sphere, drag-drop texture from asset browser.

## Phase 3 — Building / map tools
- Grid snap + rotation snap toggles in editor toolbar (already partially there — finish it).
- Primitive palette expanded: wedge, corner-wedge, cylinder, sphere, cone, torus, plane, ramp.
- Group / model: select multiple objects → `Ctrl+G` makes a `Model` parent (already have `setParent`, just need the UI). Models can be saved as templates into `Assets/Shared/Models` and re-spawned via `Rebur.spawn("templateName")`.
- Duplicate-with-offset, mirror, align tools.

## Phase 4 — Terrain (heightmap, assuming default)
- New `Terrain` object type. Stored as a heightmap (Float32Array per chunk) + a per-cell material index into a small material palette (grass, rock, sand, snow, etc.).
- Editor tools: raise/lower brush, flatten, smooth, paint material, set water level.
- Server: terrain participates in raycast and player ground collision via heightmap lookup (cheap — no per-triangle physics).
- Client: chunked mesh rendering with LOD.
- Script API: `Rebur.Terrain.getHeight(x,z)`, `setHeight(x,z,h)`, `paint(x,z,radius,materialIndex)`, `raycast(...)`.

## Phase 5 — GUI authoring (Roblox-style)
- New top-level editor mode "GUI Editor" that overlays a 2D canvas on top of the 3D viewport.
- Drag-create GUI elements (Frame, Text, Button, Image, Bar, ScrollFrame, TextInput) into `GUI/Player` (per-player) or `GUI/Global` (shared).
- Each element is a real hierarchy node with anchor, position (scale + offset like Roblox UDim2), size, z-index, parent.
- Properties panel works on GUI nodes just like 3D nodes.
- Script API: `Rebur.Gui.find(id)`, existing `Gui.bind` keeps working; add `Gui.create({...})` to spawn elements at runtime, plus `gui.parent`, `gui.children`.

## Phase 6 — Physics constraints & joints
This is the big scripting upgrade. Add a real constraint system used both by editor (drop a Hinge between two parts) and by scripts:
- `Rebur.Constraints.hinge(partA, partB, { pivot, axis, limits, motor: {targetAngle, speed, force} })` → returns a constraint handle with `.setMotor(...)`, `.setLimits(...)`, `.destroy()`. Use case: doors, levers.
- `Rebur.Constraints.weld(a, b)` — rigid attach. Use case: building assemblies.
- `Rebur.Constraints.ballSocket(a, b, pivot)` — ragdoll / chains.
- `Rebur.Constraints.slider(a, b, axis, limits, motor)` — pistons, sliding doors.
- `Rebur.Constraints.spring(a, b, restLength, stiffness, damping)` — suspension.
- `Rebur.Constraints.rope(a, b, length)` / `rod(a, b, length)`.
- `Rebur.Constraints.vehicle(chassis, wheels[], { steerAxle, driveAxle, maxSteer, maxTorque })` — wraps wheels with the right hinges/springs and exposes `.setThrottle(0..1)`, `.setSteer(-1..1)`, `.setBrake(0..1)`. Use case: cars.
- Server physics step: iterative impulse solver for these constraints (keeps the existing AABB body engine, adds constraint pass before integration). No external physics lib — stays inside our worker runtime.

## Phase 7 — Script runtime + docs
- Wire all of the above into `script-runner.ts` VM context (no new globals — everything hangs off `Rebur`).
- Update `client/src/lib/runtime/docs.ts` with full reference for: `Rebur.Materials`, `Rebur.Textures`, `Rebur.Terrain`, `Rebur.Gui` (expanded), `Rebur.Constraints`, `Rebur.Vehicles`, plus a "Cookbook" section with copy-pasteable snippets: opening door, sliding door with sensor, simple car, breakable joint, ragdoll on death, paint terrain, build from blueprint.
- Update monaco autocomplete (`scripting/monaco-config.ts`) with the new types.
- Update `.agents/memory/rebur-api.md` so future me knows what's real vs stubbed.

## Out of scope for this batch (call out so we don't forget)
- Particle system editor (we have `ParticleEvent` but no authoring UI yet).
- Animation graph / blend trees beyond the existing motor-driven Avatar.
- Marketplace / asset store.
- Lighting beyond ambient + sun (no point/spot light authoring yet).

## What I'll do right now if you say "go"
Phase 1 only (hierarchy `UI`→`GUI` rename + properties panel groups + hierarchy ergonomics). It's mechanical, low-risk, and unblocks every later phase. Then I'll check in and start Phase 2.
