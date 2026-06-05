import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X, Terminal, Heart, Settings, MessageSquare, Send,
  RotateCcw, LogOut, Gauge, Lock, Play, Users, BarChart3,
} from "lucide-react";
import { getAvatarConfig } from "@/lib/avatarConfig";
import type { GameObject, Script } from "@shared/schema";
import SVGScene from "@/components/SVGScene";
import { isWebGLAvailable } from "@/lib/webgl";
import PlayCanvasErrorBoundary from "@/components/play/PlayCanvasErrorBoundary";
import GuiOverlay from "@/components/play/GuiOverlay";
import VirtualJoystick from "@/components/play/VirtualJoystick";
import Primitive from "@/components/play/Primitive";
import Avatar from "@/components/play/Avatar";
import ChaseCameraRig from "@/components/play/ChaseCameraRig";
import { RenderClient } from "@/lib/render-client";
import { ClientScriptRunner } from "@/lib/runtime/client-script-runner";
import type { RenderObject, RenderPlayer, RenderGuiElement } from "@shared/render-types";

interface ChatMessage {
  id: number;
  username: string;
  text: string;
  ts: number;
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
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const [showConsole, setShowConsole] = useState(false);
  const [isMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );
  const webglAvailable = useMemo(() => isWebGLAvailable(), []);

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
      (s) => s.scriptType === "LocalScript" && s.container === "StarterPlayer" && s.enabled !== false
    );
    let clientRunner: ClientScriptRunner | null = null;
    if (localScripts.length > 0) {
      clientRunner = new ClientScriptRunner(renderClient);
      clientRunner.runScripts(localScripts);
    }

    return () => {
      clientRunner?.destroy();
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

      // Send inputs to server
      renderClient.updateInput(
        inputRef.current.moveX,
        inputRef.current.moveZ,
        inputRef.current.jump,
        cameraYawRef.current,
        false
      );
      inputRef.current.jump = false; // Reset jump after sending

      // Update interpolated state for rendering
      const interp = renderClient.getInterpolatedState();
      setRenderObjects(interp.objects);
      setRenderPlayers(interp.players);
      setLocalPlayer(renderClient.getLocalPlayer());
      setTick((t) => (t + 1) % 1000000);

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
            shadows
            camera={{ position: [0, 4, 8], fov: 60 }}
          >
            <color attach="background" args={["#0a0a0a"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 14, 6]} intensity={0.9} castShadow shadow-mapSize={[2048, 2048]} />
            <hemisphereLight args={["#e5e5e5", "#262626", 0.4]} />
            <Grid
              args={[80, 80]}
              position={[0, 0, 0]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#262626"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#404040"
              fadeDistance={60}
              infiniteGrid
            />
            {renderableObjects.map((o) => (
              <Primitive key={o.id} obj={o} />
            ))}
            <Suspense fallback={null}>
              <Avatar player={player} isLocal={true} />
              {renderPlayers.map((rp) => (
                <Avatar key={rp.id} player={rp} isLocal={false} />
              ))}
            </Suspense>
            <ChaseCameraRig 
              player={player} 
              shiftLock={shiftLock}
              serverCamera={renderClient.camera}
              onCameraYawChange={(yaw) => { cameraYawRef.current = yaw; }}
            />
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
