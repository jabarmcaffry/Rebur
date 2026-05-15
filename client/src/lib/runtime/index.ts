// index.ts
// Core runtime - using the modular game-runtime instead of monolithic core.ts
export { GameRuntime } from "./game-runtime";

// Types and utilities
export * from "./types";
export * from "./api";
export * from "./compile";

// Modular exports for events, input, and loop
export * from "./events";
export * from "./input";
export * from "./loop";

// Player subsystems - export only non-conflicting types
export { 
  createPlayerMotors, 
  applyMotorPositions, 
  getMotorPinnedIds, 
  isObjectHeld, 
  getHeldObjectSlot,
  MOTOR_SLOT_OFFSETS,
  type MotorState,
} from "./player/motors";

// Object subsystems
export { 
  runPickupSweep, 
  runTouchSweep, 
  clearContact,
  type TouchSystemContext,
} from "./objects/touch-system";

// Scripting subsystems - export only non-conflicting types
export { 
  initializeModuleScripts, 
  requireModule, 
  isRunnableScript,
  createModuleLoaderContext,
  type ModuleLoaderContext,
} from "./scripting/module-loader";

// Re‑export external dependencies (optional, for convenience)
export type { Easing } from "./tween";
export type { RaycastResult, RaycastParams } from "./raycast";
