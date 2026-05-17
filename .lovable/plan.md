# ECS Pipeline Hardening — 5 Improvements

Each improvement is staged so we can ship incrementally without breaking the OOP API or existing games. I recommend landing in this order (low risk → high risk).

## 1. Snapshot double-buffering (easy, ship first)

**Problem:** `StateCommitSystem` allocates a new `EntitySnapshot` object per entity per tick. At 60 Hz with 100 entities that's 6,000 allocs/s → GC pressure.

**Fix:**
- Add `SnapshotPool` to `state-commit-system.ts` holding two pre-allocated `Map<number, EntitySnapshot>` buffers (front + back).
- Each tick: pick the back buffer, reuse existing `EntitySnapshot` objects (mutate `position.x/y/z` in place instead of `{...transform.position}`), free unused entries.
- Swap front ↔ back at end of commit. `ReplicationSystem` and `ClientView` read the front buffer.
- Net effect: zero per-tick allocations in the hot path.

## 2. Entity pool (medium)

**Problem:** `world.create()` allocates a new `Set<string>` per entity; `destroy()` releases it to GC. Spawn-heavy games (bullets, particles) thrash.

**Fix:**
- Add `EntityPool` inside `world.ts`. `destroy()` clears the component set and returns it + the entity id to a free list (capacity-capped at e.g. 4096).
- `create()` reuses a free entry when available, only allocates when empty.
- Reused entity ids get a bumped generation tag to invalidate stale references (`EntityId` becomes `(id | (gen << 20))` brand-compatible).
- Add `LifecycleQueue.recycle(eid)` so user destroy commands flow through pool.

## 3. RuntimeObject as ECS proxy (large, biggest win)

**Problem:** Every frame we mirror ECS components → `RuntimeObject` and back. Wasteful and a source of desync bugs (the player-falling bug came from this).

**Fix (staged):**
- a. Convert `RuntimeObject.position`, `rotation`, `scale`, `velocity`, `visible`, `transparency`, `color`, `anchored`, `canCollide` into accessor properties (`Object.defineProperty` getters/setters) that read/write the ECS components directly via the entity handle.
- b. Remove the field copies in the per-tick sync loop in `game-runtime.ts.stepEcsPipeline` — there is nothing left to sync.
- c. Same treatment for `RuntimePlayer.position`/`velocity`/`health`/`ragdoll` → backed by `Player` + `PlayerPhysics` + `Transform` components.
- d. Keep `LegacyHandle` component as the bridge for non-spatial fields (event listeners, attributes, motors).

Risk: any code that does `obj.position = newVec3` (replacing the whole vector) needs to become `obj.position.x = ... ; .y = ... ; .z = ...`. We add a setter that decomposes assignment to keep API compatible.

## 4. Render-side interpolation (medium)

**Problem:** Server snapshots arrive at 20 Hz (or eventually network-rate). Render runs at display rate. Without interpolation, motion looks choppy on real networks.

**Fix:**
- `ClientView` keeps the last two snapshots (`prev`, `next`) plus their `tick` timestamps.
- Add `ClientView.sample(entity, component, alpha)` that lerps `position`/`rotation`/`scale` between prev and next based on the render clock vs snapshot interval (Quake-style "render in the past" 100 ms behind for safety).
- Renderer (`PlayMode`/`Primitive`) calls `sample` instead of `read` for transform data.
- Boolean/string fields use `next` only (no lerp).
- Behind-the-scenes only — OOP API unchanged.

## 5. Worker-thread physics+collision (large, ship last)

**Problem:** Physics + Collision run on main thread; competes with React render + GC.

**Fix:**
- Move `PhysicsSystem` + `CollisionSystem` behind a `SystemRunner` interface. Default = inline. New `WorkerRunner` posts the relevant component slices (Transform, Velocity, Physics, Collider) to a dedicated Worker, runs systems there, posts back deltas.
- Use `SharedArrayBuffer` for Transform/Velocity if available (fallback to structured-clone).
- Scheduler awaits worker before `StateCommitSystem`.
- Feature-flagged (`runtime.workerPhysics`) initially so we can A/B.

Risk: only payoff for big scenes; small scenes pay postMessage overhead. Keep behind flag.

## Technical notes

- All 5 are internal to `runtime/`. The scripting API (`api-builder.ts`) and creator-visible errors (`trace/error-translator.ts`) do not change.
- After step 3 ships, the `stepEcsPipeline` sync block in `game-runtime.ts` can be deleted entirely — that's the architectural win.
- Tests: add micro-bench harness (`pnpm vitest bench`) for snapshot churn (#1), spawn throughput (#2), and frame-time with 500 entities (#5).

## Proposed execution

Land #1 + #2 in one pass (low risk, immediate GC win), then #4 (render-only), then #3 (the big refactor), then #5 (perf-only, flag-gated).

Want me to start with #1 + #2 now, or a different order?
