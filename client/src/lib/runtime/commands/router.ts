/**
 * Router — declares which command groups a system consumes. Today it's just
 * a typed lookup table; later it can wire fan-out across worker threads.
 */
export const CommandGroups = {
  Input: "input",
  Script: "script",
  Lifecycle: "lifecycle",
  Physics: "physics",
  Animation: "animation",
  Collision: "collision",
} as const;

export type CommandGroup = (typeof CommandGroups)[keyof typeof CommandGroups];
