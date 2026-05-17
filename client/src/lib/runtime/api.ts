// api.ts
import type { RuntimeObject } from "./types";

// ========== Emitter ==========
export class Emitter<T extends any[] = any[]> {
  private listeners = new Set<(...args: T) => void>();
  private onceListeners = new Set<(...args: T) => void>();

  on(fn: (...args: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.off(fn);
  }

  once(fn: (...args: T) => void): () => void {
    this.onceListeners.add(fn);
    return () => this.off(fn);
  }

  off(fn: (...args: T) => void): void {
    this.listeners.delete(fn);
    this.onceListeners.delete(fn);
  }

  emit(...args: T): void {
    for (const fn of this.listeners) fn(...args);
    for (const fn of this.onceListeners) {
      fn(...args);
      this.onceListeners.delete(fn);
    }
  }

  wait(): Promise<T> {
    return new Promise(resolve => {
      const off = this.once((...args) => {
        off();
        resolve(args);
      });
    });
  }

  clear(): void {
    this.listeners.clear();
    this.onceListeners.clear();
  }
}

// ========== Callable ==========
export class Callable<TArgs extends any[] = any[], TResult = any> {
  private handler: ((...args: TArgs) => TResult) | null = null;

  setHandler(fn: (...args: TArgs) => TResult): void {
    this.handler = fn;
  }

  invoke(...args: TArgs): TResult {
    if (!this.handler) throw new Error("Callable has no handler");
    return this.handler(...args);
  }
}

// ========== WeakTable ==========
export class WeakTable<K extends object, V> {
  private map = new WeakMap<K, V>();
  set(key: K, value: V): this { this.map.set(key, value); return this; }
  get(key: K): V | undefined { return this.map.get(key); }
  has(key: K): boolean { return this.map.has(key); }
  delete(key: K): boolean { return this.map.delete(key); }
}

// ========== Class system ==========
export class Class {
  static extend<T extends typeof Class>(this: T, name: string, base?: any): any {
    const ctor = function(this: any, props: any = {}) {
      this.__name = name;
      Object.assign(this, props);
      if (this.construct) this.construct();
    };
    if (base) Object.setPrototypeOf(ctor.prototype, base.prototype);
    ctor.prototype.__class = ctor;
    ctor.prototype.__name = name;
    ctor.prototype.destroy = function() { if (this.destruct) this.destruct(); };
    return ctor;
  }
}

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
export function weakRef<T extends object>(obj: T): { get: () => T | null } {
  const ref = new WeakRef(obj);
  return { get: () => ref.deref() ?? null };
}
