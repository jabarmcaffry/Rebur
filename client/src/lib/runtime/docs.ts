// docs.ts — DEFAULT_SCRIPT + SCRIPTING_DOCS

// Default code for brand new scripts — just a helpful comment pointing to docs.
// Subsequent scripts created by the user will be empty.
export const DEFAULT_SCRIPT = `// Click the Docs button (top bar) for the full scripting reference.
// Your code runs once when Play starts. Use events for ongoing logic.
`;

export const SCRIPTING_DOCS = `# Rebur Engine — Scripting Reference

Welcome! This guide covers everything you need to script games in the Rebur engine.
The engine handles physics, rendering, collisions, input and networking at ~60 fps.
**Your scripts handle game logic.**

---

## Quick Start

Scripts run in a sandbox with the full API available as globals. Here's a minimal example:

\`\`\`js
// Create a spinning coin
const coin = create({
  primitiveType: "sphere",
  position: { x: 2, y: 2, z: 0 },
  color: "#ffd700",
});
coin.autoRotateY = 2;

// Collect it on touch
coin.on("touched", (other) => {
  if (other === player) {
    player.inventory.add("Coin");
    destroy(coin);
  }
});
\`\`\`

---

## Table of Contents

1. [Globals](#globals)
2. [Containers](#containers)
3. [Creating Objects](#creating-objects)
4. [Object Properties](#object-properties)
5. [Object Events](#object-events)
6. [Auto-Animation](#auto-animation)
7. [Player](#player)
8. [Inventory](#inventory)
9. [Camera](#camera)
10. [Input](#input)
11. [Game Loop (runService)](#game-loop-runservice)
12. [Timing Utilities](#timing-utilities)
13. [World Events](#world-events)
14. [Tweens](#tweens)
15. [Raycasting](#raycasting)
16. [State](#state)
17. [Tags](#tags)
18. [GUI](#gui)
19. [Object-Based GUI](#object-based-gui)
20. [3D Models](#3d-models)
21. [Math Library](#math-library)
22. [Physics Events](#physics-events)
23. [Networking](#networking)
24. [Tasks](#tasks)
25. [Modules](#modules)
26. [Utilities](#utilities)
27. [Debug](#debug)
28. [Advanced: Reactive Primitives](#advanced-reactive-primitives)

---

## Globals

All of these are available directly in your script (no imports needed):

| Category | Globals |
|----------|---------|
| **Containers** | \`workspace\`, \`lighting\`, \`players\`, \`serverScriptService\`, \`starterPlayer\`, \`replicatedStorage\` |
| **Objects** | \`create\`, \`destroy\`, \`spawn\`, \`find\` |
| **Player** | \`player\` |
| **Input** | \`keyboard\`, \`mouse\` |
| **Systems** | \`camera\`, \`world\`, \`runService\`, \`network\`, \`state\`, \`tags\`, \`gui\` |
| **Timing** | \`time\`, \`dt\`, \`now\`, \`every\`, \`after\`, \`wait\`, \`task\` |
| **Animation** | \`tween\` |
| **Physics** | \`raycast\` |
| **Math** | \`random\`, \`randInt\`, \`pick\`, \`dist\`, \`lerp\`, \`clamp\`, \`Vector3\`, \`Quaternion\`, \`CFrame\`, \`rad\`, \`deg\` |
| **Modules** | \`require\`, \`exports\`, \`module\` |
| **Debug** | \`log\`, \`debug\` |
| **Classes** | \`Emitter\`, \`Callable\`, \`Class\`, \`weakRef\`, \`WeakTable\` |
| **Models** | \`models\` (registry for 3D model loading) |

---

## Containers

Containers organize objects in the game world:

| Container | Purpose |
|-----------|---------|
| \`workspace\` | Live 3D world - objects here are simulated and rendered |
| \`lighting\` | Lights and atmosphere settings |
| \`players\` | Player avatars |
| \`replicatedStorage\` | Templates and ModuleScripts (shared, not rendered) |
| \`serverScriptService\` | Server-only scripts |
| \`starterPlayer\` | Per-player scripts/objects |

Access objects by name: \`workspace.Baseplate\`, \`replicatedStorage.CoinTemplate\`

Use \`find("name")\` to search all containers.

---

## Creating Objects

\`\`\`js
// Create a new object
const box = create({
  name: "MyBox",                   // optional name
  primitiveType: "cube",           // "cube" | "sphere" | "cylinder" | "plane"
  position: { x: 0, y: 1, z: 0 },  // world position (center)
  rotation: { x: 0, y: 0, z: 0 },  // radians
  scale: { x: 1, y: 1, z: 1 },     // size multiplier
  color: "#ff8844",                // hex color
  anchored: true,                  // if false, affected by gravity
  canCollide: true,                // if false, other objects pass through
  container: "Workspace",          // where to place it
  parent: null,                    // optional parent object
});

// Clone from a template in ReplicatedStorage
const enemy = spawn("EnemyTemplate", {
  position: { x: 5, y: 1, z: 0 },
});

// Find existing object
const baseplate = find("Baseplate");

// Destroy an object
destroy(box);           // by reference
destroy("MyBox");       // by name
\`\`\`

---

## Object Properties

All objects have these properties you can read and write:

\`\`\`js
// Transform
obj.position    // { x, y, z } - center position
obj.rotation    // { x, y, z } - radians
obj.scale       // { x, y, z } - size

// Appearance
obj.color       // hex string, e.g. "#ff0000"
obj.visible     // boolean
obj.transparency // 0 (opaque) to 1 (invisible)

// Physics
obj.anchored    // if true, doesn't move
obj.canCollide  // if false, no collision
obj.velocity    // { x, y, z } - current movement
obj.mass        // affects physics interactions
obj.friction    // 0-1, surface friction

// Custom gravity (pulls nearby objects)
obj.gravity = { strength: 9.81, radius: 30 };
obj.gravity = false;  // disable

// Custom attributes (store any data)
obj.setAttribute("hp", 100);
obj.getAttribute("hp");  // 100
obj.getAttributes();     // { hp: 100, ... }

// Hierarchy
obj.parentId             // parent object's ID
obj.children             // array of child objects
obj.setParent(other);    // reparent
obj.findFirstChild("ChildName");  // find by name
\`\`\`

---

## Object Events

React to things happening to objects:

\`\`\`js
// Called when another object or player touches this one
obj.on("touched", (other) => {
  log("Touched by:", other.name);
});

// Called when the touch ends
obj.on("untouched", () => {
  log("No longer touching");
});

// Called when the player clicks this object
obj.on("clicked", () => {
  log("Clicked!");
});

// Called when the object is destroyed
obj.on("destroyed", () => {
  log("Goodbye!");
});

// Listen for specific property changes (camelCase preferred)
obj.onPropertyChanged("color").on("changed", (prop, newVal, oldVal) => {
  log("Color changed from", oldVal, "to", newVal);
});

// Legacy alias (still works)
obj.GetPropertyChangedSignal("color").on("changed", callback);

// Store the unsubscribe function to stop listening
const unsub = obj.on("touched", () => {});
unsub();  // stop listening
\`\`\`

---

## Auto-Animation

Let the engine animate objects automatically every frame:

\`\`\`js
// Rotate around Y axis (radians per second)
obj.autoRotateY = 2;

// Bob up and down (sine wave)
obj.autoBob = { amplitude: 0.3, speed: 2 };

// Spin on multiple axes
obj.autoSpin = { x: 0, y: 1, z: 0.5 };

// Move in a direction
obj.autoMove = { direction: { x: 1, y: 0, z: 0 }, speed: 2 };

// Follow a target (player or object)
obj.autoFollow = { target: player, speed: 4, offset: { x: 0, y: 2, z: 0 } };

// Disable by setting to undefined
obj.autoRotateY = undefined;
\`\`\`

---

## Player

The local player is always available as \`player\`:

\`\`\`js
// Info
player.username       // display name
player.color          // avatar color (hex)

// Transform
player.position       // { x, y, z } feet position
player.rotation       // { x, y, z } yaw in rotation.y
player.velocity       // { x, y, z } current movement
player.up             // { x, y, z } up direction (usually 0,1,0)
player.onGround       // true if standing on something

// Health
player.health = 100;
player.maxHealth = 100;
player.takeDamage(25);
player.heal(50);
player.kill();
player.respawn();

// Movement
player.walkSpeed = 6;        // normal speed
player.runSpeed = 12;        // hold Shift to run
player.jumpPower = 8;
player.size = 1;             // avatar scale
player.autoFaceMovement = true;  // rotate to face movement direction

// Physics
player.killY = -50;          // auto-die below this Y level
player.ragdoll;              // true while dying (read-only)
player.collisionRadius = 0.4;
player.collisionHalfHeight = 0.9;

// Teleport
player.teleport(10, 5, 0);
player.spawnPoint = { x: 0, y: 5, z: 0 };
\`\`\`

---

## Inventory

Players have an inventory system for collecting and managing items:

\`\`\`js
// Add items
player.inventory.add("Coin");                    // add 1 coin
player.inventory.add("Coin", { count: 5 });      // add 5 coins
player.inventory.add("Sword", {
  count: 1,
  template: "SwordTemplate",  // optional: template to spawn when dropped
  data: { damage: 10 },       // optional: custom data
});

// Check and get items
player.inventory.has("Coin");          // true/false
player.inventory.has("Coin", 5);       // has at least 5?
player.inventory.get("Coin");          // returns item or null
player.inventory.items;                // array of all items

// Remove items
player.inventory.remove("Coin");       // remove 1
player.inventory.remove("Coin", 3);    // remove up to 3

// Equip/unequip (for UI tracking)
player.inventory.equip("Sword");
player.inventory.equipped;             // currently equipped item or null
player.inventory.equip(null);          // unequip

// Drop items into the world
player.inventory.drop("Coin");         // drops 1 in front of player
player.inventory.drop("Coin", 3);

// Settings
player.inventory.maxSlots = 32;        // inventory size limit
player.inventory.clear();              // remove everything
\`\`\`

---

## Camera

Control the player's view:

\`\`\`js
// Camera modes
camera.mode = "thirdPerson";  // default, orbits player
camera.mode = "firstPerson";  // inside player's head
camera.mode = "free";         // detached, controlled by mouse
camera.mode = "scripted";     // you control position/lookAt directly

// Third-person settings
camera.distance = 6;          // distance from player
camera.minDistance = 2;       // zoom limits
camera.maxDistance = 20;
camera.offset = { x: 0, y: 1.95, z: 0 };  // look-at offset from player feet

// General settings
camera.fov = 60;              // field of view (degrees)
camera.sensitivity = 1;       // mouse sensitivity multiplier
camera.lockYaw = false;       // prevent horizontal rotation
camera.lockPitch = false;     // prevent vertical rotation

// Scripted mode - set these directly
camera.mode = "scripted";
camera.position = { x: 0, y: 10, z: 10 };
camera.lookAt = { x: 0, y: 0, z: 0 };
\`\`\`

---

## Input

Handle keyboard and mouse input:

\`\`\`js
// Keyboard
keyboard.onPress("e", () => log("E pressed"));
keyboard.onRelease("e", () => log("E released"));
keyboard.isDown("w");  // true if currently held

// Special keys: "shift", "control", "alt", "space", "enter", "escape"
// Arrow keys: "arrowup", "arrowdown", "arrowleft", "arrowright"

// Mouse clicks on objects
mouse.onClick((obj) => {
  if (obj) {
    log("Clicked on:", obj.name);
  } else {
    log("Clicked on nothing");
  }
});

// Built-in movement (always active):
// WASD or Arrow Keys = move
// Space = jump
// Shift = run
// Mouse = look around
\`\`\`

---

## Game Loop (runService)

Hook into the engine's update cycle. Each phase runs once per frame (~60fps):

\`\`\`js
// Phase order: input → animation → replication → physics → render → update

runService.update.on((dt, time) => {
  // dt = time since last frame (seconds)
  // time = total elapsed time (seconds)
  log("Frame!", dt);
});

runService.physics.on((dt, time) => {
  // Runs during physics step
});

runService.render.on((dt, time) => {
  // Runs before rendering
});

// Also available: input, animation, replication
\`\`\`

---

## Timing Utilities

Convenient ways to schedule code:

\`\`\`js
// Current time
time;           // elapsed game time (updated each frame)
dt;             // delta time since last frame
now();          // current sim time (same as time)

// Run every frame (same as runService.update)
onUpdate((dt, time) => {
  obj.rotation.y += dt;
});

// Run every N seconds
const stop = every(0.5, () => {
  log("tick");
});
stop();  // cancel

// Run once after N seconds
after(2, () => {
  log("2 seconds later!");
});

// Async wait
async function example() {
  log("Starting...");
  await wait(1.5);
  log("1.5 seconds later!");
}
example();
\`\`\`

---

## World Events

React to major game events:

\`\`\`js
world.onPlayerSpawned((p) => {
  log("Player spawned:", p.username);
});

world.onPlayerDied((p) => {
  log("Player died:", p.username);
});

world.onObjectAdded((obj) => {
  log("New object:", obj.name);
});

world.onObjectRemoved((obj) => {
  log("Object removed:", obj.name);
});
\`\`\`

---

## Tweens

Smoothly animate properties over time:

\`\`\`js
// Tween position over 2 seconds
tween(obj.position, { x: 10, y: 5 }, 2);

// With easing
tween(obj.position, { y: 10 }, 1, "easeOutQuad");

// With callback when done
tween(obj.position, { x: 0 }, 1, "linear", () => {
  log("Tween complete!");
});

// Cancel a tween
const cancel = tween(obj.position, { x: 100 }, 10);
cancel();

// Available easings:
// "linear"
// "easeInQuad", "easeOutQuad", "easeInOutQuad"
// "easeInCubic", "easeOutCubic", "easeInOutCubic"
\`\`\`

---

## Raycasting

Cast rays to detect objects:

\`\`\`js
const hit = raycast(
  player.position,              // origin
  { x: 0, y: -1, z: 0 },        // direction (will be normalized)
  10,                           // max distance
  {
    ignore: [someObject],       // objects to skip
    filter: (o) => o.canCollide // custom filter
  }
);

if (hit) {
  log("Hit:", hit.object.name);
  log("Distance:", hit.distance);
  log("Position:", hit.position);  // { x, y, z }
  log("Normal:", hit.normal);      // surface normal { x, y, z }
}
\`\`\`

---

## State

Key-value store for game state (multiplayer-ready):

\`\`\`js
state.set("phase", "Playing");
state.set("score", "100");

state.get("phase");  // "Playing"

// React to changes
state.on("phase", (newValue, oldValue) => {
  log("Phase changed:", oldValue, "→", newValue);
});

state.keys();  // ["phase", "score"]
\`\`\`

---

## Tags

Organize objects with tags for easy querying:

\`\`\`js
tags.add(enemy, "enemy");
tags.add(enemy, "hostile");

tags.has(enemy, "enemy");     // true
tags.all(enemy);              // ["enemy", "hostile"]

tags.get("enemy");            // array of all objects with "enemy" tag
tags.remove(enemy, "hostile");

// Example: damage all enemies
for (const e of tags.get("enemy")) {
  e.setAttribute("hp", e.getAttribute("hp") - 10);
}
\`\`\`

---

## GUI

Create on-screen UI elements:

\`\`\`js
// Text element
gui.text("score", "Score: 0", {
  anchor: "tl",    // position anchor
  x: 16,           // offset from anchor
  y: 16,
  size: 18,        // font size
  color: "#ffffff",
});

// Update text
gui.text("score", "Score: 100", { anchor: "tl", x: 16, y: 16 });

// Button
gui.button("play", "Play", { anchor: "cc", x: 0, y: 0 }, (game) => {
  game.state.set("phase", "Playing");
  gui.clear("play");
});

// Remove element
gui.clear("score");

// Remove all GUI
gui.clear();

// Anchors:
// tl = top-left      tc = top-center      tr = top-right
// cl = center-left   cc = center-center   cr = center-right
// bl = bottom-left   bc = bottom-center   br = bottom-right
\`\`\`

---

## Object-Based GUI

For advanced UIs with nesting, layouts, animations, and dragging:

\`\`\`js
// Create a frame (container)
const panel = gui.frame("inventory", {
  anchor: "cr",
  x: 20,
  y: 0,
  width: { mode: "fixed", value: 300 },
  height: { mode: "fixed", value: 400 },
  backgroundColor: "rgba(0,0,0,0.8)",
  borderRadius: 12,
});

// Add a title
const title = gui.label("title", "Inventory", {
  fontSize: 20,
  fontWeight: 600,
  color: "#ffffff",
});
panel.addChild(title);

// Create a vertical layout for items
const itemList = gui.vstack("items", {
  layoutGap: 8,
  layoutPadding: { top: 10, right: 10, bottom: 10, left: 10 },
});
panel.addChild(itemList);

// Add buttons to the stack
const btn1 = gui.btn("sword", "Sword x1", {
  backgroundColor: "#374151",
  onClick: () => log("Selected sword"),
});
itemList.addChild(btn1);

// Layout modes: horizontal stack, vertical stack, grid
const toolbar = gui.hstack("toolbar", { layoutGap: 4 });
const grid = gui.grid("grid", 4, { layoutGap: 8 }); // 4 columns

// Scroll containers for long lists
const scrollArea = gui.scroll("scrollArea", {
  width: { mode: "fixed", value: 250 },
  height: { mode: "fixed", value: 300 },
  showScrollbarY: true,
});

// Make elements draggable
panel.draggable = true;
panel.dragBounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

// Listen for drag events
panel.on("dragStart", (x, y) => log("Started dragging"));
panel.on("drag", (x, y) => log("Dragging to", x, y));
panel.on("dragEnd", (x, y) => log("Stopped dragging"));

// Animate UI elements
panel.animate("transparency", 0, 0.3);  // fade in
btn1.animate("x", btn1.x + 10, 0.2, { easing: "easeOut" });

// Text input fields
const search = gui.input("search", {
  placeholder: "Search...",
  onSubmit: (value) => log("Searching for:", value),
  onChange: (value) => log("Typing:", value),
});

// Image elements
const icon = gui.image("icon", "/textures/sword.png", {
  width: { mode: "fixed", value: 32 },
  height: { mode: "fixed", value: 32 },
  fit: "contain",
});

// Find and destroy elements
const found = gui.find("inventory");
gui.destroy("title");
gui.destroy(panel);  // destroys panel and all children
\`\`\`

---

## 3D Models

Import and use GLTF/GLB 3D models:

\`\`\`js
// Create an object with a 3D model
const character = create({
  name: "Hero",
  type: "model",
  modelUrl: "/models/hero.glb",
  position: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

// Play animations (if model has them)
character.animation = "walk";
character.animationSpeed = 1.0;
character.animationLoop = true;

// Models support all standard object properties
character.position.x += 5;
character.rotation.y = Math.PI / 2;
character.visible = true;

// Use models from ReplicatedStorage templates
const enemy = spawn("EnemyModel", {
  position: { x: 10, y: 0, z: 5 },
});

// Switch animations
keyboard.onPress("w", () => {
  character.animation = "walk";
});
keyboard.onRelease("w", () => {
  character.animation = "idle";
});
\`\`\`

---

## Math Library

Advanced math primitives for 3D transformations. Plain \`{x, y, z}\` objects
still work everywhere - these are for when you need vector/quaternion math.

\`\`\`js
// Vector3 - 3D vectors with math operations
const v1 = new Vector3(1, 2, 3);
const v2 = new Vector3(4, 5, 6);

v1.add(v2);           // Vector3(5, 7, 9)
v1.sub(v2);           // Vector3(-3, -3, -3)
v1.mul(2);            // Vector3(2, 4, 6)
v1.dot(v2);           // 32 (scalar)
v1.cross(v2);         // Vector3(-3, 6, -3)
v1.magnitude;         // 3.74...
v1.unit;              // normalized vector
v1.distanceTo(v2);    // distance between points

// Static constructors
Vector3.zero;         // (0, 0, 0)
Vector3.one;          // (1, 1, 1)
Vector3.up;           // (0, 1, 0)
Vector3.forward;      // (0, 0, 1)
Vector3.lerp(v1, v2, 0.5);  // midpoint

// Quaternion - rotations without gimbal lock
const q = Quaternion.fromEuler(0, Math.PI / 2, 0);  // 90° Y rotation
const q2 = Quaternion.fromAxisAngle(Vector3.up, Math.PI);

q.mul(q2);                    // combine rotations
q.rotateVector(v1);           // rotate a vector
q.toEuler();                  // back to euler angles
q.forward;                    // direction it's facing
Quaternion.slerp(q, q2, 0.5); // smooth interpolation

// CFrame - position + rotation combined
const cf = new CFrame(
  { x: 0, y: 5, z: 0 },       // position
  Quaternion.identity         // rotation
);

CFrame.lookAt(
  { x: 0, y: 0, z: 0 },       // from
  { x: 10, y: 0, z: 10 }      // at
);

cf.pointToWorldSpace(localPoint);   // local → world
cf.pointToObjectSpace(worldPoint);  // world → local
cf.lookVector;                      // forward direction
cf.mul(otherCFrame);                // combine transforms

// Utility functions
rad(90);              // degrees → radians
deg(Math.PI);         // radians → degrees
clamp(x, 0, 1);       // clamp to range
lerp(0, 100, 0.5);    // 50
smoothstep(t);        // smooth 0-1 curve
\`\`\`

---

## Physics Events

Enhanced touch detection with debouncing and sleep states:

\`\`\`js
// New events (more reliable than touched/untouched)
obj.on("touchStarted", (player, obj, penetration, normal) => {
  // Fires once when contact begins (debounced)
  log("Touch started, penetration:", penetration);
});

obj.on("touchEnded", (player, obj) => {
  // Fires once when contact ends (debounced)
  log("Touch ended");
});

// Legacy events still work
obj.on("touched", (player, obj) => {});
obj.on("untouched", (player, obj) => {});

// Physics sleep/wake (for performance)
obj.on("slept", (obj) => {
  // Object has stopped moving and is now sleeping
  log(obj.name, "went to sleep");
});

obj.on("woke", (obj) => {
  // Object was disturbed and is now awake
  log(obj.name, "woke up");
});

// Collision categories (advanced filtering)
obj.collisionCategory = 1;   // bitmask category
obj.collisionMask = 0xFFFF;  // what categories to collide with

// Preset categories:
// Default: 1, Player: 2, Static: 4, Dynamic: 8
// Trigger: 16, Projectile: 32, Pickup: 64, Character: 128
\`\`\`

---

## Networking

For multiplayer games (locally simulated, ready for real servers):

\`\`\`js
// Server broadcasts to all clients
network.server.broadcast("chat", { msg: "Hello everyone!" });

// Server listens for client messages
network.server.on("playerReady", (data) => {
  log("Player ready:", data.id);
});

// Client sends to server
network.client.send("playerReady", { id: 1 });

// Client listens for broadcasts
network.client.on("chat", (data) => {
  log("Chat:", data.msg);
});
\`\`\`

---

## Tasks

Coroutine-style scheduling for complex sequences:

\`\`\`js
// Run immediately in a new "thread"
task.spawn(() => {
  log("Starting task");
});

// Run after delay
task.delay(2, () => {
  log("2 seconds later");
});

// Async wait
async function sequence() {
  log("Step 1");
  await task.wait(1);
  log("Step 2");
  await task.wait(1);
  log("Step 3");
}
task.spawn(sequence);
\`\`\`

---

## Modules

Share code between scripts using ModuleScripts:

\`\`\`js
// In a ModuleScript named "MathLib":
exports.add = (a, b) => a + b;
exports.multiply = (a, b) => a * b;
exports.PI = 3.14159;

// In another script:
const MathLib = require("MathLib");
log(MathLib.add(2, 3));      // 5
log(MathLib.PI);             // 3.14159
\`\`\`

---

## Utilities

Helpful math and random functions:

\`\`\`js
// Random numbers
random(0, 1);        // float between 0 and 1
random(5, 10);       // float between 5 and 10
randInt(1, 6);       // integer 1-6 (inclusive, like a die)

// Pick random from array
pick(["red", "green", "blue"]);

// Distance between two points or objects
dist(obj1, obj2);
dist({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });

// Linear interpolation
lerp(0, 100, 0.5);   // 50

// Clamp value to range
clamp(15, 0, 10);    // 10
clamp(-5, 0, 10);    // 0

// Logging (appears in Console panel)
log("Hello!");
log("Score:", score, "Lives:", lives);
log({ complex: "object", works: true });
\`\`\`

---

## Debug

Inspect the runtime for debugging:

\`\`\`js
debug.getChildren(obj);           // direct children
debug.getDescendants(obj);        // all nested children
debug.getFullName(obj);           // "Workspace.Folder.MyObject"
debug.getPropertyNames(obj);      // ["position", "rotation", ...]
debug.getObjectsWithTag("enemy"); // same as tags.get()
debug.getEventConnections(obj);   // number of event listeners
\`\`\`

---

## Advanced: Reactive Primitives

For complex patterns, these classes are available:

\`\`\`js
// Emitter - event dispatcher
const onDamage = new Emitter();
onDamage.on((amount) => log("Took damage:", amount));
onDamage.fire(25);

// Callable - observable function
const attack = new Callable((target) => target.takeDamage(10));
attack.connect((target) => log("Attacked:", target.name));
attack(enemy);  // calls function AND notifies listeners

// Class - prototype factory
const Enemy = new Class("Enemy", { hp: 100, damage: 10 });
const goblin = new Enemy({ hp: 50 });
log(goblin.hp, goblin.damage);  // 50, 10

// WeakTable - object-keyed map (doesn't prevent garbage collection)
const metadata = new WeakTable();
metadata.set(obj, { spawned: now() });

// weakRef - weak reference
const ref = weakRef(obj);
ref.get();  // returns obj or null if garbage collected
\`\`\`

---

## Example: Complete Mini-Game

\`\`\`js
// Coin collection game

let score = 0;
gui.text("score", "Coins: 0", { anchor: "tl", x: 16, y: 16, size: 24, color: "#ffd700" });

// Spawn coins
function spawnCoin() {
  const coin = create({
    primitiveType: "sphere",
    position: { x: random(-10, 10), y: 1, z: random(-10, 10) },
    scale: { x: 0.5, y: 0.5, z: 0.5 },
    color: "#ffd700",
  });
  coin.autoRotateY = 3;
  coin.autoBob = { amplitude: 0.2, speed: 2 };
  
  coin.on("touched", (other) => {
    if (other === player) {
      score++;
      gui.text("score", "Coins: " + score, { anchor: "tl", x: 16, y: 16, size: 24, color: "#ffd700" });
      destroy(coin);
      after(1, spawnCoin);  // spawn a new one
    }
  });
}

// Start with 5 coins
for (let i = 0; i < 5; i++) spawnCoin();

// Give player a weapon
const sword = create({
  primitiveType: "cube",
  scale: { x: 0.1, y: 0.8, z: 0.1 },
  color: "#64748b",
});
player.motors.attach("rightHand", sword, { y: 0.3 });

world.onPlayerSpawned(() => log("Game started!"));
\`\`\`
`;
