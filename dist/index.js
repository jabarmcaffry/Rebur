// server/index.ts
import express2 from "express";
import { createServer } from "http";

// server/routes.ts
import { WebSocketServer, WebSocket } from "ws";

// server/storage.ts
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
    return updated;
  }
  async deleteGame(id) {
    this.games.delete(id);
  }
  async incrementGamePlays(id) {
    const game = this.games.get(id);
    if (game) {
      game.plays = (game.plays || 0) + 1;
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
    return updated;
  }
  async deleteGameObject(id) {
    this.gameObjects.delete(id);
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
    return updated;
  }
  async deleteScript(id) {
    this.scripts.delete(id);
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
  }
  async createMultiplayerSession(session2) {
    const id = Math.random().toString(36).substring(7);
    const newSession = {
      id,
      gameId: session2.gameId,
      hostUserId: session2.hostUserId,
      isActive: session2.isActive ?? true,
      maxPlayers: session2.maxPlayers ?? 10,
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
    const session2 = this.sessions.get(id);
    if (!session2) return void 0;
    const updated = { ...session2, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }
  async endMultiplayerSession(id) {
    const session2 = this.sessions.get(id);
    if (session2) {
      session2.isActive = false;
      session2.endedAt = /* @__PURE__ */ new Date();
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
    const session2 = this.sessions.get(player.sessionId);
    if (session2) {
      session2.currentPlayers = (session2.currentPlayers || 0) + 1;
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
      const session2 = this.sessions.get(player.sessionId);
      if (session2) {
        session2.currentPlayers = Math.max(0, (session2.currentPlayers || 0) - 1);
      }
    }
  }
};
var storage = new MemStorage();

// server/replitAuth.ts
import session from "express-session";
async function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "pass123",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  };
  app2.use(session(sessionSettings));
  app2.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "test" && password === "pass123") {
      req.session.user = { claims: { sub: "test" } };
      return res.json({ success: true, user: { id: "test", username: "test" } });
    }
    res.status(401).json({ message: "Invalid credentials" });
  });
  app2.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
  app2.get("/api/auth/status", (req, res) => {
    if (req.session.user) {
      return res.json({ authenticated: true, user: { id: "test", username: "test" } });
    }
    res.json({ authenticated: false });
  });
}
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    req.user = req.session.user;
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}

// shared/schema.ts
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
  isPublic: z.boolean().optional()
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

// server/routes.ts
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
var WELCOME_SCRIPT = `// Welcome to your new game!
// Your script runs ONCE when Play starts \u2014 top to bottom.
// To do something every frame, listen for the "heartbeat" event.
// \`events.on("update", ...)\` still works too as a compatibility alias.
// Open the Docs button (top of the editor) for the full reference.

let timer = 0;
let score = 0;

log("Welcome, " + player.username + "!");
gui.text("title", "My Game", { anchor: "tc", y: 16, size: 22 });
gui.text("hint",  "WASD to move \xB7 Space to jump \xB7 E to score",
  { anchor: "bc", y: 24, size: 14, bg: "rgba(0,0,0,0.45)" });
gui.text("score", "Score: 0", { anchor: "tl", x: 16, y: 16, size: 18 });

// \u2500\u2500 Global game state (string-based \u2014 multiplayer-ready) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
state.set("phase", "Playing");
state.on("phase", (next) => log("phase \u2192", next));

// \u2500\u2500 Input \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
keyboard.onPress("r", () => player.respawn());
keyboard.onPress("e", () => {
  score += 1;
  gui.text("score", "Score: " + score);
  if (score >= 10) state.set("phase", "GameOver");
});

// \u2500\u2500 Drop a pickup coin nearby \u2014 walk into it to collect \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const coin = create({
  name: "Coin",
  primitiveType: "sphere",
  position: { x: 2, y: 1, z: 2 },
  scale:    { x: 0.4, y: 0.4, z: 0.4 },
  color: "#fbbf24",
});
coin.isPickup = true;
coin.pickupName = "Coin";
coin.on("clicked", () => log("you clicked the coin"));

// \u2500\u2500 Per-frame work \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
runService.heartbeat.on((dt) => {
  timer += dt;

  const world = find("World");
  if (world) world.rotation.y += dt * 0.1;

  gui.text(
    "clock",
    "Time: " + timer.toFixed(1) + "s",
    { anchor: "tr", x: 16, y: 16, size: 14, bg: "rgba(0,0,0,0.45)" }
  );

  if (state.get("phase") === "GameOver") {
    gui.text("over", "Game Over \u2014 press R to restart",
      { anchor: "cc", y: 0, size: 28, bg: "rgba(0,0,0,0.6)" });
  } else {
    gui.clear("over");
  }
});

// \u2500\u2500 World lifecycle \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
world.onPlayerSpawned((p) => log(p.username, "spawned at",
  p.spawnPoint.x.toFixed(1), p.spawnPoint.y.toFixed(1), p.spawnPoint.z.toFixed(1)));
`;
var uploadDir = path.join(process.cwd(), "uploads");
fs.mkdir(uploadDir, { recursive: true });
var upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = [".glb", ".gltf", ".obj", ".fbx", ".png", ".jpg", ".jpeg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  }
});
async function registerRoutes(app2, httpServer) {
  await setupAuth(app2);
  app2.use("/uploads", (req, res, next) => {
    next();
  }, multer().none(), (req, res, next) => {
    next();
  });
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser("test");
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app2.post("/api/games", isAuthenticated, async (req, res) => {
    try {
      const userId = "test";
      const gameData = insertGameSchema.parse({ ...req.body, userId });
      const game = await storage.createGame(gameData);
      await storage.createGameObject({
        gameId: game.id,
        name: "World",
        type: "primitive",
        container: "Workspace",
        primitiveType: "sphere",
        positionX: 0,
        positionY: 0.5,
        positionZ: 0,
        scaleX: 8,
        scaleY: 8,
        scaleZ: 8,
        color: "#5d8a4a"
      });
      await storage.createGameObject({
        gameId: game.id,
        name: "SpawnLocation",
        type: "spawn",
        container: "Workspace",
        primitiveType: "cylinder",
        positionX: 5,
        positionY: 0.05,
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
      await storage.createScript({
        gameId: game.id,
        name: "Welcome",
        enabled: true,
        container: "ServerScriptService",
        scriptType: "Script",
        code: WELCOME_SCRIPT
      });
      res.json(game);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(400).json({ message: error.message || "Failed to create game" });
    }
  });
  app2.get("/api/games", isAuthenticated, async (req, res) => {
    try {
      const userId = "test";
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
      const userId = "test";
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
      const userId = "test";
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
      const userId = "test";
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
      const userId = "test";
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
      const userId = "test";
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
      const userId = "test";
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
  app2.get("/api/games/:gameId/scripts", async (req, res) => {
    try {
      const scripts2 = await storage.getScripts(req.params.gameId);
      res.json(scripts2);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      res.status(500).json({ message: "Failed to fetch scripts" });
    }
  });
  app2.patch("/api/scripts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = "test";
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
      const userId = "test";
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
      const userId = "test";
      const fileUrl = `/uploads/${req.file.filename}`;
      const asset = await storage.createAsset({
        userId,
        name: req.body.name || req.file.originalname,
        type: req.body.type || "model",
        category: req.body.category || "custom",
        fileUrl,
        fileFormat: path.extname(req.file.originalname).substring(1),
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
      const userId = "test";
      const assets2 = await storage.getAssets(userId);
      res.json(assets2);
    } catch (error) {
      console.error("Error fetching user assets:", error);
      res.status(500).json({ message: "Failed to fetch user assets" });
    }
  });
  app2.delete("/api/assets/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = "test";
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      if (asset.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this asset" });
      }
      if (asset.fileUrl.startsWith("/uploads/")) {
        const filePath = path.join(uploadDir, path.basename(asset.fileUrl));
        await fs.unlink(filePath).catch(() => {
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
      const userId = "test";
      const session2 = await storage.createMultiplayerSession({
        gameId: req.body.gameId,
        hostUserId: userId,
        maxPlayers: req.body.maxPlayers || 10
      });
      res.json(session2);
    } catch (error) {
      console.error("Error creating multiplayer session:", error);
      res.status(400).json({ message: error.message || "Failed to create session" });
    }
  });
  app2.get("/api/multiplayer/sessions/:id", async (req, res) => {
    try {
      const session2 = await storage.getMultiplayerSession(req.params.id);
      if (!session2) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session2);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });
  app2.get("/api/multiplayer/sessions/game/:gameId", async (req, res) => {
    try {
      const session2 = await storage.getActiveSessionForGame(req.params.gameId);
      res.json(session2 || null);
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
  wss.on("connection", (ws) => {
    let clientId = null;
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        switch (message.type) {
          case "join":
            {
              const { sessionId, userId, playerName } = message;
              const player = await storage.addSessionPlayer({
                sessionId,
                userId: userId || null,
                playerName: playerName || "Guest",
                positionX: 0,
                positionY: 5,
                positionZ: 0,
                rotationY: 0
              });
              clientId = player.id;
              clients.set(clientId, { ws, sessionId, playerId: player.id, userId });
              broadcast(sessionId, {
                type: "playerJoined",
                player
              }, clientId);
              const players = await storage.getSessionPlayers(sessionId);
              ws.send(JSON.stringify({
                type: "init",
                playerId: player.id,
                players
              }));
            }
            break;
          case "move":
            {
              if (!clientId) break;
              const client = clients.get(clientId);
              if (!client) break;
              const { position, rotation } = message;
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
            }
            break;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    ws.on("close", async () => {
      if (clientId) {
        const client = clients.get(clientId);
        if (client) {
          await storage.removeSessionPlayer(client.playerId);
          broadcast(client.sessionId, {
            type: "playerLeft",
            playerId: client.playerId
          }, clientId);
        }
        clients.delete(clientId);
      }
    });
  });
  function broadcast(sessionId, message, excludeClientId) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client, id) => {
      if (client.sessionId === sessionId && id !== excludeClientId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(messageStr);
        }
      }
    });
  }
}

// server/vite.ts
import express from "express";
import fs2 from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import { fileURLToPath } from "url";
var __dirname = path2.dirname(fileURLToPath(import.meta.url));
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path2.resolve(__dirname, "client", "src"),
      "@shared": path2.resolve(__dirname, "shared"),
      "@assets": path2.resolve(__dirname, "attached_assets")
    }
  },
  root: path2.resolve(__dirname, "client"),
  build: {
    outDir: path2.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: false,
      allow: [path2.resolve(__dirname)]
    },
    host: true,
    hmr: {
      overlay: false
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
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
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      // Previously this called process.exit(1) on every Vite error, which killed
      // the express process and produced an intermittent 502 on the preview proxy
      // whenever a transient HMR / module-resolution hiccup occurred.
      // We just log loudly instead — the dev server stays up so the next request
      // can recover.
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
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
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
  const distPath = path3.resolve(import.meta.dirname, "../dist/public");
  if (!fs2.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
process.env.NODE_ENV = process.env.NODE_ENV || "development";
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
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
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({
    port,
    host: "0.0.0.0"
  }, () => {
    log(`serving on port ${port}`);
  });
})();
