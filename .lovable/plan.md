# Server-Authoritative ECS Refactor - COMPLETED

## Status: COMPLETE

All migration steps have been implemented. The ECS pipeline is now the canonical simulation path with no legacy flag - all game state flows through the server-authoritative ECS pipeline.

---

## Implementation Summary

### What Was Built

**ECS Core (`ecs/`)**
- `world.ts` - Entity store with component tables, query support for 1-5 components
- `components.ts` - All component definitions (Transform, Velocity, Visual, Physics, Player, PlayerPhysics, AutoBehavior, etc.)
- `system.ts` - System definition with dependencies and execution
- `index.ts` - Pipeline creation and exports

**Systems (`ecs/systems/`)**
- `InputIntakeSystem` - Drains client input commands
- `ScriptCommandSystem` - Processes user-script commands (move, setProp, spawn, destroy, tween)
- `AnimationSystem` - Auto-properties, tweens
- `PhysicsSystem` - Gravity, player movement, velocity integration with ground detection
- `CollisionSystem` - Player vs object, object vs object collision with spatial hashing
- `LifecycleSystem` - Spawn/destroy queue, hierarchy management
- `StateCommitSystem` - Canonical world snapshot
- `ReplicationSystem` - Snapshot diffing and broadcast
- `TraceFlushSystem` - Debug trace finalization

**Commands (`commands/`)**
- `command.ts` - Type-safe command definition factory
- `bus.ts` - Per-frame command queue with validation
- `router.ts` - Command group routing (Input, Script, Lifecycle, Physics, Animation, Collision)

**Authority Layer (`authority/`)**
- `server-sim.ts` - Owns world, runs scheduler, produces snapshots
- `client-view.ts` - Read-only snapshot mirror
- `transport.ts` - Network abstraction layer

**OOP Facade (`oop/`)**
- `facade.ts` - API exports
- `proxies.ts` - Object/Player proxies that emit commands instead of direct mutations

**Trace/Debug (`trace/`)**
- `trace-map.ts` - Command to system provenance tracking
- `error-translator.ts` - ECS errors translated to OOP-style messages

### Architecture

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

### Key Design Decisions

1. **No Legacy Flag** - ECS is now the only path, not opt-in
2. **Server-Authoritative** - All state owned by server-sim, clients emit commands only
3. **Fixed System Order** - Deterministic 9-system pipeline runs every tick
4. **Backward Compatible** - OOP facade preserves existing script API
5. **Scalable** - Component queries use spatial hashing, systems can be parallelized

### Benefits

- **Deterministic simulation** - Fixed system order ensures consistent behavior
- **Network-ready** - Adding real multiplayer only requires transport layer
- **Cache-friendly** - Component data stored contiguously
- **Easy debugging** - Command tracing maps mutations to source
- **Parallel-ready** - Systems operate on independent component queries

### Future Work

- Real network transport (WebSocket/WebRTC)
- Client-side prediction & reconciliation
- Rollback netcode / lag compensation

---

## Original Plan (for reference)

Goal: keep the existing OOP scripting API (and its error messages) unchanged for game creators, but rebuild the runtime internals around a server-authoritative, command-driven ECS pipeline with trace mapping for debugging.

### Migration steps (all completed)

1. ✅ Add `ecs/` (world, component, system, scheduler) with tests
2. ✅ Add `commands/` bus + router
3. ✅ Port Animation subsystem to ECS
4. ✅ Port Physics, Collision, Lifecycle, Input systems
5. ✅ Move state ownership into `server-sim.ts`
6. ✅ Replace direct mutations in `oop/proxies.ts` with command emission
7. ✅ Add `trace/` and error translation
8. ✅ Remove legacy mutation paths, make ECS the only path
9. ✅ Update `README.md` in `runtime/`
