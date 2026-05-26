import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { BUILD_ID } from "./build-id";

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
  // Dynamic imports so vite is NEVER evaluated in production CJS bundles.
  const { createServer: createViteServer, createLogger } = await import("vite");
  const { default: viteConfig } = await import("../vite.config");

  const viteLogger = createLogger();
  const port = parseInt(process.env.PORT || "5000", 10);
  const isReplit = !!process.env.REPL_ID || !!process.env.REPLIT_DEV_DOMAIN;
  const isCodespacesPreview =
    process.env.CODESPACES === "true" &&
    process.env.CODESPACE_NAME &&
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const isHttps = (server as any).key !== undefined;
  const hmrProtocol = isHttps ? "wss" : "ws";
  const previewHmrHost = isCodespacesPreview
    ? `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined;

  const serverOptions = {
    middlewareMode: true,
    port,
    host: "0.0.0.0" as const,
    hmr: isReplit || isCodespacesPreview
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
      // process.cwd() works in both ESM (tsx dev) and CJS (bundled production)
      const clientTemplate = path.join(process.cwd(), "client", "index.html");

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
  // process.cwd() works in both ESM (tsx) and CJS (bundled production) contexts
  const distPath = path.join(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const rawHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
  const indexHtml = rawHtml.replace(
    "<head>",
    `<head>\n    <meta name="build-id" content="${BUILD_ID}">`,
  );

  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
      etag: false,
      lastModified: false,
    }),
  );

  const noCacheHeaders = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  app.use(
    express.static(distPath, {
      index: false,
      setHeaders(res) {
        res.set(noCacheHeaders);
      },
    }),
  );

  app.use("*", (_req, res) => {
    res.set(noCacheHeaders);
    res.set("Content-Type", "text/html");
    res.send(indexHtml);
  });
}
