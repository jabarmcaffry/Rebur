/**
 * client-script-runner.ts
 *
 * Runs ClientScripts in the browser. Provides a Rebur global focused on
 * client-side concerns: camera, GUI, local player state, input, and networking.
 *
 * API exposed to ClientScripts:
 *   Rebur.Network.send(server, event, payload)  — send message to server
 *   Rebur.Network.on(event, fn)                  — receive message from server
 *   Rebur.Network.off(event, fn)                 — unregister listener
 *   Rebur.Camera                                 — client-side camera overrides
 *   Rebur.Input                                  — keyboard/mouse state in browser
 *   Rebur.Player                                 — local player read-only state
 *   Rebur.Gui                                    — client-side immediate HUD (no server roundtrip)
 *   Rebur.on("tick", fn)                         — per-frame callback
 *   log(...args)                                 — console output
 *   after(seconds, fn)                           — delayed callback
 *   every(seconds, fn)                           — repeated callback
 *   wait(seconds)                                — Promise-based delay
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

  // Client-side camera overrides (applied on top of server camera)
  cameraOverride: Record<string, any> = {};

  // Client-side GUI elements (drawn on top of server GUI)
  clientGuiElements = new Map<string, any>();

  // Held keys tracked in browser
  private heldKeys = new Set<string>();
  private keyDownListeners = new Map<string, Array<(key: string) => void>>();
  private keyUpListeners = new Map<string, Array<(key: string) => void>>();
  private _boundKeyDown: (e: KeyboardEvent) => void;
  private _boundKeyUp: (e: KeyboardEvent) => void;

  constructor(private renderClient: RenderClient) {
    this._boundKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!this.heldKeys.has(k)) {
        this.heldKeys.add(k);
        for (const h of this.keyDownListeners.get(k) ?? []) try { h(k); } catch { /**/ }
        for (const h of this.keyDownListeners.get("*") ?? []) try { h(k); } catch { /**/ }
      }
    };
    this._boundKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      this.heldKeys.delete(k);
      for (const h of this.keyUpListeners.get(k) ?? []) try { h(k); } catch { /**/ }
      for (const h of this.keyUpListeners.get("*") ?? []) try { h(k); } catch { /**/ }
    };
    window.addEventListener("keydown", this._boundKeyDown);
    window.addEventListener("keyup", this._boundKeyUp);
  }

  runScripts(scripts: Script[]) {
    const enabled = scripts.filter(s => s.enabled !== false && (s.scriptType === "client" || s.scriptType === "ClientScript"));
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
        try { h(payload); } catch (e) { console.error("[ClientScript] Network handler error:", e); }
      }
    };
  }

  private _execScript(script: Script) {
    try {
      const Rebur = this._makeReburGlobal(script.name);

      const log = (...args: any[]) =>
        console.log(`[ClientScript:${script.name}]`, ...args);
      const warn = (...args: any[]) =>
        console.warn(`[ClientScript:${script.name}]`, ...args);
      const error = (...args: any[]) =>
        console.error(`[ClientScript:${script.name}]`, ...args);

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

      const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor as any;
      const fn = new AsyncFunc(
        "Rebur", "log", "warn", "error", "after", "every", "wait",
        script.content ?? ""
      );
      fn(Rebur, log, warn, error, after, every, wait).catch((e: any) => {
        console.error(`[ClientScript] "${script.name}" async error:`, e);
      });
    } catch (e) {
      console.error(`[ClientScript] "${script.name}" runtime error:`, e);
    }
  }

  private _makeReburGlobal(scriptName: string) {
    const rc = this.renderClient;
    const handlers = this.networkHandlers;
    const tickH = this.tickHandlers;
    const runner = this;

    // ── Rebur.Network ────────────────────────────────────────────────────
    const reburNetwork = {
      // Client → server
      send(event: string, payload?: any) {
        rc.sendNetworkMessage(event, payload ?? null);
      },
      // Receive server → client broadcasts
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

    // ── Rebur.Camera (client-side overrides) ─────────────────────────────
    const reburCamera = {
      get mode()       { return runner.cameraOverride.mode ?? rc.camera?.mode ?? "thirdPerson"; },
      set mode(v: any) { runner.cameraOverride.mode = v; },
      get fov()        { return runner.cameraOverride.fov ?? rc.camera?.fov ?? 70; },
      set fov(v: any)  { runner.cameraOverride.fov = +v; },
      get distance()   { return runner.cameraOverride.distance ?? rc.camera?.distance ?? 14; },
      set distance(v: any) { runner.cameraOverride.distance = +v; },
      setPosition(x: number, y: number, z: number) {
        runner.cameraOverride.position = { x, y, z };
      },
      setLookAt(x: number, y: number, z: number) {
        runner.cameraOverride.lookAt = { x, y, z };
      },
      reset() {
        runner.cameraOverride = {};
      },
    };

    // ── Rebur.Input (browser-native key state) ────────────────────────────
    const reburInput = {
      isDown(key: string) {
        return runner.heldKeys.has(key.toLowerCase());
      },
      on(event: string, fn: (key: string) => void) {
        const ev = event.toLowerCase();
        const map = ev === "keydown" || ev === "press"
          ? runner.keyDownListeners
          : runner.keyUpListeners;
        const arr = map.get("*") ?? [];
        arr.push(fn);
        map.set("*", arr);
        return () => { map.set("*", (map.get("*") ?? []).filter(h => h !== fn)); };
      },
      onKeyDown(key: string, fn: () => void) {
        const k = key.toLowerCase();
        const arr = runner.keyDownListeners.get(k) ?? [];
        arr.push(fn);
        runner.keyDownListeners.set(k, arr);
        return () => runner.keyDownListeners.set(k, (runner.keyDownListeners.get(k) ?? []).filter(h => h !== fn));
      },
      onKeyUp(key: string, fn: () => void) {
        const k = key.toLowerCase();
        const arr = runner.keyUpListeners.get(k) ?? [];
        arr.push(fn);
        runner.keyUpListeners.set(k, arr);
        return () => runner.keyUpListeners.set(k, (runner.keyUpListeners.get(k) ?? []).filter(h => h !== fn));
      },
    };

    // ── Rebur.Player (local player read-only snapshot) ────────────────────
    const reburPlayer = new Proxy({} as any, {
      get(_t, key: string) {
        if (!rc.localPlayerId) return undefined;
        const p = rc.players.get(rc.localPlayerId);
        if (!p) return undefined;
        if (key === "position") return { ...p.position };
        if (key === "velocity") return { ...p.velocity };
        if (key === "rotation") return { ...p.rotation };
        if (key === "health")   return p.health;
        if (key === "maxHealth") return p.maxHealth;
        if (key === "name")    return p.name;
        if (key === "id")      return p.id;
        if (key === "onGround") return p.onGround;
        if (key === "animation") return p.animation;
        return undefined;
      },
    });

    // ── Rebur.Gui (client-side immediate HUD) ─────────────────────────────
    const reburGui = {
      text(id: string, text: string, opts?: any) {
        runner.clientGuiElements.set(id, { id, kind: "text", text, ...opts, visible: true });
      },
      button(id: string, text: string, opts?: any, onClick?: () => void) {
        runner.clientGuiElements.set(id, { id, kind: "button", text, ...opts, visible: true, clickable: true, onClick });
      },
      bar(id: string, value: number, maxValue: number, opts?: any) {
        runner.clientGuiElements.set(id, { id, kind: "bar", value, maxValue, ...opts, visible: true });
      },
      image(id: string, url: string, opts?: any) {
        runner.clientGuiElements.set(id, { id, kind: "image", imageUrl: url, ...opts, visible: true });
      },
      clear(id?: string) {
        if (id !== undefined) runner.clientGuiElements.delete(id);
        else runner.clientGuiElements.clear();
      },
    };

    return {
      Network: reburNetwork,
      Camera:  reburCamera,
      Input:   reburInput,
      Player:  reburPlayer,
      Gui:     reburGui,

      on(event: string, fn: (...args: any[]) => void) {
        if (event === "tick") {
          tickH.push(fn);
          return () => {
            const i = tickH.indexOf(fn);
            if (i >= 0) tickH.splice(i, 1);
          };
        }
        console.warn(`[ClientScript:${scriptName}] Rebur.on("${event}") — supported events: "tick"`);
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
        try { h(dt); } catch (e) { console.error("[ClientScript] Tick error:", e); }
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
    window.removeEventListener("keydown", this._boundKeyDown);
    window.removeEventListener("keyup", this._boundKeyUp);
    this.clientGuiElements.clear();
    this.cameraOverride = {};
  }
}
