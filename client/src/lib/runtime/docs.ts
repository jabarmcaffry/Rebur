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
6. [Execution Model — How Scripts Run](#execution-model--how-scripts-run)
7. [Network & Replication](#network--replication)
8. [Scripting — Quick Start](#scripting--quick-start)
9. [Globals Reference](#globals-reference)
10. [Containers in Scripts](#containers-in-scripts)
11. [Creating & Destroying Objects](#creating--destroying-objects)
12. [Object Properties](#object-properties)
13. [Object Events](#object-events)
14. [Custom Events (obj.emit)](#custom-events-objemit)
15. [Auto-Animation](#auto-animation)
16. [Player](#player)
17. [Inventory](#inventory)
18. [Camera](#camera)
19. [Input](#input)
20. [Game Loop (runService)](#game-loop-runservice)
21. [Timing Utilities](#timing-utilities)
22. [World Events](#world-events)
23. [State](#state)
24. [Tags](#tags)
25. [GUI](#gui)
26. [Tweens](#tweens)
27. [Raycasting](#raycasting)
28. [Physics](#physics)
29. [Networking API](#networking-api)
30. [Tasks](#tasks)
31. [Modules (require)](#modules-require)
32. [Math Library](#math-library)
33. [Advanced Classes](#advanced-classes)
34. [Performance & Best Practices](#performance--best-practices)
35. [Common Pitfalls & Error Messages](#common-pitfalls--error-messages)

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

## Execution Model — How Scripts Run

Understanding *where* and *when* scripts run prevents a lot of bugs.

### Single-machine model
Rebur Engine runs entirely in the browser. **There is no separate server process.** All scripts — Script, LocalScript, ModuleScript — execute in the same JavaScript environment. The distinction between script types is organisational and signals intent, not an enforced runtime boundary.

| Script type | Intended use | Globals available |
|-------------|-------------|-------------------|
| **Script** | Game logic, physics, world state | All globals |
| **LocalScript** | UI, input handling, per-player effects | All globals |
| **ModuleScript** | Shared library code, called via \`require()\` | All globals |

> **Practical rule**: think of Script/LocalScript/ModuleScript as naming conventions that tell other developers what a script does, not as a security boundary.

### Execution order
When Play starts, scripts execute in this order:

1. **ServerScriptService** scripts — first, before objects appear
2. **StarterPlayer** scripts — once per player join
3. **Workspace / Lighting** scripts — as objects are loaded
4. **Players** scripts — after the player avatar spawns

Each script body runs **once** from top to bottom. Ongoing logic must use events or timers.

\`\`\`js
// ✅ Correct — react to events
coin.on("touched", () => {
  player.inventory.add("Coin");
  destroy(coin);
});

// ⚠️ Incorrect — loop runs once at start and immediately exits
for (let i = 0; i < 10; i++) {
  // This finishes in microseconds, not over time
}
\`\`\`

### Are globals like \`state\`, \`tags\`, and \`player\` automatically synced?
Currently **no automatic network replication** exists between different browser tabs or players. Within a single Play session everything shares one runtime, so \`state.set()\`, \`tags\`, and \`player\` are consistent everywhere in that session. For true multiplayer (multiple connected clients), use the \`network\` API to explicitly send and receive messages. See [Network & Replication](#network--replication).

### player.inventory — local or replicated?
\`player.inventory.add()\` updates the **local runtime** only. If you need inventory to survive respawn or be visible to other scripts you must persist it yourself using \`state\`:

\`\`\`js
// Pattern: persist inventory count in state so all scripts can read it
coin.on("touched", () => {
  player.inventory.add("Coin");
  state.set("coins", (state.get("coins") ?? 0) + 1);
  gui.text("coins", "Coins: " + state.get("coins"));
});
\`\`\`

---

## Network & Replication

> **Current status**: The networking API is a design-time scaffold. The methods below are available for structuring multiplayer-ready code, but live cross-client replication requires a hosted server back-end (not included in the single-player preview mode).

### Authority model
In a properly structured multiplayer game:

| Responsibility | Where it runs |
|---------------|---------------|
| Player input capture | LocalScript (client) |
| Movement validation | Script (server) |
| Object positions | Replicated by server → clients |
| Game state (score, phase) | Set on server, broadcast to clients |
| GUI updates | LocalScript reads from replicated state |

### Sending and receiving messages
\`\`\`js
// ── Server → all clients ────────────────────────────────────────────
network.server.broadcast("updateScore", { score: 100 });

// All clients listen:
network.client.on("updateScore", ({ score }) => {
  gui.text("score", "Score: " + score);
});

// ── Client → server ─────────────────────────────────────────────────
network.client.send("buyItem", { item: "Sword" });

// Server validates and responds:
network.server.on("buyItem", (payload, clientId) => {
  // validate payload.item, deduct cost, etc.
  spawn(payload.item);
  network.server.sendTo(clientId, "itemGranted", { item: payload.item });
});
\`\`\`

### Security principle
**Never trust the client.** Always validate game-critical data (damage, purchases, positions) on the server side. A client can send any payload it wants — the server is the authority.

\`\`\`js
// ❌ Insecure: client sets its own health
network.server.on("setHealth", ({ hp }) => {
  player.health = hp;           // client can cheat — never do this
});

// ✅ Secure: server computes the result
network.server.on("takeDamage", ({ amount }) => {
  const clamped = Math.max(0, Math.min(amount, 100)); // validate range
  player.takeDamage(clamped);
});
\`\`\`

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

All of these are available directly — **no imports needed**. They are injected into every Script and LocalScript as bare identifiers.

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

### ⚠️ Name-collision warning
Because these are plain globals, declaring a local variable with the same name **shadows** the engine global for the rest of that scope:

\`\`\`js
// ❌ Shadows the engine's time global
let time = 5;
log(time);          // → 5 (your variable, not engine time)
log(now());         // → use now() as the safe alias

// ❌ Shadows the dt global
function update(dt) {
  // inside here, dt is your argument — that's fine
  // but engine dt is gone until the function returns
}

// ✅ Safe pattern: prefix your own variables
let myTime = 0;
let elapsed = 0;
\`\`\`

**Globals to be careful around**: \`time\`, \`dt\`, \`log\`, \`state\`, \`world\`, \`player\`, \`camera\`, \`find\`, \`create\`, \`destroy\`, \`spawn\`, \`random\`.

### Are globals available in ModuleScripts?
**Yes.** ModuleScripts share the same injected environment. \`player\`, \`state\`, \`log\`, etc. are all available inside a module. However, since modules are designed to be reusable libraries, it's better practice to accept \`player\` or \`state\` as function arguments rather than reading globals directly — it makes the module easier to test.

\`\`\`js
// MathUtils (ModuleScript) — no globals needed, clean interface
exports.takeDamage = (amount, maxAmount) => {
  return Math.max(0, Math.min(amount, maxAmount));
};

// Enemy (ModuleScript) — uses player global (acceptable but couples the module)
exports.checkProximity = (obj, radius) => {
  return dist(obj, player) < radius;  // 'dist' and 'player' are globals
};
\`\`\`

---

## Containers in Scripts

\`\`\`js
// Access by name — O(1) lookup, fastest
const baseplate = workspace.Baseplate;
const sun = lighting.Sun;

// Search all containers — O(n) across ALL objects, use sparingly
const coin = find("Coin");

// Prefer the container-specific access when you know where it lives:
const coin2 = workspace.Coin;       // much faster than find("Coin")

// Iterate all Workspace objects
for (const name in workspace) {
  const obj = workspace[name];
  log(obj.name, obj.position.y);
}
\`\`\`

At runtime, \`players\` contains the active player:
\`\`\`js
const me = players[player.username]; // same object as the player global
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

// Find an existing object
const obj = workspace.BasePlate;   // O(1) — preferred
const obj2 = find("BasePlate");    // O(n) — searches all containers

// Destroy
destroy(box);        // by reference
destroy("Box");      // by name — searches all containers
\`\`\`

> **Duplicate names**: If two objects share the same name in the same container, \`workspace.MyName\` returns the first match. Duplicate names won't cause an error but make lookups unpredictable. Keep names unique within each container.

---

## Object Properties

\`\`\`js
// Transform
obj.position        // { x, y, z }  ← read/write
obj.rotation        // { x, y, z } radians  ← read/write
obj.scale           // { x, y, z }  ← read/write
obj.velocity        // { x, y, z } current velocity  ← read/write
                    // Writing velocity gives the object an instant impulse.
                    // Note: player.velocity is READ-ONLY (managed by the physics engine).

// Appearance
obj.color           // "#rrggbb"  ← read/write
obj.visible         // boolean  ← read/write
obj.transparency    // 0 (opaque) to 1 (invisible)  ← read/write

// Physics
obj.anchored        // true = won't move  ← read/write
obj.canCollide      // false = passes through  ← read/write
obj.mass            // mass in kg  ← read/write
obj.friction        // 0–1  ← read/write

// Per-object gravity (pulls nearby objects toward this object)
obj.gravity = { strength: 9.81, radius: 30 };
obj.gravity = false;  // disable

// Custom attributes (arbitrary data storage)
obj.setAttribute("hp", 100);
obj.getAttribute("hp");     // → 100
obj.getAttributes();        // → { hp: 100, ... }

// Hierarchy
obj.parentId            // parent object ID (string | null)  ← read-only
obj.children            // RuntimeObject[]  ← read-only (live array)
obj.setParent(other);   // reparent ← use this to change parent
obj.findFirstChild("ChildName");

// Identity (all read-only)
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
const unsub = obj.on("touched", (other) => {
  log("touched by", other.username ?? other.name);
});

// Always unsubscribe when the object is destroyed to avoid memory leaks:
obj.on("destroyed", () => {
  unsub();
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

// Listen for ANY property change via the "changed" event
obj.on("changed", (prop, newVal, oldVal) => {
  log(prop, "changed:", oldVal, "→", newVal);
});

// All on() calls return an unsubscribe function:
const stop = obj.on("touched", handler);
stop();  // stop listening
\`\`\`

> **Memory note**: Listeners survive as long as the object lives. If you create many objects with \`on("touched")\` listeners and destroy them without calling \`unsub()\`, the listeners are cleaned up automatically via the \`"destroyed"\` event. For long-running scripts that subscribe many times, store and call the unsubscribe.

---

## Custom Events (obj.emit)

You can define **your own** events on any object. Custom events are fully user-controlled and fire all registered listeners.

\`\`\`js
const door = find("Door");

// Listen
door.on("opened", (who) => {
  log(who, "opened the door");
});

door.on("locked", () => {
  door.color = "#ef4444";
});

// Emit your custom events freely
door.emit("opened", player.username);
door.emit("locked");

// ⚠️ You CANNOT emit engine-internal events:
door.emit("touched");    // ERROR: "touched" is reserved — returns false, logs error
door.emit("clicked");    // ERROR: "clicked" is reserved — returns false, logs error

// Any other name works:
door.emit("myCustomEvent", arg1, arg2);  // ✅
door.emit("exploded", { force: 100 });   // ✅
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

Properties marked **read-only** are managed by the physics engine. Writing to them has no effect.

\`\`\`js
// Identity
player.username         // display name  ← read-only
player.color            // avatar color hex  ← read/write

// Transform
player.position         // { x, y, z } feet position  ← read/write
player.rotation         // { x, y, z } rotation.y is yaw  ← read/write
player.velocity         // { x, y, z }  ← READ-ONLY — set by physics each frame
                        //   To launch the player, use:
                        //   player.velocity = { x: 0, y: 15, z: 0 } temporarily,
                        //   but physics will override it next frame.
                        //   For a permanent boost use player.jumpPower instead.

player.up               // World-space up vector  ← read-only
                        //   Normally { x:0, y:1, z:0 }.
                        //   Changes when the player is near a gravity-well object:
                        //   e.g. standing on a spherical planet makes player.up
                        //   point away from the planet's center. All movement,
                        //   jumping, and the camera use this vector, so walking
                        //   on the underside of a platform "just works".

player.onGround         // true while standing on something  ← read-only

// Health
player.health           // current HP  ← read/write
player.maxHealth        // max HP  ← read/write
player.takeDamage(25);  // subtracts and triggers death if ≤ 0
player.heal(50);        // adds, clamped to maxHealth
player.kill();          // instant death → ragdoll + respawn
player.respawn();       // teleport to spawn point, restore full health

// Movement
player.walkSpeed = 6;       // normal walk speed  ← read/write
player.runSpeed = 12;       // Shift = run  ← read/write
player.jumpPower = 8;       // jump impulse  ← read/write
player.size = 1;            // avatar scale  ← read/write
player.autoFaceMovement = true;  // auto-rotate to face movement direction

// Physics
player.killY = -50;         // auto-die below this Y  ← read/write
player.ragdoll;             // true while dying  ← read-only
player.collisionRadius = 0.4;
player.collisionHalfHeight = 0.9;

// Teleport
player.teleport(10, 5, 0);
player.spawnPoint = { x: 0, y: 5, z: 0 };
\`\`\`

### Player Events

The player object supports the same event pattern as objects. Use \`player.on()\` to listen for property changes.

\`\`\`js
// Listen for ANY property change on the player
player.on("changed", (prop, newVal, oldVal) => {
  if (prop === "health") {
    gui.text("healthHUD", "Health: " + Math.max(0, Math.floor(newVal)));
    if (newVal <= 0) {
      gui.text("infoHUD", "You died!", { anchor: "bc", y: 40 });
    }
  }
});

// Custom events — you can emit your own events on the player
player.on("levelUp", (newLevel) => {
  gui.text("info", "Level Up! Now level " + newLevel);
});

// Emit custom events (reserved events like "changed" cannot be emitted)
player.emit("levelUp", 5);  // ✅ Works
player.emit("changed");     // ❌ Blocked — "changed" is engine-reserved

// All on() calls return an unsubscribe function
const unsub = player.on("changed", handler);
unsub();  // stop listening
\`\`\`

**Reserved player event:** \`changed\` — fired automatically by the engine when any player property changes.

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
player.inventory.items;                // all items (snapshot array)

// Remove
player.inventory.remove("Coin");       // remove 1
player.inventory.remove("Coin", 3);    // remove up to 3

// Equip
player.inventory.equip("Sword");
player.inventory.equipped;             // current item or null  ← read-only
player.inventory.equip(null);          // unequip

// Drop into world (spawns template from ReplicatedStorage if available)
player.inventory.drop("Sword");

// Settings
player.inventory.maxSlots = 32;
player.inventory.clear();
\`\`\`

> **Persistence**: Inventory is local to the current Play session. On respawn it is preserved. On Leave it is lost unless you save it to \`state\` yourself.

---

## Camera

\`\`\`js
// Modes
camera.mode = "thirdPerson";  // default — orbits player
camera.mode = "firstPerson";  // inside player head
camera.mode = "scripted";     // fully manual — you set position + lookAt each frame
camera.mode = "free";         // detached orbit

// Third-person
camera.distance = 6;          // read/write
camera.minDistance = 2;
camera.maxDistance = 20;
camera.offset = { x: 0, y: 1.95, z: 0 };

// General
camera.fov = 60;             // degrees  ← read/write in all modes
camera.sensitivity = 1;
camera.lockYaw = false;
camera.lockPitch = false;

// Scripted mode — position and lookAt are ONLY writable in "scripted" mode.
// In any other mode, writing to them has no effect.
camera.mode = "scripted";
camera.position = { x: 0, y: 10, z: 10 };   // read/write (scripted only)
camera.lookAt   = { x: 0, y: 0,  z: 0  };   // read/write (scripted only)

// In thirdPerson/firstPerson, camera.position is read-only (engine-computed).
\`\`\`

---

## Input

\`\`\`js
// Key press / release edge events
keyboard.onPress("e", () => log("E pressed"));
keyboard.onRelease("e", () => log("E released"));

// Shorthand (press only)
onKey("e", () => log("E pressed"));

// Held check — use inside an update loop, not at top level
runService.update.on((dt) => {
  if (keyboard.isDown("e")) {
    player.position.y += 2 * dt;
  }
});

// Special keys: "space", "shift", "control", "alt", "enter", "escape"
// Arrow keys: "arrowup", "arrowdown", "arrowleft", "arrowright"

// 3D viewport click — fires on every click; obj is null if nothing was hit
mouse.onClick((obj) => {
  if (obj) log("Clicked", obj.name);
  else     log("Clicked empty space");
  // obj is null when raycast hits nothing — always check before using it
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

// Convenience alias — equivalent to runService.update.on
onUpdate((dt) => { });
\`\`\`

> **every() vs runService.update**: Use \`every(seconds, fn)\` for infrequent actions (spawn enemies every 5s, heal every 1s). Use \`runService.update.on()\` for smooth per-frame logic (movement, camera, interpolation). Both are efficient; \`every\` is lighter because it skips most frames.

---

## Timing Utilities

\`\`\`js
time;        // total elapsed game time in seconds (read-only global)
dt;          // seconds since last frame (read-only global)
             // ⚠️ Don't shadow these with local variables of the same name.
now();       // same as time — safe alias if you need to pass it as a value

// Repeat — returns a cancel function
const stop = every(0.5, () => log("tick"));
stop();      // cancel the interval

// Once
after(2, () => log("2 seconds later"));

// Async suspend
async function example() {
  log("start");
  await wait(1.5);
  log("done");
}
example();
\`\`\`

---

## World Events

World events use the standardized \`.on()\` pattern. All callbacks return an unsubscribe function.

\`\`\`js
// Player events
world.on("playerSpawned", (p) => log(p.username, "spawned"));
world.on("playerDied", (p) => log(p.username, "died"));

// Object lifecycle events
world.on("objectAdded", (obj) => log("added:", obj.name));
world.on("objectRemoved", (obj) => log("removed:", obj.name));

// Unsubscribe when done
const unsub = world.on("playerSpawned", handler);
unsub();  // stop listening

// Use world.off() to remove a specific handler
world.off("playerDied", handler);
\`\`\`

---

## State

Global reactive key-value store — changes trigger listeners. State is shared across all scripts in a session.

\`\`\`js
state.set("phase", "Lobby");
state.set("score", 0);

state.get("phase");   // "Lobby"
state.keys();         // ["phase", "score"]
state.getAll();       // { phase: "Lobby", score: 0 }

const unsub = state.on("phase", (newVal, oldVal) => {
  log("Phase:", oldVal, "→", newVal);
});
// Call unsub() to stop listening when no longer needed.

keyboard.onPress("p", () => state.set("phase", "Playing"));
\`\`\`

---

## Tags

\`\`\`js
tags.add(obj, "enemy");
tags.add(obj, "boss");

tags.has(obj, "enemy");     // true
tags.all(obj);              // ["enemy", "boss"]

// tags.get() returns a SNAPSHOT array — a copy at the moment of the call.
// It is safe to iterate and destroy objects inside the loop.
const enemies = tags.get("enemy");
for (const e of enemies) {
  e.setAttribute("hp", (e.getAttribute("hp") ?? 100) - 10);
  if (e.getAttribute("hp") <= 0) destroy(e);  // safe — iterating a snapshot
}

tags.remove(obj, "boss");
\`\`\`

> **tags.get() is a snapshot**: the returned array reflects the tag state at call time. Adding or removing tags during iteration does not affect the current loop.

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

// Update existing element (only the text changes, options are preserved)
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
// Basic tween — returns a cancel function
const cancel = tween(obj.position, { x: 10 }, 2);

// With easing
tween(obj.position, { y: 10 }, 1, "easeOutQuad");

// With completion callback
tween(obj.position, { x: 0 }, 1, "linear", () => log("done"));

// Cancel mid-animation — stops at the current interpolated value.
// The target value is NOT applied; the object stays where it was when cancel() ran.
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

// raycast() returns null when nothing is hit — always check before reading properties
if (hit) {
  log("Hit:", hit.object.name);
  log("Distance:", hit.distance.toFixed(2));
  log("Point:", hit.point);
  log("Normal:", hit.normal);
} else {
  log("Nothing hit within range");
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
obj.velocity = { x: 0, y: 10, z: 0 };  // direct write (note: player.velocity is read-only)
\`\`\`

---

## Networking API

See [Network & Replication](#network--replication) for architecture guidance.

\`\`\`js
// Server → all clients
network.server.broadcast("updateScore", { score: 100 });

// Server → one client
network.server.sendTo(clientId, "itemGranted", { item: "Sword" });

// Client → server
network.client.send("requestSpawn", { type: "enemy" });

// Listen (server side)
network.server.on("requestSpawn", (payload, clientId) => {
  spawn(payload.type);
});

// Listen (client side)
network.client.on("updateScore", ({ score }) => {
  gui.text("score", "Score: " + score);
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

// Async loop
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

ModuleScripts live in **ReplicatedStorage** and are called with \`require()\`.

\`\`\`js
// ── MathUtils (ModuleScript in ReplicatedStorage) ──────────────────────────
exports.square = (n) => n * n;
exports.clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ── Any other script ───────────────────────────────────────────────────────
const MathUtils = require("MathUtils");
log(MathUtils.square(5));   // 25

// Modules are cached — require("MathUtils") always returns the same object.
// Mutating a module's exports affects every script that required it.
\`\`\`

> All engine globals (\`player\`, \`state\`, \`log\`, etc.) are available inside ModuleScripts. Consider accepting dependencies as arguments instead of reading globals directly — it makes modules easier to reuse.

---

## Math Library

\`\`\`js
random(0, 10);           // float in [0, 10)
randInt(1, 6);           // integer in [1, 6]
pick(["a", "b", "c"]);   // random element

dist(obj, player);       // 3D Euclidean distance
dist({ x:0,y:0,z:0 }, { x:3,y:4,z:0 }); // 5

lerp(0, 100, 0.5);       // 50
clamp(15, 0, 10);        // 10

// Standard JS Math also works: Math.sin, Math.cos, Math.atan2, Math.abs, etc.
\`\`\`

---

## Advanced Classes

### Emitter — typed event bus

Use \`Emitter\` when you want a **private event channel** that doesn't belong to any scene object. Useful for decoupling systems (e.g., an enemy manager that broadcasts events to the UI without hard-coding references).

\`\`\`js
const gameEvents = new Emitter();

// Any script can listen
gameEvents.on("enemyKilled", ({ name, reward }) => {
  state.set("score", (state.get("score") ?? 0) + reward);
  gui.text("score", "Score: " + state.get("score"));
});

// Any script can emit
gameEvents.emit("enemyKilled", { name: "Goblin", reward: 10 });

// Returns unsubscribe
const unsub = gameEvents.on("enemyKilled", handler);
unsub(); // stop listening
\`\`\`

### Callable — wrappable function

\`Callable\` turns a class instance into a function that can be called directly. Use it when you want an object with methods *and* a default "call" behaviour — common for operators like damage calculators or factories.

\`\`\`js
const DamageCalc = new Callable((base, multiplier = 1) => {
  return Math.floor(base * multiplier);
});

DamageCalc.withCrit = (base) => DamageCalc(base, 2);  // add methods

log(DamageCalc(10));           // → 10
log(DamageCalc(10, 1.5));      // → 15
log(DamageCalc.withCrit(10));  // → 20
\`\`\`

### Class — OOP inheritance helper

\`Class\` is a thin wrapper around ES6 classes that adds automatic \`super\` chaining and a few engine conveniences. It is **not** different from a regular ES6 class for most uses — you can use plain \`class\` syntax instead. \`Class\` is useful when you want to call \`super()\` implicitly and get engine mixins for free.

\`\`\`js
const Enemy = Class(class {
  constructor(name, hp = 100) {
    this.obj = create({ name, primitiveType: "sphere", color: "#ff4444",
                        position: { x: 0, y: 1, z: 0 } });
    this.hp  = hp;

    // Clean up the scene object when this Enemy is garbage-collected
    this.obj.on("destroyed", () => this.obj = null);
  }

  damage(n) {
    this.hp -= n;
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.obj) destroy(this.obj);
    log(this.obj?.name ?? "Enemy", "died");
  }
});

const goblin = new Enemy("Goblin", 50);
goblin.damage(30);   // still alive
goblin.damage(25);   // dies

// Inheritance
const Boss = Class(class extends Enemy {
  constructor(name) {
    super(name, 500);          // 500 HP
    this.phase = 1;
  }
  damage(n) {
    if (this.phase === 1 && this.hp - n < 250) {
      this.phase = 2;
      log("Boss enters phase 2!");
    }
    super.damage(n);
  }
});
\`\`\`

### weakRef and WeakTable

\`weakRef(obj)\` stores a reference that does **not** prevent garbage collection. Use it when you want to track an object without keeping it alive.

\`\`\`js
const ref = weakRef(someObj);
// Later:
const alive = ref.deref();   // returns the object if still alive, or undefined
if (alive) alive.color = "#00ff00";
\`\`\`

\`WeakTable\` is a Map keyed by weakRefs — entries disappear automatically when their key is collected. Useful for per-object metadata that you don't want to manually clean up.

\`\`\`js
const meta = new WeakTable();
meta.set(enemy, { spawnTime: time });

// Later:
const info = meta.get(enemy);  // undefined if enemy was garbage-collected
\`\`\`

---

## Performance & Best Practices

### Object lookup
| Method | Speed | When to use |
|--------|-------|-------------|
| \`workspace.MyObject\` | O(1) — fastest | You know the container |
| \`find("MyObject")\` | O(n) — scans all containers | You don't know the container, or it might move |
| \`tags.get("enemy")\` | O(1) snapshot | Querying groups of objects |

> Prefer \`workspace.MyName\` over \`find("MyName")\` inside hot update loops.

### Unsubscribing listeners
Every \`on()\` call adds an entry to an internal list. Objects that are destroyed clean up their own listeners automatically. However, for long-running scripts that attach and detach many listeners dynamically, store the unsubscribe function and call it when done:

\`\`\`js
const unsubs = [];

world.on("objectAdded", (obj) => {
  if (obj.name.startsWith("Coin")) {
    const u = obj.on("touched", () => {
      player.inventory.add("Coin");
      destroy(obj);
    });
    unsubs.push(u);
  }
});

// On cleanup:
unsubs.forEach(u => u());
\`\`\`

### every() interval limit
There is no hard cap on the number of active \`every()\` intervals, but each one runs its callback on the main thread. Avoid creating hundreds of intervals simultaneously. Prefer grouping logic into a single \`runService.update.on()\` loop that checks a list of objects.

\`\`\`js
// ❌ Bad — one interval per enemy
for (const e of enemies) {
  every(0.5, () => e.damage(5));
}

// ✅ Better — one loop, all enemies
every(0.5, () => {
  for (const e of enemies) e.damage(5);
});
\`\`\`

### tags.get — snapshot vs live
\`tags.get("tag")\` returns a **snapshot array** (a copy). It is safe to destroy objects while iterating the result. It is **not** a live view — changes to tags after the call are not reflected in the returned array.

---

## Common Pitfalls & Error Messages

### Error format
All script errors appear in the in-game console (open via ☰ → Show Console):

\`\`\`
[ScriptName] Runtime error on line 12: Cannot read properties of null (reading 'color')
Hint: 'workspace.Box' returned null — check the object name and container.
\`\`\`

The hint tries to identify the likely cause. Common ones:

| Error message | Likely cause | Fix |
|--------------|-------------|-----|
| \`Cannot read properties of null\` | \`workspace.X\` returned null — object doesn't exist or is in a different container | Check spelling, container, and that the object was created before the script ran |
| \`obj.emit("touched") blocked\` | Tried to emit a reserved event name | Use a different event name for custom events |
| \`require("X") returned undefined\` | ModuleScript named "X" not found in ReplicatedStorage | Check the module name and container |
| \`ReferenceError: X is not defined\` | Used a variable before declaring it, or shadowed a global | Declare variables with \`let\`/\`const\`, avoid naming them the same as engine globals |

### Null raycast
\`raycast()\` returns \`null\` when nothing is hit within the max distance. Always check:

\`\`\`js
const hit = raycast(player.position, { x: 0, y: -1, z: 0 }, 50);
if (hit) {
  log(hit.object.name);     // safe
} else {
  log("Floor not found");   // handle the miss
}
// ❌ Never: log(hit.object.name) without checking hit first — will throw
\`\`\`

### touched fires on entry only
\`obj.on("touched")\` fires **once per contact-enter**. If the player stays inside the object it will not keep firing. Use \`"untouched"\` to detect when contact ends, or poll inside \`runService.update.on()\`.

### touched never fires
- Check that \`obj.canCollide\` is \`true\` on the object.
- Objects in containers other than \`Workspace\` or \`Lighting\` are not physics-simulated.

### Shadowing engine globals
\`\`\`js
let time = 10;     // now 'time' refers to your variable, not elapsed game time
let dt   = 0.016;  // now 'dt' is always 0.016 regardless of frame rate
\`\`\`
Use unique names like \`myTimer\`, \`elapsed\`, \`frameDelta\`.

### Tween cancelled mid-animation
When you call \`cancel()\` on a tween, the object **stops at its current interpolated value**. It does not snap to the target. If you need it at the target, set the property directly after cancelling:

\`\`\`js
const cancel = tween(obj.position, { x: 10 }, 5);
// ... some time passes ...
cancel();
obj.position.x = 10;  // force to target if needed
\`\`\`

### Duplicate object names
Creating two objects with the same name in the same container won't throw an error, but \`workspace.MyName\` will return only the first match. Use distinct names or use \`tags\` to group similar objects.

\`\`\`js
// ❌ Two coins with the same name — workspace.Coin only finds the first one
create({ name: "Coin", ... });
create({ name: "Coin", ... });

// ✅ Unique names + tags
create({ name: "Coin_1", ... });
create({ name: "Coin_2", ... });
tags.add(workspace.Coin_1, "coin");
tags.add(workspace.Coin_2, "coin");
// Then collect with: for (const c of tags.get("coin")) { ... }
\`\`\`
`;
