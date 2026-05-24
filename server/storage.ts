import fs from "fs";
import path from "path";
import { 
  type User, 
  type Game, 
  type InsertGame, 
  type GameObject, 
  type InsertGameObject, 
  type Script, 
  type InsertScript, 
  type Asset, 
  type InsertAsset, 
  type MultiplayerSession, 
  type InsertMultiplayerSession, 
  type SessionPlayer, 
  type InsertSessionPlayer,
  type UpsertUser
} from "@shared/schema";

const PERSIST_FILE = path.join("/tmp", "rebur-storage.json");
const DATE_KEYS = new Set(["createdAt", "updatedAt", "joinedAt", "leftAt", "endedAt"]);

function dateReviver(_key: string, value: unknown): unknown {
  if (DATE_KEYS.has(_key) && typeof value === "string" && value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createGame(game: InsertGame): Promise<Game>;
  getGame(id: string): Promise<Game | undefined>;
  getGamesByUserId(userId: string): Promise<Game[]>;
  getPublishedGames(): Promise<Game[]>;
  updateGame(id: string, updates: Partial<InsertGame>): Promise<Game | undefined>;
  deleteGame(id: string): Promise<void>;
  incrementGamePlays(id: string): Promise<void>;
  createGameObject(obj: InsertGameObject): Promise<GameObject>;
  getGameObjects(gameId: string): Promise<GameObject[]>;
  getGameObject(id: string): Promise<GameObject | undefined>;
  updateGameObject(id: string, updates: Partial<InsertGameObject>): Promise<GameObject | undefined>;
  deleteGameObject(id: string): Promise<void>;
  createScript(script: InsertScript): Promise<Script>;
  getScripts(gameId: string): Promise<Script[]>;
  getScript(id: string): Promise<Script | undefined>;
  updateScript(id: string, updates: Partial<InsertScript>): Promise<Script | undefined>;
  deleteScript(id: string): Promise<void>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  getAssets(userId?: string): Promise<Asset[]>;
  getBuiltInAssets(): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  deleteAsset(id: string): Promise<void>;
  createMultiplayerSession(session: InsertMultiplayerSession): Promise<MultiplayerSession>;
  getMultiplayerSession(id: string): Promise<MultiplayerSession | undefined>;
  getActiveSessionForGame(gameId: string): Promise<MultiplayerSession | undefined>;
  updateMultiplayerSession(id: string, updates: Partial<InsertMultiplayerSession>): Promise<MultiplayerSession | undefined>;
  endMultiplayerSession(id: string): Promise<void>;
  addSessionPlayer(player: InsertSessionPlayer): Promise<SessionPlayer>;
  getSessionPlayers(sessionId: string): Promise<SessionPlayer[]>;
  updateSessionPlayer(id: string, updates: Partial<InsertSessionPlayer>): Promise<SessionPlayer | undefined>;
  removeSessionPlayer(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private games: Map<string, Game>;
  private gameObjects: Map<string, GameObject>;
  private scripts: Map<string, Script>;
  private assets: Map<string, Asset>;
  private sessions: Map<string, MultiplayerSession>;
  private players: Map<string, SessionPlayer>;

  constructor() {
    this.users = new Map();
    this.games = new Map();
    this.gameObjects = new Map();
    this.scripts = new Map();
    this.assets = new Map();
    this.sessions = new Map();
    this.players = new Map();

    // Predefined user
    const testUser: User = {
      id: "test",
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(testUser.id, testUser);

    // Load persisted data (overwrites seed data for games/objects/scripts/assets)
    this._load();
  }

  private _save(): void {
    try {
      const data = {
        games: Object.fromEntries(this.games),
        gameObjects: Object.fromEntries(this.gameObjects),
        scripts: Object.fromEntries(this.scripts),
        assets: Object.fromEntries(this.assets),
      };
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(data), "utf-8");
    } catch { /* ignore write failures */ }
  }

  private _load(): void {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return;
      const raw = fs.readFileSync(PERSIST_FILE, "utf-8");
      const data = JSON.parse(raw, dateReviver as any);
      if (data.games) for (const [k, v] of Object.entries(data.games)) this.games.set(k, v as Game);
      if (data.gameObjects) for (const [k, v] of Object.entries(data.gameObjects)) this.gameObjects.set(k, v as GameObject);
      if (data.scripts) for (const [k, v] of Object.entries(data.scripts)) this.scripts.set(k, v as Script);
      if (data.assets) for (const [k, v] of Object.entries(data.assets)) this.assets.set(k, v as Asset);
    } catch { /* ignore load failures */ }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existing = Array.from(this.users.values()).find(u => u.id === userData.id);
    const user: User = {
      ...existing,
      ...userData,
      id: userData.id!,
      email: userData.email ?? existing?.email ?? null,
      firstName: userData.firstName ?? existing?.firstName ?? null,
      lastName: userData.lastName ?? existing?.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? existing?.profileImageUrl ?? null,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date()
    };
    this.users.set(user.id, user);
    return user;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const id = Math.random().toString(36).substring(7);
    const newGame: Game = {
      id,
      userId: game.userId,
      title: game.title,
      description: game.description ?? null,
      thumbnail: game.thumbnail ?? null,
      isPublished: game.isPublished ?? false,
      isPublic: game.isPublic ?? true,
      plays: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.games.set(id, newGame);
    this._save();
    return newGame;
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async getGamesByUserId(userId: string): Promise<Game[]> {
    return Array.from(this.games.values()).filter(g => g.userId === userId);
  }

  async getPublishedGames(): Promise<Game[]> {
    return Array.from(this.games.values()).filter(g => g.isPublished && g.isPublic);
  }

  async updateGame(id: string, updates: Partial<InsertGame>): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;
    const updated = { ...game, ...updates, updatedAt: new Date() };
    this.games.set(id, updated);
    this._save();
    return updated;
  }

  async deleteGame(id: string): Promise<void> {
    this.games.delete(id);
    this._save();
  }

  async incrementGamePlays(id: string): Promise<void> {
    const game = this.games.get(id);
    if (game) {
      game.plays = (game.plays || 0) + 1;
      this._save();
    }
  }

  async createGameObject(obj: InsertGameObject): Promise<GameObject> {
    const id = Math.random().toString(36).substring(7);
    const newObj: GameObject = {
      id,
      gameId: obj.gameId,
      name: obj.name,
      type: obj.type,
      parentId: obj.parentId ?? null,
      container: obj.container ?? 'Workspace',
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
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.gameObjects.set(id, newObj);
    this._save();
    return newObj;
  }

  async getGameObjects(gameId: string): Promise<GameObject[]> {
    return Array.from(this.gameObjects.values()).filter(o => o.gameId === gameId);
  }

  async getGameObject(id: string): Promise<GameObject | undefined> {
    return this.gameObjects.get(id);
  }

  async updateGameObject(id: string, updates: Partial<InsertGameObject>): Promise<GameObject | undefined> {
    const obj = this.gameObjects.get(id);
    if (!obj) return undefined;
    const updated = { ...obj, ...updates, updatedAt: new Date() };
    this.gameObjects.set(id, updated);
    this._save();
    return updated;
  }

  async deleteGameObject(id: string): Promise<void> {
    this.gameObjects.delete(id);
    this._save();
  }

  async createScript(script: InsertScript): Promise<Script> {
    const id = Math.random().toString(36).substring(7);
    const newScript: Script = {
      id,
      gameId: script.gameId,
      name: script.name,
      objectId: script.objectId ?? null,
      container: script.container ?? 'ServerScriptService',
      scriptType: script.scriptType ?? 'Script',
      code: script.code ?? '// Write your JavaScript code here\n',
      enabled: script.enabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.scripts.set(id, newScript);
    this._save();
    return newScript;
  }

  async getScripts(gameId: string): Promise<Script[]> {
    return Array.from(this.scripts.values()).filter(s => s.gameId === gameId);
  }

  async getScript(id: string): Promise<Script | undefined> {
    return this.scripts.get(id);
  }

  async updateScript(id: string, updates: Partial<InsertScript>): Promise<Script | undefined> {
    const script = this.scripts.get(id);
    if (!script) return undefined;
    const updated = { ...script, ...updates, updatedAt: new Date() };
    this.scripts.set(id, updated);
    this._save();
    return updated;
  }

  async deleteScript(id: string): Promise<void> {
    this.scripts.delete(id);
    this._save();
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const id = Math.random().toString(36).substring(7);
    const newAsset: Asset = {
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
      createdAt: new Date()
    };
    this.assets.set(id, newAsset);
    this._save();
    return newAsset;
  }

  async getAssets(userId?: string): Promise<Asset[]> {
    if (userId) return Array.from(this.assets.values()).filter(a => a.userId === userId);
    return Array.from(this.assets.values()).filter(a => a.isPublic);
  }

  async getBuiltInAssets(): Promise<Asset[]> {
    return Array.from(this.assets.values()).filter(a => a.isBuiltIn);
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    return this.assets.get(id);
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets.delete(id);
    this._save();
  }

  async createMultiplayerSession(session: InsertMultiplayerSession): Promise<MultiplayerSession> {
    const id = Math.random().toString(36).substring(7);
    const newSession: MultiplayerSession = {
      id,
      gameId: session.gameId,
      hostUserId: session.hostUserId,
      isActive: session.isActive ?? true,
      maxPlayers: session.maxPlayers ?? 10,
      currentPlayers: 0,
      createdAt: new Date(),
      endedAt: null
    };
    this.sessions.set(id, newSession);
    return newSession;
  }

  async getMultiplayerSession(id: string): Promise<MultiplayerSession | undefined> {
    return this.sessions.get(id);
  }

  async getActiveSessionForGame(gameId: string): Promise<MultiplayerSession | undefined> {
    return Array.from(this.sessions.values()).find(s => s.gameId === gameId && s.isActive);
  }

  async updateMultiplayerSession(id: string, updates: Partial<InsertMultiplayerSession>): Promise<MultiplayerSession | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }

  async endMultiplayerSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.isActive = false;
      session.endedAt = new Date();
    }
  }

  async addSessionPlayer(player: InsertSessionPlayer): Promise<SessionPlayer> {
    const id = Math.random().toString(36).substring(7);
    const newPlayer: SessionPlayer = {
      id,
      sessionId: player.sessionId,
      userId: player.userId ?? null,
      playerName: player.playerName ?? "Guest",
      positionX: player.positionX ?? 0,
      positionY: player.positionY ?? 5,
      positionZ: player.positionZ ?? 0,
      rotationY: player.rotationY ?? 0,
      isActive: player.isActive ?? true,
      joinedAt: new Date(),
      leftAt: null
    };
    this.players.set(id, newPlayer);
    
    const session = this.sessions.get(player.sessionId);
    if (session) {
      session.currentPlayers = (session.currentPlayers || 0) + 1;
    }
    
    return newPlayer;
  }

  async getSessionPlayers(sessionId: string): Promise<SessionPlayer[]> {
    return Array.from(this.players.values()).filter(p => p.sessionId === sessionId && p.isActive);
  }

  async updateSessionPlayer(id: string, updates: Partial<InsertSessionPlayer>): Promise<SessionPlayer | undefined> {
    const player = this.players.get(id);
    if (!player) return undefined;
    const updated = { ...player, ...updates };
    this.players.set(id, updated);
    return updated;
  }

  async removeSessionPlayer(id: string): Promise<void> {
    const player = this.players.get(id);
    if (player) {
      player.isActive = false;
      player.leftAt = new Date();
      const session = this.sessions.get(player.sessionId);
      if (session) {
        session.currentPlayers = Math.max(0, (session.currentPlayers || 0) - 1);
      }
    }
  }
}

export const storage = new MemStorage();
