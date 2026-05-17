/**
 * RuntimeObjectProxy — thin proxy that reads directly from ECS components.
 *
 * Instead of maintaining a separate RuntimeObject with copied data that must
 * be synced every frame, this proxy reads from the ECS world on demand.
 * Writes go through the command system so they're properly tracked.
 *
 * This eliminates the dual-sync overhead where we were copying data from
 * RuntimeObjects -> ECS -> RuntimeObjects every frame.
 */
import type { World, EntityId, ComponentDef } from "../ecs/world";
import { Transform, Velocity, Visual, Physics, AutoBehavior, ObjectHandle } from "../ecs/components";
import type { Vec3, RuntimeObject, ContainerName, ObjectEventName } from "../types";
import { EventBus, type EventsAPI } from "../types";

/** Dependencies needed to create a RuntimeObject proxy */
export interface RuntimeObjectProxyDeps {
  /** The ECS world to read from */
  world: World;
  /** Entity ID in the ECS world */
  entityId: EntityId;
  /** String object ID */
  objectId: string;
  /** Object name */
  name: string;
  /** Container name */
  container: ContainerName;
  /** Object type */
  type: string;
  /** Primitive type */
  primitiveType: string | null;
  /** Hierarchy access */
  hierarchy: {
    childIds: (id: string) => string[];
    descendantIds: (id: string) => string[];
    add: (obj: RuntimeObject) => void;
    remove: (obj: RuntimeObject) => void;
    reparent: (obj: RuntimeObject, parentId: string | null) => void;
  };
  /** Lookup other objects */
  getObjectById: (id: string) => RuntimeObject | undefined;
  /** Event bus for object events */
  getObjectEventBus: (id: string) => EventBus<Record<any, any>>;
  /** Log function */
  pushLog: (line: string) => void;
  /** Mark object for ECS sync when written */
  markDirty: (entityId: EntityId) => void;
}

/**
 * Create a Vec3 proxy that reads from ECS and writes through the deps.
 */
function createVec3Proxy(
  deps: RuntimeObjectProxyDeps,
  component: ComponentDef<any>,
  property: "position" | "rotation" | "scale",
): Vec3 {
  const read = (): Vec3 => {
    const data = deps.world.get(deps.entityId, component);
    if (data && property in data) {
      return data[property] as Vec3;
    }
    return { x: 0, y: 0, z: 0 };
  };

  return new Proxy({} as Vec3, {
    get(_t, k) {
      const vec = read();
      if (k === "x" || k === "y" || k === "z") return vec[k];
      return undefined;
    },
    set(_t, k, v) {
      if (k !== "x" && k !== "y" && k !== "z") return false;
      const data = deps.world.get(deps.entityId, component);
      if (data && property in data) {
        (data[property] as Vec3)[k as keyof Vec3] = Number(v);
        deps.world.set(deps.entityId, component, data);
        deps.markDirty(deps.entityId);
      }
      return true;
    },
    ownKeys() {
      return ["x", "y", "z"];
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  });
}

/**
 * Create a Vec3 proxy for velocity (stored directly as Vec3, not nested).
 */
function createVelocityProxy(deps: RuntimeObjectProxyDeps): Vec3 {
  const read = (): Vec3 => {
    const vel = deps.world.get(deps.entityId, Velocity);
    return vel ?? { x: 0, y: 0, z: 0 };
  };

  return new Proxy({} as Vec3, {
    get(_t, k) {
      const vec = read();
      if (k === "x" || k === "y" || k === "z") return vec[k];
      return undefined;
    },
    set(_t, k, v) {
      if (k !== "x" && k !== "y" && k !== "z") return false;
      let vel = deps.world.get(deps.entityId, Velocity);
      if (!vel) vel = { x: 0, y: 0, z: 0 };
      vel[k as keyof Vec3] = Number(v);
      deps.world.set(deps.entityId, Velocity, vel);
      deps.markDirty(deps.entityId);
      return true;
    },
    ownKeys() {
      return ["x", "y", "z"];
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  });
}

/**
 * Creates a RuntimeObject proxy that reads directly from ECS components.
 * No data copying - all reads go straight to the ECS world.
 */
export function createRuntimeObjectProxy(deps: RuntimeObjectProxyDeps): RuntimeObject {
  const propertyEvents = new Map<string, EventBus<Record<"changed", [property: string, newValue: any, oldValue: any]>>>();
  const attributes = new Map<string, any>();
  const cleanupSet = new Set<() => void>();

  // Create position/rotation/scale proxies
  const positionProxy = createVec3Proxy(deps, Transform, "position");
  const rotationProxy = createVec3Proxy(deps, Transform, "rotation");
  const scaleProxy = createVec3Proxy(deps, Transform, "scale");
  const velocityProxy = createVelocityProxy(deps);

  // Gravity exclusions (local state - not in ECS for now)
  const gravityExclusions = new Set<string>();
  
  // Gravity proxy for the complex gravity API
  let gravityValue: false | { strength: number; radius: number } = false;
  const gravityProxy = new Proxy({} as any, {
    get(_, p) {
      const physics = deps.world.get(deps.entityId, Physics);
      const grav = physics?.gravity;
      if (p === "strength") return grav && typeof grav === "object" ? grav.strength : undefined;
      if (p === "radius") return grav && typeof grav === "object" ? grav.radius : undefined;
      if (p === "player") return !gravityExclusions.has("player");
      if (typeof p === "string") return !gravityExclusions.has(p);
      return undefined;
    },
    set(_, p, newValue) {
      if (p === "strength" || p === "radius") {
        const physics = deps.world.get(deps.entityId, Physics);
        if (physics) {
          let grav = physics.gravity;
          if (!grav || typeof grav !== "object") grav = { strength: 9.81, radius: 30 };
          if (p === "strength") grav.strength = newValue;
          if (p === "radius") grav.radius = newValue;
          physics.gravity = grav;
          deps.world.set(deps.entityId, Physics, physics);
          deps.markDirty(deps.entityId);
        }
        return true;
      }
      const key = String(p);
      if (newValue === false) {
        gravityExclusions.add(key);
      } else if (newValue === true) {
        gravityExclusions.delete(key);
      }
      return true;
    },
    deleteProperty(_, p) {
      gravityExclusions.delete(String(p));
      return true;
    },
  });

  const obj: RuntimeObject = {
    // Identity - these are fixed
    get id() { return deps.objectId; },
    get name() { 
      const handle = deps.world.get(deps.entityId, ObjectHandle);
      return handle?.name ?? deps.name; 
    },
    set name(v: string) {
      const handle = deps.world.get(deps.entityId, ObjectHandle);
      if (handle) {
        handle.name = v;
        deps.world.set(deps.entityId, ObjectHandle, handle);
      }
    },
    type: deps.type,
    primitiveType: deps.primitiveType,
    container: deps.container,

    // Transform - read directly from ECS
    get position() { return positionProxy; },
    set position(v: Vec3) {
      const tf = deps.world.get(deps.entityId, Transform);
      if (tf) {
        tf.position.x = v.x; tf.position.y = v.y; tf.position.z = v.z;
        deps.world.set(deps.entityId, Transform, tf);
        deps.markDirty(deps.entityId);
      }
    },
    get rotation() { return rotationProxy; },
    set rotation(v: Vec3) {
      const tf = deps.world.get(deps.entityId, Transform);
      if (tf) {
        tf.rotation.x = v.x; tf.rotation.y = v.y; tf.rotation.z = v.z;
        deps.world.set(deps.entityId, Transform, tf);
        deps.markDirty(deps.entityId);
      }
    },
    get scale() { return scaleProxy; },
    set scale(v: Vec3) {
      const tf = deps.world.get(deps.entityId, Transform);
      if (tf) {
        tf.scale.x = v.x; tf.scale.y = v.y; tf.scale.z = v.z;
        deps.world.set(deps.entityId, Transform, tf);
        deps.markDirty(deps.entityId);
      }
    },
    get velocity() { return velocityProxy; },
    set velocity(v: Vec3) {
      deps.world.set(deps.entityId, Velocity, { x: v.x, y: v.y, z: v.z });
      deps.markDirty(deps.entityId);
    },

    // Visual - read directly from ECS
    get color() {
      return deps.world.get(deps.entityId, Visual)?.color ?? "#888888";
    },
    set color(v: string) {
      const visual = deps.world.get(deps.entityId, Visual);
      if (visual) {
        const old = visual.color;
        visual.color = v;
        deps.world.set(deps.entityId, Visual, visual);
        deps.markDirty(deps.entityId);
        // Emit property change event
        const bus = propertyEvents.get("color");
        if (bus) bus.emit("changed", ["color", v, old]);
      }
    },
    get visible() {
      return deps.world.get(deps.entityId, Visual)?.visible ?? true;
    },
    set visible(v: boolean) {
      const visual = deps.world.get(deps.entityId, Visual);
      if (visual) {
        visual.visible = v;
        deps.world.set(deps.entityId, Visual, visual);
        deps.markDirty(deps.entityId);
      }
    },
    get transparency() {
      return deps.world.get(deps.entityId, Visual)?.transparency ?? 0;
    },
    set transparency(v: number) {
      const visual = deps.world.get(deps.entityId, Visual);
      if (visual) {
        visual.transparency = v;
        deps.world.set(deps.entityId, Visual, visual);
        deps.markDirty(deps.entityId);
      }
    },

    // Physics - read directly from ECS
    get anchored() {
      return deps.world.get(deps.entityId, Physics)?.anchored ?? true;
    },
    set anchored(v: boolean) {
      const physics = deps.world.get(deps.entityId, Physics);
      if (physics) {
        physics.anchored = v;
        deps.world.set(deps.entityId, Physics, physics);
        deps.markDirty(deps.entityId);
      }
    },
    get canCollide() {
      return deps.world.get(deps.entityId, Physics)?.canCollide ?? true;
    },
    set canCollide(v: boolean) {
      const physics = deps.world.get(deps.entityId, Physics);
      if (physics) {
        physics.canCollide = v;
        deps.world.set(deps.entityId, Physics, physics);
        deps.markDirty(deps.entityId);
      }
    },
    get mass() {
      return deps.world.get(deps.entityId, Physics)?.mass ?? 1;
    },
    set mass(v: number) {
      const physics = deps.world.get(deps.entityId, Physics);
      if (physics) {
        physics.mass = v;
        deps.world.set(deps.entityId, Physics, physics);
        deps.markDirty(deps.entityId);
      }
    },
    get friction() {
      return deps.world.get(deps.entityId, Physics)?.friction ?? 0.4;
    },
    set friction(v: number) {
      const physics = deps.world.get(deps.entityId, Physics);
      if (physics) {
        physics.friction = v;
        deps.world.set(deps.entityId, Physics, physics);
        deps.markDirty(deps.entityId);
      }
    },
    get gravity() {
      return gravityProxy;
    },
    set gravity(val: any) {
      const physics = deps.world.get(deps.entityId, Physics);
      if (physics) {
        if (!val || val === false) {
          physics.gravity = false;
          gravityExclusions.clear();
        } else if (typeof val === "object" && "strength" in val && "radius" in val) {
          physics.gravity = { strength: val.strength, radius: val.radius };
        } else {
          physics.gravity = { strength: 9.81, radius: 30 };
        }
        deps.world.set(deps.entityId, Physics, physics);
        deps.markDirty(deps.entityId);
      }
    },

    // Auto behaviors - read from ECS
    get autoRotateY() {
      return deps.world.get(deps.entityId, AutoBehavior)?.autoRotateY;
    },
    set autoRotateY(v: number | undefined) {
      let auto = deps.world.get(deps.entityId, AutoBehavior);
      if (!auto) auto = {};
      auto.autoRotateY = v;
      deps.world.set(deps.entityId, AutoBehavior, auto);
      deps.markDirty(deps.entityId);
    },
    get autoBob() {
      return deps.world.get(deps.entityId, AutoBehavior)?.autoBob;
    },
    set autoBob(v: any) {
      let auto = deps.world.get(deps.entityId, AutoBehavior);
      if (!auto) auto = {};
      auto.autoBob = v;
      deps.world.set(deps.entityId, AutoBehavior, auto);
      deps.markDirty(deps.entityId);
    },
    get autoSpin() {
      return deps.world.get(deps.entityId, AutoBehavior)?.autoSpin;
    },
    set autoSpin(v: any) {
      let auto = deps.world.get(deps.entityId, AutoBehavior);
      if (!auto) auto = {};
      auto.autoSpin = v;
      deps.world.set(deps.entityId, AutoBehavior, auto);
      deps.markDirty(deps.entityId);
    },
    get autoMove() {
      return deps.world.get(deps.entityId, AutoBehavior)?.autoMove;
    },
    set autoMove(v: any) {
      let auto = deps.world.get(deps.entityId, AutoBehavior);
      if (!auto) auto = {};
      auto.autoMove = v;
      deps.world.set(deps.entityId, AutoBehavior, auto);
      deps.markDirty(deps.entityId);
    },
    get autoFollow() {
      return deps.world.get(deps.entityId, AutoBehavior)?.autoFollow;
    },
    set autoFollow(v: any) {
      let auto = deps.world.get(deps.entityId, AutoBehavior);
      if (!auto) auto = {};
      auto.autoFollow = v;
      deps.world.set(deps.entityId, AutoBehavior, auto);
      deps.markDirty(deps.entityId);
    },

    // Hierarchy
    parentId: null,
    get children() {
      return deps.hierarchy.childIds(deps.objectId)
        .map(cid => deps.getObjectById(cid))
        .filter(Boolean) as RuntimeObject[];
    },
    findFirstChild(name: string) {
      for (const cid of deps.hierarchy.childIds(deps.objectId)) {
        const child = deps.getObjectById(cid);
        if (child && child.name === name) return child;
      }
      return null;
    },
    setParent(parent: RuntimeObject | null) {
      deps.hierarchy.reparent(obj, parent ? parent.id : null);
      obj.parentId = parent ? parent.id : null;
    },

    // Events
    on(event: ObjectEventName, fn: (...args: any[]) => void) {
      const bus = deps.getObjectEventBus(deps.objectId);
      const disconnect = bus.on(event as any, fn as any);
      cleanupSet.add(disconnect);
      return () => {
        disconnect();
        cleanupSet.delete(disconnect);
      };
    },
    off(event: ObjectEventName, fn: (...args: any[]) => void) {
      const bus = deps.getObjectEventBus(deps.objectId);
      bus.off(event as any, fn as any);
    },
    onPropertyChanged(property: string) {
      let bus = propertyEvents.get(property);
      if (!bus) { bus = new EventBus(); propertyEvents.set(property, bus); }
      const api: EventsAPI = {
        on: (event: any, fn: any) => {
          const disconnect = bus!.on(event, fn);
          cleanupSet.add(disconnect);
          return () => {
            disconnect();
            cleanupSet.delete(disconnect);
          };
        },
        off: (event: any, fn: any) => bus!.off(event, fn),
      };
      return api;
    },
    GetPropertyChangedSignal(property: string) {
      return obj.onPropertyChanged(property);
    },

    // Attributes
    setAttribute(key: string, value: any) {
      const old = attributes.get(key);
      if (old !== value) {
        attributes.set(key, value);
        const bus = deps.getObjectEventBus(deps.objectId);
        bus.emit("changed", [`Attribute.${key}`, value, old]);
      }
    },
    getAttribute(key: string) {
      return attributes.get(key);
    },
    getAttributes() {
      return Object.fromEntries(attributes);
    },

    // Internal
    _gravityExclusions: gravityExclusions,
    __cleanup: cleanupSet,
  };

  // Register with hierarchy
  deps.hierarchy.add(obj);

  return obj;
}

/**
 * Creates a snapshot view of an ECS entity for rendering.
 * This is a lightweight read-only view for the render path.
 */
export interface EntityRenderSnapshot {
  id: string;
  entityId: number;
  name: string;
  type: string;
  primitiveType: string | null;
  container: ContainerName;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  transparency: number;
  anchored: boolean;
  canCollide: boolean;
}

/**
 * Read a render snapshot directly from ECS for an entity.
 */
export function readEntitySnapshot(world: World, entityId: EntityId, objectId: string): EntityRenderSnapshot | null {
  const transform = world.get(entityId, Transform);
  const visual = world.get(entityId, Visual);
  const physics = world.get(entityId, Physics);
  const handle = world.get(entityId, ObjectHandle);
  
  if (!transform || !visual) return null;
  
  return {
    id: objectId,
    entityId: entityId as unknown as number,
    name: handle?.name ?? `entity_${entityId}`,
    type: "primitive", // TODO: store in ECS
    primitiveType: visual.primitiveType,
    container: "Workspace", // TODO: store in ECS
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale },
    color: visual.color,
    visible: visual.visible,
    transparency: visual.transparency,
    anchored: physics?.anchored ?? true,
    canCollide: physics?.canCollide ?? true,
  };
}
