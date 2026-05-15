/**
 * CommandBus — enqueue intents during a tick, drain in fixed order on the
 * next tick. Grouping lets routers fan commands out to specific systems
 * without each system iterating every command.
 */
import type { Command } from "./command";

export type CommandValidator = (cmd: Command) => true | string;

export class CommandBus {
  /** Pending commands for the NEXT tick, bucketed by group. */
  private pending = new Map<string, Command[]>();
  /** Currently-draining bucket — systems read from here. */
  private active = new Map<string, Command[]>();
  /** Per-group validators (server-authority guard). */
  private validators = new Map<string, CommandValidator[]>();
  /** Per-issuer rate cap (commands per second). */
  private rateCap = 240;
  private rateCounters = new Map<string, { tokens: number; lastRefillMs: number }>();

  setRateCap(perSecond: number) {
    this.rateCap = perSecond;
  }

  addValidator(group: string, fn: CommandValidator) {
    let arr = this.validators.get(group);
    if (!arr) {
      arr = [];
      this.validators.set(group, arr);
    }
    arr.push(fn);
  }

  /** Server-side enqueue. Returns null if rejected (with reason on the command). */
  enqueue(cmd: Command): string | null {
    if (cmd.issuedBy && !this.checkRate(cmd.issuedBy)) {
      return "rate-limited";
    }
    const validators = this.validators.get(cmd.group ?? cmd.kind);
    if (validators) {
      for (const v of validators) {
        const r = v(cmd);
        if (r !== true) return r;
      }
    }
    const group = cmd.group ?? cmd.kind;
    let arr = this.pending.get(group);
    if (!arr) {
      arr = [];
      this.pending.set(group, arr);
    }
    arr.push(cmd);
    return null;
  }

  /** Called by the scheduler at the start of each tick. */
  beginTick(): void {
    this.active = this.pending;
    this.pending = new Map();
  }

  drain(group: string): readonly Command[] {
    return this.active.get(group) ?? [];
  }

  /** All commands this tick, useful for the trace map. */
  *allActive(): IterableIterator<Command> {
    for (const arr of this.active.values()) for (const c of arr) yield c;
  }

  private checkRate(issuer: string): boolean {
    const now = performance.now();
    let s = this.rateCounters.get(issuer);
    if (!s) {
      s = { tokens: this.rateCap, lastRefillMs: now };
      this.rateCounters.set(issuer, s);
    }
    const elapsed = (now - s.lastRefillMs) / 1000;
    s.tokens = Math.min(this.rateCap, s.tokens + elapsed * this.rateCap);
    s.lastRefillMs = now;
    if (s.tokens < 1) return false;
    s.tokens -= 1;
    return true;
  }
}
