/**
 * Keyboard Input System
 * 
 * Handles keyboard event subscription and key state queries.
 */

/**
 * Keyboard API exposed to scripts
 */
export interface KeyboardAPI {
  onPress: (key: string, fn: () => void) => () => void;
  onRelease: (key: string, fn: () => void) => () => void;
  isDown: (key: string) => boolean;
}

/**
 * Create keyboard API
 */
export function createKeyboardAPI(
  keyDownHandlers: Map<string, Set<() => void>>,
  keyUpHandlers: Map<string, Set<() => void>>,
  getKeys: () => Record<string, boolean>
): KeyboardAPI {
  return {
    onPress(key: string, fn: () => void): () => void {
      const k = key.toLowerCase();
      let s = keyDownHandlers.get(k);
      if (!s) {
        s = new Set();
        keyDownHandlers.set(k, s);
      }
      s.add(fn);
      return () => s!.delete(fn);
    },

    onRelease(key: string, fn: () => void): () => void {
      const k = key.toLowerCase();
      let s = keyUpHandlers.get(k);
      if (!s) {
        s = new Set();
        keyUpHandlers.set(k, s);
      }
      s.add(fn);
      return () => s!.delete(fn);
    },

    isDown(key: string): boolean {
      return !!getKeys()[key.toLowerCase()];
    },
  };
}

/**
 * Process keyboard input for a frame
 */
export function processKeyboardInput(
  currentKeys: Record<string, boolean>,
  prevKeys: Record<string, boolean>,
  keyDownHandlers: Map<string, Set<() => void>>,
  keyUpHandlers: Map<string, Set<() => void>>,
  onError: (key: string, type: "press" | "release", error: any) => void,
  emitKeyDown: (key: string) => void,
  emitKeyUp: (key: string) => void
): void {
  for (const k in currentKeys) {
    const isDown = !!currentKeys[k];
    const wasDown = !!prevKeys[k];
    
    if (isDown && !wasDown) {
      emitKeyDown(k);
      const set = keyDownHandlers.get(k);
      if (set) {
        for (const fn of set) {
          try {
            fn();
          } catch (e) {
            onError(k, "press", e);
          }
        }
      }
    } else if (!isDown && wasDown) {
      emitKeyUp(k);
      const set = keyUpHandlers.get(k);
      if (set) {
        for (const fn of set) {
          try {
            fn();
          } catch (e) {
            onError(k, "release", e);
          }
        }
      }
    }
  }
}
