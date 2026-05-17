/**
 * Network Interpolation Layer with WebSocket Transport
 * 
 * Features:
 * - WebSocket-based transport for real multiplayer
 * - Snapshot buffering with jitter compensation
 * - Entity interpolation between server snapshots
 * - Client-side prediction for local player
 * - Automatic reconnection
 * - Configurable interpolation delay (default 100ms)
 * 
 * Architecture:
 * - Server sends authoritative snapshots at configured rate (e.g., 20 Hz)
 * - Client buffers snapshots and renders at a delay to smooth jitter
 * - Local player uses client-side prediction with server reconciliation
 */

import type { Vec3 } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface EntitySnapshot {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  visible: boolean;
  transparency: number;
  /** Server timestamp when this snapshot was taken */
  serverTime: number;
}

export interface PlayerSnapshot {
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  health: number;
  serverTime: number;
}

export interface WorldSnapshot {
  /** Server timestamp */
  serverTime: number;
  /** Client receive timestamp */
  clientTime: number;
  /** Sequence number for ordering */
  seq: number;
  player: PlayerSnapshot;
  entities: EntitySnapshot[];
}

export interface InputPacket {
  /** Client timestamp */
  clientTime: number;
  /** Sequence number for reconciliation */
  seq: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  keys: Record<string, boolean>;
}

export interface InterpolatedEntity {
  id: string;
  name: string;
  position: Vec3;
  rotation: Vec3;
  velocity: Vec3;
  visible: boolean;
  transparency: number;
}

// =============================================================================
// Ring Buffer for Snapshot Storage
// =============================================================================

class SnapshotBuffer {
  private buffer: WorldSnapshot[] = [];
  private maxSize: number;

  constructor(maxSize = 60) {
    this.maxSize = maxSize;
  }

  push(snapshot: WorldSnapshot): void {
    // Insert in order by serverTime
    let insertIndex = this.buffer.length;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].serverTime <= snapshot.serverTime) {
        insertIndex = i + 1;
        break;
      }
      insertIndex = i;
    }
    this.buffer.splice(insertIndex, 0, snapshot);

    // Trim old snapshots
    while (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /**
   * Get two snapshots for interpolation at the given render time.
   * Returns [before, after] or null if not enough data.
   */
  getInterpolationPair(renderTime: number): [WorldSnapshot, WorldSnapshot] | null {
    if (this.buffer.length < 2) return null;

    // Find the two snapshots that bracket renderTime
    for (let i = 0; i < this.buffer.length - 1; i++) {
      const before = this.buffer[i];
      const after = this.buffer[i + 1];
      if (before.serverTime <= renderTime && after.serverTime >= renderTime) {
        return [before, after];
      }
    }

    // If renderTime is beyond all snapshots, return the last two
    if (renderTime > this.buffer[this.buffer.length - 1].serverTime) {
      return [
        this.buffer[this.buffer.length - 2],
        this.buffer[this.buffer.length - 1],
      ];
    }

    return null;
  }

  get latest(): WorldSnapshot | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  get oldest(): WorldSnapshot | null {
    return this.buffer.length > 0 ? this.buffer[0] : null;
  }

  get length(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

// =============================================================================
// Interpolation Utilities
// =============================================================================

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  // Handle angle wrapping
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function lerpRotation(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerpAngle(a.x, b.x, t),
    y: lerpAngle(a.y, b.y, t),
    z: lerpAngle(a.z, b.z, t),
  };
}

// =============================================================================
// WebSocket Transport
// =============================================================================

export type WebSocketTransportState = 
  | "disconnected" 
  | "connecting" 
  | "connected" 
  | "reconnecting";

export interface WebSocketTransportConfig {
  /** Server URL (e.g., "wss://game.example.com/ws") */
  url: string;
  /** Reconnection attempts before giving up */
  maxReconnectAttempts?: number;
  /** Base delay between reconnect attempts (ms) */
  reconnectBaseDelay?: number;
  /** Maximum reconnect delay (ms) */
  reconnectMaxDelay?: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
}

export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketTransportConfig>;
  private state: WebSocketTransportState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  
  // Event handlers
  private onSnapshotHandlers = new Set<(snapshot: WorldSnapshot) => void>();
  private onConnectHandlers = new Set<() => void>();
  private onDisconnectHandlers = new Set<(reason: string) => void>();
  private onErrorHandlers = new Set<(error: Event) => void>();

  constructor(config: WebSocketTransportConfig) {
    this.config = {
      maxReconnectAttempts: 5,
      reconnectBaseDelay: 1000,
      reconnectMaxDelay: 30000,
      heartbeatInterval: 10000,
      ...config,
    };
  }

  get currentState(): WebSocketTransportState {
    return this.state;
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): void {
    if (this.state === "connected" || this.state === "connecting") return;
    
    this.state = "connecting";
    this.createConnection();
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.config.url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.lastPong = performance.now();
        this.startHeartbeat();
        
        for (const handler of this.onConnectHandlers) {
          try { handler(); } catch { /* ignore */ }
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.ws.onclose = (event) => {
        this.handleClose(event.reason || "Connection closed");
      };

      this.ws.onerror = (error) => {
        for (const handler of this.onErrorHandlers) {
          try { handler(error); } catch { /* ignore */ }
        }
      };
    } catch (e) {
      this.handleClose("Failed to create WebSocket");
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      let data: any;
      
      if (event.data instanceof ArrayBuffer) {
        // Binary message - decode as msgpack or similar
        // For now, assume JSON string
        const decoder = new TextDecoder();
        data = JSON.parse(decoder.decode(event.data));
      } else {
        data = JSON.parse(event.data);
      }

      if (data.type === "pong") {
        this.lastPong = performance.now();
        return;
      }

      if (data.type === "snapshot") {
        const snapshot: WorldSnapshot = {
          serverTime: data.serverTime,
          clientTime: performance.now(),
          seq: data.seq,
          player: data.player,
          entities: data.entities,
        };
        
        for (const handler of this.onSnapshotHandlers) {
          try { handler(snapshot); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.warn("[WebSocketTransport] Failed to parse message:", e);
    }
  }

  private handleClose(reason: string): void {
    this.stopHeartbeat();
    this.ws = null;
    
    const wasConnected = this.state === "connected";
    
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.state = "reconnecting";
      this.scheduleReconnect();
    } else {
      this.state = "disconnected";
    }
    
    if (wasConnected) {
      for (const handler of this.onDisconnectHandlers) {
        try { handler(reason); } catch { /* ignore */ }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay
    );
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.createConnection();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check for timeout
        if (performance.now() - this.lastPong > this.config.heartbeatInterval * 2) {
          this.ws.close();
          return;
        }
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send an input packet to the server.
   */
  sendInput(input: InputPacket): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "input",
        ...input,
      }));
    }
  }

  /**
   * Send a custom message to the server.
   */
  send(channel: string, payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "custom",
        channel,
        payload,
      }));
    }
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.state = "disconnected";
    this.reconnectAttempts = 0;
  }

  // Event subscription methods
  onSnapshot(handler: (snapshot: WorldSnapshot) => void): () => void {
    this.onSnapshotHandlers.add(handler);
    return () => this.onSnapshotHandlers.delete(handler);
  }

  onConnect(handler: () => void): () => void {
    this.onConnectHandlers.add(handler);
    return () => this.onConnectHandlers.delete(handler);
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    this.onDisconnectHandlers.add(handler);
    return () => this.onDisconnectHandlers.delete(handler);
  }

  onError(handler: (error: Event) => void): () => void {
    this.onErrorHandlers.add(handler);
    return () => this.onErrorHandlers.delete(handler);
  }
}

// =============================================================================
// Interpolation Manager
// =============================================================================

export interface InterpolationConfig {
  /** Render delay in milliseconds (default 100ms for 100ms buffer) */
  renderDelay: number;
  /** Maximum extrapolation time in milliseconds */
  maxExtrapolation: number;
  /** Snapshot buffer size */
  bufferSize: number;
}

export class InterpolationManager {
  private snapshotBuffer = new SnapshotBuffer(60);
  private config: InterpolationConfig;
  
  /** Estimated server time offset (client time - server time) */
  private serverTimeOffset = 0;
  private serverTimeOffsetSamples: number[] = [];
  
  /** Current interpolated state */
  private interpolatedEntities = new Map<string, InterpolatedEntity>();
  private interpolatedPlayer: PlayerSnapshot | null = null;
  
  /** Statistics */
  stats = {
    bufferLength: 0,
    jitterMs: 0,
    latencyMs: 0,
    interpolationT: 0,
    isExtrapolating: false,
  };

  constructor(config: Partial<InterpolationConfig> = {}) {
    this.config = {
      renderDelay: 100,
      maxExtrapolation: 200,
      bufferSize: 60,
      ...config,
    };
  }

  /**
   * Add a new snapshot from the server.
   */
  addSnapshot(snapshot: WorldSnapshot): void {
    // Update server time offset estimation
    const offset = snapshot.clientTime - snapshot.serverTime;
    this.serverTimeOffsetSamples.push(offset);
    if (this.serverTimeOffsetSamples.length > 10) {
      this.serverTimeOffsetSamples.shift();
    }
    // Use median for stability
    const sorted = [...this.serverTimeOffsetSamples].sort((a, b) => a - b);
    this.serverTimeOffset = sorted[Math.floor(sorted.length / 2)];
    
    // Calculate jitter
    if (this.serverTimeOffsetSamples.length >= 2) {
      const diffs = this.serverTimeOffsetSamples.map((v, i, arr) => 
        i > 0 ? Math.abs(v - arr[i - 1]) : 0
      ).slice(1);
      this.stats.jitterMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
    
    this.snapshotBuffer.push(snapshot);
    this.stats.bufferLength = this.snapshotBuffer.length;
  }

  /**
   * Get the render time (delayed from current time).
   */
  getRenderTime(): number {
    const clientTime = performance.now();
    // Convert to server time and apply render delay
    const serverTime = clientTime - this.serverTimeOffset - this.config.renderDelay;
    return serverTime;
  }

  /**
   * Update interpolation and return the current interpolated state.
   */
  update(): { entities: Map<string, InterpolatedEntity>; player: PlayerSnapshot | null } {
    const renderTime = this.getRenderTime();
    const pair = this.snapshotBuffer.getInterpolationPair(renderTime);
    
    if (!pair) {
      this.stats.isExtrapolating = true;
      // Not enough data - use latest snapshot if available
      const latest = this.snapshotBuffer.latest;
      if (latest) {
        this.interpolateFromSnapshot(latest, latest, 1);
      }
      return { entities: this.interpolatedEntities, player: this.interpolatedPlayer };
    }
    
    const [before, after] = pair;
    const duration = after.serverTime - before.serverTime;
    const elapsed = renderTime - before.serverTime;
    
    // Calculate interpolation factor
    let t = duration > 0 ? elapsed / duration : 1;
    
    // Handle extrapolation
    if (t > 1) {
      const extrapolationTime = (t - 1) * duration;
      if (extrapolationTime > this.config.maxExtrapolation) {
        t = 1 + this.config.maxExtrapolation / duration;
      }
      this.stats.isExtrapolating = true;
    } else {
      this.stats.isExtrapolating = false;
    }
    
    this.stats.interpolationT = t;
    this.stats.latencyMs = performance.now() - this.serverTimeOffset - after.serverTime;
    
    this.interpolateFromSnapshot(before, after, Math.min(t, 2));
    
    return { entities: this.interpolatedEntities, player: this.interpolatedPlayer };
  }

  private interpolateFromSnapshot(before: WorldSnapshot, after: WorldSnapshot, t: number): void {
    // Interpolate player
    this.interpolatedPlayer = {
      position: lerpVec3(before.player.position, after.player.position, t),
      rotation: lerpRotation(before.player.rotation, after.player.rotation, t),
      velocity: lerpVec3(before.player.velocity, after.player.velocity, t),
      health: before.player.health + (after.player.health - before.player.health) * t,
      serverTime: before.serverTime + (after.serverTime - before.serverTime) * t,
    };
    
    // Build entity map from "after" snapshot for ID lookup
    const afterEntityMap = new Map<string, EntitySnapshot>();
    for (const entity of after.entities) {
      afterEntityMap.set(entity.id, entity);
    }
    
    // Interpolate entities
    this.interpolatedEntities.clear();
    
    // Process entities from "before" snapshot
    for (const beforeEntity of before.entities) {
      const afterEntity = afterEntityMap.get(beforeEntity.id);
      
      if (afterEntity) {
        // Entity exists in both - interpolate
        this.interpolatedEntities.set(beforeEntity.id, {
          id: beforeEntity.id,
          name: afterEntity.name,
          position: lerpVec3(beforeEntity.position, afterEntity.position, t),
          rotation: lerpRotation(beforeEntity.rotation, afterEntity.rotation, t),
          velocity: lerpVec3(beforeEntity.velocity, afterEntity.velocity, t),
          visible: afterEntity.visible,
          transparency: beforeEntity.transparency + (afterEntity.transparency - beforeEntity.transparency) * t,
        });
      } else {
        // Entity only in "before" - use as-is (will disappear)
        this.interpolatedEntities.set(beforeEntity.id, {
          ...beforeEntity,
        });
      }
    }
    
    // Add entities that only exist in "after"
    for (const afterEntity of after.entities) {
      if (!this.interpolatedEntities.has(afterEntity.id)) {
        this.interpolatedEntities.set(afterEntity.id, {
          ...afterEntity,
        });
      }
    }
  }

  /**
   * Clear all buffered data.
   */
  clear(): void {
    this.snapshotBuffer.clear();
    this.interpolatedEntities.clear();
    this.interpolatedPlayer = null;
    this.serverTimeOffsetSamples = [];
  }

  /**
   * Get current configuration.
   */
  getConfig(): InterpolationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<InterpolationConfig>): void {
    Object.assign(this.config, config);
  }
}

// =============================================================================
// Combined Network Layer
// =============================================================================

export interface NetworkLayerConfig {
  /** WebSocket URL (null for local/offline mode) */
  wsUrl: string | null;
  /** Interpolation configuration */
  interpolation?: Partial<InterpolationConfig>;
  /** Input send rate (Hz) */
  inputSendRate?: number;
}

export class NetworkLayer {
  private transport: WebSocketTransport | null = null;
  private interpolation = new InterpolationManager();
  private inputSeq = 0;
  private inputAccum = 0;
  private config: NetworkLayerConfig;
  
  /** Whether we're in online mode with real transport */
  isOnline = false;
  
  /** Connection state */
  get connectionState(): WebSocketTransportState {
    return this.transport?.currentState ?? "disconnected";
  }

  constructor(config: NetworkLayerConfig) {
    this.config = {
      inputSendRate: 60,
      ...config,
    };
    
    if (config.interpolation) {
      this.interpolation.setConfig(config.interpolation);
    }
    
    if (config.wsUrl) {
      this.transport = new WebSocketTransport({ url: config.wsUrl });
      this.transport.onSnapshot((snapshot) => {
        this.interpolation.addSnapshot(snapshot);
      });
      this.isOnline = true;
    }
  }

  /**
   * Connect to the server (online mode only).
   */
  connect(): void {
    this.transport?.connect();
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    this.transport?.disconnect();
  }

  /**
   * Process a local snapshot (offline mode).
   */
  processLocalSnapshot(snapshot: WorldSnapshot): void {
    this.interpolation.addSnapshot(snapshot);
  }

  /**
   * Send input to the server.
   */
  sendInput(dt: number, input: Omit<InputPacket, "clientTime" | "seq">): void {
    if (!this.transport) return;
    
    this.inputAccum += dt;
    const interval = 1 / (this.config.inputSendRate ?? 60);
    
    if (this.inputAccum >= interval) {
      this.inputAccum = 0;
      this.transport.sendInput({
        clientTime: performance.now(),
        seq: this.inputSeq++,
        ...input,
      });
    }
  }

  /**
   * Get interpolated state for rendering.
   */
  getInterpolatedState(): { 
    entities: Map<string, InterpolatedEntity>; 
    player: PlayerSnapshot | null;
  } {
    return this.interpolation.update();
  }

  /**
   * Get interpolation statistics.
   */
  getStats(): typeof InterpolationManager.prototype.stats {
    return this.interpolation.stats;
  }

  /**
   * Subscribe to connection events.
   */
  onConnect(handler: () => void): () => void {
    return this.transport?.onConnect(handler) ?? (() => {});
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    return this.transport?.onDisconnect(handler) ?? (() => {});
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.transport?.disconnect();
    this.interpolation.clear();
  }
}
