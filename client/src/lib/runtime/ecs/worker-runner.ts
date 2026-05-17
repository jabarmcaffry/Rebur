/**
 * WorkerRunner — executes systems on a dedicated Web Worker thread.
 *
 * This allows CPU-intensive systems like physics and collision to run in
 * parallel with the main thread, preventing jank during complex simulations.
 *
 * Architecture:
 * 1. Main thread serializes relevant component data and sends to worker
 * 2. Worker runs the system and computes deltas
 * 3. Worker sends deltas back to main thread
 * 4. Main thread applies deltas to the ECS world
 */
import type { SystemDef, SystemRunner, SystemContext } from "./system";
import { InlineRunner } from "./system";
import type { World, EntityId, ComponentDef } from "./world";
import { Transform, Velocity, Physics, Player, InputState } from "./components";
import { PlayerPhysics, WorldPhysics, GravitySource, MotorPinned } from "./systems/physics-system";

/** Message sent to the worker */
export interface WorkerMessage {
  type: "run-system";
  systemId: string;
  dt: number;
  tick: number;
  /** Serialized component data for entities the system needs */
  entities: SerializedEntity[];
  /** World-level singletons */
  worldPhysics: { gravity: number; airDrag: number };
  inputState: { 
    moveX: number; 
    moveZ: number; 
    jump: boolean; 
    keys?: Record<string, boolean>;
    cameraForward: { x: number; y: number; z: number };
  };
}

/** Entity data sent to worker */
export interface SerializedEntity {
  id: number;
  transform?: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } };
  velocity?: { x: number; y: number; z: number };
  physics?: { anchored: boolean; canCollide: boolean; mass: number; friction: number };
  player?: { ragdoll: boolean; health: number; killY: number };
  playerPhysics?: { onGround: boolean; up: { x: number; y: number; z: number }; collisionRadius: number; collisionHalfHeight: number; walkSpeed: number; runSpeed: number; jumpPower: number; moveForward: { x: number; y: number; z: number }; sprinting: boolean };
  gravitySource?: { strength: number; radius: number };
  motorPinned?: boolean;
}

/** Message received from worker */
export interface WorkerResult {
  type: "system-complete";
  systemId: string;
  tick: number;
  /** Delta updates to apply to entities */
  deltas: EntityDelta[];
  /** Optional profiling information */
  profiling?: {
    entityCount: number;
    gravitySourceCount: number;
    executionTimeMs: number;
  };
}

/** Component deltas from worker */
export interface EntityDelta {
  id: number;
  transform?: Partial<{ position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }>;
  velocity?: Partial<{ x: number; y: number; z: number }>;
  playerPhysics?: Partial<{ onGround: boolean; up: { x: number; y: number; z: number }; moveForward: { x: number; y: number; z: number }; sprinting: boolean }>;
}

/**
 * Configuration for the worker runner.
 */
export interface WorkerRunnerOptions {
  /** Whether to actually use a worker (false = inline fallback) */
  useWorker?: boolean;
  /** Systems that should run on the worker */
  workerSystems?: Set<string>;
  /** URL to the worker script (if not provided, will try to create inline) */
  workerUrl?: string;
  /** Auto-initialize worker on first physics system call */
  autoInit?: boolean;
}

/** Default systems that benefit from worker execution */
const DEFAULT_WORKER_SYSTEMS = new Set(["physics", "collision"]);

/**
 * Worker-based system runner that offloads computation to a Web Worker.
 * 
 * Features:
 * - Physics and Collision systems can run in parallel
 * - Main thread stays responsive during complex simulations
 * - Automatic fallback to inline execution if worker unavailable
 * - Delta-based updates minimize data transfer
 * - Auto-initializes worker on first physics call (opt-in via autoInit)
 */
export class WorkerRunner implements SystemRunner {
  private worker: Worker | null = null;
  private pending: Map<string, { 
    resolve: () => void; 
    reject: (e: Error) => void;
    ctx: SystemContext;
    system: SystemDef;
  }> = new Map();
  private options: WorkerRunnerOptions;
  private useWorker: boolean;
  private world: World | null = null;
  private initAttempted = false;
  
  /** Profiling stats from the last worker execution */
  lastProfilingStats: WorkerResult["profiling"] | null = null;

  constructor(options: WorkerRunnerOptions = {}) {
    this.options = {
      ...options,
      workerSystems: options.workerSystems ?? DEFAULT_WORKER_SYSTEMS,
      autoInit: options.autoInit ?? true, // Auto-init by default
    };
    this.useWorker = options.useWorker ?? true; // Enabled by default
    
    // Don't initialize immediately - wait for first system call if autoInit is true
    if (!this.options.autoInit && this.useWorker && typeof Worker !== "undefined") {
      this.tryInitializeWorker();
    }
  }
  
  /**
   * Try to initialize the Web Worker.
   * Returns true if successful.
   */
  private tryInitializeWorker(): boolean {
    if (this.initAttempted) return this.worker !== null;
    this.initAttempted = true;
    
    if (typeof Worker === "undefined") {
      console.warn("[WorkerRunner] Web Workers not supported, using inline execution");
      this.useWorker = false;
      return false;
    }
    
    try {
      if (this.options.workerUrl) {
        // Use provided URL
        this.worker = new Worker(this.options.workerUrl, { type: "module" });
      } else {
        // Create inline worker from embedded code
        this.worker = this.createInlineWorker();
      }
      
      if (this.worker) {
        this.worker.onmessage = (event) => this.handleWorkerMessage(event);
        this.worker.onerror = (error) => {
          console.error("[WorkerRunner] Worker error:", error);
          this.handleWorkerFailure();
        };
        return true;
      }
    } catch (e) {
      console.warn("[WorkerRunner] Failed to initialize worker:", e);
    }
    
    this.useWorker = false;
    return false;
  }
  
  /**
   * Create an inline worker from embedded physics code.
   * This avoids the need for a separate bundled worker file.
   */
  private createInlineWorker(): Worker | null {
    // Embedded physics worker code (minified version of physics.worker.ts logic)
    const workerCode = `
// Physics Worker - Inline Version
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

self.onmessage = function(event) {
  const msg = event.data;
  if (msg.type !== "run-system") return;
  
  const { systemId, dt, tick, entities, worldPhysics, inputState } = msg;
  const deltas = [];
  const gravity = worldPhysics.gravity ?? 9.81;
  const airDrag = worldPhysics.airDrag ?? 0;
  
  // Find player and gravity sources
  let playerEntity = null;
  const gravitySources = [];
  
  for (const e of entities) {
    if (e.player && !e.player.ragdoll) playerEntity = e;
    if (e.gravitySource) gravitySources.push(e);
  }
  
  // Process player physics
  if (playerEntity && playerEntity.playerPhysics && playerEntity.velocity) {
    const pp = playerEntity.playerPhysics;
    const vel = playerEntity.velocity;
    const pos = playerEntity.transform?.position ?? { x: 0, y: 0, z: 0 };
    
    // Calculate gravity
    let gx = 0, gy = -gravity, gz = 0;
    
    for (const gs of gravitySources) {
      if (!gs.transform) continue;
      const gsp = gs.transform.position;
      const dx = gsp.x - pos.x;
      const dy = gsp.y - pos.y;
      const dz = gsp.z - pos.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      if (dist < gs.gravitySource.radius && dist > 0.1) {
        const str = gs.gravitySource.strength;
        const factor = str / dist;
        gx += dx * factor / dist;
        gy += dy * factor / dist;
        gz += dz * factor / dist;
      }
    }
    
    // Apply gravity
    if (!pp.onGround) {
      vel.x += gx * dt;
      vel.y += gy * dt;
      vel.z += gz * dt;
      
      // Air drag
      if (airDrag > 0) {
        const drag = Math.pow(1 - airDrag, dt);
        vel.x *= drag;
        vel.z *= drag;
      }
    }
    
    // Player movement
    const speed = pp.sprinting ? (pp.runSpeed ?? 12) : (pp.walkSpeed ?? 6);
    const moveX = inputState.moveX ?? 0;
    const moveZ = inputState.moveZ ?? 0;
    
    if (pp.onGround && (moveX !== 0 || moveZ !== 0)) {
      const fwd = pp.moveForward ?? inputState.cameraForward ?? { x: 0, y: 0, z: -1 };
      const fwdLen = Math.sqrt(fwd.x*fwd.x + fwd.z*fwd.z) || 1;
      const nx = fwd.x / fwdLen;
      const nz = fwd.z / fwdLen;
      
      const targetX = (nz * moveX - nx * moveZ) * speed;
      const targetZ = (-nx * moveX - nz * moveZ) * speed;
      
      vel.x = lerp(vel.x, targetX, Math.min(1, dt * 10));
      vel.z = lerp(vel.z, targetZ, Math.min(1, dt * 10));
    } else if (pp.onGround) {
      // Friction when not moving
      vel.x *= Math.pow(0.1, dt);
      vel.z *= Math.pow(0.1, dt);
    }
    
    // Jump
    if (inputState.jump && pp.onGround) {
      vel.y = pp.jumpPower ?? 8;
    }
    
    // Integrate position
    const newPos = {
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt,
      z: pos.z + vel.z * dt,
    };
    
    deltas.push({
      entityId: playerEntity.id,
      position: newPos,
      velocity: { x: vel.x, y: vel.y, z: vel.z },
    });
  }
  
  // Process non-anchored physics objects
  for (const e of entities) {
    if (e.player || !e.physics || e.physics.anchored || e.motorPinned) continue;
    if (!e.velocity || !e.transform) continue;
    
    const vel = e.velocity;
    const pos = e.transform.position;
    
    // Apply gravity
    vel.y -= gravity * dt;
    
    // Integrate
    const newPos = {
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt,
      z: pos.z + vel.z * dt,
    };
    
    deltas.push({
      entityId: e.id,
      position: newPos,
      velocity: { x: vel.x, y: vel.y, z: vel.z },
    });
  }
  
  // Send result
  self.postMessage({
    type: "system-complete",
    systemId,
    tick,
    deltas,
    profiling: {
      entityCount: entities.length,
      gravitySourceCount: gravitySources.length,
      executionTimeMs: performance.now() - event.timeStamp,
    },
  });
};
`;

    try {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url, { type: "classic" });
      
      // Clean up blob URL after worker is created
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      return worker;
    } catch (e) {
      console.warn("[WorkerRunner] Failed to create inline worker:", e);
      return null;
    }
  }
  
  /**
   * Handle worker failure - fallback all pending and disable worker.
   */
  private handleWorkerFailure(): void {
    for (const [key, pending] of this.pending) {
      InlineRunner.exec(pending.system, pending.ctx);
      pending.resolve();
    }
    this.pending.clear();
    this.useWorker = false;
    this.worker = null;
  }

  /**
   * Execute a system, potentially on a worker thread.
   * Returns a promise that resolves when the system completes.
   */
  exec(system: SystemDef, ctx: SystemContext): void | Promise<void> {
    // Check if this system should run on worker
    const isWorkerSystem = this.options.workerSystems?.has(system.id);
    
    // Auto-initialize worker on first worker-eligible system call
    if (this.useWorker && isWorkerSystem && !this.initAttempted && this.options.autoInit) {
      this.tryInitializeWorker();
    }
    
    const shouldUseWorker = this.useWorker && isWorkerSystem && this.worker !== null;

    if (!shouldUseWorker) {
      // Run inline on main thread
      return InlineRunner.exec(system, ctx);
    }

    // Worker execution path
    return this.execOnWorker(system, ctx);
  }

  /**
   * Execute a system on the worker thread.
   * Serializes components, sends to worker, awaits result, applies deltas.
   */
  private async execOnWorker(system: SystemDef, ctx: SystemContext): Promise<void> {
    if (!this.worker) {
      // Fallback to inline if worker not available
      return InlineRunner.exec(system, ctx);
    }

    const { world, dt, tick } = ctx;
    this.world = world;
    
    // Serialize relevant entities
    const entities = this.serializeEntities(world, system.id);
    
    // Get world singletons
    const worldEntity = 0 as unknown as EntityId;
    const worldPhysics = world.get(worldEntity, WorldPhysics) ?? { gravity: 9.81, airDrag: 0 };
    const inputStateComp = world.get(worldEntity, InputState);
    const inputState = inputStateComp ? {
      moveX: inputStateComp.moveX,
      moveZ: inputStateComp.moveZ,
      jump: inputStateComp.jump,
      keys: inputStateComp.keys ? { ...inputStateComp.keys } : {},
      cameraForward: inputStateComp.cameraForward ? { ...inputStateComp.cameraForward } : { x: 0, y: 0, z: -1 },
    } : { moveX: 0, moveZ: 0, jump: false, keys: {}, cameraForward: { x: 0, y: 0, z: -1 } };

    const message: WorkerMessage = {
      type: "run-system",
      systemId: system.id,
      dt,
      tick,
      entities,
      worldPhysics,
      inputState,
    };

    // Send to worker and wait for result
    return new Promise<void>((resolve, reject) => {
      const key = `${system.id}-${tick}`;
      this.pending.set(key, { resolve, reject, ctx, system });
      
      this.worker!.postMessage(message);
      
      // Timeout after 100ms (physics shouldn't take longer)
      setTimeout(() => {
        if (this.pending.has(key)) {
          this.pending.delete(key);
          console.warn(`[WorkerRunner] Timeout for ${system.id}, falling back to inline`);
          // Fallback to inline on timeout
          InlineRunner.exec(system, ctx);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Handle a message from the worker.
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResult>): void {
    const result = event.data;
    if (result.type !== "system-complete") return;
    
    const key = `${result.systemId}-${result.tick}`;
    const pending = this.pending.get(key);
    if (!pending) return;
    
    // Store profiling stats
    if (result.profiling) {
      this.lastProfilingStats = result.profiling;
    }
    
    // Apply deltas to the world
    if (this.world && result.deltas.length > 0) {
      this.applyDeltas(this.world, result.deltas);
    }
    
    this.pending.delete(key);
    pending.resolve();
  }

  /**
   * Serialize entities relevant to a system.
   */
  private serializeEntities(world: World, systemId: string): SerializedEntity[] {
    const entities: SerializedEntity[] = [];
    
    // For physics/collision, we need Transform, Velocity, Physics, Player components
    for (const [eid, transform] of world.query(Transform)) {
      const entity: SerializedEntity = {
        id: eid as unknown as number,
        transform: {
          position: { ...transform.position },
          rotation: { ...transform.rotation },
          scale: { ...transform.scale },
        },
      };
      
      const velocity = world.get(eid, Velocity);
      if (velocity) {
        entity.velocity = { ...velocity };
      }
      
      const physics = world.get(eid, Physics);
      if (physics) {
        entity.physics = {
          anchored: physics.anchored,
          canCollide: physics.canCollide,
          mass: physics.mass,
          friction: physics.friction,
        };
      }
      
      const player = world.get(eid, Player);
      if (player) {
        entity.player = {
          ragdoll: player.ragdoll,
          health: player.health,
          killY: player.killY,
        };
      }
      
      const playerPhys = world.get(eid, PlayerPhysics);
      if (playerPhys) {
        entity.playerPhysics = { ...playerPhys };
      }
      
      const gravSource = world.get(eid, GravitySource);
      if (gravSource) {
        entity.gravitySource = { ...gravSource };
      }
      
      // Check if motor-pinned (should skip physics)
      if (world.has(eid, MotorPinned)) {
        entity.motorPinned = true;
      }
      
      entities.push(entity);
    }
    
    return entities;
  }

  /**
   * Apply deltas from worker to the world.
   */
  private applyDeltas(world: World, deltas: EntityDelta[]): void {
    for (const delta of deltas) {
      const eid = delta.id as unknown as EntityId;
      
      if (delta.transform) {
        const transform = world.get(eid, Transform);
        if (transform) {
          if (delta.transform.position) {
            transform.position.x = delta.transform.position.x;
            transform.position.y = delta.transform.position.y;
            transform.position.z = delta.transform.position.z;
          }
          if (delta.transform.rotation) {
            transform.rotation.x = delta.transform.rotation.x;
            transform.rotation.y = delta.transform.rotation.y;
            transform.rotation.z = delta.transform.rotation.z;
          }
          world.set(eid, Transform, transform);
        }
      }
      
      if (delta.velocity) {
        const velocity = world.get(eid, Velocity);
        if (velocity) {
          if (delta.velocity.x !== undefined) velocity.x = delta.velocity.x;
          if (delta.velocity.y !== undefined) velocity.y = delta.velocity.y;
          if (delta.velocity.z !== undefined) velocity.z = delta.velocity.z;
          world.set(eid, Velocity, velocity);
        }
      }
      
      if (delta.playerPhysics) {
        const playerPhys = world.get(eid, PlayerPhysics);
        if (playerPhys) {
          if (delta.playerPhysics.onGround !== undefined) playerPhys.onGround = delta.playerPhysics.onGround;
          if (delta.playerPhysics.up) {
            playerPhys.up.x = delta.playerPhysics.up.x;
            playerPhys.up.y = delta.playerPhysics.up.y;
            playerPhys.up.z = delta.playerPhysics.up.z;
          }
          if (delta.playerPhysics.moveForward) {
            playerPhys.moveForward.x = delta.playerPhysics.moveForward.x;
            playerPhys.moveForward.y = delta.playerPhysics.moveForward.y;
            playerPhys.moveForward.z = delta.playerPhysics.moveForward.z;
          }
          if (delta.playerPhysics.sprinting !== undefined) playerPhys.sprinting = delta.playerPhysics.sprinting;
          world.set(eid, PlayerPhysics, playerPhys);
        }
      }
    }
  }

  /**
   * Terminate the worker and clean up resources.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }
}

/**
 * Create a worker runner configured for physics and collision systems.
 */
export function createPhysicsWorkerRunner(enabled = false): WorkerRunner {
  return new WorkerRunner({
    useWorker: enabled,
    workerSystems: new Set(["physics", "collision"]),
  });
}
