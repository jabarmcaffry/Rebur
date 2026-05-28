// docs.ts — DEFAULT_SCRIPT + full SCRIPTING_DOCS

export const DEFAULT_SCRIPT = `// Scripts run SERVER-SIDE — safe and secure.
// Use game.on("tick", fn) for per-frame logic.
// Press Docs in the toolbar for the full API reference.

// Example: spin a part every frame
let angle = 0;
game.on("tick", function(dt) {
  angle += dt * 2;
  Scene.Part.Rotation = { X: 0, Y: angle, Z: 0 };
});

// Example: react when a player touches a part
Scene.Part.on("Touched", function(player) {
  log("Touched by", player.Name);
  Scene.Part.Color = "#ff0000";
});
`;

export const SCRIPTING_DOCS = `# Rebur Engine — Scripting Reference

All scripts run **server-side** inside a secure VM sandbox. They have full access to scene objects, players, GUI, timers, and physics — but not to the file system, network, or any Node.js internals.

---

## Table of Contents

1. [Execution Model](#execution-model)
2. [Scene Objects](#scene-objects)
3. [Object Properties](#object-properties)
4. [Object Events](#object-events)
5. [Players](#players)
6. [Game Events](#game-events)
7. [GUI](#gui)
8. [Timers](#timers)
9. [World Utilities](#world-utilities)
10. [Logging](#logging)
11. [Vector3](#vector3)
12. [Color3](#color3)
13. [RunService Alias](#runservice-alias)
14. [Safe Standard Library](#safe-standard-library)
15. [Quick Start Examples](#quick-start-examples)

---

## Execution Model

Scripts are loaded once when Play starts. They run synchronously at load time and register event handlers for ongoing logic.

**The event-driven pattern:**

\`\`\`js
// Top-level code runs ONCE when the script loads
log("Script started!");

// Register handlers for ongoing work
game.on("tick", function(dt) {
  // Called every physics tick (~20× per second)
});

Scene.Part.on("Touched", function(player) {
  // Called when a player touches this part
});
\`\`\`

**Key principle:** Do not use blocking loops (\`while(true)\`). Use events and timers instead.

---

## Scene Objects

Access any named object in your scene via the \`Scene\` proxy. The object name must match exactly (case-sensitive) what you see in the Hierarchy panel.

\`\`\`js
// Direct access by name (Workspace objects only)
Scene.PartName
Scene["My Part"]  // use bracket notation for names with spaces

// Find by name across all containers
const obj = find("PartName");

// Destroy (hides) an object
destroy("PartName");
\`\`\`

If the object doesn't exist, property reads return \`undefined\` and a warning is printed to the console. Assignments are silently ignored.

---

## Object Properties

All properties use **PascalCase** and are readable and writable unless noted.

### Position

\`\`\`js
// Read
const pos = Scene.Part.Position; // { X, Y, Z }
log(pos.X, pos.Y, pos.Z);

// Write
Scene.Part.Position = { X: 0, Y: 5, Z: 0 };
Scene.Part.Position = { X: pos.X + 1, Y: pos.Y, Z: pos.Z }; // move +1 on X
\`\`\`

### Rotation

Values are in **radians**.

\`\`\`js
// Read
const rot = Scene.Part.Rotation; // { X, Y, Z }

// Write
Scene.Part.Rotation = { X: 0, Y: Math.PI / 2, Z: 0 }; // 90° around Y

// Spin every tick
let angle = 0;
game.on("tick", function(dt) {
  angle += dt;
  Scene.Spinner.Rotation = { X: 0, Y: angle, Z: 0 };
});
\`\`\`

### Color

CSS color string (hex, rgb, named).

\`\`\`js
Scene.Part.Color = "#ff0000";     // red
Scene.Part.Color = "blue";
Scene.Part.Color = "rgb(0,255,0)";
\`\`\`

### Visibility

\`\`\`js
Scene.Part.Visible = false;  // hides the object
Scene.Part.Visible = true;   // shows it again
\`\`\`

### Transparency

0 = fully opaque, 1 = fully invisible.

\`\`\`js
Scene.Part.Transparency = 0.5;  // 50% see-through
\`\`\`

### Anchored

When \`true\` the part is a static collider. When \`false\` it can be moved by scripts.

\`\`\`js
Scene.Part.Anchored = false;
Scene.Part.Anchored = true;
\`\`\`

### CanCollide

Whether players and physics objects collide with this part.

\`\`\`js
Scene.Part.CanCollide = false;  // walk through it
\`\`\`

### Velocity

Applies a velocity vector to an unanchored dynamic object.

\`\`\`js
Scene.Ball.Velocity = { X: 0, Y: 10, Z: 0 }; // launch upward
\`\`\`

### Size *(read-only)*

Returns the current scale of the object as \`{ X, Y, Z }\`.

\`\`\`js
const sz = Scene.Part.Size;
log(sz.X, sz.Y, sz.Z);
\`\`\`

### Name *(read-only)*

\`\`\`js
log(Scene.Part.Name); // "Part"
\`\`\`

---

## Object Events

### .on(eventName, handler)

Listen for an event on a specific object. Returns nothing (no unsubscribe yet).

| Event | When it fires | Handler receives |
|-------|---------------|-----------------|
| \`"Touched"\` | Player capsule enters the object | \`player\` |
| *(custom)* | Your script calls \`.emit()\` | whatever args you pass |

\`\`\`js
Scene.Lava.on("Touched", function(player) {
  log(player.Name, "touched lava!");
});
\`\`\`

### .emit(eventName, ...args)

Fire a custom event on this object. Any other \`.on()\` listener for the same event + object hears it.

\`\`\`js
Scene.Door.emit("Open", { speed: 2 });

Scene.Door.on("Open", function(opts) {
  log("Opening door at speed", opts.speed);
});
\`\`\`

---

## Players

Access the current players in the session via the \`Players\` object. Each player is keyed by their display name.

\`\`\`js
// Read player data (inside a playerAdded handler you receive the player directly)
game.on("playerAdded", function(player) {
  log("Joined:", player.Name);
  log("Position:", player.Position.X, player.Position.Y, player.Position.Z);
  log("UserId:", player.UserId);
});
\`\`\`

### Player object properties *(read-only in scripts)*

| Property | Type | Description |
|----------|------|-------------|
| \`Name\` | string | Display name |
| \`UserId\` | string | Unique session ID |
| \`Position\` | \`{X, Y, Z}\` | Current world position |

\`\`\`js
// Check a specific player by name
const p = Players["Alice"];
if (p) log(p.Position.X, p.Position.Y, p.Position.Z);
\`\`\`

---

## Game Events

Subscribe to global engine events with \`game.on(eventName, handler)\`.

### "tick" — every physics step

Called approximately **20 times per second**. \`dt\` is the elapsed time in seconds (usually ~0.05).

\`\`\`js
let elapsed = 0;
game.on("tick", function(dt) {
  elapsed += dt;
  if (elapsed > 5) {
    log("5 seconds have passed!");
    elapsed = 0;
  }
});
\`\`\`

### "playerAdded" — player joins

\`\`\`js
game.on("playerAdded", function(player) {
  log(player.Name, "joined the game");
  gui.text("Welcome " + player.Name + "!", 20, 20, { color: "#00ff00" });
});
\`\`\`

### "playerRemoving" — player leaves

\`\`\`js
game.on("playerRemoving", function(player) {
  log(player.Name, "left the game");
});
\`\`\`

---

## GUI

Display text labels, buttons, progress bars and images on screen. GUI is **global** — every player in the session sees the same GUI.

### gui.text(text, x, y, opts?)

Creates a text label. Returns a handle with \`update\` and \`remove\` methods.

\`\`\`js
const label = gui.text("Score: 0", 20, 20, {
  color: "#ffffff",   // text color
  fontSize: 18,       // px
  anchor: "topLeft",  // "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "center"
});

// Update later
label.update({ text: "Score: 10" });

// Remove
label.remove();
\`\`\`

### gui.button(text, x, y, onClick, opts?)

Creates a clickable button. \`onClick\` receives the player who clicked.

\`\`\`js
const btn = gui.button("Restart", 20, 60, function(player) {
  log(player.Name, "clicked Restart");
  Scene.Platform.Position = { X: 0, Y: 1, Z: 0 };
}, {
  width: 120,              // px
  height: 36,              // px
  color: "#ffffff",        // label color
  backgroundColor: "#3b82f6",
  fontSize: 14,
  anchor: "topLeft",
});

btn.update({ text: "Go!" });
btn.remove();
\`\`\`

### gui.bar(x, y, value, maxValue, opts?)

Creates a progress / health bar.

\`\`\`js
const hp = gui.bar(20, 100, 100, 100, {
  width: 200,
  height: 16,
  color: "#22c55e",           // fill color
  backgroundColor: "#374151", // track color
  anchor: "topLeft",
});

// Update the fill value
hp.setValue(75);
hp.update({ color: "#ef4444" }); // turn red
hp.remove();
\`\`\`

### gui.image(imageUrl, x, y, opts?)

Displays an image loaded from an asset URL.

\`\`\`js
const icon = gui.image("/assets/coin.png", 20, 140, {
  width: 48,
  height: 48,
  anchor: "topLeft",
});

icon.remove();
\`\`\`

### gui.clear()

Removes all GUI elements at once.

\`\`\`js
gui.clear();
\`\`\`

---

## Timers

All timers are tick-based (they advance during physics steps, not real wall-clock time). The minimum interval is **50 ms** (1 tick).

### setTimeout / clearTimeout

\`\`\`js
// Run once after 2 seconds
const id = setTimeout(function() {
  Scene.Bomb.Visible = false;
  log("Bomb exploded!");
}, 2000); // ms

// Cancel before it fires
clearTimeout(id);
\`\`\`

### setInterval / clearInterval

\`\`\`js
// Run every 3 seconds
const id = setInterval(function() {
  Scene.Coin.Visible = !Scene.Coin.Visible; // toggle visibility
}, 3000);

// Stop
clearInterval(id);
\`\`\`

### task.delay(seconds, fn)

Same as \`setTimeout\` but accepts seconds instead of milliseconds.

\`\`\`js
task.delay(5, function() {
  log("5 seconds later");
});
\`\`\`

### task.spawn(fn)

Runs \`fn\` on the next tick (deferred execution).

\`\`\`js
task.spawn(function() {
  log("runs next tick");
});
\`\`\`

---

## World Utilities

### find(name)

Returns the object proxy for a named object, searching all containers. Useful when you don't know which container holds the object, or for objects not in the Workspace.

\`\`\`js
const obj = find("MyPart");
if (obj) {
  obj.Color = "#ff0000";
}
\`\`\`

### destroy(name)

Hides an object by name (sets \`Visible = false\`). The object stays in the scene but is invisible and removed from physics.

\`\`\`js
destroy("OldBarrier");
\`\`\`

---

## Logging

All log output appears in the in-game console (press **Show Console** from the menu in Play mode).

\`\`\`js
log("Hello, world!");
log("Position:", Scene.Part.Position.X, Scene.Part.Position.Y);
print("Same as log");
warn("Something seems off");
error("Something went wrong");
\`\`\`

---

## Vector3

A lightweight helper for building position/rotation/velocity values.

\`\`\`js
const v = Vector3(1, 2, 3);
// v.X === 1, v.Y === 2, v.Z === 3
// Also accessible as v.x, v.y, v.z

// Factory methods
Vector3.new(x, y, z)   // same as Vector3(x, y, z)
Vector3.zero()         // { X:0, Y:0, Z:0 }
Vector3.one()          // { X:1, Y:1, Z:1 }
Vector3.up()           // { X:0, Y:1, Z:0 }
Vector3.right()        // { X:1, Y:0, Z:0 }
Vector3.forward()      // { X:0, Y:0, Z:-1 }

// magnitude (read-only property)
const len = v.magnitude; // sqrt(1²+2²+3²)
\`\`\`

\`\`\`js
// Typical usage
Scene.Ball.Position = Vector3.new(0, 10, 0);
Scene.Ball.Velocity = Vector3.new(5, 0, 0);
\`\`\`

---

## Color3

Builds CSS color strings from 0–1 RGB components.

\`\`\`js
Color3(1, 0, 0)              // "rgb(255,0,0)" — red
Color3.new(0, 1, 0)          // "rgb(0,255,0)" — green
Color3.fromRGB(0, 0, 255)    // "rgb(0,0,255)" — blue (0-255 range)
Color3.fromHex("#ff8800")    // "#ff8800"      — orange

Scene.Part.Color = Color3(1, 0.5, 0);   // orange
\`\`\`

---

## RunService Alias

\`runService.on\` is an alias for listening to the "tick" event. It exists for Roblox-style muscle memory.

\`\`\`js
runService.on("Heartbeat", function(dt) {
  // same as game.on("tick", fn)
});
\`\`\`

---

## Safe Standard Library

The following globals are available exactly as in a browser:

\`Math\`, \`JSON\`, \`String\`, \`Number\`, \`Boolean\`, \`Array\`, \`Object\`, \`Date\`,
\`parseInt\`, \`parseFloat\`, \`isNaN\`, \`isFinite\`

\`\`\`js
const angle = Math.sin(Date.now() / 1000);
const info  = JSON.stringify({ x: 1, y: 2 });
\`\`\`

The following are **blocked** for security: \`process\`, \`require\`, \`fetch\`, \`__filename\`, \`__dirname\`.

---

## Quick Start Examples

### Spinning platform

\`\`\`js
let angle = 0;
game.on("tick", function(dt) {
  angle += dt;
  Scene.Platform.Rotation = { X: 0, Y: angle, Z: 0 };
});
\`\`\`

### Colored touch zone

\`\`\`js
Scene.Zone.Color = "#00ff00";

Scene.Zone.on("Touched", function(player) {
  log(player.Name, "entered the zone");
  Scene.Zone.Color = "#ff0000";

  task.delay(2, function() {
    Scene.Zone.Color = "#00ff00";
  });
});
\`\`\`

### Score counter with GUI

\`\`\`js
let score = 0;
const label = gui.text("Score: 0", 20, 20, { fontSize: 20 });

Scene.Coin.on("Touched", function(player) {
  score += 1;
  label.update({ text: "Score: " + score });
  Scene.Coin.Visible = false;

  task.delay(3, function() {
    Scene.Coin.Visible = true;
  });
});
\`\`\`

### Player join message

\`\`\`js
game.on("playerAdded", function(player) {
  log(player.Name, "joined at", player.Position.X, player.Position.Y, player.Position.Z);
});

game.on("playerRemoving", function(player) {
  log(player.Name, "left");
});
\`\`\`

### Moving platform

\`\`\`js
let t = 0;
game.on("tick", function(dt) {
  t += dt;
  Scene.MovingPlatform.Position = {
    X: Math.sin(t) * 5,
    Y: 1,
    Z: 0,
  };
});
\`\`\`

### Countdown timer with GUI

\`\`\`js
let timeLeft = 60;
const timerLabel = gui.text("Time: 60", 20, 20, { fontSize: 18 });

setInterval(function() {
  timeLeft -= 1;
  timerLabel.update({ text: "Time: " + timeLeft });
  if (timeLeft <= 0) {
    timerLabel.update({ text: "Time's up!", color: "#ef4444" });
  }
}, 1000);
\`\`\`

### Health bar

\`\`\`js
let health = 100;
const hpBar = gui.bar(20, 20, 100, 100, {
  width: 200,
  color: "#22c55e",
  backgroundColor: "#374151",
});

Scene.Trap.on("Touched", function(player) {
  health = Math.max(0, health - 25);
  hpBar.setValue(health);
  if (health <= 0) {
    hpBar.update({ color: "#ef4444" });
    log("Player died!");
  }
});
\`\`\`

### Blinking light

\`\`\`js
let on = true;
setInterval(function() {
  on = !on;
  Scene.SignalLight.Color = on ? "#ff0000" : "#333333";
}, 500);
\`\`\`

### Moving object toward a target

\`\`\`js
const speed = 3;
const target = { X: 10, Y: 1, Z: 0 };

game.on("tick", function(dt) {
  const pos = Scene.Enemy.Position;
  const dx = target.X - pos.X;
  const dz = target.Z - pos.Z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > 0.1) {
    Scene.Enemy.Position = {
      X: pos.X + (dx / dist) * speed * dt,
      Y: pos.Y,
      Z: pos.Z + (dz / dist) * speed * dt,
    };
  }
});
\`\`\`

---

*All scripts run in a sandboxed Node.js VM. They cannot access the file system, network, or other games.*
`;
