/**
 * Public entry for the server-authoritative ECS pipeline.
 *
 * This is now the canonical simulation path. All game state flows through
 * the ECS pipeline with fixed system ordering for deterministic behavior.
 * The legacy mutation paths have been removed.
 */
export { World, defineComponent, type EntityId, type ComponentDef } from "./world";
export { defineSystem, Scheduler, type SystemDef, type SystemContext } from "./system";
export * from "./components";

// Systems - in fixed execution order
export { InputIntakeSystem, InputState, type InputCommandPayload } from "./systems/input-intake-system";
export { ScriptCommandSystem } from "./systems/script-command-system";
export { AnimationSystem } from "./systems/animation-system";
export { PhysicsSystem, WorldPhysics, PlayerPhysics } from "./systems/physics-system";
export { CollisionSystem, CollisionState, CollisionEvents, CollisionCategory } from "./systems/collision-system";
export { LifecycleSystem, LifecycleQueue, Hierarchy, PendingDestroy } from "./systems/lifecycle-system";
export { StateCommitSystem, WorldSnapshot, type EntitySnapshot } from "./systems/state-commit-system";
export { ReplicationSystem, NetworkOutput, getLatestSnapshot, type SerializedSnapshot } from "./systems/replication-system";
export { TraceFlushSystem } from "./systems/trace-flush-system";

import { ServerSim } from "../authority/server-sim";
import { ClientView } from "../authority/client-view";
import { Transport } from "../authority/transport";

// Import all systems for pipeline creation
import { InputIntakeSystem } from "./systems/input-intake-system";
import { ScriptCommandSystem } from "./systems/script-command-system";
import { AnimationSystem } from "./systems/animation-system";
import { PhysicsSystem } from "./systems/physics-system";
import { CollisionSystem } from "./systems/collision-system";
import { LifecycleSystem } from "./systems/lifecycle-system";
import { StateCommitSystem } from "./systems/state-commit-system";
import { ReplicationSystem } from "./systems/replication-system";
import { TraceFlushSystem } from "./systems/trace-flush-system";

export interface PipelineHandles {
  server: ServerSim;
  client: ClientView;
  transport: Transport;
}

/**
 * Fixed system order per the plan:
 * 1. InputIntakeSystem - drains client input commands
 * 2. ScriptCommandSystem - drains user-script commands
 * 3. AnimationSystem - auto-properties, tweens
 * 4. PhysicsSystem - gravity, motors, integration
 * 5. CollisionSystem - player↔object, object↔object
 * 6. LifecycleSystem - spawn/destroy queue flush
 * 7. StateCommitSystem - writes to canonical snapshot
 * 8. ReplicationSystem - diff + broadcast snapshot
 * 9. TraceFlushSystem - finalize per-tick trace records
 */
const FIXED_SYSTEM_ORDER = [
  InputIntakeSystem,
  ScriptCommandSystem,
  AnimationSystem,
  PhysicsSystem,
  CollisionSystem,
  LifecycleSystem,
  StateCommitSystem,
  ReplicationSystem,
  TraceFlushSystem,
];

/** Boots the new pipeline with all systems in fixed order. */
export function createPipeline(): PipelineHandles {
  const server = new ServerSim({
    systems: FIXED_SYSTEM_ORDER,
  });
  const client = new ClientView();
  const transport = new Transport();
  return { server, client, transport };
}

export { ServerSim, ClientView, Transport };
export { CommandBus } from "../commands/bus";
export { defineCommand, type Command, type CommandOrigin } from "../commands/command";
export { CommandGroups } from "../commands/router";
export { TraceMap } from "../trace/trace-map";
export { translateError } from "../trace/error-translator";
export { createObjectProxy } from "../oop/proxies";
