/**
 * Player Inventory System
 * 
 * Handles item storage, equipping, and dropping.
 * Isolated module for inventory management.
 */

import type { RuntimeObject, Vec3 } from "../types";
import { newId } from "../utils/helpers";

export interface InventoryItem {
  id: string;
  name: string;
  count: number;
  template?: string;
  data: Record<string, any>;
}

export interface PlayerInventory {
  readonly items: ReadonlyArray<InventoryItem>;
  maxSlots: number;
  readonly equipped: InventoryItem | null;
  add: (name: string, opts?: { count?: number; template?: string; data?: Record<string, any> }) => InventoryItem | null;
  remove: (name: string, count?: number) => number;
  has: (name: string, count?: number) => boolean;
  get: (name: string) => InventoryItem | null;
  equip: (name: string | null) => boolean;
  drop: (name: string, count?: number) => RuntimeObject | null;
  clear: () => void;
}

export interface InventoryContext {
  pushLog: (line: string) => void;
  cameraForward: Vec3;
  playerPosition: Vec3;
  replicatedStorage: Record<string, RuntimeObject>;
  cloneTemplate: (tpl: RuntimeObject, container: string, position?: Vec3) => RuntimeObject;
  createObject: (opts: any) => RuntimeObject;
}

/**
 * Creates a stub inventory for initial player setup
 */
export function createStubInventory(): PlayerInventory {
  const items: InventoryItem[] = [];
  return {
    items,
    maxSlots: 32,
    equipped: null,
    add: () => null,
    remove: () => 0,
    has: () => false,
    get: () => null,
    equip: () => false,
    drop: () => null,
    clear: () => {},
  };
}

/**
 * Creates a fully functional inventory system
 */
export function createPlayerInventory(ctx: InventoryContext): PlayerInventory {
  const items: InventoryItem[] = [];
  let equippedId: string | null = null;

  const inventory: PlayerInventory = {
    get items() { return items; },
    maxSlots: 32,
    get equipped() { return items.find(i => i.id === equippedId) ?? null; },
    
    add(name: string, opts?: { count?: number; template?: string; data?: Record<string, any> }): InventoryItem | null {
      const count = Math.max(1, Math.floor(opts?.count ?? 1));
      const existing = items.find(i => i.name === name);
      
      if (existing) {
        existing.count += count;
        if (opts?.data) Object.assign(existing.data, opts.data);
        if (opts?.template && !existing.template) existing.template = opts.template;
        return existing;
      }
      
      if (items.length >= inventory.maxSlots) {
        ctx.pushLog(`inventory.add("${name}"): inventory full (${inventory.maxSlots} slots)`);
        return null;
      }
      
      const slot: InventoryItem = { 
        id: newId(), 
        name, 
        count, 
        template: opts?.template, 
        data: { ...(opts?.data ?? {}) } 
      };
      items.push(slot);
      return slot;
    },

    remove(name: string, count: number = 1): number {
      const idx = items.findIndex(i => i.name === name);
      if (idx < 0) return 0;
      
      const slot = items[idx];
      const removed = Math.min(slot.count, Math.max(1, Math.floor(count)));
      slot.count -= removed;
      
      if (slot.count <= 0) {
        if (slot.id === equippedId) equippedId = null;
        items.splice(idx, 1);
      }
      return removed;
    },

    has(name: string, count: number = 1): boolean {
      return (items.find(i => i.name === name)?.count ?? 0) >= count;
    },

    get(name: string): InventoryItem | null {
      return items.find(i => i.name === name) ?? null;
    },

    equip(name: string | null): boolean {
      if (name == null) { equippedId = null; return true; }
      const slot = items.find(i => i.name === name);
      if (!slot) return false;
      equippedId = slot.id;
      return true;
    },

    drop(name: string, count: number = 1): RuntimeObject | null {
      const slot = items.find(i => i.name === name);
      if (!slot) return null;
      
      const dropped = inventory.remove(name, count);
      if (dropped <= 0) return null;
      
      const fwd = ctx.cameraForward;
      const fLen = Math.hypot(fwd.x, 0, fwd.z) || 1;
      const fx = fwd.x / fLen;
      const fz = fwd.z / fLen;
      
      const dropPos: Vec3 = { 
        x: ctx.playerPosition.x + fx * 1.5, 
        y: ctx.playerPosition.y + 0.5, 
        z: ctx.playerPosition.z + fz * 1.5 
      };
      
      const tpl = ctx.replicatedStorage[slot.template ?? name];
      let ro: RuntimeObject;
      
      if (tpl) {
        ro = ctx.cloneTemplate(tpl, "Workspace", dropPos);
      } else {
        ro = ctx.createObject({ 
          name, 
          primitiveType: "cube", 
          container: "Workspace", 
          position: dropPos, 
          color: "#c084fc" 
        });
      }
      
      ro.isPickup = true;
      ro.pickupName = name;
      ro.pickupData = { ...slot.data };
      return ro;
    },

    clear() {
      items.length = 0;
      equippedId = null;
    },
  };

  return inventory;
}
