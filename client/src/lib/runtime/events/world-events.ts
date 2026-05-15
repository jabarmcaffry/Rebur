/**
 * World Events System
 * 
 * Handles world lifecycle events (object added/removed, player spawned/died).
 */

import type { RuntimeObject, RuntimePlayer } from "../types";
import type { EventBus, EngineEvents } from "./event-bus";

/**
 * World API exposed to scripts
 */
export interface WorldAPI {
  onObjectAdded: (fn: (obj: RuntimeObject) => void) => () => void;
  onObjectRemoved: (fn: (obj: RuntimeObject) => void) => () => void;
  onPlayerSpawned: (fn: (player: RuntimePlayer) => void) => () => void;
  onPlayerDied: (fn: (player: RuntimePlayer) => void) => () => void;
}

/**
 * Create world API
 */
export function createWorldAPI(events: EventBus<EngineEvents>): WorldAPI {
  return {
    onObjectAdded(fn: (obj: RuntimeObject) => void): () => void {
      return events.on("objectAdded", fn);
    },

    onObjectRemoved(fn: (obj: RuntimeObject) => void): () => void {
      return events.on("objectRemoved", fn);
    },

    onPlayerSpawned(fn: (player: RuntimePlayer) => void): () => void {
      return events.on("playerSpawned", fn);
    },

    onPlayerDied(fn: (player: RuntimePlayer) => void): () => void {
      return events.on("playerDied", fn);
    },
  };
}
