/**
 * OOP facade proxies. These wrap an entity id and translate
 * `obj.position = { x, y, z }` style writes into Command Events that the
 * server-authoritative pipeline drains next tick.
 *
 * The shape MUST match the existing GameAPI's RuntimeObject surface so
 * creator scripts keep working unchanged.
 */
import type { CommandBus } from "../commands/bus";
import { defineCommand } from "../commands/command";
import type { CommandOrigin } from "../commands/command";
import type { Vec3 } from "../types";
import { CommandGroups } from "../commands/router";

// ============================================================================
// Transform Commands
// ============================================================================

export const SetPositionCmd = defineCommand<"transform.setPosition", { position: Vec3 }>(
  "transform.setPosition",
  CommandGroups.Script,
);

export const SetRotationCmd = defineCommand<"transform.setRotation", { rotation: Vec3 }>(
  "transform.setRotation",
  CommandGroups.Script,
);

export const SetScaleCmd = defineCommand<"transform.setScale", { scale: Vec3 }>(
  "transform.setScale",
  CommandGroups.Script,
);

// ============================================================================
// Visual Commands
// ============================================================================

export const SetColorCmd = defineCommand<"visual.setColor", { color: string }>(
  "visual.setColor",
  CommandGroups.Script,
);

export const SetVisibleCmd = defineCommand<"visual.setVisible", { visible: boolean }>(
  "visual.setVisible",
  CommandGroups.Script,
);

export const SetTransparencyCmd = defineCommand<"visual.setTransparency", { transparency: number }>(
  "visual.setTransparency",
  CommandGroups.Script,
);

// ============================================================================
// Physics Commands
// ============================================================================

export const SetAnchoredCmd = defineCommand<"physics.setAnchored", { anchored: boolean }>(
  "physics.setAnchored",
  CommandGroups.Script,
);

export const SetCanCollideCmd = defineCommand<"physics.setCanCollide", { canCollide: boolean }>(
  "physics.setCanCollide",
  CommandGroups.Script,
);

export const SetVelocityCmd = defineCommand<"physics.setVelocity", { velocity: Vec3 }>(
  "physics.setVelocity",
  CommandGroups.Script,
);

// ============================================================================
// Lifecycle Commands
// ============================================================================

export const SpawnCmd = defineCommand<"entity.spawn", {
  name: string;
  primitiveType?: string;
  position?: Partial<Vec3>;
  rotation?: Partial<Vec3>;
  scale?: Partial<Vec3>;
  color?: string;
  anchored?: boolean;
  canCollide?: boolean;
  parentId?: number;
}>("entity.spawn", CommandGroups.Lifecycle);

export const DestroyCmd = defineCommand<"entity.destroy", { entityId: number }>(
  "entity.destroy",
  CommandGroups.Lifecycle,
);

// ============================================================================
// Animation Commands
// ============================================================================

export const TweenCmd = defineCommand<"animation.tween", {
  properties: Record<string, number>;
  duration: number;
  easing?: string;
}>("animation.tween", CommandGroups.Animation);

export const SetAutoRotateYCmd = defineCommand<"animation.setAutoRotateY", { speed: number | undefined }>(
  "animation.setAutoRotateY",
  CommandGroups.Animation,
);

export const SetAutoBobCmd = defineCommand<"animation.setAutoBob", {
  amplitude?: number;
  speed?: number;
} | undefined>("animation.setAutoBob", CommandGroups.Animation);

export const SetAutoSpinCmd = defineCommand<"animation.setAutoSpin", {
  x?: number;
  y?: number;
  z?: number;
} | undefined>("animation.setAutoSpin", CommandGroups.Animation);

// ============================================================================
// Object Proxy Dependencies
// ============================================================================

export interface ObjectProxyDeps {
  bus: CommandBus;
  /** Reads the latest committed state for this entity. */
  read: (entity: number) => {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    velocity: Vec3;
    color: string;
    visible: boolean;
    transparency: number;
    anchored: boolean;
    canCollide: boolean;
  } | undefined;
  /** Optional issuer (player id) — server uses this for authority + rate caps. */
  issuedBy?: string;
  /** Origin captured at proxy construction (script, line, apiPath base). */
  origin?: CommandOrigin;
}

// ============================================================================
// Vec3 Proxy Helper
// ============================================================================

function createVec3Proxy(
  deps: ObjectProxyDeps,
  entity: number,
  propertyName: "position" | "rotation" | "scale" | "velocity",
  overlay: { [key: string]: Vec3 | undefined },
  command: ReturnType<typeof defineCommand<string, { [key: string]: Vec3 }>>,
): Vec3 {
  const readFn = (): Vec3 => {
    if (overlay[propertyName]) return overlay[propertyName]!;
    const state = deps.read(entity);
    if (state && propertyName in state) return (state as any)[propertyName];
    return { x: 0, y: 0, z: 0 };
  };

  return new Proxy({} as Vec3, {
    get(_t, k) {
      return readFn()[k as keyof Vec3];
    },
    set(_t, k, v) {
      const next = { ...readFn(), [k as keyof Vec3]: Number(v) };
      overlay[propertyName] = next;
      deps.bus.enqueue(
        command.create(
          { [propertyName]: next } as any,
          {
            entity,
            issuedBy: deps.issuedBy,
            origin: { ...deps.origin, apiPath: `Object.${propertyName}` },
          },
        ),
      );
      return true;
    },
  });
}

// ============================================================================
// Main Object Proxy
// ============================================================================

/**
 * Builds a creator-facing object proxy whose writes become commands.
 * Pending writes within the same tick are reflected via a per-tick overlay
 * so that script `read-after-write` keeps working.
 */
export function createObjectProxy(entity: number, deps: ObjectProxyDeps) {
  const overlay: {
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
    velocity?: Vec3;
    color?: string;
    visible?: boolean;
    transparency?: number;
    anchored?: boolean;
    canCollide?: boolean;
  } = {};

  const readState = () => deps.read(entity) ?? {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    color: "#888888",
    visible: true,
    transparency: 0,
    anchored: true,
    canCollide: true,
  };

  // Create Vec3 proxies
  const positionProxy = createVec3Proxy(deps, entity, "position", overlay, SetPositionCmd as any);
  const rotationProxy = createVec3Proxy(deps, entity, "rotation", overlay, SetRotationCmd as any);
  const scaleProxy = createVec3Proxy(deps, entity, "scale", overlay, SetScaleCmd as any);
  const velocityProxy = createVec3Proxy(deps, entity, "velocity", overlay, SetVelocityCmd as any);

  return {
    // Transform
    get position() { return positionProxy; },
    set position(v: Vec3) {
      overlay.position = { ...v };
      deps.bus.enqueue(
        SetPositionCmd.create(
          { position: { ...v } },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.position" } },
        ),
      );
    },
    get rotation() { return rotationProxy; },
    set rotation(v: Vec3) {
      overlay.rotation = { ...v };
      deps.bus.enqueue(
        SetRotationCmd.create(
          { rotation: { ...v } },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.rotation" } },
        ),
      );
    },
    get scale() { return scaleProxy; },
    set scale(v: Vec3) {
      overlay.scale = { ...v };
      deps.bus.enqueue(
        SetScaleCmd.create(
          { scale: { ...v } },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.scale" } },
        ),
      );
    },
    get velocity() { return velocityProxy; },
    set velocity(v: Vec3) {
      overlay.velocity = { ...v };
      deps.bus.enqueue(
        SetVelocityCmd.create(
          { velocity: { ...v } },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.velocity" } },
        ),
      );
    },

    // Visual
    get color() { return overlay.color ?? readState().color; },
    set color(v: string) {
      overlay.color = v;
      deps.bus.enqueue(
        SetColorCmd.create(
          { color: v },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.color" } },
        ),
      );
    },
    get visible() { return overlay.visible ?? readState().visible; },
    set visible(v: boolean) {
      overlay.visible = v;
      deps.bus.enqueue(
        SetVisibleCmd.create(
          { visible: v },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.visible" } },
        ),
      );
    },
    get transparency() { return overlay.transparency ?? readState().transparency; },
    set transparency(v: number) {
      overlay.transparency = v;
      deps.bus.enqueue(
        SetTransparencyCmd.create(
          { transparency: v },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.transparency" } },
        ),
      );
    },

    // Physics
    get anchored() { return overlay.anchored ?? readState().anchored; },
    set anchored(v: boolean) {
      overlay.anchored = v;
      deps.bus.enqueue(
        SetAnchoredCmd.create(
          { anchored: v },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.anchored" } },
        ),
      );
    },
    get canCollide() { return overlay.canCollide ?? readState().canCollide; },
    set canCollide(v: boolean) {
      overlay.canCollide = v;
      deps.bus.enqueue(
        SetCanCollideCmd.create(
          { canCollide: v },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.canCollide" } },
        ),
      );
    },

    /** Internal — clear per-tick overlay after server commit. */
    _clearOverlay() {
      overlay.position = undefined;
      overlay.rotation = undefined;
      overlay.scale = undefined;
      overlay.velocity = undefined;
      overlay.color = undefined;
      overlay.visible = undefined;
      overlay.transparency = undefined;
      overlay.anchored = undefined;
      overlay.canCollide = undefined;
    },

    /** Tween object properties over time. */
    tween(to: Record<string, number>, duration: number, easing?: string) {
      deps.bus.enqueue(
        TweenCmd.create(
          { properties: to, duration, easing },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.tween" } },
        ),
      );
    },

    /** Destroy this object. */
    destroy() {
      deps.bus.enqueue(
        DestroyCmd.create(
          { entityId: entity },
          { entity, issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "Object.destroy" } },
        ),
      );
    },
  };
}

// ============================================================================
// Game API Proxy (for spawn, etc.)
// ============================================================================

export interface GameProxyDeps {
  bus: CommandBus;
  issuedBy?: string;
  origin?: CommandOrigin;
}

/**
 * Create a proxy for game-level operations (spawn, etc.).
 */
export function createGameProxy(deps: GameProxyDeps) {
  return {
    spawn(name: string, opts?: {
      primitiveType?: string;
      position?: Partial<Vec3>;
      rotation?: Partial<Vec3>;
      scale?: Partial<Vec3>;
      color?: string;
      anchored?: boolean;
      canCollide?: boolean;
    }) {
      deps.bus.enqueue(
        SpawnCmd.create(
          { name, ...opts },
          { issuedBy: deps.issuedBy, origin: { ...deps.origin, apiPath: "game.spawn" } },
        ),
      );
    },
  };
}
