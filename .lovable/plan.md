
# Server-Authoritative ECS Refactor

Goal: keep the existing OOP scripting API (and its error messages) unchanged for game creators, but rebuild the runtime internals around a server-authoritative, command-driven ECS pipeline with trace mapping for debugging.

## Target pipeline

```text
User Code (OOP API)
   ↓ (façade translates calls to intents)
Command Events            ← lightweight intent layer
   ↓
Event Grouping            ← routing / batching layer
   ↓
ECS Systems               ← simulation core (fixed-order)
   ↓
State Commit              ← single source of truth (server)
   ↓
Render  /  Network        ← clients are pure consumers
   ↓
Trace Mapping             ← debug overlay, OOP-shaped errors
```

Authority model:
- Server (in-process today via `network.ts`, real WS later) owns state.
- Clients only emit Command Events ("intents"); never mutate state directly.
- Server runs ECS at fixed timestep, commits, then broadcasts snapshots.
- Render reads the last committed snapshot — no client-side prediction in v1 (we'll add reconciliation later; this keeps it "easier to build" as requested).

## New module layout (under `client/src/lib/runtime/`)

```text
ecs/
  world.ts              # Entity store, component tables (SoA where it matters)
  component.ts          # defineComponent<T>() + typed getters
  system.ts             # defineSystem({ id, deps, run })
  scheduler.ts          # Topological fixed-order runner, 1-frame deterministic
commands/
  command.ts            # defineCommand<TPayload>()
  bus.ts                # enqueue / drain per-frame, grouping by channel
  router.ts             # Maps command groups → systems that consume them
authority/
  server-sim.ts         # Owns world, runs scheduler, produces snapshots
  client-view.ts        # Applies snapshots to a read-only mirror world
  transport.ts          # Thin wrapper over existing network.ts
oop/
  facade.ts             # Re-exports current GameAPI shape
  proxies.ts            # Object/Player proxies → emit commands instead of mutate
trace/
  trace-map.ts          # cmd → system → component write provenance
  error-translator.ts   # ECS errors → OOP-style messages (file/line preserved)
```

Existing folders (`physics/`, `animation/`, `player/`, `objects/`, `gui/`, `state/`, `events/`, `input/`) are converted into ECS systems but keep their files; logic moves into `run(world, dt, ctx)` functions.

## Fixed system order (per server tick)

1. `InputIntakeSystem`        — drains client input commands
2. `ScriptCommandSystem`      — drains user-script commands (move, setProp, spawn, destroy, tween…)
3. `AnimationSystem`          — auto-properties, tweens
4. `PhysicsSystem`            — gravity, motors, integration
5. `CollisionSystem`          — player↔object, object↔object, touch events
6. `LifecycleSystem`          — spawn/destroy queue flush, parent/child reindex
7. `StateCommitSystem`        — writes to canonical world snapshot
8. `ReplicationSystem`        — diff + broadcast snapshot
9. `TraceFlushSystem`         — finalize per-tick trace records

No buffering frames; commands enqueued during tick N run on tick N+1 unless explicitly `immediate` (forbidden for clients).

## OOP façade (creator-facing, unchanged surface)

`obj.position.x = 5` and `obj:moveTo(...)` etc. continue to work. The proxy:
1. Captures the call site (already available via `compile.ts` source maps).
2. Emits a `Command` with `{ kind, entityId, payload, origin: { script, line } }`.
3. Returns a value consistent with the old API (reads come from the client-view mirror, which is the last committed snapshot — same data they see now).

Writes never take effect synchronously inside the script — but because user scripts already run inside the tick before commit, observable behavior is identical for single-frame logic. We document the one edge case (read-after-write within the same statement) and emulate it via a per-tick "pending overlay" so legacy scripts keep working.

## Trace mapping

Every command carries `origin`. Systems record `(commandId → systemId → componentWrites[])`. When a system throws or asserts:
- `error-translator.ts` looks up the originating command, rewrites the stack as `at <ScriptName>:<line>` with the OOP method name (`Object.moveTo`, `Player.setHealth`…), and re-throws.
- Console output uses the OOP vocabulary; ECS terms (entity, component, archetype) never leak to creators.
- Debug overlay (dev-only) shows the full ECS trace for us.

## Server authority wiring

- `network.ts` already simulates server+client in one process. We keep that; `server-sim.ts` becomes the only writer, `client-view.ts` the only reader on the client path.
- Client input → `client.send("cmd", command)` → `server.on("cmd", …)` → `CommandBus.enqueue`.
- Server snapshot → `server.broadcast("__snapshot", …)` → `client-view` applies.
- Anti-cheat seam: server validates command (`canEntityDoThis`, rate limits, ownership) before enqueue. v1 implements ownership + per-command rate cap; richer rules later.

## Migration steps (implementation order)

1. Add `ecs/` (world, component, system, scheduler) with tests; no behavior change yet.
2. Add `commands/` bus + router; wire empty.
3. Port one subsystem (Animation) to a system as a vertical slice; run it through scheduler in parallel with old path; gate by flag.
4. Port Physics, Collision, Lifecycle, Input.
5. Move state ownership into `server-sim.ts`; make `client-view.ts` the only thing components read.
6. Replace direct mutations in `oop/proxies.ts` with command emission. Keep API identical.
7. Add `trace/` and route all thrown errors through `error-translator.ts`.
8. Delete the old `core.ts` mutation paths; `game-runtime.ts` becomes a thin boot that constructs server + client halves.
9. Update `README.md` in `runtime/` to describe the new pipeline.

## Out of scope (call out explicitly)

- Real network transport (WebSocket/WebRTC) — still in-process via `network.ts`.
- Client-side prediction & reconciliation — deferred; v1 is "wait for server" which the user explicitly accepted ("easier to build … breaks fast in real games" — they want the simple form first).
- Rollback netcode / lag compensation.

## Risks

- Creator scripts that depended on synchronous read-after-write across multiple statements may observe a 1-tick delay. Mitigated by per-tick pending overlay; documented otherwise.
- Large surface area — staged behind a feature flag (`runtime.useEcsPipeline`) so we can ship incrementally without breaking existing games.

Approve this and I'll start with steps 1–3 (ECS core + command bus + Animation vertical slice) in the first pass.
