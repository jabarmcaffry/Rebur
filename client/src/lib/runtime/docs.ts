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

All scripts run **server-side** inside a secure VM sandbox. They have full access to scene objects, players, GUI, timers, physics, state, tweens, and sounds — but not to the file system, network, or Node.js internals.

---

## Table of Contents

1. [Execution Model](#execution-model)
2. [Scene Objects](#scene-objects)
3. [Object Properties](#object-properties)
4. [Object Events](#object-events)
5. [Create Objects at Runtime](#create-objects-at-runtime)
6. [Players](#players)
7. [Game Events](#game-events)
8. [Shared State Machine](#shared-state-machine)
9. [Tween System](#tween-system)
10. [Sound](#sound)
11. [GUI](#gui)
12. [Timers](#timers)
13. [World Utilities](#world-utilities)
14. [Logging](#logging)
15. [Vector3](#vector3)
16. [Color3](#color3)
17. [RunService Alias](#runservice-alias)
18. [Safe Standard Library](#safe-standard-library)
19. [Quick Start Examples](#quick-start-examples)

---

## Execution Model

Scripts load once when Play starts. Top-level code runs immediately; ongoing logic is driven by event handlers.

\`\`\`js
// Top-level code runs ONCE when the script loads
log("Script started!");

// Register handlers for ongoing work
game.on("tick", function(dt) {
  // Called every physics step (~20× per second), dt ≈ 0.05 seconds
});

Scene.Part.on("Touched", function(player) {
  // Called when a player's capsule enters the part
});
\`\`\`

**Key principle:** Avoid blocking loops (\`while(true)\`). Use events and timers instead.

---

## Scene Objects

Access any named object in your scene via the \`Scene\` proxy. Names are **case-sensitive** and must match the Hierarchy panel exactly.

\`\`\`js
// Access by name
Scene.PartName
Scene["My Part"]     // bracket notation for names with spaces

// Find by name across ALL containers (Workspace, Lighting, etc.)
const obj = find("PartName");
const obj = game.find("PartName");  // identical

// Destroy (hide) an object by name
destroy("OldBarrier");
game.destroy("OldBarrier");  // identical
\`\`\`

If the object does not exist, reads return \`undefined\` and a warning is printed to the console. Writes are silently ignored.

---

## Object Properties

All properties use **PascalCase** and are readable and writable unless noted.

### Position

\`\`\`js
const pos = Scene.Part.Position;  // { X, Y, Z }
log(pos.X, pos.Y, pos.Z);

Scene.Part.Position = { X: 0, Y: 5, Z: 0 };
Scene.Part.Position = { X: pos.X + 1, Y: pos.Y, Z: pos.Z };
\`\`\`

### Rotation

Values are in **radians**.

\`\`\`js
const rot = Scene.Part.Rotation;  // { X, Y, Z }
Scene.Part.Rotation = { X: 0, Y: Math.PI / 2, Z: 0 };  // 90° around Y

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
Scene.Part.Color = "#ff0000";
Scene.Part.Color = "blue";
Scene.Part.Color = "rgb(0, 255, 0)";
\`\`\`

### Visible

\`\`\`js
Scene.Part.Visible = false;  // hide
Scene.Part.Visible = true;   // show
\`\`\`

### Transparency

0 = fully opaque, 1 = fully invisible.

\`\`\`js
Scene.Part.Transparency = 0.5;   // 50% see-through
\`\`\`

### Anchored

When \`true\` the part is a static collider. When \`false\` it can be moved by scripts and physics.

\`\`\`js
Scene.Part.Anchored = false;  // becomes dynamic
Scene.Part.Anchored = true;   // becomes static collider
\`\`\`

### CanCollide

Whether players and physics objects collide with this part.

\`\`\`js
Scene.Part.CanCollide = false;  // walk through it
\`\`\`

### Velocity

Applies a velocity vector to an unanchored dynamic object.

\`\`\`js
Scene.Ball.Velocity = { X: 0, Y: 10, Z: 0 };   // launch upward
Scene.Ball.Velocity = { X: 5, Y: 0, Z: -5 };   // launch diagonally
\`\`\`

### Size / Scale *(read-only)*

\`\`\`js
const sz = Scene.Part.Size;  // { X, Y, Z }
log(sz.X, sz.Y, sz.Z);
\`\`\`

### Name *(read-only)*

\`\`\`js
log(Scene.Part.Name);  // "Part"
\`\`\`

---

## Object Events

### .on(eventName, handler) → unsubscribe

Listen for an event on a specific object. Returns an unsubscribe function.

| Event | When it fires | Handler receives |
|-------|---------------|-----------------|
| \`"Touched"\` | Player capsule enters the object | \`player\` |
| \`"clicked"\` | A player clicks the object in 3D | \`player\` |
| *(custom)* | Your script calls \`.emit()\` | whatever args you pass |

\`\`\`js
const unsub = Scene.Lava.on("Touched", function(player) {
  player.TakeDamage(25);
});

// Stop listening later
unsub();
\`\`\`

\`\`\`js
// 3D click — fires when the player clicks an object in the viewport
Scene.Chest.on("clicked", function(player) {
  log(player.Name, "opened the chest!");
  Scene.Chest.Visible = false;
});
\`\`\`

### .off(eventName, handler)

Remove a specific listener.

\`\`\`js
function onTouch(player) { log("touched!"); }
Scene.Button.on("Touched", onTouch);
Scene.Button.off("Touched", onTouch);
\`\`\`

### .emit(eventName, ...args)

Fire a custom event on this object. Any \`.on()\` listener for the same event on the same object will be called.

\`\`\`js
Scene.Door.emit("Open", { speed: 2 });

Scene.Door.on("Open", function(opts) {
  log("Opening at speed", opts.speed);
});
\`\`\`

---

## Create Objects at Runtime

Use \`game.create()\` to spawn a new object into the scene while the game is running.

\`\`\`js
game.create({
  name: "Fireball",           // Name used to reference via Scene.Fireball
  primitiveType: "sphere",    // "cube" | "sphere" | "cylinder" | "plane"
  position: { x: 0, y: 5, z: 0 },
  scale: { x: 1, y: 1, z: 1 },  // also accepts: size: { x, y, z }
  color: "#ff4400",
  anchored: false,            // false = physics-driven (default)
  canCollide: true,           // default: true
  transparency: 0,            // 0–1
});
\`\`\`

\`\`\`js
// Short form using x/y/z directly
game.create({
  name: "Coin_" + Date.now(),
  primitiveType: "cylinder",
  x: 3, y: 1, z: -5,
  color: "#ffd700",
  anchored: true,
});
\`\`\`

After creation the object appears in the scene on the next tick and can be accessed via \`Scene["Coin_..."]\` or \`find("Coin_...")\`.

> **Note:** Objects created at runtime are not saved to the game — they exist only during the current Play session.

---

## Players

Access connected players via the \`Players\` proxy.

### Players.GetPlayers() → Player[]

Returns an array of all currently connected players.

\`\`\`js
const all = Players.GetPlayers();
log("There are", all.length, "players");

for (const player of all) {
  log(player.Name, "is at", player.Position.Y);
}
\`\`\`

### Players["Name"] → Player | undefined

Look up a specific player by their display name.

\`\`\`js
const alice = Players["Alice"];
if (alice) {
  alice.TakeDamage(10);
}
\`\`\`

### Player Properties

| Property | Type | Read | Write | Description |
|----------|------|------|-------|-------------|
| \`Name\` | string | ✓ | — | Display name |
| \`UserId\` | string | ✓ | — | Unique session ID |
| \`Position\` | \`{X,Y,Z}\` | ✓ | — | Current world position |
| \`Health\` | number | ✓ | ✓ | Current HP (0–MaxHealth) |
| \`MaxHealth\` | number | ✓ | ✓ | Max HP (default 100) |
| \`WalkSpeed\` / \`Speed\` | number | ✓ | ✓ | Movement speed (default 14) |
| \`JumpPower\` | number | ✓ | ✓ | Jump velocity (default 14) |
| \`ShirtColor\` | string | ✓ | ✓ | Shirt color (CSS) |
| \`SkinColor\` | string | ✓ | ✓ | Skin color (CSS) |
| \`PantsColor\` | string | ✓ | ✓ | Pants color (CSS) |

### Player Methods

\`\`\`js
player.TakeDamage(n)       // reduce health by n; triggers death at 0
player.Heal(n)             // increase health by n, capped at MaxHealth
player.Kill()              // set health to 0 (triggers death/respawn)
player.Respawn()           // teleport to spawn point, restore full health
player.Teleport(x, y, z)   // move instantly to world position
\`\`\`

### Health system

When a player's health reaches 0 (via \`TakeDamage\`, \`Kill\`, falling out of the world, etc.), the engine automatically:
1. Fires \`game.on("playerDied", fn)\`
2. Respawns the player at the SpawnLocation
3. Restores full health
4. Fires \`game.on("playerSpawned", fn)\`

\`\`\`js
Scene.Lava.on("Touched", function(player) {
  player.TakeDamage(50);
  log(player.Name, "hit lava! HP:", player.Health);
});

game.on("playerDied", function(player) {
  log(player.Name, "died and will respawn");
});
\`\`\`

---

## Game Events

Subscribe to global engine events with \`game.on(eventName, handler)\`.

| Event | When | Handler receives |
|-------|------|-----------------|
| \`"tick"\` | Every physics step (~20 Hz) | \`dt\` (seconds) |
| \`"playerAdded"\` | A player joins | \`player\` |
| \`"playerRemoving"\` | A player leaves | \`player\` |
| \`"playerDied"\` | A player's health hits 0 | \`player\` |
| \`"playerSpawned"\` | A player spawns/respawns | \`player\` |

\`\`\`js
game.on("tick", function(dt) {
  // dt ≈ 0.05 seconds (20 Hz)
});

game.on("playerAdded", function(player) {
  log(player.Name, "joined!");
  gui.text("Welcome " + player.Name, 20, 20, { color: "#00ff00" });
});

game.on("playerRemoving", function(player) {
  log(player.Name, "left");
});

game.on("playerDied", function(player) {
  log(player.Name, "died");
});

game.on("playerSpawned", function(player) {
  log(player.Name, "spawned at", player.Position.Y);
});
\`\`\`

---

## Shared State Machine

\`game.state\` is a key-value store shared across all scripts in the session. Use it for score, rounds, flags, etc.

### game.state.set(key, value)

\`\`\`js
game.state.set("score", 0);
game.state.set("phase", "lobby");
game.state.set("alive", true);
\`\`\`

### game.state.get(key) → value

\`\`\`js
const score = game.state.get("score");
log("Current score:", score);
\`\`\`

### game.state.on(key, handler) → unsubscribe

Runs whenever the value for \`key\` changes.

\`\`\`js
game.state.on("score", function(newVal, oldVal) {
  log("Score changed from", oldVal, "to", newVal);
  scoreLabel.update({ text: "Score: " + newVal });
});
\`\`\`

### game.state.keys() → string[]

\`\`\`js
log(game.state.keys());  // ["score", "phase", ...]
\`\`\`

### Full example

\`\`\`js
game.state.set("score", 0);
const label = gui.text("Score: 0", 20, 20, { fontSize: 20 });

game.state.on("score", function(val) {
  label.update({ text: "Score: " + val });
});

Scene.Coin.on("Touched", function(player) {
  const s = game.state.get("score") + 1;
  game.state.set("score", s);
  Scene.Coin.Visible = false;
  task.delay(3, function() { Scene.Coin.Visible = true; });
});
\`\`\`

---

## Tween System

Smoothly interpolate an object's properties over time.

### game.tween(object, properties, duration, easing?, onDone?)

| Easing | Description |
|--------|-------------|
| \`"linear"\` | Constant speed (default) |
| \`"easeIn"\` | Starts slow, ends fast |
| \`"easeOut"\` | Starts fast, ends slow |
| \`"easeInOut"\` | Slow at both ends |
| \`"bounce"\` | Bounces at the end |
| \`"elastic"\` | Elastic spring overshoot |

**Supported properties:**

| Key | Controls |
|-----|---------|
| \`X\`, \`Y\`, \`Z\` | Position |
| \`RotX\`, \`RotY\`, \`RotZ\` | Rotation |
| \`ScaleX\`, \`ScaleY\`, \`ScaleZ\` | Scale |
| \`Transparency\` | Opacity |

\`\`\`js
// Move Part to Y=5 over 2 seconds (ease in/out)
game.tween(Scene.Part, { Y: 5 }, 2, "easeInOut");

// Spin it 180° around Y over 1 second, then log "done"
game.tween(Scene.Gate, { RotY: Math.PI }, 1, "linear", function() {
  log("Gate opened!");
});

// Fade out over 0.5 seconds
game.tween(Scene.Ghost, { Transparency: 1 }, 0.5, "easeIn");

// Chain tweens
game.tween(Scene.Elevator, { Y: 10 }, 3, "easeInOut", function() {
  task.delay(2, function() {
    game.tween(Scene.Elevator, { Y: 0 }, 3, "easeInOut");
  });
});
\`\`\`

---

## Sound

Play a sound for all players in the session.

### game.sound.play(soundId, opts?)

\`soundId\` maps to a sound file on the client. Built-in sounds: \`"jump"\`, \`"land"\`, \`"hit"\`, \`"collect"\`, \`"click"\`.

\`\`\`js
game.sound.play("collect");

game.sound.play("hit", {
  volume: 0.5,   // 0.0–1.0, default 1.0
  loop: false,   // loop the sound
});

// Example: play sound when player touches zone
Scene.CoinZone.on("Touched", function(player) {
  game.sound.play("collect");
  player.Heal(10);
});
\`\`\`

---

## GUI

Display text, buttons, progress bars and images on screen. GUI is **global** — every player sees the same elements.

### gui.text(text, x, y, opts?) → handle

\`\`\`js
const label = gui.text("Score: 0", 20, 20, {
  color: "#ffffff",           // text color (CSS)
  fontSize: 18,               // pixels
  anchor: "topLeft",          // "topLeft"|"topRight"|"bottomLeft"|"bottomRight"|"center"
  backgroundColor: "#00000066",  // optional background
});

label.update({ text: "Score: 10", color: "#ffff00" });
label.remove();
\`\`\`

### gui.button(text, x, y, onClick, opts?) → handle

\`onClick\` receives the player who clicked the button.

\`\`\`js
const btn = gui.button("Restart", 20, 60, function(player) {
  log(player.Name, "pressed Restart");
  player.Respawn();
}, {
  width: 120,
  height: 36,
  color: "#ffffff",
  backgroundColor: "#3b82f6",
  fontSize: 14,
  anchor: "topLeft",
});

btn.update({ text: "Go!" });
btn.remove();
\`\`\`

### gui.bar(x, y, value, maxValue, opts?) → handle

Progress / health bar.

\`\`\`js
const hp = gui.bar(20, 100, 100, 100, {
  width: 200,
  height: 16,
  color: "#22c55e",           // fill color
  backgroundColor: "#374151", // track color
  anchor: "topLeft",
});

hp.setValue(75);              // update fill amount
hp.update({ color: "#ef4444" });
hp.remove();
\`\`\`

### gui.image(imageUrl, x, y, opts?) → handle

\`\`\`js
const icon = gui.image("/uploads/coin.png", 20, 140, {
  width: 48,
  height: 48,
  anchor: "topLeft",
});

icon.update({ visible: false });
icon.remove();
\`\`\`

### gui.clear()

Remove all GUI elements at once.

\`\`\`js
gui.clear();
\`\`\`

---

## Timers

All timers are **tick-based** (advance during physics steps, not real wall time). Minimum interval: **50 ms** (1 tick).

### setTimeout(fn, ms) / clearTimeout(id)

\`\`\`js
const id = setTimeout(function() {
  Scene.Bomb.Visible = false;
  log("Exploded!");
}, 2000);  // 2 seconds

clearTimeout(id);  // cancel before it fires
\`\`\`

### setInterval(fn, ms) / clearInterval(id)

\`\`\`js
const id = setInterval(function() {
  Scene.Coin.Visible = !Scene.Coin.Visible;
}, 500);   // every 0.5 seconds

clearInterval(id);
\`\`\`

### task.delay(seconds, fn)

Same as \`setTimeout\` but takes **seconds** instead of milliseconds.

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

### find(name) → object proxy

Search all containers (Workspace, Lighting, etc.) for an object by name.

\`\`\`js
const obj = find("HiddenTreasure");
if (obj) obj.Visible = true;
\`\`\`

### destroy(name)

Hides an object (sets \`Visible = false\`). Physics is removed, but the object stays in the scene hierarchy.

\`\`\`js
destroy("OldWall");
\`\`\`

---

## Logging

Output appears in the in-game console (accessible from the Play mode HUD menu → **Show Console**).

\`\`\`js
log("Hello!", 42, { x: 1 });
print("Same as log");
warn("Something's odd");
error("Something broke");
\`\`\`

---

## Vector3

Lightweight helper for position/rotation/velocity values.

\`\`\`js
const v = Vector3(1, 2, 3);
// v.X === 1, v.Y === 2, v.Z === 3 (also v.x, v.y, v.z)

// Factory methods
Vector3.new(x, y, z)   // same as Vector3(x, y, z)
Vector3.zero()         // { X:0, Y:0, Z:0 }
Vector3.one()          // { X:1, Y:1, Z:1 }
Vector3.up()           // { X:0, Y:1, Z:0 }
Vector3.right()        // { X:1, Y:0, Z:0 }
Vector3.forward()      // { X:0, Y:0, Z:-1 }

// Properties
v.magnitude            // sqrt(X²+Y²+Z²)

// Methods (return a new Vector3)
v.add(other)
v.sub(other)
v.scale(n)
v.normalize()
v.dot(other)           // scalar dot product
\`\`\`

\`\`\`js
// Typical usage
Scene.Ball.Position = Vector3.new(0, 10, 0);
Scene.Ball.Velocity  = Vector3.new(5, 0, 0);

const dir = Vector3(target.X - pos.X, 0, target.Z - pos.Z).normalize();
Scene.Enemy.Position = {
  X: pos.X + dir.X * speed * dt,
  Y: pos.Y,
  Z: pos.Z + dir.Z * speed * dt,
};
\`\`\`

---

## Color3

Build CSS color strings from component values.

\`\`\`js
Color3(1, 0, 0)              // "rgb(255,0,0)"   — red
Color3.new(0, 1, 0)          // "rgb(0,255,0)"   — green  (0–1 range)
Color3.fromRGB(0, 0, 255)    // "rgb(0,0,255)"   — blue   (0–255 range)
Color3.fromHex("#ff8800")    // "#ff8800"         — orange

Scene.Part.Color = Color3(1, 0.5, 0);
\`\`\`

---

## RunService Alias

\`runService.on\` is a Roblox-style alias for \`game.on("tick")\`.

\`\`\`js
runService.on("Heartbeat", function(dt) {
  // identical to game.on("tick", fn)
});

// Also available as:
runService.Heartbeat.Connect(function(dt) { ... });
\`\`\`

---

## Safe Standard Library

These globals are available exactly as in a browser:

\`Math\`, \`JSON\`, \`String\`, \`Number\`, \`Boolean\`, \`Array\`, \`Object\`, \`Date\`,
\`parseInt\`, \`parseFloat\`, \`isNaN\`, \`isFinite\`, \`Symbol\`

\`\`\`js
const angle = Math.sin(Date.now() / 1000);
const info  = JSON.stringify({ score: 42 });
const items = Array.from({ length: 5 }, (_, i) => i + 1);
\`\`\`

The following are **blocked** for security: \`process\`, \`require\`, \`fetch\`, \`__filename\`, \`__dirname\`, \`Promise\`.

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

### Moving platform (oscillating)

\`\`\`js
let t = 0;
game.on("tick", function(dt) {
  t += dt;
  Scene.Platform.Position = {
    X: Math.sin(t) * 5,
    Y: 1,
    Z: 0,
  };
});
\`\`\`

### Lava zone — damage on touch

\`\`\`js
Scene.Lava.Color = "#ff4400";

Scene.Lava.on("Touched", function(player) {
  player.TakeDamage(25);
  log(player.Name, "touched lava! HP:", player.Health);
});
\`\`\`

### Score counter

\`\`\`js
game.state.set("score", 0);
const label = gui.text("Score: 0", 20, 20, { fontSize: 20 });

game.state.on("score", function(val) {
  label.update({ text: "Score: " + val });
});

Scene.Coin.on("Touched", function(player) {
  game.state.set("score", game.state.get("score") + 1);
  Scene.Coin.Visible = false;
  task.delay(3, function() { Scene.Coin.Visible = true; });
});
\`\`\`

### Countdown timer

\`\`\`js
let timeLeft = 60;
const timerLabel = gui.text("Time: 60", 20, 20, { fontSize: 18 });

setInterval(function() {
  if (timeLeft <= 0) return;
  timeLeft -= 1;
  timerLabel.update({ text: "Time: " + timeLeft });
  if (timeLeft <= 0) {
    timerLabel.update({ text: "Time's up!", color: "#ef4444" });
  }
}, 1000);
\`\`\`

### Health bar HUD

\`\`\`js
let health = 100;
const hpBar = gui.bar(20, 20, 100, 100, {
  width: 200, color: "#22c55e", backgroundColor: "#374151",
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

### Spawn objects dynamically

\`\`\`js
// Drop a bomb every 3 seconds at a random position
setInterval(function() {
  const x = (Math.random() - 0.5) * 20;
  const z = (Math.random() - 0.5) * 20;
  game.create({
    name: "Bomb_" + Date.now(),
    primitiveType: "sphere",
    x: x, y: 10, z: z,
    color: "#222222",
    anchored: false,
  });
}, 3000);
\`\`\`

### Player join welcome + speed boost

\`\`\`js
game.on("playerAdded", function(player) {
  log(player.Name, "joined!");
  player.Speed = 20;     // boost speed
  player.JumpPower = 20; // boost jump
});
\`\`\`

### Object click to open door

\`\`\`js
let open = false;

Scene.DoorButton.on("clicked", function(player) {
  open = !open;
  log(player.Name, open ? "opened" : "closed", "the door");
  game.tween(Scene.Door, { RotY: open ? Math.PI / 2 : 0 }, 0.5, "easeInOut");
});
\`\`\`

### Tween a platform up and down forever

\`\`\`js
function goUp() {
  game.tween(Scene.Elevator, { Y: 8 }, 3, "easeInOut", function() {
    task.delay(1, goDown);
  });
}
function goDown() {
  game.tween(Scene.Elevator, { Y: 1 }, 3, "easeInOut", function() {
    task.delay(1, goUp);
  });
}
goUp();
\`\`\`

### Shared state between multiple scripts

\`\`\`js
// Script 1 — sets state
game.state.set("round", 1);

// Script 2 — reacts to state changes
game.state.on("round", function(round) {
  log("Round changed to", round);
  Scene.RoundSign.Color = round % 2 === 0 ? "#3b82f6" : "#22c55e";
});
\`\`\`

### Track player positions every second

\`\`\`js
setInterval(function() {
  const players = Players.GetPlayers();
  for (const p of players) {
    log(p.Name, "is at Y =", p.Position.Y.toFixed(1));
  }
}, 1000);
\`\`\`

---

*All scripts run in a sandboxed Node.js VM. They cannot access the file system, network, or other games.*
`;
