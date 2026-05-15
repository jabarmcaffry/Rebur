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

### Core Orchestrator (`core.ts`)

The `GameRuntime` class in `core.ts` is the main orchestrator that:
- Initializes all subsystems on construction
- Coordinates the game loop phases
- Provides the unified API surface for scripts

**Important**: `core.ts` should NOT contain business logic directly. It delegates to the modular subsystems. If you need to add new functionality, create it in the appropriate subsystem module and import it into `core.ts`.

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
