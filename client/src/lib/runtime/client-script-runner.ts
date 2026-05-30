/**
 * client-script-runner.ts
 *
 * Runs LocalScripts (StarterPlayer container) in the browser.
 * Provides a minimal Rebur global focused on client ↔ server messaging.
 *
 * API exposed to LocalScripts:
 *   Rebur.Network.send(event, payload)  — send message to server
 *   Rebur.Network.on(event, fn)         — receive message from server
 *   Rebur.Network.off(event, fn)        — unregister listener
 *   Rebur.on("tick", fn)               — per-frame callback
 *   log(...args)                        — console output
 *   after(seconds, fn)                 — delayed callback
 *   every(seconds, fn)                 — repeated callback
 *   wait(seconds)                      — Promise-based delay
 */

import type { RenderClient } from "@/lib/render-client";

interface Script {
  name: string;
  content?: string | null;
  enabled?: boolean | null;
  scriptType?: string | null;
  container?: string | null;
}

export class ClientScriptRunner {
  private networkHandlers = new Map<string, Array<(payload: any) => void>>();
  private tickHandlers: Array<(dt: number) => void> = [];
  private rafId: number | null = null;
  private lastTime = performance.now();
  private running = false;
  private prevOnNetworkMessage: ((event: string, payload: any) => void) | undefined;

  constructor(private renderClient: RenderClient) {}

  runScripts(scripts: Script[]) {
    const enabled = scripts.filter(s => s.enabled !== false && s.scriptType === "LocalScript");
    if (enabled.length === 0) return;

    this._hookNetworkMessage();
    for (const script of enabled) {
      this._execScript(script);
    }
    this._startLoop();
  }

  private _hookNetworkMessage() {
    const handlers = this.networkHandlers;
    this.prevOnNetworkMessage = this.renderClient.onNetworkMessage;
    this.renderClient.onNetworkMessage = (event: string, payload: any) => {
      this.prevOnNetworkMessage?.(event, payload);
      for (const h of handlers.get(event) ?? []) {
        try { h(payload); } catch (e) { console.error("[LocalScript] Network handler error:", e); }
      }
    };
  }

  private _execScript(script: Script) {
    try {
      const Rebur = this._makeReburGlobal(script.name);

      const log = (...args: any[]) =>
        console.log(`[LocalScript:${script.name}]`, ...args);
      const warn = (...args: any[]) =>
        console.warn(`[LocalScript:${script.name}]`, ...args);

      const after = (seconds: number, fn: () => void) => {
        const id = setTimeout(fn, seconds * 1000);
        return () => clearTimeout(id);
      };
      const every = (seconds: number, fn: () => void) => {
        const id = setInterval(fn, seconds * 1000);
        return () => clearInterval(id);
      };
      const wait = (seconds: number) =>
        new Promise<void>(resolve => setTimeout(resolve, seconds * 1000));

      // eslint-disable-next-line no-new-func
      const fn = new Function(
        "Rebur", "log", "warn", "after", "every", "wait",
        script.content ?? ""
      );
      fn(Rebur, log, warn, after, every, wait);
    } catch (e) {
      console.error(`[LocalScript] "${script.name}" runtime error:`, e);
    }
  }

  private _makeReburGlobal(scriptName: string) {
    const rc = this.renderClient;
    const handlers = this.networkHandlers;
    const tickH = this.tickHandlers;

    const reburNetwork = {
      send(event: string, payload?: any) {
        rc.sendNetworkMessage(event, payload ?? null);
      },
      on(event: string, fn: (payload: any) => void) {
        const arr = handlers.get(event) ?? [];
        arr.push(fn);
        handlers.set(event, arr);
        return () => {
          handlers.set(event, (handlers.get(event) ?? []).filter(h => h !== fn));
        };
      },
      off(event: string, fn: (payload: any) => void) {
        handlers.set(event, (handlers.get(event) ?? []).filter(h => h !== fn));
      },
    };

    return {
      Network: reburNetwork,
      on(event: string, fn: (...args: any[]) => void) {
        if (event === "tick") {
          tickH.push(fn);
          return () => {
            const i = tickH.indexOf(fn);
            if (i >= 0) tickH.splice(i, 1);
          };
        }
        console.warn(`[LocalScript:${scriptName}] Rebur.on("${event}") — only "tick" is supported in LocalScripts`);
        return () => {};
      },
      off(_event: string, fn: (...args: any[]) => void) {
        const i = tickH.indexOf(fn);
        if (i >= 0) tickH.splice(i, 1);
      },
    };
  }

  private _startLoop() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      for (const h of this.tickHandlers) {
        try { h(dt); } catch (e) { console.error("[LocalScript] Tick error:", e); }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.running = false;
    this.networkHandlers.clear();
    this.tickHandlers.length = 0;
    if (this.prevOnNetworkMessage !== undefined) {
      this.renderClient.onNetworkMessage = this.prevOnNetworkMessage;
    }
  }
}
