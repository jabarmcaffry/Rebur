import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Cache-bust / version guard ────────────────────────────────────────────────
// The server injects <meta name="build-id"> into index.html on every deploy.
// We read it once on startup, then poll /api/version every 2 minutes.
// On mismatch we force a hard reload so users never run stale code.
(function startVersionWatch() {
  const metaTag = document.querySelector<HTMLMetaElement>('meta[name="build-id"]');
  const startingBuildId = metaTag?.content ?? null;

  // Only watch in production (meta tag is only injected by serveStatic, not
  // by the Vite dev server, so we skip the watch when the tag is absent).
  if (!startingBuildId) return;

  const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

  async function checkVersion() {
    try {
      const apiBase = (import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "");
      // Append a timestamp so no browser or CDN can cache this request.
      const res = await fetch(`${apiBase}/api/version?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "pragma": "no-cache", "cache-control": "no-cache" },
      });
      if (!res.ok) return;
      const { buildId } = await res.json();
      if (buildId && buildId !== startingBuildId) {
        // New deployment detected — replace the URL with a cache-busting
        // query param so the browser is forced to re-fetch index.html and
        // all assets rather than serving anything from disk cache.
        const url = new URL(window.location.href);
        url.searchParams.set("_reload", String(Date.now()));
        window.location.replace(url.toString());
      }
    } catch {
      // Network error — silently skip, will retry next interval.
    }
  }

  setInterval(checkVersion, CHECK_INTERVAL_MS);
})();

createRoot(document.getElementById("root")!).render(<App />);
