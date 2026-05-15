/**
 * Event Bus System
 * 
 * Core event handling infrastructure for the engine.
 * Provides typed event channels and pub/sub functionality.
 */

import type { RuntimeObject, RuntimePlayer } from "../types";

/**
 * Engine-wide event definitions
 */
export type EngineEvents = {
  input: [dt: number, time: number];
  animation: [dt: number, time: number];
  replication: [dt: number, time: number];
  physics: [dt: number, time: number];
  render: [dt: number, time: number];
  update: [dt: number, time: number];
  start: [];
  stop: [];
  keyDown: [key: string];
  keyUp: [key: string];
  objectAdded: [obj: RuntimeObject];
  objectRemoved: [obj: RuntimeObject];
  playerSpawned: [player: RuntimePlayer];
  playerDied: [player: RuntimePlayer];
};

// ObjectEventName is defined in types.ts to avoid circular dependencies

/**
 * Event channel interface
 */
export type EventChannel<T extends any[]> = {
  on: (fn: (...args: T) => void) => () => void;
  off: (fn: (...args: T) => void) => void;
};

/**
 * Generic typed event bus
 */
export class EventBus<T extends Record<string, any[]>> {
  private subs = new Map<keyof T, Set<(...args: any[]) => void>>();

  on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): () => void {
    let s = this.subs.get(event);
    if (!s) {
      s = new Set();
      this.subs.set(event, s);
    }
    s.add(fn as any);
    return () => this.off(event, fn);
  }

  off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): void {
    this.subs.get(event)?.delete(fn as any);
  }

  emit<K extends keyof T>(
    event: K, 
    args: T[K], 
    onError?: (e: any, fn: Function) => void
  ): void {
    const s = this.subs.get(event);
    if (!s) return;
    
    // Snapshot handlers to allow safe iteration during emit
    const handlers = Array.from(s);
    for (const fn of handlers) {
      try {
        (fn as any)(...args);
      } catch (e) {
        onError?.(e, fn);
      }
    }
  }

  /**
   * Create a typed channel for a specific event
   */
  createChannel<K extends keyof T>(event: K): EventChannel<T[K]> {
    return {
      on: (fn: (...args: T[K]) => void) => this.on(event, fn),
      off: (fn: (...args: T[K]) => void) => this.off(event, fn),
    };
  }

  /**
   * Check if there are any subscribers for an event
   */
  hasSubscribers<K extends keyof T>(event: K): boolean {
    const s = this.subs.get(event);
    return !!s && s.size > 0;
  }

  /**
   * Get subscriber count for an event
   */
  subscriberCount<K extends keyof T>(event: K): number {
    return this.subs.get(event)?.size ?? 0;
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subs.clear();
  }
}

/**
 * Events API interface exposed to scripts
 */
export interface EventsAPI {
  on: <K extends keyof EngineEvents>(event: K, fn: (...args: EngineEvents[K]) => void) => () => void;
  off: <K extends keyof EngineEvents>(event: K, fn: (...args: EngineEvents[K]) => void) => void;
}
