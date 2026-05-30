import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Games table - Projects created by users
export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"), // URL or base64 image
  isPublished: boolean("is_published").default(false),
  isPublic: boolean("is_public").default(true),
  plays: integer("plays").default(0),
  maxPlayers: integer("max_players").default(10),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gamesRelations = relations(games, ({ one, many }) => ({
  user: one(users, {
    fields: [games.userId],
    references: [users.id],
  }),
  gameObjects: many(gameObjects),
  scripts: many(scripts),
}));

export const insertGameSchema = z.object({
  userId: z.string(),
  title: z.string().max(255),
  description: z.string().optional().nullable(),
  thumbnail: z.string().optional().nullable(),
  isPublished: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  maxPlayers: z.number().int().min(1).max(100).optional(),
});

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

// Game Objects table - Objects in the 3D scene
//
// `container` is the top-level service this object lives under, using clean
// Roblox-style names (no "Engine" suffix). Allowed values:
//   - "Workspace"           : the live 3D world (rendered + simulated)
//   - "Lighting"            : lights, sky, atmosphere
//   - "Players"             : player avatars + per-player non-physical data
//   - "ServerScriptService" : server-authoritative scripts (run on the host only)
//   - "StarterPlayer"       : scripts/objects copied into each player on join (LocalScripts)
//   - "ReplicatedStorage"   : shared templates + ModuleScripts (server <-> all clients,
//                             also where `spawn("Name")` reads from).
//                             NOT safe for server-only data — replicates to clients.
//   - "ServerStorage"       : server-only templates + data. Never replicated to clients.
//                             Safe for sensitive server state (like Roblox's ServerStorage).
export const gameObjects = pgTable("game_objects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: 'cascade' }),
  parentId: varchar("parent_id"), // For hierarchy (null = root level)
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'primitive', 'model', 'light', 'camera', etc.
  container: varchar("container", { length: 50 }).notNull().default('Workspace'),
  
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
  primitiveType: varchar("primitive_type", { length: 50 }), // 'cube', 'sphere', 'plane', etc.
  color: varchar("color", { length: 7 }).default('#888888'), // Hex color
  
  // Model specific
  assetId: varchar("asset_id").references(() => assets.id, { onDelete: 'set null' }),
  
  // Additional properties as JSON (anchored, canCollide, transparency, mass,
  // friction, gravityEnabled, gravityStrength, gravityRadius, isPickup, ...).
  properties: jsonb("properties").default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gameObjectsRelations = relations(gameObjects, ({ one, many }) => ({
  game: one(games, {
    fields: [gameObjects.gameId],
    references: [games.id],
  }),
  parent: one(gameObjects, {
    fields: [gameObjects.parentId],
    references: [gameObjects.id],
  }),
  children: many(gameObjects),
  asset: one(assets, {
    fields: [gameObjects.assetId],
    references: [assets.id],
  }),
  scripts: many(scripts),
}));

export const insertGameObjectSchema = z.object({
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
  properties: z.record(z.unknown()).optional(),
});

export type InsertGameObject = z.infer<typeof insertGameObjectSchema>;
export type GameObject = typeof gameObjects.$inferSelect;

// Scripts table - JavaScript scripts for game logic.
//
// Scripts are parented either to an object (`objectId` set) OR directly to a
// service container (`container` set, `objectId` null). `scriptType` mirrors
// Roblox's three script kinds and determines where the script runs once we
// wire up multiplayer:
//   - "Script"       : server-authoritative (lives in ServerScriptService or in
//                      the Workspace under an object). Single-player play
//                      simulates the server locally.
//   - "LocalScript"  : per-client (lives in StarterPlayer or under a player
//                      object). Will be cloned into each joining player.
//   - "ModuleScript" : shared library (lives in ReplicatedStorage). Does not
//                      auto-run; other scripts `require()` it.
// Today the runtime executes all enabled scripts in the local play session, but
// the field is recorded now so the future networking layer can route correctly
// without a schema migration.
export const scripts = pgTable("scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: 'cascade' }),
  objectId: varchar("object_id").references(() => gameObjects.id, { onDelete: 'cascade' }), // null = parented to a service container, see `container`
  /** Which service / object the script lives under (e.g. ServerScriptService). */
  container: varchar("container", { length: 50 }).default('ServerScriptService'),
  /** "Script" | "LocalScript" | "ModuleScript". Defaults to Script. */
  scriptType: varchar("script_type", { length: 20 }).notNull().default('Script'),
  name: varchar("name", { length: 255 }).notNull(),
  code: text("code").notNull().default('// Write your JavaScript code here\n'),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scriptsRelations = relations(scripts, ({ one }) => ({
  game: one(games, {
    fields: [scripts.gameId],
    references: [games.id],
  }),
  gameObject: one(gameObjects, {
    fields: [scripts.objectId],
    references: [gameObjects.id],
  }),
}));

export const insertScriptSchema = z.object({
  gameId: z.string(),
  name: z.string().max(255),
  objectId: z.string().optional().nullable(),
  container: z.string().max(50).optional(),
  scriptType: z.string().max(20).optional(),
  code: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

// Assets table - 3D models, images, etc.
export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // null = built-in asset
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'model', 'image', 'audio'
  category: varchar("category", { length: 50 }), // 'avatar', 'npc', 'environment', 'custom'
  fileUrl: text("file_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  fileFormat: varchar("file_format", { length: 20 }), // 'glb', 'obj', 'fbx', 'png', etc.
  fileSize: integer("file_size"), // in bytes
  isBuiltIn: boolean("is_built_in").default(false),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assetsRelations = relations(assets, ({ one, many }) => ({
  user: one(users, {
    fields: [assets.userId],
    references: [users.id],
  }),
  gameObjects: many(gameObjects),
}));

export const insertAssetSchema = z.object({
  name: z.string().max(255),
  type: z.string().max(50),
  fileUrl: z.string(),
  userId: z.string().optional().nullable(),
  category: z.string().max(50).optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
  fileFormat: z.string().max(20).optional().nullable(),
  fileSize: z.number().int().optional().nullable(),
  isBuiltIn: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// Multiplayer Sessions table
export const multiplayerSessions = pgTable("multiplayer_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id, { onDelete: 'cascade' }),
  hostUserId: varchar("host_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").default(true),
  maxPlayers: integer("max_players").default(10),
  currentPlayers: integer("current_players").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const multiplayerSessionsRelations = relations(multiplayerSessions, ({ one, many }) => ({
  game: one(games, {
    fields: [multiplayerSessions.gameId],
    references: [games.id],
  }),
  host: one(users, {
    fields: [multiplayerSessions.hostUserId],
    references: [users.id],
  }),
  players: many(sessionPlayers),
}));

export const insertMultiplayerSessionSchema = z.object({
  gameId: z.string(),
  hostUserId: z.string(),
  isActive: z.boolean().optional(),
  maxPlayers: z.number().int().optional(),
});

export type InsertMultiplayerSession = z.infer<typeof insertMultiplayerSessionSchema>;
export type MultiplayerSession = typeof multiplayerSessions.$inferSelect;

// Session Players table - tracks players in multiplayer sessions
export const sessionPlayers = pgTable("session_players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => multiplayerSessions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  playerName: varchar("player_name", { length: 255 }),
  
  // Player position in game
  positionX: real("position_x").default(0),
  positionY: real("position_y").default(5),
  positionZ: real("position_z").default(0),
  rotationY: real("rotation_y").default(0),
  
  isActive: boolean("is_active").default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
});

export const sessionPlayersRelations = relations(sessionPlayers, ({ one }) => ({
  session: one(multiplayerSessions, {
    fields: [sessionPlayers.sessionId],
    references: [multiplayerSessions.id],
  }),
  user: one(users, {
    fields: [sessionPlayers.userId],
    references: [users.id],
  }),
}));

export const insertSessionPlayerSchema = z.object({
  sessionId: z.string(),
  userId: z.string().optional().nullable(),
  playerName: z.string().max(255).optional().nullable(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  positionZ: z.number().optional(),
  rotationY: z.number().optional(),
  isActive: z.boolean().optional(),
});

export type InsertSessionPlayer = z.infer<typeof insertSessionPlayerSchema>;
export type SessionPlayer = typeof sessionPlayers.$inferSelect;
