# Game Runtime Architecture

The game engine runtime, refactored into isolated subsystems for maintainability, performance, and scalability.

## Directory Structure

```
runtime/
├── index.ts                    # Public API exports
├── core.ts                     # GameRuntime orchestrator (uses all subsystems)
├── types.ts                    # Shared types + re-exports from subsystems
├── schema-types.ts             # Game/Object/Script type definitions
│
├── events/                     # Event System
│   ├── index.ts
│   ├── event-bus.ts            # Type-safe EventBus with channels
│   ├── keyboard.ts             # Keyboard input API
│   ├── mouse.ts                # Mouse click API
│   └── world-events.ts         # Object/player lifecycle events
│
├── input/                      # Input Management
│   ├── index.ts
│   └── input-manager.ts        # Unified input state (keys, movement, jump)
│
├── player/                     # Player System
│   ├── index.ts
│   ├── player-state.ts         # Player position, health, animation
│   ├── inventory.ts            # Inventory management
│   └── motors.ts               # Movement motor controls
│
├── objects/                    # Object System
│   ├── index.ts
│   ├── object-factory.ts       # Object creation with properties
│   ├── object-manager.ts       # CRUD operations
│   └── container-manager.ts    # Container management
│
├── state/                      # State Management
│   ├── index.ts
│   ├── state-manager.ts        # Key-value store
│   └── timer-manager.ts        # Timer scheduling
│
├── gui/                        # GUI System
│   ├── index.ts
│   └── gui-manager.ts          # Text/button overlays
│
├── loop/                       # Game Loop
│   ├── index.ts
│   └── game-loop.ts            # Fixed timestep loop controller
│
├── physics/                    # Physics
│   ├── gravity.ts              # Gravity computation
│   └── player-collision.ts     # Player vs object collision
│
├── animation/                  # Animation
│   └── auto-properties.ts      # Auto-behaviors + player animation
│
├── scripting/                  # Scripting
│   └── api-builder.ts          # GameAPI construction
│
├── utils/                      # Utilities
│   └── helpers.ts              # Pure helper functions
│
├── ecs/                        # NEW: Server-Authoritative ECS Pipeline
│   ├── index.ts                # Pipeline entry point + exports
│   ├── world.ts                # Entity store, component tables
│   ├── components.ts           # Canonical component definitions
│   ├── system.ts               # System definition + scheduler
│   └── systems/                # Fixed-order ECS systems
│       ├── input-intake-system.ts
│       ├── script-command-system.ts
│       ├── animation-system.ts
│       ├── physics-system.ts
│       ├── collision-system.ts
│       ├── lifecycle-system.ts
│       ├── state-commit-system.ts
│       ├── replication-system.ts
│       └── trace-flush-system.ts
│
├── commands/                   # NEW: Command Event System
│   ├── command.ts              # Command definition factory
│   ├── bus.ts                  # Command queue with validation
│   └── router.ts               # Command group routing
│
├── authority/                  # NEW: Server Authority Layer
│   ├── server-sim.ts           # Authoritative world simulation
│   ├── client-view.ts          # Read-only snapshot mirror
│   └── transport.ts            # Network abstraction
│
├── oop/                        # NEW: OOP Facade Layer
│   ├── facade.ts               # Re-exports for API builder
│   └── proxies.ts              # Object proxies -> commands
│
├── trace/                      # NEW: Debug Tracing
│   ├── trace-map.ts            # Command -> system provenance
│   └── error-translator.ts     # ECS errors -> OOP messages
│
└── [Standalone Modules]
    ├── api.ts                  # Emitter, Callable, Tags, Tasks
    ├── compile.ts              # Script → async function factory
    ├── docs.ts                 # DEFAULT_SCRIPT + SCRIPTING_DOCS
    ├── hierarchy.ts            # Parent/child indexing
    ├── tween.ts                # Property tweens
    ├── raycast.ts              # AABB / sphere ray intersection
    ├── collision.ts            # Object-vs-object resolution
    └── network.ts              # Client↔server replication
```

## Architecture Overview

### Core Orchestrator (`game-runtime.ts`)

The `GameRuntime` class in `game-runtime.ts` is the main orchestrator that:
- Initializes all subsystems on construction
- Coordinates the game loop phases
- Provides the unified API surface for scripts

**Important**: `game-runtime.ts` should NOT contain business logic directly. It delegates to the modular subsystems. If you need to add new functionality, create it in the appropriate subsystem module and import it into `game-runtime.ts`.

### Subsystem Pattern

Each subsystem follows this pattern:

```typescript
// subsystem/feature.ts
export interface FeatureState { ... }

export function createFeature(): FeatureState { ... }

export function updateFeature(state: FeatureState, dt: number): void { ... }

// subsystem/index.ts
export * from "./feature";
```

### Type Re-exports

`types.ts` serves as the central type definition file and re-exports types from subsystem modules to avoid circular dependencies:

```typescript
// types.ts re-exports from canonical sources
export { EventBus, type EventChannel } from "./events/event-bus";
export { type KeyboardAPI } from "./events/keyboard";
export { type RuntimeInput } from "./input/input-manager";
// ... etc
```

## Game Loop Phases

`GameRuntime.step(dt)` executes these phases in fixed order:

| Phase | Event | Purpose |
|-------|-------|---------|
| 1 | `input` | Process keyboard/mouse, compute movement vectors |
| 2 | `animation` | Tick tweens, update auto-behaviors |
| 3 | `replication` | Push/pull network state |
| 4 | `physics` | Gravity, movement, collision resolution |
| 5 | `render` | Trigger React re-renders |
| 6 | `update` | Generic per-frame fan-out |

## Adding New Features

### 1. Create the Module

```typescript
// runtime/audio/audio-manager.ts
export interface AudioState {
  sounds: Map<string, AudioBuffer>;
  playing: Set<string>;
}

export function createAudioManager(): AudioState {
  return { sounds: new Map(), playing: new Set() };
}

export function playSound(state: AudioState, id: string): void {
  // Implementation
}
```

### 2. Create Index Export

```typescript
// runtime/audio/index.ts
export * from "./audio-manager";
```

### 3. Wire into GameRuntime

```typescript
// core.ts
import { createAudioManager, type AudioState } from "./audio";

class GameRuntime {
  private audio: AudioState;
  
  constructor() {
    this.audio = createAudioManager();
  }
}
```

### 4. Export from Main Index

```typescript
// runtime/index.ts
export * from "./audio";
```

### 5. Add to GameAPI (if script-accessible)

```typescript
// scripting/api-builder.ts
audio: {
  play: (id: string) => playSound(runtime.audio, id),
}
```

## Performance Considerations

- **Fixed Timestep**: The game loop uses a fixed timestep (default 60 FPS) for consistent physics simulation
- **Event Batching**: Events are batched and processed once per frame
- **Object Pooling**: Consider pooling frequently created/destroyed objects
- **Lazy Initialization**: Subsystems are initialized on-demand where possible

## Debugging

Each module can be tested in isolation. Use the event system to trace execution:

```typescript
runtime.events.on("physics", (dt) => {
  console.log("[v0] Physics phase:", dt);
});
```

---

# Server-Authoritative ECS Pipeline

The runtime uses a server-authoritative ECS (Entity Component System) pipeline as the canonical simulation path. All game state flows through this pipeline with fixed system ordering for deterministic behavior. This architecture is designed for multiplayer-ready games with clean separation between mutation and rendering.

## Pipeline Overview

```
User Code (OOP API)
   ↓ (facade translates calls to intents)
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

## Authority Model

- **Server** (in-process today, real WebSocket later) owns state
- **Clients** only emit Command Events ("intents"); never mutate state directly
- **Server** runs ECS at fixed timestep, commits, then broadcasts snapshots
- **Render** reads the last committed snapshot — no client-side prediction in v1

## Fixed System Order

Systems run in this exact order every tick:

| Order | System | Purpose |
|-------|--------|---------|
| 1 | `InputIntakeSystem` | Drains client input commands |
| 2 | `ScriptCommandSystem` | Drains user-script commands (move, setProp, spawn, destroy, tween) |
| 3 | `AnimationSystem` | Auto-properties, tweens |
| 4 | `PhysicsSystem` | Gravity, motors, velocity integration |
| 5 | `CollisionSystem` | Player↔object, object↔object resolution |
| 6 | `LifecycleSystem` | Spawn/destroy queue flush, parent/child reindex |
| 7 | `StateCommitSystem` | Writes to canonical world snapshot |
| 8 | `ReplicationSystem` | Diff + broadcast snapshot to clients |
| 9 | `TraceFlushSystem` | Finalize per-tick trace records for debugging |

## OOP Facade

The creator-facing API (`obj.position.x = 5`, `game.spawn(...)`, etc.) remains unchanged. Under the hood:

1. **Proxy captures** the call site (via compile.ts source maps)
2. **Emits a Command** with `{ kind, entityId, payload, origin: { script, line } }`
3. **Returns values** consistent with the old API (reads from last committed snapshot)

This means existing scripts work without any changes.

## Usage

```typescript
const runtime = new GameRuntime(snapshot, scripts, username, avatarColor);
runtime.start(); // ECS pipeline is automatically initialized
```

## Component Definitions

```typescript
// ObjectHandle (identity component)
world.set(eid, ObjectHandle, {
  objectId: "unique_id",  // String identifier
  name: "MyObject",       // Display name
});

// Transform (position, rotation, scale)
world.set(eid, Transform, {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

// Velocity
world.set(eid, Velocity, { x: 0, y: 0, z: 0 });

// Visual (rendering properties)
world.set(eid, Visual, {
  color: "#ffffff",
  visible: true,
  transparency: 0,
  primitiveType: "cube",
});

// Physics (collision and motion)
world.set(eid, Physics, {
  anchored: false,
  canCollide: true,
  mass: 1,
  friction: 0.4,
  gravity: false,
});

// AutoBehavior (animation properties)
world.set(eid, AutoBehavior, {
  autoRotateY: 1.5,
  autoBob: { amplitude: 0.5, speed: 1 },
  autoSpin: { x: 0, y: 1, z: 0 },
});
```

## Command Types

Commands are emitted by the OOP facade and processed by the ScriptCommandSystem:

| Group | Commands |
|-------|----------|
| Script | `transform.setPosition`, `transform.setRotation`, `transform.setScale`, `visual.setColor`, `visual.setVisible`, `visual.setTransparency`, `physics.setAnchored`, `physics.setCanCollide`, `physics.setVelocity` |
| Lifecycle | `entity.spawn`, `entity.destroy` |
| Animation | `animation.tween`, `animation.setAutoRotateY`, `animation.setAutoBob`, `animation.setAutoSpin` |
| Input | `input.update` |

## Trace Mapping

Every command carries an `origin` (script name, line number, API path). When a system throws or asserts:

1. `error-translator.ts` looks up the originating command
2. Rewrites the stack as `[ScriptName:line] Object.position.set: ...`
3. Uses OOP vocabulary — ECS terms never leak to creators

## Architecture Benefits

The ECS architecture provides several benefits for scaling:

1. **Deterministic simulation** - Fixed system order ensures consistent behavior across clients
2. **Network-ready** - Server-authoritative model means adding real multiplayer only requires implementing the transport layer
3. **Cache-friendly** - Component data is stored in contiguous arrays for better CPU cache utilization
4. **Easy debugging** - Command tracing maps all mutations back to their source
5. **Parallel-ready** - Systems can be parallelized since they operate on independent component queries

## Future Work

- Real network transport (WebSocket/WebRTC) — still in-process via `network.ts`
- Client-side prediction & reconciliation — deferred
- Rollback netcode / lag compensation
