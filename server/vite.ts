import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { BUILD_ID } from "./build-id";

const viteLogger = createLogger();

// FIX: recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const port = parseInt(process.env.PORT || "5000", 10);
  const isCodespacesPreview =
    process.env.CODESPACES === "true" &&
    process.env.CODESPACE_NAME &&
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const isHttps = (server as any).key !== undefined; // Check if HTTPS
  const hmrProtocol = isHttps ? 'wss' : 'ws';
  const previewHmrHost = isCodespacesPreview
    ? `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined;
  const serverOptions = {
    middlewareMode: true,
    port,
    host: "0.0.0.0" as const,
    hmr: isCodespacesPreview
      ? false
      : {
          server,
          protocol: previewHmrHost ? "wss" : hmrProtocol,
          host: previewHmrHost,
          port: previewHmrHost ? 443 : undefined,
          clientPort: previewHmrHost ? 443 : undefined,
        },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");

      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      const page = await vite.transformIndexHtml(url, template);

      res
        .status(200)
        .set({ "Content-Type": "text/html" })
        .end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../dist/public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Read index.html once and inject the BUILD_ID meta tag so the client can
  // detect version mismatches and self-update without waiting for a server push.
  const rawHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
  const indexHtml = rawHtml.replace(
    "<head>",
    `<head>\n    <meta name="build-id" content="${BUILD_ID}">`,
  );

  // Hashed assets (JS/CSS/images) — content-addressed filenames never repeat,
  // so a very long cache is safe and makes page loads blazing fast.
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
      etag: false,
      lastModified: false,
    }),
  );

  // All other static files (favicons, manifests, etc.) must never be cached
  // so new deployments are picked up immediately.
  const noCacheHeaders = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  app.use(
    express.static(distPath, {
      index: false, // we serve index.html manually below with injected BUILD_ID
      setHeaders(res) {
        res.set(noCacheHeaders);
      },
    }),
  );

  // SPA fallback — always serve the BUILD_ID-stamped index.html with no-cache.
  app.use("*", (_req, res) => {
    res.set(noCacheHeaders);
    res.set("Content-Type", "text/html");
    res.send(indexHtml);
  });
}
