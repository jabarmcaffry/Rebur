// Referenced from javascript_log_in_with_replit and javascript_websocket blueprints
import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertGameSchema, insertGameObjectSchema, insertScriptSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";

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
    const allowedExts = ['.glb', '.gltf', '.obj', '.fbx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export async function registerRoutes(app: Express, httpServer: Server): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Serve uploaded files statically
  app.use('/uploads', (req, res, next) => {
    next();
  }, multer().none(), (req, res, next) => {
    next();
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser("test");
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Game routes
  app.post("/api/games", isAuthenticated, async (req: any, res) => {
    try {
      const userId = "test";
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
      const userId = "test";
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
    } catch (error: any) {
      console.error("Error updating game:", error);
      res.status(400).json({ message: error.message || "Failed to update game" });
    }
  });

  app.delete("/api/games/:id", isAuthenticated, async (req: any, res) => {
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
  app.post("/api/games/:gameId/objects", isAuthenticated, async (req: any, res) => {
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

  app.patch("/api/objects/:id", isAuthenticated, async (req: any, res) => {
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
    } catch (error: any) {
      console.error("Error updating object:", error);
      res.status(400).json({ message: error.message || "Failed to update object" });
    }
  });

  app.delete("/api/objects/:id", isAuthenticated, async (req: any, res) => {
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

  // Script routes
  app.post("/api/games/:gameId/scripts", isAuthenticated, async (req: any, res) => {
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
    } catch (error: any) {
      console.error("Error creating script:", error);
      res.status(400).json({ message: error.message || "Failed to create script" });
    }
  });

  app.get("/api/games/:gameId/scripts", async (req, res) => {
    try {
      const scripts = await storage.getScripts(req.params.gameId);
      res.json(scripts);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      res.status(500).json({ message: "Failed to fetch scripts" });
    }
  });

  app.patch("/api/scripts/:id", isAuthenticated, async (req: any, res) => {
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
    } catch (error: any) {
      console.error("Error updating script:", error);
      res.status(400).json({ message: error.message || "Failed to update script" });
    }
  });

  app.delete("/api/scripts/:id", isAuthenticated, async (req: any, res) => {
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

  // Asset routes
  app.post("/api/assets/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = "test";
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
      const userId = "test";
      const assets = await storage.getAssets(userId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching user assets:", error);
      res.status(500).json({ message: "Failed to fetch user assets" });
    }
  });

  app.delete("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = "test";
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
      const userId = "test";
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

  // Set up WebSocket server for multiplayer - Referenced from javascript_websocket blueprint
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  interface ConnectedClient {
    ws: WebSocket;
    sessionId: string;
    playerId: string;
    userId?: string;
  }

  const clients = new Map<string, ConnectedClient>();

  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'join':
            {
              const { sessionId, userId, playerName } = message;
              
              // Create session player
              const player = await storage.addSessionPlayer({
                sessionId,
                userId: userId || null,
                playerName: playerName || 'Guest',
                positionX: 0,
                positionY: 5,
                positionZ: 0,
                rotationY: 0,
              });

              clientId = player.id;
              clients.set(clientId, { ws, sessionId, playerId: player.id, userId });

              // Broadcast player joined to all clients in session
              broadcast(sessionId, {
                type: 'playerJoined',
                player: player,
              }, clientId);

              // Send current players to the new client
              const players = await storage.getSessionPlayers(sessionId);
              ws.send(JSON.stringify({
                type: 'init',
                playerId: player.id,
                players: players,
              }));
            }
            break;

          case 'move':
            {
              if (!clientId) break;
              const client = clients.get(clientId);
              if (!client) break;

              const { position, rotation } = message;
              
              // Update player position
              await storage.updateSessionPlayer(client.playerId, {
                positionX: position.x,
                positionY: position.y,
                positionZ: position.z,
                rotationY: rotation,
              });

              // Broadcast to other clients
              broadcast(client.sessionId, {
                type: 'playerMoved',
                playerId: client.playerId,
                position,
                rotation,
              }, clientId);
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', async () => {
      if (clientId) {
        const client = clients.get(clientId);
        if (client) {
          await storage.removeSessionPlayer(client.playerId);
          
          broadcast(client.sessionId, {
            type: 'playerLeft',
            playerId: client.playerId,
          }, clientId);
        }
        clients.delete(clientId);
      }
    });
  });

  function broadcast(sessionId: string, message: any, excludeClientId?: string) {
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
