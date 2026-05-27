import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { ensureSchema } from "./ensure-schema";

process.env.NODE_ENV = process.env.NODE_ENV || "development";
// Server restart trigger

const app = express();

// CORS — allows the Netlify frontend to reach this API on Render.
// Set CLIENT_ORIGIN=https://your-app.netlify.app in Render env vars.
// In development (same origin) this is a no-op.
const clientOrigin = process.env.CLIENT_ORIGIN;
app.use(
  cors({
    origin: clientOrigin
      ? clientOrigin.split(",").map((o) => o.trim())
      : true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  log('using HTTP');

  // Ensure DB schema exists before anything else touches the database
  await ensureSchema();

  // Register routes and set up WebSocket
  await registerRoutes(app, httpServer);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    // IMPORTANT: don't re-throw here. Re-throwing produces an unhandled rejection
    // inside the express middleware chain which (under tsx + node 20) bubbles up
    // and kills the process — causing the preview proxy to return 502 until the
    // dev script restarts. Just log it.
    console.error("[express] unhandled error:", err);
  });

  // Same reasoning for top-level async errors — keep the process alive so the
  // preview never goes to 502 from a single bad request or HMR failure.
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandled rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[process] uncaught exception:", err);
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  await new Promise<void>((resolve, reject) => {
    httpServer.listen({ port, host: "0.0.0.0" }, () => {
      log(`serving on port ${port}`);
      resolve();
    });
    httpServer.on("error", reject);
  });

  // importantly only setup vite in development after the server has been bound
  // so HMR can infer the correct address and port for the websocket URL.
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }
})();
