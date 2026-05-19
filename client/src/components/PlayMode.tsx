import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Terminal, Heart, Settings, MessageSquare, Send, RotateCcw, LogOut, Gauge, Lock, Play } from "lucide-react";
import { GameRuntime } from "@/lib/runtime";
import type { GameObject, Script } from "@shared/schema";
import SVGScene from "@/components/SVGScene";
import { isWebGLAvailable } from "@/lib/webgl";
import PlayCanvasErrorBoundary from "@/components/play/PlayCanvasErrorBoundary";
import GuiOverlay from "@/components/play/GuiOverlay";
import VirtualJoystick from "@/components/play/VirtualJoystick";
import Primitive from "@/components/play/Primitive";
import Avatar from "@/components/play/Avatar";
import ChaseCameraRig from "@/components/play/ChaseCameraRig";

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
  onExit,
}: {
  objects: GameObject[];
  scripts: Script[];
  username: string;
  onExit: (logs: string[]) => void;
}) {
  const runtime = useMemo(
    () => new GameRuntime(objects, scripts, username, "#3b82f6"),
    []
  );

  const renderableObjects = useMemo(
    () => objects.filter((o) => {
      const c = o.container ?? "Workspace";
      return c === "Workspace" || c === "Lighting";
    }),
    [objects]
  );

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
  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, username: "System", text: `${username} joined the game`, ts: Date.now() },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const msgCounter = useRef(1);

  // Expose shiftLock to runtime input
  useEffect(() => {
    (runtime.input as any).shiftLock = shiftLock;
  }, [shiftLock, runtime]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: msgCounter.current++, username, text, ts: Date.now() },
    ]);
    setChatInput("");
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus chat input when opened
  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [chatOpen]);

  // Keyboard input
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      // Don't capture keys when chat is open
      if (chatOpen && e.target instanceof HTMLInputElement) return;

      runtime.input.keys[e.key.toLowerCase()] = true;
      if (e.code === "Space") {
        runtime.input.jump = true;
        e.preventDefault();
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
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
      computeMove();
    };
    const onUp = (e: KeyboardEvent) => {
      runtime.input.keys[e.key.toLowerCase()] = false;
      computeMove();
    };
    const computeMove = () => {
      const k = runtime.input.keys;
      const x = (k["d"] || k["arrowright"] ? 1 : 0) - (k["a"] || k["arrowleft"] ? 1 : 0);
      const z = (k["s"] || k["arrowdown"] ? 1 : 0) - (k["w"] || k["arrowup"] ? 1 : 0);
      runtime.input.moveX = x;
      runtime.input.moveZ = z;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [runtime, chatOpen]);

  // Game loop
  useEffect(() => {
    runtime.start();
    let raf = 0;
    let last = performance.now();
    const tickFn = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      runtime.step(dt);
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

      raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => {
      cancelAnimationFrame(raf);
      runtime.stop();
    };
  }, [runtime]);

  const handleLeave = () => onExit(runtime.logs.slice());
  const handleResetAvatar = () => {
    runtime.player.respawn();
    setMenuOpen(false);
  };
  const handleResume = () => {
    setMenuOpen(false);
    setSettingsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0e1116]" data-testid="play-mode-root">
      {/* 3D or SVG canvas */}
      {webglAvailable ? (
        <PlayCanvasErrorBoundary
          fallback={
            <SVGScene objects={renderableObjects} runtime={runtime} cameraPosition={[0, 4, 8]} />
          }
        >
          <Canvas
            shadows
            camera={{ position: [0, 4, 8], fov: 60 }}
            onPointerMissed={() => runtime.emitClick(null)}
          >
            <color attach="background" args={["#1a1d24"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 14, 6]} intensity={0.9} castShadow shadow-mapSize={[2048, 2048]} />
            <hemisphereLight args={["#88aaff", "#332211", 0.4]} />
            <Grid
              args={[80, 80]}
              position={[0, 0.51, 0]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#4a5160"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#6a7384"
              fadeDistance={60}
              infiniteGrid
            />
            {runtime.objectList.map((o) => (
              <Primitive key={o.id} obj={o} runtime={runtime} />
            ))}
            <Avatar player={runtime.player} runtime={runtime} />
            <ChaseCameraRig runtime={runtime} shiftLock={shiftLock} />
          </Canvas>
        </PlayCanvasErrorBoundary>
      ) : (
        <>
          <SVGScene objects={renderableObjects} runtime={runtime} cameraPosition={[0, 4, 8]} />
          <div className="absolute top-12 left-3 px-2 py-1 rounded-md bg-black/60 text-white/80 text-[10px] uppercase tracking-wide pointer-events-none z-10">
            SVG fallback (no WebGL)
          </div>
        </>
      )}

      {/* ── TOP-LEFT HUD BAR ── */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
        {/* Menu button — Roblox style */}
        <button
          onClick={() => { setMenuOpen((v) => !v); setSettingsOpen(false); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur border border-white/10 text-white text-sm font-semibold hover:bg-black/90 transition-colors select-none"
        >
          <div className="flex flex-col gap-[3px] w-4">
            <span className="block w-full h-[2px] bg-white rounded" />
            <span className="block w-full h-[2px] bg-white rounded" />
            <span className="block w-full h-[2px] bg-white rounded" />
          </div>
          <span className="hidden sm:inline">{username}</span>
        </button>

        {/* Chat button */}
        <button
          onClick={() => setChatOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-white/80 text-sm hover:bg-black/80 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">Chat</span>
        </button>
      </div>

      {/* ── MENU DROPDOWN ── */}
      {menuOpen && (
        <div className="absolute top-14 left-3 z-30 w-64 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#1a1d2e]/95 backdrop-blur">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 bg-[#252840]/60">
            <p className="text-white font-semibold text-sm">{username}</p>
            <p className="text-white/50 text-xs">Playing</p>
          </div>

          {/* Menu items */}
          <div className="p-2 flex flex-col gap-1">
            <button
              onClick={handleResume}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <Play className="w-4 h-4 text-green-400" />
              Resume
            </button>

            <button
              onClick={handleResetAvatar}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <RotateCcw className="w-4 h-4 text-blue-400" />
              Reset Avatar
            </button>

            <button
              onClick={() => { setSettingsOpen((v) => !v); }}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <Settings className="w-4 h-4 text-yellow-400" />
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
                    className={`relative w-10 h-5 rounded-full transition-colors ${shiftLock ? "bg-blue-500" : "bg-white/20"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${shiftLock ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {/* FPS Counter */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-white/60" />
                    <span className="text-white/80 text-xs">Show FPS</span>
                  </div>
                  <button
                    onClick={() => setShowFps((v) => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${showFps ? "bg-blue-500" : "bg-white/20"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${showFps ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
            )}

            <div className="h-px bg-white/10 my-1" />

            <button
              onClick={() => setShowConsole((v) => !v)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors text-sm text-left"
            >
              <Terminal className="w-4 h-4 text-purple-400" />
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

      {/* ── FPS COUNTER ── */}
      {showFps && (
        <div className="absolute top-3 right-3 z-20 px-2 py-1 rounded-md bg-black/70 backdrop-blur border border-white/10 text-green-400 font-mono text-xs tabular-nums">
          {fps} FPS
        </div>
      )}

      {/* ── HEALTH BAR ── */}
      {runtime.player.health < runtime.player.maxHealth && (
        <div
          className="absolute top-3 right-3 z-10 pointer-events-none flex items-center gap-2 px-2 py-1 rounded-md bg-black/55 backdrop-blur"
          style={{ right: showFps ? "60px" : "12px" }}
          data-testid="hud-health"
        >
          <Heart className="w-3.5 h-3.5 text-red-400" />
          <div className="w-32 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-red-500 transition-[width] duration-150"
              style={{ width: `${Math.max(0, (runtime.player.health / runtime.player.maxHealth) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-white/80 tabular-nums">
            {Math.round(runtime.player.health)}/{runtime.player.maxHealth}
          </span>
        </div>
      )}

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <div className="absolute bottom-20 left-3 z-20 w-72 rounded-xl overflow-hidden border border-white/10 bg-[#1a1d2e]/90 backdrop-blur shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-white/70 text-xs font-semibold uppercase tracking-wide">Chat</span>
            <button onClick={() => setChatOpen(false)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ScrollArea className="h-40">
            <div className="p-2 flex flex-col gap-1">
              {messages.map((m) => (
                <div key={m.id} className="text-xs leading-snug">
                  <span className={`font-semibold ${m.username === "System" ? "text-yellow-400" : "text-blue-300"}`}>
                    {m.username}:&nbsp;
                  </span>
                  <span className="text-white/80">{m.text}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <div className="flex items-center gap-1.5 px-2 py-2 border-t border-white/10">
            <input
              ref={chatInputRef}
              className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white text-xs placeholder-white/30 outline-none focus:border-blue-500/50"
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
              className="p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Chat messages that auto-disappear (bottom-left ambient) */}
      {!chatOpen && (
        <div className="absolute bottom-20 left-3 z-10 pointer-events-none flex flex-col gap-1">
          {messages.slice(-4).map((m) => (
            <div key={m.id} className="text-xs text-white/70 bg-black/40 backdrop-blur rounded px-2 py-0.5 max-w-[260px] truncate">
              <span className={`font-semibold ${m.username === "System" ? "text-yellow-300" : "text-blue-300"}`}>{m.username}: </span>
              {m.text}
            </div>
          ))}
        </div>
      )}

      {/* ── SCRIPT-DRIVEN GUI ── */}
      <GuiOverlay runtime={runtime} version={runtime.guiVersion} />

      {/* ── MOBILE CONTROLS ── */}
      {isMobile && (
        <>
          <VirtualJoystick
            side="left"
            onChange={(x, y) => {
              runtime.input.moveX = x;
              runtime.input.moveZ = y;
            }}
          />
          <button
            onPointerDown={() => { runtime.input.jump = true; }}
            className="absolute bottom-12 right-12 w-16 h-16 rounded-full bg-primary/80 text-primary-foreground text-sm font-bold border border-primary-border z-20 active:scale-95"
            data-testid="button-jump"
          >
            JUMP
          </button>
        </>
      )}

      {/* ── DESKTOP HINT ── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-black/40 backdrop-blur text-white/50 text-xs z-10 pointer-events-none hidden md:block">
        WASD · Space to jump · / to chat · Esc for menu
      </div>

      {/* ── CONSOLE PANEL ── */}
      {showConsole && (
        <div className="absolute bottom-0 left-0 right-0 h-52 bg-[#0e1116]/95 backdrop-blur border-t border-white/10 z-30 flex flex-col">
          <div className="flex items-center justify-between px-3 h-7 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-purple-400" />
              <span className="text-xs text-white/70 uppercase tracking-wide">Output ({runtime.logs.length})</span>
            </div>
            <button onClick={() => setShowConsole(false)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ScrollArea className="flex-1 p-2">
            {runtime.logs.length === 0 ? (
              <div className="text-xs text-white/30 italic px-1">No output yet. Use log("...") in scripts.</div>
            ) : (
              <div className="font-mono text-xs space-y-0.5">
                {runtime.logs.map((line, i) => {
                  const isError = /\[.*\] .*error|Error:/i.test(line);
                  const isWarning = /warn|warning/i.test(line);
                  return (
                    <div
                      key={i}
                      className={isError ? "text-red-400" : isWarning ? "text-yellow-400" : "text-green-300"}
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
