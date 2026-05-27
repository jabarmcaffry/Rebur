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

  const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  async function checkVersion() {
    try {
      const apiBase = (import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "");
      const res = await fetch(`${apiBase}/api/version`, { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = await res.json();
      if (buildId && buildId !== startingBuildId) {
        // New deployment detected — hard reload to pick up fresh assets.
        window.location.reload();
      }
    } catch {
      // Network error — silently skip, will retry next interval.
    }
  }

  setInterval(checkVersion, CHECK_INTERVAL_MS);
})();

createRoot(document.getElementById("root")!).render(<App />);
