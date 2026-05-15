/**
 * Mouse Input System
 * 
 * Handles mouse click events and object picking.
 */

import type { RuntimeObject } from "../types";

/**
 * Mouse API exposed to scripts
 */
export interface MouseAPI {
  onClick: (fn: (obj: RuntimeObject | null) => void) => () => void;
}

/**
 * Create mouse API
 */
export function createMouseAPI(
  clickHandlers: Set<(obj: RuntimeObject | null) => void>
): MouseAPI {
  return {
    onClick(fn: (obj: RuntimeObject | null) => void): () => void {
      clickHandlers.add(fn);
      return () => clickHandlers.delete(fn);
    },
  };
}

/**
 * Process mouse click event
 */
export function processMouseClick(
  obj: RuntimeObject | null,
  clickHandlers: Set<(obj: RuntimeObject | null) => void>,
  emitObjectClick: (objId: string) => void,
  onError: (error: any) => void
): void {
  // Emit object-specific click event
  if (obj) {
    emitObjectClick(obj.id);
  }
  
  // Call all registered click handlers
  for (const fn of clickHandlers) {
    try {
      fn(obj);
    } catch (e) {
      onError(e);
    }
  }
}
