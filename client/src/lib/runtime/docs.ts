// docs.ts — DEFAULT_SCRIPT + full SCRIPTING_DOCS

export const DEFAULT_SCRIPT = `// Scripts run server-side in a secure sandbox.
// Rebur is the only global — everything hangs off it.

// Example: spin an entity every frame
let angle = 0;
Rebur.on("tick", (dt) => {
  angle += dt * 2;
  const spinner = Rebur.Scene.find("Part");
  if (spinner) spinner.rotation = { x: 0, y: angle, z: 0 };
});

// Example: react when a player touches an entity
const lava = Rebur.Scene.find("Lava");
if (lava) {
  lava.on("touched", (other) => {
    if (other.isPlayer) {
      other.takeDamage(25);
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
9. [Rebur.Scene — Entity Container](#reburscene)
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
Rebur                   ← single global
├── Scene               ← 3D entity container (live world)
├── Players             ← player entity container
├── Lighting            ← lighting entity container
├── Storage             ← template/module container (not rendered)
├── State               ← shared session key-value store
├── DataStore           ← persistent cross-session storage
├── Gui                 ← global/shared HUD overlay
├── Sound               ← audio playback
├── Tween               ← property animation
├── Camera              ← camera control
├── Input               ← keyboard + mouse
├── Physics             ← global physics settings
├── RunService          ← game loop phase channels
├── Network             ← multiplayer messaging
└── Tags                ← entity tag queries

player                  ← a PlayerEntity (also an Entity)
├── player.gui          ← per-player private HUD
├── player.data         ← per-player persistent data store
├── player.animator     ← skeletal animation controller
├── player.inventory    ← item inventory
└── player.motors       ← body-slot attachments
\`\`\`

**Key rules:**
- \`Rebur\` is the **primary** engine global — all subsystems hang off it. No \`Scene\`, \`Players\`, \`gui\`, \`game\`, etc.
- A small safe **utility global set** is also exposed: \`after\`, \`every\`, \`wait\`, \`Vector3\`, \`Color3\`, \`log\`, \`warn\`, \`error\`, \`random\`, \`randInt\`, \`pick\`. Everything else requires \`Rebur.\`.
- All entities (including players) share the same base API — players are entities with \`isPlayer = true\`.
- Cross-container interaction is **explicit** — there is no hidden magic coupling.
- Single access pattern everywhere: \`Rebur.Scene.find("name")\`, \`Rebur.Players.get(id)\`.

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
| \`Rebur.Network.send()\` | Client → server message | Callable from server context only in current build |
| \`Rebur.Network.onMessage()\` | Client receives server message | Server-side listener stub; actual delivery is client-side |
| \`player.gui\` | Per-player UI | Server calls it, engine routes to the correct client |

> **Why this matters:** \`Rebur.Input.onPress("e", fn)\` fires once globally on the server when **any** player presses E. When client scripts arrive, each player's input will be isolated. For now, always check which player acted before applying effects.

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

### Replication Ownership & Conflicts

**The server is the single authority** on all replicated state. This has one critical consequence:

- If a future client script writes \`entity.position\` locally for prediction, and the server then sets \`entity.position\` authoritatively — **the server wins**.
- Client-written values are always overwritten by the next server tick for any server-owned entity.
- This is intentional: it prevents cheating but does mean client prediction can visually snap.

Current rule: **everything is server-owned**. When client scripts arrive, each entity will have an explicit owner (server or a specific player), and only the owner can write its replicated properties. Any write from a non-owner will be silently ignored on the remote side.

### Server Authority Summary

\`\`\`
Server writes entity.position  →  replicates to all clients ✓
Client prediction writes it    →  overwritten by next server tick ✗ (snaps)
Future: client owns entity     →  client writes replicate up then to others ✓
\`\`\`

### Future: Client Scripts (LocalScript)

A future \`LocalScript\` context will run in each player's browser for:
- **Responsive input** — react to key presses without a round-trip to the server
- **Camera control** — smooth camera shake, zoom, cutscenes
- **Client-side prediction** — move the player character locally; reconcile with server
- **Per-player visual effects** — particles, screen flash, local-only UI animations

For now, all creative scripting is server-side. This covers the vast majority of game types cleanly.

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
const coin = Rebur.Scene.find("Coin");
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
- **\`name\`** — mutable display name (use for lookup by \`Rebur.Scene.find()\`)
- **hierarchy** — parent/child relationships

\`\`\`js
const part = Rebur.Scene.find("Platform");
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
const e = Rebur.Scene.find("Part");

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
e.name = "NewName"; // rename (updates Rebur.Scene.find results)
\`\`\`

### isPlayer *(read-only)*

\`\`\`js
entity.on("touched", (other) => {
  if (other.isPlayer) {
    other.takeDamage(10); // player-specific method
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
| \`body.angularVelocity\` | \`{x,y,z}\` | Current angular velocity (read-only) |

\`\`\`js
const ball = Rebur.Scene.find("Ball");

ball.body.anchored     = false;
ball.body.mass         = 2;
ball.body.friction     = 0.3;
ball.body.restitution  = 0.8;   // very bouncy
ball.body.isKinematic  = false;
ball.body.isTrigger    = false;  // solid collision
\`\`\`

### body methods — force-based physics

\`\`\`js
// Continuous force (applied each frame, good for constant pushes)
ball.body.applyForce({ x: 0, y: 50, z: 0 });

// Instant impulse (one-shot velocity change, good for launches)
ball.body.applyImpulse({ x: 0, y: 10, z: 0 });

// Torque (spin force)
ball.body.applyTorque({ x: 0, y: 5, z: 0 });

// Direct velocity override (use sparingly — breaks physical realism)
ball.body.setVelocity({ x: 5, y: 0, z: -5 });
ball.body.setAngularVelocity({ x: 0, y: Math.PI, z: 0 });

// Stop all motion
ball.body.setVelocity({ x: 0, y: 0, z: 0 });
ball.body.setAngularVelocity({ x: 0, y: 0, z: 0 });
\`\`\`

\`\`\`js
// Launch a cannonball
const cannon = Rebur.Scene.create({
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
const lava = Rebur.Scene.find("Lava");
lava.body.isTrigger = true;

lava.on("touched", (other) => {
  if (other.isPlayer) other.takeDamage(25);
});
lava.on("untouched", (other) => {
  // player left the lava zone — stop damage
});

// Breakable crate — solid, impact-dependent → use collisionStarted
const crate = Rebur.Scene.find("Crate");

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
  if (other.isPlayer) other.takeDamage(25);
});
unsub(); // stop listening
\`\`\`

\`\`\`js
// Cross-container interaction — explicit, no magic
const coin = Rebur.Scene.find("Coin");
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

Fire a custom event on this entity. Listeners on the same event are called.

\`\`\`js
entity.on("Open", (speed) => {
  log("Opening at speed", speed);
});

entity.emit("Open", 2);
\`\`\`

---

## Rebur.Scene

The live 3D world container. All rendered, simulated entities live here.

### Rebur.Scene.find(name) → entity | null

The **one** way to look up an entity by name.

\`\`\`js
const part = Rebur.Scene.find("Platform");
if (!part) { log("Platform not found"); return; }

part.position = { x: 0, y: 5, z: 0 };
\`\`\`

### Rebur.Scene.findById(id) → entity | null

Look up an entity by its immutable id.

\`\`\`js
const id = entity.id; // store the id
// ... later ...
const ref = Rebur.Scene.findById(id);
\`\`\`

### Rebur.Scene.all() → entity[]

All entities currently in the scene.

\`\`\`js
const all = Rebur.Scene.all();
log("Scene has", all.length, "entities");
\`\`\`

### Rebur.Scene.query(filter) → entity[]

Filter entities by one or more criteria. More efficient than \`.all().filter()\` for large worlds — only matching entities are returned.

\`\`\`js
// By tag
const enemies = Rebur.Scene.query({ tag: "enemy" });

// By type
const lights = Rebur.Scene.query({ type: "light" });

// By multiple tags (AND — entity must have all)
const bosses = Rebur.Scene.query({ tags: ["enemy", "boss"] });

// By custom predicate
const heavy = Rebur.Scene.query({ where: (e) => e.body.mass > 10 });

// Combined
const activeEnemies = Rebur.Scene.query({
  tag: "enemy",
  where: (e) => e.visible,
});

// Limit results
const firstFive = Rebur.Scene.query({ tag: "coin", limit: 5 });
\`\`\`

### Rebur.Scene.raycast(origin, direction, opts?) → RaycastResult | null

Cast a ray from a point in a direction and return the first entity hit.

\`\`\`js
// Cast downward from above a point
const hit = Rebur.Scene.raycast(
  { x: 0, y: 20, z: 0 },
  { x: 0, y: -1, z: 0 }
);

if (hit) {
  log("Hit:", hit.entity.name, "at distance", hit.distance);
  log("Hit position:", hit.point.x, hit.point.y, hit.point.z);
  log("Hit normal:", hit.normal.x, hit.normal.y, hit.normal.z);
}

// With options
const hit2 = Rebur.Scene.raycast(
  player.position,
  { x: 0, y: 0, z: -1 },
  {
    maxDistance: 50,          // default: 500
    ignore: [player],         // skip these entities
    tag: "enemy",             // only hit entities with this tag
  }
);
\`\`\`

### Rebur.Scene.create(opts) → entity

Spawn a new entity at runtime.

\`\`\`js
const bomb = Rebur.Scene.create({
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
const wall = Rebur.Scene.find("OldWall");
if (wall) wall.destroy();
\`\`\`

---

## Entity Lifetime & Validity

Entities can be destroyed at any time — by scripts, by collisions, or by the engine. A **stale reference** is a variable that holds an entity that no longer exists.

### entity.destroyed *(read-only boolean)*

Every entity has a \`destroyed\` property. It is \`false\` while the entity is alive and becomes \`true\` immediately when \`entity.destroy()\` is called or the engine removes it.

\`\`\`js
const enemy = Rebur.Scene.find("Enemy");

after(5, () => {
  if (enemy && !enemy.destroyed) {
    enemy.destroy();
  }
});
\`\`\`

### Calling methods on a destroyed entity

Calling any method or reading/writing any property on a destroyed entity is **a no-op** — it does not throw. The engine logs a warning in the console so you can trace it:

\`\`\`
[warn] Attempted to call .takeDamage() on destroyed entity "Enemy"
\`\`\`

This is intentional: it keeps scripts from crashing if two events race to destroy the same entity. But it means **silent failures are possible** — always check \`entity.destroyed\` when holding long-lived references.

### Safe patterns

\`\`\`js
// Pattern 1: guard before use (recommended for long-lived refs)
const coin = Rebur.Scene.find("Coin");

every(1, () => {
  if (!coin || coin.destroyed) return; // entity was destroyed, skip
  coin.rotation.y += 0.1;
});

// Pattern 2: re-find each time (safe but slower)
Rebur.on("tick", (dt) => {
  const coin = Rebur.Scene.find("Coin"); // null if destroyed
  if (coin) coin.rotation.y += dt;
});

// Pattern 3: listen for "destroyed" event to clean up
const enemy = Rebur.Scene.find("Enemy");
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
const parent = Rebur.Scene.find("Platform");
const child  = Rebur.Scene.find("Coin");

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
if (alice) alice.takeDamage(10);
\`\`\`

### Rebur.Players.get(id) → player | null

Look up by immutable id — safest for cross-container references.

\`\`\`js
entity.on("touched", (other) => {
  if (other.isPlayer) {
    const player = Rebur.Players.get(other.id);
    if (player) player.heal(20);
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
| \`position\` | \`{x,y,z}\` | ✓ | — | World position |
| \`rotation\` | \`{x,y,z}\` | ✓ | — | Rotation (radians) |
| \`health\` | number | ✓ | ✓ | Current HP (0–maxHealth) |
| \`maxHealth\` | number | ✓ | ✓ | Max HP (default 100) |
| \`walkSpeed\` | number | ✓ | ✓ | Walk speed (default 6) |
| \`runSpeed\` | number | ✓ | ✓ | Run speed when Shift held (default 12) |
| \`jumpPower\` | number | ✓ | ✓ | Jump force (default 8) |
| \`onGround\` | boolean | ✓ | — | True while standing on a surface |
| \`spawnPoint\` | \`{x,y,z}\` | ✓ | ✓ | Respawn position |
| \`inventory\` | Inventory | ✓ | — | Item inventory |
| \`gui\` | PlayerGuiAPI | ✓ | — | Private per-player HUD |
| \`data\` | PlayerDataAPI | ✓ | — | Persistent per-player storage |
| \`animator\` | AnimatorAPI | ✓ | — | Animation controller |
| \`motors\` | MotorAPI | ✓ | — | Body-slot attachment |
| \`color\` | string | ✓ | ✓ | Shirt color |

### Player Transform Restrictions

Player \`position\` and \`rotation\` are **read-only from scripts**. The character controller (movement system) owns them. Attempting to assign them directly is silently ignored:

\`\`\`js
// ✗ These do nothing — player.position is read-only
player.position = { x: 0, y: 0, z: 0 };
player.position.y = 10;
player.rotation.y = Math.PI;
\`\`\`

**Why?** The physics character controller runs at every tick and resets player position based on its own simulation. Any direct write gets immediately overwritten.

**Use the correct APIs instead:**

\`\`\`js
// ✓ Instant teleport — bypasses the controller for one frame
player.teleport(0, 10, 0);

// ✓ Movement parameters — controller reads these each tick
player.walkSpeed = 12;
player.runSpeed  = 24;
player.jumpPower = 15;

// ✓ Respawn to a designated point
player.spawnPoint = { x: 50, y: 5, z: 0 };
player.respawn();

// ✓ Apply a force/impulse to the player's physics body
player.body.applyImpulse({ x: 0, y: 20, z: 0 }); // knock upward
\`\`\`

> **Reading** player.position is always valid — it reflects the current server-authoritative position:
>
> \`\`\`js
> log(player.position.x, player.position.y, player.position.z);
> const distFromOrigin = Vector3(player.position.x, player.position.y, player.position.z).magnitude;
> \`\`\`

### Player Methods

\`\`\`js
player.takeDamage(25)        // reduce health; death at 0
player.heal(20)              // restore health (capped at maxHealth)
player.kill()                // instant death → respawn
player.respawn()             // teleport to spawnPoint, restore health
player.teleport(x, y, z)    // instant move (bypasses controller for one frame)
\`\`\`

### Health system

When health reaches 0 the engine automatically:
1. Fires \`Rebur.on("playerDied", fn)\`
2. Respawns the player at their \`spawnPoint\`
3. Restores full health
4. Fires \`Rebur.on("playerRespawned", fn)\`

\`\`\`js
const trap = Rebur.Scene.find("Trap");
trap.on("touched", (other) => {
  if (other.isPlayer) other.takeDamage(50);
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
const sword = Rebur.Scene.find("Sword");
player.motors.attach("rightHand", sword, { x: 0, y: 0.05, z: 0.25 });
const held = player.motors.detach("rightHand"); // returns entity
player.motors.get("rightHand");                 // entity | null
// Slots: "rightHand" | "leftHand" | "head" | "back" | "chest"
\`\`\`

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
const shopTrigger = Rebur.Scene.find("ShopZone");
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

const xpZone = Rebur.Scene.find("XpZone");
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
const dancepad = Rebur.Scene.find("DancePad");
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

Full example:

\`\`\`js
Rebur.State.set("score", 0);
Rebur.Gui.text("score", "Score: 0", { anchor: "tl", x: 20, y: 20, size: 20 });

Rebur.State.on("score", (val) => {
  Rebur.Gui.text("score", "Score: " + val, { anchor: "tl", x: 20, y: 20, size: 20 });
});

const coin = Rebur.Scene.find("Coin");
coin.on("touched", (other) => {
  if (!other.isPlayer) return;
  Rebur.State.set("score", Rebur.State.get("score") + 1);
  coin.visible = false;
  after(3, () => { coin.visible = true; });
});
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
  for (const p of Rebur.Players.all()) p.respawn();
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

> **Client-bound API (currently server-proxied).** Camera settings are pushed from the server to all clients each tick. In the current model, setting \`Rebur.Camera.mode\` applies to every connected player simultaneously. When per-player LocalScripts arrive, each player will have their own camera scope.

\`\`\`js
Rebur.Camera.mode     = "thirdPerson"; // "thirdPerson"|"firstPerson"|"scripted"|"free"
Rebur.Camera.distance = 8;
Rebur.Camera.fov      = 70;            // degrees
Rebur.Camera.offset   = { x: 0, y: 1.5, z: 0 };

// Scripted mode — full manual control (affects all players)
Rebur.Camera.mode = "scripted";
Rebur.Camera.position = { x: 0, y: 30, z: 30 };
Rebur.Camera.lookAt   = { x: 0, y: 0, z: 0 };
\`\`\`

---

## Rebur.Input

> **Client-bound API (currently server-proxied).** In the current build, \`Rebur.Input\` is a server-global listener — \`onPress("e", fn)\` fires when **any** player presses E, not a specific one. The callback does not tell you which player pressed the key. Always cross-reference \`Rebur.Players.all()\` or \`Rebur.Players.find()\` to identify the acting player.
>
> When per-player LocalScripts arrive, each player's input will be scoped to their own context and the correct player will be implicit.

\`\`\`js
// Key press / release
Rebur.Input.onPress("e", () => {
  // ⚠ fires for ANY player pressing E
  // You must determine which player acted from context
  log("E pressed by someone");
});
Rebur.Input.onRelease("e", () => {
  log("E released");
});

// Poll state inside update loop
Rebur.on("tick", (dt) => {
  if (Rebur.Input.isDown("shift")) {
    // ⚠ shift is down for at least one player — unclear which
  }
});

// 3D viewport click — returns the entity hit and the player who clicked
Rebur.Input.onMouseClick((entity, player) => {
  if (entity) log(player.username, "clicked", entity.name);
  else log(player.username, "clicked sky");
});
\`\`\`

Key names: letters (\`"a"\`–\`"z"\`), \`"space"\`, \`"shift"\`, \`"control"\`, \`"alt"\`, \`"enter"\`, \`"escape"\`, \`"arrowup"\`, \`"arrowdown"\`, \`"arrowleft"\`, \`"arrowright"\`.

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

The Network API is split by who is sending and who is receiving. Because all current scripts are server-side, **only the server methods are authoritative today**. The client methods (\`send\`, \`onMessage\`) are stubs that will be available in future LocalScript contexts.

### Server Networking (use this in all current scripts)

The server can broadcast to all clients or to a specific player, and listen for messages that clients send up.

\`\`\`js
// Broadcast a message to ALL connected clients
Rebur.Network.broadcast("roundOver", { winner: "Alice", score: 42 });

// Send to a specific player only
Rebur.Network.broadcastTo(player, "personalMessage", { text: "You won!" });

// Listen for a message sent UP from any client
Rebur.Network.on("purchaseRequest", (payload, sender) => {
  // sender is the PlayerEntity who sent this
  log(sender.username, "wants to buy:", payload.item);

  const coins = sender.data.get("coins") ?? 0;
  if (coins >= payload.cost) {
    sender.data.set("coins", coins - payload.cost);
    sender.inventory.add(payload.item);
    Rebur.Network.broadcastTo(sender, "purchaseResult", { success: true, item: payload.item });
  } else {
    Rebur.Network.broadcastTo(sender, "purchaseResult", { success: false, reason: "Not enough coins" });
  }
});
\`\`\`

\`\`\`js
// Broadcast score updates to all clients for a live HUD
Rebur.State.on("score", (val) => {
  Rebur.Network.broadcast("scoreUpdate", { score: val });
});
\`\`\`

#### Server Network methods

| Method | Description |
|--------|-------------|
| \`Rebur.Network.broadcast(event, payload)\` | Send to all connected clients |
| \`Rebur.Network.broadcastTo(player, event, payload)\` | Send to one specific player |
| \`Rebur.Network.on(event, handler)\` | Listen for a message from any client; handler receives \`(payload, sender: PlayerEntity)\` |
| \`Rebur.Network.off(event, handler)\` | Remove a listener |

### Client Networking (LocalScript context — future)

These methods will be callable from client scripts once LocalScript contexts are available. They are listed here for completeness and forward planning.

\`\`\`js
// CLIENT SCRIPT (future LocalScript — not available yet)

// Send a message up to the server
Rebur.Network.send("purchaseRequest", { item: "Sword", cost: 50 });

// Listen for a message coming down from the server
Rebur.Network.onMessage("purchaseResult", (payload) => {
  if (payload.success) {
    Rebur.Gui.text("notice", "Bought " + payload.item + "!", { anchor: "cc" });
  } else {
    Rebur.Gui.text("notice", payload.reason, { anchor: "cc", color: "#ef4444" });
  }
  after(2, () => Rebur.Gui.clear("notice"));
});

// Listen for broadcasts from the server
Rebur.Network.onMessage("scoreUpdate", (payload) => {
  Rebur.Gui.text("score", "Score: " + payload.score, { anchor: "tl", x: 20, y: 20 });
});
\`\`\`

#### Client Network methods (future)

| Method | Description |
|--------|-------------|
| \`Rebur.Network.send(event, payload)\` | Send a message up to the server |
| \`Rebur.Network.onMessage(event, handler)\` | Listen for a message from the server; handler receives \`(payload)\` |

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

## Rebur.Tags

Group entities with tags and query them.

\`\`\`js
Rebur.Tags.add(entity, "enemy");
Rebur.Tags.add(entity, "boss");

Rebur.Tags.has(entity, "enemy");          // boolean
Rebur.Tags.remove(entity, "enemy");

const enemies = Rebur.Tags.get("enemy");  // entity[]
for (const e of enemies) e.destroy();

Rebur.Tags.all(entity);                   // string[] — all tags on entity
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
  const p = Rebur.Scene.find("Platform");
  if (p) p.rotation = { x: 0, y: angle, z: 0 };
});
\`\`\`

### Oscillating platform

\`\`\`js
let t = 0;
Rebur.on("tick", (dt) => {
  t += dt;
  const p = Rebur.Scene.find("Platform");
  if (p) p.position = { x: Math.sin(t) * 5, y: 1, z: 0 };
});
\`\`\`

### Lava zone — damage on touch

\`\`\`js
const lava = Rebur.Scene.find("Lava");
lava.color = "#ff4400";

lava.on("touched", (other) => {
  if (other.isPlayer) {
    other.takeDamage(25);
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

const coin = Rebur.Scene.find("Coin");
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
const enemies = Rebur.Scene.query({ tag: "enemy" });
for (const e of enemies) e.destroy();
log("Cleared", enemies.length, "enemies");
\`\`\`

### Raycast — shoot to hit

\`\`\`js
Rebur.Input.onPress("f", () => {
  const player = Rebur.Players.all()[0];
  if (!player) return;

  const forward = { x: 0, y: 0, z: -1 };
  const hit = Rebur.Scene.raycast(player.position, forward, {
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
const pad = Rebur.Scene.find("LaunchPad");
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
  const ball = Rebur.Scene.create({
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
const dancepad = Rebur.Scene.find("DancePad");
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
`;
