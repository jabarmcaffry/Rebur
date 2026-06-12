// docs.ts — DEFAULT_SCRIPT + full SCRIPTING_DOCS (updated to match new reference)

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
  lava.on("collision", (other, status) => {
    if (status === "start" && other.isPlayer) {
      other.health -= 25;
      log(other.username, "hit lava! HP:", other.health);
    }
  });
}
`;

export const SCRIPTING_DOCS = `Rebur Engine — Scripting Reference

All scripts run **server-side** inside a secure VM sandbox. The only global is **\`Rebur\`** — every subsystem hangs off it. Scripts cannot access the file system, Node.js internals, or the network directly.

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
11. [Rebur.Lighting — Environment & Lights](#reburlighting)
12. [Rebur.Assets — Asset Containers](#reburassets)
13. [Entity Lifetime & Validity](#entity-lifetime--validity)
14. [Rebur.Players — Player Entities](#reburplayers)
15. [Player Entity](#player-entity)
16. [Player GUI (per-player)](#player-gui)
17. [Player Data](#player-data)
18. [Player Input (per-player)](#player-input)
19. [Rebur.State — Shared Session State](#reburstate)
20. [Rebur.DataStore — Persistent Storage](#reburdatastore)
21. [Rebur.Gui — Global HUD](#reburgui)
22. [Rebur.Sound — Audio](#rebursound)
23. [Rebur.Tween — Property Animation](#reburtween)
24. [Rebur.Camera — Camera Control](#reburcamera)
25. [Rebur.Input — Global Keyboard & Mouse](#reburinput)
26. [Rebur.Physics — Global Physics & Gravity Fields](#reburphysics)
27. [Rebur.RunService — Game Loop](#reburrunservice)
28. [Rebur.Network — Multiplayer Messaging](#reburnetwork)
29. [Rebur.Tags — Tag System](#reburtags)
30. [Rebur.Math — Game Math Utilities](#reburmath)
31. [Rebur.Timer — Named Countdowns](#reburtimer)
32. [Rebur.Labels — World-Space 3D Text](#reburlabels)
33. [Rebur.Scene — Scene Transitions & Restart](#reburscene)
34. [Rebur.Debug — Runtime Visualisation](#reburdebug)
35. [Rebur.Gui — Visual GUI Designer](#reburgui-designer)
36. [Rebur.Workspace.raycast — Raycasting](#raycasting)
37. [Particles — Particle Emitters & Events](#particles)
38. [Timers](#timers)
39. [Logging](#logging)
40. [Vector3 & Color3](#vector3--color3)
41. [Quick Start Examples](#quick-start-examples)

---

## Architecture
Rebur ← single global
├── Workspace ← live 3D world: rendered + simulated entities
├── Lighting ← environment settings + light entities
├── Assets
│ ├── Shared ← assets replicated to all clients
│ └── Server ← server-only assets, never sent to clients
├── Players ← active player entities
├── State ← shared session key-value store (resets each session)
├── DataStore ← persistent cross-session storage
├── Gui ← shared HUD (all players see)
├── Sound ← audio playback
├── Tween ← property animation
├── Camera ← camera control
├── Input ← global keyboard/mouse events (all players)
├── Physics ← global physics settings & gravity fields
├── RunService ← game loop
├── Network ← server ↔ clients messaging
├── Tags ← entity tagging
├── Math ← helper math functions
├── Timer ← named countdowns
├── Labels ← world-space 3D text labels
├── Scene ← scene transitions / restart
└── Debug ← runtime debug drawing

player ← a PlayerEntity (also an Entity)
├── player.gui ← per-player private HUD
├── player.data ← per-player persistent data store
└── player.input ← per-player held keys + edge events

**Key rules:**
- \`Rebur\` is the **primary** engine global — all subsystems hang off it.
- A small safe **utility global set** is also exposed: \`after\`, \`every\`, \`wait\`, \`Vector3\`, \`Color3\`, \`log\`, \`warn\`, \`error\`, \`random\`, \`randInt\`, \`pick\`. Everything else requires \`Rebur.\`.
- All entities (including players) share the same base API — players are entities with \`isPlayer = true\`.
- Cross-container interaction is **explicit** — there is no hidden magic coupling.

---

## Script Contexts

Rebur scripts execute in a **server-side** context. The server is the authority on all game state, which prevents cheating and keeps the model simple.

### Current: Server Scripts (all scripts today)

- Run on the server, have full access to all \`Rebur.*\` APIs.
- Entity positions, physics, collisions — all authoritative here.

### Client-Bound APIs (currently server-proxied)

Some APIs are conceptually per-player/client but are bridged through the server:

| API | Concept | Current behaviour |
|-----|---------|-------------------|
| \`Rebur.Input\` | Per-player keyboard/mouse | Server receives player input events, forwarded to scripts |
| \`Rebur.Camera\` | Per-player camera | Server sets camera params, pushed to each client |
| \`Rebur.Network.send()\` | Server → clients | Server can send to specific players or broadcast |
| \`player.gui\` | Per-player UI | Server calls it, engine routes to the correct client |
| \`player.input\` | Per-player held keys | Server tracks per-player key states |

> \`Rebur.Input.on("press", (player, key) => {})\` fires on the server when **any** player presses a key. The callback always tells you which player acted.

### ClientScript (Client-Side)

A \`ClientScript\` runs in each player's browser. It is ideal for local HUD updates, camera effects, and immediate input handling. Place them in **GUI** or **StarterCharacter** containers.
- Conceptually similar to Server scripts but runs on the client.
- Use for high-frequency UI updates or local-only visual effects.
- Accesses the same \`Rebur\` global, but some authoritative APIs (like Physics) are read-only.

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
const platform = Rebur.Workspace.find("Platform");
if (platform) {
  platform.on("collision", (other, status, impulse) => {
    if (status === "start") log("Platform hit by", other.name);
  });
}
\`\`\`
Key principle: Avoid blocking loops (while(true)). Use events and timers instead.

## Rebur Global Events
Subscribe with Rebur.on(event, handler). Returns an unsubscribe function.

| Event | When | Handler receives |
| :--- | :--- | :--- |
| "tick" | Every physics step (~20 Hz) | dt (seconds) |
| "playerJoined" | A player connects | player entity |
| "playerLeft" | A player disconnects | player entity |
| "entityAdded" | Any entity added to the world | entity |
| "entityRemoved" | Any entity removed from the world | entity |

\`\`\`js
Rebur.on("tick", (dt) => {
  // runs every physics step
});

Rebur.on("playerJoined", (player) => {
  log(player.username, "joined!");
});

Rebur.on("playerLeft", (player) => {
  log(player.username, "left");
});

const unsub = Rebur.on("entityAdded", (entity) => {
  log("new entity:", entity.name);
});
unsub(); // stop listening
\`\`\`

## Entities
Everything in the Rebur world is an entity — parts, models, players, lights, audio sources. They all share the same base API. Players are entities with isPlayer = true.

Entities are identified by:

id — immutable unique string (use for long-lived references)

name — mutable display name (use for lookup via Rebur.Workspace.find())

hierarchy — parent/child relationships

\`\`\`js
const part = Rebur.Workspace.find("Platform");
if (!part) return; // always guard — entity may not exist

log(part.id);       // "abc-123" (immutable)
log(part.name);     // "Platform"
log(part.type);     // "primitive", "model", "light", "audio", etc.
log(part.isPlayer); // false for non-player entities
\`\`\`

## Entity Properties
All properties use lowercase camelCase. Readable and writable unless noted.

### position · rotation · scale
Transforms are mutable proxied objects. Mutate individual axes in-place or assign a whole new object — both are valid and both replicate to clients.

\`\`\`js
const e = Rebur.Workspace.find("Part");

// Read
log(e.position.x, e.position.y, e.position.z);

// Mutate in place
e.position.y = 5;
e.rotation.y += 0.1;
e.scale.x    = 2;

// Assign a whole new object
e.position = { x: 0, y: 5, z: 0 };
e.rotation = { x: 0, y: Math.PI / 2, z: 0 }; // radians
e.scale    = { x: 2, y: 2, z: 2 };
\`\`\`
Players: player.position is writable (teleports instantly). player.rotation is writable for yaw (y) only — pitch and roll are ignored.

### color · visible · transparency
\`\`\`js
e.color        = "#ff0000";   // CSS hex, rgb(), named
e.visible      = false;
e.transparency = 0.5;         // 0 = opaque, 1 = invisible
\`\`\`

### health · maxHealth
Simple numeric health. No built-in death or auto-destroy — you implement that by watching health and calling destroy() if needed.

\`\`\`js
const crate = Rebur.Workspace.find("Crate");
crate.maxHealth = 50;
crate.health = 50;
crate.health -= 20;   // damage
crate.health += 5;    // heal
crate.health = 0;     // kill (health is clamped to 0)
\`\`\`
- health (read/write) — current HP, automatically clamped to [0, maxHealth]
- maxHealth (read/write) — max HP, default 100

Note: Setting health below 0 does not automatically destroy the entity. Your script must check health <= 0 and call entity.destroy() if desired.

### parent · children · hierarchy
\`\`\`js
// Get parent
const parent = e.parent; // Entity | null

// Get children
const kids = e.children; // Entity[]

// Reparent (keeps world position by default)
e.setParent(otherEntity);
e.setParent(otherEntity, { keepWorldPosition: false }); // local-space snap

// Detach from parent (moves to workspace root)
e.setParent(null);

// Walk descendants
e.descendants(); // Entity[] — all children, recursively

// Find a named child
e.find("Wheel_FL"); // Entity | null — searches this entity's subtree
\`\`\`
Parenting and physics: A child entity inherits the parent's transform. If a parent is moved, all children follow. Physics bodies on children are simulated in world space regardless of hierarchy.

### name · id · type (read-only)
\`\`\`js
log(e.id);      // unique id — never changes
log(e.name);    // display name
log(e.type);    // "primitive" | "model" | "light" | "audio" | ...
e.name = "NewName";
\`\`\`

### isPlayer (read-only)
\`\`\`js
entity.on("collision", (other, status) => {
  if (status === "start" && other.isPlayer) {
    log("A player collided with this");
  }
});
\`\`\`

## Entity Physics Body
Physics lives on entity.body.

### body properties
| Property | Type | Description |
| :--- | :--- | :--- |
| body.anchored | boolean | Static collider — no physics movement |
| body.canCollide | boolean | Participates in collision detection |
| body.mass | number | Mass in kg (default 1) |
| body.friction | number | Surface friction (default 0.5) |
| body.restitution | number | Bounciness 0–1 (default 0) |
| body.isKinematic | boolean | Script-moved; not affected by forces |
| body.velocity | {x,y,z} | Current velocity — read/write |
| body.angularVelocity | {x,y,z} | Rotational velocity (rad/s) — read/write |
| body.linearDamping | number | Linear drag coefficient (default 0) |
| body.angularDamping | number | Angular drag coefficient (default 0.05) |
| body.constraints | object | Lock individual position/rotation axes — see below |

\`\`\`js
const box = Rebur.Workspace.find("Crate");
box.body.anchored        = false;
box.body.mass            = 5;
box.body.friction        = 0.4;
box.body.restitution     = 0.2;
box.body.linearDamping   = 0.1;
box.body.angularDamping  = 0.2;
\`\`\`

### body.constraints
Lock individual axes to prevent unwanted movement — useful for 2D games, top-down games, doors constrained to a hinge, etc.

\`\`\`js
// Lock all rotation (won't tip over)
box.body.constraints = {
  lockRotationX: true,
  lockRotationY: true,
  lockRotationZ: true,
};

// Lock Y position (slides only on XZ plane — top-down game)
box.body.constraints = {
  lockPositionY: true,
};

// Lock everything except Y (elevator shaft)
box.body.constraints = {
  lockPositionX: true,
  lockPositionZ: true,
  lockRotationX: true,
  lockRotationY: true,
  lockRotationZ: true,
};
\`\`\`
Available keys: lockPositionX, lockPositionY, lockPositionZ, lockRotationX, lockRotationY, lockRotationZ.

### body methods
\`\`\`js
body.applyForce({ x: 0, y: 50, z: 0 });          // continuous force
body.applyImpulse({ x: 0, y: 10, z: 0 });         // instant velocity change
body.applyForceAtPoint(force, worldPoint);         // force at an offset (torque included)
body.applyImpulseAtPoint(impulse, worldPoint);     // impulse at an offset
body.applyTorque({ x: 0, y: 10, z: 0 });          // rotational force
body.applyAngularImpulse({ x: 0, y: 5, z: 0 });   // instant angular velocity change
body.clearForces();                                // zero all accumulated forces
\`\`\`

### Joints & Constraints
Joints connect two physics bodies. All joints are created via Rebur.Physics.createJoint(type, bodyA, bodyB, opts) and return a joint handle.

\`\`\`js
// Hinge joint — one rotational degree of freedom (door, wheel)
const hinge = Rebur.Physics.createJoint("hinge", doorBody, frameBody, {
  anchor: { x: -1, y: 0, z: 0 },   // pivot point in world space
  axis:   { x: 0, y: 1, z: 0 },    // rotation axis
  limits: { min: 0, max: Math.PI / 2 }, // optional angle limits (radians)
  motor: { speed: 0, maxForce: 0 },     // optional motor (set speed ≠ 0 to drive)
});

// Fixed joint — weld two bodies together
const weld = Rebur.Physics.createJoint("fixed", partA, partB);

// Slider / prismatic joint — one translational DOF (elevator, piston)
const slider = Rebur.Physics.createJoint("slider", pistonBody, frameBody, {
  axis:   { x: 0, y: 1, z: 0 },
  limits: { min: 0, max: 4 },
  motor: { speed: 2, maxForce: 500 },
});

// Spring joint — soft connection between two bodies
const spring = Rebur.Physics.createJoint("spring", bodyA, bodyB, {
  anchor:       { x: 0, y: 0, z: 0 },
  stiffness:    80,
  damping:      10,
  restLength:   2,
});

// Ball-and-socket joint — free rotation in all axes (ragdoll limb)
const ball = Rebur.Physics.createJoint("ball", limbA, torso, {
  anchor: { x: 0, y: 1, z: 0 },
  limits: { coneAngle: Math.PI / 4 }, // optional twist/cone limits
});

// Distance joint — keeps two bodies within a length range (chain link, rope)
const chain = Rebur.Physics.createJoint("distance", linkA, linkB, {
  minDistance: 0,
  maxDistance: 1.5,
});
\`\`\`
Joint handle methods:

\`\`\`js
hinge.setMotor({ speed: 2, maxForce: 300 }); // update motor at runtime
hinge.setLimits({ min: -Math.PI, max: Math.PI });
hinge.getAngle();     // current angle in radians (hinge/slider)
hinge.getForce();     // current reaction force vector
hinge.enabled = false; // disable without destroying
hinge.destroy();      // remove joint
\`\`\`

## Entity Gravity Source
Any entity can act as a gravity source by setting its gravity property. This pulls physics bodies towards its center (radial) or along an axis (directional).

\`\`\`js
const planet = Rebur.Workspace.find("Planet");
planet.gravity = {
  strength:  20,       // pull force
  radius:    50,       // influence range
  direction: null,     // null = radial pull toward center; or {x,y,z} for directional
};

// Disable
planet.gravity = false;
\`\`\`

## Entity Events
Subscribe with entity.on(event, handler). Returns an unsubscribe function.

| Event | When | Handler receives |
| :--- | :--- | :--- |
| "collision" | Hits another entity | other, status ("start"/"end"), impulse |
| "click" | Player clicks this entity | player |
| "destroy" | Entity is removed | — |
| "died" | Entity health hits 0 | — |

\`\`\`js
const button = Rebur.Workspace.find("Button");
button.on("click", (player) => {
  log(player.username, "clicked the button!");
});

const wall = Rebur.Workspace.find("Wall");
wall.on("collision", (other, status, impulse) => {
  if (status === "start") log("Hit by", other.name, "with force", impulse);
});
\`\`\`

## Rebur.Workspace
The live container for all 3D entities.

### Rebur.Workspace.find(name) → entity | null
\`\`\`js
const e = Rebur.Workspace.find("Part");
\`\`\`

### Rebur.Workspace.get(id) → entity | null
\`\`\`js
const e = Rebur.Workspace.get("abc-123");
\`\`\`

### Rebur.Workspace.all() → entity[]
\`\`\`js
for (const e of Rebur.Workspace.all()) {
  if (e.type === "primitive") e.color = "#00ff00";
}
\`\`\`

### Rebur.Workspace.query(filter) → entity[]
\`\`\`js
const enemies = Rebur.Workspace.query({ tag: "enemy" });
const items   = Rebur.Workspace.query({ type: "model", name: "HealthPack" });
\`\`\`

### Rebur.Workspace.raycast(origin, direction, opts?) → hit | null
\`\`\`js
const hit = Rebur.Workspace.raycast(
  { x: 0, y: 5, z: 0 },
  { x: 0, y: -1, z: 0 },
  { maxDistance: 10, exclude: [player] }
);
if (hit) {
  log("Hit", hit.entity.name, "at", hit.position);
}
\`\`\`

### Rebur.Workspace.create(type, props?) → entity
\`\`\`js
const box = Rebur.Workspace.create("primitive", {
  primitiveType: "cube",
  position: { x: 0, y: 10, z: 0 },
  color: "#888888",
  anchored: false,
  canCollide: true,
});
\`\`\`

### Rebur.Workspace.clone(sourceName, overrides?) → entity | null
\`\`\`js
const copy = Rebur.Workspace.clone("Tree", {
  name: "Tree2",
  position: { x: 10, y: 0, z: 5 },
});
\`\`\`

### entity.destroy()
Removes the entity from the world. Fires the "destroy" event.

\`\`\`js
const wall = Rebur.Workspace.find("OldWall");
if (wall) wall.destroy();
\`\`\`

## Rebur.Lighting
Container for environment settings and light entities. All properties below affect the global scene look.

\`\`\`js
// Environment settings
Rebur.Lighting.skyColor         = "#87CEEB";
Rebur.Lighting.fogColor         = "#ffffff";
Rebur.Lighting.fogDensity       = 0.02;
Rebur.Lighting.fogNear          = 10;
Rebur.Lighting.fogFar           = 100;
Rebur.Lighting.ambientColor     = "#404040";
Rebur.Lighting.ambientIntensity = 0.5;
Rebur.Lighting.sunColor         = "#ffffff";
Rebur.Lighting.sunIntensity     = 1.0;
Rebur.Lighting.sunDirection     = { x: 0.5, y: -1, z: 0.5 };
Rebur.Lighting.shadowsEnabled   = true;
Rebur.Lighting.timeOfDay        = 14; // 0–24, affects sun angle if auto-updated

// Light entities (individual lights)
const lamp = Rebur.Lighting.find("StreetLamp");
if (lamp) lamp.color = "#ffaa66";
\`\`\`
Rebur.Lighting.find() works the same as Rebur.Workspace.find() but only returns light entities.

## Rebur.Assets
Read-only templates. Assets/Shared entities are replicated to all clients; Assets/Server are server-only.

\`\`\`js
const template = Rebur.Assets.Shared.find("CarBody");
const car = Rebur.Workspace.clone(template.name, { position: { x:0,y:1,z:0 } });
\`\`\`

## Entity Lifetime & Validity
\`\`\`js
if (!coin.destroyed) coin.visible = false;

coin.on("collision", (other, status) => {
  if (coin.destroyed) return; // guard against same-frame double-fire
});
\`\`\`

## Rebur.Players
### Rebur.Players.all() → player[]
\`\`\`js
const players = Rebur.Players.all();
\`\`\`

### Rebur.Players.find(username) → player | null
\`\`\`js
const alice = Rebur.Players.find("Alice");
\`\`\`

### Rebur.Players.get(id) → player | null
\`\`\`js
const player = Rebur.Players.get(someId);
\`\`\`

### Rebur.Players.count → number
\`\`\`js
if (Rebur.Players.count >= 2) startMatch();
\`\`\`

### Rebur.Players.closest(position, exclude?) → player | null
\`\`\`js
const nearest = Rebur.Players.closest(turret.position, [turret]);
\`\`\`

## Player Entity
A player is an entity with isPlayer = true plus additional properties and methods.

### Player Properties
| Property | Type | Read | Write | Description |
| :--- | :--- | :--- | :--- | :--- |
| id | string | ✓ | — | Immutable session id |
| username | string | ✓ | — | Display name |
| isPlayer | boolean | ✓ | — | Always true |
| position | {x,y,z} | ✓ | ✓ | World position (write teleports instantly) |
| rotation | {x,y,z} | ✓ | ✓ | Only yaw (y) is applied; pitch/roll ignored |
| health | number | ✓ | ✓ | Current HP (0–maxHealth) |
| maxHealth | number | ✓ | ✓ | Max HP (default 100) |
| speed | number | ✓ | ✓ | Movement speed in units/s (default 6). Used by default character controller. |
| jump | number | ✓ | ✓ | Jump force (default 8). Used by default character controller. |
| color | string | ✓ | ✓ | Appearance color |
| gui | PlayerGuiAPI | ✓ | — | Private per-player HUD |
| data | PlayerDataAPI | ✓ | — | Persistent per-player storage |
| input | PlayerInputAPI | ✓ | — | Per-player held keys + edge events |

Note: The built‑in character controller respects player.speed and player.jump. Set player.body.isKinematic = true to take full manual control.

### Player Transform
\`\`\`js
player.position = { x: 100, y: 20, z: 0 };
player.rotation = { x: 0, y: Math.PI / 2, z: 0 }; // only yaw applied
\`\`\`

### player.body
Players have a body object with physics properties:

| Property | Description |
| :--- | :--- |
| body.velocity | Current velocity — read/write |
| body.isKinematic | When true, physics is skipped — scripts fully control position/velocity |

\`\`\`js
// Set player velocity
player.body.velocity = { x: 10, y: 0, z: 0 };
// Make player kinematic
player.body.isKinematic = true;
\`\`\`

## Player GUI (per-player)
player.gui — private HUD visible only to that player. API identical to Rebur.Gui.

\`\`\`js
Rebur.on("playerJoined", (player) => {
  player.gui.text("score", "Score: 0", { anchor: "tl", x: 20, y: 20 });
});

player.gui.button("action", "Use", { anchor: "cc" }, () => {
  // callback runs on server when player clicks
});

player.gui.input("name-entry", { placeholder: "Enter name…" }, (text) => {
  log("Player entered:", text);
});

player.gui.image("crosshair", "crosshair.png", { anchor: "cc", width: 16, height: 16 });

player.gui.clear("score"); // remove one element
player.gui.clear();     // remove all
\`\`\`

### GUI element options (all elements)
| Option | Type | Description |
| :--- | :--- | :--- |
| anchor | string | Position anchor: "tl" "tc" "tr" "cl" "cc" "cr" "bl" "bc" "br" |
| x | number | Horizontal offset from anchor in pixels |
| y | number | Vertical offset from anchor in pixels |
| width | number | Element width in pixels |
| height | number | Element height in pixels |
| visible | boolean | Show/hide |
| zIndex | number | Stacking order |
| opacity | number | 0–1 |

### text options
| Option | Type | Description |
| :--- | :--- | :--- |
| size | number | Font size in pixels |
| color | string | Text color (CSS) |
| font | string | Font family |
| align | string | "left" "center" "right" |
| bold | boolean | |
| shadow | boolean | Drop shadow |

### bar options
| Option | Type | Description |
| :--- | :--- | :--- |
| color | string | Fill color |
| bg | string | Background color |
| radius | number | Corner radius |
| direction | string | "horizontal" (default) or "vertical" |

## Player Data
player.data — persistent per-player storage (backed by DataStore).

\`\`\`js
const coins = player.data.get("coins") ?? 0;
player.data.set("coins", coins + 10);
player.data.increment("xp", 50);
player.data.decrement("deaths");
player.data.has("questFlag");  // boolean
player.data.delete("tempKey");
player.data.getAll();          // object copy
\`\`\`

## Player Input (per-player)
player.input — query held keys and listen for edge events for this specific player.

\`\`\`js
// Poll in tick
Rebur.on("tick", (dt) => {
  for (const p of Rebur.Players.all()) {
    if (p.input.key("w")) log(p.username, "moving forward");
  }
});

// Edge events
player.input.on("press", (key) => {
  if (key === "e") log("interact pressed");
});
player.input.on("release", (key) => log("released", key));

// Mouse
log(player.input.mouse.x, player.input.mouse.y); // normalized device coords (-1..1)

// Raw mouse delta (for camera look, free-look, etc.)
player.input.on("mousemove", (dx, dy) => {
  log("mouse moved", dx, dy);
});

// Mouse button events
player.input.on("mousedown", (button) => {
  // button: 0 = left, 1 = middle, 2 = right
});
player.input.on("mouseup", (button) => {});

// Scroll
player.input.on("scroll", (delta) => {
  log("scroll", delta); // positive = up, negative = down
});

// Gamepad (if connected)
log(player.input.gamepad.axis("leftStick")); // { x, y }
log(player.input.gamepad.axis("rightStick"));
log(player.input.gamepad.button("a"));       // boolean (held)
player.input.gamepad.on("press",   (btn) => {});
player.input.gamepad.on("release", (btn) => {});
\`\`\`
Key names: "a"–"z", "0"–"9", "space", "shift", "control", "alt", "enter", "escape", "tab", "backspace", "arrowup", "arrowdown", "arrowleft", "arrowright", "f1"–"f12".

Gamepad button names: "a", "b", "x", "y", "lb", "rb", "lt", "rt", "start", "select", "dpadUp", "dpadDown", "dpadLeft", "dpadRight".

## Rebur.State
Shared session key-value store (resets when session ends). Reactive.

\`\`\`js
Rebur.State.set("score", 0);
Rebur.State.get("score");           // current value
Rebur.State.increment("score", 5);
Rebur.State.decrement("lives");
Rebur.State.setTemporary("buff", true, 10); // auto-deletes after 10s

const unsub = Rebur.State.on("score", (val, prev) => {
  log("Score changed from", prev, "to", val);
});

Rebur.State.delete("temp");
Rebur.State.keys();    // string[]
Rebur.State.getAll();  // object copy
\`\`\`

## Rebur.DataStore
Persistent cross-session storage.

\`\`\`js
Rebur.DataStore.set("worldRecord", { name: "Alice", score: 9999 });
const record = Rebur.DataStore.get("worldRecord");
Rebur.DataStore.increment("totalGames", 1);
Rebur.DataStore.decrement("attemptsLeft");
Rebur.DataStore.has("flag");  // boolean
Rebur.DataStore.delete("key");
Rebur.DataStore.keys();       // string[]
\`\`\`

## Rebur.Gui
Global HUD (all players see). API identical to player.gui.

### GUI Element Types
- **text**: Display labels.
- **button**: Clickable elements with callbacks.
- **bar**: Progress/health bars.
- **image**: Display textures/icons.
- **frame**: Containers for other elements with backgrounds and borders.

### GUI Methods
\`\`\`js
// Create elements
Rebur.Gui.text("id", "Hello", { anchor: "center", color: "#ffffff" });
Rebur.Gui.button("btn", "Click Me", { anchor: "bottomCenter", y: -50 }, () => log("Clicked!"));
Rebur.Gui.frame("bg", { width: 300, height: 200, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10 });

// Styling Options
// anchor: "topLeft", "topCenter", "topRight", "centerLeft", "center", "centerRight", "bottomLeft", "bottomCenter", "bottomRight"
// x, y: Offsets from anchor
// width, height: Size in pixels
// zIndex: Stacking order
// opacity: 0-1
// borderRadius: Corner rounding
// borderWidth, borderColor: Border styling
// shadow: boolean (drop shadow)

Rebur.Gui.clear("id"); // Remove specific element
Rebur.Gui.clear();     // Remove all global GUI
\`\`\`

## Rebur.Workspace.raycast — Raycasting
Detect objects along a line in 3D space.

\`\`\`js
const origin = { x: 0, y: 5, z: 0 };
const direction = { x: 0, y: -1, z: 0 };
const hit = Rebur.Workspace.raycast(origin, direction, { 
  maxDistance: 100,
  ignore: [someEntity] // optional array of entities to ignore
});

if (hit) {
  log("Hit:", hit.entity.name);
  log("Position:", hit.position); // world position of hit
  log("Normal:", hit.normal);     // surface normal at hit
  log("Distance:", hit.distance); // distance from origin
}
\`\`\`

## Particles
Visual effects system using emitters and one-shot events.

### Particle Emitters (Persistent)
Create a **ParticleEmitter** object in the editor to have continuous effects.
- **rate**: Particles per second.
- **lifetime**: How long each particle lasts.
- **effectType**: "smoke", "fire", "sparkle", "explosion", "custom".

### Particle Events (One-shot)
Trigger bursts from scripts:
\`\`\`js
// Burst at position
Rebur.Workspace.emitParticles({ x: 0, y: 5, z: 0 }, {
  effectType: "explosion",
  count: 50,
  speed: 10,
  color: "#ffaa00"
});

// Attach to entity
entity.emitParticles({ effectType: "smoke", count: 10 });
\`\`\`

## Rebur.Sound
\`\`\`js
// Global sound (all players)
Rebur.Sound.play("collect", { volume: 0.8, loop: false, pitch: 1.0 });

// Positional 3D sound at a world position
Rebur.Sound.playAt("explosion", { x: 10, y: 5, z: 0 }, { maxDistance: 30, rolloff: 1 });

// Sound for a specific player only
Rebur.Sound.playForPlayer(player, "notification", { volume: 1.0 });

// Stop
Rebur.Sound.stop("collect");

// Fade volume
Rebur.Sound.fade("music", 0, 2); // fade to volume 0 over 2s
\`\`\`

## Rebur.Tween
\`\`\`js
// Basic tween
const cancel = Rebur.Tween(entity.position, { y: 10 }, 2, "easeOutQuad", () => {
  log("Done!");
});
cancel(); // cancel early

// Chain tweens
Rebur.Tween(entity.position, { y: 10 }, 2)
  .thenSelf({ y: 0 }, 2, "bounce")
  .thenSelf({ x: 5 }, 1);

// Tween any numeric property
Rebur.Tween(entity, { transparency: 1 }, 0.5, "linear");

// Custom easing function
Rebur.Tween(entity, { transparency: 0.5 }, 1, (t) => t * t);
\`\`\`
Built-in easings: "linear", "easeInQuad", "easeOutQuad", "easeInOutQuad", "easeInCubic", "easeOutCubic", "easeInOutCubic", "easeInSine", "easeOutSine", "easeInOutSine", "easeInExpo", "easeOutExpo", "easeInBack", "easeOutBack", "spring", "bounce", "elastic".

## Rebur.Camera
The engine provides a default third‑person follow camera for each player. Scripts can override any aspect — globally or per player — using the API below. There are no hard‑coded camera modes; you build your desired behavior by setting position, lookAt, and follow targets.

\`\`\`js
// Global defaults (applied to all players)
Rebur.Camera.position = { x: 0, y: 20, z: 30 };
Rebur.Camera.lookAt   = { x: 0, y: 0, z: 0 };
Rebur.Camera.fov      = 70;

// Per‑player override
Rebur.Camera.setForPlayer(player, {
  position: { x: 10, y: 5, z: 10 },  // absolute world position (optional)
  lookAt:   { x: 0, y: 0, z: 0 },    // point to look at (optional)
  follow:   someEntity,               // camera follows this entity (optional)
  offset:   { x: 0, y: 2, z: 5 },    // offset from follow target (optional)
  fov:      75,                       // field of view in degrees (optional)
});

// Clear per‑player override (reverts to global/default)
Rebur.Camera.clearForPlayer(player);

// Apply a setting to all players at once
Rebur.Camera.setForAll({ fov: 90 });

// Camera shake (affects all players unless player specified)
Rebur.Camera.shake({ intensity: 0.5, duration: 0.3 });
Rebur.Camera.shake({ player, intensity: 1.0 });

// Get the forward ray from a player's camera
const ray = Rebur.Camera.getForwardRay(player);
if (ray) {
  const hit = Rebur.Workspace.raycast(ray.origin, ray.direction);
}

// Convenience raycast from player camera
const hit = Rebur.Camera.raycast(player, { maxDistance: 50 });
\`\`\`
Default behaviour (when no script overrides):

Each player’s camera follows their character from a third‑person perspective.

Distance and offset are engine‑defined but can be completely replaced by script.

## Rebur.Input
Global input events (any player). Callback always receives (player, ...).

\`\`\`js
Rebur.Input.on("press", (player, key) => {
  log(player.username, "pressed", key);
});
Rebur.Input.on("release", (player, key) => {});
Rebur.Input.on("click", (player, entity) => {
  if (entity) log(player.username, "clicked", entity.name);
});
Rebur.Input.on("mousemove", (player, dx, dy) => {});
Rebur.Input.on("scroll", (player, delta) => {});

// Is any player currently holding a key?
Rebur.Input.key("w"); // boolean
\`\`\`
Note: The global "click" event fires for any click on an entity. For entity‑specific handling, you can also use entity.on("click", player => {}). The two are independent – they do not conflict or double‑fire.

## Rebur.Physics
Global physics settings, gravity fields, and joint creation.

\`\`\`js
Rebur.Physics.gravity    = 9.81;  // downward acceleration (default 28)
Rebur.Physics.airDrag    = 0.01;  // global air resistance
Rebur.Physics.timeScale  = 1.0;   // simulation speed multiplier (0.5 = slow-mo, 0 = paused)

// Gravity field (static world-space position)
const field = Rebur.Physics.setGravityField({
  position:  { x: 0, y: 0, z: 0 },
  radius:    30,
  strength:  20,
  direction: null, // null = radial pull toward center; or {x,y,z} for directional
});
field.enabled = false;
field.remove();
\`\`\`

### Rebur.Physics.createJoint
See Joints & Constraints above.

## Rebur.RunService
Currently only "tick" is implemented. Use Rebur.on("tick", fn) instead.

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
  // payload = client-sent data; sender = PlayerEntity
});
\`\`\`
ClientScript is not yet implemented — client → server messages are not yet possible.

## Rebur.Tags
\`\`\`js
Rebur.Tags.add(entity, "enemy");
Rebur.Tags.add(entity, "boss");
Rebur.Tags.has(entity, "enemy");  // true
Rebur.Tags.all(entity);           // ["enemy", "boss"]
Rebur.Tags.get("boss");           // Entity[] — all entities with this tag
Rebur.Tags.remove(entity, "boss");

// Query via Workspace
const enemies = Rebur.Workspace.query({ tag: "enemy" });
\`\`\`

## Rebur.Math
\`\`\`js
Rebur.Math.clamp(15, 0, 10);               // 10
Rebur.Math.lerp(0, 10, 0.5);               // 5
Rebur.Math.invLerp(0, 10, 5);              // 0.5
Rebur.Math.remap(5, 0, 10, 0, 100);        // 50
Rebur.Math.smoothstep(0, 1, 0.7);          // ~0.9
Rebur.Math.angleDiff(0, Math.PI);          // ~3.14
Rebur.Math.lerpAngle(0, Math.PI*2, 0.5);   // PI
Rebur.Math.deg2rad(180);                   // PI
Rebur.Math.rad2deg(Math.PI);               // 180
Rebur.Math.dist2d(0, 0, 3, 4);             // 5
Rebur.Math.dist3d({x:0,y:0,z:0}, {x:3,y:4,z:0}); // 5
Rebur.Math.wrap(10, 0, 5);                 // 0
Rebur.Math.sign(-5);                       // -1
Rebur.Math.moveTowards(5, 10, 3);          // 8
Rebur.Math.bearing({x:0,z:0}, {x:1,z:1}); // 0.785 rad

// Spring simulation (call in tick)
const vel = { v: 0 };
let y = 0;
Rebur.on("tick", (dt) => {
  y = Rebur.Math.spring(y, targetY, vel, 10, 1, dt);
});

Rebur.Math.ease("bounce", 0.7);    // evaluate a named easing
Rebur.Math.easings;                // map of all easing functions

// Vector helpers
Rebur.Math.normalize({ x:3,y:0,z:4 });           // { x:0.6,y:0,z:0.8 }
Rebur.Math.dot(a, b);
Rebur.Math.cross(a, b);
Rebur.Math.magnitude({ x:3,y:4,z:0 });           // 5
Rebur.Math.projectOnPlane(vector, normal);
Rebur.Math.reflect(vector, normal);
Rebur.Math.lookRotation(forward, up?);            // { x,y,z } euler rotation
Rebur.Math.randomInSphere(radius);                // random point in sphere
Rebur.Math.randomOnCircle(radius);                // random point on XZ circle
\`\`\`

## Rebur.Timer
\`\`\`js
const timer = Rebur.Timer.countdown("round", 60, () => {
  log("Round ended!");
});

log(timer.remaining);  // seconds left
timer.stop();
timer.pause();
timer.resume();
timer.reset(90);        // reset to a new duration

const remaining = Rebur.Timer.get("round"); // 0 if not exist
Rebur.Timer.stop("round");                  // stop by name
\`\`\`

## Rebur.Labels
World-space 3D text labels (billboards).

\`\`\`js
const label = Rebur.Labels.create("sign1", "Hello", { x: 0, y: 2, z: 0 }, {
  color:           "#ffff00",
  fontSize:        16,
  backgroundColor: "#000000aa",
  faceCamera:      true,
});

label.text     = "New text";
label.position = { x: 5, y: 2, z: 0 };
label.visible  = false;
label.attach(entity);  // follows entity
label.detach();
label.destroy();

Rebur.Labels.get("sign1");
Rebur.Labels.delete("sign1");
Rebur.Labels.clear();
\`\`\`

## Rebur.Scene
\`\`\`js
// Fade out, reload, fade in
Rebur.Scene.transition({ type: "fade", color: "#000000", duration: 1.0 });

// Transition to a different scene
Rebur.Scene.transition({ targetScene: "Level2", type: "fade" });

// Restart current scene
Rebur.Scene.restart({ delay: 2, fadeColor: "#000" });
\`\`\`

## Rebur.Debug
Runtime visual debug drawing (visible only in editor / debug builds).

\`\`\`js
Rebur.Debug.drawRay({ x:0,y:0,z:0 }, { x:1,y:0,z:0 }, { color: "#ff0000", duration: 2 });
Rebur.Debug.drawPoint({ x:0,y:5,z:0 }, { radius: 0.2, color: "#00ff00" });
Rebur.Debug.drawBox({ x:0,y:0,z:0 }, { x:2,y:2,z:2 }, { color: "#0088ff" });
Rebur.Debug.drawSphere({ x:0,y:10,z:0 }, 1.5, { color: "#ffaa00" });
Rebur.Debug.drawLine({ x:0,y:0,z:0 }, { x:5,y:5,z:5 }, { color: "#ffff00" });
Rebur.Debug.drawCapsule(start, end, radius, { color: "#ff00ff" });
Rebur.Debug.log("custom debug note");
Rebur.Debug.clear();
\`\`\`

## Timers
\`\`\`js
const cancel = after(2, () => log("2s later"));
cancel(); // cancel before it fires

const stop = every(0.5, () => log("ping"));
stop(); // stop repeating

await wait(1.5); // async delay
\`\`\`

## Logging
\`\`\`js
log("Hello", 42);
warn("Something unexpected");
error("Something broke");
\`\`\`

## Vector3 & Color3
\`\`\`js
const v = Vector3(1, 2, 3);
Vector3.zero();    // {x:0,y:0,z:0}
Vector3.one();
Vector3.up();
Vector3.right();
Vector3.forward();

v.magnitude;
v.add(other);
v.sub(other);
v.scale(2);
v.normalize();
v.dot(other);
v.cross(other);
v.distanceTo(other);
v.lerp(other, 0.5);
v.equals(other);
v.clone();
v.toArray();

Vector3.distance(a, b);
Vector3.lerp(a, b, 0.5);
Vector3.reflect(v, normal);
Vector3.angle(a, b);
Vector3.project(v, onto);

const col = Color3(1, 0, 0);         // rgb(255,0,0)
Color3.fromHex("#ff8800");
Color3.lerp("#ff0000", "#0000ff", 0.5);
\`\`\`

## Quick Start Examples
### Raycasting from the camera
\`\`\`js
Rebur.Input.on("press", (player, key) => {
  if (key !== " ") return;
  const hit = Rebur.Camera.raycast(player, { maxDistance: 100 });
  if (!hit) return;
  log(player.username, "hit", hit.entity.name);
});
\`\`\`

### AOE damage using health property
\`\`\`js
function explodeAt(position, radius, damage) {
  for (const t of Rebur.Workspace.all()) {
    const dist = Rebur.Math.dist3d(t.position, position);
    if (dist < radius) {
      t.health -= damage;
      if (t.health <= 0) t.destroy();
    }
  }
  Rebur.Sound.playAt("explosion", position, { maxDistance: 40 });
}
\`\`\`

### E‑key interaction (polling)
\`\`\`js
const chest = Rebur.Workspace.find("Chest");
Rebur.on("tick", () => {
  for (const p of Rebur.Players.all()) {
    if (p.input.key("e") && Rebur.Math.dist3d(p.position, chest.position) < 2) {
      log(p.username, "opened the chest");
    }
  }
});
\`\`\`

### Per-player HUD bar
\`\`\`js
Rebur.on("playerJoined", (player) => {
  player.gui.bar("hp", player.health, player.maxHealth, {
    anchor: "bl", x: 20, y: 20, width: 200, height: 16,
    color: "#22c55e", bg: "#374151",
  });
});

Rebur.on("tick", () => {
  for (const p of Rebur.Players.all()) {
    p.gui.bar("hp", p.health, p.maxHealth);
  }
});
\`\`\`

### NPC patrol between waypoints
\`\`\`js
const npc = Rebur.Workspace.find("Guard");
const waypoints = [
  { x: -10, y: 1, z: 0 },
  { x:  10, y: 1, z: 0 },
  { x:   0, y: 1, z: 10 },
];
let idx = 0;
const SPEED = 4;

Rebur.on("tick", (dt) => {
  if (!npc || npc.destroyed) return;
  const target = waypoints[idx];
  const dx = target.x - npc.position.x;
  const dz = target.z - npc.position.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  if (dist < 0.3) { idx = (idx + 1) % waypoints.length; return; }
  npc.position = {
    x: npc.position.x + (dx / dist) * SPEED * dt,
    y: npc.position.y,
    z: npc.position.z + (dz / dist) * SPEED * dt,
  };
  npc.rotation = { x: 0, y: Math.atan2(dx, dz), z: 0 };
});
\`\`\`

### 2D sidescroller — constrain physics to XY plane
\`\`\`js
// Lock all entities to XZ=0 plane via body constraints
Rebur.on("entityAdded", (entity) => {
  entity.body.constraints = {
    lockPositionZ: true,
    lockRotationX: true,
    lockRotationY: true,
  };
});

// Top-down camera
Rebur.on("playerJoined", (player) => {
  Rebur.Camera.setForPlayer(player, {
    follow: player,
    offset: { x: 0, y: 10, z: 0 },   // straight down
  });
});
\`\`\`

### Planet gravity — walk on a sphere
\`\`\`js
const planet = Rebur.Workspace.find("Planet");
planet.gravity = { strength: 20, radius: 50 };
// Global gravity remains 28, but inside planet.radius it's overridden.
log("Planet gravity active!");
\`\`\`

End of Rebur Scripting Reference.
`;
