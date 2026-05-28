---
name: Auth architecture
description: How authentication works end-to-end — token storage, middleware, and the assets upload auth fix.
---

## Token flow
1. User logs in via `POST /api/login` → server returns a `token` (UUID)
2. Client stores token in `localStorage.getItem("auth_token")`
3. All `apiRequest()` calls in `queryClient.ts` include `Authorization: Bearer <token>`
4. `isAuthenticated` middleware in `server/replitAuth.ts` checks in-memory `activeSessions` map first, then falls back to Neon DB (`sessions` table) — so tokens survive server restarts

## Session persistence
- Sessions are written to `sessions` table in Neon on login/register
- `getSessionFromToken()` re-populates `activeSessions` from DB on cache miss
- Password hashes stored as `sessions` rows with key `pwd_<userId>` (workaround — no separate password column on users table)

## Fixed auth bugs (2025-05)
- `POST /api/assets/upload` was missing `isAuthenticated` middleware — added
- Raw `fetch("/api/assets/upload", ...)` in `Editor.tsx` was missing `Authorization` header — fixed by reading `localStorage.getItem("auth_token")` and setting the header

**Why the raw fetch needed fixing:** The file upload uses `FormData` which prevents using the standard `apiRequest()` wrapper (which sets `Content-Type: application/json`). So a raw fetch is necessary, but auth must be added manually.

## Key warning
Any new protected route added to `server/routes.ts` MUST include `isAuthenticated` as the first middleware before any body-parsing middleware (multer, etc.). Order matters.
