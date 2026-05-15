import { QueryClient, QueryFunction } from "@tanstack/react-query";
import * as store from "./clientStorage";

/**
 * Browser-side router for `/api/*` requests. The frontend was originally written
 * against an Express backend; on hosts where that backend doesn't run (e.g. the
 * Lovable preview), this dispatcher runs the same routes against an in-memory
 * client store so the editor stays fully functional.
 */
function handleApi(method: string, url: string, body?: any): { status: number; data: any } {
  const m = method.toUpperCase();
  const u = url.split("?")[0];

  // Auth
  if (u === "/api/auth/user" && m === "GET") {
    const user = store.getCurrentUser();
    return user ? { status: 200, data: user } : { status: 401, data: { message: "Unauthorized" } };
  }
  if (u === "/api/login" && m === "POST") {
    const r = store.login(body?.username, body?.password);
    return r.ok
      ? { status: 200, data: { success: true, user: r.user } }
      : { status: 401, data: { message: "Invalid credentials" } };
  }
  if (u === "/api/logout" && m === "POST") {
    store.logout();
    return { status: 200, data: { success: true } };
  }

  // Games
  if (u === "/api/games" && m === "GET") {
    const user = store.getCurrentUser();
    return { status: 200, data: user ? store.getGamesByUser(user.id) : [] };
  }
  if (u === "/api/games" && m === "POST") {
    const user = store.getCurrentUser();
    if (!user) return { status: 401, data: { message: "Unauthorized" } };
    const game = store.createGame({ userId: user.id, title: body?.title ?? "Untitled", description: body?.description });
    return { status: 200, data: game };
  }
  if (u === "/api/games/published" && m === "GET") {
    return { status: 200, data: store.getPublishedGames() };
  }

  // /api/games/:id   /api/games/:id/play   /api/games/:gameId/objects   /api/games/:gameId/scripts
  let match = u.match(/^\/api\/games\/([^/]+)$/);
  if (match) {
    const id = match[1];
    if (m === "GET") {
      const g = store.getGame(id);
      return g ? { status: 200, data: g } : { status: 404, data: { message: "Not found" } };
    }
    if (m === "PATCH") {
      const g = store.updateGame(id, body ?? {});
      return g ? { status: 200, data: g } : { status: 404, data: { message: "Not found" } };
    }
    if (m === "DELETE") {
      store.deleteGame(id);
      return { status: 200, data: { success: true } };
    }
  }

  match = u.match(/^\/api\/games\/([^/]+)\/play$/);
  if (match && m === "POST") { store.incrementPlays(match[1]); return { status: 200, data: { success: true } }; }

  match = u.match(/^\/api\/games\/([^/]+)\/objects$/);
  if (match) {
    const gameId = match[1];
    if (m === "GET") return { status: 200, data: store.getGameObjects(gameId) };
    if (m === "POST") return { status: 200, data: store.createGameObject({ ...(body ?? {}), gameId }) };
  }

  match = u.match(/^\/api\/games\/([^/]+)\/scripts$/);
  if (match) {
    const gameId = match[1];
    if (m === "GET") return { status: 200, data: store.getScripts(gameId) };
    if (m === "POST") return { status: 200, data: store.createScript({ ...(body ?? {}), gameId }) };
  }

  // /api/objects/:id
  match = u.match(/^\/api\/objects\/([^/]+)$/);
  if (match) {
    const id = match[1];
    if (m === "PATCH") {
      const o = store.updateGameObject(id, body ?? {});
      return o ? { status: 200, data: o } : { status: 404, data: { message: "Not found" } };
    }
    if (m === "DELETE") { store.deleteGameObject(id); return { status: 200, data: { success: true } }; }
  }

  // /api/scripts/:id
  match = u.match(/^\/api\/scripts\/([^/]+)$/);
  if (match) {
    const id = match[1];
    if (m === "PATCH") {
      const s = store.updateScript(id, body ?? {});
      return s ? { status: 200, data: s } : { status: 404, data: { message: "Not found" } };
    }
    if (m === "DELETE") { store.deleteScript(id); return { status: 200, data: { success: true } }; }
  }

  // Assets — minimal support; uploads aren't possible without a real backend.
  if (u === "/api/assets" && m === "GET") return { status: 200, data: store.getAssets() };
  if (u === "/api/assets/built-in" && m === "GET") return { status: 200, data: store.getBuiltInAssets() };
  if (u === "/api/assets/my" && m === "GET") {
    const user = store.getCurrentUser();
    return { status: 200, data: user ? store.getAssets(user.id) : [] };
  }

  // Multiplayer stubs
  match = u.match(/^\/api\/multiplayer\/sessions\/game\/([^/]+)$/);
  if (match && m === "GET") return { status: 200, data: store.getActiveSessionForGame(match[1]) };
  match = u.match(/^\/api\/multiplayer\/sessions\/([^/]+)\/players$/);
  if (match && m === "GET") return { status: 200, data: store.getSessionPlayers(match[1]) };

  return { status: 404, data: { message: `No client-side handler for ${m} ${u}` } };
}

/** Build a Response-like object that satisfies the rest of this file's expectations. */
function makeResponse({ status, data }: { status: number; data: any }): Response {
  const body = JSON.stringify(data ?? null);
  return new Response(body, {
    status,
    statusText: status < 400 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = url.startsWith("/api/")
    ? makeResponse(handleApi(method, url, data))
    : await fetch(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = url.startsWith("/api/")
      ? makeResponse(handleApi("GET", url))
      : await fetch(url, { credentials: "include" });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
