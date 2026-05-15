/**
 * Public entry for the new server-authoritative ECS pipeline.
 *
 * The legacy mutation-style runtime in `core.ts` / `game-runtime.ts` is still
 * the default. Set `runtime.useEcsPipeline = true` to opt a game into the
 * new path. We'll flip the default once Physics + Collision + Lifecycle have
 * also been ported (see plan, steps 4-5).
 */
export { World, defineComponent, type EntityId, type ComponentDef } from "./world";
export { defineSystem, Scheduler, type SystemDef, type SystemContext } from "./system";
export * from "./components";
export { AnimationSystem } from "./systems/animation-system";
export { ScriptCommandSystem } from "./systems/script-command-system";

import { ServerSim } from "../authority/server-sim";
import { ClientView } from "../authority/client-view";
import { Transport } from "../authority/transport";
import { AnimationSystem } from "./systems/animation-system";
import { ScriptCommandSystem } from "./systems/script-command-system";

export interface PipelineHandles {
  server: ServerSim;
  client: ClientView;
  transport: Transport;
}

/** Boots the new pipeline with the currently-ported systems. */
export function createPipeline(): PipelineHandles {
  const server = new ServerSim({
    // Order: input → script commands → animation → … (future systems append).
    systems: [ScriptCommandSystem, AnimationSystem],
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
