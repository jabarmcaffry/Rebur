/**
 * System definition + scheduler. Fixed deterministic order; no buffering frames.
 */
import type { World } from "./world";
import type { CommandBus } from "../commands/bus";
import type { TraceMap } from "../trace/trace-map";

export interface SystemContext {
  world: World;
  commands: CommandBus;
  trace: TraceMap;
  dt: number;
  tick: number;
  /** Authoritative side only — clients run a read-only view system set. */
  isServer: boolean;
}

export interface SystemDef {
  readonly id: string;
  /** Other system ids that must run before this one. */
  readonly after?: readonly string[];
  /** Run on which side. Default: "server". */
  readonly side?: "server" | "client" | "both";
  run(ctx: SystemContext): void;
}

export function defineSystem(def: SystemDef): SystemDef {
  return def;
}

export class Scheduler {
  private order: SystemDef[] = [];

  constructor(systems: readonly SystemDef[]) {
    this.order = topoSort(systems);
  }

  run(ctx: SystemContext): void {
    for (const s of this.order) {
      if (s.side && s.side !== "both" && (s.side === "server") !== ctx.isServer) continue;
      try {
        ctx.trace.beginSystem(s.id);
        s.run(ctx);
      } finally {
        ctx.trace.endSystem();
      }
    }
  }
}

function topoSort(systems: readonly SystemDef[]): SystemDef[] {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const out: SystemDef[] = [];
  const visiting = new Set<string>();
  const visit = (s: SystemDef) => {
    if (visited.has(s.id)) return;
    if (visiting.has(s.id)) throw new Error(`ECS scheduler: cycle at ${s.id}`);
    visiting.add(s.id);
    for (const dep of s.after ?? []) {
      const d = byId.get(dep);
      if (d) visit(d);
    }
    visiting.delete(s.id);
    visited.add(s.id);
    out.push(s);
  };
  for (const s of systems) visit(s);
  return out;
}
