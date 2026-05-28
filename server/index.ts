import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { ensureSchema } from "./ensure-schema";

process.env.NODE_ENV = process.env.NODE_ENV || "development";

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
// In production (API_ONLY mode on Render.com), the Netlify frontend makes
// WebSocket connections directly to this server.  Allow those cross-origin
// connections explicitly while still rejecting unknown origins.
const ALLOWED_ORIGINS = new Set([
  // Netlify production domain — update if you rename the site
  "https://rebur.netlify.app",
  // Allow any *.netlify.app preview deploy
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // server-to-server or same-origin — always allow
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow any Netlify preview deploy (rebur--<hash>.netlify.app)
  if (/\.netlify\.app$/.test(origin)) return true;
  // Allow any Render.com deploy (for health checks etc.)
  if (/\.onrender\.com$/.test(origin)) return true;
  // Allow localhost/127 for development
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  // Allow Replit dev domains
  if (/\.replit\.dev$/.test(origin) || /\.repl\.co$/.test(origin)) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = isAllowedOrigin(origin);

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(allowed ? 204 : 403);
    return;
  }

  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Request logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  const httpServer = createServer(app);
  log("using HTTP");

  // Ensure DB schema exists and stale sessions are cleared before anything
  // else touches the database.
  await ensureSchema();

  // Register all REST + WebSocket routes
  await registerRoutes(app, httpServer);

  // Global error handler — log but don't crash the process
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    console.error("[express] unhandled error:", err);
  });

  // Keep the process alive even on unexpected errors
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaught exception:", err);
  });

  // Bind to PORT (Render.com sets this automatically)
  const port = parseInt(process.env.PORT || "5000", 10);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen({ port, host: "0.0.0.0" }, () => {
      log(`serving on port ${port}`);
      resolve();
    });
    httpServer.on("error", reject);
  });

  // Development: serve Vite HMR + index.html
  // Production on Render (API_ONLY=true): skip static serving entirely —
  //   Netlify serves the static files and proxies /api/* here.
  // Production on Render (no API_ONLY): also serve the built client files.
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else if (!process.env.API_ONLY) {
    serveStatic(app);
  } else {
    log("API-only mode — static files served by Netlify");
  }
})();
