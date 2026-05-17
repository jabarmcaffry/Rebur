/**
 * OOP facade entry point. Creator-facing API stays in the existing
 * `scripting/api-builder.ts`; this file re-exports proxy factories so the
 * api-builder can swap mutation paths to commands when the new pipeline is
 * enabled.
 */
export { 
  createObjectProxy, 
  createGameProxy,
  // Commands - for use in systems
  SetPositionCmd,
  SetRotationCmd,
  SetScaleCmd,
  SetColorCmd,
  SetVisibleCmd,
  SetTransparencyCmd,
  SetAnchoredCmd,
  SetCanCollideCmd,
  SetVelocityCmd,
  SpawnCmd,
  DestroyCmd,
  TweenCmd,
  SetAutoRotateYCmd,
  SetAutoBobCmd,
  SetAutoSpinCmd,
  // Types
  type ObjectProxyDeps,
  type GameProxyDeps,
} from "./proxies";

// Re-export the new RuntimeObject proxy for ECS-backed objects
export {
  createRuntimeObjectProxy,
  readEntitySnapshot,
  type RuntimeObjectProxyDeps,
  type EntityRenderSnapshot,
} from "./runtime-object-proxy";
