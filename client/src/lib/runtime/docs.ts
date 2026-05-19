// docs.ts — DEFAULT_SCRIPT + full SCRIPTING_DOCS

export const DEFAULT_SCRIPT = `// Script runs once when Play starts.
// Use events for ongoing logic.
// Press Docs in the toolbar for the full API reference.
`;

export const SCRIPTING_DOCS = `# Rebur Engine — Complete Reference

This guide covers **everything** in the Rebur Engine: the editor interface, hierarchy, properties, containers, scripting API, events, physics, GUI, networking, and more.

---

## Table of Contents

1. [Editor Interface](#editor-interface)
2. [Hierarchy Panel](#hierarchy-panel)
3. [Containers](#containers)
4. [Properties Panel](#properties-panel)
5. [Play Mode HUD](#play-mode-hud)
6. [Scripting — Quick Start](#scripting--quick-start)
7. [Globals Reference](#globals-reference)
8. [Containers in Scripts](#containers-in-scripts)
9. [Creating & Destroying Objects](#creating--destroying-objects)
10. [Object Properties](#object-properties)
11. [Object Events](#object-events)
12. [Custom Events (obj.emit)](#custom-events-objemit)
13. [Auto-Animation](#auto-animation)
14. [Player](#player)
15. [Inventory](#inventory)
16. [Camera](#camera)
17. [Input](#input)
18. [Game Loop (runService)](#game-loop-runservice)
19. [Timing Utilities](#timing-utilities)
20. [World Events](#world-events)
21. [State](#state)
22. [Tags](#tags)
23. [GUI](#gui)
24. [Tweens](#tweens)
25. [Raycasting](#raycasting)
26. [Physics](#physics)
27. [Networking](#networking)
28. [Tasks](#tasks)
29. [Modules (require)](#modules-require)
30. [Debugging](#debugging)
31. [Math Library](#math-library)
32. [Advanced Classes](#advanced-classes)

---

## Editor Interface

The editor is split into four main zones:

### Toolbar (top)
- **Add Primitive**: Cube, Sphere, Cylinder, Plane — adds to Workspace
- **Add Light**: Adds a point light to Lighting
- **Transform modes** (desktop): Translate / Rotate / Scale gizmo
- **Play ▶**: Saves pending script edits, then launches Play Mode
- **Docs**: Opens this reference panel
- **Snippets**: Popover with ready-to-paste code blocks

### Left Panel — Hierarchy
Tree view of all containers and objects. See [Hierarchy Panel](#hierarchy-panel).

### Center Panel — Scene / Scripts
- **Scene tab**: 3D viewport with gizmo, orbit, and transform controls
- **Scripts tab**: Monaco code editor (JS). Script selection is driven from the Hierarchy.

### Right Panel — Properties
Shows and edits properties of the selected object. See [Properties Panel](#properties-panel).

### Mobile layout
On screens narrower than 768px the left and right panels collapse into Sheet drawers triggered by the **☰ Menu** and **⊞ Properties** buttons in the toolbar. Transform-mode buttons are hidden.

---

## Hierarchy Panel

The Hierarchy mirrors **Roblox Studio's Explorer** — every service container is a top-level node and objects live inside them.

### Controls
| Action | How |
|--------|-----|
| **Select an object** | Click its row |
| **Select a script** | Click its script row → switches center pane to Scripts tab |
| **Add a script to a container** | Click the **+** button on the container header |
| **Add a script to an object** | Click the **+** button next to the object row |
| **Expand / collapse** | Click the **▶ / ▼** chevron |
| **Drag to reparent** | Drag an object row onto another object or container |

### Script types per container
| Container | Default script type |
|-----------|---------------------|
| Workspace | Script |
| Lighting | Script |
| Players | LocalScript |
| ServerScriptService | Script |
| StarterPlayer | LocalScript |
| ReplicatedStorage | ModuleScript |

---

## Containers

Every object **must** belong to exactly one container. Objects cannot exist outside a container.

| Container | Purpose | Rendered at runtime? |
|-----------|---------|----------------------|
| **Workspace** | Live 3D world — rendered, simulated, collidable | ✅ Yes |
| **Lighting** | Lights and atmosphere — rendered but not physics-simulated | ✅ Yes |
| **Players** | Player avatars. At runtime, the active player is listed here | ❌ No (virtual) |
| **ServerScriptService** | Server-only scripts. Not rendered | ❌ No |
| **StarterPlayer** | Scripts/objects cloned to each player on join | ❌ No |
| **ReplicatedStorage** | Templates for \`spawn()\` + ModuleScripts | ❌ No |

> **Runtime note**: When Play starts, the active player appears in both **Players** (as a virtual entry) and **Workspace** (as a physical avatar). This mirrors how Roblox works.

---

## Properties Panel

Select any object to inspect and edit its properties.

| Property | Type | Description |
|----------|------|-------------|
| **Name** | string | Object display name. Must be unique within its container for reliable \`find()\` results |
| **Color** | hex | Surface color |
| **Container** | dropdown | Which service container this object lives in |
| **Position X/Y/Z** | number | World position of the object's center |
| **Rotation X/Y/Z** | number | Euler rotation in radians |
| **Scale X/Y/Z** | number | Size multiplier (1 = default unit size) |
| **Anchored** | boolean | If true, physics/gravity won't move this object |
| **Can Collide** | boolean | If false, other objects pass through this one |
| **Transparency** | 0–1 | 0 = fully opaque, 1 = invisible |
| **Mass** | number | Affects physics interactions |
| **Friction** | 0–1 | Surface friction |
| **Delete** | button | Permanently removes the object |

---

## Play Mode HUD

When you press **Play ▶** the editor hides and the game fills the screen.

### Top-left menu (☰)
Click the hamburger button (showing your username) to open the game menu:

| Option | Description |
|--------|-------------|
| **Resume** | Close the menu and return to the game |
| **Reset Avatar** | Respawn the player at the spawn point |
| **Settings** | Opens the settings sub-panel |
| **Show Console** | Toggle the script output panel |
| **Leave** | Stop playing and return to the editor |

### Settings
| Setting | Description |
|---------|-------------|
| **Shift Lock** | Lock the camera behind the player (camera yaw follows movement direction) |
| **Show FPS** | Display a live frames-per-second counter in the top-right corner |

### Chat
Click the **Chat** button or press **/** to open the chat panel. Messages appear in the bottom-left. Press **Enter** to send, **Escape** to close.

### Controls
| Input | Action |
|-------|--------|
| WASD / Arrow Keys | Move |
| Space | Jump |
| Shift | Run (hold) |
| Mouse drag | Look around |
| Scroll | Zoom (third-person) |
| **/** | Open chat |
| **Esc** | Open menu |
| **Mobile left joystick** | Move |
| **Mobile JUMP button** | Jump |

---

## Scripting — Quick Start

Scripts run **once** when Play starts. Register event listeners for ongoing logic.

\`\`\`js
// Spinning coin that you can collect
const coin = create({
  name: "Coin",
  primitiveType: "sphere",
  position: { x: 3, y: 2, z: 0 },
  color: "#fbbf24",
  scale: { x: 0.5, y: 0.5, z: 0.5 },
});
coin.autoRotateY = 3;

coin.on("touched", () => {
  player.inventory.add("Coin", { count: 1 });
  destroy(coin);
  log("Collected a coin! Total:", player.inventory.get("Coin")?.count);
});
\`\`\`

---

## Globals Reference

All of these are available directly — no imports needed:

| Category | Globals |
|----------|---------|
| **Containers** | \`workspace\`, \`lighting\`, \`players\`, \`serverScriptService\`, \`starterPlayer\`, \`replicatedStorage\` |
| **Objects** | \`create\`, \`destroy\`, \`spawn\`, \`find\` |
| **Player** | \`player\` |
| **Input** | \`keyboard\`, \`mouse\`, \`onKey\` |
| **Systems** | \`camera\`, \`world\`, \`runService\`, \`network\`, \`state\`, \`tags\`, \`gui\`, \`physics\` |
| **Timing** | \`time\`, \`dt\`, \`now\`, \`every\`, \`after\`, \`wait\`, \`onUpdate\`, \`task\` |
| **Animation** | \`tween\` |
| **Physics** | \`raycast\` |
| **Math** | \`random\`, \`randInt\`, \`pick\`, \`dist\`, \`lerp\`, \`clamp\` |
| **Modules** | \`require\`, \`exports\`, \`module\` |
| **Debug** | \`log\`, \`debug\` |
| **Classes** | \`Emitter\`, \`Callable\`, \`Class\`, \`weakRef\`, \`WeakTable\` |

---

## Containers in Scripts

\`\`\`js
// Access by name (fast — O(1) lookup)
const baseplate = workspace.Baseplate;
const sun = lighting.Sun;

// Search all containers
const coin = find("Coin");

// Iterate all Workspace objects
for (const name in workspace) {
  const obj = workspace[name];
  log(obj.name, obj.position.y);
}
\`\`\`

At runtime, \`players\` contains the active player:
\`\`\`js
// The local player is always in players
const me = players[player.username]; // same as the player global
\`\`\`

---

## Creating & Destroying Objects

\`\`\`js
// Create a new object
const box = create({
  name: "Box",
  primitiveType: "cube",           // "cube" | "sphere" | "cylinder" | "plane"
  position: { x: 0, y: 1, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, // radians
  scale: { x: 1, y: 1, z: 1 },
  color: "#ff8844",
  anchored: false,
  canCollide: true,
  container: "Workspace",          // required — objects must be in a container
  parent: null,                    // optional parent object
});

// Clone from a ReplicatedStorage template
const enemy = spawn("EnemyTemplate", {
  position: { x: 5, y: 1, z: 0 },
  color: "#ff4444",
});

// Find an existing object (searches all containers)
const obj = find("BasePlate");

// Destroy
destroy(box);        // by reference
destroy("Box");      // by name
\`\`\`

---

## Object Properties

\`\`\`js
// Transform
obj.position        // { x, y, z }
obj.rotation        // { x, y, z } radians
obj.scale           // { x, y, z }
obj.velocity        // { x, y, z } current velocity (read/write)

// Appearance
obj.color           // "#rrggbb"
obj.visible         // boolean
obj.transparency    // 0 (opaque) to 1 (invisible)

// Physics
obj.anchored        // true = won't move
obj.canCollide      // false = passes through
obj.mass            // mass in kg (affects collision response)
obj.friction        // 0–1

// Per-object gravity (pulls nearby objects toward this object)
obj.gravity = { strength: 9.81, radius: 30 };
obj.gravity = false;  // disable

// Custom attributes (arbitrary data)
obj.setAttribute("hp", 100);
obj.getAttribute("hp");     // → 100
obj.getAttributes();        // → { hp: 100, ... }

// Hierarchy
obj.parentId            // parent object ID (string | null)
obj.children            // RuntimeObject[]
obj.setParent(other);   // reparent
obj.findFirstChild("ChildName");

// Identity (read-only)
obj.id              // unique runtime ID
obj.name            // display name
obj.type            // "primitive" | "light" | "spawn" | "model" | ...
obj.primitiveType   // "cube" | "sphere" | "cylinder" | "plane" | null
obj.container       // ContainerName
\`\`\`

---

## Object Events

Events let you react to things happening to objects.

\`\`\`js
// ─── Engine-internal events (fired by the engine automatically) ───────────

// Player or object touches this object
obj.on("touched", (other) => {
  log("touched by", other.username ?? other.name);
});

// Touch ends
obj.on("untouched", (other) => {
  log("no longer touching");
});

// Precise touch-start with physics data
obj.on("touchStarted", (other, penetration, normal) => {
  log("contact started, penetration:", penetration);
});

// Touch ended (debounced)
obj.on("touchEnded", (other) => {
  log("contact ended");
});

// Player clicks on this object (3D viewport click)
obj.on("clicked", (obj) => {
  obj.color = "#ff4444";
});

// Object is about to be destroyed
obj.on("destroyed", () => {
  log("goodbye");
});

// Collision with another dynamic object
obj.on("collisionStarted", (other, contact) => {
  log("hit", other.name, "at", contact.point);
});
obj.on("collisionEnded", (other) => { });

// Physics wake/sleep (optimization states)
obj.on("woke", () => { });
obj.on("slept", () => { });

// Property changed
obj.onPropertyChanged("color").on("changed", (prop, newVal, oldVal) => {
  log("color changed:", oldVal, "→", newVal);
});

// All on() calls return an unsubscribe function:
const unsub = obj.on("touched", handler);
unsub();  // stop listening
\`\`\`

---

## Custom Events (obj.emit)

You can define **your own** events on any object. Custom events are fully user-controlled and fire all registered listeners.

\`\`\`js
// Define a custom event
const door = find("Door");

// Anyone can listen
door.on("opened", (who) => {
  log(who, "opened the door");
});

door.on("locked", () => {
  door.color = "#ef4444";
});

// You can emit your custom events freely
door.emit("opened", player.username);
door.emit("locked");

// ⚠️ You CANNOT emit engine-internal events:
door.emit("touched");    // ERROR: "touched" is reserved for engine-internal use
door.emit("clicked");    // ERROR: "clicked" is reserved for engine-internal use
// The engine logs an error and returns false. Your game keeps running.

// All custom event names (not in the reserved list) work:
door.emit("myCustomEvent", arg1, arg2);  // ✅ fine
door.emit("exploded", { force: 100 });   // ✅ fine
\`\`\`

**Reserved (engine-internal) event names:**
\`touched\`, \`untouched\`, \`touchStarted\`, \`touchEnded\`, \`clicked\`, \`destroyed\`, \`collisionStarted\`, \`collisionEnded\`, \`woke\`, \`slept\`, \`propertyChanged\`, \`changed\`

---

## Auto-Animation

Let the engine animate objects every frame without a script update loop:

\`\`\`js
// Spin around Y axis (radians/second)
obj.autoRotateY = 2;

// Bob up and down (sine wave)
obj.autoBob = { amplitude: 0.3, speed: 2 };

// Spin on multiple axes simultaneously
obj.autoSpin = { x: 0.5, y: 1, z: 0 };

// Move in a direction continuously
obj.autoMove = { direction: { x: 1, y: 0, z: 0 }, speed: 2 };

// Follow a target (player or another object)
obj.autoFollow = { target: player, speed: 4, offset: { x: 0, y: 2, z: 0 } };

// Disable any auto-animation
obj.autoRotateY = undefined;
obj.autoBob = undefined;
\`\`\`

---

## Player

\`\`\`js
// Identity
player.username         // display name (read-only)
player.color            // avatar color hex

// Transform
player.position         // { x, y, z } — feet position
player.rotation         // { x, y, z } — rotation.y is yaw
player.velocity         // { x, y, z }
player.up               // up direction vector (changes with per-object gravity)
player.onGround         // true while standing on something

// Health
player.health = 100;
player.maxHealth = 100;
player.takeDamage(25);
player.heal(50);
player.kill();           // triggers ragdoll + respawn
player.respawn();

// Movement
player.walkSpeed = 6;       // normal walk speed
player.runSpeed = 12;       // Shift = run
player.jumpPower = 8;
player.size = 1;            // avatar scale
player.autoFaceMovement = true;  // auto-rotate to face movement

// Physics
player.killY = -50;         // auto-die below this Y
player.ragdoll;             // true while dying (read-only)
player.collisionRadius = 0.4;
player.collisionHalfHeight = 0.9;

// Flying (enable in-game flight)
player.canFly = true;       // Space = fly up, Shift = fly down

// Teleport
player.teleport(10, 5, 0);
player.spawnPoint = { x: 0, y: 5, z: 0 };
\`\`\`

---

## Inventory

\`\`\`js
// Add items
player.inventory.add("Coin");
player.inventory.add("Sword", { count: 1, template: "SwordTemplate", data: { damage: 15 } });

// Check / get
player.inventory.has("Coin");          // true/false
player.inventory.has("Coin", 5);       // has at least 5?
player.inventory.get("Coin");          // InventoryItem | null
player.inventory.items;                // all items

// Remove
player.inventory.remove("Coin");       // remove 1
player.inventory.remove("Coin", 3);    // remove up to 3

// Equip
player.inventory.equip("Sword");
player.inventory.equipped;             // current item or null
player.inventory.equip(null);          // unequip

// Drop into world (spawns template from ReplicatedStorage if available)
player.inventory.drop("Sword");

// Settings
player.inventory.maxSlots = 32;
player.inventory.clear();
\`\`\`

---

## Camera

\`\`\`js
// Modes
camera.mode = "thirdPerson";  // default — orbits player
camera.mode = "firstPerson";  // inside player head
camera.mode = "scripted";     // fully manual — set position + lookAt
camera.mode = "free";         // detached orbit

// Third-person
camera.distance = 6;
camera.minDistance = 2;
camera.maxDistance = 20;
camera.offset = { x: 0, y: 1.95, z: 0 };

// General
camera.fov = 60;             // degrees
camera.sensitivity = 1;
camera.lockYaw = false;
camera.lockPitch = false;

// Scripted mode
camera.mode = "scripted";
camera.position = { x: 0, y: 10, z: 10 };
camera.lookAt = { x: 0, y: 0, z: 0 };
\`\`\`

---

## Input

\`\`\`js
// Key press / release edge events
keyboard.onPress("e", () => log("E pressed"));
keyboard.onRelease("e", () => log("E released"));

// Shorthand
onKey("e", () => log("E pressed"));

// Held check (use inside update loop)
runService.update.on((dt) => {
  if (keyboard.isDown("e")) {
    player.position.y += 2 * dt;
  }
});

// Special keys: "space", "shift", "control", "alt", "enter", "escape"
// Arrow keys: "arrowup", "arrowdown", "arrowleft", "arrowright"

// 3D click
mouse.onClick((obj) => {
  if (obj) log("Clicked", obj.name);
  else     log("Clicked empty space");
});
\`\`\`

---

## Game Loop (runService)

\`\`\`js
// Phase order each frame: input → animation → replication → physics → render → update

runService.update.on((dt, time) => {
  // Most logic goes here — runs after physics resolves
  obj.rotation.y += dt;
});

runService.physics.on((dt, time) => {
  // During physics step — good for applying forces
});

runService.render.on((dt, time) => {
  // Just before rendering
});

// Convenience alias
onUpdate((dt) => { });
\`\`\`

---

## Timing Utilities

\`\`\`js
time;        // total elapsed game time (seconds)
dt;          // seconds since last frame
now();       // same as time

// Repeat
const stop = every(0.5, () => log("tick"));
stop();      // cancel

// Once
after(2, () => log("2 seconds later"));

// Async
async function example() {
  log("start");
  await wait(1.5);
  log("done");
}
example();
\`\`\`

---

## World Events

\`\`\`js
world.onPlayerSpawned((p) => log(p.username, "spawned"));
world.onPlayerDied((p) => log(p.username, "died"));
world.onObjectAdded((obj) => log("added:", obj.name));
world.onObjectRemoved((obj) => log("removed:", obj.name));
\`\`\`

---

## State

Global reactive key-value store — changes trigger listeners.

\`\`\`js
state.set("phase", "Lobby");
state.set("score", 0);

state.get("phase");   // "Lobby"
state.keys();         // ["phase", "score"]
state.getAll();       // { phase: "Lobby", score: 0 }

state.on("phase", (newVal, oldVal) => {
  log("Phase:", oldVal, "→", newVal);
});

keyboard.onPress("p", () => state.set("phase", "Playing"));
\`\`\`

---

## Tags

\`\`\`js
tags.add(obj, "enemy");
tags.add(obj, "boss");

tags.has(obj, "enemy");     // true
tags.all(obj);              // ["enemy", "boss"]
tags.get("enemy");          // all objects with the "enemy" tag
tags.remove(obj, "boss");

// Example: damage all enemies
for (const e of tags.get("enemy")) {
  e.setAttribute("hp", (e.getAttribute("hp") ?? 100) - 10);
}
\`\`\`

---

## GUI

\`\`\`js
// Text element
gui.text("score", "Score: 0", {
  anchor: "tl",    // tl, tc, tr, cl, cc, cr, bl, bc, br
  x: 16,
  y: 16,
  size: 18,
  color: "#ffffff",
  bg: "rgba(0,0,0,0.5)",
});

// Update
gui.text("score", "Score: 42");

// Button
gui.button("btn", "Respawn", { anchor: "br", x: 24, y: 24 }, () => {
  player.respawn();
});

// Remove one or all
gui.clear("score");
gui.clear();
\`\`\`

---

## Tweens

\`\`\`js
// Basic tween
tween(obj.position, { x: 10 }, 2);

// With easing
tween(obj.position, { y: 10 }, 1, "easeOutQuad");

// With callback
tween(obj.position, { x: 0 }, 1, "linear", () => log("done"));

// Cancel
const cancel = tween(obj.position, { x: 100 }, 10);
cancel();

// Easings: "linear", "easeInQuad", "easeOutQuad", "easeInOutQuad",
//          "easeInCubic", "easeOutCubic", "easeInOutCubic"
\`\`\`

---

## Raycasting

\`\`\`js
const hit = raycast(
  player.position,
  { x: 0, y: -1, z: 0 },   // direction (auto-normalized)
  50,                        // max distance
  {
    ignore: [player],        // objects to skip
    filter: (o) => o.canCollide,
  }
);

if (hit) {
  log("Hit:", hit.object.name);
  log("Distance:", hit.distance.toFixed(2));
  log("Point:", hit.point);
  log("Normal:", hit.normal);
}
\`\`\`

---

## Physics

\`\`\`js
// Global physics
physics.gravity = 9.81;   // m/s² downward
physics.airDrag = 0;      // resistance for unanchored objects

// Zero-G
physics.gravity = 0;

// Per-object gravity well (attracts nearby objects and the player)
planet.gravity = { strength: 12, radius: 40 };
planet.gravity = false;  // disable

// Object physics properties
obj.anchored = false;     // let gravity affect it
obj.canCollide = true;
obj.mass = 2;
obj.friction = 0.5;
obj.velocity = { x: 0, y: 10, z: 0 };  // set directly
\`\`\`

---

## Networking

\`\`\`js
// Server → all clients
network.server.broadcast("updateScore", { score: 100 });
network.client.on("updateScore", ({ score }) => {
  gui.text("score", "Score: " + score);
});

// Client → server
network.client.send("requestSpawn", { type: "enemy" });
network.server.on("requestSpawn", (payload) => {
  spawn(payload.type);
});
\`\`\`

---

## Tasks

\`\`\`js
// Run fn concurrently (non-blocking)
task.spawn(() => {
  log("runs in parallel");
});

// Delay without blocking
task.delay(2, () => log("2 seconds later"));

// Async wait
async function loop() {
  while (true) {
    log("tick");
    await task.wait(1);
  }
}
task.spawn(loop);
\`\`\`

---

## Modules (require)

\`\`\`js
// In ReplicatedStorage → create a ModuleScript named "MathUtils"
// MathUtils script:
exports.square = (n) => n * n;
exports.clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// In any other script:
const MathUtils = require("MathUtils");
log(MathUtils.square(5));   // 25
\`\`\`

---

## Debugging

\`\`\`js
// Print to in-game console (color-coded: green=info, red=error, yellow=warning)
log("Hello", player.position);

// Debug API
debug.getChildren(obj);         // RuntimeObject[]
debug.getDescendants(obj);      // all descendants recursively
debug.getFullName(obj);         // "Workspace.Platform.Coin"
debug.getPropertyNames(obj);    // all property names
debug.getObjectsWithTag("tag"); // same as tags.get()
debug.getEventConnections(obj); // number of active listeners

// Error messages include:
// - Script name
// - Line number (approximate)
// - Helpful hint for common mistakes

// Example script error output:
// [MyScript] Runtime error on line 12: Cannot read properties of null
// Check for a typo, missing object, wrong container, or unsupported API use.
\`\`\`

**Common mistakes:**
- \`workspace.Box\` is \`null\` — object doesn't exist or is in a different container
- \`obj.on("touched")\` never fires — check that obj.canCollide is true
- Scripts run top-to-bottom once. Use \`runService.update.on()\` for per-frame logic.
- \`obj.emit("clicked")\` logs an error — \`clicked\` is engine-reserved; use a different name.

---

## Math Library

\`\`\`js
random(0, 10);           // float in [0, 10)
randInt(1, 6);           // integer in [1, 6]
pick(["a", "b", "c"]);   // random element

dist(obj, player);       // 3D distance
dist({ x:0,y:0,z:0 }, { x:3,y:4,z:0 }); // 5

lerp(0, 100, 0.5);       // 50
clamp(15, 0, 10);        // 10

// Also available: Math.sin, Math.cos, Math.atan2, Math.hypot, Math.abs, etc.
\`\`\`

---

## Advanced Classes

\`\`\`js
// Emitter — custom typed event bus
const events = new Emitter();
events.on("explode", (force) => log("boom", force));
events.emit("explode", 100);

// Class — OOP inheritance helper
const Enemy = Class(class {
  constructor(name) {
    this.obj = create({ name, primitiveType: "sphere", color: "#ff4444" });
    this.hp = 100;
  }
  damage(n) {
    this.hp -= n;
    if (this.hp <= 0) destroy(this.obj);
  }
});

const goblin = new Enemy("Goblin");
goblin.damage(50);
\`\`\`
`;
