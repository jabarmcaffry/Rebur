// docs.ts — DEFAULT_SCRIPT + full SCRIPTING_DOCS

export const DEFAULT_SCRIPT = `// Scripts run server-side in a secure sandbox.
// Rebur is the only global — everything hangs off it.

// Example: spin an entity every frame
let angle = 0;
Rebur.on("tick", (dt) => {
  angle += dt * 2;
  const spinner = Rebur.Workspace.find("Part");
  if (spinner) spinner.rotation = { x: 0, y: angle, z: 0 };
});

// Example: react when a player touches an entity
const lava = Rebur.Workspace.find("Lava");
if (lava) {
  lava.on("touched", (other) => {
    if (other.isPlayer) {
      other.health -= 25;
      log(other.username, "hit lava! HP:", other.health);
    }
  });
}
`;

export const SCRIPTING_DOCS = `# Rebur Engine — Scripting Reference

All scripts currently run **server-side** inside a secure VM sandbox. The only global is **\`Rebur\`** — every subsystem hangs off it. Scripts cannot access the file system, Node.js internals, or the network directly.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Script Contexts](#script-contexts)
3. [Execution Model](#execution-model)
4. [Rebur Global Events](#rebur-global-events)
5. [Entities](#entities)
6. [Entity Properties](#entity-properties)
7. [Entity Physics Body](#entity-physics-body)
8. [Entity Events](#entity-events)
9. [Rebur.Workspace — Entity Container](#reburworkspace)
10. [Entity Lifetime & Validity](#entity-lifetime--validity)
11. [Rebur.Players — Player Entities](#reburplayers)
12. [Player Entity](#player-entity)
13. [Player GUI (per-player)](#player-gui)
14. [Player Data](#player-data)
15. [Player Animator](#player-animator)
16. [Rebur.State — Shared Session State](#reburstate)
17. [Rebur.DataStore — Persistent Storage](#reburdatastore)
18. [Rebur.Gui — Global HUD](#reburgui)
19. [Rebur.Sound — Audio](#rebursound)
20. [Rebur.Tween — Property Animation](#reburtween)
21. [Rebur.Camera — Camera Control](#reburcamera)
22. [Rebur.Input — Keyboard & Mouse](#reburinput)
23. [Rebur.Physics — Global Physics](#reburglobal-physics)
24. [Rebur.RunService — Game Loop](#reburrunservice)
25. [Rebur.Network — Multiplayer](#reburnetwork)
26. [Rebur.Tags — Tag System](#reburtags)
27. [Timers](#timers)
28. [Logging](#logging)
29. [Vector3 & Color3](#vector3--color3)
30. [Quick Start Examples](#quick-start-examples)

---

## Architecture

\`\`\`
Rebur                      ← single global
├── Workspace              ← live 3D world: rendered + simulated entities
├── Lighting               ← lighting entity container (not simulated)
├── Players                ← active player entities; StarterCharacter & StarterInventory set defaults
├── Assets
│   ├── Shared             ← assets replicated to all clients (add your own folders via +)
│   └── Server             ← server-only assets, never sent to clients (add folders via +)
├── Systems                ← global server-authoritative scripts (round manager, spawn logic…)
├── State                  ← shared session key-value store (resets each session)
├── DataStore              ← persistent cross-session storage
├── Gui                    ← shared HUD render layer (all players see)
├── Sound                  ← audio playback
├── Tween                  ← property animation
├── Camera                 ← camera control
├── Input                  ← per-player keyboard/mouse events
├── Physics                ← global physics settings
├── RunService             ← game loop phase channels
├── Network                ← data/event bus (server ↔ clients)
└── Tags                   ← entity labeling; query via Workspace.query

player                  ← a PlayerEntity (also an Entity)
├── player.gui          ← per-player private HUD render layer
├── player.data         ← per-player persistent data store
├── player.animator     ← skeletal animation controller
├── player.inventory    ← item inventory
├── player.motors       ← body-slot attachments
└── player.input        ← per-player key held state + edge events
\`\`\`

**Key rules:**
- \`Rebur\` is the **primary** engine global — all subsystems hang off it. No \`Workspace\`, \`Players\`, \`gui\`, \`game\`, etc. as bare globals.
- A small safe **utility global set** is also exposed: \`after\`, \`every\`, \`wait\`, \`Vector3\`, \`Color3\`, \`log\`, \`warn\`, \`error\`, \`random\`, \`randInt\`, \`pick\`. Everything else requires \`Rebur.\`.
- All entities (including players) share the same base API — players are entities with \`isPlayer = true\`.
- Cross-container interaction is **explicit** — there is no hidden magic coupling.
- Single access pattern everywhere: \`Rebur.Workspace.find("name")\`, \`Rebur.Players.get(id)\`.

---

## Script Contexts

Rebur scripts currently execute in a **server-side** context. This is intentional — the server is the authority on all game state, which prevents cheating and keeps the model simple.

### Current: Server Scripts (all scripts today)

- Run on the server, have full access to all \`Rebur.*\` APIs.
- Entity positions, physics, health, inventory — all authoritative here.
- What you write today is a server script.

### Client-Bound APIs (currently server-proxied)

Some APIs are conceptually **per-player/client** but are currently bridged through the server:

| API | Concept | Current behaviour |
|-----|---------|-------------------|
| \`Rebur.Input\` | Per-player keyboard/mouse | Server receives player input events, forwarded to scripts |
| \`Rebur.Camera\` | Per-player camera | Server sets camera params, pushed to each client |
| \`Rebur.Network.send()\` | Server → all clients / client → server | Symmetric: same method name on both sides |
| \`Rebur.Network.on()\` | Receive messages | Server: receives from clients. Client (LocalScript): receives from server |
| \`player.gui\` | Per-player UI | Server calls it, engine routes to the correct client |

> **Why this matters:** \`Rebur.Input.on("press", (player, key) => {})\` fires on the server when **any** player presses a key. The callback always tells you which player acted so you can apply effects correctly.

### Replication Rules (what syncs automatically)

| What | Replicates? | Notes |
|------|-------------|-------|
| Entity position/rotation/scale | ✓ Auto | Synced to all clients every frame |
| Entity visible / color / transparency | ✓ Auto | Property changes propagate |
| Player health / speed / jumpPower | ✓ Auto | Visible to all clients |
| \`Rebur.State\` values | ✓ Auto | Broadcast to all clients |
| \`Rebur.DataStore\` writes | Server-only | Persisted but not broadcast |
| \`Rebur.Gui.text()\` | ✓ Shared | All players see it |
| \`player.gui.text()\` | ✓ Private | Only that player sees it |
| \`Rebur.Sound.play()\` | ✓ Shared | All players hear it |
| Runtime entity creation | ✓ Auto | Visible to all clients |

### Entity Ownership Model

Every entity has an **owner**. The owner is the only authority allowed to write replicated properties; writes from non-owners are ignored on the remote side.

| Owner | Value | Who sets it |
|-------|-------|-------------|
| Server | \`"server"\` | Default for all entities |
| Specific player | player \`id\` string | \`entity.owner = player.id\` in a server script |

**Ownership rules (current):**
- All entities start server-owned.
- The server can transfer ownership at any time: \`entity.owner = player.id\`.
- Only one owner at a time — no shared ownership.
- When the owning player disconnects, ownership returns to \`"server"\` automatically.
- A server script can always read \`entity.owner\` to check who controls it.

**What "server is the authority" means in practice:**

\`\`\`
Server writes entity.position  →  replicates to all clients ✓
Client (LocalScript) reads it  →  always reflects the latest server value ✓
Client writes entity.position  →  no authority; overwritten by next server tick ✗
\`\`\`

**No client-side prediction.** The engine uses pure server authority — clients show what the server says, with interpolation for smoothness. There is no prediction, no rollback, and no reconciliation step. This keeps the model simple and cheat-resistant, at the cost of slightly higher perceived latency on fast interactions (e.g. jump response).

### Client-Side Interpolation

Clients do **not** receive a raw position stream. The engine interpolates entity transforms between server snapshots so motion appears smooth even at 20 Hz server tick rate.

\`\`\`
Server tick rate:    ~20 Hz  (50 ms per tick)
Interpolation buffer: 1–2 snapshots (~50–100 ms of buffered history)
Client render rate:  browser frame rate (60+ Hz)
Visible latency:     ~50–100 ms behind true server state
\`\`\`

What this means for your scripts:
- Rapid position changes (teleports) will still be snappy — the interpolation buffer is short.
- Smooth physics motion (balls, projectiles) will appear fluid even over a moderate connection.
- There is no client-side extrapolation; if packets are lost, the entity holds its last interpolated position until the next snapshot arrives.

### LocalScript (Client-Side)

A \`LocalScript\` placed in the **StarterPlayer** container runs in each player's browser. Use it for:
- **Client → server messaging** — send events up to the server via \`Rebur.Network.send()\`
- **Server → client reactions** — receive data events from the server via \`Rebur.Network.on()\`
- **Per-frame client logic** — \`Rebur.on("tick", fn)\` runs at browser frame rate

LocalScripts do **not** have authority over game state. All gameplay logic (health, position, inventory, physics) runs on the server. LocalScripts are a communication layer, not a game logic layer.

See the **LocalScript** section at the end of this reference for the full API.

---

## Execution Model

Scripts load once when Play starts. Top-level code runs immediately; ongoing logic is driven by event handlers.

\`\`\`js
// Top-level — runs ONCE when the script loads
log("Script started!");

// Global tick — called every physics step (~20 Hz)
Rebur.on("tick", (dt) => {
  // dt ≈ 0.05 s (seconds since last step)
});

// Entity event — must get a reference first
const coin = Rebur.Workspace.find("Coin");
if (coin) {
  coin.on("touched", (other) => {
    log("Coin touched by", other.name);
  });
}
\`\`\`

**Key principle:** Avoid blocking loops (\`while(true)\`). Use events and timers instead.

---

## Rebur Global Events

Subscribe with \`Rebur.on(event, handler)\`. Returns an unsubscribe function.

| Event | When | Handler receives |
|-------|------|-----------------|
| \`"tick"\` | Every physics step (~20 Hz) | \`dt\` (seconds) |
| \`"playerJoined"\` | A player connects | \`player\` entity |
| \`"playerLeft"\` | A player disconnects | \`player\` entity |
| \`"playerDied"\` | A player's health reaches 0 | \`player\` entity |
| \`"playerRespawned"\` | A player respawns | \`player\` entity |
| \`"entityAdded"\` | Any entity added to the world | \`entity\` |
| \`"entityRemoved"\` | Any entity removed from the world | \`entity\` |

\`\`\`js
Rebur.on("tick", (dt) => {
  // runs every physics step
});

Rebur.on("playerJoined", (player) => {
  log(player.username, "joined!");
  player.gui.text("welcome", "Welcome, " + player.username + "!", {
    anchor: "tc", y: 20, size: 20, color: "#4ade80",
  });
  after(3, () => player.gui.clear("welcome"));
});

Rebur.on("playerLeft", (player) => {
  log(player.username, "left");
});

Rebur.on("playerDied", (player) => {
  log(player.username, "died");
});

Rebur.on("playerRespawned", (player) => {
  log(player.username, "respawned at", player.position.y);
});

const unsub = Rebur.on("entityAdded", (entity) => {
  log("new entity:", entity.name);
});
unsub(); // stop listening
\`\`\`

---

## Entities

**Everything in the Rebur world is an entity** — parts, models, players, lights, audio sources. They all share the same base API. Players are entities with \`isPlayer = true\`.

Entities are identified by:
- **\`id\`** — immutable unique string (use for long-lived references)
- **\`name\`** — mutable display name (use for lookup by \`Rebur.Workspace.find()\`)
- **hierarchy** — parent/child relationships

\`\`\`js
const part = Rebur.Workspace.find("Platform");
if (!part) return; // always guard — entity may not exist

log(part.id);       // "abc-123" (immutable)
log(part.name);     // "Platform"
log(part.type);     // "primitive", "model", "light", "audio", etc.
log(part.isPlayer); // false for non-player entities
\`\`\`

---

## Entity Properties

All properties use **lowercase camelCase**. Readable and writable unless noted.

### position · rotation · scale

Transforms (\`position\`, \`rotation\`, \`scale\`) are **mutable proxied objects**. You can mutate individual axes in-place **or** assign a whole new object — both are valid and both replicate to clients.

\`\`\`js
const e = Rebur.Workspace.find("Part");

// Read individual axes
log(e.position.x, e.position.y, e.position.z);

// Mutate in place — fine, changes replicate
e.position.y = 5;
e.rotation.y += 0.1;        // good for incremental tick updates
e.scale.x    = 2;

// Assign a whole new object — also fine
e.position = { x: 0, y: 5, z: 0 };
e.rotation = { x: 0, y: Math.PI / 2, z: 0 }; // radians
e.scale    = { x: 2, y: 2, z: 2 };
\`\`\`

> **Pick one style and be consistent.** Mixing both in the same script is fine — the engine treats them identically. Tweens mutate in-place, which is why \`Rebur.Tween(entity.position, { y: 5 }, 2)\` works — it receives the live proxied object and writes to it over time.

> **Players are an exception.** \`player.position\` and \`player.rotation\` are **read-only** — see [Player transform restrictions](#player-transform-restrictions).

### color · visible · transparency

\`\`\`js
e.color        = "#ff0000";        // CSS hex, rgb(), named
e.visible      = false;            // hide
e.transparency = 0.5;              // 0 = opaque, 1 = invisible
\`\`\`

### name *(read/write)*, id · type *(read-only)*

\`\`\`js
log(e.id);      // unique id — never changes
log(e.name);    // display name
log(e.type);    // "primitive" | "model" | "light" | "audio" | ...
e.name = "NewName"; // rename (updates Rebur.Workspace.find results)
\`\`\`

### isPlayer *(read-only)*

\`\`\`js
entity.on("touched", (other) => {
  if (other.isPlayer) {
    other.health -= 10;
  }
});
\`\`\`

---

## Entity Physics Body

Physics lives on \`entity.body\`. Direct velocity assignment is gone — use forces/impulses for realistic results that scale to vehicles and complex simulations.

### body properties

| Property | Type | Description |
|----------|------|-------------|
| \`body.anchored\` | boolean | Static collider (no physics movement) |
| \`body.canCollide\` | boolean | Participates in collision detection |
| \`body.mass\` | number | Mass in kg (default 1) |
| \`body.friction\` | number | Surface friction (default 0.5) |
| \`body.restitution\` | number | Bounciness 0–1 (default 0) |
| \`body.isKinematic\` | boolean | Script-moved; not affected by forces |
| \`body.isTrigger\` | boolean | Detects overlaps but no collision response |
| \`body.velocity\` | \`{x,y,z}\` | Current velocity (read-only) |

\`\`\`js
const ball = Rebur.Workspace.find("Ball");

ball.body.anchored     = false;
ball.body.mass         = 2;
ball.body.friction     = 0.3;
ball.body.restitution  = 0.8;   // very bouncy
ball.body.isKinematic  = false;
ball.body.isTrigger    = false;  // solid collision
\`\`\`

### body methods

\`\`\`js
// Continuous force (applied each frame, good for constant pushes)
ball.body.applyForce({ x: 0, y: 50, z: 0 });

// Instant impulse (one-shot velocity change, good for launches)
ball.body.applyImpulse({ x: 0, y: 10, z: 0 });
\`\`\`

\`\`\`js
// Launch a cannonball
const cannon = Rebur.Workspace.create({
  name: "Cannonball",
  primitiveType: "sphere",
  position: { x: 0, y: 3, z: 0 },
  color: "#333333",
});
cannon.body.anchored = false;
cannon.body.mass = 5;
cannon.body.applyImpulse({ x: 0, y: 5, z: -20 }); // launch forward-up
\`\`\`

---

## Entity Events

### entity.on(event, handler) → unsubscribe

#### Overlap events: touched / untouched

\`"touched"\` and \`"untouched"\` are **overlap events**. They fire when the bounding volumes of two entities intersect, regardless of whether either entity is a solid collider or a trigger.

- **Trigger entity** (\`body.isTrigger = true\`): overlapping entities pass through with no physical response. Only \`touched\`/\`untouched\` fire. Use for pickup zones, damage zones, checkpoints.
- **Solid entity** (\`body.isTrigger = false\`, default): physical collision response happens. Both \`touched\`/\`untouched\` AND \`collisionStarted\`/\`collisionEnded\` fire.

\`\`\`
Event              Trigger entity    Solid entity
─────────────────────────────────────────────────
touched            ✓ overlap starts  ✓ contact starts
untouched          ✓ overlap ends    ✓ contact ends
collisionStarted   ✗ never           ✓ physical impact (+ impulse)
collisionEnded     ✗ never           ✓ physical separation
\`\`\`

**Rule of thumb:**
- Use \`touched\`/\`untouched\` for **gameplay logic** — item pickup, damage, checkpoints, shops.
- Use \`collisionStarted\` for **impact-dependent logic** — breakable objects, impact sounds based on force, shatter thresholds.

\`\`\`js
// Damage zone — trigger, gameplay logic → use touched
const lava = Rebur.Workspace.find("Lava");
lava.body.isTrigger = true;

lava.on("touched", (other) => {
  if (other.isPlayer) other.health -= 25;
});
lava.on("untouched", (other) => {
  // player left the lava zone — stop damage
});

// Breakable crate — solid, impact-dependent → use collisionStarted
const crate = Rebur.Workspace.find("Crate");

crate.on("collisionStarted", (other, impulse) => {
  if (impulse > 15) {
    crate.destroy();
    Rebur.Sound.play("break");
  }
});
\`\`\`

#### Full event table

| Event | Fires when | Handler receives | Trigger? | Solid? |
|-------|-----------|-----------------|----------|--------|
| \`"touched"\` | Overlap/contact starts | \`other: Entity\` | ✓ | ✓ |
| \`"untouched"\` | Overlap/contact ends | \`other: Entity\` | ✓ | ✓ |
| \`"collisionStarted"\` | Physical impact begins | \`other: Entity\`, \`impulse: number\` | ✗ | ✓ |
| \`"collisionEnded"\` | Physical separation | \`other: Entity\` | ✗ | ✓ |
| \`"clicked"\` | Player clicks this entity in 3D view | \`player: PlayerEntity\` | — | — |
| \`"destroyed"\` | Entity is destroyed | — | — | — |
| *(custom)* | Your script calls \`.emit()\` | your args | — | — |

\`\`\`js
const unsub = entity.on("touched", (other) => {
  if (other.isPlayer) other.health -= 25;
});
unsub(); // stop listening
\`\`\`

\`\`\`js
// Cross-container interaction — explicit, no magic
const coin = Rebur.Workspace.find("Coin");
coin.on("touched", (other) => {
  if (other.isPlayer) {
    // explicit reference — no implicit link between containers
    const player = Rebur.Players.get(other.id);
    if (player) {
      player.inventory.add("Coin", { count: 1 });
      coin.visible = false;
      after(3, () => { coin.visible = true; });
    }
  }
});
\`\`\`

### entity.off(event, handler)

\`\`\`js
function onTouch(other) { log("touched!"); }
entity.on("touched", onTouch);
entity.off("touched", onTouch);
\`\`\`

### entity.emit(event, ...args)

Fire a custom event on **this entity only**. All listeners registered with \`.on()\` on the same entity and same event name are called synchronously.

**Scope: local entity, current server tick only.**
- Does **not** propagate to other entities (no parent/child bubbling).
- Does **not** cross the network — other clients do not receive it.
- Does **not** persist — listeners added after \`emit\` is called will not see past events.

\`\`\`js
entity.on("Open", (speed) => {
  log("Opening at speed", speed);
});

entity.emit("Open", 2);
// Only listeners registered on THIS entity's "Open" event are called.
// No other entity, player, or client sees this signal.
\`\`\`

To signal across the network (server → clients or client → server), use \`Rebur.Network.send()\` or \`Rebur.Network.sendTo()\`.

---

## Rebur.Workspace

The live 3D world container. All rendered, simulated entities live here.

### Rebur.Workspace.find(name) → entity | null

The **one** way to look up an entity by name.

\`\`\`js
const part = Rebur.Workspace.find("Platform");
if (!part) { log("Platform not found"); return; }

part.position = { x: 0, y: 5, z: 0 };
\`\`\`

### Rebur.Workspace.get(id) → entity | null

Look up an entity by its immutable id.

\`\`\`js
const id = entity.id; // store the id
// ... later ...
const ref = Rebur.Workspace.get(id);
\`\`\`

### Rebur.Workspace.all() → entity[]

All entities currently in the scene.

\`\`\`js
const all = Rebur.Workspace.all();
log("Scene has", all.length, "entities");
\`\`\`

### Rebur.Workspace.query(filter) → entity[]

Filter entities by one or more criteria. More efficient than \`.all().filter()\` for large worlds — only matching entities are returned.

\`\`\`js
// By tag
const enemies = Rebur.Workspace.query({ tag: "enemy" });

// By type
const lights = Rebur.Workspace.query({ type: "light" });

// By multiple tags (AND — entity must have all)
const bosses = Rebur.Workspace.query({ tags: ["enemy", "boss"] });

// By custom predicate
const heavy = Rebur.Workspace.query({ where: (e) => e.body.mass > 10 });

// Combined
const activeEnemies = Rebur.Workspace.query({
  tag: "enemy",
  where: (e) => e.visible,
});

// Limit results
const firstFive = Rebur.Workspace.query({ tag: "coin", limit: 5 });
\`\`\`

### Rebur.Workspace.raycast(origin, direction, opts?) → RaycastResult | null

Cast a ray from a point in a direction and return the first entity hit.

\`\`\`js
// Cast downward from above a point
const hit = Rebur.Workspace.raycast(
  { x: 0, y: 20, z: 0 },
  { x: 0, y: -1, z: 0 }
);

if (hit) {
  log("Hit:", hit.entity.name, "at distance", hit.distance);
  log("Hit position:", hit.point.x, hit.point.y, hit.point.z);
  log("Hit normal:", hit.normal.x, hit.normal.y, hit.normal.z);
}

// With options
const hit2 = Rebur.Workspace.raycast(
  player.position,
  { x: 0, y: 0, z: -1 },
  {
    maxDistance: 50,          // default: 500
    ignore: [player],         // skip these entities
    tag: "enemy",             // only hit entities with this tag
  }
);
\`\`\`

### Rebur.Workspace.create(opts) → entity

Spawn a new entity at runtime.

\`\`\`js
const bomb = Rebur.Workspace.create({
  name: "Bomb",
  primitiveType: "sphere",     // "cube" | "sphere" | "cylinder" | "plane"
  position: { x: 0, y: 10, z: 0 },
  scale:    { x: 1, y: 1, z: 1 },
  color: "#222222",
});
bomb.body.anchored = false;
bomb.body.mass = 3;
\`\`\`

> Runtime-created entities are not saved to the game — they exist only for the current Play session.

### entity.destroy()

\`\`\`js
const wall = Rebur.Workspace.find("OldWall");
if (wall) wall.destroy();
\`\`\`

---

## Entity Lifetime & Validity

Entities can be destroyed at any time — by scripts, by collisions, or by the engine. A **stale reference** is a variable that holds an entity that no longer exists.

### entity.destroyed *(read-only boolean)*

Every entity has a \`destroyed\` property. It is \`false\` while the entity is alive and becomes \`true\` immediately when \`entity.destroy()\` is called or the engine removes it.

\`\`\`js
const enemy = Rebur.Workspace.find("Enemy");

after(5, () => {
  if (enemy && !enemy.destroyed) {
    enemy.destroy();
  }
});
\`\`\`

### Calling methods on a destroyed entity

The behaviour depends on the environment:

| Environment | On destroyed entity access | Why |
|-------------|---------------------------|-----|
| **Development** (\`NODE_ENV !== "production"\`) | **Throws an error** | Catches bugs immediately — no silent failures |
| **Production** | Warn + no-op | Prevents crashes from race conditions in live games |

**Development error example:**
\`\`\`
Error: on() called on destroyed entity "Enemy"
\`\`\`

This design means you find stale-reference bugs during development, before players hit them. The production fallback (warn + no-op) keeps a race condition from crashing an otherwise healthy game session.

**The most common race condition:** two events fire in the same physics step and both try to destroy the same entity. Guard against it:

\`\`\`js
coin.on("touched", (other) => {
  if (coin.destroyed) return;  // guard first
  // ... safe to proceed
});
\`\`\`

### Safe patterns

\`\`\`js
// Pattern 1: guard before use (recommended for long-lived refs)
const coin = Rebur.Workspace.find("Coin");

every(1, () => {
  if (!coin || coin.destroyed) return; // entity was destroyed, skip
  coin.rotation.y += 0.1;
});

// Pattern 2: re-find each time (safe but slower)
Rebur.on("tick", (dt) => {
  const coin = Rebur.Workspace.find("Coin"); // null if destroyed
  if (coin) coin.rotation.y += dt;
});

// Pattern 3: listen for "destroyed" event to clean up
const enemy = Rebur.Workspace.find("Enemy");
if (enemy) {
  enemy.on("destroyed", () => {
    log("Enemy was destroyed — cleaning up");
    // remove timers, clear GUI, etc.
  });
}
\`\`\`

### entity.destroyed in touch/collision handlers

Touch handlers can fire for already-destroyed entities in the same physics step (two entities destroyed in the same frame). Always guard:

\`\`\`js
coin.on("touched", (other) => {
  if (coin.destroyed) return;   // already picked up this frame
  if (!other.isPlayer) return;

  coin.visible = false;
  coin.body.canCollide = false;
  // ... give item ...
  after(3, () => { coin.visible = true; coin.body.canCollide = true; });
});
\`\`\`

### Entity hierarchy

\`\`\`js
const parent = Rebur.Workspace.find("Platform");
const child  = Rebur.Workspace.find("Coin");

child.setParent(parent);        // attach to parent
log(child.parent?.name);        // "Platform"
log(parent.children.length);    // includes child

parent.find("Coin");            // find child by name
parent.children;                // direct children array
\`\`\`

---

## Rebur.Players

The player entity container. Players are entities — they have all entity properties plus player-specific ones.

### Rebur.Players.all() → player[]

\`\`\`js
const players = Rebur.Players.all();
log("Players online:", players.length);

for (const p of players) {
  log(p.username, "at y =", p.position.y);
}
\`\`\`

### Rebur.Players.find(username) → player | null

\`\`\`js
const alice = Rebur.Players.find("Alice");
if (alice) alice.health -= 10;
\`\`\`

### Rebur.Players.get(id) → player | null

Look up by immutable id — safest for cross-container references.

\`\`\`js
entity.on("touched", (other) => {
  if (other.isPlayer) {
    const player = Rebur.Players.get(other.id);
    if (player) player.health = Math.min(player.health + 20, player.maxHealth);
  }
});
\`\`\`

---

## Player Entity

A player is an entity with \`isPlayer = true\` plus the following additional properties and methods.

### Player Properties

| Property | Type | Read | Write | Description |
|----------|------|------|-------|-------------|
| \`id\` | string | ✓ | — | Immutable session id |
| \`username\` | string | ✓ | — | Display name |
| \`isPlayer\` | boolean | ✓ | — | Always \`true\` |
| \`position\` | \`{x,y,z}\` | ✓ | ✓ | World position (write teleports immediately) |
| \`rotation\` | \`{x,y,z}\` | ✓ | — | Rotation (radians) |
| \`respawn\` | boolean | — | ✓ | Set \`true\` to respawn to spawnPoint |
| \`health\` | number | ✓ | ✓ | Current HP (0–maxHealth) |
| \`maxHealth\` | number | ✓ | ✓ | Max HP (default 100) |
| \`walkSpeed\` | number | ✓ | ✓ | Walk speed (default 6) |
| \`runSpeed\` | number | ✓ | ✓ | Run speed when Shift held (default 12) |
| \`jumpPower\` | number | ✓ | ✓ | Jump force (default 8) |
| \`spawnPoint\` | \`{x,y,z}\` | ✓ | ✓ | Respawn position |
| \`inventory\` | Inventory | ✓ | — | Item inventory |
| \`gui\` | PlayerGuiAPI | ✓ | — | Private per-player HUD |
| \`data\` | PlayerDataAPI | ✓ | — | Persistent per-player storage |
| \`animator\` | AnimatorAPI | ✓ | — | Animation controller |
| \`motors\` | MotorAPI | ✓ | — | Body-slot attachment |
| \`input\` | PlayerInputAPI | ✓ | — | Per-player held keys + edge events |
| \`color\` | string | ✓ | ✓ | Shirt color |

### Player Transform

Player \`position\` is **writable** — assigning it instantly moves the player:

\`\`\`js
// ✓ Move player to a specific location
player.position = { x: 0, y: 10, z: 0 };

// ✓ Read current position at any time
log(player.position.x, player.position.y, player.position.z);
\`\`\`

Movement parameters update the controller and take effect immediately:

\`\`\`js
player.walkSpeed = 12;
player.runSpeed  = 24;
player.jumpPower = 15;
\`\`\`

### Respawn

Set \`player.respawn = true\` to teleport the player to their \`spawnPoint\` and restore full health:

\`\`\`js
// Change spawn location first (optional)
player.spawnPoint = { x: 50, y: 5, z: 0 };
// Trigger the respawn
player.respawn = true;
\`\`\`

### Health system

Set \`player.health\` directly:

\`\`\`js
player.health -= 25;          // deal 25 damage
player.health += 20;          // restore 20 HP (won't exceed maxHealth automatically — clamp yourself if needed)
player.health = 0;            // instant death
player.health = player.maxHealth;  // full heal
\`\`\`

When health reaches 0 the engine automatically:
1. Fires \`Rebur.on("playerDied", fn)\`
2. Respawns the player at their \`spawnPoint\`
3. Restores full health
4. Fires \`Rebur.on("playerRespawned", fn)\`

\`\`\`js
const trap = Rebur.Workspace.find("Trap");
trap.on("touched", (other) => {
  if (other.isPlayer) other.health -= 50;
});

Rebur.on("playerDied", (player) => {
  log(player.username, "died");
});
\`\`\`

### Player Inventory

\`\`\`js
player.inventory.add("Sword", { count: 1, data: { damage: 10 } });
player.inventory.remove("Sword");
player.inventory.has("Sword");              // boolean
player.inventory.get("Sword");             // InventoryItem | null
player.inventory.equip("Sword");           // equip
player.inventory.equip(null);              // unequip
player.inventory.drop("Sword");            // drop item, spawn entity
player.inventory.clear();
player.inventory.items;                    // InventoryItem[]
player.inventory.equipped;                 // InventoryItem | null
player.inventory.maxSlots;                 // number
\`\`\`

### Player Motors (body-slot attachments)

\`\`\`js
const sword = Rebur.Workspace.find("Sword");
player.motors.attach("rightHand", sword, { x: 0, y: 0.05, z: 0.25 });
const held = player.motors.detach("rightHand"); // returns entity
player.motors.get("rightHand");                 // entity | null
// Slots: "rightHand" | "leftHand" | "head" | "back" | "chest"
\`\`\`

---

## Player Input

**\`player.input\`** — query held keys and listen for edge events for this specific player. This is the correct API for per-player gameplay logic.

### player.input.key(keyName) → boolean

Returns \`true\` if this player is currently holding the given key. Use inside a \`Rebur.on("tick")\` loop for continuous effects.

\`\`\`js
Rebur.on("tick", (dt) => {
  for (const player of Rebur.Players.all()) {
    if (player.input.key("shift")) {
      // Only runs for players actually holding Shift
      player.health -= 0.5 * dt;
    }
  }
});
\`\`\`

### player.input.on(event, fn) → unsubscribe

Listen for a key edge event from this specific player. \`fn\` receives the key name as its only argument — the player is already bound by closure.

\`\`\`js
Rebur.on("playerJoined", (player) => {
  player.input.on("press", (key) => {
    if (key === "e") {
      log(player.username, "pressed E");
    }
  });

  player.input.on("release", (key) => {
    if (key === "shift") {
      log(player.username, "stopped sprinting");
    }
  });
});
\`\`\`

### player.input vs Rebur.Input

| Use case | API |
|----------|-----|
| Held-key poll, single player | \`player.input.key("shift")\` — exactly this player |
| Edge event, single player | \`player.input.on("press", fn)\` — fn(key) |
| Edge event, any player | \`Rebur.Input.on("press", (player, key) => {})\` — fn(player, key) |

---

## Player GUI

**\`player.gui\`** — a private HUD visible **only to that player**. Use this for inventories, health bars, quest logs, shops, notifications, dialogue, and admin panels. Its API is identical to \`Rebur.Gui\` but scoped to one player.

\`Rebur.Gui\` is **shared** — all players see it. Use it for round timers, kill feeds, and scoreboards. Use \`player.gui\` for anything that should differ between players.

\`\`\`js
// Private health bar — only this player sees it
Rebur.on("playerJoined", (player) => {
  player.gui.bar("hp", 100, 100, {
    anchor: "bl", x: 20, y: 20,
    width: 200, height: 16,
    color: "#22c55e", bg: "#374151",
  });

  player.gui.text("coins", "Coins: 0", {
    anchor: "tl", x: 20, y: 20, size: 16,
  });
});

// Update per-player HUD on damage
Rebur.on("playerDied", (player) => {
  player.gui.bar("hp", 0, player.maxHealth);
  player.gui.text("status", "You died!", {
    anchor: "cc", size: 32, color: "#ef4444",
  });
  after(2, () => player.gui.clear("status"));
});
\`\`\`

\`\`\`js
// Shop UI — private dialogue only this player sees
const shopTrigger = Rebur.Workspace.find("ShopZone");
shopTrigger.body.isTrigger = true;

shopTrigger.on("touched", (other) => {
  if (!other.isPlayer) return;
  const player = Rebur.Players.get(other.id);
  if (!player) return;

  player.gui.text("shopTitle", "Shop", { anchor: "cc", y: -80, size: 24 });
  player.gui.button("buySword", "Buy Sword — 50 coins", { anchor: "cc", size: 16 }, () => {
    const coins = player.data.get("coins") ?? 0;
    if (coins >= 50) {
      player.data.set("coins", coins - 50);
      player.inventory.add("Sword");
      player.gui.text("notice", "Sword purchased!", { anchor: "cc", y: 40 });
      after(2, () => player.gui.clear("notice"));
    } else {
      player.gui.text("notice", "Not enough coins!", { anchor: "cc", y: 40, color: "#ef4444" });
      after(2, () => player.gui.clear("notice"));
    }
  });
  player.gui.button("closeShop", "Close", { anchor: "cc", y: 60, size: 14 }, () => {
    player.gui.clear("shopTitle");
    player.gui.clear("buySword");
    player.gui.clear("closeShop");
    player.gui.clear("notice");
  });
});
\`\`\`

### player.gui methods

\`\`\`js
player.gui.text(id, text, opts?)
player.gui.button(id, text, opts?, onClick?)
player.gui.bar(id, value, maxValue, opts?)
player.gui.image(id, url, opts?)
player.gui.clear(id?)              // clear one or all elements
\`\`\`

All opts are the same as \`Rebur.Gui\`:

\`\`\`js
{
  anchor: "tl"|"tc"|"tr"|"cl"|"cc"|"cr"|"bl"|"bc"|"br",
  x: number,       // pixel offset from anchor
  y: number,
  size: number,    // font size
  color: string,   // text / fill color
  bg: string,      // background color
  width: number,
  height: number,
}
\`\`\`

---

## Player Data

**\`player.data\`** — persistent per-player storage backed by \`Rebur.DataStore\`. Values survive between sessions automatically. Use this for coins, XP, unlocks, progression, settings.

\`\`\`js
// Read — returns undefined if key never set
const coins = player.data.get("coins") ?? 0;
const xp    = player.data.get("xp") ?? 0;
const level = player.data.get("level") ?? 1;

// Write — persisted immediately
player.data.set("coins", coins + 10);
player.data.set("xp", xp + 50);

// Increment helper
player.data.increment("coins", 5);      // coins += 5
player.data.increment("deaths");        // deaths += 1

// Delete a key
player.data.delete("tempFlag");

// Read all
const all = player.data.getAll();       // Record<string, any>
\`\`\`

\`\`\`js
// Full progression example
Rebur.on("playerJoined", (player) => {
  const xp    = player.data.get("xp")    ?? 0;
  const level = player.data.get("level") ?? 1;
  const coins = player.data.get("coins") ?? 0;

  player.gui.text("hud_xp",    "XP: " + xp,       { anchor: "tl", x: 20, y: 20 });
  player.gui.text("hud_level", "Level: " + level,  { anchor: "tl", x: 20, y: 40 });
  player.gui.text("hud_coins", "Coins: " + coins,  { anchor: "tl", x: 20, y: 60 });
});

const xpZone = Rebur.Workspace.find("XpZone");
xpZone.on("touched", (other) => {
  if (!other.isPlayer) return;
  const player = Rebur.Players.get(other.id);
  if (!player) return;

  player.data.increment("xp", 25);
  const xp    = player.data.get("xp");
  const level = player.data.get("level") ?? 1;

  if (xp >= level * 100) {
    player.data.set("level", level + 1);
    player.gui.text("levelup", "Level Up!", { anchor: "cc", size: 28, color: "#facc15" });
    after(2, () => player.gui.clear("levelup"));
  }

  player.gui.text("hud_xp", "XP: " + xp, { anchor: "tl", x: 20, y: 20 });
});
\`\`\`

---

## Player Animator

**\`player.animator\`** — skeletal animation controller for humanoid player characters.

\`\`\`js
// Play an animation by name
player.animator.play("Run");
player.animator.play("Jump");
player.animator.play("Idle");

// Stop current animation (returns to idle)
player.animator.stop();

// Transition with blend time (seconds)
player.animator.play("Run", { blend: 0.2 });

// Check current animation
log(player.animator.current);  // "Run"
log(player.animator.playing);  // true

// Events
player.animator.on("done", (name) => {
  log("Animation finished:", name);
});
\`\`\`

### Built-in animation names

| Name | Description |
|------|-------------|
| \`"Idle"\` | Standing still |
| \`"Walk"\` | Walking |
| \`"Run"\` | Running |
| \`"Jump"\` | Jump start |
| \`"Fall"\` | Falling |
| \`"Land"\` | Landing |
| \`"Wave"\` | Emote — wave |
| \`"Dance"\` | Emote — dance |
| \`"Sit"\` | Sitting |

Custom animations can be imported as model assets and referenced by filename.

\`\`\`js
// Trigger an emote on interaction
const dancepad = Rebur.Workspace.find("DancePad");
dancepad.on("touched", (other) => {
  if (!other.isPlayer) return;
  const player = Rebur.Players.get(other.id);
  if (!player) return;

  player.animator.play("Dance", { blend: 0.15 });
  after(4, () => player.animator.play("Idle", { blend: 0.3 }));
});
\`\`\`

---

## Rebur.State

Shared key-value store for **session state** (score, rounds, flags, etc.). Resets when the session ends. Reactive — subscribe to changes.

\`\`\`js
Rebur.State.set("score", 0);
Rebur.State.set("phase", "lobby");

const score = Rebur.State.get("score");
log("Score:", score);

const unsub = Rebur.State.on("score", (newVal, oldVal) => {
  log("Score changed from", oldVal, "to", newVal);
});

Rebur.State.keys();     // string[]
Rebur.State.getAll();   // Record<string, any>
\`\`\`

### State-driven UI (canonical pattern)

**GUI is a render layer. State is the data layer. They should not both be updated from the same line of game logic.**

The correct pattern:
1. **Game logic writes State only** — \`Rebur.State.set("score", n)\`
2. **GUI binds to State** — automatically re-renders when State changes

\`\`\`js
// 1. Declare your State
Rebur.State.set("score", 0);

// 2. Bind GUI to State — runs immediately with the current value,
//    then automatically re-runs every time "score" changes.
Rebur.Gui.bind("scoreLabel", "score", (val) => {
  Rebur.Gui.text("scoreLabel", "Score: " + val, { anchor: "tl", x: 20, y: 20, size: 20 });
});

// 3. Game logic ONLY touches State — GUI updates itself
const coin = Rebur.Workspace.find("Coin");
coin.on("touched", (other) => {
  if (!other.isPlayer) return;
  Rebur.State.set("score", Rebur.State.get("score") + 1); // ← only line needed
  coin.visible = false;
  after(3, () => { coin.visible = true; });
});
\`\`\`

**Why this matters:** if you call \`Rebur.Gui.text("scoreLabel", ...)\` directly in game logic AND have a \`Gui.bind("scoreLabel", ...)\` binding, you get two updates per event. In dev mode the engine throws immediately to catch this; in production it warns and no-ops the direct call. The binding is the only way to keep the element updated.

**Exception — one-shot messages:** Use \`Rebur.Gui.text()\` directly for transient, stateless messages that don't need to survive a state change (countdown announcements, kill feed, etc.):

\`\`\`js
// One-shot OK: this message has no State backing, it's purely ephemeral
Rebur.Gui.text("msg", "GAME OVER", { anchor: "cc", size: 36 });
after(3, () => Rebur.Gui.clear("msg"));
\`\`\`

---

## Rebur.DataStore

Persistent cross-session key-value storage. Values survive server restarts and new sessions. Use for game-wide data like leaderboards, world records, global flags, and persistent world changes.

For per-player data use **\`player.data\`** instead — it's scoped to each player automatically.

\`\`\`js
// Write
Rebur.DataStore.set("worldRecord", { username: "Alice", score: 9999 });
Rebur.DataStore.set("serverLaunchCount", 1);

// Read (returns undefined if not set)
const record = Rebur.DataStore.get("worldRecord");
if (record) log("World record holder:", record.username);

// Increment a number atomically
Rebur.DataStore.increment("totalGamesPlayed");
Rebur.DataStore.increment("totalGamesPlayed", 5);

// Delete
Rebur.DataStore.delete("oldFlag");

// List all keys
const keys = Rebur.DataStore.keys();
\`\`\`

\`\`\`js
// Global leaderboard example
Rebur.on("playerDied", (player) => {
  const score = Rebur.State.get("score") ?? 0;
  const record = Rebur.DataStore.get("highScore") ?? { username: "", score: 0 };

  if (score > record.score) {
    Rebur.DataStore.set("highScore", { username: player.username, score });
    Rebur.Gui.text("record", "New High Score: " + score + " by " + player.username, {
      anchor: "tc", y: 60, size: 18, color: "#facc15",
    });
  }
});
\`\`\`

---

## Rebur.Gui

Screen-space HUD overlay. Elements are **shared — all players see them**. For private per-player UI use **\`player.gui\`** instead.

### Rebur.Gui.text(id, text, opts?)

\`\`\`js
Rebur.Gui.text("label", "Score: 0", {
  anchor: "tl",         // "tl"|"tc"|"tr"|"cl"|"cc"|"cr"|"bl"|"bc"|"br"
  x: 20,               // pixel offset from anchor
  y: 20,
  size: 18,            // font size (px)
  color: "#ffffff",    // text color
  bg: "#00000066",     // optional background
});

// Update later by re-calling with same id
Rebur.Gui.text("label", "Score: 10", { anchor: "tl", x: 20, y: 20 });
\`\`\`

### Rebur.Gui.button(id, text, opts?, onClick?)

\`\`\`js
Rebur.Gui.button("restart", "Restart", {
  anchor: "br", x: 24, y: 24,
  size: 14,
  color: "#ffffff",
  bg: "#3b82f6",
}, () => {
  for (const p of Rebur.Players.all()) p.respawn = true;
});
\`\`\`

### Rebur.Gui.bar(id, value, maxValue, opts?)

\`\`\`js
Rebur.Gui.bar("hp", 100, 100, {
  anchor: "bl", x: 20, y: 20,
  width: 200, height: 16,
  color: "#22c55e",
  bg: "#374151",
});

// Update fill
Rebur.Gui.bar("hp", 75, 100);
\`\`\`

### Rebur.Gui.image(id, url, opts?)

\`\`\`js
Rebur.Gui.image("icon", "/uploads/coin.png", {
  anchor: "tl", x: 20, y: 60,
  width: 48, height: 48,
});
\`\`\`

### Rebur.Gui.clear(id?)

\`\`\`js
Rebur.Gui.clear("label");  // remove one element
Rebur.Gui.clear();          // remove all elements
\`\`\`

### Rebur.Gui.bind(id, stateKey, renderFn) → unsubscribe

Bind a GUI element to a State key. The \`renderFn\` fires immediately with the current value and again every time the state changes. Returns an unsubscribe function to detach the binding.

\`\`\`js
// Score label — always shows the current score
Rebur.State.set("score", 0);
const unbind = Rebur.Gui.bind("score", "score", (val) => {
  Rebur.Gui.text("score", "Score: " + val, { anchor: "tl", x: 20, y: 20, size: 20 });
});

// Health bar — updates whenever health state changes
Rebur.State.set("hp", 100);
Rebur.Gui.bind("hpBar", "hp", (val) => {
  Rebur.Gui.bar("hpBar", val, 100, { anchor: "bl", x: 20, y: 20, width: 200, height: 14, color: "#22c55e" });
});

// Game logic only writes State — GUI updates automatically
Rebur.State.set("score", Rebur.State.get("score") + 1);  // score label refreshes
Rebur.State.set("hp", 75);                                // health bar refreshes
\`\`\`

\`bind\` is the **only** correct way to connect persistent HUD elements to game data. Use \`Rebur.Gui.text()\` directly only for ephemeral one-shot messages.

---

## Rebur.Sound

\`\`\`js
Rebur.Sound.play("collect");

Rebur.Sound.play("hit", {
  volume: 0.5,   // 0.0–1.0, default 1.0
  loop: false,
});

// Built-in ids: "jump" | "land" | "hit" | "collect" | "click"
// Custom: use the filename from an imported audio asset
Rebur.Sound.play("explosion.mp3");

// Stop
Rebur.Sound.stop("collect");
\`\`\`

---

## Rebur.Tween

Smoothly interpolate any numeric properties over time.

\`\`\`js
// Rebur.Tween(target, toProperties, duration, easing?, onDone?) → cancel()
const cancel = Rebur.Tween(entity.position, { x: 10 }, 2, "easeOutQuad");

// Tween position, rotation, scale, transparency, or any numeric property
Rebur.Tween(entity.position, { y: 5 }, 2, "easeInOut");
Rebur.Tween(entity.rotation, { y: Math.PI }, 1, "linear", () => {
  log("Gate opened!");
});

// Chain
Rebur.Tween(entity.position, { y: 10 }, 3, "easeInOut", () => {
  after(2, () => Rebur.Tween(entity.position, { y: 0 }, 3, "easeInOut"));
});
\`\`\`

| Easing | Description |
|--------|-------------|
| \`"linear"\` | Constant speed |
| \`"easeInQuad"\` | Starts slow |
| \`"easeOutQuad"\` | Ends slow (default feel) |
| \`"easeInOutQuad"\` | Slow at both ends |
| \`"easeInCubic"\` / \`"easeOutCubic"\` | Stronger ease |
| \`"bounce"\` | Bounces at end |
| \`"elastic"\` | Spring overshoot |

---

## Rebur.Camera

> **Client-bound API (currently server-proxied).** Camera settings are pushed from the server to all clients each tick. When per-player LocalScripts arrive, each player will have their own camera scope.

\`Rebur.Camera\` is a plain writable object — set any property and it is pushed to clients. There are no built-in camera modes. If you want a follow camera, orbit camera, or cutscene, you write the logic yourself in a tick handler.

\`\`\`js
// Manual scripted camera — set position and look target each tick
Rebur.on("tick", () => {
  const player = Rebur.Players.all()[0];
  if (!player) return;
  Rebur.Camera.position = { x: player.position.x, y: player.position.y + 10, z: player.position.z + 12 };
  Rebur.Camera.lookAt   = { x: player.position.x, y: player.position.y, z: player.position.z };
});

// Static overhead camera
Rebur.Camera.position = { x: 0, y: 40, z: 0 };
Rebur.Camera.lookAt   = { x: 0, y: 0, z: 0 };
Rebur.Camera.fov      = 70; // degrees (optional)
\`\`\`

---

## Rebur.Input

Global input event API. Callbacks receive the **player** who triggered the event. Use this when you want to react to input from **any** player without filtering by who.

For per-player held-key polling and per-player edge events, use **\`player.input\`** instead.

\`\`\`js
// Any player pressed a key — fn(player, key)
const unsub = Rebur.Input.on("press", (player, key) => {
  if (key === "e") log(player.username, "interacted");
});

// Any player released a key — fn(player, key)
Rebur.Input.on("release", (player, key) => {
  if (key === "e") log(player.username, "stopped interacting");
});

// Any player clicked in the 3D viewport — fn(player, entity | null)
Rebur.Input.on("mouseClick", (player, entity) => {
  if (entity) log(player.username, "clicked", entity.name);
  else log(player.username, "clicked sky");
});

// Unsubscribe
unsub();
Rebur.Input.off("press", handler);
\`\`\`

Key names: letters (\`"a"\`–\`"z"\`), \`"space"\`, \`"shift"\`, \`"control"\`, \`"alt"\`, \`"enter"\`, \`"escape"\`, \`"arrowup"\`, \`"arrowdown"\`, \`"arrowleft"\`, \`"arrowright"\`.

### Rebur.Camera.raycast(player, opts?) → RaycastResult | null

A **safe convenience helper** that casts a ray from the player's camera forward and returns the first entity hit. Returns \`null\` if the player has no camera state — it never throws.

\`\`\`js
// ✓ Safe camera-forward raycast (recommended for aim/shoot logic)
Rebur.Input.on("press", (player, key) => {
  if (key !== "f") return;
  const hit = Rebur.Camera.raycast(player, {
    maxDistance: 50,
    ignore: [player],
  });
  if (hit) {
    log("Aim hit:", hit.entity.name, "at", hit.distance.toFixed(1), "units");
    if (Rebur.Tags.has(hit.entity, "enemy")) hit.entity.destroy();
  }
});

// ✗ Don't do this — getForwardRay() can return null, then .origin crashes
// const ray = Rebur.Camera.getForwardRay(player);
// const hit = Rebur.Workspace.raycast(ray.origin, ray.direction); // ERROR if ray is null

// ✓ Use getForwardRay only when you need the raw ray object and guard it:
const ray = Rebur.Camera.getForwardRay(player);
if (ray) {
  const hit = Rebur.Workspace.raycast(ray.origin, ray.direction, { maxDistance: 30 });
}
\`\`\`

---

### Rebur.Input vs player.input

| Need | API |
|------|-----|
| React to any player pressing E | \`Rebur.Input.on("press", (player, key) => {})\` |
| React to one specific player pressing E | \`player.input.on("press", (key) => {})\` inside \`playerJoined\` |
| Check if a specific player holds Shift right now | \`player.input.key("shift")\` |
| 3D viewport click (any player) | \`Rebur.Input.on("mouseClick", (player, entity) => {})\` |

---

## Rebur.Physics (Global Physics)

\`\`\`js
Rebur.Physics.gravity = 9.81;   // m/s² downward (default)
Rebur.Physics.gravity = 0;      // zero-G
Rebur.Physics.airDrag = 0.01;   // global air resistance
\`\`\`

---

## Rebur.RunService

Low-level game loop phase channels. Each phase runs in a fixed order every frame: \`input → animation → replication → physics → render → update\`.

\`\`\`js
const unsub = Rebur.RunService.on("update", (dt) => {
  // post-physics, pre-render — best for scripted movement
});

Rebur.RunService.on("physics", (dt) => {
  // during physics step — apply forces here
});

Rebur.RunService.on("render", (dt) => {
  // just before render — camera/visual tweaks
});

unsub(); // unsubscribe
\`\`\`

---

## Rebur.Network

The Network API is symmetrical across server and client — both sides use the same three methods. Server Scripts and LocalScripts share the same \`Rebur.Network\` interface.

| | Server | Client (LocalScript) |
|---|---|---|
| Send to all | \`Rebur.Network.send(event, payload)\` | — |
| Send to one | \`Rebur.Network.sendTo(player, event, payload)\` | — |
| Send to server | — | \`Rebur.Network.send(event, payload)\` |
| Receive | \`Rebur.Network.on(event, fn)\` | \`Rebur.Network.on(event, fn)\` |

### Server → Clients

\`\`\`js
// Send to ALL connected clients
Rebur.Network.send("roundOver", { winner: "Alice", score: 42 });

// Send to one specific player
Rebur.Network.sendTo(player, "personalMessage", { text: "You won!" });
\`\`\`

### Client → Server (server listens)

\`\`\`js
// Listen for a message sent up from any client
Rebur.Network.on("purchaseRequest", (payload, sender) => {
  // sender is the PlayerEntity who sent this
  log(sender.username, "wants to buy:", payload.item);

  const coins = sender.data.get("coins") ?? 0;
  if (coins >= payload.cost) {
    sender.data.set("coins", coins - payload.cost);
    sender.inventory.add(payload.item);
    Rebur.Network.sendTo(sender, "purchaseResult", { success: true, item: payload.item });
  } else {
    Rebur.Network.sendTo(sender, "purchaseResult", { success: false, reason: "Not enough coins" });
  }
});
\`\`\`

### GUI boundary — what Network is NOT for

Network is a **data and event bus**. It is not a UI system. Do not use \`Rebur.Network.send\` to push UI updates.

| Scenario | Correct API | Why |
|----------|------------|-----|
| Update a shared score label | \`Rebur.State.set("score", n)\` + \`Rebur.Gui.text()\` | State replicates; GUI is the render layer |
| Update a per-player HP bar | \`player.gui.bar("hp", hp, max)\` | Server routes to the right client directly |
| Notify a player of a purchase | \`Rebur.Network.sendTo(player, "purchaseResult", data)\` | Data event, not UI — the LocalScript or client handles rendering |

\`\`\`js
// ✓ Correct: update state and shared HUD together on the server
coin.on("touched", (other) => {
  if (!other.isPlayer) return;
  const score = (Rebur.State.get("score") ?? 0) + 1;
  Rebur.State.set("score", score);
  Rebur.Gui.text("score", "Score: " + score, { anchor: "tl", x: 20, y: 20 });
});

// ✗ Anti-pattern: using Network as a UI pipe
// Rebur.State.on("score", (val) => { Rebur.Network.send("scoreUpdate", { score: val }); });
// ...then in LocalScript: Rebur.Gui.text("score", ...)
// This creates a redundant layer — the server already controls Rebur.Gui directly.
\`\`\`

### Client → Server (LocalScript sends)

\`\`\`js
// LocalScript — send a data event up to the server
Rebur.Network.send("purchaseRequest", { item: "Sword", cost: 50 });

// Listen for the server's data response — then update per-player UI
Rebur.Network.on("purchaseResult", (payload) => {
  // payload is data; UI update is the LocalScript's responsibility
  log(payload.success ? "Bought " + payload.item : "Failed: " + payload.reason);
});
\`\`\`

### Security note

Never trust payload data from clients for authoritative decisions. Always validate on the server:

\`\`\`js
Rebur.Network.on("claimScore", (payload, sender) => {
  // ✗ Don't do this — client could send any number
  // Rebur.State.set("score", payload.score);

  // ✓ Always compute authoritatively server-side
  const current = Rebur.State.get("score") ?? 0;
  Rebur.State.set("score", current + 1);
});
\`\`\`

---

## Tags

Tags label entities so they can be found as groups. There are two distinct operations — **labeling** (write) and **querying** (read) — and each has its own home:

| Operation | API |
|-----------|-----|
| Add a tag | \`Rebur.Tags.add(entity, "enemy")\` |
| Remove a tag | \`Rebur.Tags.remove(entity, "enemy")\` |
| Check a tag | \`Rebur.Tags.has(entity, "enemy")\` → boolean |
| List all tags | \`Rebur.Tags.all(entity)\` → string[] |
| **Find entities by tag** | **\`Rebur.Workspace.query({ tag: "enemy" })\`** |

**The rule:** \`Rebur.Tags\` is for labeling individual entities. \`Rebur.Workspace.query\` is the single query API for finding groups. Do not use \`Rebur.Tags.get()\` — use \`Workspace.query\` instead.

\`\`\`js
// Label entities at setup time
const spider = Rebur.Workspace.find("Spider");
Rebur.Tags.add(spider, "enemy");
Rebur.Tags.add(spider, "boss");

// Query — always via Workspace.query
const allEnemies = Rebur.Workspace.query({ tag: "enemy" });
const bosses     = Rebur.Workspace.query({ tags: ["enemy", "boss"] });

for (const e of bosses) e.health -= 10;

// Check / inspect a specific entity
Rebur.Tags.has(spider, "boss");   // true
Rebur.Tags.all(spider);           // ["enemy", "boss"]
Rebur.Tags.remove(spider, "boss");
\`\`\`

---

## Timers

Tick-based timer helpers. All are global functions available in every script.

\`\`\`js
// One-shot delay (seconds) — returns a cancel function
const cancel = after(2, () => log("2 seconds later"));
cancel(); // cancel before it fires

// Repeating interval (seconds) — returns a stop function
const stop = every(0.5, () => {
  coin.visible = !coin.visible;
});
stop(); // stop repeating
\`\`\`

### Async / await

\`wait(seconds)\` returns a native \`Promise<void>\`. You can use it with \`async\`/\`await\` or \`.then()\` — both work:

\`\`\`js
// async/await style — cleanest for sequences
async function sequence() {
  log("step 1");
  await wait(2);
  log("step 2");
  await wait(1);
  log("step 3");
}
sequence();

// Promise chain style — equivalent
wait(2).then(() => {
  log("2 seconds later");
});

// Parallel — wait for multiple things
Promise.all([wait(1), wait(2)]).then(() => {
  log("both done after 2 seconds");
});
\`\`\`

> **Note:** \`async\` functions in Rebur scripts are top-level fire-and-forget. Errors inside them are caught by the sandbox and logged. Native \`Promise\` is fully available.

---

## Logging

Output appears in the in-game console (HUD → **Show Console**).

\`\`\`js
log("Hello!", 42, { x: 1 });
warn("Something odd");
error("Something broke");
\`\`\`

---

## Vector3 & Color3

\`\`\`js
// Vector3
const v = Vector3(1, 2, 3);      // { x:1, y:2, z:3 }
Vector3.zero()                    // { x:0, y:0, z:0 }
Vector3.one()                     // { x:1, y:1, z:1 }
Vector3.up()                      // { x:0, y:1, z:0 }
Vector3.right()                   // { x:1, y:0, z:0 }
Vector3.forward()                 // { x:0, y:0, z:-1 }

v.magnitude                       // sqrt(x²+y²+z²)
v.add(other)                      // returns new Vector3
v.sub(other)
v.scale(n)
v.normalize()
v.dot(other)                      // scalar

entity.position = Vector3(0, 10, 0);
\`\`\`

\`\`\`js
// Color3 — returns a CSS color string
Color3(1, 0, 0)              // "rgb(255,0,0)"
Color3.fromRGB(0, 0, 255)    // "rgb(0,0,255)"
Color3.fromHex("#ff8800")    // "#ff8800"

entity.color = Color3(1, 0.5, 0);
\`\`\`

---

## Quick Start Examples

### Spin a platform

\`\`\`js
let angle = 0;
Rebur.on("tick", (dt) => {
  angle += dt;
  const p = Rebur.Workspace.find("Platform");
  if (p) p.rotation = { x: 0, y: angle, z: 0 };
});
\`\`\`

### Oscillating platform

\`\`\`js
let t = 0;
Rebur.on("tick", (dt) => {
  t += dt;
  const p = Rebur.Workspace.find("Platform");
  if (p) p.position = { x: Math.sin(t) * 5, y: 1, z: 0 };
});
\`\`\`

### Lava zone — damage on touch

\`\`\`js
const lava = Rebur.Workspace.find("Lava");
lava.color = "#ff4400";

lava.on("touched", (other) => {
  if (other.isPlayer) {
    other.health -= 25;
    log(other.username, "hit lava! HP:", other.health);
  }
});
\`\`\`

### Per-player health bar + coin counter

\`\`\`js
Rebur.on("playerJoined", (player) => {
  const coins = player.data.get("coins") ?? 0;

  player.gui.bar("hp", player.health, player.maxHealth, {
    anchor: "bl", x: 20, y: 20, width: 200, height: 16,
    color: "#22c55e", bg: "#374151",
  });
  player.gui.text("coins", "Coins: " + coins, {
    anchor: "tl", x: 20, y: 20, size: 16,
  });
});

const coin = Rebur.Workspace.find("Coin");
coin.on("touched", (other) => {
  if (!other.isPlayer) return;
  const player = Rebur.Players.get(other.id);
  if (!player) return;

  player.data.increment("coins");
  const total = player.data.get("coins");
  player.gui.text("coins", "Coins: " + total, { anchor: "tl", x: 20, y: 20, size: 16 });
  coin.visible = false;
  after(3, () => { coin.visible = true; });
});
\`\`\`

### Scene query — destroy all enemies

\`\`\`js
const enemies = Rebur.Workspace.query({ tag: "enemy" });
for (const e of enemies) e.destroy();
log("Cleared", enemies.length, "enemies");
\`\`\`

### Raycast — shoot to hit

\`\`\`js
Rebur.Input.on("press", (player, key) => {
  if (key !== "f") return;

  const forward = { x: 0, y: 0, z: -1 };
  const hit = Rebur.Workspace.raycast(player.position, forward, {
    maxDistance: 30,
    ignore: [player],
  });

  if (hit) {
    log("Shot hit:", hit.entity.name, "at distance", hit.distance.toFixed(1));
    if (Rebur.Tags.has(hit.entity, "enemy")) {
      hit.entity.destroy();
    }
  }
});
\`\`\`

### Countdown timer (shared HUD)

\`\`\`js
let timeLeft = 60;
Rebur.Gui.text("timer", "Time: 60", { anchor: "tc", y: 20, size: 18 });

every(1, () => {
  if (timeLeft <= 0) return;
  timeLeft--;
  Rebur.Gui.text("timer", timeLeft > 0
    ? "Time: " + timeLeft
    : "Time's up!",
    { anchor: "tc", y: 20, size: 18, color: timeLeft <= 10 ? "#ef4444" : "#ffffff" }
  );
});
\`\`\`

### Force-based launch pad

\`\`\`js
const pad = Rebur.Workspace.find("LaunchPad");
pad.on("touched", (other) => {
  if (!other.isPlayer) return;
  const prev = other.jumpPower;
  other.jumpPower = 40;
  after(0.1, () => { other.jumpPower = prev; });
});
\`\`\`

### Physics cannonball

\`\`\`js
every(3, () => {
  const ball = Rebur.Workspace.create({
    name: "Cannonball_" + Date.now(),
    primitiveType: "sphere",
    position: { x: 0, y: 5, z: 10 },
    color: "#222222",
    scale: { x: 0.5, y: 0.5, z: 0.5 },
  });
  ball.body.anchored = false;
  ball.body.mass = 5;
  ball.body.restitution = 0.3;
  ball.body.applyImpulse({ x: 0, y: 8, z: -25 });
  after(5, () => { if (ball) ball.destroy(); });
});
\`\`\`

### Async sequence

\`\`\`js
async function startRound() {
  Rebur.Gui.text("msg", "Get ready!", { anchor: "cc", size: 28 });
  await wait(2);
  Rebur.Gui.text("msg", "3", { anchor: "cc", size: 48, color: "#facc15" });
  await wait(1);
  Rebur.Gui.text("msg", "2", { anchor: "cc", size: 48, color: "#fb923c" });
  await wait(1);
  Rebur.Gui.text("msg", "GO!", { anchor: "cc", size: 48, color: "#4ade80" });
  await wait(1);
  Rebur.Gui.clear("msg");
  Rebur.State.set("phase", "playing");
}

Rebur.on("playerJoined", () => {
  if (Rebur.Players.all().length === 2) startRound();
});
\`\`\`

### Player animator — emote pad

\`\`\`js
const dancepad = Rebur.Workspace.find("DancePad");
dancepad.body.isTrigger = true;

dancepad.on("touched", (other) => {
  if (!other.isPlayer) return;
  const player = Rebur.Players.get(other.id);
  if (!player) return;

  player.animator.play("Dance", { blend: 0.15 });
  player.gui.text("emote", "Dancing!", { anchor: "tc", y: 40, size: 16 });
});

dancepad.on("untouched", (other) => {
  if (!other.isPlayer) return;
  const player = Rebur.Players.get(other.id);
  if (!player) return;

  player.animator.play("Idle", { blend: 0.3 });
  player.gui.clear("emote");
});
\`\`\`

---

## Safe Standard Library

Available exactly as in a browser:

\`Math\`, \`JSON\`, \`String\`, \`Number\`, \`Boolean\`, \`Array\`, \`Object\`, \`Date\`,
\`parseInt\`, \`parseFloat\`, \`isNaN\`, \`isFinite\`, \`Symbol\`, \`Promise\`

**Blocked** for security: \`process\`, \`require\`, \`fetch\`, \`__filename\`, \`__dirname\`

---

## Gravity Sources

Any entity can act as a gravity source — pulling players and physics bodies toward its center like a planet. Configure via the property panel or in scripts.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| \`gravityEnabled\` | boolean | Turn this entity into a gravity source |
| \`gravityStrength\` | number | Pull force in units/s² (default 9.81) |
| \`gravityRadius\` | number | Sphere of influence in units (default 30) |

### Scripting

\`\`\`js
const planet = Rebur.Workspace.find("Planet");

// Enable at runtime
planet.gravityEnabled = true;
planet.gravityStrength = 20;
planet.gravityRadius = 50;

// Temporarily disable
planet.gravityEnabled = false;
\`\`\`

Gravity sources compose — a player standing between two planets is pulled toward both based on each source's strength and distance. The player is only affected if they are within \`gravityRadius\` units of the source.

\`\`\`js
// Shrinking black hole — radius grows over time
let radius = 10;
Rebur.on("tick", (dt) => {
  radius = Math.min(radius + dt * 2, 80);
  const hole = Rebur.Workspace.find("BlackHole");
  if (hole) {
    hole.gravityRadius = radius;
    hole.gravityStrength = 30;
  }
});
\`\`\`

---

## LocalScript (Client-Side)

Scripts placed in the **UI/Player** or **UI/Global** containers with type **LocalScript** run in the player's browser, not on the server.

LocalScripts have access to a smaller API focused on client ↔ server messaging:

| API | Description |
|-----|-------------|
| \`Rebur.Network.send(event, payload)\` | Send a message to the server |
| \`Rebur.Network.on(event, fn)\` | Receive messages from the server |
| \`Rebur.Network.off(event, fn)\` | Remove a listener |
| \`Rebur.on("tick", fn)\` | Per-frame callback (browser RAF) |

\`\`\`js
// LocalScript — runs in the player's browser

// Send a message to the server when the script starts
Rebur.Network.send("clientReady", { time: Date.now() });

// Listen for server messages
Rebur.Network.on("showAlert", (payload) => {
  log("Server says:", payload.message);
});

// Per-frame tick
Rebur.on("tick", (dt) => {
  // dt = seconds since last frame
});
\`\`\`

Server-side Script to pair:

\`\`\`js
// Script (server-side) — receives from LocalScript
Rebur.Network.on("clientReady", (player, data) => {
  log(player.username, "is ready at", data.time);
  Rebur.Network.sendTo(player, "showAlert", { message: "Welcome!" });
});
\`\`\`

> LocalScripts **cannot** modify game objects or player data directly — those operations must go through the server via \`Rebur.Network.send\`.
`;
