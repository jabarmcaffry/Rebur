/**
 * Input Manager
 * 
 * Handles input state (keyboard, movement axes, jump).
 */

export interface RuntimeInput {
  keys: Record<string, boolean>;
  moveX: number;
  moveZ: number;
  jump: boolean;
  pressed: (key: string) => boolean;
  released: (key: string) => boolean;
  held: (key: string) => boolean;
}

/**
 * Create input manager
 */
export function createInputManager(): { input: RuntimeInput; prevKeys: Record<string, boolean> } {
  const keys: Record<string, boolean> = {};
  const prevKeys: Record<string, boolean> = {};

  const input: RuntimeInput = {
    keys,
    moveX: 0,
    moveZ: 0,
    jump: false,
    held: (k: string) => !!keys[k.toLowerCase()],
    pressed: (k: string) => !!keys[k.toLowerCase()] && !prevKeys[k.toLowerCase()],
    released: (k: string) => !keys[k.toLowerCase()] && !!prevKeys[k.toLowerCase()],
  };

  return { input, prevKeys };
}

/**
 * Snapshot current keys to previous keys
 */
export function snapshotPreviousKeys(
  current: Record<string, boolean>,
  prev: Record<string, boolean>
): void {
  // Clear prev and copy current
  for (const k of Object.keys(prev)) {
    delete prev[k];
  }
  Object.assign(prev, current);
}

/**
 * Reset jump flag after processing
 */
export function resetJumpFlag(input: RuntimeInput): void {
  input.jump = false;
}
