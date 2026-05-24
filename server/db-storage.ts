import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import {
  users, games, gameObjects, scripts, assets, sessions,
  type User, type UpsertUser,
  type Game, type InsertGame,
  type GameObject, type InsertGameObject,
  type Script, type InsertScript,
  type Asset, type InsertAsset,
  type MultiplayerSession, type InsertMultiplayerSession,
  type SessionPlayer, type InsertSessionPlayer,
} from "@shared/schema";
import type { IStorage } from "./storage";

function genId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export class DatabaseStorage implements IStorage {
  // ── Users ─────────────────────────────────────────────────────────────────
  async getUser(id: string): Promise<User | undefined> {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [u] = await db
      .insert(users)
      .values({ ...userData, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return u;
  }

  // ── Games ─────────────────────────────────────────────────────────────────
  async createGame(game: InsertGame): Promise<Game> {
    const [g] = await db.insert(games).values({ ...game, id: genId() }).returning();
    return g;
  }

  async getGame(id: string): Promise<Game | undefined> {
    const [g] = await db.select().from(games).where(eq(games.id, id));
    return g;
  }

  async getGamesByUserId(userId: string): Promise<Game[]> {
    return db.select().from(games).where(eq(games.userId, userId)).orderBy(desc(games.updatedAt));
  }

  async getPublishedGames(): Promise<Game[]> {
    return db.select().from(games)
      .where(and(eq(games.isPublished, true), eq(games.isPublic, true)))
      .orderBy(desc(games.updatedAt));
  }

  async updateGame(id: string, updates: Partial<InsertGame>): Promise<Game | undefined> {
    const [g] = await db.update(games)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(games.id, id))
      .returning();
    return g;
  }

  async deleteGame(id: string): Promise<void> {
    await db.delete(games).where(eq(games.id, id));
  }

  async incrementGamePlays(id: string): Promise<void> {
    const [g] = await db.select().from(games).where(eq(games.id, id));
    if (g) {
      await db.update(games).set({ plays: (g.plays ?? 0) + 1 }).where(eq(games.id, id));
    }
  }

  // ── Game Objects ──────────────────────────────────────────────────────────
  async createGameObject(obj: InsertGameObject): Promise<GameObject> {
    const [o] = await db.insert(gameObjects).values({ ...obj, id: genId() } as any).returning();
    return o;
  }

  async getGameObjects(gameId: string): Promise<GameObject[]> {
    return db.select().from(gameObjects).where(eq(gameObjects.gameId, gameId));
  }

  async getGameObject(id: string): Promise<GameObject | undefined> {
    const [o] = await db.select().from(gameObjects).where(eq(gameObjects.id, id));
    return o;
  }

  async updateGameObject(id: string, updates: Partial<InsertGameObject>): Promise<GameObject | undefined> {
    const [o] = await db.update(gameObjects)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(gameObjects.id, id))
      .returning();
    return o;
  }

  async deleteGameObject(id: string): Promise<void> {
    await db.delete(gameObjects).where(eq(gameObjects.id, id));
  }

  // ── Scripts ───────────────────────────────────────────────────────────────
  async createScript(script: InsertScript): Promise<Script> {
    const [s] = await db.insert(scripts).values({ ...script, id: genId() } as any).returning();
    return s;
  }

  async getScripts(gameId: string): Promise<Script[]> {
    return db.select().from(scripts).where(eq(scripts.gameId, gameId));
  }

  async getScript(id: string): Promise<Script | undefined> {
    const [s] = await db.select().from(scripts).where(eq(scripts.id, id));
    return s;
  }

  async updateScript(id: string, updates: Partial<InsertScript>): Promise<Script | undefined> {
    const [s] = await db.update(scripts)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(scripts.id, id))
      .returning();
    return s;
  }

  async deleteScript(id: string): Promise<void> {
    await db.delete(scripts).where(eq(scripts.id, id));
  }

  // ── Assets ────────────────────────────────────────────────────────────────
  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [a] = await db.insert(assets).values({ ...asset, id: genId() } as any).returning();
    return a;
  }

  async getAssets(userId?: string): Promise<Asset[]> {
    if (userId) return db.select().from(assets).where(eq(assets.userId, userId));
    return db.select().from(assets).where(eq(assets.isPublic, true));
  }

  async getBuiltInAssets(): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.isBuiltIn, true));
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const [a] = await db.select().from(assets).where(eq(assets.id, id));
    return a;
  }

  async deleteAsset(id: string): Promise<void> {
    await db.delete(assets).where(eq(assets.id, id));
  }

  // ── Multiplayer (stub — not wired yet) ────────────────────────────────────
  private _sessions = new Map<string, MultiplayerSession>();
  private _players  = new Map<string, SessionPlayer>();

  async createMultiplayerSession(s: InsertMultiplayerSession): Promise<MultiplayerSession> {
    const id = genId();
    const sess = { ...s, id, endedAt: null } as unknown as MultiplayerSession;
    this._sessions.set(id, sess);
    return sess;
  }
  async getMultiplayerSession(id: string) { return this._sessions.get(id); }
  async getActiveSessionForGame(gameId: string) {
    return [...this._sessions.values()].find(s => s.gameId === gameId && !s.endedAt);
  }
  async updateMultiplayerSession(id: string, u: Partial<InsertMultiplayerSession>) {
    const s = this._sessions.get(id);
    if (!s) return undefined;
    const updated = { ...s, ...u } as MultiplayerSession;
    this._sessions.set(id, updated);
    return updated;
  }
  async endMultiplayerSession(id: string) {
    const s = this._sessions.get(id);
    if (s) this._sessions.set(id, { ...s, endedAt: new Date() });
  }
  async addSessionPlayer(p: InsertSessionPlayer): Promise<SessionPlayer> {
    const id = genId();
    const player = { ...p, id } as unknown as SessionPlayer;
    this._players.set(id, player);
    return player;
  }
  async getSessionPlayers(sessionId: string) {
    return [...this._players.values()].filter(p => p.sessionId === sessionId);
  }
  async updateSessionPlayer(id: string, u: Partial<InsertSessionPlayer>) {
    const p = this._players.get(id);
    if (!p) return undefined;
    const updated = { ...p, ...u } as SessionPlayer;
    this._players.set(id, updated);
    return updated;
  }
  async removeSessionPlayer(id: string) { this._players.delete(id); }
}
