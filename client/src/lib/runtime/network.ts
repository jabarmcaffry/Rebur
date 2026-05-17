/**
 * Local stub for a server-authoritative replication model.
 *
 * In production this would split across a dedicated server process and clients
 * over WebSockets. For single-player / local play we run BOTH halves in the
 * same process and route messages through an in-process bus. The script API
 * is identical to what a real network would expose, so authors write code
 * once and it Just Works when a real transport is plugged in.
 *
 * Replication direction:
 *   server -> client : world snapshots (positions, rotations, velocities,
 *                      animations, simple state map)
 *   client -> server : input messages (move axes, jump, action buttons)
 *
 * Both sides also expose `broadcast` / `send` / `on` for custom channels.
 */
import type { RuntimeObject, RuntimePlayer, Vec3 } from "./types";

export type NetSnapshot = {
  t: number;
  player: { position: Vec3; rotation: Vec3; velocity: Vec3; health: number };
  objects: Array<{
    id: string;
    name: string;
    position: Vec3;
    rotation: Vec3;
    velocity: Vec3;
    visible: boolean;
    transparency: number;
  }>;
};

export type NetInput = {
  t: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  keys: Record<string, boolean>;
};

type Listener = (payload: any) => void;

class Channel {
  private subs = new Set<Listener>();
  on(fn: Listener): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  off(fn: Listener) { this.subs.delete(fn); }
  emit(payload: any) {
    for (const fn of Array.from(this.subs)) {
      try { fn(payload); } catch { /* swallow */ }
    }
  }
  clear() { this.subs.clear(); }
}

class Side {
  private channels = new Map<string, Channel>();
  private chan(name: string) {
    let c = this.channels.get(name);
    if (!c) { c = new Channel(); this.channels.set(name, c); }
    return c;
  }
  on(channel: string, fn: Listener) { return this.chan(channel).on(fn); }
  off(channel: string, fn: Listener) { this.chan(channel).off(fn); }
  emit(channel: string, payload: any) { this.chan(channel).emit(payload); }
  clear() { for (const c of this.channels.values()) c.clear(); this.channels.clear(); }
}

export class NetworkBus {
  /** Always true locally — both halves live in the same process. */
  isServer = true;
  isClient = true;

  /** Ticks per second the server emits world snapshots at. */
  snapshotHz = 20;
  private _accum = 0;

  private _serverSide = new Side();
  private _clientSide = new Side();

  /** Server-facing API. `broadcast` reaches every client; `on` listens to
   *  messages a client sent up. */
  server = {
    broadcast: (channel: string, payload: any) => this._clientSide.emit(channel, payload),
    on: (channel: string, fn: Listener) => this._serverSide.on(channel, fn),
    off: (channel: string, fn: Listener) => this._serverSide.off(channel, fn),
  };

  /** Client-facing API. `send` goes up to the server; `on` listens to
   *  broadcasts coming down. */
  client = {
    send: (channel: string, payload: any) => this._serverSide.emit(channel, payload),
    on: (channel: string, fn: Listener) => this._clientSide.on(channel, fn),
    off: (channel: string, fn: Listener) => this._clientSide.off(channel, fn),
  };

  /** Called by the engine each frame in the REPLICATION phase. */
  step(
    dt: number,
    player: RuntimePlayer,
    objects: RuntimeObject[],
    inputSnapshot: NetInput
  ) {
    // Client -> Server : push current input state every frame.
    this._serverSide.emit("__input", inputSnapshot);

    // Server -> Client : throttle world snapshots.
    this._accum += dt;
    const interval = 1 / Math.max(1, this.snapshotHz);
    if (this._accum < interval) return;
    this._accum = 0;

    const snap: NetSnapshot = {
      t: performance.now(),
      player: {
        position: { ...player.position },
        rotation: { ...player.rotation },
        velocity: { ...player.velocity },
        health: player.health,
      },
      objects: objects
        .filter((o) => o.container === "Workspace")
        .map((o) => ({
          id: o.id,
          name: o.name,
          position: { ...o.position },
          rotation: { ...o.rotation },
          velocity: { ...o.velocity },
          visible: o.visible,
          transparency: o.transparency,
        })),
    };
    this._clientSide.emit("__snapshot", snap);
  }

  clear() {
    this._serverSide.clear();
    this._clientSide.clear();
  }
}
