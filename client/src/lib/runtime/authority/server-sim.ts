/**
 * ServerSim — the authoritative half. Owns the World, runs the Scheduler at a
 * fixed timestep, and produces snapshots for the client view + network bus.
 *
 * In single-player this lives in the same process as the client (see
 * `network.ts`). When real multiplayer lands it will move behind a transport
 * but its API stays identical.
 */
import { World } from "../ecs/world";
import { Scheduler, type SystemDef } from "../ecs/system";
import { CommandBus } from "../commands/bus";
import { TraceMap } from "../trace/trace-map";

export interface ServerSimOptions {
  systems: readonly SystemDef[];
  /** Server tick rate, default 60 Hz. */
  hz?: number;
}

export interface ServerSnapshot {
  tick: number;
  /** entity id -> serializable component bag */
  entities: Record<number, Record<string, unknown>>;
}

export class ServerSim {
  readonly world = new World();
  readonly commands = new CommandBus();
  readonly trace = new TraceMap();
  private scheduler: Scheduler;
  private tick = 0;
  private hz: number;
  private accum = 0;

  constructor(opts: ServerSimOptions) {
    this.scheduler = new Scheduler(opts.systems);
    this.hz = opts.hz ?? 60;
  }

  /** Drive from the host loop. Steps the sim 0..N times per call. */
  step(realDt: number): void {
    const fixed = 1 / this.hz;
    this.accum += realDt;
    // Cap to avoid spiral-of-death on a paused tab.
    if (this.accum > 0.25) this.accum = 0.25;
    while (this.accum >= fixed) {
      this.accum -= fixed;
      this.tick++;
      this.trace.beginTick(this.tick);
      this.commands.beginTick();
      this.scheduler.run({
        world: this.world,
        commands: this.commands,
        trace: this.trace,
        dt: fixed,
        tick: this.tick,
        isServer: true,
      });
    }
  }
}
