/**
 * Touch and Physics System
 * 
 * Handles detecting player/object collisions with proper state management
 * to prevent jitter, spam, and physics instability in heavy games.
 * 
 * Features:
 * - Touch state machine (entering, active, exiting, none)
 * - Debouncing to prevent jitter/spam
 * - Rate limiting per object pair
 * - Collision categories for filtering
 * - Sleep/wake states for physics bodies
 * - New events: touchStarted, touchEnded, woke, slept
 */

import type { RuntimeObject, RuntimePlayer, Vec3 } from "../types";

// ============================================================================
// Collision Categories (bitmask for filtering)
// ============================================================================

export const CollisionCategory = {
  Default: 1 << 0,    // 1
  Player: 1 << 1,     // 2
  Static: 1 << 2,     // 4
  Dynamic: 1 << 3,    // 8
  Trigger: 1 << 4,    // 16
  Projectile: 1 << 5, // 32
  Pickup: 1 << 6,     // 64
  Character: 1 << 7,  // 128
  All: 0xFFFF,
} as const;

export type CollisionCategoryName = keyof typeof CollisionCategory;

// ============================================================================
// Touch State Machine
// ============================================================================

export type TouchState = "none" | "entering" | "active" | "exiting";

export interface TouchContact {
  objectId: string;
  state: TouchState;
  /** Time when the touch started (for debouncing) */
  startTime: number;
  /** Time of last touch event (for rate limiting) */
  lastEventTime: number;
  /** Number of consecutive frames in contact */
  frameCount: number;
  /** Penetration depth for physics response */
  penetration: number;
  /** Contact normal */
  normal: Vec3;
}

// ============================================================================
// Sleep/Wake State for Physics Bodies
// ============================================================================

export type BodyState = "awake" | "sleeping";

export interface PhysicsBody {
  objectId: string;
  state: BodyState;
  /** Velocity threshold below which body can sleep */
  sleepThreshold: number;
  /** Frames at low velocity before sleeping */
  sleepFrames: number;
  /** Current count of low-velocity frames */
  sleepCounter: number;
  /** Linear velocity magnitude */
  linearSpeed: number;
  /** Angular velocity magnitude */
  angularSpeed: number;
}

// ============================================================================
// Touch System Configuration
// ============================================================================

export interface TouchSystemConfig {
  /** Minimum time (ms) between touch events for same pair */
  rateLimit: number;
  /** Frames required before touch is confirmed (debounce) */
  debounceFrames: number;
  /** Frames without contact before exiting touch state */
  exitFrames: number;
  /** Velocity below which bodies can sleep */
  sleepThreshold: number;
  /** Frames at low velocity before sleeping */
  sleepDelay: number;
  /** Maximum touch events per frame (prevents spam) */
  maxEventsPerFrame: number;
}

const DEFAULT_CONFIG: TouchSystemConfig = {
  rateLimit: 50,        // 50ms between events
  debounceFrames: 2,    // 2 frames to confirm touch
  exitFrames: 3,        // 3 frames without contact to exit
  sleepThreshold: 0.01, // Very low velocity
  sleepDelay: 60,       // 60 frames (~1 second at 60fps)
  maxEventsPerFrame: 10,
};

// ============================================================================
// Touch System Context
// ============================================================================

export type TouchSystemContext = {
  /** Map of object ID to touch contact state */
  contacts: Map<string, TouchContact>;
  /** Map of object ID to physics body state */
  bodies: Map<string, PhysicsBody>;
  /** Configuration */
  config: TouchSystemConfig;
  /** Function to emit events on an object */
  emitObjectEvent: (objId: string, event: string, args: any[]) => void;
  /** Push a log message */
  pushLog: (line: string) => void;
  /** Remove an object from the game */
  removeObject: (id: string) => void;
  /** Rebuild container indexes after object removal */
  rebuildIndexes: () => void;
  /** Get object by ID */
  getObject: (id: string) => RuntimeObject | undefined;
  /** Events fired this frame (for rate limiting) */
  frameEventCount: number;
};

/**
 * Create a new touch system context
 */
export function createTouchSystemContext(
  config: Partial<TouchSystemConfig> = {}
): TouchSystemContext {
  return {
    contacts: new Map(),
    bodies: new Map(),
    config: { ...DEFAULT_CONFIG, ...config },
    emitObjectEvent: () => {},
    pushLog: () => {},
    removeObject: () => {},
    rebuildIndexes: () => {},
    getObject: () => undefined,
    frameEventCount: 0,
  };
}

// ============================================================================
// Legacy Compatibility (for existing code)
// ============================================================================

/** Legacy context - maps to new system */
export type LegacyTouchContext = {
  playerContacts: Set<string>;
  emitObjectEvent: (objId: string, event: string, args: any[]) => void;
  pushLog: (line: string) => void;
  removeObject: (id: string) => void;
  rebuildIndexes: () => void;
  getObject: (id: string) => RuntimeObject | undefined;
};

/**
 * Convert legacy context to new touch system context
 */
export function fromLegacyContext(legacy: LegacyTouchContext): TouchSystemContext {
  const ctx = createTouchSystemContext();
  ctx.emitObjectEvent = legacy.emitObjectEvent;
  ctx.pushLog = legacy.pushLog;
  ctx.removeObject = legacy.removeObject;
  ctx.rebuildIndexes = legacy.rebuildIndexes;
  ctx.getObject = legacy.getObject;
  
  // Import existing contacts
  for (const id of legacy.playerContacts) {
    ctx.contacts.set(id, {
      objectId: id,
      state: "active",
      startTime: Date.now(),
      lastEventTime: Date.now(),
      frameCount: ctx.config.debounceFrames,
      penetration: 0,
      normal: { x: 0, y: 1, z: 0 },
    });
  }
  
  return ctx;
}

// ============================================================================
// Collision Detection Helpers
// ============================================================================

interface CollisionResult {
  touching: boolean;
  penetration: number;
  normal: Vec3;
}

/**
 * Check AABB vs AABB collision
 */
function checkAABB(
  posA: Vec3, scaleA: Vec3, radiusA: number, halfHeightA: number,
  posB: Vec3, scaleB: Vec3
): CollisionResult {
  const halfA = { x: radiusA, y: halfHeightA, z: radiusA };
  const halfB = { x: scaleB.x * 0.5, y: scaleB.y * 0.5, z: scaleB.z * 0.5 };
  
  const centerA = { x: posA.x, y: posA.y + halfHeightA, z: posA.z };
  
  const dx = Math.abs(centerA.x - posB.x) - (halfA.x + halfB.x);
  const dy = Math.abs(centerA.y - posB.y) - (halfA.y + halfB.y);
  const dz = Math.abs(centerA.z - posB.z) - (halfA.z + halfB.z);
  
  if (dx > 0 || dy > 0 || dz > 0) {
    return { touching: false, penetration: 0, normal: { x: 0, y: 1, z: 0 } };
  }
  
  // Find smallest penetration axis
  const pen = Math.max(dx, dy, dz);
  let normal: Vec3 = { x: 0, y: 1, z: 0 };
  
  if (pen === dx) {
    normal = { x: Math.sign(centerA.x - posB.x), y: 0, z: 0 };
  } else if (pen === dy) {
    normal = { x: 0, y: Math.sign(centerA.y - posB.y), z: 0 };
  } else {
    normal = { x: 0, y: 0, z: Math.sign(centerA.z - posB.z) };
  }
  
  return { touching: true, penetration: -pen, normal };
}

/**
 * Check Sphere vs Capsule collision
 */
function checkSphereVsCapsule(
  spherePos: Vec3, sphereRadius: number,
  capsulePos: Vec3, capsuleRadius: number, capsuleHalfHeight: number
): CollisionResult {
  const capsuleCenter = { x: capsulePos.x, y: capsulePos.y + capsuleHalfHeight, z: capsulePos.z };
  
  // Clamp sphere center to capsule line segment
  const clampedY = Math.max(
    capsulePos.y,
    Math.min(capsulePos.y + capsuleHalfHeight * 2, spherePos.y)
  );
  
  const closestPoint = { x: capsulePos.x, y: clampedY, z: capsulePos.z };
  
  const dx = spherePos.x - closestPoint.x;
  const dy = spherePos.y - closestPoint.y;
  const dz = spherePos.z - closestPoint.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  const combinedRadius = sphereRadius + capsuleRadius;
  
  if (dist > combinedRadius) {
    return { touching: false, penetration: 0, normal: { x: 0, y: 1, z: 0 } };
  }
  
  const invDist = dist > 0.0001 ? 1 / dist : 0;
  const normal: Vec3 = dist > 0.0001
    ? { x: dx * invDist, y: dy * invDist, z: dz * invDist }
    : { x: 0, y: 1, z: 0 };
  
  return { touching: true, penetration: combinedRadius - dist, normal };
}

// ============================================================================
// Main Touch Detection
// ============================================================================

/**
 * Run touch sweep with enhanced state machine
 */
export function runTouchSweep(
  player: RuntimePlayer,
  objectList: RuntimeObject[],
  ctx: TouchSystemContext | LegacyTouchContext
): void {
  // Handle legacy context
  const isLegacy = 'playerContacts' in ctx;
  const touchCtx: TouchSystemContext = isLegacy ? fromLegacyContext(ctx) : ctx;
  
  const now = Date.now();
  const pr = player.collisionRadius ?? 0.4;
  const ph = player.collisionHalfHeight ?? 1.12;
  
  touchCtx.frameEventCount = 0;
  const seenThisFrame = new Set<string>();
  
  for (const o of objectList) {
    if (!o.visible || o.type === "light" || o.type === "spawn" || o.container !== "Workspace") continue;
    
    // Get collision category (default if not set)
    const category = (o as any).collisionCategory ?? CollisionCategory.Default;
    const mask = (o as any).collisionMask ?? CollisionCategory.All;
    
    // Check if player can collide with this category
    if ((CollisionCategory.Player & mask) === 0) continue;
    
    // Perform collision check
    let result: CollisionResult;
    
    if (o.primitiveType === "sphere") {
      const r = Math.max(o.scale.x, o.scale.y, o.scale.z) * 0.5;
      result = checkSphereVsCapsule(o.position, r, player.position, pr, ph);
    } else {
      result = checkAABB(player.position, { x: pr * 2, y: ph * 2, z: pr * 2 }, pr, ph, o.position, o.scale);
    }
    
    if (result.touching) {
      seenThisFrame.add(o.id);
      processTouch(o.id, player, o, result, now, touchCtx);
    }
  }
  
  // Process exits for objects no longer touching
  for (const [id, contact] of touchCtx.contacts) {
    if (!seenThisFrame.has(id)) {
      processExit(id, player, now, touchCtx);
    }
  }
  
  // Sync back to legacy context if needed
  if (isLegacy) {
    const legacyCtx = ctx as LegacyTouchContext;
    legacyCtx.playerContacts.clear();
    for (const [id, contact] of touchCtx.contacts) {
      if (contact.state === "active") {
        legacyCtx.playerContacts.add(id);
      }
    }
  }
}

/**
 * Process a touch event with debouncing
 */
function processTouch(
  objectId: string,
  player: RuntimePlayer,
  obj: RuntimeObject,
  result: CollisionResult,
  now: number,
  ctx: TouchSystemContext
): void {
  let contact = ctx.contacts.get(objectId);
  
  if (!contact) {
    // New contact - enter "entering" state
    contact = {
      objectId,
      state: "entering",
      startTime: now,
      lastEventTime: 0,
      frameCount: 1,
      penetration: result.penetration,
      normal: result.normal,
    };
    ctx.contacts.set(objectId, contact);
  } else {
    contact.frameCount++;
    contact.penetration = result.penetration;
    contact.normal = result.normal;
    
    // Reset exit state if we're touching again
    if (contact.state === "exiting") {
      contact.state = "active";
    }
  }
  
  // Debounce: require multiple frames before confirming touch
  if (contact.state === "entering" && contact.frameCount >= ctx.config.debounceFrames) {
    contact.state = "active";
    
    // Fire touchStarted (new) and touched (legacy) events
    if (canFireEvent(contact, now, ctx)) {
      contact.lastEventTime = now;
      ctx.frameEventCount++;
      ctx.emitObjectEvent(objectId, "touchStarted", [player, obj, result.penetration, result.normal]);
      ctx.emitObjectEvent(objectId, "touched", [player, obj]);
    }
  }
}

/**
 * Process exit from touch state
 */
function processExit(
  objectId: string,
  player: RuntimePlayer,
  now: number,
  ctx: TouchSystemContext
): void {
  const contact = ctx.contacts.get(objectId);
  if (!contact) return;
  
  if (contact.state === "active") {
    // Start exit process
    contact.state = "exiting";
    contact.frameCount = 1;
  } else if (contact.state === "exiting") {
    contact.frameCount++;
    
    // Confirm exit after enough frames
    if (contact.frameCount >= ctx.config.exitFrames) {
      const obj = ctx.getObject(objectId);
      
      if (canFireEvent(contact, now, ctx)) {
        ctx.frameEventCount++;
        ctx.emitObjectEvent(objectId, "touchEnded", [player, obj]);
        ctx.emitObjectEvent(objectId, "untouched", [player, obj]);
      }
      
      ctx.contacts.delete(objectId);
    }
  } else if (contact.state === "entering") {
    // Never confirmed - just remove
    ctx.contacts.delete(objectId);
  }
}

/**
 * Check if we can fire an event (rate limiting)
 */
function canFireEvent(contact: TouchContact, now: number, ctx: TouchSystemContext): boolean {
  if (ctx.frameEventCount >= ctx.config.maxEventsPerFrame) return false;
  if (now - contact.lastEventTime < ctx.config.rateLimit) return false;
  return true;
}

// ============================================================================
// Physics Body Sleep/Wake
// ============================================================================

/**
 * Update physics body sleep states
 */
export function updatePhysicsBodies(
  objectList: RuntimeObject[],
  ctx: TouchSystemContext
): void {
  for (const obj of objectList) {
    // Only track dynamic objects
    if (obj.anchored || obj.container !== "Workspace") continue;
    
    let body = ctx.bodies.get(obj.id);
    
    const linearSpeed = Math.sqrt(
      obj.velocity.x * obj.velocity.x +
      obj.velocity.y * obj.velocity.y +
      obj.velocity.z * obj.velocity.z
    );
    
    if (!body) {
      body = {
        objectId: obj.id,
        state: "awake",
        sleepThreshold: ctx.config.sleepThreshold,
        sleepFrames: ctx.config.sleepDelay,
        sleepCounter: 0,
        linearSpeed,
        angularSpeed: 0,
      };
      ctx.bodies.set(obj.id, body);
    }
    
    body.linearSpeed = linearSpeed;
    
    if (body.state === "awake") {
      if (linearSpeed < body.sleepThreshold) {
        body.sleepCounter++;
        if (body.sleepCounter >= body.sleepFrames) {
          body.state = "sleeping";
          ctx.emitObjectEvent(obj.id, "slept", [obj]);
        }
      } else {
        body.sleepCounter = 0;
      }
    } else if (body.state === "sleeping") {
      // Check if something woke us up
      if (linearSpeed > body.sleepThreshold * 2) {
        body.state = "awake";
        body.sleepCounter = 0;
        ctx.emitObjectEvent(obj.id, "woke", [obj]);
      }
    }
  }
}

/**
 * Wake a sleeping body (call when force is applied)
 */
export function wakeBody(objectId: string, ctx: TouchSystemContext): void {
  const body = ctx.bodies.get(objectId);
  if (body && body.state === "sleeping") {
    body.state = "awake";
    body.sleepCounter = 0;
    const obj = ctx.getObject(objectId);
    if (obj) {
      ctx.emitObjectEvent(objectId, "woke", [obj]);
    }
  }
}

/**
 * Check if a body is sleeping
 */
export function isBodySleeping(objectId: string, ctx: TouchSystemContext): boolean {
  const body = ctx.bodies.get(objectId);
  return body !== undefined && body.state === "sleeping";
}

// ============================================================================
// Pickup System
// ============================================================================

/**
 * Run pickup sweep - automatically picks up objects with isPickup=true
 * that are within range of the player.
 */
export function runPickupSweep(
  player: RuntimePlayer,
  objectList: RuntimeObject[],
  ctx: TouchSystemContext | LegacyTouchContext
): boolean {
  const touchCtx = 'playerContacts' in ctx ? fromLegacyContext(ctx) : ctx;
  const radius = 1.0;
  let removed = false;
  
  for (const o of objectList) {
    if (!o.isPickup) continue;
    const dx = player.position.x - o.position.x;
    const dy = player.position.y - o.position.y;
    const dz = player.position.z - o.position.z;
    if (Math.hypot(dx, dy, dz) > radius) continue;
    
    const slot = player.inventory.add(o.pickupName ?? o.name, { 
      template: o.name, 
      data: o.pickupData ?? {} 
    });
    
    if (slot) {
      touchCtx.pushLog(`Picked up ${o.pickupName ?? o.name}.`);
      touchCtx.removeObject(o.id);
      removed = true;
    }
  }
  
  if (removed) touchCtx.rebuildIndexes();
  return removed;
}

/**
 * Clear contact for a specific object (call when object is destroyed)
 */
export function clearContact(ctx: TouchSystemContext | Set<string>, id: string): void {
  if (ctx instanceof Set) {
    // Legacy: Set<string>
    ctx.delete(id);
  } else {
    ctx.contacts.delete(id);
    ctx.bodies.delete(id);
  }
}

// ============================================================================
// Collision Groups (for advanced filtering)
// ============================================================================

export interface CollisionGroup {
  name: string;
  category: number;
  mask: number;
}

const collisionGroups = new Map<string, CollisionGroup>();

/**
 * Register a collision group
 */
export function registerCollisionGroup(name: string, category: number, mask: number): void {
  collisionGroups.set(name, { name, category, mask });
}

/**
 * Get collision group by name
 */
export function getCollisionGroup(name: string): CollisionGroup | undefined {
  return collisionGroups.get(name);
}

/**
 * Set collision group on an object
 */
export function setCollisionGroup(obj: RuntimeObject, groupName: string): void {
  const group = collisionGroups.get(groupName);
  if (group) {
    (obj as any).collisionCategory = group.category;
    (obj as any).collisionMask = group.mask;
  }
}

// Register default groups
registerCollisionGroup("Default", CollisionCategory.Default, CollisionCategory.All);
registerCollisionGroup("Static", CollisionCategory.Static, CollisionCategory.All);
registerCollisionGroup("Dynamic", CollisionCategory.Dynamic, CollisionCategory.All);
registerCollisionGroup("Trigger", CollisionCategory.Trigger, CollisionCategory.Player | CollisionCategory.Character);
registerCollisionGroup("Pickup", CollisionCategory.Pickup, CollisionCategory.Player);
registerCollisionGroup("Projectile", CollisionCategory.Projectile, CollisionCategory.Default | CollisionCategory.Static | CollisionCategory.Character);
