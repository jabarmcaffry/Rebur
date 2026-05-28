/**
 * Browser-side data layer that mimics the server's MemStorage so the editor can
 * run on hosts (like Lovable) that don't boot the Express backend.
 *
 * State is kept in-memory and mirrored to localStorage so refreshing the page
 * preserves your worlds. The shape of every record matches @shared/schema, so
 * the same React components / queries work whether they hit the real server or
 * this shim (see queryClient.ts for the routing layer).
 */
import type {
  User,
  Game,
  GameObject,
  Script,
  Asset,
  MultiplayerSession,
  SessionPlayer,
} from "@shared/schema";

// v3 — event-first scripting reshape: dropped onStart/onUpdate from seed
// scripts in favor of top-level execution + events.on(...). Bumping the
// key wipes any v2 worlds whose seeded "Welcome" still has the old shape.
// v2 — schema reshape (Roblox-style service names: Workspace, Lighting,
// Players, ServerScriptService, StarterPlayer, ReplicatedStorage). Bumping
// the key wipes any v1 worlds since we explicitly dropped backwards compat.
const LS_KEY = "rebur-engine:store:v3";

type DB = {
  users: Record<string, User>;
  games: Record<string, Game>;
  gameObjects: Record<string, GameObject>;
  scripts: Record<string, Script>;
  assets: Record<string, Asset>;
  sessions: Record<string, MultiplayerSession>;
  sessionPlayers: Record<string, SessionPlayer>;
  /** Currently logged-in user id (null = logged out). */
  currentUserId: string | null;
};

function emptyDb(): DB {
  const testUser: User = {
    id: "test",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    profileImageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    users: { test: testUser },
    games: {},
    gameObjects: {},
    scripts: {},
    assets: {},
    sessions: {},
    sessionPlayers: {},
    // No auto-login — require manual login even in the browser-only shim.
    currentUserId: null,
  };
}

function load(): DB {
  if (typeof window === "undefined") return emptyDb();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as DB;
    if (!parsed.users || !parsed.users.test) {
      const fresh = emptyDb();
      parsed.users = { ...fresh.users, ...(parsed.users ?? {}) };
    }
    if (parsed.currentUserId === undefined) parsed.currentUserId = null;
    // If token exists, set logged in
    if (typeof window !== "undefined" && localStorage.getItem("auth_token") === "testtoken") {
      parsed.currentUserId = "test";
    }
    return parsed;
  } catch {
    return emptyDb();
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch {
    // localStorage full / disabled — runtime continues, just no persistence.
  }
}

const db: DB = load();

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

function values<T>(rec: Record<string, T>): T[] {
  return Object.values(rec);
}

/* ---------- Default world seeding (mirrors server/routes.ts) ---------- */

function seedDefaultWorld(gameId: string) {
  // Workspace/Baseplate — flat cube floor
  createGameObject({
    gameId,
    name: "Baseplate",
    type: "primitive",
    container: "Workspace",
    primitiveType: "cube",
    positionX: 0, positionY: 0, positionZ: 0,
    scaleX: 40, scaleY: 1, scaleZ: 40,
    color: "#3a4252",
  });
  createGameObject({
    gameId,
    name: "SpawnLocation",
    type: "spawn",
    container: "Workspace",
    primitiveType: "cylinder",
    positionX: 0, positionY: 0.55, positionZ: 0,
    scaleX: 2, scaleY: 0.1, scaleZ: 2,
    color: "#3b82f6",
  });
  createGameObject({
    gameId,
    name: "Sun",
    type: "light",
    container: "Lighting",
    primitiveType: null,
    positionX: 6, positionY: 10, positionZ: 4,
    color: "#fff3c8",
  });
  // No default script — users create their own scripts
}

/* ---------- Auth ---------- */

export function getCurrentUser(): User | null {
  if (!db.currentUserId) return null;
  return db.users[db.currentUserId] ?? null;
}

export function login(username: string, password: string): { ok: boolean; user?: User } {
  // Hard-coded "test" / "pass123" mirrors server/replitAuth.ts
  if (username === "test" && password === "pass123") {
    db.currentUserId = "test";
    persist();
    return { ok: true, user: db.users.test };
  }
  return { ok: false };
}

export function logout() {
  db.currentUserId = null;
  persist();
}

/* ---------- Games ---------- */

export function createGame(input: { userId: string; title: string; description?: string | null }): Game {
  const id = newId();
  const game: Game = {
    id,
    userId: input.userId,
    title: input.title,
    description: input.description ?? null,
    thumbnail: null,
    isPublished: false,
    isPublic: true,
    plays: 0,
    maxPlayers: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.games[id] = game;
  seedDefaultWorld(id);
  persist();
  return game;
}

export function getGame(id: string) { return db.games[id]; }
export function getGamesByUser(userId: string) { return values(db.games).filter(g => g.userId === userId); }
export function getPublishedGames() { return values(db.games).filter(g => g.isPublished && g.isPublic); }

export function updateGame(id: string, updates: Partial<Game>): Game | undefined {
  const g = db.games[id];
  if (!g) return undefined;
  Object.assign(g, updates, { updatedAt: new Date() });
  persist();
  return g;
}

export function deleteGame(id: string) {
  delete db.games[id];
  for (const o of values(db.gameObjects)) if (o.gameId === id) delete db.gameObjects[o.id];
  for (const s of values(db.scripts)) if (s.gameId === id) delete db.scripts[s.id];
  persist();
}

export function incrementPlays(id: string) {
  const g = db.games[id];
  if (g) { g.plays = (g.plays ?? 0) + 1; persist(); }
}

/* ---------- Game Objects ---------- */

export function createGameObject(input: Partial<GameObject> & { gameId: string; name: string; type: string }): GameObject {
  const id = newId();
  const obj: GameObject = {
    id,
    gameId: input.gameId,
    parentId: input.parentId ?? null,
    name: input.name,
    type: input.type,
    container: input.container ?? "Workspace",
    positionX: input.positionX ?? 0,
    positionY: input.positionY ?? 0,
    positionZ: input.positionZ ?? 0,
    rotationX: input.rotationX ?? 0,
    rotationY: input.rotationY ?? 0,
    rotationZ: input.rotationZ ?? 0,
    scaleX: input.scaleX ?? 1,
    scaleY: input.scaleY ?? 1,
    scaleZ: input.scaleZ ?? 1,
    primitiveType: input.primitiveType ?? null,
    color: input.color ?? "#888888",
    assetId: input.assetId ?? null,
    properties: input.properties ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.gameObjects[id] = obj;
  persist();
  return obj;
}

export function getGameObjects(gameId: string) { return values(db.gameObjects).filter(o => o.gameId === gameId); }
export function getGameObject(id: string) { return db.gameObjects[id]; }

export function updateGameObject(id: string, updates: Partial<GameObject>): GameObject | undefined {
  const o = db.gameObjects[id];
  if (!o) return undefined;
  Object.assign(o, updates, { updatedAt: new Date() });
  persist();
  return o;
}

export function deleteGameObject(id: string) {
  delete db.gameObjects[id];
  persist();
}

/* ---------- Scripts ---------- */

export function createScript(input: Partial<Script> & { gameId: string; name: string }): Script {
  const id = newId();
  const s: Script = {
    id,
    gameId: input.gameId,
    objectId: input.objectId ?? null,
    container: input.container ?? "ServerScriptService",
    scriptType: input.scriptType ?? "Script",
    name: input.name,
    code: input.code ?? "// Write your JavaScript code here\n",
    enabled: input.enabled ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.scripts[id] = s;
  persist();
  return s;
}

export function getScripts(gameId: string) { return values(db.scripts).filter(s => s.gameId === gameId); }
export function getScript(id: string) { return db.scripts[id]; }

export function updateScript(id: string, updates: Partial<Script>): Script | undefined {
  const s = db.scripts[id];
  if (!s) return undefined;
  Object.assign(s, updates, { updatedAt: new Date() });
  persist();
  return s;
}

export function deleteScript(id: string) {
  delete db.scripts[id];
  persist();
}

/* ---------- Assets (no real upload in browser shim) ---------- */

export function getAssets(userId?: string) {
  if (userId) return values(db.assets).filter(a => a.userId === userId);
  return values(db.assets).filter(a => a.isPublic);
}
export function getBuiltInAssets() { return values(db.assets).filter(a => a.isBuiltIn); }
export function getAsset(id: string) { return db.assets[id]; }
export function deleteAsset(id: string) { delete db.assets[id]; persist(); }

/* ---------- Multiplayer (stubs — no networking in browser-only mode) ---------- */

export function getActiveSessionForGame(_gameId: string): MultiplayerSession | null {
  return null;
}
export function getSessionPlayers(_sessionId: string): SessionPlayer[] {
  return [];
}
