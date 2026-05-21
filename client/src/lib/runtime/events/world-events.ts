/**
 * World Events System
 * 
 * Handles world lifecycle events using standardized .on("event") pattern.
 */

import type { RuntimeObject, RuntimePlayer } from "../types";
import type { EventBus, EngineEvents } from "./event-bus";

/**
 * World event names
 */
export type WorldEventName = 
  | "objectAdded"
  | "objectRemoved"
  | "playerSpawned"
  | "playerDied";

/**
 * World API exposed to scripts - uses standardized .on() pattern
 */
export interface WorldAPI {
  on: (event: WorldEventName, fn: (...args: any[]) => void) => () => void;
  off: (event: WorldEventName, fn: (...args: any[]) => void) => void;
}

/**
 * Create world API with .on() pattern
 */
export function createWorldAPI(events: EventBus<EngineEvents>): WorldAPI {
  return {
    on(event: WorldEventName, fn: (...args: any[]) => void): () => void {
      return events.on(event as keyof EngineEvents, fn as any);
    },

    off(event: WorldEventName, fn: (...args: any[]) => void): void {
      events.off(event as keyof EngineEvents, fn as any);
    },
  };
}
