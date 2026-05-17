# Hello Helper - Game Engine

A browser-based 3D game engine with a visual editor, built with React, Three.js, and TypeScript.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 8
- **3D Rendering**: Three.js, React Three Fiber, React Three Drei
- **UI Components**: Radix UI, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, WebSocket (ws)
- **Database**: Drizzle ORM with Neon PostgreSQL
- **Code Editor**: Monaco Editor

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Environment Variables

Create a `.env` file with:

```env
DATABASE_URL=your_neon_database_url
SESSION_SECRET=your_session_secret
```

## Project Structure

```
hello-helper/
├── client/                    # Frontend application
│   └── src/
│       ├── components/        # React components
│       │   └── play/          # Game runtime components
│       ├── lib/
│       │   └── runtime/       # Game engine runtime (see below)
│       └── pages/             # Application pages
├── server/                    # Express backend
├── shared/                    # Shared types and schemas
└── dist/                      # Production build output
```

## Game Engine Architecture

The game engine runtime is located in `client/src/lib/runtime/` and follows a modular architecture for maintainability and scalability.

### Core Architecture

| Module | Purpose |
|--------|---------|
| `core.ts` | Main `GameRuntime` orchestrator class - coordinates all subsystems |
| `types.ts` | Shared type definitions and re-exports from subsystem modules |
| `index.ts` | Public API exports |

### Subsystem Modules

| Directory | Module | Purpose |
|-----------|--------|---------|
| `events/` | `event-bus.ts` | Type-safe event system with channels |
| `events/` | `keyboard.ts` | Keyboard input handling and key state |
| `events/` | `mouse.ts` | Mouse click and interaction handling |
| `events/` | `world-events.ts` | Object/player lifecycle events |
| `input/` | `input-manager.ts` | Unified input state management |
| `player/` | `player-state.ts` | Player position, health, animation state |
| `player/` | `inventory.ts` | Player inventory system |
| `player/` | `motors.ts` | Movement motor controls |
| `objects/` | `object-factory.ts` | Object creation and property management |
| `objects/` | `object-manager.ts` | Object CRUD operations |
| `objects/` | `container-manager.ts` | Container (Workspace, Lighting, etc.) management |
| `state/` | `state-manager.ts` | Key-value state store |
| `state/` | `timer-manager.ts` | Timer and scheduling system |
| `gui/` | `gui-manager.ts` | GUI text/button overlays |
| `loop/` | `game-loop.ts` | Fixed timestep game loop with phase management |
| `physics/` | `gravity.ts` | Gravity computation |
| `physics/` | `player-collision.ts` | Player vs object collision resolution |
| `animation/` | `auto-properties.ts` | Auto-properties and animation state |
| `scripting/` | `api-builder.ts` | Script API construction |

### Utility Modules

| Module | Purpose |
|--------|---------|
| `api.ts` | Emitter, Callable, Tags, Tasks utilities |
| `compile.ts` | Script compilation to async functions |
| `docs.ts` | Default script templates and documentation |
| `hierarchy.ts` | Parent/child object indexing |
| `tween.ts` | Property interpolation |
| `raycast.ts` | Ray intersection testing |
| `collision.ts` | Object-vs-object collision |
| `network.ts` | Client-server replication |

### Game Loop Phases

The `GameRuntime.step(dt)` method runs these phases in order each frame:

1. **Input** - Process keyboard/mouse events, compute camera-relative movement
2. **Animation** - Update tweens and auto-behaviors
3. **Replication** - Sync state between client and server
4. **Physics** - Apply gravity, movement, resolve collisions
5. **Render** - Trigger React re-renders from runtime state
6. **Update** - Generic per-frame event dispatch

### Importing the Runtime

All runtime functionality is exported from `@/lib/runtime`:

```typescript
import { 
  GameRuntime,           // Main orchestrator class
  type RuntimeObject,    // Object type
  type RuntimePlayer,    // Player type
  EventBus,              // Event system
  // ... other exports
} from "@/lib/runtime";
```

### Adding New Subsystems

1. Create a new module in the appropriate directory (e.g., `runtime/audio/audio-manager.ts`)
2. Export from the directory's `index.ts`
3. Import and wire in `GameRuntime` constructor in `core.ts`
4. Hook into the appropriate game loop phase
5. Expose via `GameAPI` in `scripting/api-builder.ts`
6. Document in `docs.ts`

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server with HMR |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm check` | Run TypeScript type checking |
| `pnpm db:push` | Push database schema changes |

## License

MIT
