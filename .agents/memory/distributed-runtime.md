---
name: Distributed runtime architecture
description: How InstanceManager/ClusterManager/shared-services layer on top of GameRoom; key naming conventions and constraints.
---

## Core files

- `server/instance-manager.ts` — `InstanceManager` singleton (`instanceManager`). The authoritative owner of all live `GameRoom` instances. Routes.ts MUST use it; never create `GameRoom` directly.
- `server/cluster-manager.ts` — `ClusterManager` singleton (`clusterManager`). Tracks which cluster tier each session belongs to; call `registerInstance` on room creation, `updatePlayerCount` on join/leave, `unregisterInstance` on terminate.
- `server/shared-services.ts` — `matchmaking`, `platformChat`, `avatarService`, `serverMetrics`, `PHYSICS_PRESETS`.
- `server/state-snapshot.ts` — `GameSnapshot` type + `computeDelta`/`applyDelta`/`serialize`/`deserialize`.

## GameRoom lifecycle methods (added)

- `setTickRate(hz)` — hot-change simulation rate (1–120 Hz). Restarts the `setInterval`.
- `pause()` — stops the tick loop (for sleep). Alias of the old `stop()`.
- `resume()` — restarts the tick loop (for wake).
- `setInterestRadius(units)` — configures interest-based simulation radius. 0 = disable.
- `getPhysicsSnapshot()` — returns a `GameSnapshot` (for InstanceManager sleep). NOT the same as `getSnapshot(localPlayerId)` which returns a `RenderState` for WS init messages.
- `loadPhysicsSnapshot(snap)` — restores positions/velocities on warm wake.

**Why two snapshot methods?** `getSnapshot(playerId)` is the existing WS init message (RenderState). `getPhysicsSnapshot()` is the sleep/wake serialization (GameSnapshot). Naming must not collide.

## Routes.ts changes

- `gameRooms` Map and `gameIdToSessions` Map are **removed**. All room access goes through:
  - `getOrCreateRoom(sessionId, gameId)` → `instanceManager.getOrWakeInstance(...)`
  - `getRoom(sessionId)` → `instanceManager.getRoom(sessionId)`
- Hot-reload uses `instanceManager.getSessionsForGame(gameId)` + `instanceManager.reloadScripts()`.
- On player join: call `instanceManager.onPlayerCountChanged(sessionId, room.playerCount)` + `clusterManager.updatePlayerCount()`.
- On player leave: same two calls but with the post-remove count.

## Interest-based simulation

In `_tick()` step 6, every dynamic object checks whether it is within `interestRadius` units of any player. If no player is nearby, the physics tick is skipped (position/velocity unchanged). This freezes out-of-range objects without clearing their state.

## New API endpoints

- `GET /api/instances` — all instances summary + stats
- `GET /api/instances/:sessionId` — one instance detail
- `DELETE /api/instances/:sessionId` — force-terminate
- `GET /api/clusters` — load report + predictive warm list
- `POST /api/matchmaking/enqueue` — join queue
- `GET /api/matchmaking/queue/:gameId` — view queue
- `POST /api/matchmaking/match` — resolve a ticket
- `GET /api/shared/chat/:channel` — chat history
- `POST /api/shared/chat/:channel` — publish message
- `GET /api/avatars/:userId` — avatar config
- `PATCH /api/avatars/:userId` — update avatar
- `GET /api/avatars/:userId/inventory` — inventory
- `GET /api/physics-presets` — 6 named physics configs
- `GET /api/metrics` — counters/gauges + instance summary
