import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Terminal, Heart } from "lucide-react";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // Only Workspace + Lighting render in the live world; service containers
  // (ReplicatedStorage, ServerScriptService, ...) hold templates and scripts.
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

  // Keyboard input
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      runtime.input.keys[e.key.toLowerCase()] = true;
      if (e.code === "Space") {
        runtime.input.jump = true;
        e.preventDefault();
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
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
  }, [runtime]);

  // Start scripts and run game loop independently of the Canvas — so logic still
  // executes even if WebGL fails. The Canvas just renders the current state.
  useEffect(() => {
    runtime.start();
    let raf = 0;
    let last = performance.now();
    const tickFn = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      runtime.step(dt);
      setTick((t) => (t + 1) % 1000000);
      raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => {
      cancelAnimationFrame(raf);
      runtime.stop();
    };
  }, [runtime]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0e1116]" data-testid="play-mode-root">
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

          {/* Grid overlay - floor comes from Baseplate object which is deletable */}
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
          <ChaseCameraRig runtime={runtime} />
        </Canvas>
        </PlayCanvasErrorBoundary>
      ) : (
        <>
          <SVGScene objects={renderableObjects} runtime={runtime} cameraPosition={[0, 4, 8]} />
          <div className="absolute top-12 left-3 px-2 py-1 rounded-md bg-black/60 text-white/80 text-[10px] uppercase tracking-wide pointer-events-none z-10" data-testid="badge-svg-fallback-play">
            SVG fallback (no WebGL)
          </div>
        </>
      )}

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-10 pointer-events-none">
        <div className="px-3 py-1.5 rounded-md bg-black/50 backdrop-blur text-white text-xs font-medium pointer-events-auto">
          {username} · Playing
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowConsole((v) => !v)}
            data-testid="button-toggle-console"
          >
            <Terminal className="w-4 h-4" />
            <span className="ml-1 hidden sm:inline">Console</span>
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onExit(runtime.logs.slice())} data-testid="button-stop-play">
            <X className="w-4 h-4" />
            <span className="ml-1">Stop</span>
          </Button>
        </div>
      </div>

      {/* Health bar — appears as soon as the player isn't at full health. */}
      {runtime.player.health < runtime.player.maxHealth && (
        <div
          className="absolute top-12 left-3 z-10 pointer-events-none flex items-center gap-2 px-2 py-1 rounded-md bg-black/55 backdrop-blur"
          data-testid="hud-health"
        >
          <Heart className="w-3.5 h-3.5 text-red-400" />
          <div className="w-32 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-red-500 transition-[width] duration-150"
              style={{
                width: `${Math.max(0, (runtime.player.health / runtime.player.maxHealth) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[11px] text-white/80 tabular-nums">
            {Math.round(runtime.player.health)}/{runtime.player.maxHealth}
          </span>
        </div>
      )}

      {/* Script-driven HUD (game.gui.text / game.gui.button) */}
      <GuiOverlay runtime={runtime} version={runtime.guiVersion} />

      {/* Help */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-black/40 backdrop-blur text-white/80 text-xs z-10 pointer-events-none hidden md:block">
        WASD to move · Space to jump · Drag to look
      </div>

      {/* Mobile controls */}
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
            onPointerDown={() => {
              runtime.input.jump = true;
            }}
            className="absolute bottom-12 right-12 w-16 h-16 rounded-full bg-primary/80 text-primary-foreground text-sm font-bold border border-primary-border z-20 active:scale-95"
            data-testid="button-jump"
          >
            JUMP
          </button>
        </>
      )}

      {/* Console */}
      {showConsole && (
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-black/80 backdrop-blur border-t border-white/10 z-30 flex flex-col">
          <div className="flex items-center justify-between px-3 h-7 border-b border-white/10">
            <span className="text-xs text-white/70 uppercase tracking-wide">Console ({runtime.logs.length})</span>
            <button onClick={() => setShowConsole(false)} className="text-white/70 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ScrollArea className="flex-1 p-2">
            {runtime.logs.length === 0 ? (
              <div className="text-xs text-white/40 italic px-1">No log output yet. Use log("...") in your scripts.</div>
            ) : (
              <div className="font-mono text-xs text-green-300 space-y-0.5">
                {runtime.logs.map((line, i) => (
                  <div key={i} data-testid={`console-line-${i}`}>{line}</div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
