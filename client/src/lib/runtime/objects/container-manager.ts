/**
 * Container Manager
 * 
 * Manages object organization by container (Workspace, Lighting, etc.)
 * and maintains indexes for fast lookup.
 */

import type { RuntimeObject, ContainerName } from "../types";

export interface ContainerIndexes {
  workspace: Record<string, RuntimeObject>;
  lighting: Record<string, RuntimeObject>;
  replicatedStorage: Record<string, RuntimeObject>;
  serverScriptService: Record<string, RuntimeObject>;
  starterPlayer: Record<string, RuntimeObject>;
  players: Record<string, RuntimeObject>;
  objectList: RuntimeObject[];
}

/**
 * Create empty container indexes
 */
export function createContainerIndexes(): ContainerIndexes {
  return {
    workspace: {},
    lighting: {},
    replicatedStorage: {},
    serverScriptService: {},
    starterPlayer: {},
    players: {},
    objectList: [],
  };
}

/**
 * Rebuild container indexes from the master object map
 */
export function rebuildContainerIndexes(
  allObjects: Map<string, RuntimeObject>,
  indexes: ContainerIndexes
): void {
  // Clear all indexes
  for (const k of Object.keys(indexes.workspace)) delete indexes.workspace[k];
  for (const k of Object.keys(indexes.lighting)) delete indexes.lighting[k];
  for (const k of Object.keys(indexes.replicatedStorage)) delete indexes.replicatedStorage[k];
  for (const k of Object.keys(indexes.serverScriptService)) delete indexes.serverScriptService[k];
  for (const k of Object.keys(indexes.starterPlayer)) delete indexes.starterPlayer[k];
  for (const k of Object.keys(indexes.players)) delete indexes.players[k];
  
  const list: RuntimeObject[] = [];
  
  for (const ro of allObjects.values()) {
    switch (ro.container) {
      case "Workspace":
        indexes.workspace[ro.name] = ro;
        list.push(ro);
        break;
      case "Lighting":
        indexes.lighting[ro.name] = ro;
        list.push(ro);
        break;
      case "ReplicatedStorage":
        indexes.replicatedStorage[ro.name] = ro;
        break;
      case "ServerScriptService":
        indexes.serverScriptService[ro.name] = ro;
        break;
      case "StarterPlayer":
        indexes.starterPlayer[ro.name] = ro;
        break;
      case "Players":
        indexes.players[ro.name] = ro;
        break;
    }
  }
  
  indexes.objectList = list;
}

/**
 * Find an object by name across all containers
 */
export function findObjectByName(
  name: string,
  indexes: ContainerIndexes,
  allObjects: Map<string, RuntimeObject>
): RuntimeObject | null {
  // Check named indexes first
  if (indexes.workspace[name]) return indexes.workspace[name];
  if (indexes.lighting[name]) return indexes.lighting[name];
  if (indexes.replicatedStorage[name]) return indexes.replicatedStorage[name];
  if (indexes.serverScriptService[name]) return indexes.serverScriptService[name];
  if (indexes.starterPlayer[name]) return indexes.starterPlayer[name];
  if (indexes.players[name]) return indexes.players[name];
  
  // Fall back to full search
  for (const o of allObjects.values()) {
    if (o.name === name) return o;
  }
  
  return null;
}
