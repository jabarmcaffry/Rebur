/**
 * Player State Management
 * 
 * Handles player lifecycle, health, respawning, and ragdoll state.
 */

import type { RuntimePlayer, Vec3 } from "../types";
import type { EventBus, EngineEvents } from "../events/event-bus";
import { createStubInventory } from "./inventory";
import { createPlayerMotors, type MotorState } from "./motors";

export interface RagdollState {
  velocities: Record<string, Vec3> | null;
  positions: Record<string, Vec3> | null;
  until: number;
}

export interface PlayerConfig {
  username: string;
  avatarColor: string;
  spawnPoint: Vec3;
}

/**
 * Create initial player state
 */
export function createPlayer(config: PlayerConfig, motorState: Map<string, MotorState>): RuntimePlayer {
  const player: RuntimePlayer = {
    username: config.username,
    color: config.avatarColor,
    position: { ...config.spawnPoint },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    health: 100,
    maxHealth: 100,
    speed: 6,
    walkSpeed: 6,
    runSpeed: 12,
    jumpPower: 8,
    size: 1,
    spawnPoint: { ...config.spawnPoint },
    up: { x: 0, y: 1, z: 0 },
    collisionRadius: 0.4,
    collisionHalfHeight: 1.12,
    inventory: createStubInventory(),
    motors: createPlayerMotors(motorState),
    autoFaceMovement: true,
    ragdoll: false,
    killY: -50,
    takeDamage: () => {},
    heal: () => {},
    kill: () => {},
    teleport: () => {},
    respawn: () => {},
    // Event methods - stub, will be mounted properly by runtime
    on: () => () => {},
    off: () => {},
    emit: () => false,
  };

  return player;
}

/**
 * Mount player lifecycle methods
 */
export function mountPlayerMethods(
  player: RuntimePlayer,
  ragdollState: RagdollState,
  events: EventBus<EngineEvents>,
  pushLog: (line: string) => void,
  getTime: () => number
): void {
  player.takeDamage = (n: number) => {
    if (player.ragdoll) return;
    player.health = Math.max(0, player.health - n);
    if (player.health <= 0) player.kill();
  };

  player.heal = (n: number) => {
    player.health = Math.min(player.maxHealth, player.health + n);
  };

  player.teleport = (x: number, y: number, z: number) => {
    player.position.x = x;
    player.position.y = y;
    player.position.z = z;
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.velocity.z = 0;
  };

  player.kill = () => {
    if (player.ragdoll) return;
    player.health = 0;
    player.ragdoll = true;
    
    // Pre-seed limb velocities for ragdoll scatter effect
    const r = () => (Math.random() - 0.5) * 4;
    const ru = () => 4 + Math.random() * 3;
    
    ragdollState.velocities = {
      torso:        { x: r(), y: 5, z: r() },
      head:         { x: r(), y: 7, z: r() },
      neck:         { x: r(), y: 6, z: r() },
      leftUpperArm: { x: -3, y: ru(), z: r() },
      leftLowerArm: { x: -4, y: ru(), z: r() },
      leftHand:     { x: -5, y: ru(), z: r() },
      rightUpperArm:{ x:  3, y: ru(), z: r() },
      rightLowerArm:{ x:  4, y: ru(), z: r() },
      rightHand:    { x:  5, y: ru(), z: r() },
      leftUpperLeg: { x: r(), y: ru(), z: -3 },
      leftLowerLeg: { x: r(), y: ru(), z: -4 },
      leftFoot:     { x: r(), y: ru(), z: -5 },
      rightUpperLeg:{ x: r(), y: ru(), z:  3 },
      rightLowerLeg:{ x: r(), y: ru(), z:  4 },
      rightFoot:    { x: r(), y: ru(), z:  5 },
    };
    
    ragdollState.positions = {
      torso:        { x: 0, y: 0.05, z: 0 },
      head:         { x: 0, y: 0.85, z: 0 },
      neck:         { x: 0, y: 0.65, z: 0 },
      leftUpperArm: { x: -0.42, y: 0.30, z: 0 },
      leftLowerArm: { x: -0.42, y: 0.00, z: 0 },
      leftHand:     { x: -0.42, y: -0.25, z: 0 },
      rightUpperArm:{ x:  0.42, y: 0.30, z: 0 },
      rightLowerArm:{ x:  0.42, y: 0.00, z: 0 },
      rightHand:    { x:  0.42, y: -0.25, z: 0 },
      leftUpperLeg: { x: -0.18, y: -0.30, z: 0 },
      leftLowerLeg: { x: -0.18, y: -0.65, z: 0 },
      leftFoot:     { x: -0.18, y: -0.95, z: 0.05 },
      rightUpperLeg:{ x:  0.18, y: -0.30, z: 0 },
      rightLowerLeg:{ x:  0.18, y: -0.65, z: 0 },
      rightFoot:    { x:  0.18, y: -0.95, z: 0.05 },
    };
    
    ragdollState.until = getTime() + 1.6;
    events.emit("playerDied", [player], () => {});
    pushLog(`${player.username} died.`);
  };

  player.respawn = () => {
    const sp = player.spawnPoint;
    player.position.x = sp.x;
    player.position.y = sp.y;
    player.position.z = sp.z;
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.velocity.z = 0;
    player.health = player.maxHealth;
    player.ragdoll = false;
    ragdollState.velocities = null;
    ragdollState.positions = null;
    events.emit("playerSpawned", [player], () => {});
    pushLog(`${player.username} respawned.`);
  };
}

/**
 * Update ragdoll physics
 */
export function updateRagdollPhysics(
  ragdollState: RagdollState,
  gravity: number,
  dt: number
): void {
  if (!ragdollState.positions || !ragdollState.velocities) return;

  const g = -gravity;
  for (const k of Object.keys(ragdollState.positions)) {
    const pos = ragdollState.positions[k];
    const vel = ragdollState.velocities[k];
    vel.y += g * dt;
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;
  }
}
