/**
 * TraceMap — links every component write back to the originating Command and
 * (transitively) the user script line that produced it. Errors thrown inside
 * systems are rewritten so creators see OOP-flavored messages instead of ECS
 * jargon.
 */
import type { Command, CommandOrigin } from "../commands/command";

export interface TraceRecord {
  tick: number;
  systemId: string;
  commandId?: number;
  origin?: CommandOrigin;
  message: string;
}

export class TraceMap {
  private current: { systemId: string; commandId?: number; origin?: CommandOrigin } | null = null;
  private records: TraceRecord[] = [];
  private tick = 0;
  enabled = true;

  beginTick(tick: number) {
    this.tick = tick;
  }

  beginSystem(systemId: string) {
    this.current = { systemId };
  }

  endSystem() {
    this.current = null;
  }

  withCommand<T>(cmd: Command, fn: () => T): T {
    const prev = this.current;
    this.current = {
      systemId: prev?.systemId ?? "unknown",
      commandId: cmd.id,
      origin: cmd.origin,
    };
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  }

  log(message: string) {
    if (!this.enabled) return;
    this.records.push({
      tick: this.tick,
      systemId: this.current?.systemId ?? "unknown",
      commandId: this.current?.commandId,
      origin: this.current?.origin,
      message,
    });
  }

  /** Retrieve and clear records — for the dev overlay. */
  flush(): TraceRecord[] {
    const out = this.records;
    this.records = [];
    return out;
  }

  currentOrigin(): CommandOrigin | undefined {
    return this.current?.origin;
  }
}
