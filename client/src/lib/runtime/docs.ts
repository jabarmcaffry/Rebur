// docs.ts — DEFAULT_SCRIPT + full SCRIPTING_DOCS (updated to match ScriptRunner)

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
8. [Entity Gravity Source](#entity-gravity-source)
9. [Entity Events](#entity-events)
10. [Rebur.Workspace — Entity Container](#reburworkspace)
11. [Rebur.Lighting — Light Container](#reburlighting)
12. [Rebur.Assets — Asset Containers](#reburassets)
13. [Entity Lifetime & Validity](#entity-lifetime--validity)
14. [Rebur.Players — Player Entities](#reburplayers)
15. [Player Entity](#player-entity)
16. [Player GUI (per-player)](#player-gui)
17. [Player Data](#player-data)
18. [Player Animator](#player-animator)
19. [Player Inventory](#player-inventory)
20. [Player Motors](#player-motors)
21. [Player Input (per-player)](#player-input)
22. [Rebur.State — Shared Session State](#reburstate)
23. [Rebur.DataStore — Persistent Storage](#reburdatastore)
24. [Rebur.Gui — Global HUD](#reburgui)
25. [Rebur.Sound — Audio](#rebursound)
26. [Rebur.Tween — Property Animation](#reburtween)
27. [Rebur.Camera — Camera Control](#reburcamera)
28. [Rebur.Input — Global Keyboard & Mouse](#reburinput)
29. [Rebur.Physics — Global Physics & Gravity Fields](#reburglobal-physics)
30. [Rebur.RunService — Game Loop](#reburrunservice)
31. [Rebur.Network — Multiplayer Messaging](#reburnetwork)
32. [Rebur.Tags — Tag System](#reburtags)
33. [Rebur.Math — Game Math Utilities](#reburt-math)
34. [Rebur.Timer — Named Countdowns](#rebur-timer)
35. [Rebur.World — Environment Settings](#rebur-world)
36. [Rebur.Labels — World‑Space 3D Text](#rebur-labels)
37. [Rebur.Scene — Scene Transitions & Restart](#rebur-scene)
38. [Rebur.Debug — Runtime Visualisation](#rebur-debug)
39. [Rebur.Particles — Visual Effects](#rebur-particles)
40. [Timers](#timers)
41. [Logging](#logging)
42. [Vector3 & Color3](#vector3--color3)
43. [Quick Start Examples](#quick-start-examples)

---

## Architecture

\`\`\`
Rebur                      ← single global
├── Workspace              ← live 3D world: rendered + simulated entities
├── Lighting               ← lighting entity container (not simulated, but entities can live here)
├── Assets
│   ├── Shared             ← assets replicated to all clients
│   └── Server             ← server-only assets, never sent to clients
├── Players                ← active player entities
├── State                  ← shared session key-value store (resets each session)
├── DataStore              ← persistent cross-session storage
├── Gui                    ← shared HUD (all players see)
├── Sound                  ← audio playback
├── Tween                  ← property animation
├── Camera                 ← camera control
├── Input                  ← global keyboard/mouse events (all players)
├── Physics                ← global physics settings & gravity fields
├── RunService             ← game loop (currently only "tick")
├── Network                ← server ↔ clients messaging
├── Tags                   ← entity tagging
├── Math                   ← helper math functions
├── Timer                  ← named countdowns
├── World                  ← environment (sky, fog, sun, ambient)
├── Labels                 ← world-space 3D text labels
├── Scene                  ← scene transitions / restart
├── Debug                  ← runtime debug drawing
└── Particles              ← particle effect emission

player                  ← a PlayerEntity (also an Entity)
├── player.gui          ← per-player private HUD
├── player.data         ← per-player persistent data store
├── player.animator     ← skeletal animation controller
├── player.inventory    ← item inventory
├── player.motors       ← body-slot attachments
└── player.input        ← per-player held keys + edge events
\`\`\`

**Key rules:**
- \`Rebur\` is the **primary** engine global — all subsystems hang off it. No bare globals like \`Workspace\`, \`Players\`, etc.
- A small safe **utility global set** is also exposed: \`after\`, \`every\`, \`wait\`, \`Vector3\`, \`Color3\`, \`log\`, \`warn\`, \`error\`, \`random\`, \`randInt\`, \`pick\`. Everything else requires \`Rebur.\`.
- All entities (including players) share the same base API — players are entities with \`isPlayer = true\`.
- Cross-container interaction is **explicit** — there is no hidden magic coupling.
- Single access pattern: \`Rebur.Workspace.find("name")\`, \`Rebur.Players.get(id)\`.

---

## Script Contexts

Rebur scripts currently execute in a **server-side** context. This is intentional — the server is the authority on all game state, which prevents cheating and keeps the model simple.

### Current: Server Scripts (all scripts today)

- Run on the server, have full access to all \`Rebur.*\` APIs.
- Entity positions, physics, health, inventory — all authoritative here.
- What you write today is a server script.

### Client‑Bound APIs (currently server‑proxied)

Some APIs are conceptually per‑player/client but are bridged through the server:

| API | Concept | Current behaviour |
|-----|---------|-------------------|
| \`Rebur.Input\` | Per‑player keyboard/mouse | Server receives player input events, forwarded to scripts |
| \`Rebur.Camera\` | Per‑player camera | Server sets camera params, pushed to each client |
| \`Rebur.Network.send()\` | Server → clients | Server can send to specific players or broadcast |
| \`player.gui\` | Per‑player UI | Server calls it, engine routes to the correct client |
| \`player.input\` | Per‑player held keys | Server tracks per‑player key states |

> **Why this matters:** \`Rebur.Input.on("press", (player, key) => {})\` fires on the server when **any** player presses a key. The callback always tells you which player acted so you can apply effects correctly.

### ClientScript (Client‑Side) – Planned

A \`ClientScript\` placed in the **StarterPlayer** container runs in each player's browser. **This is not yet implemented** – currently all scripts are server‑side. When available, ClientScripts will have a limited API for client ↔ server messaging only.

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

> **Players are an exception:** \`player.position\` is writable (teleports instantly). \`player.rotation\` is writable for yaw (the \`y\` component) — pitch and roll are ignored.

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

### entity.setLabel(text, opts?) → attach a world‑space label to this entity

\`\`\`js
const sign = Rebur.Workspace.find("Sign");
sign.setLabel("Welcome to Rebur!", { color: "#ffff00", size: 16 });
// remove label
sign.setLabel(null);
\`\`\`

---

## Entity Physics Body

Physics lives on \`entity.body\`. You can assign velocity directly or use forces/impulses for more complex physics simulations.

### body properties

| Property | Type | Description |
|----------|------|-------------|
| \`body.anchored\` | boolean | Static collider (no physics movement) |
| \`body.canCollide\` | boolean | Participates in collision detection |
| \`body.mass\` | number | Mass in kg (default 1) |
| \`body.friction\` | number | Surface friction (default 0.5) |
| \`body.restitution\` | number | Bounciness 0–1 (default 0) |
| \`body.isKinematic\` | boolean | Script‑moved; not affected by forces |
| \`body.isTrigger\` | boolean | Detects overlaps but no collision response |
| \`body.velocity\` | \`{x,y,z}\` | Current velocity — **read/write** |
| \`body.angularVelocity\` | \`{x,y,z}\` | Rotational velocity (rad/s) — **read/write** |

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

// Apply torque (rotational force)
ball.body.applyTorque({ x: 0, y: 10, z: 0 });

// Apply angular impulse
ball.body.applyAngularImpulse({ x: 0, y: 5, z: 0 });
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

## Entity Gravity Source

Any entity can act as a **gravity source** (like a planet) by setting its \`gravity\` property. This pulls players and physics bodies toward the entity's center, regardless of the global gravity direction.

\`\`\`js
const planet = Rebur.Workspace.find("Planet");

// Enable spherical gravity
planet.gravity = { strength: 20, radius: 50 };

// Disable
planet.gravity = false;
\`\`\`

**Properties:**
- \`strength\` — acceleration in units/s² toward the center (default 20)
- \`radius\` — influence radius in units (default 20)

The effect is applied to all entities within the radius, combining with global gravity and other gravity fields.

\`\`\`js
// Shrinking black hole – radius grows over time
const blackHole = Rebur.Workspace.find("BlackHole");
let radius = 10;
Rebur.on("tick", (dt) => {
  radius = Math.min(radius + dt * 2, 80);
  blackHole.gravity = { strength: 30, radius };
});
\`\`\`

> **Note:** This is different from \`Rebur.Physics.setGravityField\` (a static, global field) — entity gravity is attached to a moving object.

---

## Entity Events

### entity.on(event, handler) → unsubscribe

#### Overlap events: touched / untouched

\`"touched"\` and \`"untouched"\` fire when the bounding volumes of two entities intersect.

- **Trigger entity** (\`body.isTrigger = true\`): overlapping entities pass through with no physical response. Only \`touched\`/\`untouched\` fire.
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
- Use \`touched\`/\`untouched\` for **gameplay logic** — item pickup, damage, checkpoints.
- Use \`collisionStarted\` for **impact‑dependent logic** — breakable objects based on force.

\`\`\`js
// Damage zone — trigger, gameplay logic → use touched
const lava = Rebur.Workspace.find("Lava");
lava.body.isTrigger = true;

lava.on("touched", (other) => {
  if (other.isPlayer) other.health -= 25;
});

// Breakable crate — solid, impact‑dependent → use collisionStarted
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
| \`"collisionStarted"\` | Physical impact begins | \`other: Entity\`, \`impulse: {x,y,z}\` | ✗ | ✓ |
| \`"collisionEnded"\` | Physical separation | \`other: Entity\` | ✗ | ✓ |
| \`"clicked"\` | Player clicks this entity in 3D view | \`player: PlayerEntity\` | — | — |
| \`"predestroy"\` | **Before** entity is destroyed (cleanup hook) | \`entity: Entity\` | — | — |
| \`"removing"\` | Alias for predestroy | \`entity: Entity\` | — | — |
| \`"destroyed"\` | After entity is fully removed | — | — | — |
| *(custom)* | Your script calls \`.emit()\` | your args | — | — |

\`\`\`js
const unsub = entity.on("touched", (other) => {
  if (other.isPlayer) other.health -= 25;
});
unsub(); // stop listening
\`\`\`

### entity.off(event, handler)

\`\`\`js
function onTouch(other) { log("touched!"); }
entity.on("touched", onTouch);
entity.off("touched", onTouch);
\`\`\`

### entity.emit(event, ...args)

Fire a custom event on **this entity only**. Does **not** replicate to clients or other entities.

\`\`\`js
entity.on("Open", (speed) => {
  log("Opening at speed", speed);
});
entity.emit("Open", 2);
\`\`\`

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

Filter entities by one or more criteria.

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

### Rebur.Workspace.count(filter?) → number

Count entities matching an optional filter – cheaper than \`.query().length\`.

\`\`\`js
const enemyCount = Rebur.Workspace.count({ tag: "enemy" });
\`\`\`

### Rebur.Workspace.raycast(origin, direction, opts?) → RaycastResult | null

Cast a ray and return the first hit (entities + players).

\`\`\`js
const hit = Rebur.Workspace.raycast(
  { x: 0, y: 20, z: 0 },
  { x: 0, y: -1, z: 0 },
  {
    maxDistance: 50,
    ignore: [player],
    tag: "enemy",            // only hit entities with this tag
    players: true,           // include players in raycast (default true)
  }
);

if (hit) {
  log("Hit:", hit.entity.name, "at", hit.distance);
  log("Point:", hit.point, "Normal:", hit.normal);
}
\`\`\`

### Rebur.Workspace.raycastAll(origin, direction, opts?) → RaycastResult[]

All hits sorted by distance.

\`\`\`js
const hits = Rebur.Workspace.raycastAll(origin, dir);
for (const h of hits) log(h.entity.name);
\`\`\`

### Rebur.Workspace.multiRaycast(rays, opts?) → (RaycastResult|null)[]

Cast multiple rays at once (shotgun / spread).

\`\`\`js
const rays = [
  { origin: { x:0,y:0,z:0 }, direction: { x:0,y:0,z:-1 } },
  { origin: { x:1,y:0,z:0 }, direction: { x:0,y:0,z:-1 } },
];
const results = Rebur.Workspace.multiRaycast(rays, { maxDistance: 30 });
\`\`\`

### Rebur.Workspace.sphereCast(origin, radius, direction, opts?) → RaycastResult | null

Sphere sweep along a ray.

\`\`\`js
const hit = Rebur.Workspace.sphereCast({ x:0,y:10,z:0 }, 0.5, { x:0,y:-1,z:0 });
\`\`\`

### Rebur.Workspace.overlapSphere(center, radius, opts?) → Entity[]

Find all entities intersecting a sphere.

\`\`\`js
const near = Rebur.Workspace.overlapSphere(player.position, 5, { tag: "pickup" });
\`\`\`

### Rebur.Workspace.overlapBox(center, halfExtents, rotation?, opts?) → Entity[]

Find all entities intersecting an axis‑aligned box.

\`\`\`js
const inArea = Rebur.Workspace.overlapBox({ x:0,y:0,z:0 }, { x:5,y:5,z:5 });
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
  anchored: false,
  canCollide: true,
});
bomb.body.mass = 3;
\`\`\`

### Rebur.Workspace.clone(sourceName, overrides?) → entity | null

Clone an existing entity.

\`\`\`js
const clone = Rebur.Workspace.clone("Tree", {
  name: "Tree2",
  position: { x: 10, y: 0, z: 5 },
});
\`\`\`

### entity.destroy()

\`\`\`js
const wall = Rebur.Workspace.find("OldWall");
if (wall) wall.destroy();
\`\`\`

---

## Rebur.Lighting

Container for light entities. Lights placed here are rendered but not simulated as physics objects.

\`\`\`js
const lamp = Rebur.Lighting.find("StreetLamp");
if (lamp) lamp.color = "#ffaa66";

const allLights = Rebur.Lighting.all();
\`\`\`

---

## Rebur.Assets

Assets are read‑only templates. Entities placed in \`Assets/Shared\` are replicated to all clients; \`Assets/Server\` are server‑only (never sent). Scripts can find and read them but cannot modify them.

\`\`\`js
const template = Rebur.Assets.Shared.find("GunTemplate");
// use template to clone into Workspace
const gun = Rebur.Workspace.clone(template.name, { position: { x:0,y:1,z:0 } });
\`\`\`

---

## Entity Lifetime & Validity

Entities can be destroyed at any time. Every entity has a \`destroyed\` boolean property.

\`\`\`js
if (!coin.destroyed) coin.visible = false;
\`\`\`

**Development** throws errors on destroyed entity access; **production** logs a warning and no‑ops. Always guard:

\`\`\`js
coin.on("touched", (other) => {
  if (coin.destroyed) return;   // already destroyed this frame
  // ... safe
});
\`\`\`

---

## Rebur.Players

The player entity container.

### Rebur.Players.all() → player[]

\`\`\`js
const players = Rebur.Players.all();
log("Players online:", players.length);
\`\`\`

### Rebur.Players.find(username) → player | null

\`\`\`js
const alice = Rebur.Players.find("Alice");
if (alice) alice.health -= 10;
\`\`\`

### Rebur.Players.get(id) → player | null

\`\`\`js
entity.on("touched", (other) => {
  const player = Rebur.Players.get(other.id);
  if (player) player.health += 20;
});
\`\`\`

### Rebur.Players.count → number

\`\`\`js
if (Rebur.Players.count >= 2) startMatch();
\`\`\`

### Rebur.Players.closest(position, exclude?) → player | null

\`\`\`js
const nearest = Rebur.Players.closest({ x:0,y:0,z:0 }, player);
\`\`\`

### Rebur.Players.ranked(key, ascending?) → player[]

Sort by a numeric data key.

\`\`\`js
const leaderboard = Rebur.Players.ranked("score"); // highest first
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
| \`rotation\` | \`{x,y,z}\` | ✓ | ✓ | Only yaw (y) is used; pitch/roll ignored |
| \`respawn\` | boolean | — | ✓ | Set \`true\` to respawn to spawnPoint |
| \`health\` | number | ✓ | ✓ | Current HP (0–maxHealth) |
| \`maxHealth\` | number | ✓ | ✓ | Max HP (default 100) |
| \`walkSpeed\` | number | ✓ | ✓ | Walk speed (default 6) |
| \`runSpeed\` | number | ✓ | ✓ | Run speed when Shift held (default 12) |
| \`jumpPower\` | number | ✓ | ✓ | Jump force (default 8) |
| \`spawnPoint\` | \`{x,y,z}\` | ✓ | ✓ | Respawn position |
| \`autoRespawn\` | boolean | ✓ | ✓ | Whether player respawns automatically on death (default true) |
| \`inventory\` | Inventory | ✓ | — | Item inventory |
| \`gui\` | PlayerGuiAPI | ✓ | — | Private per-player HUD |
| \`data\` | PlayerDataAPI | ✓ | — | Persistent per-player storage |
| \`animator\` | AnimatorAPI | ✓ | — | Animation controller |
| \`motors\` | MotorAPI | ✓ | — | Body-slot attachment |
| \`input\` | PlayerInputAPI | ✓ | — | Per-player held keys + edge events |
| \`color\`, \`shirtColor\`, \`skinColor\`, \`pantsColor\` | string | ✓ | ✓ | Appearance |

### Player Transform

\`player.position\` is writable – teleports instantly.

\`\`\`js
player.position = { x: 100, y: 20, z: 0 };
player.rotation = { x: 0, y: Math.PI / 2, z: 0 }; // only yaw applied
\`\`\`

### Respawn

Set \`player.respawn = true\` to teleport to spawnPoint and restore health.

\`\`\`js
player.spawnPoint = { x: 50, y: 5, z: 0 };
player.respawn = true;
\`\`\`

### Health system

\`\`\`js
player.health -= 25;         // deal damage
player.health = player.maxHealth; // full heal
\`\`\`

When health reaches 0:
1. Fires \`Rebur.on("playerDied")\`
2. If \`autoRespawn\` is true, respawns automatically; otherwise stays dead until \`player.respawn = true\`.
3. Fires \`Rebur.on("playerRespawned")\`

---

## Player GUI (per-player)

\`player.gui\` — private HUD visible only to that player. API identical to \`Rebur.Gui\`.

\`\`\`js
Rebur.on("playerJoined", (player) => {
  player.gui.bar("hp", 100, 100, {
    anchor: "bl", x: 20, y: 20,
    width: 200, height: 16,
    color: "#22c55e", bg: "#374151",
  });
  player.gui.text("coins", "Coins: 0", { anchor: "tl", x: 20, y: 20 });
});

player.gui.button("buy", "Buy", { anchor: "cc" }, () => {
  // buy logic
});

player.gui.input("chat", { placeholder: "Say something..." }, (text) => {
  log("Player said:", text);
});

player.gui.clear("hp"); // remove one element
player.gui.clear();     // remove all
\`\`\`

---

## Player Data

\`player.data\` — persistent per-player storage (backed by DataStore).

\`\`\`js
const coins = player.data.get("coins") ?? 0;
player.data.set("coins", coins + 10);
player.data.increment("xp", 50);   // shortcut
player.data.decrement("deaths");   // shortcut
player.data.has("questFlag");      // boolean
player.data.delete("tempKey");
player.data.getAll();              // object copy
\`\`\`

---

## Player Animator

\`\`\`js
player.animator.play("Run", { blend: 0.2 });
player.animator.stop();
log(player.animator.current, player.animator.playing);

player.animator.on("done", (name) => {
  log("Animation finished:", name);
});
\`\`\`

Built-in names: \`"Idle"\`, \`"Walk"\`, \`"Run"\`, \`"Jump"\`, \`"Fall"\`, \`"Land"\`, \`"Wave"\`, \`"Dance"\`, \`"Sit"\`. Custom animations referenced by filename.

---

## Player Inventory

\`\`\`js
player.inventory.add("Sword", { count: 1, data: { damage: 10 } });
player.inventory.remove("Sword", 1);
player.inventory.has("Sword", 1);           // boolean
player.inventory.get("Sword");              // InventoryItem | null
player.inventory.equip("Sword");            // equip
player.inventory.equip(null);               // unequip
player.inventory.drop("Sword", 1);          // drops an entity at player feet
player.inventory.transferFrom(otherPlayer); // move all items
player.inventory.clear();
player.inventory.items;                     // array
player.inventory.equipped;                  // item or null
player.inventory.maxSlots = 40;
\`\`\`

---

## Player Motors

Attach entities to player body slots (rightHand, leftHand, head, back, chest).

\`\`\`js
const sword = Rebur.Workspace.find("Sword");
player.motors.attach("rightHand", sword, { x: 0, y: 0.05, z: 0.25 });
player.motors.detach("rightHand");
const held = player.motors.get("rightHand");
\`\`\`

---

## Player Input (per-player)

\`player.input\` — query held keys and listen for edge events for **this specific player**.

\`\`\`js
// In tick
if (player.input.key("shift")) {
  player.walkSpeed = player.runSpeed;
}

// Edge events
player.input.on("press", (key) => {
  if (key === "e") log("Interact");
});
player.input.on("release", (key) => log("Released", key));

// Mouse position in normalized device coordinates (-1..1)
log(player.input.mouse.x, player.input.mouse.y);
\`\`\`

---

## Rebur.State

Shared session key‑value store (resets when session ends). Reactive.

\`\`\`js
Rebur.State.set("score", 0);
Rebur.State.increment("score", 5);
Rebur.State.setTemporary("buff", true, 10); // auto‑deletes after 10s

const unsub = Rebur.State.on("score", (val, prev) => {
  log("Score changed from", prev, "to", val);
});

Rebur.State.delete("temp");
Rebur.State.keys();       // string[]
Rebur.State.getAll();     // object copy
\`\`\`

---

## Rebur.DataStore

Persistent cross‑session storage.

\`\`\`js
Rebur.DataStore.set("worldRecord", { name: "Alice", score: 9999 });
const record = Rebur.DataStore.get("worldRecord");
Rebur.DataStore.increment("totalGames", 1);
Rebur.DataStore.decrement("attemptsLeft");
Rebur.DataStore.has("flag");  // boolean
Rebur.DataStore.keys();       // string[]
\`\`\`

---

## Rebur.Gui

Global HUD (all players see). API same as \`player.gui\` but without input methods.

\`\`\`js
Rebur.Gui.text("timer", "00:00", { anchor: "tc", y: 20, size: 24 });
Rebur.Gui.bar("progress", 50, 100, { x: 20, y: 20, width: 200 });
Rebur.Gui.button("restart", "Restart", { anchor: "br", x: 20, y: 20 }, () => {
  Rebur.Scene.restart();
});
Rebur.Gui.clear("timer");
\`\`\`

---

## Rebur.Sound

\`\`\`js
// Global sound (all players)
Rebur.Sound.play("collect", { volume: 0.8, loop: false });

// Positional 3D sound at world position
Rebur.Sound.playAt("explosion", { x: 10, y: 5, z: 0 }, { maxDistance: 30 });

// Sound for specific player only
Rebur.Sound.playForPlayer(player, "secret", { volume: 1.0 });

Rebur.Sound.stop("collect");
\`\`\`

---

## Rebur.Tween

\`\`\`js
// Basic tween
const cancel = Rebur.Tween(entity.position, { y: 10 }, 2, "easeOutQuad", () => {
  log("Done!");
});

// Chain tweens
Rebur.Tween(entity.position, { y: 10 }, 2)
  .thenSelf({ y: 0 }, 2, "bounce")
  .thenSelf({ x: 5 }, 1);

// Custom easing function
Rebur.Tween(entity, { transparency: 0.5 }, 1, (t) => t*t);
\`\`\`

Built‑in easings: \`"linear"\`, \`"easeInQuad"\`, \`"easeOutQuad"\`, \`"easeInOutQuad"\`, \`"easeInCubic"\`, \`"easeOutCubic"\`, \`"easeInOutCubic"\`, \`"easeInSine"\`, \`"easeOutSine"\`, \`"easeInOutSine"\`, \`"easeInExpo"\`, \`"easeOutExpo"\`, \`"easeInBack"\`, \`"easeOutBack"\`, \`"spring"\`, \`"bounce"\`, \`"elastic"\`.

---

## Rebur.Camera

Camera control – all settings pushed to clients each tick.

\`\`\`js
// Global camera settings
Rebur.Camera.position = { x: 0, y: 20, z: 30 };
Rebur.Camera.lookAt = { x: 0, y: 0, z: 0 };
Rebur.Camera.fov = 70;

// Per‑player override
Rebur.Camera.setForPlayer(player, { distance: 8, mode: "thirdPerson" });
Rebur.Camera.setForAll({ fov: 90 });
Rebur.Camera.clearForPlayer(player);

// Camera shake (all players or one)
Rebur.Camera.shake({ intensity: 0.5, duration: 0.3 });
Rebur.Camera.shake({ player: player, intensity: 1.0 });

// Get player's current camera ray (safe)
const ray = Rebur.Camera.getForwardRay(player);
if (ray) {
  const hit = Rebur.Workspace.raycast(ray.origin, ray.direction);
}

// Convenience raycast from camera
const hit = Rebur.Camera.raycast(player, { maxDistance: 50 });
\`\`\`

---

## Rebur.Input

Global input events (any player). Callback receives \`(player, key)\`.

\`\`\`js
Rebur.Input.on("press", (player, key) => {
  if (key === "e") log(player.username, "interacted");
});
Rebur.Input.on("release", (player, key) => {});
Rebur.Input.on("mouseclick", (player, entity) => {
  if (entity) log("Clicked", entity.name);
});
// Is any player holding a key?
Rebur.Input.key("w");  // boolean
\`\`\`

Key names: \`"a"–"z"\`, \`"space"\`, \`"shift"\`, \`"control"\`, \`"alt"\`, \`"enter"\`, \`"escape"\`, \`"arrowup"\`, etc.

---

## Rebur.Physics

Global physics settings and gravity fields.

\`\`\`js
Rebur.Physics.gravity = 9.81;   // downward acceleration (default 28)
Rebur.Physics.airDrag = 0.01;   // global air resistance

// Create a spherical gravity field (static position)
const field = Rebur.Physics.setGravityField({
  position: { x: 0, y: 0, z: 0 },
  radius: 30,
  strength: 20,
  direction: null, // null = radial (pull toward center)
});
field.enabled = false;
field.remove();
\`\`\`

For gravity attached to a moving entity, use \`entity.gravity\` instead (see [Entity Gravity Source](#entity-gravity-source)).

---

## Rebur.RunService

Currently only \`"tick"\` event is implemented (called every physics step). Use \`Rebur.on("tick", fn)\` instead.

---

## Rebur.Network

Server ↔ clients messaging.

\`\`\`js
// Broadcast to all clients
Rebur.Network.broadcast("roundOver", { winner: "Alice" });

// Send to one player
Rebur.Network.send(player, "privateMsg", { text: "You win!" });

// Send to multiple players
Rebur.Network.sendToMany([player1, player2], "teamEvent", {});

// Listen for messages from clients
Rebur.Network.on("purchase", (payload, sender) => {
  // payload is client‑sent data; sender is PlayerEntity
});
\`\`\`

> ClientScript is not yet implemented, so messages from clients are not yet possible. This API is for future use.

---

## Rebur.Tags

Label entities and query them.

\`\`\`js
Rebur.Tags.add(coin, "collectible");
Rebur.Tags.add(coin, "rare");
Rebur.Tags.has(coin, "collectible");   // true
Rebur.Tags.all(coin);                  // ["collectible", "rare"]

// Query entities by tag (via Workspace.query)
const coins = Rebur.Workspace.query({ tag: "collectible" });
const rare = Rebur.Workspace.query({ tags: ["collectible", "rare"] });

// Get all entities with a tag (direct)
const tagged = Rebur.Tags.get("rare");

Rebur.Tags.remove(coin, "rare");
\`\`\`

---

## Rebur.Math

Utility math functions.

\`\`\`js
Rebur.Math.clamp(15, 0, 10);           // 10
Rebur.Math.lerp(0, 10, 0.5);           // 5
Rebur.Math.invLerp(0, 10, 5);          // 0.5
Rebur.Math.remap(5, 0, 10, 0, 100);    // 50
Rebur.Math.smoothstep(0, 1, 0.7);      // ~0.9
Rebur.Math.angleDiff(0, Math.PI);      // ~3.14
Rebur.Math.lerpAngle(0, Math.PI*2, 0.5); // PI
Rebur.Math.deg2rad(180);               // PI
Rebur.Math.rad2deg(Math.PI);           // 180
Rebur.Math.dist2d(0,0,3,4);            // 5
Rebur.Math.dist3d({x:0,y:0,z:0}, {x:1,y:2,z:2}); // 3
Rebur.Math.wrap(10, 0, 5);             // 0
Rebur.Math.sign(-5);                   // -1
Rebur.Math.moveTowards(5, 10, 3);      // 8
Rebur.Math.bearing({x:0,z:0}, {x:1,z:1}); // 0.785 rad
const vel = { v: 0 };
let y = Rebur.Math.spring(y, targetY, vel, 10, 1, dt);
Rebur.Math.ease("bounce", 0.7);        // ease value
\`\`\`

All easings are exposed in \`Rebur.Math.easings\`.

---

## Rebur.Timer

Named countdown timers.

\`\`\`js
const timer = Rebur.Timer.countdown("round", 60, () => {
  log("Round ended!");
});
log(timer.remaining);   // remaining seconds
timer.stop();
timer.pause();
timer.resume();

const remaining = Rebur.Timer.get("round"); // 0 if not exist
\`\`\`

---

## Rebur.World

Environment settings.

\`\`\`js
Rebur.World.skyColor = "#87CEEB";
Rebur.World.fogColor = "#ffffff";
Rebur.World.fogDensity = 0.02;
Rebur.World.fogNear = 10;
Rebur.World.fogFar = 100;
Rebur.World.ambientColor = "#404040";
Rebur.World.ambientIntensity = 0.5;
Rebur.World.sunColor = "#ffffff";
Rebur.World.sunIntensity = 1.0;
Rebur.World.sunDirection = { x: 0.5, y: -1, z: 0.5 };
Rebur.World.shadowsEnabled = true;
Rebur.World.timeOfDay = 14; // 0–24
\`\`\`

---

## Rebur.Labels

World‑space 3D text labels (billboards).

\`\`\`js
const label = Rebur.Labels.create("sign1", "Hello", { x: 0, y: 2, z: 0 }, {
  color: "#ffff00",
  fontSize: 16,
  backgroundColor: "#000000aa",
  faceCamera: true,
});
label.text = "New text";
label.position = { x: 5, y: 2, z: 0 };
label.visible = false;
label.attach(entity);  // follows entity
label.detach();
label.destroy();

Rebur.Labels.get("sign1");
Rebur.Labels.delete("sign1");
Rebur.Labels.clear();
\`\`\`

---

## Rebur.Scene

Scene transitions and restart.

\`\`\`js
// Fade out, reload scene, fade in
Rebur.Scene.transition({ type: "fade", color: "#000000", duration: 1.0 });

// Transition to a different scene (if your game has multiple maps)
Rebur.Scene.transition({ targetScene: "Level2", type: "fade" });

// Restart current scene with optional delay
Rebur.Scene.restart({ delay: 2, fadeColor: "#000" });
\`\`\`

---

## Rebur.Debug

Runtime visual debug drawing (visible only in editor / debug builds).

\`\`\`js
Rebur.Debug.drawRay({ x:0,y:0,z:0 }, { x:1,y:0,z:0 }, { color: "#ff0000", duration: 2 });
Rebur.Debug.drawPoint({ x:0,y:5,z:0 }, { radius: 0.2, color: "#00ff00" });
Rebur.Debug.drawBox({ x:0,y:0,z:0 }, { x:2,y:2,z:2 }, { color: "#0088ff" });
Rebur.Debug.drawSphere({ x:0,y:10,z:0 }, 1.5, { color: "#ffaa00" });
Rebur.Debug.drawLine({ x:0,y:0,z:0 }, { x:5,y:5,z:5 }, { color: "#ffff00" });
Rebur.Debug.log("custom debug");
Rebur.Debug.clear();
\`\`\`

---

## Rebur.Particles

Emit visual particle effects.

\`\`\`js
Rebur.Particles.emit({ x: 0, y: 1, z: 0 }, { effectType: "sparkle", count: 20, color: "#ffdd00" });
Rebur.Particles.explosion({ x: 10, y: 2, z: 0 }, { count: 40, speed: 8 });
Rebur.Particles.muzzleFlash({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 });
Rebur.Particles.hit({ x: 5, y: 0, z: 5 });
Rebur.Particles.smoke({ x: 0, y: 0, z: 0 });
Rebur.Particles.sparkle({ x: 0, y: 0.5, z: 0 });
Rebur.Particles.fire({ x: 0, y: 0, z: 0 });
Rebur.Particles.pickup({ x: 0, y: 1, z: 0 });
Rebur.Particles.blood({ x: 0, y: 1, z: 0 });
Rebur.Particles.water({ x: 0, y: 0, z: 0 });
\`\`\`

---

## Timers

Global helper functions.

\`\`\`js
const cancel = after(2, () => log("2s later"));
cancel();

const stop = every(0.5, () => log("tick"));
stop();

// Async delay
await wait(1.5);
\`\`\`

---

## Logging

\`\`\`js
log("Hello", 42);
warn("Something odd");
error("Something broke");
\`\`\`

---

## Vector3 & Color3

\`\`\`js
const v = Vector3(1, 2, 3);
Vector3.zero(); Vector3.one(); Vector3.up(); Vector3.right(); Vector3.forward();
v.magnitude;
v.add(other).sub(other).scale(2).normalize();
v.dot(other); v.cross(other); v.distanceTo(other); v.lerp(other, 0.5);
v.equals(other); v.clone(); v.toArray();
Vector3.distance(a,b); Vector3.lerp(a,b,0.5); Vector3.reflect(v,n); Vector3.angle(a,b);

const col = Color3(1,0,0); // rgb(255,0,0)
Color3.fromHex("#ff8800");
Color3.lerp("#ff0000", "#0000ff", 0.5);
\`\`\`

---

## Quick Start Examples

See original examples in the first docs – they remain valid. Add new examples using the documented APIs where needed.

---

*End of updated scripting reference.*
`;