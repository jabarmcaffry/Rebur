/**
 * Object Manager - handles object lifecycle (create, destroy, lookup)
 * Extracted from core.ts for better organization.
 * 
 * Note: This is a utility class for managing object collections.
 * The actual object creation logic with full property initialization
 * remains in core.ts to maintain the exact same behavior.
 */

import type { RuntimeObject } from "../types";
import { newId } from "../utils/helpers";

export class ObjectManager {
  /** Main object list */
  private _objects: RuntimeObject[] = [];
  
  /** Fast lookup by ID */
  private _byId: Map<string, RuntimeObject> = new Map();
  
  /** Fast lookup by name */
  private _byName: Map<string, RuntimeObject> = new Map();

  /** Read-only access to object list */
  get objects(): RuntimeObject[] {
    return this._objects;
  }

  /** Initialize from a list of objects */
  initialize(objects: RuntimeObject[]): void {
    this._objects = [...objects];
    this._rebuildIndices();
  }

  /** Clear all objects */
  clear(): void {
    this._objects = [];
    this._byId.clear();
    this._byName.clear();
  }

  /** Rebuild lookup indices */
  private _rebuildIndices(): void {
    this._byId.clear();
    this._byName.clear();
    for (const obj of this._objects) {
      this._byId.set(obj.id, obj);
      if (obj.name) {
        this._byName.set(obj.name, obj);
      }
    }
  }

  /** Find object by ID */
  findById(id: string): RuntimeObject | undefined {
    return this._byId.get(id);
  }

  /** Find object by name */
  findByName(name: string): RuntimeObject | undefined {
    return this._byName.get(name);
  }

  /** Find objects matching a predicate */
  findAll(predicate: (obj: RuntimeObject) => boolean): RuntimeObject[] {
    return this._objects.filter(predicate);
  }

  /** Add an already-created object to the manager */
  add(obj: RuntimeObject): void {
    this._objects.push(obj);
    this._byId.set(obj.id, obj);
    if (obj.name) {
      this._byName.set(obj.name, obj);
    }
  }

  /** Destroy an object by ID */
  destroy(id: string): boolean {
    const idx = this._objects.findIndex((o) => o.id === id);
    if (idx === -1) return false;

    const obj = this._objects[idx];
    this._objects.splice(idx, 1);
    this._byId.delete(id);
    if (obj.name) {
      this._byName.delete(obj.name);
    }

    return true;
  }

  /** Get all objects in a container */
  getByContainer(container: string): RuntimeObject[] {
    return this._objects.filter((o) => o.container === container);
  }

  /** Update object indices after external modification */
  reindex(): void {
    this._rebuildIndices();
  }
}
