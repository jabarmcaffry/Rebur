/**
 * State Manager
 * 
 * Global key-value state system with subscriptions.
 * Used for multiplayer-ready game state synchronization.
 */

import { formatErr } from "../utils/helpers";

export interface RuntimeState {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  on: (key: string, fn: (value: string, prev: string | undefined) => void) => () => void;
  keys: () => string[];
}

/**
 * Create a state manager instance
 */
export function createStateManager(
  pushLog: (line: string) => void
): RuntimeState {
  const stateValues = new Map<string, string>();
  const stateSubs = new Map<string, Set<(value: string, prev: string | undefined) => void>>();

  return {
    get(key: string): string | undefined {
      return stateValues.get(key);
    },

    set(key: string, value: string): void {
      const v = String(value);
      const prev = stateValues.get(key);
      if (prev === v) return;
      
      stateValues.set(key, v);
      const subs = stateSubs.get(key);
      if (!subs) return;
      
      for (const fn of subs) {
        try {
          fn(v, prev);
        } catch (e: any) {
          pushLog(`state.on("${key}") error: ${formatErr(e)}`);
        }
      }
    },

    on(key: string, fn: (value: string, prev: string | undefined) => void): () => void {
      let subs = stateSubs.get(key);
      if (!subs) {
        subs = new Set();
        stateSubs.set(key, subs);
      }
      subs.add(fn);
      return () => {
        subs?.delete(fn);
      };
    },

    keys(): string[] {
      return Array.from(stateValues.keys());
    },
  };
}
