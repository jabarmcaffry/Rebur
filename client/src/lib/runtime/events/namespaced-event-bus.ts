/**
 * Namespaced Event Bus
 *
 * Supports both internal (engine-reserved) and custom (user-defined) events.
 * Internal events cannot be emitted from script code — the engine fires them.
 * Custom events are fully user-controlled and can be emitted freely.
 */

import type { RuntimeObject, RuntimePlayer, ObjectEventName } from "../types";

/** Internal events that are fired by the engine — scripts cannot emit these */
export const INTERNAL_EVENTS = new Set<string>([
  "touched",
  "untouched",
  "touchStarted",
  "touchEnded",
  "clicked",
  "destroyed",
  "woke",
  "slept",
  "collisionStarted",
  "collisionEnded",
  "propertyChanged",
  "changed",
]);

/** Event payload types for built-in object events */
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
  woke: [];
  slept: [];
};

/** Handler function type */
type EventHandler<T extends any[]> = (...args: T) => void;

/**
 * Global namespaced event bus — one shared bus handles all object events.
 * Keys are "objectId:eventName" strings.
 */
export class NamespacedEventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();
  private objectSubscriptions = new Map<string, Set<string>>();

  private stats = {
    totalSubscriptions: 0,
    totalEmits: 0,
    objectsWithHandlers: 0,
  };

  private key(objectId: string, event: string): string {
    return `${objectId}:${event}`;
  }

  /** Subscribe to any event (internal or custom). Returns unsubscribe fn. */
  on(objectId: string, event: string, handler: EventHandler<any>): () => void {
    const k = this.key(objectId, event);
    let set = this.handlers.get(k);
    if (!set) {
      set = new Set();
      this.handlers.set(k, set);
    }
    let objSubs = this.objectSubscriptions.get(objectId);
    if (!objSubs) {
      objSubs = new Set();
      this.objectSubscriptions.set(objectId, objSubs);
      this.stats.objectsWithHandlers++;
    }
    objSubs.add(k);
    set.add(handler);
    this.stats.totalSubscriptions++;
    return () => this.off(objectId, event, handler);
  }

  /** Unsubscribe from an event. */
  off(objectId: string, event: string, handler: EventHandler<any>): void {
    const k = this.key(objectId, event);
    const set = this.handlers.get(k);
    if (set) {
      const deleted = set.delete(handler);
      if (deleted) this.stats.totalSubscriptions--;
      if (set.size === 0) {
        this.handlers.delete(k);
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
   * Emit an event (engine-internal path — no guard here).
   * Scripts should use emitCustom() which enforces the internal/custom boundary.
   */
  emit(objectId: string, event: string, args: any[], onError?: (e: any, fn: Function) => void): void {
    const k = this.key(objectId, event);
    const set = this.handlers.get(k);
    if (!set || set.size === 0) return;
    this.stats.totalEmits++;
    const snapshot = Array.from(set);
    for (const fn of snapshot) {
      try {
        fn(...args);
      } catch (e) {
        onError?.(e, fn);
      }
    }
  }

  /**
   * Script-facing emit — only allowed for custom (non-internal) events.
   * Returns an error string if the event is reserved; null on success.
   */
  emitCustom(objectId: string, event: string, args: any[], onError?: (e: any, fn: Function) => void): string | null {
    if (INTERNAL_EVENTS.has(event)) {
      return (
        `Cannot emit "${event}" — this is an engine-internal event reserved by the runtime. ` +
        `Internal events (touched, clicked, destroyed, etc.) are fired automatically by the engine. ` +
        `Use a different name for your custom event.`
      );
    }
    this.emit(objectId, event, args, onError);
    return null;
  }

  hasHandlers(objectId: string, event: string): boolean {
    return (this.handlers.get(this.key(objectId, event))?.size ?? 0) > 0;
  }

  handlerCount(objectId: string, event: string): number {
    return this.handlers.get(this.key(objectId, event))?.size ?? 0;
  }

  hasObjectSubscriptions(objectId: string): boolean {
    return this.objectSubscriptions.has(objectId);
  }

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

  clear(): void {
    this.handlers.clear();
    this.objectSubscriptions.clear();
    this.stats = { totalSubscriptions: 0, totalEmits: 0, objectsWithHandlers: 0 };
  }

  getStats() {
    return { ...this.stats, uniqueEventKeys: this.handlers.size };
  }

  createObjectProxy(objectId: string): ObjectEventProxy {
    return new ObjectEventProxy(this, objectId);
  }
}

/**
 * Per-object event proxy — exposes on/off/emit API for a specific object.
 * emit() is guarded to prevent firing internal engine events from scripts.
 */
export class ObjectEventProxy {
  private cleanupFns = new Set<() => void>();

  constructor(
    private bus: NamespacedEventBus,
    private objectId: string,
    private pushLog?: (msg: string) => void,
  ) {}

  on(event: string, handler: EventHandler<any>): () => void {
    const cleanup = this.bus.on(this.objectId, event, handler);
    this.cleanupFns.add(cleanup);
    return () => {
      cleanup();
      this.cleanupFns.delete(cleanup);
    };
  }

  off(event: string, handler: EventHandler<any>): void {
    this.bus.off(this.objectId, event, handler);
  }

  /**
   * Script-facing emit — only allowed for custom events.
   * Logs an error and returns false if the event is engine-reserved.
   */
  emit(event: string, ...args: any[]): boolean {
    const err = this.bus.emitCustom(this.objectId, event, args, (e) => {
      this.pushLog?.(`obj.emit("${event}") handler error: ${e?.message ?? e}`);
    });
    if (err) {
      this.pushLog?.(err);
      return false;
    }
    return true;
  }

  /** Engine-internal emit — bypasses the guard. Do not expose to scripts. */
  _emitInternal(event: string, args: any[], onError?: (e: any) => void): void {
    this.bus.emit(this.objectId, event, args, onError ? (e) => onError(e) : undefined);
  }

  hasHandlers(event: string): boolean {
    return this.bus.hasHandlers(this.objectId, event);
  }

  cleanup(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.clear();
  }
}

export const globalObjectEventBus = new NamespacedEventBus();
