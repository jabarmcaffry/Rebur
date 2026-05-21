// api.ts
import type { RuntimeObject } from "./types";

// ========== Emitter ==========
// Named-event emitter. Usage:
//   const bus = new Emitter();
//   bus.on("evt", (a, b) => ...);
//   bus.emit("evt", 1, 2);
export class Emitter<E extends Record<string, any[]> = Record<string, any[]>> {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  private onceListeners = new Map<string, Set<(...args: any[]) => void>>();

  on<K extends keyof E & string>(event: K, fn: (...args: E[K]) => void): () => void {
    if (typeof event !== "string") throw new TypeError(`Emitter.on: event must be a string, got ${typeof event}`);
    if (typeof fn !== "function") throw new TypeError(`Emitter.on("${event}"): callback must be a function, got ${typeof fn}`);
    let s = this.listeners.get(event);
    if (!s) { s = new Set(); this.listeners.set(event, s); }
    s.add(fn as any);
    return () => this.off(event, fn);
  }

  once<K extends keyof E & string>(event: K, fn: (...args: E[K]) => void): () => void {
    if (typeof event !== "string") throw new TypeError(`Emitter.once: event must be a string, got ${typeof event}`);
    if (typeof fn !== "function") throw new TypeError(`Emitter.once("${event}"): callback must be a function, got ${typeof fn}`);
    let s = this.onceListeners.get(event);
    if (!s) { s = new Set(); this.onceListeners.set(event, s); }
    s.add(fn as any);
    return () => { this.onceListeners.get(event)?.delete(fn as any); };
  }

  off<K extends keyof E & string>(event: K, fn: (...args: E[K]) => void): void {
    this.listeners.get(event)?.delete(fn as any);
    this.onceListeners.get(event)?.delete(fn as any);
  }

  emit<K extends keyof E & string>(event: K, ...args: E[K]): void {
    const s = this.listeners.get(event);
    if (s) for (const fn of Array.from(s)) { try { fn(...args); } catch (e) { console.error(`Emitter("${event}") listener error:`, e); } }
    const o = this.onceListeners.get(event);
    if (o) {
      const snap = Array.from(o);
      o.clear();
      for (const fn of snap) { try { fn(...args); } catch (e) { console.error(`Emitter("${event}") listener error:`, e); } }
    }
  }

  wait<K extends keyof E & string>(event: K): Promise<E[K]> {
    return new Promise(resolve => {
      this.once(event, ((...args: any[]) => resolve(args as E[K])) as any);
    });
  }

  clear(): void {
    this.listeners.clear();
    this.onceListeners.clear();
  }
}

// ========== Callable ==========
// A function-like value with attached methods. The returned value can be
// invoked directly as `c(...)` AND through `c.invoke(...)`.
export interface CallableInstance<TArgs extends any[] = any[], TResult = any> {
  (...args: TArgs): TResult;
  setHandler(fn: (...args: TArgs) => TResult): void;
  invoke(...args: TArgs): TResult;
  hasHandler(): boolean;
}

export function Callable<TArgs extends any[] = any[], TResult = any>(
  initial?: (...args: TArgs) => TResult,
): CallableInstance<TArgs, TResult> {
  let handler: ((...args: TArgs) => TResult) | null = initial ?? null;
  const fn = ((...args: TArgs): TResult => {
    if (!handler) throw new Error("Callable has no handler. Use c.setHandler(fn) before invoking.");
    return handler(...args);
  }) as CallableInstance<TArgs, TResult>;
  fn.setHandler = (h) => {
    if (typeof h !== "function") throw new TypeError("Callable.setHandler: argument must be a function");
    handler = h;
  };
  fn.invoke = (...args: TArgs) => fn(...args);
  fn.hasHandler = () => handler !== null;
  return fn;
}
// Make `new Callable()` also work for legacy users — it returns the same callable function.
(Callable as any).prototype = {};

// ========== WeakTable ==========
export class WeakTable<K extends object, V> {
  private map = new WeakMap<K, V>();
  set(key: K, value: V): this { this.map.set(key, value); return this; }
  get(key: K): V | undefined { return this.map.get(key); }
  has(key: K): boolean { return this.map.has(key); }
  delete(key: K): boolean { return this.map.delete(key); }
}

// ========== Class system ==========
// `Class(name, base?)` returns a constructor that works with or without `new`.
// Optional lifecycle hooks: `construct()` on init, `destruct()` on .destroy().
export function Class(name: string, base?: any): any {
  const ctor: any = function(this: any, props: any = {}) {
    // Allow call without `new`
    if (!(this instanceof ctor)) return new (ctor as any)(props);
    this.__name = name;
    if (props && typeof props === "object") Object.assign(this, props);
    if (typeof this.construct === "function") this.construct();
  };
  if (base && base.prototype) Object.setPrototypeOf(ctor.prototype, base.prototype);
  ctor.prototype.__class = ctor;
  ctor.prototype.__name = name;
  ctor.prototype.destroy = function() { if (typeof this.destruct === "function") this.destruct(); };
  ctor.extend = (childName: string) => Class(childName, ctor);
  return ctor;
}
// Static extend helper for backward compatibility: Class.extend("Foo")
(Class as any).extend = (name: string, base?: any) => Class(name, base);

// ========== TagManager ==========
export class TagManager {
  private tags = new Map<string, Set<RuntimeObject>>();

  addTag(obj: RuntimeObject, tag: string): void {
    let set = this.tags.get(tag);
    if (!set) { set = new Set(); this.tags.set(tag, set); }
    set.add(obj);
  }

  removeTag(obj: RuntimeObject, tag: string): void {
    this.tags.get(tag)?.delete(obj);
  }

  hasTag(obj: RuntimeObject, tag: string): boolean {
    return this.tags.get(tag)?.has(obj) ?? false;
  }

  getTagged(tag: string): RuntimeObject[] {
    return Array.from(this.tags.get(tag) ?? []);
  }

  getTags(obj: RuntimeObject): string[] {
    const result: string[] = [];
    for (const [tag, set] of this.tags) if (set.has(obj)) result.push(tag);
    return result;
  }

  clear(): void { this.tags.clear(); }
}

// ========== TaskScheduler ==========
export class TaskScheduler {
  private timers: { fn: () => void; delay: number; repeat: boolean; nextTime: number }[] = [];

  wait(seconds: number): Promise<void> {
    return new Promise(resolve => {
      this.timers.push({ fn: resolve, delay: seconds, repeat: false, nextTime: 0 });
    });
  }

  delay(seconds: number, callback: () => void): () => void {
    const timer = { fn: callback, delay: seconds, repeat: false, nextTime: 0 };
    this.timers.push(timer);
    return () => {
      const idx = this.timers.indexOf(timer);
      if (idx !== -1) this.timers.splice(idx, 1);
    };
  }

  spawn(fn: (...args: any[]) => any, ...args: any[]): void {
    const result = fn(...args);
    if (result && typeof result.next === "function") {
      const step = async () => {
        const { done, value } = result.next();
        if (!done) {
          if (value instanceof Promise) await value;
          setTimeout(step, 0);
        }
      };
      step();
    } else {
      Promise.resolve(result).catch(e => console.error(e));
    }
  }

  step(currentTime: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if (currentTime >= t.nextTime) {
        t.fn();
        if (t.repeat) t.nextTime = currentTime + t.delay;
        else this.timers.splice(i, 1);
      }
    }
  }
}

// ========== weakRef ==========
// Creates a weak reference wrapper that mirrors native WeakRef API
export function weakRef<T extends object>(obj: T): { deref: () => T | undefined } {
  const ref = new WeakRef(obj);
  return { deref: () => ref.deref() };
}
