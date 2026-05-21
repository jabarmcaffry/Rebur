/**
 * Object Factory
 * 
 * Creates and initializes RuntimeObjects with proper event handling,
 * property proxies, and hierarchy integration.
 */

import type { RuntimeObject, ContainerName, Vec3, ObjectEventName } from "../types";
import { EventBus } from "../events/event-bus";
import { RESERVED_OBJECT_EVENTS } from "../oop/runtime-object-proxy";
import type { HierarchyIndex } from "../hierarchy";
import { newId, clamp01, readProperties, DEFAULT_PROPERTIES } from "../utils/helpers";
import type { GameObject } from "@shared/schema";

export interface ObjectFactoryContext {
  allObjects: Map<string, RuntimeObject>;
  objectEvents: Map<string, EventBus<Record<any, any>>>;
  hierarchy: HierarchyIndex;
}

/**
 * Normalize container name to valid ContainerName
 */
export function normalizeContainer(raw: string | undefined | null): ContainerName {
  const valid: ContainerName[] = [
    "Workspace", "Lighting", "Players", 
    "ServerScriptService", "StarterPlayer", "ReplicatedStorage"
  ];
  if (raw && valid.includes(raw as ContainerName)) return raw as ContainerName;
  return "Workspace";
}

/**
 * Create a RuntimeObject from a GameObject snapshot
 */
export function createRuntimeObjectFromSnapshot(
  o: GameObject,
  ctx: ObjectFactoryContext
): RuntimeObject {
  const props = readProperties(o);
  const container = normalizeContainer(o.container);
  
  const rawRo: RuntimeObject = {
    id: o.id,
    name: o.name,
    type: o.type,
    primitiveType: o.primitiveType,
    container,
    position: { x: o.positionX ?? 0, y: o.positionY ?? 0, z: o.positionZ ?? 0 },
    rotation: { x: o.rotationX ?? 0, y: o.rotationY ?? 0, z: o.rotationZ ?? 0 },
    scale: { x: o.scaleX ?? 1, y: o.scaleY ?? 1, z: o.scaleZ ?? 1 },
    color: o.color ?? "#888888",
    visible: true,
    ...props,
    velocity: { x: 0, y: 0, z: 0 },
    on: () => () => {},
    off: () => {},
    parentId: null,
    children: [],
    findFirstChild: () => null,
    setParent: () => {},
    emit: () => false,
    _gravityExclusions: new Set<string>(),
    setAttribute: () => {},
    getAttribute: () => undefined,
    getAttributes: () => ({}),
    __cleanup: new Set(),
  };
  
  return mountObjectEvents(rawRo, ctx);
}

/**
 * Create a new RuntimeObject programmatically
 */
export function createRuntimeObject(
  opts: {
    name?: string;
    primitiveType?: string;
    container?: string;
    position?: Partial<Vec3>;
    rotation?: Partial<Vec3>;
    scale?: Partial<Vec3>;
    color?: string;
    parentId?: string | null;
    canCollide?: boolean;
    anchored?: boolean;
    gravity?: false | { strength: number; radius: number };
  },
  objectCount: number,
  ctx: ObjectFactoryContext
): RuntimeObject {
  const raw: RuntimeObject = {
    id: newId(),
    name: opts.name ?? `Part_${objectCount + 1}`,
    type: "primitive",
    primitiveType: opts.primitiveType ?? "cube",
    container: normalizeContainer(opts.container),
    position: { x: 0, y: 0, z: 0, ...(opts.position ?? {}) },
    rotation: { x: 0, y: 0, z: 0, ...(opts.rotation ?? {}) },
    scale: { x: 1, y: 1, z: 1, ...(opts.scale ?? {}) },
    color: opts.color ?? "#88aaff",
    visible: true,
    ...DEFAULT_PROPERTIES,
    anchored: opts.anchored ?? false,
    canCollide: opts.canCollide ?? DEFAULT_PROPERTIES.canCollide,
    gravity: opts.gravity ?? false,
    velocity: { x: 0, y: 0, z: 0 },
    on: () => () => {},
    off: () => {},
    parentId: opts.parentId ?? null,
    children: [],
    findFirstChild: () => null,
    setParent: () => {},
    emit: () => false,
    _gravityExclusions: new Set<string>(),
    setAttribute: () => {},
    getAttribute: () => undefined,
    getAttributes: () => ({}),
    __cleanup: new Set(),
  };
  
  return mountObjectEvents(raw, ctx);
}

/**
 * Clone a template object into a container
 */
export function cloneTemplate(
  tpl: RuntimeObject,
  container: ContainerName,
  position: Vec3 | undefined,
  objectCount: number,
  ctx: ObjectFactoryContext
): RuntimeObject {
  const raw: RuntimeObject = {
    id: newId(),
    name: `${tpl.name}_${objectCount + 1}`,
    type: tpl.type,
    primitiveType: tpl.primitiveType,
    container,
    position: position ? { ...position } : { ...tpl.position },
    rotation: { ...tpl.rotation },
    scale: { ...tpl.scale },
    color: tpl.color,
    visible: true,
    anchored: tpl.anchored,
    canCollide: tpl.canCollide,
    transparency: tpl.transparency,
    mass: tpl.mass,
    friction: tpl.friction,
    gravity: tpl.gravity === false ? false : (tpl.gravity ? { strength: tpl.gravity.strength, radius: tpl.gravity.radius } : false),
    velocity: { x: 0, y: 0, z: 0 },
    on: () => () => {},
    off: () => {},
    parentId: null,
    children: [],
    findFirstChild: () => null,
    setParent: () => {},
    emit: () => false,
    _gravityExclusions: new Set(),
    setAttribute: () => {},
    getAttribute: () => undefined,
    getAttributes: () => ({}),
    __cleanup: new Set(),
  };
  
  return mountObjectEvents(raw, ctx);
}

/**
 * Mount event handlers and property proxies on a RuntimeObject
 */
function mountObjectEvents(
  raw: RuntimeObject,
  ctx: ObjectFactoryContext
): RuntimeObject {
  const id = raw.id;
  const propertyEvents = new Map<string, EventBus<Record<"changed", [property: string, newValue: any, oldValue: any]>>>();
  const attributes = new Map<string, any>();
  const cleanupSet = new Set<() => void>();

  // Property change proxy
  const proxy = new Proxy(raw, {
    set: (target, prop, value) => {
      const propName = prop as string;
      const oldValue = (target as any)[propName];
      if (oldValue !== value) {
        (target as any)[propName] = value;
        const propBus = propertyEvents.get(propName);
        if (propBus) propBus.emit("changed", [propName, value, oldValue]);
        const generalBus = ctx.objectEvents.get(id);
        if (generalBus) generalBus.emit("changed", [propName, value, oldValue]);
      }
      return true;
    }
  });

  // Event subscription
  proxy.on = (event: ObjectEventName, fn: (...args: any[]) => void) => {
    let bus = ctx.objectEvents.get(id);
    if (!bus) {
      bus = new EventBus();
      ctx.objectEvents.set(id, bus);
    }
    const disconnect = bus.on(event as any, fn as any);
    cleanupSet.add(disconnect);
    return () => {
      disconnect();
      cleanupSet.delete(disconnect);
    };
  };

  proxy.off = (event: ObjectEventName, fn: (...args: any[]) => void) => {
    ctx.objectEvents.get(id)?.off(event as any, fn as any);
  };

  proxy.emit = (event: string, ...args: any[]) => {
    if (RESERVED_OBJECT_EVENTS.has(event)) {
      console.warn(`obj.emit("${event}"): "${event}" is engine-reserved and cannot be emitted from user code.`);
      return false;
    }
    let bus = ctx.objectEvents.get(id);
    if (!bus) { bus = new EventBus(); ctx.objectEvents.set(id, bus); }
    bus.emit(event as any, args as any);
    return true;
  };

  // Attributes
  proxy.setAttribute = (key: string, value: any) => {
    const old = attributes.get(key);
    if (old !== value) {
      attributes.set(key, value);
      const generalBus = ctx.objectEvents.get(id);
      if (generalBus) generalBus.emit("changed", [`Attribute.${key}`, value, old]);
    }
  };
  proxy.getAttribute = (key: string) => attributes.get(key);
  proxy.getAttributes = () => Object.fromEntries(attributes);

  // Hierarchy
  const hi = ctx.hierarchy;
  const all = ctx.allObjects;
  Object.defineProperty(proxy, "children", {
    get: () => hi.childIds(id).map(cid => all.get(cid)).filter(Boolean) as RuntimeObject[]
  });
  
  proxy.findFirstChild = (name: string) => {
    for (const cid of hi.childIds(id)) {
      const child = all.get(cid);
      if (child && child.name === name) return child;
    }
    return null;
  };
  
  proxy.setParent = (parent: RuntimeObject | null) => {
    hi.reparent(proxy, parent ? parent.id : null);
    proxy.parentId = parent ? parent.id : null;
  };
  
  hi.add(proxy);

  // Gravity proxy
  let gravityValue: false | { strength: number; radius: number } = 
    raw.gravity === false ? false : (raw.gravity ? { strength: raw.gravity.strength, radius: raw.gravity.radius } : false);
  const exclusions = new Set<string>();

  const gravityProxy = new Proxy({} as any, {
    get: (_, p) => {
      if (p === "strength") return gravityValue && typeof gravityValue === "object" ? gravityValue.strength : undefined;
      if (p === "radius") return gravityValue && typeof gravityValue === "object" ? gravityValue.radius : undefined;
      if (p === "player") return !exclusions.has("player");
      if (typeof p === "string") return !exclusions.has(p);
      return undefined;
    },
    set: (_, p, newValue) => {
      if (p === "strength" || p === "radius") {
        if (!gravityValue || typeof gravityValue !== "object") gravityValue = { strength: 9.81, radius: 30 };
        if (p === "strength") gravityValue.strength = newValue;
        if (p === "radius") gravityValue.radius = newValue;
        return true;
      }
      const key = String(p);
      if (newValue === false) {
        exclusions.add(key);
      } else if (newValue === true) {
        exclusions.delete(key);
      }
      return true;
    },
    deleteProperty: (_, p) => {
      exclusions.delete(String(p));
      return true;
    }
  });

  Object.defineProperty(proxy, "gravity", {
    get: () => gravityProxy,
    set: (val: any) => {
      if (!val || val === false) {
        gravityValue = false;
        exclusions.clear();
      } else if (typeof val === "object" && "strength" in val && "radius" in val) {
        gravityValue = { strength: val.strength, radius: val.radius };
      } else {
        const cfg = { strength: 9.81, radius: 30 };
        if (val && typeof val === "object") {
          if ("strength" in val) cfg.strength = val.strength;
          if ("radius" in val) cfg.radius = val.radius;
        }
        gravityValue = cfg;
      }
    }
  });

  Object.defineProperty(proxy, "_gravityExclusions", {
    get: () => exclusions,
    configurable: true,
  });

  Object.defineProperty(proxy, "__cleanup", {
    value: cleanupSet,
    writable: false,
    configurable: true,
  });

  return proxy;
}


