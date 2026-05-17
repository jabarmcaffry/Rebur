// compile.ts — Sandbox script → async function factory
import type { GameAPI, CompiledScript } from "./types";

function scriptLineFromStack(stack: string | undefined): number | null {
  const match = stack?.match(/<anonymous>:(\d+):(\d+)/);
  if (!match) return null;
  return Math.max(1, Number(match[1]) - 57);
}

export function compileScript(code: string, name: string): CompiledScript {
  try {
    const safeCode = code
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    const factory = new AsyncFunction(
      "game",
      `"use strict";
       const exports = game.exports || {};
       const module = game.module || { exports: exports };
       
       const objects = game.objects;
       const workspace = game.workspace;
       const lighting = game.lighting;
       const replicatedStorage = game.replicatedStorage;
       const serverScriptService = game.serverScriptService;
       const starterPlayer = game.starterPlayer;
       const players = game.players;
       const player = game.player;
       const input = game.input;
       const physics = game.physics;
       const state = game.state;
       const runService = game.runService;
       const keyboard = game.keyboard;
       const mouse = game.mouse;
       const world = game.world;
       const gui = game.gui;
       const camera = game.camera;
       const log = game.log;
       const inventory = game.player ? game.player.inventory : undefined;
       const find = game.find;
       const spawn = game.spawn;
       const create = game.create;
       const destroy = game.destroy;
       const onKey = game.onKey;
       const onUpdate = game.onUpdate;
       const every = game.every;
       const after = game.after;
       const wait = game.wait;
       const now = game.now;
       const random = game.random;
       const randInt = game.randInt;
       const pick = game.pick;
       const dist = game.dist;
       const lerp = game.lerp;
       const clamp = game.clamp;
       const raycast = game.raycast;
       const tween = game.tween;
       const network = game.network;
       const Emitter = game.Emitter;
       const Callable = game.Callable;
       const tags = game.tags;
       const require = game.require;
       const task = game.task;
       const debug = game.debug;
       const weakRef = game.weakRef;
       const WeakTable = game.WeakTable;
       const Class = game.Class;
       const console = {
         log:   (...a) => game.log(...a),
         info:  (...a) => game.log("[info]", ...a),
         warn:  (...a) => game.log("[warn]", ...a),
         error: (...a) => game.log("[error]", ...a),
       };
       ${safeCode}`
    );

    return { name, run: factory as (api: GameAPI) => void };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const line = scriptLineFromStack(e?.stack);
    const where = line ? `line ${line}: ` : "";
    return { name, error: `Syntax error in your script at ${where}${msg}` };
  }
}
