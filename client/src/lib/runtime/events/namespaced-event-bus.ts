/**
 * Namespaced Event Bus
 * 
 * A memory-efficient event system for handling thousands of objects.
 * Instead of creating one EventBus per object, uses a single bus with
 * namespaced event keys like "object:abc123:touched".
 * 
 * This dramatically reduces memory overhead when dealing with many objects
 * while maintaining the same API surface for scripts.
 */

import type { RuntimeObject, RuntimePlayer, ObjectEventName } from "../types";

/** Event payload types for object events */
export type ObjectEventPayloads = {
  touched: [player: RuntimePlayer, object: RuntimeObject];
  untouched: [player: RuntimePlayer, object: RuntimeObject];
  touchStarted: [player: RuntimePlayer, object: RuntimeObject, penetration: number, normal: { x: number; y: number; z: number }];
  touchEnded: [player: RuntimePlayer, object: RuntimeObject];
  clicked: [object: RuntimeObject];
  destroyed: [];
  propertyChanged: [propertyName: string, oldValue: any, newValue: any];
  collisionStarted: [other: RuntimeObject, contact: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }];
  collisionEnded: [other: RuntimeObject];
};

/** Handler function type */
type EventHandler<T extends any[]> = (...args: T) => void;

/** Subscription info for cleanup */
interface Subscription {
  objectId: string;
  event: ObjectEventName;
  handler: EventHandler<any>;
}

/**
 * Global namespaced event bus for all object events.
 * 
 * Usage:
 *   bus.on("abc123", "touched", handler);
 *   bus.emit("abc123", "touched", [player, object]);
 *   bus.off("abc123", "touched", handler);
 */
export class NamespacedEventBus {
  // Map of "objectId:eventName" -> Set of handlers
  private handlers = new Map<string, Set<EventHandler<any>>>();
  
  // Track subscriptions per object for bulk cleanup
  private objectSubscriptions = new Map<string, Set<string>>();
  
  // Statistics for debugging/profiling
  private stats = {
    totalSubscriptions: 0,
    totalEmits: 0,
    objectsWithHandlers: 0,
  };

  /**
   * Create a namespaced key for an object event.
   */
  private key(objectId: string, event: ObjectEventName): string {
    return `${objectId}:${event}`;
  }

  /**
   * Subscribe to an object event.
   * Returns an unsubscribe function.
   */
  on<E extends ObjectEventName>(
    objectId: string,
    event: E,
    handler: EventHandler<ObjectEventPayloads[E]>
  ): () => void {
    const k = this.key(objectId, event);
    
    // Get or create handler set
    let set = this.handlers.get(k);
    if (!set) {
      set = new Set();
      this.handlers.set(k, set);
    }
    
    // Track subscription per object
    let objSubs = this.objectSubscriptions.get(objectId);
    if (!objSubs) {
      objSubs = new Set();
      this.objectSubscriptions.set(objectId, objSubs);
      this.stats.objectsWithHandlers++;
    }
    objSubs.add(k);
    
    set.add(handler);
    this.stats.totalSubscriptions++;
    
    // Return unsubscribe function
    return () => this.off(objectId, event, handler);
  }

  /**
   * Unsubscribe from an object event.
   */
  off<E extends ObjectEventName>(
    objectId: string,
    event: E,
    handler: EventHandler<ObjectEventPayloads[E]>
  ): void {
    const k = this.key(objectId, event);
    const set = this.handlers.get(k);
    
    if (set) {
      const deleted = set.delete(handler);
      if (deleted) {
        this.stats.totalSubscriptions--;
      }
      
      // Cleanup empty sets
      if (set.size === 0) {
        this.handlers.delete(k);
        
        // Update object subscriptions
        const objSubs = this.objectSubscriptions.get(objectId);
        if (objSubs) {
          objSubs.delete(k);
          if (objSubs.size === 0) {
            this.objectSubscriptions.delete(objectId);
            this.stats.objectsWithHandlers--;
          }
        }
      }
    }
  }

  /**
   * Emit an event to all handlers for an object.
   */
  emit<E extends ObjectEventName>(
    objectId: string,
    event: E,
    args: ObjectEventPayloads[E],
    onError?: (e: any, fn: Function) => void
  ): void {
    const k = this.key(objectId, event);
    const set = this.handlers.get(k);
    
    if (!set || set.size === 0) return;
    
    this.stats.totalEmits++;
    
    // Snapshot handlers to allow safe iteration
    const handlers = Array.from(set);
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (e) {
        onError?.(e, handler);
      }
    }
  }

  /**
   * Check if an object has any handlers for a specific event.
   */
  hasHandlers(objectId: string, event: ObjectEventName): boolean {
    const k = this.key(objectId, event);
    const set = this.handlers.get(k);
    return !!set && set.size > 0;
  }

  /**
   * Get the number of handlers for an object event.
   */
  handlerCount(objectId: string, event: ObjectEventName): number {
    const k = this.key(objectId, event);
    return this.handlers.get(k)?.size ?? 0;
  }

  /**
   * Check if an object has any event subscriptions.
   */
  hasObjectSubscriptions(objectId: string): boolean {
    return this.objectSubscriptions.has(objectId);
  }

  /**
   * Remove all handlers for a specific object (used when object is destroyed).
   */
  clearObject(objectId: string): void {
    const objSubs = this.objectSubscriptions.get(objectId);
    if (!objSubs) return;
    
    for (const k of objSubs) {
      const set = this.handlers.get(k);
      if (set) {
        this.stats.totalSubscriptions -= set.size;
        this.handlers.delete(k);
      }
    }
    
    this.objectSubscriptions.delete(objectId);
    this.stats.objectsWithHandlers--;
  }

  /**
   * Clear all handlers.
   */
  clear(): void {
    this.handlers.clear();
    this.objectSubscriptions.clear();
    this.stats = {
      totalSubscriptions: 0,
      totalEmits: 0,
      objectsWithHandlers: 0,
    };
  }

  /**
   * Get statistics for debugging/profiling.
   */
  getStats(): Readonly<typeof this.stats & { uniqueEventKeys: number }> {
    return {
      ...this.stats,
      uniqueEventKeys: this.handlers.size,
    };
  }

  /**
   * Create a proxy object that provides the familiar on/off API for a specific object.
   * This maintains API compatibility with the per-object EventBus pattern.
   */
  createObjectProxy(objectId: string): ObjectEventProxy {
    return new ObjectEventProxy(this, objectId);
  }
}

/**
 * Proxy that provides the familiar on/off API for a specific object.
 * Used to maintain API compatibility with the old per-object EventBus pattern.
 */
export class ObjectEventProxy {
  private cleanupFns = new Set<() => void>();

  constructor(
    private bus: NamespacedEventBus,
    private objectId: string
  ) {}

  /**
   * Subscribe to an event on this object.
   */
  on<E extends ObjectEventName>(
    event: E,
    handler: EventHandler<ObjectEventPayloads[E]>
  ): () => void {
    const cleanup = this.bus.on(this.objectId, event, handler);
    this.cleanupFns.add(cleanup);
    
    // Return cleanup that also removes from our tracking set
    return () => {
      cleanup();
      this.cleanupFns.delete(cleanup);
    };
  }

  /**
   * Unsubscribe from an event on this object.
   */
  off<E extends ObjectEventName>(
    event: E,
    handler: EventHandler<ObjectEventPayloads[E]>
  ): void {
    this.bus.off(this.objectId, event, handler);
  }

  /**
   * Emit an event on this object.
   */
  emit<E extends ObjectEventName>(
    event: E,
    args: ObjectEventPayloads[E],
    onError?: (e: any, fn: Function) => void
  ): void {
    this.bus.emit(this.objectId, event, args, onError);
  }

  /**
   * Check if this object has handlers for an event.
   */
  hasHandlers(event: ObjectEventName): boolean {
    return this.bus.hasHandlers(this.objectId, event);
  }

  /**
   * Clean up all subscriptions for this object.
   */
  cleanup(): void {
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns.clear();
  }
}

/** Global singleton instance */
export const globalObjectEventBus = new NamespacedEventBus();
