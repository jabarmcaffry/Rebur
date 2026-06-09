// Referenced from javascript_log_in_with_replit and javascript_websocket blueprints
import express, { type Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getUserId } from "./replitAuth";
import { insertGameSchema, insertGameObjectSchema, insertScriptSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { GameRoom } from "./game-room";
import { BUILD_ID } from "./build-id";

// Set up multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdir(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.glb', '.gltf', '.png', '.jpg', '.jpeg', '.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export async function registerRoutes(app: Express, httpServer: Server): Promise<void> {
  // Health check for Render.com and load balancers
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Version endpoint — clients poll this to detect new deployments.
  // The extra headers tell every caching layer (browser, Render CDN, Fastly,
  // Cloudflare, etc.) never to store or reuse this response.
  app.get('/api/version', (_req, res) => {
    res.set({
      'Cache-Control':   'no-store, no-cache, must-revalidate, private, max-age=0',
      'Pragma':          'no-cache',
      'Expires':         '0',
      'Surrogate-Control': 'no-store',          // Fastly / Varnish
      'CDN-Cache-Control': 'no-store, max-age=0', // Cloudflare / generic CDN
    });
    res.json({ buildId: BUILD_ID, ts: Date.now() });
  });

  // Auth middleware
  await setupAuth(app);

  // Serve uploaded files statically
  app.use('/uploads', express.static(uploadDir));

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Public auth check — returns user object (with username) or null (no 401)
  app.get('/api/auth/me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.json(null);
      // Derive a display username from firstName, or the local part of the email
      const username =
        (user as any).firstName ||
        ((user as any).email?.split("@")[0] ?? "Player");
      return res.json({ ...user, username });
    } catch { return res.json(null); }
  });

  // Game routes
  app.post("/api/games", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const gameData = insertGameSchema.parse({ ...req.body, userId });
      const game = await storage.createGame(gameData);

      // Seed every new game with a default world so it's immediately playable.
      // Users can delete or edit any of these.
      await storage.createGameObject({
        gameId: game.id,
        name: "Baseplate",
        type: "primitive",
        container: "Workspace",
        primitiveType: "cube",
        positionX: 0, positionY: 0, positionZ: 0,
        scaleX: 40, scaleY: 1, scaleZ: 40,
        color: "#3a4252",
      } as any);
      await storage.createGameObject({
        gameId: game.id,
        name: "SpawnLocation",
        type: "spawn",
        container: "Workspace",
        primitiveType: "cylinder",
        positionX: 0, positionY: 0.55, positionZ: 0,
        scaleX: 2, scaleY: 0.1, scaleZ: 2,
        color: "#3b82f6",
      } as any);
      await storage.createGameObject({
        gameId: game.id,
        name: "Sun",
        type: "light",
        container: "Lighting",
        primitiveType: null as any,
        positionX: 6, positionY: 10, positionZ: 4,
        color: "#fff3c8",
      } as any);
      // No default script — users create their own scripts

      res.json(game);
    } catch (error: any) {
      console.error("Error creating game:", error);
      res.status(400).json({ message: error.message || "Failed to create game" });
    }
  });

  app.get("/api/games", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const games = await storage.getGamesByUserId(userId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching games:", error);
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });

  app.get("/api/games/published", async (req, res) => {
    try {
      const games = await storage.getPublishedGames();
      res.json(games);
    } catch (error) {
      console.error("Error fetching published games:", error);
      res.status(500).json({ message: "Failed to fetch published games" });
    }
  });

  app.get("/api/games/:id", async (req, res) => {
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

  app.patch("/api/games/:id", isAuthenticated, async (req: any, res) => {
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
    } catch (error: any) {
      console.error("Error updating game:", error);
      res.status(400).json({ message: error.message || "Failed to update game" });
    }
  });

  app.delete("/api/games/:id", isAuthenticated, async (req: any, res) => {
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

  app.post("/api/games/:id/play", async (req, res) => {
    try {
      await storage.incrementGamePlays(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing plays:", error);
      res.status(500).json({ message: "Failed to increment plays" });
    }
  });

  // Game Object routes
  app.post("/api/games/:gameId/objects", async (req: any, res) => {
    try {
      const objData = insertGameObjectSchema.parse({ ...req.body, gameId: req.params.gameId });
      const gameObject = await storage.createGameObject(objData);
      res.json(gameObject);
    } catch (error: any) {
      console.error("Error creating game object:", error);
      res.status(400).json({ message: error.message || "Failed to create game object" });
    }
  });

  app.get("/api/games/:gameId/objects", async (req, res) => {
    try {
      const objects = await storage.getGameObjects(req.params.gameId);
      res.json(objects);
    } catch (error) {
      console.error("Error fetching game objects:", error);
      res.status(500).json({ message: "Failed to fetch game objects" });
    }
  });

  app.patch("/api/objects/:id", async (req: any, res) => {
    try {
      const obj = await storage.getGameObject(req.params.id);
      if (!obj) {
        return res.status(404).json({ message: "Object not found" });
      }
      const updated = await storage.updateGameObject(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating object:", error);
      res.status(400).json({ message: error.message || "Failed to update object" });
    }
  });

  app.delete("/api/objects/:id", async (req: any, res) => {
    try {
      const obj = await storage.getGameObject(req.params.id);
      if (!obj) {
        return res.status(404).json({ message: "Object not found" });
      }
      await storage.deleteGameObject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting object:", error);
      res.status(500).json({ message: "Failed to delete object" });
    }
  });

  // Script routes
  app.post("/api/games/:gameId/scripts", isAuthenticated, async (req: any, res) => {
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
    } catch (error: any) {
      console.error("Error creating script:", error);
      res.status(400).json({ message: error.message || "Failed to create script" });
    }
  });

  // Scripts are server-executed only — only the game owner may view them
  app.get("/api/games/:gameId/scripts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const game = await storage.getGame(req.params.gameId);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to view scripts" });
      }
      const scripts = await storage.getScripts(req.params.gameId);
      res.json(scripts);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      res.status(500).json({ message: "Failed to fetch scripts" });
    }
  });

  app.patch("/api/scripts/:id", isAuthenticated, async (req: any, res) => {
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

      // Hot-reload scripts in every live room that is running this game.
      // This means edits take effect immediately — no need to leave and
      // rejoin Play mode to see changes.
      const sessions = gameIdToSessions.get(script.gameId);
      if (sessions && sessions.size > 0) {
        try {
          const allScripts = await storage.getScripts(script.gameId);
          const scriptPayload = allScripts.map((s: any) => ({
            code: s.code ?? "",
            name: s.name ?? "Script",
            enabled: s.enabled !== false,
          }));
          for (const sid of sessions) {
            const room = gameRooms.get(sid);
            if (room) room.loadScripts(scriptPayload);
          }
          console.log(`[routes] hot-reloaded scripts for game ${script.gameId} in ${sessions.size} room(s)`);
        } catch (err) {
          console.error("[routes] hot-reload failed:", err);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating script:", error);
      res.status(400).json({ message: error.message || "Failed to update script" });
    }
  });

  app.delete("/api/scripts/:id", isAuthenticated, async (req: any, res) => {
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

  // Asset routes
  app.post("/api/assets/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = req.user?.claims?.sub ?? req.session?.userId ?? null;
      const fileUrl = `/uploads/${req.file.filename}`;
      
      const asset = await storage.createAsset({
        userId,
        name: req.body.name || req.file.originalname,
        type: req.body.type || 'model',
        category: req.body.category || 'custom',
        fileUrl,
        fileFormat: path.extname(req.file.originalname).substring(1),
        fileSize: req.file.size,
        isBuiltIn: false,
        isPublic: req.body.isPublic === 'true',
      });

      res.json(asset);
    } catch (error: any) {
      console.error("Error uploading asset:", error);
      res.status(500).json({ message: error.message || "Failed to upload asset" });
    }
  });

  app.get("/api/assets", async (req, res) => {
    try {
      const assets = await storage.getAssets();
      res.json(assets);
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.get("/api/assets/built-in", async (req, res) => {
    try {
      const assets = await storage.getBuiltInAssets();
      res.json(assets);
    } catch (error) {
      console.error("Error fetching built-in assets:", error);
      res.status(500).json({ message: "Failed to fetch built-in assets" });
    }
  });

  app.get("/api/assets/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const assets = await storage.getAssets(userId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching user assets:", error);
      res.status(500).json({ message: "Failed to fetch user assets" });
    }
  });

  app.delete("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const asset = await storage.getAsset(req.params.id);
      
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      
      if (asset.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this asset" });
      }

      // Delete file from disk
      if (asset.fileUrl.startsWith('/uploads/')) {
        const filePath = path.join(uploadDir, path.basename(asset.fileUrl));
        await fs.unlink(filePath).catch(() => {});
      }

      await storage.deleteAsset(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting asset:", error);
      res.status(500).json({ message: "Failed to delete asset" });
    }
  });

  // Multiplayer session routes
  app.post("/api/multiplayer/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const session = await storage.createMultiplayerSession({
        gameId: req.body.gameId,
        hostUserId: userId,
        maxPlayers: req.body.maxPlayers || 10,
      });
      res.json(session);
    } catch (error: any) {
      console.error("Error creating multiplayer session:", error);
      res.status(400).json({ message: error.message || "Failed to create session" });
    }
  });

  app.get("/api/multiplayer/sessions/:id", async (req, res) => {
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

  app.get("/api/multiplayer/sessions/game/:gameId", async (req, res) => {
    try {
      const session = await storage.getActiveSessionForGame(req.params.gameId);
      res.json(session || null);
    } catch (error) {
      console.error("Error fetching active session:", error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  app.get("/api/multiplayer/sessions/:id/players", async (req, res) => {
    try {
      const players = await storage.getSessionPlayers(req.params.id);
      res.json(players);
    } catch (error) {
      console.error("Error fetching session players:", error);
      res.status(500).json({ message: "Failed to fetch session players" });
    }
  });

  // ─── WebSocket multiplayer server ────────────────────────────────────────────
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  interface ConnectedClient {
    ws: WebSocket;
    sessionId: string;
    playerId: string;
    gameId?: string;
    userId?: string;
  }

  const clients = new Map<string, ConnectedClient>();
  // One GameRoom per session (keyed by sessionId)
  const gameRooms = new Map<string, GameRoom>();
  // Reverse index: gameId → set of active sessionIds that belong to it.
  // Used to push script reloads into live rooms whenever a script is saved.
  const gameIdToSessions = new Map<string, Set<string>>();
  // Single-session enforcement: maps authenticated userId → active clientId
  // so the same account can only be in one game at a time.
  const activeUserSessions = new Map<string, string>(); // userId → clientId

  function broadcast(sessionId: string, message: object, excludeClientId?: string) {
    const str = JSON.stringify(message);
    clients.forEach((client, id) => {
      if (client.sessionId === sessionId && id !== excludeClientId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(str);
        }
      }
    });
  }

  function broadcastAll(sessionId: string, message: object) {
    broadcast(sessionId, message, undefined);
  }

  /** Send a message to a specific player by their playerId */
  function sendToPlayer(playerId: string, msg: object) {
    const str = JSON.stringify(msg);
    clients.forEach((client) => {
      if (client.playerId === playerId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(str);
      }
    });
  }

  /** Ensure a GameRoom exists for the session and return it. */
  async function getOrCreateRoom(sessionId: string, gameId?: string): Promise<GameRoom> {
    if (!gameRooms.has(sessionId)) {
      const room = new GameRoom(
        (msg) => broadcastAll(sessionId, msg),
        (playerId, msg) => sendToPlayer(playerId, msg),
      );
      if (gameId) {
        try {
          const objects = await storage.getGameObjects(gameId);
          room.setObjects(objects as any[]);
          // Load and execute scripts server-side — never sent to clients
          const scripts = await storage.getScripts(gameId);
          room.loadScripts(scripts.map((s: any) => ({
            code: s.code ?? "",
            name: s.name ?? "Script",
            enabled: s.enabled !== false,
          })));
        } catch (err) {
          console.error("[room] failed to load world:", err);
        }
      }
      gameRooms.set(sessionId, room);
      // Register the reverse lookup so script saves can find this room.
      if (gameId) {
        const s = gameIdToSessions.get(gameId) ?? new Set<string>();
        s.add(sessionId);
        gameIdToSessions.set(gameId, s);
      }
    }
    return gameRooms.get(sessionId)!;
  }

  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {

          // ── JOIN ──────────────────────────────────────────────────────────
          case 'join': {
            const { sessionId, userId, playerName, gameId, colors } = message;

            // ── Single-session enforcement ─────────────────────────────────
            // Authenticated users can only be in one game session at a time.
            if (userId) {
              const existingClientId = activeUserSessions.get(userId);
              if (existingClientId && clients.has(existingClientId)) {
                ws.send(JSON.stringify({
                  type: "error",
                  code: "ALREADY_IN_GAME",
                  message: "You are already playing in another session. Leave that game first.",
                }));
                // Don't close — keep the WebSocket open so the client can show the error UI.
                break;
              }
            }

            // Enforce maxPlayers limit for this game
            if (gameId) {
              const game = await storage.getGame(gameId);
              const maxPlayers = (game as any)?.maxPlayers ?? 10;
              const room = gameRooms.get(sessionId);
              const currentCount = room ? room.playerCount : 0;
              if (currentCount >= maxPlayers) {
                ws.send(JSON.stringify({
                  type: "error",
                  code: "SERVER_FULL",
                  message: `Server is full (${maxPlayers} players max)`,
                }));
                ws.close();
                break;
              }
            }

            // Ensure unique name within the session
            const existing = await storage.getSessionPlayers(sessionId);
            const existingNames = new Set(existing.map((p: any) => p.playerName));
            let finalName: string = playerName || 'Guest';
            if (existingNames.has(finalName)) {
              const base = finalName;
              let n = 2;
              while (existingNames.has(`${base}_${n}`)) n++;
              finalName = `${base}_${n}`;
            }

            // Add to server-side game room (physics authority) first so we
            // can read the spawn point extracted from the game's objects.
            const room = await getOrCreateRoom(sessionId, gameId);
            const sp = room.getSpawnPoint();

            const player = await storage.addSessionPlayer({
              sessionId,
              userId: userId || null,
              playerName: finalName,
              positionX: sp.x,
              positionY: sp.y,
              positionZ: sp.z,
              rotationY: 0,
            });

            clientId = player.id;
            clients.set(clientId, { ws, sessionId, playerId: player.id, gameId, userId });
            if (userId) activeUserSessions.set(userId, clientId);

            room.addPlayer(player.id, finalName, sp.x, sp.y, sp.z, colors || {});

            // Broadcast a complete RenderPlayer to existing clients so they can
            // render the newcomer's avatar immediately without waiting for worldState.
            const newPlayerRender = room.getPlayerRender(player.id);
            broadcast(sessionId, { type: 'playerJoined', player: newPlayerRender ?? { id: player.id, name: finalName, position: { x: sp.x, y: sp.y, z: sp.z }, rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, onGround: false, animation: "idle", health: 100, maxHealth: 100, colors: { shirt: colors?.shirtColor ?? "#3b82f6", skin: colors?.skinColor ?? "#d4a574", pants: colors?.pantsColor ?? "#374151" }, motors: {} } }, clientId);

            // Tell the new client their id/name + a full world snapshot
            const snapshot = room.getSnapshot(player.id);
            ws.send(JSON.stringify({
              type: 'init',
              playerId: player.id,
              playerName: finalName,
              state: snapshot,
            }));
            break;
          }

          // ── INPUT (server-physics path) ───────────────────────────────────
          case 'input': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            const { moveX, moveZ, jump, rotY, camY, sprint, cameraPos, cameraForward } = message;
            room.applyInput(client.playerId, moveX ?? 0, moveZ ?? 0, !!jump, rotY ?? 0, camY ?? 0, !!sprint, cameraPos, cameraForward);
            break;
          }

          // ── CLICK3D (3D object click → fire obj.on("clicked")) ─────────────
          case 'click3d': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            room.handleObjectClick(client.playerId, message.objectId ?? null);
            break;
          }

          // ── MOVE (client-authority fallback — also syncs room state) ──────
          case 'move': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const { position, rotation } = message;
            // Sync position into the room so worldState stays accurate
            const room = gameRooms.get(client.sessionId);
            if (room) room.syncPosition(client.playerId, position.x, position.y, position.z, rotation);
            // Also persist & relay immediately for low-latency feel
            await storage.updateSessionPlayer(client.playerId, {
              positionX: position.x,
              positionY: position.y,
              positionZ: position.z,
              rotationY: rotation,
            });
            broadcast(client.sessionId, {
              type: 'playerMoved',
              playerId: client.playerId,
              position,
              rotation,
            }, clientId);
            break;
          }

          // ── CHAT ──────────────────────────────────────────────────────────
          case 'chat': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const text = String(message.text ?? '').slice(0, 200).trim();
            if (!text) break;
            // Find the sender's name from storage
            const allPlayers = await storage.getSessionPlayers(client.sessionId);
            const sender = allPlayers.find((p: any) => p.id === client.playerId);
            broadcastAll(client.sessionId, {
              type: 'chat',
              playerId: client.playerId,
              playerName: sender?.playerName || 'Player',
              text,
            });
            break;
          }

          // ── GUI CLICK (server-side GUI interaction) ────────────────────────
          case 'guiClick': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            const { elementId } = message;
            if (typeof elementId === 'string') {
              room.handleGuiClick(client.playerId, elementId);
            }
            break;
          }

          // ── KEY DOWN → Rebur.Input.on("press") ────────────────────────────
          case 'keyDown': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            if (typeof message.key === 'string') {
              room.handleKeyDown(client.playerId, message.key);
            }
            break;
          }

          // ── KEY UP → Rebur.Input.on("release") ───────────────────────────
          case 'keyUp': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            if (typeof message.key === 'string') {
              room.handleKeyUp(client.playerId, message.key);
            }
            break;
          }

          // ── NETWORK SEND → Rebur.Network.on() ────────────────────────────
          case 'networkSend': {
            if (!clientId) break;
            const client = clients.get(clientId);
            if (!client) break;
            const room = gameRooms.get(client.sessionId);
            if (!room) break;
            if (typeof message.event === 'string') {
              room.handleNetworkMessage(client.playerId, message.event, message.payload ?? null);
            }
            break;
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', async () => {
      if (!clientId) return;
      const client = clients.get(clientId);
      if (client) {
        // Remove from game room
        const room = gameRooms.get(client.sessionId);
        if (room) {
          room.removePlayer(client.playerId);
          if (room.playerCount === 0) {
            room.stop();
            gameRooms.delete(client.sessionId);
            // Clean up the reverse gameId → session index.
            if (client.gameId) {
              const s = gameIdToSessions.get(client.gameId);
              if (s) {
                s.delete(client.sessionId);
                if (s.size === 0) gameIdToSessions.delete(client.gameId);
              }
            }
          }
        }
        await storage.removeSessionPlayer(client.playerId);
        broadcast(client.sessionId, { type: 'playerLeft', playerId: client.playerId });
        // Release the single-session slot for this user
        if (client.userId && activeUserSessions.get(client.userId) === clientId) {
          activeUserSessions.delete(client.userId);
        }
      }
      clients.delete(clientId);
    });
  });
}
