import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import * as THREE from "three";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X, Terminal, Heart, Settings, MessageSquare, Send,
  RotateCcw, LogOut, Gauge, Lock, Play, Users, BarChart3,
} from "lucide-react";
import { getAvatarConfig } from "@/lib/avatarConfig";
import type { GameObject, Script } from "@shared/schema";
import SVGScene from "@/components/SVGScene";
import { isWebGLAvailable } from "@/lib/webgl";
import PlayCanvasErrorBoundary, { AvatarErrorBoundary } from "@/components/play/PlayCanvasErrorBoundary";
import GuiOverlay from "@/components/play/GuiOverlay";
import VirtualJoystick from "@/components/play/VirtualJoystick";
import Primitive from "@/components/play/Primitive";
import Avatar from "@/components/play/Avatar";
import ChaseCameraRig from "@/components/play/ChaseCameraRig";
import { RenderClient } from "@/lib/render-client";
import { ClientScriptRunner } from "@/lib/runtime/client-script-runner";
import type { RenderObject, RenderPlayer, RenderGuiElement, DebugDraw, ParticleEvent } from "@shared/render-types";

interface ChatMessage {
  id: number;
  username: string;
  text: string;
  ts: number;
}

// ── DebugDrawLayer ────────────────────────────────────────────────────────────
// Renders debug visualization (rays, points, boxes, spheres) inside the R3F scene.
function DebugDrawLayer({ draws }: { draws: DebugDraw[] }) {
  const groupRef = useRef<THREE.Group>(null!);
  const expiry = useRef<Map<number, number>>(new Map());
  const meshes = useRef<Map<number, THREE.Object3D>>(new Map());

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const now = performance.now() / 1000;
    const seenIds = new Set<number>();

    draws.forEach((d, i) => {
      seenIds.add(i);
      if (meshes.current.has(i)) return; // already rendered

      let obj: THREE.Object3D | null = null;
      const color = d.color ?? "#ffffff";

      if (d.kind === "ray") {
        const origin = new THREE.Vector3(d.origin.x, d.origin.y, d.origin.z);
        const dir = d.direction
          ? new THREE.Vector3(d.direction.x, d.direction.y, d.direction.z).normalize()
          : new THREE.Vector3(0, 1, 0);
        const end = origin.clone().addScaledVector(dir, d.length ?? 10);
        const pts = [origin, end];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color });
        obj = new THREE.Line(geo, mat);
      } else if (d.kind === "point") {
        const geo = new THREE.SphereGeometry((d.radius ?? 0.12), 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color });
        obj = new THREE.Mesh(geo, mat);
        obj.position.set(d.origin.x, d.origin.y, d.origin.z);
      } else if (d.kind === "box") {
        const s = d.size ?? { x: 1, y: 1, z: 1 };
        const geo = new THREE.BoxGeometry(s.x, s.y, s.z);
        const mat = new THREE.MeshBasicMaterial({ color, wireframe: true });
        obj = new THREE.Mesh(geo, mat);
        obj.position.set(d.origin.x, d.origin.y, d.origin.z);
      } else if (d.kind === "sphere") {
        const geo = new THREE.SphereGeometry(d.radius ?? 0.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color, wireframe: true });
        obj = new THREE.Mesh(geo, mat);
        obj.position.set(d.origin.x, d.origin.y, d.origin.z);
      }

      if (obj) {
        group.add(obj);
        meshes.current.set(i, obj);
        expiry.current.set(i, now + (d.duration ?? 0.05));
      }
    });

    // Clean up expired
    expiry.current.forEach((exp, id) => {
      if (now > exp || !seenIds.has(id)) {
        const m = meshes.current.get(id);
        if (m) group.remove(m);
        meshes.current.delete(id);
        expiry.current.delete(id);
      }
    });
  }, [draws]);

  return <group ref={groupRef} />;
}

// ── ParticleLayer ──────────────────────────────────────────────────────────────
// Renders particle bursts from the server particle event queue.

interface LiveParticle {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

let _particleSeq = 0;

function ParticleLayer({ events, onDone }: { events: ParticleEvent[]; onDone: () => void }) {
  const particles = useRef<LiveParticle[]>([]);
  const pointsRef = useRef<THREE.Points>(null!);
  const processed = useRef<Set<string>>(new Set());

  // Spawn particles from new events
  useEffect(() => {
    events.forEach((ev) => {
      const px = ev.position.x, py = ev.position.y, pz = ev.position.z;
      const key = `${ev.id}`;
      if (processed.current.has(key)) return;
      processed.current.add(key);

      const count = ev.count ?? 10;
      const speed = ev.speed ?? 5;
      const lifetime = ev.lifetime ?? 0.6;
      const color = ev.color ?? "#ffffff";
      const size = ev.size ?? 0.12;
      const spread = ev.spread ?? Math.PI;

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * spread;
        const vel = new THREE.Vector3(
          Math.cos(theta) * Math.cos(phi),
          Math.sin(phi),
          Math.sin(theta) * Math.cos(phi)
        ).multiplyScalar(speed * (0.6 + Math.random() * 0.4));
        particles.current.push({
          id: _particleSeq++,
          pos: new THREE.Vector3(px, py, pz),
          vel,
          life: lifetime,
          maxLife: lifetime,
          color,
          size,
        });
      }
    });
    if (events.length > 0) {
      processed.current.clear();
    }
  }, [events]);

  useFrame(({ clock }, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;

    const dt = Math.min(delta, 0.05);
    particles.current = particles.current.filter(p => {
      p.pos.addScaledVector(p.vel, dt);
      p.vel.y -= 6 * dt; // gravity
      p.life -= dt;
      return p.life > 0;
    });

    const count = particles.current.length;
    const geo = pts.geometry;
    const positions = new Float32Array(count * 3);
    particles.current.forEach((p, i) => {
      positions[i * 3]     = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
    });
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, count);
    geo.computeBoundingSphere();

    if (count === 0 && events.length > 0) {
      onDone();
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(0), 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.15} vertexColors={false} color="#ffffff" sizeAttenuation />
    </points>
  );
}

// ── ParticleEmitterLayer ──────────────────────────────────────────────────────
// Continuously emits particles for every `particleEmitter` object in the scene.
// Emission origin = parent object position if parentId is set, else emitter position.
interface ContinuousParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

function ParticleEmitterLayer({ renderableObjects }: { renderableObjects: RenderObject[] }) {
  const particles = useRef<ContinuousParticle[]>([]);
  const accumulators = useRef<Map<string, number>>(new Map());
  const pointsRef = useRef<THREE.Points>(null!);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Build a quick lookup of objects by ID for parent lookups
    const byId = new Map<string, RenderObject>();
    for (const o of renderableObjects) byId.set(o.id, o);

    // Emit new particles from each enabled emitter
    const emitters = renderableObjects.filter(o => o.type === "particleEmitter");
    for (const em of emitters) {
      const props = (em as any).properties ?? {};
      if (!props.enabled) continue;

      const rate: number = props.rate ?? 15;
      const interval = 1 / rate;

      const acc = (accumulators.current.get(em.id) ?? 0) + dt;
      const burst = Math.floor(acc / interval);
      accumulators.current.set(em.id, acc - burst * interval);
      if (burst === 0) continue;

      // Emission origin: use parent position if parentId is set
      const parentObj = em.parentId ? byId.get(em.parentId) : null;
      const ox = parentObj ? parentObj.position.x : em.position.x;
      const oy = parentObj ? parentObj.position.y : em.position.y;
      const oz = parentObj ? parentObj.position.z : em.position.z;

      const lifetime: number = props.lifetime ?? 1.2;
      const speed: number = props.speed ?? 4;
      const spreadDeg: number = props.spread ?? 80;
      const spreadRad = (spreadDeg / 180) * Math.PI;
      const color: string = em.color ?? props.color ?? "#ffffff";
      const size: number = props.size ?? 0.1;
      const effectType: string = props.effectType ?? "custom";

      for (let i = 0; i < burst; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = (Math.random() - 0.5) * spreadRad;
        const vel = new THREE.Vector3(
          Math.cos(theta) * Math.cos(phi),
          Math.sin(phi),
          Math.sin(theta) * Math.cos(phi)
        ).multiplyScalar(speed * (0.7 + Math.random() * 0.3));

        // Preset effects
        if (effectType === "fire") {
          vel.y = Math.abs(vel.y) * 1.5; // fire goes upward
        } else if (effectType === "snow") {
          vel.y = -Math.abs(vel.y) * 0.5; // snow falls
        } else if (effectType === "explosion") {
          vel.multiplyScalar(2);
        }

        particles.current.push({
          pos: new THREE.Vector3(ox, oy, oz),
          vel,
          life: lifetime * (0.8 + Math.random() * 0.4),
          maxLife: lifetime,
          color,
          size,
        });
      }
    }

    // Simulate all particles
    const gravity = 3;
    particles.current = particles.current.filter(p => {
      p.pos.addScaledVector(p.vel, dt);
      p.vel.y -= gravity * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // Cap particle count
    if (particles.current.length > 3000) {
      particles.current = particles.current.slice(particles.current.length - 3000);
    }

    // Write to geometry
    const pts = pointsRef.current;
    if (!pts) return;
    const count = particles.current.length;
    const geo = pts.geometry;
    const positions = new Float32Array(count * 3);
    particles.current.forEach((p, i) => {
      positions[i * 3]     = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
    });
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, count);
    geo.computeBoundingSphere();
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array(0), 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.12} vertexColors={false} color="#ffffff" sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

export default function PlayMode({
  objects,
  scripts,
  username,
  gameId,
  userId,
  onExit,
}: {
  objects: GameObject[];
  scripts: Script[];
  username: string;
  gameId: string;
  userId?: string;
  onExit: (logs: string[]) => void;
}) {
  // Get avatar colors
  const avatarCfg = useMemo(() => getAvatarConfig(), []);
  
  // Create RenderClient for server communication
  const renderClient = useMemo(() => {
    return new RenderClient(gameId, username, {
      shirtColor: avatarCfg.shirtColor,
      skinColor: avatarCfg.skinColor,
      pantsColor: avatarCfg.pantsColor,
    }, userId);
  }, [gameId, username, avatarCfg, userId]);

  // State for rendering
  const [renderObjects, setRenderObjects] = useState<RenderObject[]>([]);
  const [renderPlayers, setRenderPlayers] = useState<RenderPlayer[]>([]);
  const [localPlayer, setLocalPlayer] = useState<RenderPlayer | null>(null);
  const [guiElements, setGuiElements] = useState<RenderGuiElement[]>([]);
  const [worldSpaceGui, setWorldSpaceGui] = useState<RenderGuiElement[]>([]);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const clientRunnerRef = useRef<ClientScriptRunner | null>(null);

  const [showConsole, setShowConsole] = useState(false);
  const [isMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  const webglAvailableInitial = useMemo(() => isWebGLAvailable(), []);
  // Runtime context-loss tracking — if WebGL crashes after startup, fall back to SVGScene
  const [webglContextLost, setWebglContextLost] = useState(false);
  const webglAvailable = webglAvailableInitial && !webglContextLost;

  // Menu / settings state
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shiftLock, setShiftLock] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

  // Leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(true);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, username: "System", text: `${username} joined the game`, ts: Date.now() },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const msgCounter = useRef(1);

  // Multiplayer connection state
  const [mpConnected, setMpConnected] = useState(false);
  const [mpError, setMpError] = useState<{ code: string; message: string } | null>(null);

  // Input state
  const inputRef = useRef({ moveX: 0, moveZ: 0, jump: false, camY: 0 });
  const keysRef = useRef<Record<string, boolean>>({});

  // Camera ref for yaw tracking
  // Camera starts at [0, 4, 8] looking toward origin → forward dir is -Z →
  // atan2(0, -1) = π.  Initialise to π so the very first input packet uses
  // the correct camera-relative direction even before ChaseCameraRig fires.
  const cameraYawRef = useRef(Math.PI);
  // World-space camera position + forward (sent to server for Rebur.Camera ray helpers)
  const cameraStateRef = useRef<{
    pos: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
  }>({ pos: { x: 0, y: 10, z: 8 }, forward: { x: 0, y: 0, z: -1 } });

  // Debug draws and particle events from server
  const [debugDraws, setDebugDraws] = useState<DebugDraw[]>([]);
  const [particleEvents, setParticleEvents] = useState<ParticleEvent[]>([]);

  // Connect to server and set up callbacks
  useEffect(() => {
    renderClient.onPlayersChanged = () => {
      setRenderPlayers(Array.from(renderClient.players.values()));
      setLocalPlayer(renderClient.getLocalPlayer());
      setMpConnected(renderClient.connected);
    };

    renderClient.onObjectsChanged = () => {
      const interp = renderClient.getInterpolatedState();
      setRenderObjects(interp.objects);
    };

    renderClient.onGuiChanged = () => {
      setGuiElements([...renderClient.gui]);
    };

    renderClient.onChat = (msg) => {
      setMessages((prev) => [
        ...prev,
        { id: msgCounter.current++, username: msg.playerName, text: msg.text, ts: Date.now() },
      ]);
    };

    renderClient.onScriptLog = (logs) => {
      setScriptLogs((prev) => [...prev, ...logs]);
      setMessages((prev) => [
        ...prev,
        ...logs.map((l) => ({ id: msgCounter.current++, username: "Script", text: l, ts: Date.now() })),
      ]);
    };

    renderClient.onConnected = () => {
      setMpConnected(true);
    };

    renderClient.onDisconnected = () => {
      setMpConnected(false);
    };

    renderClient.onError = (err) => {
      setMpError(err);
    };

    renderClient.onSound = (soundId, options) => {
      // Look up audio object by name in the current render objects
      const objs = renderClient.getInterpolatedState().objects;
      const audioObj = objs.find((o) => o.type === "audio" && o.name === soundId);
      const url = audioObj?.audioUrl;
      if (!url) {
        console.warn(`[Sound] No audio object named "${soundId}" found`);
        return;
      }
      try {
        const audio = new Audio(url);
        audio.volume = Math.max(0, Math.min(1, options?.volume ?? 1));
        audio.loop = options?.loop ?? false;
        audio.play().catch((err) => console.warn("[Sound] Play blocked:", err));
      } catch (err) {
        console.warn("[Sound] Error playing audio:", err);
      }
    };

    renderClient.connect();

    const localScripts = scripts.filter(
      (s) => (s.scriptType === "client" || s.scriptType === "ClientScript") && s.enabled !== false
    );
    const runner = new ClientScriptRunner(renderClient);
    if (localScripts.length > 0) {
      runner.runScripts(localScripts);
    }
    clientRunnerRef.current = runner;

    return () => {
      runner.destroy();
      clientRunnerRef.current = null;
      renderClient.disconnect();
    };
  }, [renderClient, scripts]);

  // Game loop - send inputs and update state
  useEffect(() => {
    let raf = 0;
    let lastTime = performance.now();

    const loop = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Send inputs to server (including camera world-space state)
      renderClient.updateInput(
        inputRef.current.moveX,
        inputRef.current.moveZ,
        inputRef.current.jump,
        cameraYawRef.current,
        false,
        cameraStateRef.current.pos,
        cameraStateRef.current.forward,
      );
      inputRef.current.jump = false; // Reset jump after sending

      // Update interpolated state for rendering
      const interp = renderClient.getInterpolatedState();
      setRenderObjects(interp.objects);
      setRenderPlayers(interp.players);
      setLocalPlayer(renderClient.getLocalPlayer());
      setTick((t) => (t + 1) % 1000000);

      // Merge server GUI and client-side GUI
      const serverGui = renderClient.gui;
      const clientGui = clientRunnerRef.current ? Array.from(clientRunnerRef.current.clientGuiElements.values()) : [];
      const allGui = [...serverGui, ...clientGui];
      
      // Classify GUI as screen-space or world-space based on parent hierarchy
      // Build a map of all objects by ID
      const objectsById = new Map<string, RenderObject>();
      interp.objects.forEach(obj => objectsById.set(obj.id, obj));
      
      // Helper function to recursively find the first non-GUI ancestor
      const findNonGuiAncestor = (objId: string | undefined): RenderObject | null => {
        if (!objId) return null;
        const obj = objectsById.get(objId);
        if (!obj) return null;
        if (!obj.type?.startsWith('gui')) return obj;
        // Recursively check parent
        return findNonGuiAncestor(obj.parentId);
      };
      
      // Separate screen-space GUI (no 3D ancestor) from world-space GUI (has 3D ancestor)
      const screenSpaceGui: RenderGuiElement[] = [];
      const worldSpaceGui: RenderGuiElement[] = [];
      
      allGui.forEach(gui => {
        const nonGuiAncestor = findNonGuiAncestor(gui.parentId);
        if (!nonGuiAncestor) {
          // No 3D ancestor found, so this is screen-space
          screenSpaceGui.push(gui);
        } else {
          // Has a 3D ancestor, so this is world-space
          worldSpaceGui.push(gui);
        }
      });
      
      setGuiElements(screenSpaceGui);
      setWorldSpaceGui(worldSpaceGui);

      // Pick up debug draws, particle events, and interaction prompt from server
      if (renderClient.debugDraws.length > 0) {
        setDebugDraws([...renderClient.debugDraws]);
      }
      if (renderClient.particleEvents.length > 0) {
        setParticleEvents(prev => [...prev, ...renderClient.particleEvents]);
        renderClient.particleEvents = [];
      }
      // FPS counter
      const fpsd = fpsRef.current;
      fpsd.frames++;
      const elapsed = (now - fpsd.lastTime) / 1000;
      if (elapsed >= 0.5) {
        setFps(Math.round(fpsd.frames / elapsed));
        fpsd.frames = 0;
        fpsd.lastTime = now;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [renderClient]);

  // Keyboard input
  useEffect(() => {
    const computeMove = () => {
      const k = keysRef.current;
      const x = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
      const z = (k["s"] || k["arrowdown"] ? 1 : 0) - (k["w"] || k["arrowup"] ? 1 : 0);
      inputRef.current.moveX = x;
      inputRef.current.moveZ = z;
    };

    const onDown = (e: KeyboardEvent) => {
      if (chatOpen && e.target instanceof HTMLInputElement) return;

      const key = e.key.toLowerCase();
      const wasDown = keysRef.current[key];
      keysRef.current[key] = true;

      if (e.code === "Space") {
        if (!wasDown) {
          inputRef.current.jump = true;
        }
        e.preventDefault();
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault();
      }
      if (e.key === "Escape") {
        setMenuOpen((v) => !v);
        setSettingsOpen(false);
      }
      if (e.key === "/" && !chatOpen) {
        setChatOpen(true);
        e.preventDefault();
      }
      if (e.key === "Tab") {
        setShowLeaderboard((v) => !v);
        e.preventDefault();
      }
      // Forward key press to server for Rebur.Input.on("press") (deduplicated)
      if (!wasDown) {
        renderClient.sendKeyDown(key);
      }
      computeMove();
    };

    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current[key] = false;
      // Forward key release to server for Rebur.Input.on("release")
      renderClient.sendKeyUp(key);
      computeMove();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [chatOpen]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus chat input when opened
  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [chatOpen]);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    // Show locally immediately
    setMessages((prev) => [
      ...prev,
      { id: msgCounter.current++, username, text, ts: Date.now() },
    ]);
    // Broadcast to all other players via WebSocket
    renderClient.sendChat(text);
    setChatInput("");
  }, [chatInput, username, renderClient]);

  const handleLeave = () => onExit(scriptLogs.slice());
  const handleResetAvatar = () => {
    // TODO: Implement server-side respawn
    setMenuOpen(false);
  };
  const handleResume = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
  };

  const handleGuiClick = useCallback((elementId: string) => {
    renderClient.clickGuiElement(elementId);
  }, [renderClient]);

  // Use local player or create default for rendering
  const player = localPlayer ?? {
    id: "",
    name: username,
    position: { x: 0, y: 5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    animation: "idle",
    health: 100,
    maxHealth: 100,
    colors: { shirt: avatarCfg.shirtColor, skin: avatarCfg.skinColor, pants: avatarCfg.pantsColor },
    motors: {},
  };

  const totalPlayers = 1 + renderPlayers.length;

  // Filter objects for rendering (Workspace and Lighting only)
  const renderableObjects = useMemo(() => {
    // Use server state if available, otherwise fall back to initial objects
    if (renderObjects.length > 0) {
      return renderObjects.filter((o) => o.visible !== false);
    }
    return objects
      .filter((o) => {
        const c = o.container ?? "Workspace";
        return c === "Workspace" || c === "Lighting";
      })
      .map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        primitiveType: o.primitiveType,
        position: { x: o.positionX ?? 0, y: o.positionY ?? 0, z: o.positionZ ?? 0 },
        rotation: { x: o.rotationX ?? 0, y: o.rotationY ?? 0, z: o.rotationZ ?? 0 },
        scale: { x: o.scaleX ?? 1, y: o.scaleY ?? 1, z: o.scaleZ ?? 1 },
        color: o.color ?? "#888888",
        visible: true,
        transparency: (o.properties as any)?.transparency ?? 0,
        modelUrl: (o.properties as any)?.fileUrl,
      })) as RenderObject[];
  }, [objects, renderObjects]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a]" data-testid="play-mode-root">
      {/* ── Already-in-game / connection error overlay ── */}
      {mpError && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-4">
            <div className="text-red-400 font-semibold text-lg text-center">{mpError.message}</div>
            <button
              className="mt-2 w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors"
              onClick={handleLeave}
            >
              Leave Game
            </button>
          </div>
        </div>
      )}
      {/* 3D or SVG canvas */}
      {webglAvailable ? (
        <PlayCanvasErrorBoundary
          fallback={
            <SVGScene objects={objects.filter(o => (o.container ?? "Workspace") === "Workspace" || o.container === "Lighting")} runtime={null} cameraPosition={[0, 4, 8]} />
          }
        >
          <Canvas
            camera={{ position: [0, 4, 8], fov: 60 }}
            gl={{
              powerPreference: "low-power",
              antialias: false,
              failIfMajorPerformanceCaveat: false,
            }}
            onCreated={({ gl }) => {
              gl.shadowMap.enabled = false;
              const canvas = gl.domElement;
              let lostTimer: ReturnType<typeof setTimeout> | null = null;
              canvas.addEventListener("webglcontextlost", (e) => {
                e.preventDefault();
                console.warn("[rebur] WebGL context lost — attempting restore");
                // Give the browser 3 seconds to restore; if it doesn't, switch to SVG
                lostTimer = setTimeout(() => {
                  console.warn("[rebur] Context not restored after 3s — switching to SVG fallback");
                  setWebglContextLost(true);
                }, 3000);
              });
              canvas.addEventListener("webglcontextrestored", () => {
                if (lostTimer) { clearTimeout(lostTimer); lostTimer = null; }
                console.log("[rebur] WebGL context restored");
                setWebglContextLost(false);
              });
            }}
          >
            <color attach="background" args={["#0a0a0a"]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 14, 6]} intensity={0.8} />
            <Grid
              args={[40, 40]}
              position={[0, 0, 0]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#262626"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#404040"
              fadeDistance={30}
            />
            {renderableObjects.map((o) => (
              <Primitive key={o.id} obj={o} />
            ))}
            <Avatar player={player} isLocal={true} />
            {renderPlayers.map((rp) => (
              <Avatar key={rp.id} player={rp} isLocal={false} />
            ))}
            <ChaseCameraRig
              player={player}
              shiftLock={shiftLock}
              serverCamera={renderClient.camera}
              onCameraYawChange={(yaw) => { cameraYawRef.current = yaw; }}
              onCameraStateChange={(pos, fwd) => {
                cameraStateRef.current = { pos, forward: fwd };
              }}
            />
            <ParticleEmitterLayer renderableObjects={renderableObjects} />
            <DebugDrawLayer draws={debugDraws} />
            <ParticleLayer events={particleEvents} onDone={() => setParticleEvents([])} />
            {worldSpaceGui.map((gui) => {
              const parent = renderableObjects.find(o => o.id === gui.parentId);
              if (!parent) return null;
              const width = gui.width ?? 1;
              const height = gui.height ?? 1;
              return (
                <group key={gui.id} position={[parent.position.x, parent.position.y, parent.position.z]} rotation={[parent.rotation.x, parent.rotation.y, parent.rotation.z]}>
                  <mesh position={[0, 0, 0.5]} scale={[width, height, 1]}>
                    <planeGeometry args={[1, 1]} />
                    <meshStandardMaterial color={gui.backgroundColor ?? "#3b82f6"} transparent opacity={gui.opacity ?? 0.8} />
                  </mesh>
                </group>
              );
            })}
          </Canvas>
        </PlayCanvasErrorBoundary>
      ) : (
        <>
          <SVGScene objects={objects.filter(o => (o.container ?? "Workspace") === "Workspace" || o.container === "Lighting")} runtime={null} cameraPosition={[0, 4, 8]} />
          <div className="absolute top-12 left-3 px-2 py-1 rounded-md bg-black/60 text-white/80 text-[10px] uppercase tracking-wide pointer-events-none z-10">
            SVG fallback (no WebGL)
          </div>
        </>
      )}

      {/* ── TOP BAR (Roblox-style: menu+chat left, leaderboard right) ── */}
      <div className="absolute top-2 left-2 right-2 z-50 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => { setMenuOpen((v) => !v); setSettingsOpen(false); }}
            className="flex items-center gap-2 px-3 h-9 rounded-md bg-black/85 backdrop-blur border border-white/20 text-white text-sm font-semibold hover:bg-white hover:text-black transition-colors select-none"
            title="Menu (Esc)"
          >
            <div className="flex flex-col gap-[3px] w-4">
              <span className="block w-full h-[2px] bg-current rounded" />
              <span className="block w-full h-[2px] bg-current rounded" />
              <span className="block w-full h-[2px] bg-current rounded" />
            </div>
            <span className="hidden sm:inline">{username}</span>
          </button>

          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md backdrop-blur border text-sm transition-colors ${
              chatOpen
                ? "bg-white text-black border-white"
                : "bg-black/85 border-white/20 text-white hover:bg-white hover:text-black"
            }`}
            title="Chat (/)"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Chat</span>
          </button>
        </div>

        <div className="pointer-events-auto">
          <button
            onClick={() => setShowLeaderboard((v) => !v)}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md backdrop-blur border text-sm transition-colors ${
              showLeaderboard
                ? "bg-white text-black border-white"
                : "bg-black/85 border-white/20 text-white hover:bg-white hover:text-black"
            }`}
            title="Leaderboard (Tab)"
          >
            <Users className="w-4 h-4" />
            <span className="text-xs tabular-nums">{totalPlayers}</span>
          </button>
        </div>
      </div>


      {/* ── MENU DROPDOWN ── */}
      {menuOpen && (
        <div className="absolute top-12 left-2 z-50 w-64 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-neutral-900/95 backdrop-blur">
          <div className="px-4 py-3 border-b border-white/10 bg-neutral-800/70">
            <p className="text-white font-semibold text-sm">{username}</p>
            <p className="text-white/50 text-xs">
              {mpConnected ? `Online · ${totalPlayers} player${totalPlayers !== 1 ? "s" : ""}` : "Playing"}
            </p>
          </div>

          <div className="p-2 flex flex-col gap-1">
            <button
              onClick={handleResume}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <Play className="w-4 h-4 text-neutral-100" />
              Resume
            </button>

            <button
              onClick={handleResetAvatar}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <RotateCcw className="w-4 h-4 text-neutral-200" />
              Reset Character
            </button>

            <button
              onClick={() => { setSettingsOpen((v) => !v); }}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <Settings className="w-4 h-4 text-neutral-100" />
              Settings
              <span className="ml-auto text-white/30 text-xs">{settingsOpen ? "▴" : "▾"}</span>
            </button>

            {settingsOpen && (
              <div className="mx-1 mb-1 rounded-lg bg-black/30 border border-white/5 p-3 flex flex-col gap-3">

                {/* Shift Lock */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-white/80 text-xs">Shift Lock</span>
                  </div>
                  <button
                    onClick={() => setShiftLock((v) => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${shiftLock ? "bg-white" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${shiftLock ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {/* Show FPS */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-white/80 text-xs">Show FPS</span>
                  </div>
                  <button
                    onClick={() => setShowFps((v) => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${showFps ? "bg-white" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showFps ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {/* Show Stats */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-white/80 text-xs">Show Stats</span>
                  </div>
                  <button
                    onClick={() => setShowStats((v) => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${showStats ? "bg-white" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showStats ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {/* Leaderboard */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-white/80 text-xs">Leaderboard</span>
                  </div>
                  <button
                    onClick={() => setShowLeaderboard((v) => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${showLeaderboard ? "bg-white" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showLeaderboard ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
            )}

            <div className="h-px bg-white/10 my-1" />

            <button
              onClick={() => setShowConsole((v) => !v)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <Terminal className="w-4 h-4 text-neutral-300" />
              {showConsole ? "Hide Console" : "Show Console"}
            </button>

            <button
              onClick={handleLeave}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm text-left"
            >
              <LogOut className="w-4 h-4" />
              Leave
            </button>
          </div>
        </div>
      )}



      {/* ── TOP-RIGHT INDICATORS ── */}
      <div className="absolute top-12 right-2 z-40 flex flex-col items-end gap-2">
        {showFps && (
          <div className="px-2 py-1 rounded-md bg-black/70 backdrop-blur border border-white/10 text-neutral-100 font-mono text-xs tabular-nums">
            {fps} FPS
          </div>
        )}
        {player.health < player.maxHealth && (
          <div
            className="flex items-center gap-2 px-2 py-1 rounded-md bg-black/55 backdrop-blur"
            data-testid="hud-health"
          >
            <Heart className="w-3.5 h-3.5 text-red-400" />
            <div className="w-32 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-red-500 transition-[width] duration-150"
                style={{ width: `${Math.max(0, (player.health / player.maxHealth) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-white/80 tabular-nums">
              {Math.round(player.health)}/{player.maxHealth}
            </span>
          </div>
        )}
      </div>

      {/* ── STATS OVERLAY ── */}
      {showStats && (
        <div className="absolute top-14 left-2 z-40 px-3 py-2 rounded-lg bg-black/70 backdrop-blur border border-white/10 font-mono text-xs text-white/80 space-y-0.5 pointer-events-none">
          <div className="text-white/40 uppercase tracking-wide text-[10px] mb-1">Stats</div>
          <div>HP: <span className="text-neutral-100">{Math.round(player.health)}/{player.maxHealth}</span></div>
          <div>X: <span className="text-neutral-200">{player.position.x.toFixed(2)}</span></div>
          <div>Y: <span className="text-neutral-200">{player.position.y.toFixed(2)}</span></div>
          <div>Z: <span className="text-neutral-200">{player.position.z.toFixed(2)}</span></div>
          <div>Speed: <span className="text-neutral-300">{Math.hypot(player.velocity.x, player.velocity.z).toFixed(2)}</span></div>
          <div>Ground: <span className={player.onGround ? "text-neutral-100" : "text-red-400"}>{player.onGround ? "yes" : "no"}</span></div>
        </div>
      )}

      {/* ── LEADERBOARD (right side) — anchored just below the top bar ── */}
      {showLeaderboard && (
        <div className="absolute right-2 z-50 w-56" style={{ top: "48px" }}>
          <div className="rounded-xl overflow-hidden border border-white/10 bg-neutral-900/95 backdrop-blur shadow-2xl">
            <div className="px-3 py-2 border-b border-white/10 bg-neutral-800/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-neutral-200" />
                <span className="text-white/80 text-xs font-semibold uppercase tracking-wide">Players</span>
              </div>
              <span className="text-white/40 text-xs">{totalPlayers}</span>
            </div>
            <div className="p-1.5 space-y-0.5 max-h-60 overflow-y-auto">
              {/* Local player — always at top */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/10 border border-white/15">
                <div className="w-[22px] h-[22px] rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: avatarCfg.shirtColor }}>
                  {username.charAt(0).toUpperCase()}
                </div>
                <span className="text-white text-xs font-semibold flex-1 truncate">{username}</span>
                <span className="text-white/40 text-[10px] tabular-nums">{Math.round(player.health)}</span>
                <Heart className="w-2.5 h-2.5 text-red-400 shrink-0" />
              </div>
              {/* Remote players */}
              {renderPlayers.map((rp) => (
                <div key={rp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5">
                  <div className="w-[22px] h-[22px] rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: rp.colors?.shirt ?? "#3b82f6" }}>
                    {rp.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white/80 text-xs flex-1 truncate">{rp.name}</span>
                </div>
              ))}
              {/* Offline placeholder when no remote players */}
              {renderPlayers.length === 0 && (
                <div className="px-2 py-2 text-center text-white/25 text-[10px]">
                  {mpConnected ? "Only you here" : "Connecting..."}
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-white/30 text-center">
              Tab to hide / to chat
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT PANEL (anchored right under the Chat button) ── */}
      {chatOpen && (
        <div className="absolute top-12 left-2 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl overflow-hidden border border-white/15 bg-black/90 backdrop-blur-xl shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
            <span className="text-white text-xs font-semibold uppercase tracking-wider">Chat</span>
            <button onClick={() => setChatOpen(false)} className="text-white/50 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ScrollArea className="h-48">
            <div className="p-2 flex flex-col gap-1">
              {messages.map((m) => (
                <div key={m.id} className="text-xs leading-snug">
                  {m.username === "System" ? (
                    <span className="text-white/40 italic">{m.text}</span>
                  ) : (
                    <>
                      <span className="font-semibold text-white">{m.username}:&nbsp;</span>
                      <span className="text-white/85">{m.text}</span>
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <div className="flex items-center gap-1.5 px-2 py-2 border-t border-white/10 bg-white/5">
            <input
              ref={chatInputRef}
              className="flex-1 bg-black/60 border border-white/15 rounded-md px-2 py-1 text-white text-xs placeholder-white/30 outline-none focus:border-white"
              placeholder="Say something..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { sendChat(); }
                if (e.key === "Escape") { setChatOpen(false); }
                e.stopPropagation();
              }}
            />
            <button
              onClick={sendChat}
              className="p-1.5 rounded-md bg-white text-black hover:bg-white/80 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── SCRIPT-DRIVEN GUI ── */}
      <GuiOverlay gui={guiElements} onGuiClick={handleGuiClick} />

      {/* ── MOBILE CONTROLS ── */}
      {isMobile && (
        <>
          <VirtualJoystick
            side="left"
            onChange={(x, y) => {
              inputRef.current.moveX = x;
              inputRef.current.moveZ = y;
            }}
          />
          <button
            onPointerDown={() => { inputRef.current.jump = true; }}
            className="absolute bottom-12 right-12 w-16 h-16 rounded-full bg-primary/80 text-primary-foreground text-sm font-bold border border-primary-border z-20 active:scale-95"
            data-testid="button-jump"
          >
            JUMP
          </button>
        </>
      )}

      {/* ── DESKTOP HINT ── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-black/40 backdrop-blur text-white/50 text-xs z-10 pointer-events-none hidden md:block">
        WASD to jump Tab to see players / to chat Esc for menu
      </div>

      {/* ── CONSOLE PANEL ── */}
      {showConsole && (
        <div className="absolute bottom-0 left-0 right-0 h-52 bg-[#0a0a0a]/95 backdrop-blur border-t border-white/10 z-30 flex flex-col">
          <div className="flex items-center justify-between px-3 h-7 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-neutral-300" />
              <span className="text-xs text-white/70 uppercase tracking-wide">Output ({scriptLogs.length})</span>
            </div>
            <button onClick={() => setShowConsole(false)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ScrollArea className="flex-1 p-2">
            {scriptLogs.length === 0 ? (
              <div className="text-xs text-white/30 italic px-1">No output yet. Use log() in scripts.</div>
            ) : (
              <div className="font-mono text-xs space-y-0.5">
                {scriptLogs.map((line, i) => {
                  const isError = /\[.*\] .*error|Error:/i.test(line);
                  const isWarning = /warn|warning/i.test(line);
                  return (
                    <div
                      key={i}
                      className={isError ? "text-red-400" : isWarning ? "text-neutral-100" : "text-green-300"}
                      data-testid={`console-line-${i}`}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
