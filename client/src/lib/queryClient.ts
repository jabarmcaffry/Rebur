import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * API_BASE — prefix for all REST API calls.
 *
 * Deployment modes:
 *  - Local dev (Replit/localhost): empty string → relative paths → Vite proxies to Express
 *  - Netlify (VITE_API_URL set at build time): empty string → relative paths →
 *    Netlify [[redirects]] proxy forwards /api/* to Render.com (same-origin, no CORS)
 *  - Direct (e.g. custom domain with no proxy): VITE_API_URL → absolute URLs
 *
 * WebSocket connections always use VITE_API_URL directly (see render-client.ts)
 * because Netlify cannot proxy WebSocket upgrades.
 */
const VITE_API_URL =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "")
    : "";

// When the page is served by Netlify, its [[redirects]] rule proxies /api/*
// to the Render backend transparently — use relative paths.
// When the page is served by something that does NOT have the proxy
// (e.g. direct access to Render's own port, or a plain http-server) we need
// the absolute base so API calls reach the right host.
// Heuristic: if window.location.hostname matches the Netlify domain we're fine
// with relative paths; otherwise prepend VITE_API_URL.
function resolveApiBase(): string {
  if (!VITE_API_URL) return ""; // local dev — always relative
  if (typeof window === "undefined") return VITE_API_URL;
  const host = window.location.hostname;
  // Netlify domain → proxy is active → keep relative paths
  if (host.endsWith(".netlify.app") || host === "rebur.netlify.app") return "";
  // Otherwise (custom domain without proxy, or direct Render access) → absolute
  return VITE_API_URL;
}

export const API_BASE = resolveApiBase();

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
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
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
    const path = queryKey.join("/") as string;
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const fullUrl = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const res = await fetch(fullUrl, { headers });

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
