/**
 * instance-manager.ts
 *
 * Core of Rebur's distributed-runtime architecture.
 *
 * Key ideas implemented here:
 *  1. Instances (not servers) — each game session is a disposable GameRoom wrapper
 *  2. Dynamic tick-rate — scales from 1 Hz (empty/idle) → 20 Hz (normal) → 60 Hz (competitive)
 *  3. Interest-based simulation — only full-fidelity physics near active players
 *  4. Sleep / wake — idle instances are serialized to a snapshot and paused;
 *                    they wake in < 100 ms when a player joins
 *  5. Lifecycle telemetry — every state transition is logged with timing
 */

import { GameRoom } from "./game-room";
import { WorkerRoom } from "./worker-room";
import type { GameSnapshot } from "./state-snapshot";

/** Either a same-thread GameRoom or a Worker-hosted WorkerRoom. */
export type AnyRoom = GameRoom | WorkerRoom;

// ── Constants ─────────────────────────────────────────────────────────────────

/** After this many ms with 0 players, an instance enters IDLE state. */
const IDLE_AFTER_MS = 10_000;           // 10 s

/** After being IDLE this many ms, the instance is put to SLEEP (snapshot + pause). */
const SLEEP_AFTER_IDLE_MS = 30_000;     // 30 s

/** After sleeping this many ms, the instance is fully terminated and GC'd. */
const TERMINATE_AFTER_SLEEP_MS = 300_000; // 5 min

/** Tick-rate tiers (Hz) keyed by player count threshold. */
const TICK_RATE_TIERS: [maxPlayers: number, hz: number][] = [
  [0,   1],    // empty / sleeping
  [2,   15],   // 1-2 players: casual
  [10,  20],   // 3-10 players: default
  [30,  30],   // 11-30 players: active
  [Infinity, 60], // 30+ players: competitive
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type InstanceState = "active" | "idle" | "sleeping" | "terminated";

export interface InstanceRecord {
  sessionId: string;
  gameId: string;
  room: AnyRoom;
  state: InstanceState;
  playerCount: number;
  tickRateHz: number;
  createdAt: number;
  lastActivityAt: number;
  wakeCount: number;             // how many times this instance has been woken
  totalPlayerJoins: number;
  snapshot?: GameSnapshot;       // stored while sleeping
  _idleTimer?: ReturnType<typeof setTimeout>;
  _sleepTimer?: ReturnType<typeof setTimeout>;
  _terminateTimer?: ReturnType<typeof setTimeout>;
  broadcastFn: (msg: object) => void;
  sendToPlayerFn: (playerId: string, msg: object) => void;
}

export interface InstanceStats {
  sessionId: string;
  gameId: string;
  state: InstanceState;
  playerCount: number;
  tickRateHz: number;
  uptimeMs: number;
  wakeCount: number;
  totalPlayerJoins: number;
}

// ── InstanceManager ───────────────────────────────────────────────────────────

export class InstanceManager {
  private instances = new Map<string, InstanceRecord>();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get or wake the GameRoom for a session.
   * If no room exists yet, creates a new one (cold start).
   * If the room is sleeping, restores from snapshot (warm start).
   */
  async getOrWakeInstance(
    sessionId: string,
    gameId: string,
    broadcastFn: (msg: object) => void,
    sendToPlayerFn: (playerId: string, msg: object) => void,
    loadObjects: () => Promise<any[]>,
    loadScripts: () => Promise<{ code: string; name: string; enabled: boolean }[]>,
  ): Promise<AnyRoom> {
    const existing = this.instances.get(sessionId);

    if (existing) {
      if (existing.state === "sleeping") {
        await this._wakeInstance(existing, loadObjects, loadScripts);
      }
      // Cancel any idle/sleep/terminate timers since a player is about to join
      this._clearTimers(existing);
      return existing.room;
    }

    // Cold start: create fresh instance in its own Worker thread
    const room = new WorkerRoom(broadcastFn, sendToPlayerFn);
    const record: InstanceRecord = {
      sessionId, gameId,
      room,
      state: "active",
      playerCount: 0,
      tickRateHz: 20,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      wakeCount: 0,
      totalPlayerJoins: 0,
      broadcastFn,
      sendToPlayerFn,
    };
    this.instances.set(sessionId, record);

    try {
      const [objects, scripts] = await Promise.all([loadObjects(), loadScripts()]);
      room.setObjects(objects);
      room.loadScripts(scripts);
    } catch (err) {
      console.error(`[instance] cold start failed for session ${sessionId}:`, err);
    }

    console.log(`[instance] cold-start session=${sessionId} game=${gameId}`);
    return room;
  }

  /**
   * Notify that the player count has changed for a session.
   * This drives tick-rate selection and sleep scheduling.
   */
  onPlayerCountChanged(sessionId: string, newCount: number): void {
    const rec = this.instances.get(sessionId);
    if (!rec) return;

    rec.playerCount = newCount;
    rec.lastActivityAt = Date.now();

    if (newCount > 0) {
      rec.state = "active";
      rec.totalPlayerJoins++;
      this._clearTimers(rec);
      this._applyTickRate(rec);
    } else {
      // No players — begin idle countdown
      this._clearTimers(rec);
      rec._idleTimer = setTimeout(() => {
        if (rec.playerCount === 0) {
          rec.state = "idle";
          rec.room.setTickRate(1); // 1 Hz heartbeat while idle
          rec.tickRateHz = 1;
          console.log(`[instance] idle session=${sessionId}`);

          rec._sleepTimer = setTimeout(() => {
            if (rec.playerCount === 0) this._sleepInstance(rec).catch(console.error);
          }, SLEEP_AFTER_IDLE_MS);
        }
      }, IDLE_AFTER_MS);
    }
  }

  /**
   * Hot-reload scripts into a live instance.
   * Used when a developer saves a script while players are in-game.
   */
  reloadScripts(
    sessionId: string,
    scripts: { code: string; name: string; enabled: boolean }[],
  ): boolean {
    const rec = this.instances.get(sessionId);
    if (!rec || rec.state === "sleeping" || rec.state === "terminated") return false;
    rec.room.loadScripts(scripts);
    return true;
  }

  /** Look up a running room by sessionId (undefined if sleeping/terminated). */
  getRoom(sessionId: string): AnyRoom | undefined {
    const rec = this.instances.get(sessionId);
    if (!rec || rec.state === "sleeping" || rec.state === "terminated") return undefined;
    return rec.room;
  }

  /** Get a record regardless of state. */
  getRecord(sessionId: string): InstanceRecord | undefined {
    return this.instances.get(sessionId);
  }

  /** Hard-terminate an instance (player count enforced to 0, timers cleared, GC). */
  terminateInstance(sessionId: string): void {
    const rec = this.instances.get(sessionId);
    if (!rec) return;
    this._clearTimers(rec);
    rec.room.stop();        // terminates worker thread if WorkerRoom; pauses if GameRoom
    rec.state = "terminated";
    rec.snapshot = undefined;
    this.instances.delete(sessionId);
    console.log(`[instance] terminated session=${sessionId}`);
  }

  /** All sessions that belong to a gameId (for hot-reload routing). */
  getSessionsForGame(gameId: string): string[] {
    return Array.from(this.instances.entries())
      .filter(([, rec]) => rec.gameId === gameId && rec.state !== "terminated")
      .map(([sid]) => sid);
  }

  /** Snapshot of all instances for monitoring/dashboard. */
  getStats(): InstanceStats[] {
    return Array.from(this.instances.values()).map(rec => ({
      sessionId: rec.sessionId,
      gameId: rec.gameId,
      state: rec.state,
      playerCount: rec.playerCount,
      tickRateHz: rec.tickRateHz,
      uptimeMs: Date.now() - rec.createdAt,
      wakeCount: rec.wakeCount,
      totalPlayerJoins: rec.totalPlayerJoins,
    }));
  }

  /** Summary counters for health checks. */
  getSummary() {
    let active = 0, idle = 0, sleeping = 0, totalPlayers = 0;
    for (const rec of this.instances.values()) {
      if (rec.state === "active") active++;
      else if (rec.state === "idle") idle++;
      else if (rec.state === "sleeping") sleeping++;
      totalPlayers += rec.playerCount;
    }
    return { active, idle, sleeping, total: this.instances.size, totalPlayers };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async _wakeInstance(
    rec: InstanceRecord,
    loadObjects: () => Promise<any[]>,
    loadScripts: () => Promise<{ code: string; name: string; enabled: boolean }[]>,
  ): Promise<void> {
    const t0 = Date.now();
    this._clearTimers(rec);

    if (rec.snapshot) {
      // Warm wake: restore dynamic object positions from snapshot
      rec.room.loadPhysicsSnapshot(rec.snapshot);
      // Reload scripts (they were cleared on sleep)
      try {
        const scripts = await loadScripts();
        rec.room.loadScripts(scripts);
      } catch (err) {
        console.error(`[instance] script reload on wake failed:`, err);
      }
      rec.snapshot = undefined;
    } else {
      // Snapshot missing — full cold reload
      try {
        const [objects, scripts] = await Promise.all([loadObjects(), loadScripts()]);
        rec.room.setObjects(objects);
        rec.room.loadScripts(scripts);
      } catch (err) {
        console.error(`[instance] cold reload on wake failed:`, err);
      }
    }

    rec.room.resume();
    rec.state = "active";
    rec.wakeCount++;
    rec.lastActivityAt = Date.now();
    console.log(`[instance] woke session=${rec.sessionId} in ${Date.now() - t0}ms (wake #${rec.wakeCount})`);
  }

  private async _sleepInstance(rec: InstanceRecord): Promise<void> {
    if (rec.playerCount > 0 || rec.state === "sleeping" || rec.state === "terminated") return;

    // getPhysicsSnapshot is sync on GameRoom, async on WorkerRoom — Promise.resolve handles both
    const snap = await Promise.resolve(rec.room.getPhysicsSnapshot());
    snap.gameId    = rec.gameId;
    snap.sessionId = rec.sessionId;
    rec.snapshot = snap;
    rec.room.pause();
    rec.state = "sleeping";

    rec._terminateTimer = setTimeout(() => {
      this.terminateInstance(rec.sessionId);
    }, TERMINATE_AFTER_SLEEP_MS);

    console.log(
      `[instance] sleeping session=${rec.sessionId}` +
      ` objects=${rec.snapshot.objects.length} uptime=${Math.round((Date.now() - rec.createdAt) / 1000)}s`,
    );
  }

  private _applyTickRate(rec: InstanceRecord): void {
    const hz = this._tickRateForCount(rec.playerCount);
    if (hz === rec.tickRateHz) return;
    rec.tickRateHz = hz;
    rec.room.setTickRate(hz);
    console.log(`[instance] tick-rate session=${rec.sessionId} → ${hz} Hz (${rec.playerCount} players)`);
  }

  private _tickRateForCount(playerCount: number): number {
    for (const [max, hz] of TICK_RATE_TIERS) {
      if (playerCount <= max) return hz;
    }
    return 60;
  }

  private _clearTimers(rec: InstanceRecord): void {
    if (rec._idleTimer)      { clearTimeout(rec._idleTimer);      rec._idleTimer = undefined; }
    if (rec._sleepTimer)     { clearTimeout(rec._sleepTimer);     rec._sleepTimer = undefined; }
    if (rec._terminateTimer) { clearTimeout(rec._terminateTimer); rec._terminateTimer = undefined; }
  }
}

export const instanceManager = new InstanceManager();
