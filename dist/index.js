var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express3 from "express";
import { createServer } from "http";

// server/routes.ts
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

// server/storage.ts
import fs from "fs";
import path from "path";

// server/db-storage.ts
import { eq, and, desc } from "drizzle-orm";

// server/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  assets: () => assets,
  assetsRelations: () => assetsRelations,
  gameObjects: () => gameObjects,
  gameObjectsRelations: () => gameObjectsRelations,
  games: () => games,
  gamesRelations: () => gamesRelations,
  insertAssetSchema: () => insertAssetSchema,
  insertGameObjectSchema: () => insertGameObjectSchema,
  insertGameSchema: () => insertGameSchema,
  insertMultiplayerSessionSchema: () => insertMultiplayerSessionSchema,
  insertScriptSchema: () => insertScriptSchema,
  insertSessionPlayerSchema: () => insertSessionPlayerSchema,
  multiplayerSessions: () => multiplayerSessions,
  multiplayerSessionsRelations: () => multiplayerSessionsRelations,
  scripts: () => scripts,
  scriptsRelations: () => scriptsRelations,
  sessionPlayers: () => sessionPlayers,
  sessionPlayersRelations: () => sessionPlayersRelations,
  sessions: () => sessions,
  users: () => users
});
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  real
} from "drizzle-orm/pg-core";
import { z } from "zod";
var sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull()
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  // URL or base64 image
  isPublished: boolean("is_published").default(false),
  isPublic: boolean("is_public").default(true),
  plays: integer("plays").default(0),
  maxPlayers: integer("max_players").default(10),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var gamesRelations = relations(games, ({ one, many }) => ({
  user: one(users, {
    fields: [games.userId],
    references: [users.id]
  }),
  gameObjects: many(gameObjects),
  scripts: many(scripts)
}));
var insertGameSchema = z.object({
  userId: z.string(),
  title: z.string().max(255),
  description: z.string().optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  maxPlayers: z.number().int().min(1).max(100).optional()
});
var gameObjects = pgTable("game_objects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id"),
  // For hierarchy (null = root level)
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  // 'primitive', 'model', 'light', 'camera', etc.
  container: varchar("container", { length: 50 }).notNull().default("Workspace"),
  // Transform properties
  positionX: real("position_x").default(0),
  positionY: real("position_y").default(0),
  positionZ: real("position_z").default(0),
  rotationX: real("rotation_x").default(0),
  rotationY: real("rotation_y").default(0),
  rotationZ: real("rotation_z").default(0),
  scaleX: real("scale_x").default(1),
  scaleY: real("scale_y").default(1),
  scaleZ: real("scale_z").default(1),
  // Primitive specific
  primitiveType: varchar("primitive_type", { length: 50 }),
  // 'cube', 'sphere', 'plane', etc.
  color: varchar("color", { length: 7 }).default("#888888"),
  // Hex color
  // Model specific
  assetId: varchar("asset_id").references(() => assets.id, { onDelete: "set null" }),
  // Additional properties as JSON (anchored, canCollide, transparency, mass,
  // friction, gravityEnabled, gravityStrength, gravityRadius, isPickup, ...).
  properties: jsonb("properties").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var gameObjectsRelations = relations(gameObjects, ({ one, many }) => ({
  game: one(games, {
    fields: [gameObjects.gameId],
    references: [games.id]
  }),
  parent: one(gameObjects, {
    fields: [gameObjects.parentId],
    references: [gameObjects.id]
  }),
  children: many(gameObjects),
  asset: one(assets, {
    fields: [gameObjects.assetId],
    references: [assets.id]
  }),
  scripts: many(scripts)
}));
var insertGameObjectSchema = z.object({
  gameId: z.string(),
  name: z.string().max(255),
  type: z.string().max(50),
  parentId: z.string().optional().nullable(),
  container: z.string().max(50).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  rotationX: z.number().optional(),
  rotationY: z.number().optional(),
  rotationZ: z.number().optional(),
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  scaleZ: z.number().optional(),
  primitiveType: z.string().max(50).optional().nullable(),
  color: z.string().max(7).optional(),
  assetId: z.string().optional().nullable(),
  properties: z.record(z.unknown()).optional()
});
var scripts = pgTable("scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  objectId: varchar("object_id").references(() => gameObjects.id, { onDelete: "cascade" }),
  // null = parented to a service container, see `container`
  /** Which service / object the script lives under (e.g. ServerScriptService). */
  container: varchar("container", { length: 50 }).default("ServerScriptService"),
  /** "Script" | "LocalScript" | "ModuleScript". Defaults to Script. */
  scriptType: varchar("script_type", { length: 20 }).notNull().default("Script"),
  name: varchar("name", { length: 255 }).notNull(),
  code: text("code").notNull().default("// Write your JavaScript code here\n"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var scriptsRelations = relations(scripts, ({ one }) => ({
  game: one(games, {
    fields: [scripts.gameId],
    references: [games.id]
  }),
  gameObject: one(gameObjects, {
    fields: [scripts.objectId],
    references: [gameObjects.id]
  })
}));
var insertScriptSchema = z.object({
  gameId: z.string(),
  name: z.string().max(255),
  objectId: z.string().optional().nullable(),
  container: z.string().max(50).optional(),
  scriptType: z.string().max(20).optional(),
  code: z.string().optional(),
  enabled: z.boolean().optional()
});
var assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  // null = built-in asset
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  // 'model', 'image', 'audio'
  category: varchar("category", { length: 50 }),
  // 'avatar', 'npc', 'environment', 'custom'
  fileUrl: text("file_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  fileFormat: varchar("file_format", { length: 20 }),
  // 'glb', 'obj', 'fbx', 'png', etc.
  fileSize: integer("file_size"),
  // in bytes
  isBuiltIn: boolean("is_built_in").default(false),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow()
});
var assetsRelations = relations(assets, ({ one, many }) => ({
  user: one(users, {
    fields: [assets.userId],
    references: [users.id]
  }),
  gameObjects: many(gameObjects)
}));
var insertAssetSchema = z.object({
  name: z.string().max(255),
  type: z.string().max(50),
  fileUrl: z.string(),
  userId: z.string().optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
  fileFormat: z.string().max(20).optional().nullable(),
  fileSize: z.number().int().optional().nullable(),
  isBuiltIn: z.boolean().optional(),
  isPublic: z.boolean().optional()
});
var multiplayerSessions = pgTable("multiplayer_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").default(true),
  maxPlayers: integer("max_players").default(10),
  currentPlayers: integer("current_players").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  endedAt: timestamp("ended_at")
});
var multiplayerSessionsRelations = relations(multiplayerSessions, ({ one, many }) => ({
  game: one(games, {
    fields: [multiplayerSessions.gameId],
    references: [games.id]
  }),
  host: one(users, {
    fields: [multiplayerSessions.hostUserId],
    references: [users.id]
  }),
  players: many(sessionPlayers)
}));
var insertMultiplayerSessionSchema = z.object({
  gameId: z.string(),
  hostUserId: z.string(),
  isActive: z.boolean().optional(),
  maxPlayers: z.number().int().optional()
});
var sessionPlayers = pgTable("session_players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => multiplayerSessions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  playerName: varchar("player_name", { length: 255 }),
  // Player position in game
  positionX: real("position_x").default(0),
  positionY: real("position_y").default(5),
  positionZ: real("position_z").default(0),
  rotationY: real("rotation_y").default(0),
  isActive: boolean("is_active").default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at")
});
var sessionPlayersRelations = relations(sessionPlayers, ({ one }) => ({
  session: one(multiplayerSessions, {
    fields: [sessionPlayers.sessionId],
    references: [multiplayerSessions.id]
  }),
  user: one(users, {
    fields: [sessionPlayers.userId],
    references: [users.id]
  })
}));
var insertSessionPlayerSchema = z.object({
  sessionId: z.string(),
  userId: z.string().optional().nullable(),
  playerName: z.string().max(255).optional().nullable(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  rotationY: z.number().optional(),
  isActive: z.boolean().optional()
});

// server/db.ts
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Add your Render.com PostgreSQL connection string."
  );
}
var connectionString = process.env.DATABASE_URL;
var sslConfig = (() => {
  if (connectionString.includes("sslmode=disable")) return false;
  if (connectionString.includes("sslmode=require") || connectionString.includes("sslmode=prefer")) {
    return { rejectUnauthorized: false };
  }
  if (process.env.NODE_ENV === "production") {
    return { rejectUnauthorized: false };
  }
  return false;
})();
var pool = new Pool({
  connectionString,
  ssl: sslConfig
});
var db = drizzle({ client: pool, schema: schema_exports });

// server/db-storage.ts
function genId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
var DatabaseStorage = class {
  constructor() {
    // ── Multiplayer (stub — not wired yet) ────────────────────────────────────
    this._sessions = /* @__PURE__ */ new Map();
    this._players = /* @__PURE__ */ new Map();
  }
  // ── Users ─────────────────────────────────────────────────────────────────
  async getUser(id) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  }
  async upsertUser(userData) {
    const [u] = await db.insert(users).values({ ...userData, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
      target: users.id,
      set: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return u;
  }
  // ── Games ─────────────────────────────────────────────────────────────────
  async createGame(game) {
    const [g] = await db.insert(games).values({ ...game, id: genId() }).returning();
    return g;
  }
  async getGame(id) {
    const [g] = await db.select().from(games).where(eq(games.id, id));
    return g;
  }
  async getGamesByUserId(userId) {
    return db.select().from(games).where(eq(games.userId, userId)).orderBy(desc(games.updatedAt));
  }
  async getPublishedGames() {
    return db.select().from(games).where(and(eq(games.isPublished, true), eq(games.isPublic, true))).orderBy(desc(games.updatedAt));
  }
  async updateGame(id, updates) {
    const [g] = await db.update(games).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(games.id, id)).returning();
    return g;
  }
  async deleteGame(id) {
    await db.delete(games).where(eq(games.id, id));
  }
  async incrementGamePlays(id) {
    const [g] = await db.select().from(games).where(eq(games.id, id));
    if (g) {
      await db.update(games).set({ plays: (g.plays ?? 0) + 1 }).where(eq(games.id, id));
    }
  }
  // ── Game Objects ──────────────────────────────────────────────────────────
  async createGameObject(obj) {
    const [o] = await db.insert(gameObjects).values({ ...obj, id: genId() }).returning();
    return o;
  }
  async getGameObjects(gameId) {
    return db.select().from(gameObjects).where(eq(gameObjects.gameId, gameId));
  }
  async getGameObject(id) {
    const [o] = await db.select().from(gameObjects).where(eq(gameObjects.id, id));
    return o;
  }
  async updateGameObject(id, updates) {
    const [o] = await db.update(gameObjects).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(gameObjects.id, id)).returning();
    return o;
  }
  async deleteGameObject(id) {
    await db.delete(gameObjects).where(eq(gameObjects.id, id));
  }
  // ── Scripts ───────────────────────────────────────────────────────────────
  async createScript(script) {
    const [s] = await db.insert(scripts).values({ ...script, id: genId() }).returning();
    return s;
  }
  async getScripts(gameId) {
    return db.select().from(scripts).where(eq(scripts.gameId, gameId));
  }
  async getScript(id) {
    const [s] = await db.select().from(scripts).where(eq(scripts.id, id));
    return s;
  }
  async updateScript(id, updates) {
    const [s] = await db.update(scripts).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(scripts.id, id)).returning();
    return s;
  }
  async deleteScript(id) {
    await db.delete(scripts).where(eq(scripts.id, id));
  }
  // ── Assets ────────────────────────────────────────────────────────────────
  async createAsset(asset) {
    const [a] = await db.insert(assets).values({ ...asset, id: genId() }).returning();
    return a;
  }
  async getAssets(userId) {
    if (userId) return db.select().from(assets).where(eq(assets.userId, userId));
    return db.select().from(assets).where(eq(assets.isPublic, true));
  }
  async getBuiltInAssets() {
    return db.select().from(assets).where(eq(assets.isBuiltIn, true));
  }
  async getAsset(id) {
    const [a] = await db.select().from(assets).where(eq(assets.id, id));
    return a;
  }
  async deleteAsset(id) {
    await db.delete(assets).where(eq(assets.id, id));
  }
  async createMultiplayerSession(s) {
    const id = genId();
    const sess = { ...s, id, endedAt: null };
    this._sessions.set(id, sess);
    return sess;
  }
  async getMultiplayerSession(id) {
    return this._sessions.get(id);
  }
  async getActiveSessionForGame(gameId) {
    return [...this._sessions.values()].find((s) => s.gameId === gameId && !s.endedAt);
  }
  async updateMultiplayerSession(id, u) {
    const s = this._sessions.get(id);
    if (!s) return void 0;
    const updated = { ...s, ...u };
    this._sessions.set(id, updated);
    return updated;
  }
  async endMultiplayerSession(id) {
    const s = this._sessions.get(id);
    if (s) this._sessions.set(id, { ...s, endedAt: /* @__PURE__ */ new Date() });
  }
  async addSessionPlayer(p) {
    const id = genId();
    const player = { ...p, id };
    this._players.set(id, player);
    return player;
  }
  async getSessionPlayers(sessionId) {
    return [...this._players.values()].filter((p) => p.sessionId === sessionId);
  }
  async updateSessionPlayer(id, u) {
    const p = this._players.get(id);
    if (!p) return void 0;
    const updated = { ...p, ...u };
    this._players.set(id, updated);
    return updated;
  }
  async removeSessionPlayer(id) {
    this._players.delete(id);
  }
};

// server/storage.ts
var PERSIST_FILE = path.join("/tmp", "rebur-storage.json");
var DATE_KEYS = /* @__PURE__ */ new Set(["createdAt", "updatedAt", "joinedAt", "leftAt", "endedAt"]);
function dateReviver(_key, value) {
  if (DATE_KEYS.has(_key) && typeof value === "string" && value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}
var MemStorage = class {
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.games = /* @__PURE__ */ new Map();
    this.gameObjects = /* @__PURE__ */ new Map();
    this.scripts = /* @__PURE__ */ new Map();
    this.assets = /* @__PURE__ */ new Map();
    this.sessions = /* @__PURE__ */ new Map();
    this.players = /* @__PURE__ */ new Map();
    const testUser = {
      id: "test",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      profileImageUrl: null,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.users.set(testUser.id, testUser);
    this._load();
  }
  _save() {
    try {
      const data = {
        games: Object.fromEntries(this.games),
        gameObjects: Object.fromEntries(this.gameObjects),
        scripts: Object.fromEntries(this.scripts),
        assets: Object.fromEntries(this.assets)
      };
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(data), "utf-8");
    } catch {
    }
  }
  _load() {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const raw = fs.readFileSync(PERSIST_FILE, "utf-8");
      const data = JSON.parse(raw, dateReviver);
      if (data.games) for (const [k, v] of Object.entries(data.games)) this.games.set(k, v);
      if (data.gameObjects) for (const [k, v] of Object.entries(data.gameObjects)) this.gameObjects.set(k, v);
      if (data.scripts) for (const [k, v] of Object.entries(data.scripts)) this.scripts.set(k, v);
      if (data.assets) for (const [k, v] of Object.entries(data.assets)) this.assets.set(k, v);
    } catch {
    }
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async upsertUser(userData) {
    const existing = Array.from(this.users.values()).find((u) => u.id === userData.id);
    const user = {
      ...existing,
      ...userData,
      id: userData.id,
      email: userData.email ?? existing?.email ?? null,
      firstName: userData.firstName ?? existing?.firstName ?? null,
      lastName: userData.lastName ?? existing?.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? existing?.profileImageUrl ?? null,
      createdAt: existing?.createdAt ?? /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.users.set(user.id, user);
    return user;
  }
  async createGame(game) {
    const id = Math.random().toString(36).substring(7);
    const newGame = {
      id,
      userId: game.userId,
      title: game.title,
      description: game.description ?? null,
      thumbnail: game.thumbnail ?? null,
      isPublished: game.isPublished ?? false,
      isPublic: game.isPublic ?? true,
      plays: 0,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.games.set(id, newGame);
    this._save();
    return newGame;
  }
  async getGame(id) {
    return this.games.get(id);
  }
  async getGamesByUserId(userId) {
    return Array.from(this.games.values()).filter((g) => g.userId === userId);
  }
  async getPublishedGames() {
    return Array.from(this.games.values()).filter((g) => g.isPublished && g.isPublic);
  }
  async updateGame(id, updates) {
    const game = this.games.get(id);
    if (!game) return void 0;
    const updated = { ...game, ...updates, updatedAt: /* @__PURE__ */ new Date() };
    this.games.set(id, updated);
    this._save();
    return updated;
  }
  async deleteGame(id) {
    this.games.delete(id);
    this._save();
  }
  async incrementGamePlays(id) {
    const game = this.games.get(id);
    if (game) {
      game.plays = (game.plays || 0) + 1;
      this._save();
    }
  }
  async createGameObject(obj) {
    const id = Math.random().toString(36).substring(7);
    const newObj = {
      id,
      gameId: obj.gameId,
      name: obj.name,
      type: obj.type,
      parentId: obj.parentId ?? null,
      container: obj.container ?? "Workspace",
      positionX: obj.positionX ?? 0,
      positionY: obj.positionY ?? 0,
      positionZ: obj.positionZ ?? 0,
      rotationX: obj.rotationX ?? 0,
      rotationY: obj.rotationY ?? 0,
      rotationZ: obj.rotationZ ?? 0,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      scaleZ: obj.scaleZ ?? 1,
      primitiveType: obj.primitiveType ?? null,
      color: obj.color ?? "#888888",
      assetId: obj.assetId ?? null,
      properties: obj.properties ?? {},
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.gameObjects.set(id, newObj);
    this._save();
    return newObj;
  }
  async getGameObjects(gameId) {
    return Array.from(this.gameObjects.values()).filter((o) => o.gameId === gameId);
  }
  async getGameObject(id) {
    return this.gameObjects.get(id);
  }
  async updateGameObject(id, updates) {
    const obj = this.gameObjects.get(id);
    if (!obj) return void 0;
    const updated = { ...obj, ...updates, updatedAt: /* @__PURE__ */ new Date() };
    this.gameObjects.set(id, updated);
    this._save();
    return updated;
  }
  async deleteGameObject(id) {
    this.gameObjects.delete(id);
    this._save();
  }
  async createScript(script) {
    const id = Math.random().toString(36).substring(7);
    const newScript = {
      id,
      gameId: script.gameId,
      name: script.name,
      objectId: script.objectId ?? null,
      container: script.container ?? "ServerScriptService",
      scriptType: script.scriptType ?? "Script",
      code: script.code ?? "// Write your JavaScript code here\n",
      enabled: script.enabled ?? true,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.scripts.set(id, newScript);
    this._save();
    return newScript;
  }
  async getScripts(gameId) {
    return Array.from(this.scripts.values()).filter((s) => s.gameId === gameId);
  }
  async getScript(id) {
    return this.scripts.get(id);
  }
  async updateScript(id, updates) {
    const script = this.scripts.get(id);
    if (!script) return void 0;
    const updated = { ...script, ...updates, updatedAt: /* @__PURE__ */ new Date() };
    this.scripts.set(id, updated);
    this._save();
    return updated;
  }
  async deleteScript(id) {
    this.scripts.delete(id);
    this._save();
  }
  async createAsset(asset) {
    const id = Math.random().toString(36).substring(7);
    const newAsset = {
      id,
      name: asset.name,
      type: asset.type,
      fileUrl: asset.fileUrl,
      userId: asset.userId ?? null,
      category: asset.category ?? null,
      thumbnailUrl: asset.thumbnailUrl ?? null,
      fileFormat: asset.fileFormat ?? null,
      fileSize: asset.fileSize ?? null,
      isBuiltIn: asset.isBuiltIn ?? false,
      isPublic: asset.isPublic ?? true,
      createdAt: /* @__PURE__ */ new Date()
    };
    this.assets.set(id, newAsset);
    this._save();
    return newAsset;
  }
  async getAssets(userId) {
    if (userId) return Array.from(this.assets.values()).filter((a) => a.userId === userId);
    return Array.from(this.assets.values()).filter((a) => a.isPublic);
  }
  async getBuiltInAssets() {
    return Array.from(this.assets.values()).filter((a) => a.isBuiltIn);
  }
  async getAsset(id) {
    return this.assets.get(id);
  }
  async deleteAsset(id) {
    this.assets.delete(id);
    this._save();
  }
  async createMultiplayerSession(session) {
    const id = Math.random().toString(36).substring(7);
    const newSession = {
      id,
      gameId: session.gameId,
      hostUserId: session.hostUserId,
      isActive: session.isActive ?? true,
      maxPlayers: session.maxPlayers ?? 10,
      currentPlayers: 0,
      createdAt: /* @__PURE__ */ new Date(),
      endedAt: null
    };
    this.sessions.set(id, newSession);
    return newSession;
  }
  async getMultiplayerSession(id) {
    return this.sessions.get(id);
  }
  async getActiveSessionForGame(gameId) {
    return Array.from(this.sessions.values()).find((s) => s.gameId === gameId && s.isActive);
  }
  async updateMultiplayerSession(id, updates) {
    const session = this.sessions.get(id);
    if (!session) return void 0;
    const updated = { ...session, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }
  async endMultiplayerSession(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.isActive = false;
      session.endedAt = /* @__PURE__ */ new Date();
    }
  }
  async addSessionPlayer(player) {
    const id = Math.random().toString(36).substring(7);
    const newPlayer = {
      id,
      sessionId: player.sessionId,
      userId: player.userId ?? null,
      playerName: player.playerName ?? "Guest",
      positionX: player.positionX ?? 0,
      positionY: player.positionY ?? 5,
      positionZ: player.positionZ ?? 0,
      rotationY: player.rotationY ?? 0,
      isActive: player.isActive ?? true,
      joinedAt: /* @__PURE__ */ new Date(),
      leftAt: null
    };
    this.players.set(id, newPlayer);
    const session = this.sessions.get(player.sessionId);
    if (session) {
      session.currentPlayers = (session.currentPlayers || 0) + 1;
    }
    return newPlayer;
  }
  async getSessionPlayers(sessionId) {
    return Array.from(this.players.values()).filter((p) => p.sessionId === sessionId && p.isActive);
  }
  async updateSessionPlayer(id, updates) {
    const player = this.players.get(id);
    if (!player) return void 0;
    const updated = { ...player, ...updates };
    this.players.set(id, updated);
    return updated;
  }
  async removeSessionPlayer(id) {
    const player = this.players.get(id);
    if (player) {
      player.isActive = false;
      player.leftAt = /* @__PURE__ */ new Date();
      const session = this.sessions.get(player.sessionId);
      if (session) {
        session.currentPlayers = Math.max(0, (session.currentPlayers || 0) - 1);
      }
    }
  }
};
var storage = process.env.DATABASE_URL ? new DatabaseStorage() : new MemStorage();

// server/replitAuth.ts
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq as eq2 } from "drizzle-orm";
var activeSessions = /* @__PURE__ */ new Map();
async function setupAuth(app2) {
  app2.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      console.log("[v0] Registration attempt for:", email);
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      console.log("[v0] Checking for existing user...");
      const existingUser = await db.select().from(users).where(eq2(users.email, email)).limit(1);
      console.log("[v0] Existing user check result:", existingUser.length > 0 ? "found" : "not found");
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "User with this email already exists" });
      }
      console.log("[v0] Hashing password...");
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log("[v0] Password hashed successfully");
      const userId = randomUUID();
      console.log("[v0] Creating user with ID:", userId);
      const [newUser] = await db.insert(users).values({
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null
      }).returning();
      console.log("[v0] User created:", newUser?.id);
      console.log("[v0] Storing password hash...");
      await db.insert(sessions).values({
        sid: `pwd_${userId}`,
        sess: { passwordHash: hashedPassword },
        expire: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3)
        // 1 year
      }).onConflictDoUpdate({
        target: sessions.sid,
        set: { sess: { passwordHash: hashedPassword } }
      });
      console.log("[v0] Password hash stored");
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
      activeSessions.set(token, { userId, expiresAt });
      console.log("[v0] Session token created:", token.substring(0, 8) + "...");
      await db.insert(sessions).values({
        sid: token,
        sess: { userId, type: "session" },
        expire: expiresAt
      }).onConflictDoNothing();
      console.log("[v0] Registration complete, returning response");
      res.json({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName
        },
        token
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });
  app2.post("/api/login", async (req, res) => {
    try {
      const { username, password, email } = req.body;
      const loginEmail = email || username;
      console.log("[v0] Login attempt for:", loginEmail);
      if (!loginEmail || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      console.log("[v0] Looking up user...");
      const [user] = await db.select().from(users).where(eq2(users.email, loginEmail)).limit(1);
      console.log("[v0] User lookup result:", user ? user.id : "not found");
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      console.log("[v0] Looking up password hash for user:", user.id);
      const [pwdRecord] = await db.select().from(sessions).where(eq2(sessions.sid, `pwd_${user.id}`)).limit(1);
      console.log("[v0] Password record found:", !!pwdRecord, "has hash:", !!pwdRecord?.sess?.passwordHash);
      if (!pwdRecord || !pwdRecord.sess?.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const isValid = await bcrypt.compare(password, pwdRecord.sess.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
      activeSessions.set(token, { userId: user.id, expiresAt });
      await db.insert(sessions).values({
        sid: token,
        sess: { userId: user.id, type: "session" },
        expire: expiresAt
      }).onConflictDoNothing();
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        token
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });
  app2.post("/api/logout", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        activeSessions.delete(token);
        await db.delete(sessions).where(eq2(sessions.sid, token));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.json({ success: true });
    }
  });
  app2.get("/api/logout", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        activeSessions.delete(token);
        await db.delete(sessions).where(eq2(sessions.sid, token));
      }
      res.json({ success: true });
    } catch (error) {
      res.json({ success: true });
    }
  });
  app2.get("/api/auth/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res.json({ authenticated: false });
      }
      const session = await getSessionFromToken(token);
      if (!session) {
        return res.json({ authenticated: false });
      }
      const [user] = await db.select().from(users).where(eq2(users.id, session.userId)).limit(1);
      if (!user) {
        return res.json({ authenticated: false });
      }
      res.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      });
    } catch (error) {
      console.error("Auth status error:", error);
      res.json({ authenticated: false });
    }
  });
}
async function getSessionFromToken(token) {
  const cached = activeSessions.get(token);
  if (cached) {
    if (cached.expiresAt > /* @__PURE__ */ new Date()) {
      return { userId: cached.userId };
    }
    activeSessions.delete(token);
  }
  try {
    const [dbSession] = await db.select().from(sessions).where(eq2(sessions.sid, token)).limit(1);
    if (dbSession && dbSession.expire > /* @__PURE__ */ new Date()) {
      const sess = dbSession.sess;
      if (sess?.userId && sess?.type === "session") {
        activeSessions.set(token, { userId: sess.userId, expiresAt: dbSession.expire });
        return { userId: sess.userId };
      }
    }
  } catch (error) {
    console.error("Session lookup error:", error);
  }
  return null;
}
async function isAuthenticated(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const session = await getSessionFromToken(token);
  if (!session) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  req.user = { claims: { sub: session.userId } };
  req.userId = session.userId;
  return next();
}
function getUserId(req) {
  return req.userId || req.user?.claims?.sub || "test";
}

// server/routes.ts
import multer from "multer";
import path2 from "path";
import { promises as fs2 } from "fs";

// server/script-runner.ts
import { createContext, Script } from "vm";
var ScriptRunner = class {
  constructor(objects, players) {
    this.objects = objects;
    this.players = players;
    /** Global game events: "tick", "playerAdded", "playerRemoving" */
    this.globalHandlers = /* @__PURE__ */ new Map();
    /** Per-object events keyed as "objName::eventName" */
    this.objHandlers = /* @__PURE__ */ new Map();
    /** GUI click handlers keyed by element id */
    this.guiClickHandlers = /* @__PURE__ */ new Map();
    this.logs = [];
    /** GUI elements created by scripts */
    this.guiElements = /* @__PURE__ */ new Map();
    this.guiIdCounter = 0;
  }
  // ── Script loading ──────────────────────────────────────────────────────────
  /** Compile and execute a script file inside a fresh VM context. */
  loadScript(code, fileName = "Script") {
    const log2 = (...args) => {
      const msg = args.map((a) => {
        try {
          return typeof a === "object" ? JSON.stringify(a) : String(a);
        } catch {
          return String(a);
        }
      }).join(" ");
      this.logs.push(`[${fileName}] ${msg}`);
    };
    const workspaceProxy = this._buildWorkspace(log2);
    const playersProxy = this._buildPlayers();
    const ctx = createContext({
      workspace: workspaceProxy,
      Workspace: workspaceProxy,
      players: playersProxy,
      game: {
        on: (event, fn) => {
          const key = event.toLowerCase();
          const arr = this.globalHandlers.get(key) ?? [];
          arr.push(fn);
          this.globalHandlers.set(key, arr);
        }
      },
      // GUI API for creating UI elements from scripts
      gui: {
        text: (text2, x, y, opts) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem = {
            id,
            kind: "text",
            text: text2,
            x,
            y,
            color: opts?.color ?? "#ffffff",
            fontSize: opts?.fontSize ?? 14,
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            ...opts
          };
          this.guiElements.set(id, elem);
          return {
            id,
            update: (changes) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            remove: () => {
              this.guiElements.delete(id);
            }
          };
        },
        button: (text2, x, y, onClick, opts) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem = {
            id,
            kind: "button",
            text: text2,
            x,
            y,
            width: opts?.width ?? 100,
            height: opts?.height ?? 32,
            color: opts?.color ?? "#ffffff",
            backgroundColor: opts?.backgroundColor ?? "#3b82f6",
            fontSize: opts?.fontSize ?? 14,
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            clickable: true,
            ...opts
          };
          this.guiElements.set(id, elem);
          this.guiClickHandlers.set(id, onClick);
          return {
            id,
            update: (changes) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            remove: () => {
              this.guiElements.delete(id);
              this.guiClickHandlers.delete(id);
            }
          };
        },
        bar: (x, y, value, maxValue, opts) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem = {
            id,
            kind: "bar",
            x,
            y,
            width: opts?.width ?? 100,
            height: opts?.height ?? 12,
            value,
            maxValue,
            color: opts?.color ?? "#22c55e",
            backgroundColor: opts?.backgroundColor ?? "#374151",
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            ...opts
          };
          this.guiElements.set(id, elem);
          return {
            id,
            update: (changes) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            setValue: (v) => {
              const e = this.guiElements.get(id);
              if (e) e.value = v;
            },
            remove: () => {
              this.guiElements.delete(id);
            }
          };
        },
        image: (imageUrl, x, y, opts) => {
          const id = `gui_${this.guiIdCounter++}`;
          const elem = {
            id,
            kind: "image",
            imageUrl,
            x,
            y,
            width: opts?.width ?? 64,
            height: opts?.height ?? 64,
            anchor: opts?.anchor ?? "topLeft",
            visible: true,
            ...opts
          };
          this.guiElements.set(id, elem);
          return {
            id,
            update: (changes) => {
              const e = this.guiElements.get(id);
              if (e) Object.assign(e, changes);
            },
            remove: () => {
              this.guiElements.delete(id);
            }
          };
        },
        clear: () => {
          this.guiElements.clear();
          this.guiClickHandlers.clear();
        }
      },
      // convenience aliases matching the old client API
      runService: {
        on: (_ev, fn) => {
          const arr = this.globalHandlers.get("tick") ?? [];
          arr.push(fn);
          this.globalHandlers.set("tick", arr);
        }
      },
      log: log2,
      print: log2,
      warn: log2,
      error: log2,
      // safe stdlib
      Math,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Vector3: (x = 0, y = 0, z2 = 0) => ({ X: x, Y: y, Z: z2, x, y, z: z2 }),
      Color3: (r = 0, g = 0, b = 0) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
      // blocked globals
      process: void 0,
      require: void 0,
      fetch: void 0,
      setTimeout: void 0,
      setInterval: void 0,
      __filename: void 0,
      __dirname: void 0
    });
    try {
      new Script(code, { filename: fileName }).runInContext(ctx, { timeout: 2e3 });
    } catch (err) {
      log2(`Runtime error: ${err?.message ?? err}`);
    }
  }
  // ── Global event firing ─────────────────────────────────────────────────────
  tick(dt) {
    this._fireGlobal("tick", dt);
  }
  firePlayerAdded(player) {
    this._fireGlobal("playerAdded", this._playerProxy(player));
  }
  firePlayerRemoving(player) {
    this._fireGlobal("playerRemoving", this._playerProxy(player));
  }
  // ── Object event firing ─────────────────────────────────────────────────────
  /** Call when a player's collision box overlaps an object. */
  fireTouched(objName, player) {
    this._fireObj(objName, "touched", this._playerProxy(player));
  }
  /** Call to fire a custom event on an object (from scripts via .emit). */
  fireObjEvent(objName, event, ...args) {
    this._fireObj(objName, event.toLowerCase(), ...args);
  }
  // ── Logs ────────────────────────────────────────────────────────────────────
  drainLogs() {
    const l = [...this.logs];
    this.logs = [];
    return l;
  }
  /** Get all GUI elements for rendering on the client */
  getGuiElements() {
    return Array.from(this.guiElements.values());
  }
  /** Fire a GUI click event (called from server when client sends guiClick) */
  fireGuiClick(elementId, player) {
    const handler = this.guiClickHandlers.get(elementId);
    if (handler) {
      try {
        handler(this._playerProxy(player));
      } catch {
      }
    }
  }
  // ── Private helpers ─────────────────────────────────────────────────────────
  _fireGlobal(event, ...args) {
    for (const h of this.globalHandlers.get(event) ?? []) {
      try {
        h(...args);
      } catch {
      }
    }
  }
  _fireObj(objName, event, ...args) {
    const key = `${objName}::${event}`;
    for (const h of this.objHandlers.get(key) ?? []) {
      try {
        h(...args);
      } catch {
      }
    }
  }
  _buildWorkspace(log2) {
    const proxy = {};
    for (const [name, obj] of this.objects) {
      proxy[name] = this._objProxy(obj, log2);
    }
    return proxy;
  }
  _buildPlayers() {
    const proxy = {};
    for (const [, p] of this.players) {
      proxy[p.name] = this._playerProxy(p);
    }
    return proxy;
  }
  _objProxy(obj, log2) {
    const runner = this;
    return {
      get Name() {
        return obj.name;
      },
      get Position() {
        return { X: obj.positionX, Y: obj.positionY, Z: obj.positionZ, x: obj.positionX, y: obj.positionY, z: obj.positionZ };
      },
      set Position(v) {
        obj.positionX = +(v?.X ?? v?.x ?? obj.positionX);
        obj.positionY = +(v?.Y ?? v?.y ?? obj.positionY);
        obj.positionZ = +(v?.Z ?? v?.z ?? obj.positionZ);
      },
      get Rotation() {
        return { X: obj.rotationX, Y: obj.rotationY, Z: obj.rotationZ };
      },
      set Rotation(v) {
        obj.rotationX = +(v?.X ?? v?.x ?? obj.rotationX);
        obj.rotationY = +(v?.Y ?? v?.y ?? obj.rotationY);
        obj.rotationZ = +(v?.Z ?? v?.z ?? obj.rotationZ);
      },
      get Color() {
        return obj.color;
      },
      set Color(v) {
        obj.color = String(v);
      },
      get Visible() {
        return obj.visible;
      },
      set Visible(v) {
        obj.visible = Boolean(v);
      },
      get Anchored() {
        return obj.anchored;
      },
      set Anchored(v) {
        obj.anchored = Boolean(v);
      },
      get Velocity() {
        return { X: obj.velX, Y: obj.velY, Z: obj.velZ };
      },
      set Velocity(v) {
        obj.velX = +(v?.X ?? v?.x ?? 0);
        obj.velY = +(v?.Y ?? v?.y ?? 0);
        obj.velZ = +(v?.Z ?? v?.z ?? 0);
      },
      /** Register an event listener: .on("Touched", fn) */
      on(event, fn) {
        const key = `${obj.name}::${event.toLowerCase()}`;
        const arr = runner.objHandlers.get(key) ?? [];
        arr.push(fn);
        runner.objHandlers.set(key, arr);
      },
      /** Emit a custom event on this object */
      emit(event, ...args) {
        runner._fireObj(obj.name, event.toLowerCase(), ...args);
      }
    };
  }
  _playerProxy(p) {
    return {
      get Name() {
        return p.name;
      },
      get UserId() {
        return p.id;
      },
      get Position() {
        return { X: p.position.x, Y: p.position.y, Z: p.position.z };
      }
    };
  }
};

// server/game-room.ts
var TICK_MS = 50;
var GRAVITY = -28;
var MOVE_SPEED = 14;
var JUMP_VEL = 14;
var PLAYER_HALF_H = 0.9;
var PLAYER_RADIUS = 0.4;
var OBJ_BOUNCE = 0.25;
var OBJ_DRAG = 0.88;
var GameRoom = class {
  constructor(broadcastFn) {
    this.broadcastFn = broadcastFn;
    this.players = /* @__PURE__ */ new Map();
    this.statics = [];
    this.dynamics = /* @__PURE__ */ new Map();
    // unanchored
    this.allObjs = /* @__PURE__ */ new Map();
    // every workspace object
    this.scriptObjs = /* @__PURE__ */ new Map();
    // shared w/ ScriptRunner
    this.scriptRunner = null;
    this.interval = null;
    this.lastTick = Date.now();
    /** Tracks which (player,object) pairs are currently touching to avoid repeat fires */
    this.touchedPairs = /* @__PURE__ */ new Set();
    /** Current tick number for client interpolation */
    this.tickNumber = 0;
  }
  // ── World setup ─────────────────────────────────────────────────────────────
  setObjects(objects) {
    this.statics = [];
    this.dynamics.clear();
    this.allObjs.clear();
    this.scriptObjs.clear();
    this.touchedPairs.clear();
    for (const o of objects) {
      const c = o.container ?? "Workspace";
      if (c !== "Workspace" && c !== "") continue;
      if (o.type === "light" || o.type === "folder") continue;
      const anchored = o.properties?.anchored !== false;
      const sx = o.scaleX ?? 1, sy = o.scaleY ?? 1, sz = o.scaleZ ?? 1;
      const px = o.positionX ?? 0, py = o.positionY ?? 0, pz = o.positionZ ?? 0;
      const dobj = {
        id: o.id,
        name: o.name ?? "Part",
        type: o.type ?? "primitive",
        primitiveType: o.primitiveType ?? null,
        x: px,
        y: py,
        z: pz,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: o.rotationX ?? 0,
        rotY: o.rotationY ?? 0,
        rotZ: o.rotationZ ?? 0,
        sx,
        sy,
        sz,
        color: o.color ?? "#888888",
        visible: true,
        anchored,
        transparency: o.properties?.transparency ?? 0,
        modelUrl: o.properties?.fileUrl,
        modelScale: o.properties?.modelScale,
        animation: o.properties?.animation ?? null,
        animationSpeed: o.properties?.animationSpeed ?? 1,
        animationLoop: o.properties?.animationLoop !== false
      };
      this.allObjs.set(o.id, dobj);
      this.scriptObjs.set(o.name ?? o.id, {
        id: o.id,
        name: o.name ?? "Part",
        positionX: px,
        positionY: py,
        positionZ: pz,
        rotationX: o.rotationX ?? 0,
        rotationY: o.rotationY ?? 0,
        rotationZ: o.rotationZ ?? 0,
        scaleX: sx,
        scaleY: sy,
        scaleZ: sz,
        color: dobj.color,
        visible: true,
        anchored,
        velX: 0,
        velY: 0,
        velZ: 0
      });
      if (anchored) {
        this.statics.push({
          name: dobj.name,
          minX: px - sx / 2,
          maxX: px + sx / 2,
          minY: py - sy / 2,
          maxY: py + sy / 2,
          minZ: pz - sz / 2,
          maxZ: pz + sz / 2
        });
      } else {
        this.dynamics.set(o.id, dobj);
      }
    }
  }
  loadScripts(scripts2) {
    const playerMap = /* @__PURE__ */ new Map();
    for (const [, p] of this.players) {
      playerMap.set(p.id, { id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
    }
    this.scriptRunner = new ScriptRunner(this.scriptObjs, playerMap);
    for (const s of scripts2) {
      if (s.enabled && s.code?.trim()) {
        this.scriptRunner.loadScript(s.code, s.name);
      }
    }
  }
  // ── Players ─────────────────────────────────────────────────────────────────
  addPlayer(id, name, x = 0, y = 5, z2 = 0, colors) {
    this.players.set(id, {
      id,
      name,
      x,
      y,
      z: z2,
      vx: 0,
      vy: 0,
      vz: 0,
      rotY: 0,
      onGround: false,
      moveX: 0,
      moveZ: 0,
      jumpQueued: false,
      camY: 0,
      health: 100,
      maxHealth: 100,
      animation: "idle",
      ...colors
    });
    this.scriptRunner?.firePlayerAdded({ id, name, position: { x, y, z: z2 } });
    if (!this.interval) {
      this.lastTick = Date.now();
      this.interval = setInterval(() => this._tick(), TICK_MS);
    }
  }
  removePlayer(id) {
    const p = this.players.get(id);
    if (p) this.scriptRunner?.firePlayerRemoving({ id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
    this.players.delete(id);
    for (const key of this.touchedPairs) {
      if (key.startsWith(id + ":")) this.touchedPairs.delete(key);
    }
    if (this.players.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  applyInput(id, moveX, moveZ, jump, rotY, camY) {
    const p = this.players.get(id);
    if (!p) return;
    p.moveX = moveX;
    p.moveZ = moveZ;
    if (jump) p.jumpQueued = true;
    p.rotY = rotY;
    p.camY = camY;
  }
  syncPosition(id, x, y, z2, rotY) {
    const p = this.players.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.z = z2;
    p.rotY = rotY;
  }
  // ── Main tick ─────────────────────────────────────────────────────────────────
  _tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1e3, 0.05);
    this.lastTick = now;
    if (this.scriptRunner) {
      this.scriptRunner.tick(dt);
      const logs = this.scriptRunner.drainLogs();
      if (logs.length > 0) this.broadcastFn({ type: "scriptLog", logs });
    }
    if (this.scriptRunner) {
      for (const [name, so] of this.scriptObjs) {
        for (const obj of this.allObjs.values()) {
          if (obj.name !== name) continue;
          obj.x = so.positionX;
          obj.y = so.positionY;
          obj.z = so.positionZ;
          obj.rotX = so.rotationX;
          obj.rotY = so.rotationY;
          obj.rotZ = so.rotationZ;
          obj.color = so.color;
          obj.visible = so.visible;
          if (!obj.anchored) {
            obj.vx = so.velX;
            obj.vy = so.velY;
            obj.vz = so.velZ;
          }
          break;
        }
      }
    }
    for (const p of this.players.values()) {
      p.vy += GRAVITY * dt;
      const cos = Math.cos(p.camY), sin = Math.sin(p.camY);
      p.vx = (p.moveX * cos + p.moveZ * sin) * MOVE_SPEED;
      p.vz = (-p.moveX * sin + p.moveZ * cos) * MOVE_SPEED;
      if (p.jumpQueued && p.onGround) {
        p.vy = JUMP_VEL;
        p.onGround = false;
      }
      p.jumpQueued = false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.onGround = false;
      if (p.y <= PLAYER_HALF_H) {
        p.y = PLAYER_HALF_H;
        if (p.vy < 0) p.vy = 0;
        p.onGround = true;
      }
      this._pushPlayerOutOfStatics(p);
    }
    for (const obj of this.dynamics.values()) {
      if (obj.anchored) continue;
      obj.vy += GRAVITY * dt;
      const drag = Math.pow(OBJ_DRAG, dt);
      obj.vx *= drag;
      obj.vz *= drag;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.z += obj.vz * dt;
      const halfH = obj.sy / 2;
      if (obj.y - halfH <= 0) {
        obj.y = halfH;
        obj.vy = Math.abs(obj.vy) > 0.5 ? -obj.vy * OBJ_BOUNCE : 0;
        obj.vx *= 0.7;
        obj.vz *= 0.7;
      }
      this._pushObjOutOfStatics(obj);
      for (const p of this.players.values()) {
        const dx = obj.x - p.x, dz = obj.z - p.z, dy = obj.y - p.y;
        const distSq = dx * dx + dz * dz;
        const minDist = PLAYER_RADIUS + Math.max(obj.sx, obj.sz) / 2;
        if (distSq < minDist * minDist && Math.abs(dy) < PLAYER_HALF_H + obj.sy / 2) {
          const dist = Math.sqrt(distSq) || 1e-3;
          const push = 8 * (minDist - dist);
          obj.vx += dx / dist * push;
          obj.vz += dz / dist * push;
          obj.vy += 2;
        }
      }
    }
    for (const obj of this.allObjs.values()) {
      const so = this.scriptObjs.get(obj.name);
      if (!so) continue;
      so.positionX = obj.x;
      so.positionY = obj.y;
      so.positionZ = obj.z;
      so.rotationX = obj.rotX;
      so.rotationY = obj.rotY;
      so.rotationZ = obj.rotZ;
      so.color = obj.color;
      so.visible = obj.visible;
      if (!obj.anchored) {
        so.velX = obj.vx;
        so.velY = obj.vy;
        so.velZ = obj.vz;
      }
    }
    if (this.scriptRunner) {
      const nowTouching = /* @__PURE__ */ new Set();
      for (const p of this.players.values()) {
        for (const obj of this.allObjs.values()) {
          const hx = obj.sx / 2, hy = obj.sy / 2, hz = obj.sz / 2;
          const ox = Math.min(p.x + PLAYER_RADIUS, obj.x + hx) - Math.max(p.x - PLAYER_RADIUS, obj.x - hx);
          const oy = Math.min(p.y + PLAYER_HALF_H, obj.y + hy) - Math.max(p.y - PLAYER_HALF_H, obj.y - hy);
          const oz = Math.min(p.z + PLAYER_RADIUS, obj.z + hz) - Math.max(p.z - PLAYER_RADIUS, obj.z - hz);
          if (ox > 0 && oy > 0 && oz > 0) {
            const pairKey = `${p.id}:${obj.id}`;
            nowTouching.add(pairKey);
            if (!this.touchedPairs.has(pairKey)) {
              this.scriptRunner.fireTouched(obj.name, { id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
            }
          }
        }
        for (const b of this.statics) {
          const ox = Math.min(p.x + PLAYER_RADIUS, b.maxX) - Math.max(p.x - PLAYER_RADIUS, b.minX);
          const oy = Math.min(p.y + PLAYER_HALF_H, b.maxY) - Math.max(p.y - PLAYER_HALF_H, b.minY);
          const oz = Math.min(p.z + PLAYER_RADIUS, b.maxZ) - Math.max(p.z - PLAYER_RADIUS, b.minZ);
          if (ox > 0 && oy > 0 && oz > 0) {
            const pairKey = `${p.id}:static:${b.name}`;
            nowTouching.add(pairKey);
            if (!this.touchedPairs.has(pairKey)) {
              this.scriptRunner.fireTouched(b.name, { id: p.id, name: p.name, position: { x: p.x, y: p.y, z: p.z } });
            }
          }
        }
      }
      this.touchedPairs = nowTouching;
    }
    for (const p of this.players.values()) {
      const moving = Math.abs(p.vx) > 0.5 || Math.abs(p.vz) > 0.5;
      if (!p.onGround) {
        p.animation = p.vy > 2 ? "jump" : "fall";
      } else if (moving) {
        p.animation = "run";
      } else {
        p.animation = "idle";
      }
    }
    this.tickNumber++;
    if (this.players.size > 0) {
      const guiElements = this.scriptRunner?.getGuiElements() ?? [];
      const renderPlayers = Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: 0, y: p.rotY, z: 0 },
        velocity: { x: p.vx, y: p.vy, z: p.vz },
        onGround: p.onGround,
        animation: p.animation,
        health: p.health,
        maxHealth: p.maxHealth,
        colors: {
          shirt: p.shirtColor ?? "#3b82f6",
          skin: p.skinColor ?? "#d4a574",
          pants: p.pantsColor ?? "#374151"
        },
        motors: {}
      }));
      const renderObjects = Array.from(this.allObjs.values()).map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        primitiveType: o.primitiveType,
        position: { x: o.x, y: o.y, z: o.z },
        rotation: { x: o.rotX, y: o.rotY, z: o.rotZ },
        scale: { x: o.sx, y: o.sy, z: o.sz },
        color: o.color,
        visible: o.visible,
        transparency: o.transparency ?? 0,
        modelUrl: o.modelUrl,
        modelScale: o.modelScale,
        animation: o.animation,
        animationSpeed: o.animationSpeed,
        animationLoop: o.animationLoop
      }));
      const renderGui = guiElements.map((g) => ({
        id: g.id,
        kind: g.kind,
        text: g.text,
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        anchor: g.anchor ?? "topLeft",
        color: g.color ?? "#ffffff",
        fontSize: g.fontSize ?? 14,
        backgroundColor: g.backgroundColor,
        imageUrl: g.imageUrl,
        value: g.value,
        maxValue: g.maxValue,
        visible: g.visible !== false,
        clickable: g.clickable
      }));
      const state = {
        tick: this.tickNumber,
        serverTime: Date.now(),
        objects: renderObjects,
        players: renderPlayers,
        gui: renderGui,
        localPlayerId: null
        // Set per-client when sending
      };
      this.broadcastFn({
        type: "worldState",
        state,
        // Keep legacy format for backwards compatibility during transition
        players: renderPlayers.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          rotY: p.rotation.y,
          onGround: p.onGround,
          shirtColor: p.colors.shirt,
          skinColor: p.colors.skin,
          pantsColor: p.colors.pants
        })),
        objects: Array.from(this.allObjs.values()).map((o) => ({
          id: o.id,
          x: o.x,
          y: o.y,
          z: o.z,
          rotX: o.rotX,
          rotY: o.rotY,
          rotZ: o.rotZ,
          color: o.color,
          visible: o.visible
        }))
      });
    }
  }
  // ── AABB helpers ─────────────────────────────────────────────────────────────
  _pushPlayerOutOfStatics(p) {
    for (const b of this.statics) {
      const ox = Math.min(p.x + PLAYER_RADIUS, b.maxX) - Math.max(p.x - PLAYER_RADIUS, b.minX);
      const oy = Math.min(p.y + PLAYER_HALF_H, b.maxY) - Math.max(p.y - PLAYER_HALF_H, b.minY);
      const oz = Math.min(p.z + PLAYER_RADIUS, b.maxZ) - Math.max(p.z - PLAYER_RADIUS, b.minZ);
      if (ox > 0 && oy > 0 && oz > 0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (p.y > (b.minY + b.maxY) / 2) {
            p.y += oy;
            if (p.vy < 0) {
              p.vy = 0;
              p.onGround = true;
            }
          } else {
            p.y -= oy;
            if (p.vy > 0) p.vy = 0;
          }
        } else if (min === ox) {
          if (p.x > (b.minX + b.maxX) / 2) p.x += ox;
          else p.x -= ox;
          p.vx = 0;
        } else {
          if (p.z > (b.minZ + b.maxZ) / 2) p.z += oz;
          else p.z -= oz;
          p.vz = 0;
        }
      }
    }
  }
  _pushObjOutOfStatics(obj) {
    const hx = obj.sx / 2, hy = obj.sy / 2, hz = obj.sz / 2;
    for (const b of this.statics) {
      const ox = Math.min(obj.x + hx, b.maxX) - Math.max(obj.x - hx, b.minX);
      const oy = Math.min(obj.y + hy, b.maxY) - Math.max(obj.y - hy, b.minY);
      const oz = Math.min(obj.z + hz, b.maxZ) - Math.max(obj.z - hz, b.minZ);
      if (ox > 0 && oy > 0 && oz > 0) {
        const min = Math.min(ox, oy, oz);
        if (min === oy) {
          if (obj.y > (b.minY + b.maxY) / 2) {
            obj.y += oy;
            obj.vy = Math.abs(obj.vy) * OBJ_BOUNCE;
          } else {
            obj.y -= oy;
            obj.vy = -Math.abs(obj.vy) * OBJ_BOUNCE;
          }
        } else if (min === ox) {
          if (obj.x > (b.minX + b.maxX) / 2) obj.x += ox;
          else obj.x -= ox;
          obj.vx = -obj.vx * OBJ_BOUNCE;
        } else {
          if (obj.z > (b.minZ + b.maxZ) / 2) obj.z += oz;
          else obj.z -= oz;
          obj.vz = -obj.vz * OBJ_BOUNCE;
        }
      }
    }
  }
  get playerCount() {
    return this.players.size;
  }
  /** Handle a GUI click from a client */
  handleGuiClick(playerId, elementId) {
    const player = this.players.get(playerId);
    if (!player || !this.scriptRunner) return;
    this.scriptRunner.fireGuiClick(elementId, {
      id: player.id,
      name: player.name,
      position: { x: player.x, y: player.y, z: player.z }
    });
  }
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
};

// server/routes.ts
var uploadDir = path2.join(process.cwd(), "uploads");
fs2.mkdir(uploadDir, { recursive: true });
var upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path2.extname(file.originalname));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = [".glb", ".gltf", ".obj", ".fbx", ".png", ".jpg", ".jpeg"];
    const ext = path2.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  }
});
async function registerRoutes(app2, httpServer) {
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  await setupAuth(app2);
  app2.use("/uploads", express.static(uploadDir));
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app2.get("/api/auth/me", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      return res.json(user ?? null);
    } catch {
      return res.json(null);
    }
  });
  app2.post("/api/games", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const gameData = insertGameSchema.parse({ ...req.body, userId });
      const game = await storage.createGame(gameData);
      await storage.createGameObject({
        gameId: game.id,
        name: "Baseplate",
        type: "primitive",
        container: "Workspace",
        primitiveType: "cube",
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        scaleX: 40,
        scaleY: 1,
        scaleZ: 40,
        color: "#3a4252"
      });
      await storage.createGameObject({
        gameId: game.id,
        name: "SpawnLocation",
        type: "spawn",
        container: "Workspace",
        primitiveType: "cylinder",
        positionX: 0,
        positionY: 0.55,
        positionZ: 0,
        scaleX: 2,
        scaleY: 0.1,
        scaleZ: 2,
        color: "#3b82f6"
      });
      await storage.createGameObject({
        gameId: game.id,
        name: "Sun",
        type: "light",
        container: "Lighting",
        primitiveType: null,
        positionX: 6,
        positionY: 10,
        positionZ: 4,
        color: "#fff3c8"
      });
      res.json(game);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(400).json({ message: error.message || "Failed to create game" });
    }
  });
  app2.get("/api/games", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const games2 = await storage.getGamesByUserId(userId);
      res.json(games2);
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });
  app2.get("/api/games/published", async (req, res) => {
    try {
      const games2 = await storage.getPublishedGames();
      res.json(games2);
    } catch (error) {
      console.error("Error fetching published games:", error);
      res.status(500).json({ message: "Failed to fetch published games" });
    }
  });
  app2.get("/api/games/:id", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      res.json(game);
    } catch (error) {
      console.error("Error fetching game:", error);
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });
  app2.patch("/api/games/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      if (game.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this game" });
      }
      const updated = await storage.updateGame(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating game:", error);
      res.status(400).json({ message: error.message || "Failed to update game" });
    }
  });
  app2.delete("/api/games/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      if (game.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this game" });
      }
      await storage.deleteGame(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting game:", error);
      res.status(500).json({ message: "Failed to delete game" });
    }
  });
  app2.post("/api/games/:id/play", async (req, res) => {
    try {
      await storage.incrementGamePlays(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing plays:", error);
      res.status(500).json({ message: "Failed to increment plays" });
    }
  });
  app2.post("/api/games/:gameId/objects", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const game = await storage.getGame(req.params.gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      if (game.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to edit this game" });
      }
      const objData = insertGameObjectSchema.parse({ ...req.body, gameId: req.params.gameId });
      const gameObject = await storage.createGameObject(objData);
      res.json(gameObject);
    } catch (error) {
      console.error("Error creating game object:", error);
      res.status(400).json({ message: error.message || "Failed to create game object" });
    }
  });
  app2.get("/api/games/:gameId/objects", async (req, res) => {
    try {
      const objects = await storage.getGameObjects(req.params.gameId);
      res.json(objects);
    } catch (error) {
      console.error("Error fetching game objects:", error);
      res.status(500).json({ message: "Failed to fetch game objects" });
    }
  });
  app2.patch("/api/objects/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const obj = await storage.getGameObject(req.params.id);
      if (!obj) {
        return res.status(404).json({ message: "Object not found" });
      }
      const game = await storage.getGame(obj.gameId);
      if (game?.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to edit this object" });
      }
      const updated = await storage.updateGameObject(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating object:", error);
      res.status(400).json({ message: error.message || "Failed to update object" });
    }
  });
  app2.delete("/api/objects/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const obj = await storage.getGameObject(req.params.id);
      if (!obj) {
        return res.status(404).json({ message: "Object not found" });
      }
      const game = await storage.getGame(obj.gameId);
      if (game?.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this object" });
      }
      await storage.deleteGameObject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting object:", error);
      res.status(500).json({ message: "Failed to delete object" });
    }
  });
  app2.post("/api/games/:gameId/scripts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const game = await storage.getGame(req.params.gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      if (game.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to edit this game" });
      }
      const scriptData = insertScriptSchema.parse({ ...req.body, gameId: req.params.gameId });
      const script = await storage.createScript(scriptData);
      res.json(script);
    } catch (error) {
      console.error("Error creating script:", error);
      res.status(400).json({ message: error.message || "Failed to create script" });
    }
  });
  app2.get("/api/games/:gameId/scripts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const game = await storage.getGame(req.params.gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to view scripts" });
      }
      const scripts2 = await storage.getScripts(req.params.gameId);
      res.json(scripts2);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      res.status(500).json({ message: "Failed to fetch scripts" });
    }
  });
  app2.patch("/api/scripts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      const game = await storage.getGame(script.gameId);
      if (game?.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to edit this script" });
      }
      const updated = await storage.updateScript(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating script:", error);
      res.status(400).json({ message: error.message || "Failed to update script" });
    }
  });
  app2.delete("/api/scripts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      const game = await storage.getGame(script.gameId);
      if (game?.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this script" });
      }
      await storage.deleteScript(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting script:", error);
      res.status(500).json({ message: "Failed to delete script" });
    }
  });
  app2.post("/api/assets/upload", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const userId = getUserId(req);
      const fileUrl = `/uploads/${req.file.filename}`;
      const asset = await storage.createAsset({
        userId,
        name: req.body.name || req.file.originalname,
        type: req.body.type || "model",
        category: req.body.category || "custom",
        fileUrl,
        fileFormat: path2.extname(req.file.originalname).substring(1),
        fileSize: req.file.size,
        isBuiltIn: false,
        isPublic: req.body.isPublic === "true"
      });
      res.json(asset);
    } catch (error) {
      console.error("Error uploading asset:", error);
      res.status(500).json({ message: error.message || "Failed to upload asset" });
    }
  });
  app2.get("/api/assets", async (req, res) => {
    try {
      const assets2 = await storage.getAssets();
      res.json(assets2);
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });
  app2.get("/api/assets/built-in", async (req, res) => {
    try {
      const assets2 = await storage.getBuiltInAssets();
      res.json(assets2);
    } catch (error) {
      console.error("Error fetching built-in assets:", error);
      res.status(500).json({ message: "Failed to fetch built-in assets" });
    }
  });
  app2.get("/api/assets/my", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const assets2 = await storage.getAssets(userId);
      res.json(assets2);
    } catch (error) {
      console.error("Error fetching user assets:", error);
      res.status(500).json({ message: "Failed to fetch user assets" });
    }
  });
  app2.delete("/api/assets/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      if (asset.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this asset" });
      }
      if (asset.fileUrl.startsWith("/uploads/")) {
        const filePath = path2.join(uploadDir, path2.basename(asset.fileUrl));
        await fs2.unlink(filePath).catch(() => {
        });
      }
      await storage.deleteAsset(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting asset:", error);
      res.status(500).json({ message: "Failed to delete asset" });
    }
  });
  app2.post("/api/multiplayer/sessions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const session = await storage.createMultiplayerSession({
        gameId: req.body.gameId,
        hostUserId: userId,
        maxPlayers: req.body.maxPlayers || 10
      });
      res.json(session);
    } catch (error) {
      console.error("Error creating multiplayer session:", error);
      res.status(400).json({ message: error.message || "Failed to create session" });
    }
  });
  app2.get("/api/multiplayer/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getMultiplayerSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });
  app2.get("/api/multiplayer/sessions/game/:gameId", async (req, res) => {
    try {
      const session = await storage.getActiveSessionForGame(req.params.gameId);
      res.json(session || null);
    } catch (error) {
      console.error("Error fetching active session:", error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });
  app2.get("/api/multiplayer/sessions/:id/players", async (req, res) => {
    try {
      const players = await storage.getSessionPlayers(req.params.id);
      res.json(players);
    } catch (error) {
      console.error("Error fetching session players:", error);
      res.status(500).json({ message: "Failed to fetch session players" });
    }
  });
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = /* @__PURE__ */ new Map();
  const gameRooms = /* @__PURE__ */ new Map();
  function broadcast(sessionId, message, excludeClientId) {
    const str = JSON.stringify(message);
    clients.forEach((client, id) => {
      if (client.sessionId === sessionId && id !== excludeClientId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(str);
        }
      }
    });
  }
  function broadcastAll(sessionId, message) {
    broadcast(sessionId, message, void 0);
  }
  async function getOrCreateRoom(sessionId, gameId) {
    if (!gameRooms.has(sessionId)) {
      const room = new GameRoom((msg) => broadcastAll(sessionId, msg));
      if (gameId) {
        try {
          const objects = await storage.getGameObjects(gameId);
          room.setObjects(objects);
          const scripts2 = await storage.getScripts(gameId);
          room.loadScripts(scripts2.map((s) => ({
            code: s.code ?? "",
            name: s.name ?? "Script",
            enabled: s.enabled !== false
          })));
        } catch (err) {
          console.error("[room] failed to load world:", err);
        }
      }
      gameRooms.set(sessionId, room);
    }
    return gameRooms.get(sessionId);
  }
  wss.on("connection", (ws) => {
    let clientId = null;
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        switch (message.type) {
          // ── JOIN ──────────────────────────────────────────────────────────
          case "join": {
            const { sessionId, userId, playerName, gameId, colors } = message;
            if (gameId) {
              const game = await storage.getGame(gameId);
              const maxPlayers = game?.maxPlayers ?? 10;
              const room2 = gameRooms.get(sessionId);
              const currentCount = room2 ? room2.playerCount : 0;
              if (currentCount >= maxPlayers) {
                ws.send(JSON.stringify({
                  type: "error",
                  code: "SERVER_FULL",
                  message: `Server is full (${maxPlayers} players max)`
                }));
                ws.close();
                break;
              }
            }
            const existing = await storage.getSessionPlayers(sessionId);
            const existingNames = new Set(existing.map((p) => p.playerName));
            let finalName = playerName || "Guest";
            if (existingNames.has(finalName)) {
              const base = finalName;
              let n = 2;
              while (existingNames.has(`${base}_${n}`)) n++;
              finalName = `${base}_${n}`;
            }
            const player = await storage.addSessionPlayer({
              sessionId,
              userId: userId || null,
              playerName: finalName,
              positionX: 0,
              positionY: 5,
              positionZ: 0,
              rotationY: 0
            });
            clientId = player.id;
            clients.set(clientId, { ws, sessionId, playerId: player.id, gameId, userId });
            const room = await getOrCreateRoom(sessionId, gameId);
            room.addPlayer(player.id, finalName, 0, 5, 0, colors || {});
            broadcast(sessionId, { type: "playerJoined", player: { ...player, playerName: finalName } }, clientId);
            const players = await storage.getSessionPlayers(sessionId);
            ws.send(JSON.stringify({
              type: "init",
              playerId: player.id,
              playerName: finalName,
              players
            }));
            break;
          }
          // ── INPUT (server-physics path) ───────────────────────────────────
          case "input": {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            const { moveX, moveZ, jump, rotY, camY } = message;
            room.applyInput(client.playerId, moveX ?? 0, moveZ ?? 0, !!jump, rotY ?? 0, camY ?? 0);
            break;
          }
          // ── MOVE (client-authority fallback — also syncs room state) ──────
          case "move": {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const { position, rotation } = message;
            const room = gameRooms.get(client.sessionId);
            if (room) room.syncPosition(client.playerId, position.x, position.y, position.z, rotation);
            await storage.updateSessionPlayer(client.playerId, {
              positionX: position.x,
              positionY: position.y,
              positionZ: position.z,
              rotationY: rotation
            });
            broadcast(client.sessionId, {
              type: "playerMoved",
              playerId: client.playerId,
              position,
              rotation
            }, clientId);
            break;
          }
          // ── CHAT ──────────────────────────────────────────────────────────
          case "chat": {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const text2 = String(message.text ?? "").slice(0, 200).trim();
            if (!text2) break;
            const allPlayers = await storage.getSessionPlayers(client.sessionId);
            const sender = allPlayers.find((p) => p.id === client.playerId);
            broadcastAll(client.sessionId, {
              type: "chat",
              playerId: client.playerId,
              playerName: sender?.playerName || "Player",
              text: text2
            });
            break;
          }
          // ── GUI CLICK (server-side GUI interaction) ────────────────────────
          case "guiClick": {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            const { elementId } = message;
            if (typeof elementId === "string") {
              room.handleGuiClick(client.playerId, elementId);
            }
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    ws.on("close", async () => {
      if (!clientId) return;
      const client = clients.get(clientId);
      if (client) {
        const room = gameRooms.get(client.sessionId);
        if (room) {
          room.removePlayer(client.playerId);
          if (room.playerCount === 0) {
            room.stop();
            gameRooms.delete(client.sessionId);
          }
        }
        await storage.removeSessionPlayer(client.playerId);
        broadcast(client.sessionId, { type: "playerLeft", playerId: client.playerId });
      }
      clients.delete(clientId);
    });
  });
}

// server/vite.ts
import express2 from "express";
import fs3 from "fs";
import path4 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path3 from "path";
import { fileURLToPath } from "url";
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path3.resolve(__dirname, "client", "src"),
      "@shared": path3.resolve(__dirname, "shared"),
      "@assets": path3.resolve(__dirname, "attached_assets")
    }
  },
  root: path3.resolve(__dirname, "client"),
  build: {
    outDir: path3.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: false,
      allow: [path3.resolve(__dirname)]
    },
    host: "0.0.0.0",
    port: 5e3,
    allowedHosts: true,
    hmr: {
      overlay: false
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
var __filename = fileURLToPath2(import.meta.url);
var __dirname2 = path4.dirname(__filename);
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const port = parseInt(process.env.PORT || "5000", 10);
  const isCodespacesPreview = process.env.CODESPACES === "true" && process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const isHttps = server.key !== void 0;
  const hmrProtocol = isHttps ? "wss" : "ws";
  const previewHmrHost = isCodespacesPreview ? `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` : void 0;
  const serverOptions = {
    middlewareMode: true,
    port,
    host: "0.0.0.0",
    hmr: isCodespacesPreview ? false : {
      server,
      protocol: previewHmrHost ? "wss" : hmrProtocol,
      host: previewHmrHost,
      port: previewHmrHost ? 443 : void 0,
      clientPort: previewHmrHost ? 443 : void 0
    },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs3.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path4.resolve(__dirname2, "../dist/public");
  if (!fs3.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/index.ts
process.env.NODE_ENV = process.env.NODE_ENV || "development";
var app = express3();
app.use(express3.json());
app.use(express3.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path5 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path5.startsWith("/api")) {
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const httpServer = createServer(app);
  log("using HTTP");
  await registerRoutes(app, httpServer);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    console.error("[express] unhandled error:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaught exception:", err);
  });
  const port = parseInt(process.env.PORT || "5000", 10);
  await new Promise((resolve, reject) => {
    httpServer.listen({ port, host: "0.0.0.0" }, () => {
      log(`serving on port ${port}`);
      resolve();
    });
    httpServer.on("error", reject);
  });
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }
})();
