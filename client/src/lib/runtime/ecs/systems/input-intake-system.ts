/**
 * InputIntakeSystem — drains client input commands at the start of each tick.
 * This is the first system in the fixed order; it makes input available to
 * all subsequent systems via the world's InputState singleton component.
 */
import { defineSystem } from "../system";
import { defineComponent } from "../world";
import { CommandGroups } from "../../commands/router";
import type { Vec3 } from "../../types";

/** Singleton component storing current tick's input state. */
export const InputState = defineComponent<{
  moveX: number;
  moveZ: number;
  jump: boolean;
  keys: Record<string, boolean>;
  prevKeys: Record<string, boolean>;
  /** Camera forward direction for movement relative to camera. */
  cameraForward: Vec3;
}>("input-state");

/** Input command payload sent by client each frame. */
export interface InputCommandPayload {
  moveX: number;
  moveZ: number;
  jump: boolean;
  keys: Record<string, boolean>;
  cameraForward?: Vec3;
}

export const InputIntakeSystem = defineSystem({
  id: "input-intake",
  side: "server",
  run({ commands, world }) {
    // Drain input commands (usually one per client per tick).
    for (const cmd of commands.drain(CommandGroups.Input)) {
      const payload = cmd.payload as InputCommandPayload;
      
      // For single-player, entity 0 is the player singleton.
      const playerEntity = 0 as unknown as ReturnType<typeof world.create>;
      
      // Get or create input state.
      let state = world.get(playerEntity, InputState);
      if (!state) {
        state = {
          moveX: 0,
          moveZ: 0,
          jump: false,
          keys: {},
          prevKeys: {},
          cameraForward: { x: 0, y: 0, z: -1 },
        };
      }
      
      // Snapshot prev keys before updating.
      state.prevKeys = { ...state.keys };
      
      // Apply new input.
      state.moveX = payload.moveX;
      state.moveZ = payload.moveZ;
      state.jump = payload.jump;
      state.keys = { ...payload.keys };
      if (payload.cameraForward) {
        state.cameraForward = { ...payload.cameraForward };
      }
      
      world.set(playerEntity, InputState, state);
    }
  },
});
