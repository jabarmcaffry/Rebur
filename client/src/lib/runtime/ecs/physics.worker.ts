/**
 * Physics Web Worker
 * 
 * This worker handles physics simulation off the main thread to prevent jank.
 * It receives serialized entity data, runs physics computations, and returns deltas.
 * 
 * Features:
 * - Gravity integration (world gravity + gravity sources)
 * - Velocity integration
 * - Player movement physics
 * - Air drag
 * - Delta compression (only send changed values)
 */

/// <reference lib="webworker" />

// Types mirrored from worker-runner.ts
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface SerializedEntity {
  id: number;
  transform?: { 
    position: Vec3; 
    rotation: Vec3; 
    scale: Vec3;
  };
  velocity?: Vec3;
  physics?: { 
    anchored: boolean; 
    canCollide: boolean; 
    mass: number; 
    friction: number;
  };
  player?: { 
    ragdoll: boolean; 
    health: number; 
    killY: number;
  };
  playerPhysics?: { 
    onGround: boolean; 
    up: Vec3; 
    collisionRadius: number; 
    collisionHalfHeight: number; 
    walkSpeed: number; 
    runSpeed: number; 
    jumpPower: number; 
    moveForward: Vec3; 
    sprinting: boolean;
  };
  gravitySource?: { 
    strength: number; 
    radius: number;
  };
  motorPinned?: boolean;
}

interface WorkerMessage {
  type: "run-system";
  systemId: string;
  dt: number;
  tick: number;
  entities: SerializedEntity[];
  worldPhysics: { gravity: number; airDrag: number };
  inputState: { 
    moveX: number; 
    moveZ: number; 
    jump: boolean; 
    keys?: Record<string, boolean>;
    cameraForward: Vec3;
  };
}

interface EntityDelta {
  id: number;
  transform?: Partial<{ position: Vec3; rotation: Vec3; scale: Vec3 }>;
  velocity?: Partial<Vec3>;
  playerPhysics?: Partial<{ 
    onGround: boolean; 
    up: Vec3; 
    moveForward: Vec3; 
    sprinting: boolean;
  }>;
}

interface WorkerResult {
  type: "system-complete";
  systemId: string;
  tick: number;
  deltas: EntityDelta[];
  profiling?: {
    entityCount: number;
    gravitySourceCount: number;
    executionTimeMs: number;
  };
}

// Vector math utilities
function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vec3Clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function vec3Equal(a: Vec3, b: Vec3, epsilon = 0.0001): boolean {
  return Math.abs(a.x - b.x) < epsilon && 
         Math.abs(a.y - b.y) < epsilon && 
         Math.abs(a.z - b.z) < epsilon;
}

/**
 * Compute gravity acceleration for a position, considering gravity sources.
 */
function computeGravity(
  position: Vec3,
  gravitySources: { position: Vec3; strength: number; radius: number }[],
  worldGravity: number
): Vec3 {
  let gx = 0, gy = -worldGravity, gz = 0;
  
  for (const source of gravitySources) {
    const dx = source.position.x - position.x;
    const dy = source.position.y - position.y;
    const dz = source.position.z - position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (dist < source.radius && dist > 0.01) {
      const strength = source.strength * Math.min(1, (source.radius - dist) / source.radius);
      const norm = 1 / dist;
      gx += dx * norm * strength;
      gy += dy * norm * strength;
      gz += dz * norm * strength;
    }
  }
  
  return { x: gx, y: gy, z: gz };
}

/**
 * Process physics for all entities.
 */
function runPhysics(message: WorkerMessage): EntityDelta[] {
  const { entities, worldPhysics, inputState, dt } = message;
  const deltas: EntityDelta[] = [];
  
  // Collect gravity sources
  const gravitySources: { position: Vec3; strength: number; radius: number }[] = [];
  for (const entity of entities) {
    if (entity.gravitySource && entity.transform) {
      gravitySources.push({
        position: entity.transform.position,
        strength: entity.gravitySource.strength,
        radius: entity.gravitySource.radius,
      });
    }
  }
  
  // Process each entity
  for (const entity of entities) {
    const delta: EntityDelta = { id: entity.id };
    let hasChanges = false;
    
    // Store original values for delta comparison
    const originalPosition = entity.transform ? vec3Clone(entity.transform.position) : null;
    const originalVelocity = entity.velocity ? vec3Clone(entity.velocity) : null;
    
    // Player physics
    if (entity.player && entity.playerPhysics && entity.transform && entity.velocity) {
      const playerPhys = entity.playerPhysics;
      const transform = entity.transform;
      const velocity = entity.velocity;
      const originalUp = vec3Clone(playerPhys.up);
      const originalMoveForward = vec3Clone(playerPhys.moveForward);
      const originalSprinting = playerPhys.sprinting;
      
      if (entity.player.ragdoll) {
        // Ragdolled: scrub horizontal control velocity
        velocity.x *= 1 - Math.min(1, dt * 2);
        velocity.z *= 1 - Math.min(1, dt * 2);
      } else {
        // Calculate gravity vector
        const gravityVec = computeGravity(transform.position, gravitySources, worldPhysics.gravity);
        const gMag = vec3Length(gravityVec);
        
        // Update player up direction (slerp toward anti-gravity)
        const desiredUp = gMag > 0.001
          ? { x: -gravityVec.x / gMag, y: -gravityVec.y / gMag, z: -gravityVec.z / gMag }
          : { x: 0, y: 1, z: 0 };
        const slerpT = Math.min(1, dt * 6);
        playerPhys.up.x += (desiredUp.x - playerPhys.up.x) * slerpT;
        playerPhys.up.y += (desiredUp.y - playerPhys.up.y) * slerpT;
        playerPhys.up.z += (desiredUp.z - playerPhys.up.z) * slerpT;
        const upNorm = vec3Normalize(playerPhys.up);
        playerPhys.up.x = upNorm.x;
        playerPhys.up.y = upNorm.y;
        playerPhys.up.z = upNorm.z;
        
        // Project camera forward onto plane perpendicular to up
        const cf = inputState.cameraForward;
        const cfDot = vec3Dot(cf, playerPhys.up);
        let fx = cf.x - playerPhys.up.x * cfDot;
        let fy = cf.y - playerPhys.up.y * cfDot;
        let fz = cf.z - playerPhys.up.z * cfDot;
        let fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
        
        if (fLen < 0.15) {
          fx = playerPhys.moveForward.x;
          fy = playerPhys.moveForward.y;
          fz = playerPhys.moveForward.z;
          fLen = vec3Length(playerPhys.moveForward) || 1;
        }
        fx /= fLen; fy /= fLen; fz /= fLen;
        
        // Blend move forward direction
        const fwdBlend = Math.min(1, dt * 8);
        playerPhys.moveForward.x += (fx - playerPhys.moveForward.x) * fwdBlend;
        playerPhys.moveForward.y += (fy - playerPhys.moveForward.y) * fwdBlend;
        playerPhys.moveForward.z += (fz - playerPhys.moveForward.z) * fwdBlend;
        const fwdNorm = vec3Normalize(playerPhys.moveForward);
        playerPhys.moveForward.x = fwdNorm.x;
        playerPhys.moveForward.y = fwdNorm.y;
        playerPhys.moveForward.z = fwdNorm.z;
        
        // Calculate right vector
        const right = vec3Cross(playerPhys.moveForward, playerPhys.up);
        
        // Sprint check
        const keys = inputState.keys ?? {};
        const sprinting = !!(keys["shift"] || keys["shiftleft"] || keys["shiftright"]);
        playerPhys.sprinting = sprinting;
        const baseSpeed = sprinting ? playerPhys.runSpeed : playerPhys.walkSpeed;
        
        // Calculate movement direction
        const wantX = right.x * inputState.moveX - playerPhys.moveForward.x * inputState.moveZ;
        const wantZ = right.z * inputState.moveX - playerPhys.moveForward.z * inputState.moveZ;
        
        // Apply horizontal velocity
        const upVelDot = vec3Dot(velocity, playerPhys.up);
        velocity.x = wantX * baseSpeed + playerPhys.up.x * upVelDot;
        velocity.z = wantZ * baseSpeed + playerPhys.up.z * upVelDot;
        
        // Jump
        if (inputState.jump && playerPhys.onGround) {
          velocity.x += playerPhys.up.x * playerPhys.jumpPower;
          velocity.y += playerPhys.up.y * playerPhys.jumpPower;
          velocity.z += playerPhys.up.z * playerPhys.jumpPower;
          playerPhys.onGround = false;
        }
        
        // Apply gravity
        velocity.x += gravityVec.x * dt;
        velocity.y += gravityVec.y * dt;
        velocity.z += gravityVec.z * dt;
      }
      
      // Integrate position
      transform.position.x += velocity.x * dt;
      transform.position.y += velocity.y * dt;
      transform.position.z += velocity.z * dt;
      
      // Reset onGround before collision phase
      playerPhys.onGround = false;
      
      // Build delta for player physics
      if (!vec3Equal(playerPhys.up, originalUp) || 
          !vec3Equal(playerPhys.moveForward, originalMoveForward) ||
          playerPhys.sprinting !== originalSprinting) {
        delta.playerPhysics = {
          onGround: playerPhys.onGround,
          up: vec3Clone(playerPhys.up),
          moveForward: vec3Clone(playerPhys.moveForward),
          sprinting: playerPhys.sprinting,
        };
        hasChanges = true;
      }
    }
    // Non-player object physics
    else if (entity.physics && entity.transform && entity.velocity && !entity.motorPinned) {
      if (!entity.physics.anchored) {
        const transform = entity.transform;
        const velocity = entity.velocity;
        
        // Calculate gravity
        const gravityVec = computeGravity(transform.position, gravitySources, worldPhysics.gravity);
        
        // Integrate gravity into velocity
        velocity.x += gravityVec.x * dt;
        velocity.y += gravityVec.y * dt;
        velocity.z += gravityVec.z * dt;
        
        // Apply air drag
        if (worldPhysics.airDrag > 0) {
          const drag = 1 - worldPhysics.airDrag * dt;
          velocity.x *= drag;
          velocity.y *= drag;
          velocity.z *= drag;
        }
        
        // Integrate velocity into position
        transform.position.x += velocity.x * dt;
        transform.position.y += velocity.y * dt;
        transform.position.z += velocity.z * dt;
      }
    }
    
    // Build transform delta
    if (entity.transform && originalPosition && !vec3Equal(entity.transform.position, originalPosition)) {
      delta.transform = {
        position: vec3Clone(entity.transform.position),
      };
      hasChanges = true;
    }
    
    // Build velocity delta
    if (entity.velocity && originalVelocity && !vec3Equal(entity.velocity, originalVelocity)) {
      delta.velocity = vec3Clone(entity.velocity);
      hasChanges = true;
    }
    
    if (hasChanges) {
      deltas.push(delta);
    }
  }
  
  return deltas;
}

// Worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  
  if (message.type !== "run-system") {
    return;
  }
  
  const startTime = performance.now();
  
  let deltas: EntityDelta[] = [];
  
  if (message.systemId === "physics") {
    deltas = runPhysics(message);
  }
  
  const executionTime = performance.now() - startTime;
  
  // Collect gravity sources count for profiling
  let gravitySourceCount = 0;
  for (const entity of message.entities) {
    if (entity.gravitySource) gravitySourceCount++;
  }
  
  const result: WorkerResult = {
    type: "system-complete",
    systemId: message.systemId,
    tick: message.tick,
    deltas,
    profiling: {
      entityCount: message.entities.length,
      gravitySourceCount,
      executionTimeMs: executionTime,
    },
  };
  
  self.postMessage(result);
};

// Export for type checking (not actually used in worker context)
export type { WorkerMessage, WorkerResult, EntityDelta, SerializedEntity };
