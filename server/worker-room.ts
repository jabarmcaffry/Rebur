/**
 * worker-room.ts — Main-thread proxy for a GameRoom running in a Worker thread.
 *
 * WorkerRoom has the same public API as GameRoom but forwards every call to a
 * Worker thread via postMessage.  The main thread never blocks:
 *  - Fire-and-forget calls (addPlayer, applyInput, …) just postMessage.
 *  - getSnapshot / getSpawnPoint / getPlayerRender return cached values that
 *    the worker keeps fresh through worldState / spawnPoint / playerRender
 *    messages sent back each tick.
 *  - getPhysicsSnapshot is genuinely async (returns Promise<GameSnapshot>)
 *    because it is only called from already-async code paths.
 *
 * Build strategy: tsx's IPC pipe cannot cross Worker thread boundaries, so we
 * use esbuild (already a project dep) to compile game-room-worker.ts into a
 * plain .mjs bundle once at startup.  The Worker runs from compiled JS —
 * no special execArgv / tsx flags needed.
 */

import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { buildSync } from "esbuild";
import type { RenderState, RenderPlayer } from "@shared/render-types";
import type { GameSnapshot } from "./state-snapshot";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── WorkerRoom ────────────────────────────────────────────────────────────────

export class WorkerRoom {
  private readonly worker: Worker;
  private _playerCount = 0;

  // Cached from worker messages (kept fresh every tick)
  private cachedSpawnPoint = { x: 0, y: 1.5, z: 0 };
  private cachedSnapshots   = new Map<string, RenderState>();
  private cachedPlayerRenders = new Map<string, RenderPlayer>();

  // Pending async requests (getPhysicsSnapshot)
  private pendingRequests = new Map<string, (data: any) => void>();
  private reqCounter = 0;

  // ── Build cache ─────────────────────────────────────────────────────────────

  /** Path to the last compiled .mjs bundle for game-room-worker.ts. */
  private static _compiledPath: string | null = null;

  /**
   * Compile game-room-worker.ts (TypeScript) to a self-contained .mjs bundle
   * using esbuild the first time it is called; return the compiled path on
   * subsequent calls (compile-once per process).
   */
  private static _ensureCompiled(tsSrcPath: string): string {
    if (WorkerRoom._compiledPath) return WorkerRoom._compiledPath;

    const outPath = path.join(os.tmpdir(), "rebur-game-room-worker.mjs");
    buildSync({
      entryPoints: [tsSrcPath],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: outPath,
      packages: "external",   // keep node_modules imports external
      logLevel: "silent",
    });

    WorkerRoom._compiledPath = outPath;
    return outPath;
  }

  constructor(
    broadcastFn:    (msg: object) => void,
    sendToPlayerFn: (playerId: string, msg: object) => void,
  ) {
    // Compile the TypeScript worker to a plain ESM bundle at startup so the
    // Worker thread can load it without any tsx / --import tricks.
    const workerCompiledPath = WorkerRoom._ensureCompiled(
      path.resolve(__dirname, "game-room-worker.ts"),
    );

    this.worker = new Worker(workerCompiledPath);

    this.worker.on("message", (msg: any) => {
      switch (msg.type) {
        case "broadcast":
          // Cache worldState per-player so getSnapshot() is always fresh
          if (msg.msg?.type === "worldState") {
            const state = msg.msg.state as RenderState;
            if (state?.localPlayerId) {
              this.cachedSnapshots.set(state.localPlayerId, state);
            }
          }
          broadcastFn(msg.msg);
          break;

        case "sendToPlayer":
          if (msg.msg?.type === "worldState") {
            const state = msg.msg.state as RenderState;
            if (state?.localPlayerId) {
              this.cachedSnapshots.set(state.localPlayerId, state);
            }
          }
          sendToPlayerFn(msg.playerId, msg.msg);
          break;

        case "spawnPoint":
          this.cachedSpawnPoint = msg.point;
          break;

        case "playerRender":
          this.cachedPlayerRenders.set(msg.playerId, msg.render as RenderPlayer);
          break;

        case "physicsSnapshot": {
          const resolve = this.pendingRequests.get(msg.requestId);
          if (resolve) {
            resolve(msg.snap);
            this.pendingRequests.delete(msg.requestId);
          }
          break;
        }

        case "workerError":
          console.error("[WorkerRoom] script error in worker:", msg.error);
          break;
      }
    });

    this.worker.on("error", (err) => {
      console.error("[WorkerRoom] worker thread crashed:", err);
    });

    this.worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`[WorkerRoom] worker thread exited with code ${code}`);
      }
    });
  }

  // ── Sync interface (same as GameRoom) ────────────────────────────────────────

  get playerCount(): number { return this._playerCount; }

  getSpawnPoint(): { x: number; y: number; z: number } {
    return { ...this.cachedSpawnPoint };
  }

  getSnapshot(localPlayerId: string): RenderState {
    return this.cachedSnapshots.get(localPlayerId) ?? {
      tick: 0, serverTime: Date.now(),
      objects: [], players: [], gui: [],
      localPlayerId, camera: undefined,
    };
  }

  getPlayerRender(id: string): object | null {
    return this.cachedPlayerRenders.get(id) ?? null;
  }

  // ── Fire-and-forget calls ────────────────────────────────────────────────────

  setObjects(objects: any[]) {
    this.worker.postMessage({ type: "setObjects", objects });
  }

  loadScripts(scripts: { code: string; name: string; enabled: boolean }[]) {
    this.worker.postMessage({ type: "loadScripts", scripts });
  }

  addPlayer(id: string, name: string, x: number, y: number, z: number, colors: any) {
    this._playerCount++;
    this.worker.postMessage({ type: "addPlayer", id, name, x, y, z, colors });
  }

  removePlayer(id: string) {
    this._playerCount = Math.max(0, this._playerCount - 1);
    this.cachedSnapshots.delete(id);
    this.cachedPlayerRenders.delete(id);
    this.worker.postMessage({ type: "removePlayer", id });
  }

  applyInput(
    playerId: string,
    moveX: number, moveZ: number,
    jump: boolean, rotY: number, camY: number,
    sprint = false,
  ) {
    this.worker.postMessage({ type: "applyInput", playerId, moveX, moveZ, jump, rotY, camY, sprint });
  }

  syncPosition(playerId: string, x: number, y: number, z: number, rotY: number) {
    this.worker.postMessage({ type: "syncPosition", playerId, x, y, z, rotY });
  }

  handleObjectClick(playerId: string, objId: string | null) {
    this.worker.postMessage({ type: "handleObjectClick", playerId, objectId: objId });
  }

  handleGuiClick(playerId: string, elementId: string) {
    this.worker.postMessage({ type: "handleGuiClick", playerId, elementId });
  }

  handleKeyDown(playerId: string, key: string) {
    this.worker.postMessage({ type: "handleKeyDown", playerId, key });
  }

  handleKeyUp(playerId: string, key: string) {
    this.worker.postMessage({ type: "handleKeyUp", playerId, key });
  }

  handleNetworkMessage(playerId: string, event: string, payload: any) {
    this.worker.postMessage({ type: "handleNetworkMessage", playerId, event, payload });
  }

  setTickRate(hz: number) {
    this.worker.postMessage({ type: "setTickRate", hz });
  }

  pause() {
    this.worker.postMessage({ type: "pause" });
  }

  resume() {
    this.worker.postMessage({ type: "resume" });
  }

  stop() {
    this.worker.postMessage({ type: "stop" });
    // Give the worker a moment to clean up, then terminate
    setTimeout(() => this.worker.terminate().catch(() => {}), 200);
  }

  setInterestRadius(units: number) {
    this.worker.postMessage({ type: "setInterestRadius", units });
  }

  // ── Async request (only used from async contexts) ─────────────────────────────

  getPhysicsSnapshot(): Promise<GameSnapshot> {
    const requestId = String(++this.reqCounter);
    return new Promise<GameSnapshot>((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({ type: "getPhysicsSnapshot", requestId });
    });
  }

  loadPhysicsSnapshot(snap: GameSnapshot) {
    this.worker.postMessage({ type: "loadPhysicsSnapshot", snap });
  }
}
