import { useState, Suspense, Component, type ReactNode, type DragEvent, useEffect, useMemo, useRef, forwardRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useModelFile } from "@/lib/gltf-loader";
import type { ReburScene } from "@shared/rebur-scene";
import MonacoEditor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Box,
  Circle,
  Cylinder,
  Square,
  Lightbulb,
  ArrowLeft,
  Trash2,
  Play,
  Save,
  Plus,
  Code2,
  MoveIcon,
  RotateCcw,
  Maximize,
  FileCode,
  Layers,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronDown,
  Menu,
  PanelRight,
  Archive,
  Sun,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Sparkles,
  BookOpen,
  Terminal,
  Folder,
  MoreVertical,
  Upload,
  GripVertical,
  Globe,
  Lock,
  Code,
  Users,
  Eye,
  EyeOff,
  Share2,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Game, GameObject, Script, User } from "@shared/schema";
import PlayMode from "@/components/PlayMode";
import RigAnimationEditor from "@/components/RigAnimationEditor";
import CharacterEditor from "@/components/CharacterEditor";
import SVGScene from "@/components/SVGScene";
import { DEFAULT_SCRIPT, SCRIPTING_DOCS } from "@/lib/runtime/docs";
import { isWebGLAvailable } from "@/lib/webgl";
import { configureMonacoForEngine, ENGINE_EDITOR_OPTIONS } from "@/lib/runtime/scripting/monaco-config";

type TransformMode = "translate" | "rotate" | "scale";

const PRIMITIVES = [
  { type: "cube", label: "Cube", icon: Box },
  { type: "sphere", label: "Sphere", icon: Circle },
  { type: "cylinder", label: "Cylinder", icon: Cylinder },
  { type: "plane", label: "Plane", icon: Square },
  { type: "light", label: "Light", icon: Lightbulb },
] as const;

// Engine services. Order here drives the Hierarchy panel order.
//   - Workspace            : live, rendered 3D world
//   - Lighting             : lights and atmosphere
//   - Players              : player avatars + per-player non-physical data
//   - ServerScriptService  : server-authoritative scripts (Script type)
//   - StarterPlayer        : per-player scripts/objects copied to each client (LocalScript)
//   - ReplicatedStorage    : shared templates + ModuleScripts (visible to all — NOT safe for secrets)
//   - ServerStorage        : server-only templates/data (never replicated to clients)
// `defaultScriptType` is what gets created when the user clicks "+ script" on
// the container header.
const CONTAINERS = [
  { name: "Workspace",           displayName: "Workspace",           icon: Box,      hint: "3D objects in the live world",                         defaultScriptType: "Script" },
  { name: "Lighting",            displayName: "Lighting",            icon: Sun,      hint: "Lights and lighting helpers",                          defaultScriptType: "Script" },
  { name: "Character",           displayName: "Character",           icon: Users,    hint: "Avatar rig — body parts, joints, attachments",         defaultScriptType: "LocalScript" },
  { name: "Players",             displayName: "Players",             icon: Users,    hint: "Player avatars + per-player data",                     defaultScriptType: "LocalScript" },
  { name: "ServerScriptService", displayName: "ServerScriptService", icon: FileCode, hint: "Server-authoritative scripts (Script)",                defaultScriptType: "Script" },
  { name: "StarterPlayer",       displayName: "StarterPlayer",       icon: FileCode, hint: "Scripts copied to each player (LocalScript)",          defaultScriptType: "LocalScript" },
  { name: "ReplicatedStorage",   displayName: "ReplicatedStorage",   icon: Archive,  hint: "Shared templates — visible to all, not for secrets",   defaultScriptType: "ModuleScript" },
  { name: "ServerStorage",       displayName: "ServerStorage",       icon: Archive,  hint: "Server-only storage — never replicated to clients",    defaultScriptType: "Script" },
];

// All snippets use the Rebur.* single-global API.
// Scripts run top-to-bottom once on Play; register events for everything else.
const SCRIPT_SNIPPETS: { label: string; code: string }[] = [
  {
    label: "On key press",
    code: `Rebur.Input.on("press", (player, key) => {\n  if (key === "e") log(player.username, "pressed E");\n});\n`,
  },
  {
    label: "On key release",
    code: `Rebur.Input.on("release", (player, key) => {\n  if (key === "e") log(player.username, "released E");\n});\n`,
  },
  {
    label: "Every frame (tick)",
    code: `Rebur.on("tick", (dt) => {\n  const cube = Rebur.Workspace.find("Cube");\n  if (cube) cube.rotation = { x: 0, y: cube.rotation.y + dt, z: 0 };\n});\n`,
  },
  {
    label: "Repeat every N seconds",
    code: `every(2, () => {\n  log("ticks every 2 seconds");\n});\n`,
  },
  {
    label: "After N seconds (delayed)",
    code: `after(3, () => {\n  log("fires once, 3 seconds in");\n});\n`,
  },
  {
    label: "Async sequence (await wait)",
    code: `log("intro");\nawait wait(2);\nlog("main");\nawait wait(2);\nlog("done");\n`,
  },
  {
    label: "On entity touched",
    code: `const cube = Rebur.Workspace.find("Cube");\nif (cube) {\n  cube.on("touched", (other) => {\n    log("touched by", other.isPlayer ? other.username : other.name);\n  });\n  cube.on("untouched", (other) => log("no longer touching", other.name));\n}\n`,
  },
  {
    label: "On entity clicked",
    code: `const cube = Rebur.Workspace.find("Cube");\nif (cube) {\n  cube.on("clicked", (player) => {\n    log(player.username, "clicked the cube");\n    cube.color = "#ff4444";\n  });\n}\n`,
  },
  {
    label: "On any 3D click (mouse)",
    code: `Rebur.Input.on("mouseClick", (player, entity) => {\n  if (entity) log(player.username, "clicked", entity.name);\n  else log(player.username, "clicked the sky");\n});\n`,
  },
  {
    label: "Global lifecycle events",
    code: `Rebur.on("playerJoined", (p) => log(p.username, "joined"));\nRebur.on("playerLeft", (p) => log(p.username, "left"));\nRebur.on("playerDied", (p) => log(p.username, "died"));\nRebur.on("playerRespawned", (p) => log(p.username, "respawned"));\nRebur.on("entityAdded", (e) => log("added", e.name));\nRebur.on("entityRemoved", (e) => log("removed", e.name));\n`,
  },
  {
    label: "Cross-container interaction (explicit)",
    code: `// Explicit cross-container — no hidden coupling\nconst coin = Rebur.Workspace.find("Coin");\nif (coin) {\n  coin.on("touched", (other) => {\n    if (!other.isPlayer) return;\n    const player = Rebur.Players.get(other.id);\n    if (player) {\n      player.inventory.add("Coin", { count: 1 });\n      coin.visible = false;\n      after(3, () => { coin.visible = true; });\n    }\n  });\n}\n`,
  },
  {
    label: "Create an entity",
    code: `const enemy = Rebur.Workspace.create({\n  name: "Goblin",\n  primitiveType: "sphere",\n  position: { x: 5, y: 1, z: 0 },\n  color: "#ff4444",\n});\nenemy.body.anchored = false;\nenemy.body.mass = 2;\n`,
  },
  {
    label: "Force-based launch (impulse)",
    code: `const ball = Rebur.Workspace.find("Ball");\nif (ball) {\n  ball.body.anchored = false;\n  ball.body.mass = 3;\n  ball.body.restitution = 0.5;\n  ball.body.applyImpulse({ x: 0, y: 15, z: -20 });\n}\n`,
  },
  {
    label: "Physics cannonball (spawned)",
    code: `every(3, () => {\n  const ball = Rebur.Workspace.create({\n    name: "Ball_" + Date.now(),\n    primitiveType: "sphere",\n    position: { x: 0, y: 5, z: 10 },\n    color: "#222222",\n    scale: { x: 0.5, y: 0.5, z: 0.5 },\n  });\n  ball.body.anchored = false;\n  ball.body.mass = 5;\n  ball.body.applyImpulse({ x: 0, y: 8, z: -25 });\n  after(5, () => { ball.destroy(); });\n});\n`,
  },
  {
    label: "Global state (multiplayer-ready)",
    code: `Rebur.State.set("phase", "Lobby");\nRebur.State.on("phase", (next) => log("phase →", next));\n\nRebur.Input.on("press", (player, key) => {\n  if (key === "p") Rebur.State.set("phase", "Playing");\n});\n`,
  },
  {
    label: "Super-jump for 5 seconds",
    code: `Rebur.Input.on("press", (player, key) => {\n  if (key !== "j") return;\n  const players = Rebur.Players.all();\n  for (const p of players) {\n    p.jumpPower = 30;\n    after(5, () => { p.jumpPower = 8; });\n  }\n});\n`,
  },
  {
    label: "Lava damage on touch",
    code: `const lava = Rebur.Workspace.find("Lava");\nif (lava) {\n  lava.on("touched", (other) => {\n    if (other.isPlayer) {\n      other.takeDamage(25);\n      log(other.username, "hit lava! HP:", other.health);\n    }\n  });\n}\n`,
  },
  {
    label: "GUI: text + button",
    code: `Rebur.Gui.text("title", "Hello!", { anchor: "tc", y: 16, size: 22 });\nRebur.Gui.button("respawn", "Respawn", { anchor: "br", x: 24, y: 24 }, () => {\n  for (const p of Rebur.Players.all()) p.respawn();\n});\n`,
  },
  {
    label: "Score counter",
    code: `Rebur.State.set("score", 0);\nRebur.Gui.text("score", "Score: 0", { anchor: "tl", x: 20, y: 20, size: 20 });\n\nRebur.State.on("score", (val) => {\n  Rebur.Gui.text("score", "Score: " + val, { anchor: "tl", x: 20, y: 20, size: 20 });\n});\n`,
  },
  {
    label: "Health bar HUD",
    code: `Rebur.Gui.bar("hp", 100, 100, {\n  anchor: "bl", x: 20, y: 20,\n  width: 200, height: 16,\n  color: "#22c55e", bg: "#374151",\n});\n\nRebur.on("playerJoined", (player) => {\n  player.on("changed", (prop, val) => {\n    if (prop === "health") Rebur.Gui.bar("hp", val, player.maxHealth);\n  });\n});\n`,
  },
  {
    label: "Inventory: pickup on touch",
    code: `const coin = Rebur.Workspace.find("Coin");\nif (coin) {\n  coin.body.isTrigger = true;\n  coin.on("touched", (other) => {\n    if (!other.isPlayer) return;\n    const player = Rebur.Players.get(other.id);\n    if (player) {\n      player.inventory.add("Coin", { count: 1 });\n      coin.visible = false;\n      after(3, () => { coin.visible = true; });\n    }\n  });\n}\n`,
  },
  {
    label: "Hold item in hand",
    code: `const tool = Rebur.Workspace.create({\n  name: "Tool",\n  primitiveType: "cube",\n  scale: { x: 0.25, y: 0.25, z: 1.1 },\n  color: "#cbd5e1",\n});\n\nRebur.on("playerJoined", (player) => {\n  player.motors.attach("rightHand", tool, { x: 0, y: 0.05, z: 0.25 });\n});\n\nRebur.Input.on("press", (player, key) => {\n  if (key !== "f") return;\n  const held = player.motors.detach("rightHand");\n  if (held) player.motors.attach("leftHand", held, { x: 0, y: 0.05, z: 0.25 });\n});\n`,
  },
  {
    label: "Tween: move entity",
    code: `const door = Rebur.Workspace.find("Door");\nif (door) {\n  Rebur.Input.on("press", (player, key) => {\n    if (key === "e") {\n      Rebur.Tween(door.position, { y: 5 }, 1, "easeOutQuad", () => {\n        log("Door opened!");\n      });\n    }\n  });\n}\n`,
  },
  {
    label: "Raycast forward",
    code: `Rebur.on("tick", () => {\n  for (const p of Rebur.Players.all()) {\n    const origin = { x: p.position.x, y: p.position.y + 1.5, z: p.position.z };\n    const hit = raycast(origin, { x: 0, y: 0, z: -1 }, 25);\n    if (hit) log("Ray hit", hit.entity.name, "at", hit.distance.toFixed(1));\n  }\n});\n`,
  },
];

/**
 * Build an edge-wireframe overlay from a cloned scene.
 * Returns a THREE.Group of LineSegments, one per Mesh in the source scene.
 * This gives a wireframe that matches the actual polygon topology of the model
 * rather than a generic bounding-box rectangle.
 */
function buildEdgeWireframe(scene: THREE.Group, color = '#a855f7'): THREE.Group {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false });
  const group = new THREE.Group();
  scene.traverse((child: any) => {
    if (!child.isMesh) return;
    try {
      const edges = new THREE.EdgesGeometry(child.geometry, 20); // 20° threshold removes interior creases
      const lines = new THREE.LineSegments(edges, mat);
      // Copy world transform relative to scene root
      child.updateWorldMatrix(true, false);
      scene.updateWorldMatrix(true, false);
      const rel = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(child.matrixWorld);
      lines.applyMatrix4(rel);
      group.add(lines);
    } catch {
      // skip degenerate geometry
    }
  });
  return group;
}

/**
 * GltfLoader — editor viewport component for GLB/GLTF models.
 *
 * Uses the shared useGLTFModel hook (imperative GLTFLoader + local DRACO decoder)
 * instead of drei's useGLTF/Suspense pattern, giving us full error control and
 * DRACO support without an external CDN.
 *
 * While loading: shows a gray wireframe placeholder.
 * On error: shows a red wireframe placeholder.
 * On success: renders the normalised model with a transparent hit-mesh for clicking,
 * an edge-only wireframe overlay when selected (matching actual model topology),
 * and plays any embedded GLTF animation clips via AnimationMixer.
 */
const GltfLoader = forwardRef<THREE.Object3D, {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  selected: boolean;
  onClick: () => void;
  /** Called once when the model is parsed — provides the full extracted Rebur Scene. */
  onSceneExtracted?: (rs: ReburScene) => void;
}>(function GltfLoader({ url, position, rotation, scale, selected, onClick, onSceneExtracted }, ref) {
  const { scene, animations, loading, error, reburScene } = useModelFile(url);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clonedRef = useRef<THREE.Group | null>(null);

  const { cloned, edgeOverlay, hitSize, hitCenter } = useMemo(() => {
    if (!scene) return { cloned: null, edgeOverlay: null, hitSize: [1,1,1] as [number,number,number], hitCenter: [0,0,0] as [number,number,number] };

    const c = scene.clone(true);
    c.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map((m: THREE.Material) => m.clone())
          : child.material.clone();
      }
    });

    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const ns = 1 / maxDim;
    c.scale.setScalar(ns);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    c.position.set(-centre.x * ns, -centre.y * ns, -centre.z * ns);

    const normBox = new THREE.Box3().setFromObject(c);
    const normSize = new THREE.Vector3();
    const normCenter = new THREE.Vector3();
    normBox.getSize(normSize);
    normBox.getCenter(normCenter);

    // Build edge wireframe from actual mesh topology
    const eo = buildEdgeWireframe(c, '#a855f7');
    eo.renderOrder = 1;

    return {
      cloned: c,
      edgeOverlay: eo,
      hitSize: [normSize.x * 1.08, normSize.y * 1.08, normSize.z * 1.08] as [number, number, number],
      hitCenter: [normCenter.x, normCenter.y, normCenter.z] as [number, number, number],
    };
  }, [scene]);

  // Report extracted Rebur Scene to parent once it's available
  useEffect(() => {
    if (reburScene) onSceneExtracted?.(reburScene);
  }, [reburScene, onSceneExtracted]);

  // Set up AnimationMixer and auto-play the first clip
  useEffect(() => {
    if (!cloned || !animations?.length) return;
    const mixer = new THREE.AnimationMixer(cloned);
    mixerRef.current = mixer;
    clonedRef.current = cloned;
    // Auto-play first clip as a preview loop
    const action = mixer.clipAction(animations[0]);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [cloned, animations]);

  // Step the mixer each frame
  useFrame((_state, delta) => {
    mixerRef.current?.update(delta);
  });

  if (loading) {
    return (
      <mesh ref={ref as any} position={position} rotation={rotation} scale={scale} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#888888" wireframe />
      </mesh>
    );
  }

  if (error || !cloned) {
    return (
      <mesh ref={ref as any} position={position} rotation={rotation} scale={scale} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#666666" wireframe />
        {selected && (
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
            <lineBasicMaterial color="#a855f7" transparent opacity={0.9} depthTest={false} />
          </lineSegments>
        )}
      </mesh>
    );
  }

  return (
    <group ref={ref as any} position={position} rotation={rotation} scale={scale}>
      {/* Invisible hit-mesh — reliable click target regardless of model shape */}
      <mesh position={hitCenter} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={hitSize} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={cloned} />
      {selected && edgeOverlay && <primitive object={edgeOverlay} />}
    </group>
  );
});

class ViewportErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("[Viewport]", error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/** Edge wireframe that matches the actual geometry topology of a primitive. */
function PrimitiveWireframe({ primitiveType }: { primitiveType?: string | null }) {
  const edgesGeo = useMemo(() => {
    let base: THREE.BufferGeometry;
    switch (primitiveType) {
      case "sphere":   base = new THREE.SphereGeometry(0.5, 16, 16); break;
      case "cylinder": base = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 4); break;
      case "plane":    base = new THREE.PlaneGeometry(1, 1, 4, 4); break;
      default:         base = new THREE.BoxGeometry(1, 1, 1);
    }
    const eg = new THREE.EdgesGeometry(base, 15);
    base.dispose();
    return eg;
  }, [primitiveType]);

  return (
    <lineSegments geometry={edgesGeo}>
      <lineBasicMaterial color="#a855f7" transparent opacity={0.9} depthTest={false} />
    </lineSegments>
  );
}

interface PrimitiveMeshProps {
  obj: GameObject;
  selected: boolean;
  onClick: () => void;
  onSceneExtracted?: (objectId: string, rs: ReburScene) => void;
}

const PrimitiveMesh = forwardRef<THREE.Object3D, PrimitiveMeshProps>(function PrimitiveMesh(
  { obj, selected, onClick, onSceneExtracted },
  ref,
) {
  const position: [number, number, number] = [obj.positionX ?? 0, obj.positionY ?? 0, obj.positionZ ?? 0];
  const rotation: [number, number, number] = [obj.rotationX ?? 0, obj.rotationY ?? 0, obj.rotationZ ?? 0];
  const scale: [number, number, number] = [obj.scaleX ?? 1, obj.scaleY ?? 1, obj.scaleZ ?? 1];
  const color = obj.color ?? "#888888";
  const props = (obj.properties ?? {}) as Record<string, any>;
  const transparency = Math.max(0, Math.min(1, Number(props.transparency ?? 0)));
  const opacity = 1 - transparency;
  const isTransparent = transparency > 0;

  if (obj.type === "folder") return null;
  if (obj.type === "audio") {
    // Speaker icon in viewport so audio objects can be selected and positioned
    const isSelected = selected;
    return (
      <group ref={ref as any} position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <mesh>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial color={isSelected ? "#a855f7" : "#22d3ee"} wireframe={!isSelected} />
        </mesh>
        <mesh position={[0, 0.26, 0]}>
          <coneGeometry args={[0.12, 0.22, 8]} />
          <meshBasicMaterial color={isSelected ? "#a855f7" : "#22d3ee"} />
        </mesh>
        {isSelected && (
          <mesh>
            <sphereGeometry args={[0.26, 12, 12]} />
            <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.35} />
          </mesh>
        )}
      </group>
    );
  }

  if (obj.type === "model") {
    const modelProps = (obj.properties ?? {}) as Record<string, any>;
    const modelUrl = modelProps.fileUrl as string | undefined;
    if (!modelUrl) {
      return (
        <mesh ref={ref as any} position={position} scale={scale} onClick={(e) => { e.stopPropagation(); onClick(); }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={selected ? "#a855f7" : "#666666"} wireframe={!selected} />
        </mesh>
      );
    }
    return (
      <GltfLoader
        ref={ref}
        url={modelUrl}
        position={position}
        rotation={rotation}
        scale={scale}
        selected={selected}
        onClick={onClick}
        onSceneExtracted={(rs) => onSceneExtracted?.(obj.id, rs)}
      />
    );
  }

  if (obj.type === "light") {
    return (
      <group ref={ref as any} position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <pointLight color={color} intensity={1.2} distance={20} />
        <mesh>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshBasicMaterial color={color} wireframe={!selected} />
        </mesh>
        {selected && (
          <mesh>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  let geometry: JSX.Element;
  switch (obj.primitiveType) {
    case "sphere":   geometry = <sphereGeometry args={[0.5, 32, 32]} />; break;
    case "cylinder": geometry = <cylinderGeometry args={[0.5, 0.5, 1, 32]} />; break;
    case "plane":    geometry = <planeGeometry args={[1, 1]} />; break;
    case "cube":
    default:         geometry = <boxGeometry args={[1, 1, 1]} />;
  }

  return (
    <mesh
      ref={ref as any}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      castShadow
      receiveShadow
      visible={opacity > 0.01}
    >
      {geometry}
      <meshStandardMaterial color={color} transparent={isTransparent} opacity={opacity} />
      {selected && <PrimitiveWireframe primitiveType={obj.primitiveType} />}
    </mesh>
  );
});

export default function EditorPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId!;
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [activeTab, setActiveTab] = useState<"scene" | "script" | "animate" | "character">("scene");
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState<string>("");
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [editorLogs, setEditorLogs] = useState<string[]>([]);
  const [dragItem, setDragItem] = useState<{ kind: "object" | "script"; id: string } | null>(null);
  const webglAvailable = useMemo(() => isWebGLAvailable(), []);
  const selectedMeshRef = useRef<THREE.Object3D | null>(null);
  const transformUpdateTimeout = useRef<number | null>(null);
  const pendingTransform = useRef<Partial<GameObject> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishDest, setPublishDest] = useState<"platform" | "embed" | "both">("platform");
  const [publishAudience, setPublishAudience] = useState<"everyone" | "friends" | "private">("everyone");
  const [publishDesc, setPublishDesc] = useState("");
  /** Named meshes discovered inside a loaded GLTF, keyed by object id. */
  const [reburScenes, setReburScenes] = useState<Record<string, ReburScene>>({});
  /** Which virtual mesh part is highlighted: "objectId:meshName" */
  const [selectedPartKey, setSelectedPartKey] = useState<string | null>(null);
  /** Model objects whose GLTF parts are expanded in the hierarchy. */
  const [expandedModelIds, setExpandedModelIds] = useState<Set<string>>(new Set());

  const { data: game } = useQuery<Game>({ queryKey: ["/api/games", gameId] });
  const { data: objects = [] } = useQuery<GameObject[]>({ queryKey: ["/api/games", gameId, "objects"] });
  const { data: scripts = [] } = useQuery<Script[]>({ queryKey: ["/api/games", gameId, "scripts"] });

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const selectedScript = scripts.find((s) => s.id === selectedScriptId) ?? null;

  const selectedObjectIsTransformable = selected &&
    (selected.container === "Workspace" || selected.container === "Lighting");

  const flushPendingTransform = () => {
    if (!selected || !pendingTransform.current) return;
    const updates = pendingTransform.current;
    pendingTransform.current = null;
    if (transformUpdateTimeout.current !== null) {
      window.clearTimeout(transformUpdateTimeout.current);
      transformUpdateTimeout.current = null;
    }
    updateObjectMutation.mutate({ id: selected.id, updates });
  };

  const scheduleTransformUpdate = (updates: Partial<GameObject>) => {
    pendingTransform.current = { ...pendingTransform.current, ...updates };
    if (transformUpdateTimeout.current !== null) return;
    transformUpdateTimeout.current = window.setTimeout(() => {
      flushPendingTransform();
    }, 120);
  };

  const handleTransformUpdate = () => {
    if (!selected || !selectedMeshRef.current) return;
    const mesh = selectedMeshRef.current;
    scheduleTransformUpdate({
      positionX: mesh.position.x,
      positionY: mesh.position.y,
      positionZ: mesh.position.z,
      rotationX: mesh.rotation.x,
      rotationY: mesh.rotation.y,
      rotationZ: mesh.rotation.z,
      scaleX: mesh.scale.x,
      scaleY: mesh.scale.y,
      scaleZ: mesh.scale.z,
    });
  };

  const handlePlayExit = (logs: string[]) => {
    setPlaying(false);
    setEditorLogs(logs);
    setConsoleOpen(true);
  };

  // Keep draft in sync when switching scripts
  useEffect(() => {
    if (selectedScript) setScriptDraft(selectedScript.code);
  }, [selectedScript?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (transformUpdateTimeout.current !== null) {
        window.clearTimeout(transformUpdateTimeout.current);
      }
    };
  }, []);

  /**
   * Auto-save the script draft on a short debounce so users never lose work and
   * Play Mode always sees their latest code.
   */
  useEffect(() => {
    if (!selectedScript) return;
    if (scriptDraft === selectedScript.code) return;
    const t = setTimeout(() => {
      apiRequest("PATCH", `/api/scripts/${selectedScript.id}`, { code: scriptDraft })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "scripts"] }))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [scriptDraft, selectedScript?.id, selectedScript?.code, gameId]);

  const createObjectMutation = useMutation({
    mutationFn: async (data: Partial<GameObject>) => {
      return await apiRequest("POST", `/api/games/${gameId}/objects`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "objects"] });
      toast({ title: "Object added" });
    },
  });

  const updateObjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<GameObject> }) => {
      return await apiRequest("PATCH", `/api/objects/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "objects"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update object",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteObjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/objects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "objects"] });
      setSelectedId(null);
      toast({ title: "Object deleted" });
    },
  });

  const createScriptMutation = useMutation({
    mutationFn: async (data: Partial<Script>) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/scripts`, data);
      return await res.json();
    },
    onSuccess: (created: Script) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "scripts"] });
      if (created?.id) {
        setSelectedScriptId(created.id);
        setScriptDraft(created.code);
      }
      toast({ title: "Script created" });
    },
  });

  const updateScriptMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Script> }) => {
      return await apiRequest("PATCH", `/api/scripts/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "scripts"] });
      toast({ title: "Saved" });
    },
  });

  const deleteScriptMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/scripts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "scripts"] });
      setSelectedScriptId(null);
    },
  });

  const handleAddPrimitive = (primitiveType: string) => {
    const isLight = primitiveType === "light";
    const baseName = primitiveType.charAt(0).toUpperCase() + primitiveType.slice(1);
    const count = objects.filter((o) =>
      isLight ? o.type === "light" : o.primitiveType === primitiveType
    ).length;
    createObjectMutation.mutate({
      name: `${baseName}${count > 0 ? count + 1 : ""}`,
      type: isLight ? "light" : "primitive",
      primitiveType: isLight ? null : primitiveType,
      container: isLight ? "Lighting" : "Workspace",
      positionX: 0,
      positionY: isLight ? 3 : 0.5,
      positionZ: 0,
      color: isLight ? "#ffffaa" : "#a3a3a3",
    });
  };

  /** Handle importing 3D model files (.glb, .gltf) */
  const handleImport3DModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validExtensions = ['.glb', '.gltf', '.fbx'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(ext)) {
      toast({
        title: "Invalid file type",
        description: "Please select a .glb, .gltf, or .fbx file",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    toast({ title: "Uploading model...", description: "Please wait" });

    let fileUrl: string | undefined;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      formData.append("type", "model");
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) {
        const asset = await res.json();
        fileUrl = asset.fileUrl as string;
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Upload failed",
          description: err.message ?? `Server returned ${res.status}`,
          variant: "destructive",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    } catch (err: any) {
      toast({
        title: "Upload error",
        description: err?.message ?? "Network error",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    // Create a new model object in the workspace
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const count = objects.filter((o) => o.type === "model").length;
    createObjectMutation.mutate({
      name: `${baseName}${count > 0 ? count + 1 : ""}`,
      type: "model",
      primitiveType: null,
      container: "Workspace",
      positionX: 0,
      positionY: 2,
      positionZ: 0,
      scaleX: 4,
      scaleY: 4,
      scaleZ: 4,
      color: "#ffffff",
      properties: { 
        fileUrl,
        modelFile: file.name,
        anchored: true,
        canCollide: true,
      },
    } as Partial<GameObject>);
    
    toast({
      title: "Model imported",
      description: `${file.name} added to Scene`,
    });
    
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Handle importing audio files (.mp3, .wav, .ogg, .m4a, .aac) */
  const handleImportAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExts.includes(ext)) {
      toast({ title: "Invalid file type", description: "Please select an audio file (.mp3, .wav, .ogg, .m4a)", variant: "destructive" });
      if (audioInputRef.current) audioInputRef.current.value = "";
      return;
    }
    toast({ title: "Uploading audio...", description: "Please wait" });
    let fileUrl: string | undefined;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      formData.append("type", "audio");
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/assets/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) {
        const asset = await res.json();
        fileUrl = asset.fileUrl as string;
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Upload failed", description: err.message ?? `Server returned ${res.status}`, variant: "destructive" });
        if (audioInputRef.current) audioInputRef.current.value = "";
        return;
      }
    } catch (err: any) {
      toast({ title: "Upload error", description: err?.message ?? "Network error", variant: "destructive" });
      if (audioInputRef.current) audioInputRef.current.value = "";
      return;
    }
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const count = objects.filter((o) => o.type === "audio").length;
    createObjectMutation.mutate({
      name: `${baseName}${count > 0 ? count + 1 : ""}`,
      type: "audio",
      primitiveType: null,
      container: "Workspace",
      positionX: 0,
      positionY: 1,
      positionZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
      color: "#22d3ee",
      properties: { fileUrl, audioFile: file.name, volume: 1, loop: false },
    } as Partial<GameObject>);
    toast({ title: "Audio imported", description: `${file.name} added to Scene` });
    if (audioInputRef.current) audioInputRef.current.value = "";
  };

  /** Objects that should appear in the 3D viewport — only Workspace + Lighting. */
  const renderableObjects = useMemo(
    () => objects.filter((o) => {
      const c = o.container ?? "Workspace";
      return c === "Workspace" || c === "Scene" || c === "Lighting";
    }),
    [objects]
  );

  /** Objects grouped by container, in CONTAINERS order. */
  const objectsByContainer = useMemo(() => {
    const groups: Record<string, GameObject[]> = {};
    for (const c of CONTAINERS) groups[c.name] = [];
    for (const o of objects) {
      if (o.parentId) continue;
      const c = o.container ?? "Workspace";
      if (!groups[c]) groups[c] = [];
      groups[c].push(o);
    }
    return groups;
  }, [objects]);

  const objectsByParent = useMemo(() => {
    const groups: Record<string, GameObject[]> = {};
    for (const o of objects) {
      if (!o.parentId) continue;
      if (!groups[o.parentId]) groups[o.parentId] = [];
      groups[o.parentId].push(o);
    }
    return groups;
  }, [objects]);

  /** Scripts parented directly to a service container (no `objectId`). */
  const scriptsByContainer = useMemo(() => {
    const groups: Record<string, Script[]> = {};
    for (const c of CONTAINERS) groups[c.name] = [];
    for (const s of scripts) {
      if (s.objectId) continue;
      const c = s.container ?? "ServerScriptService";
      if (!groups[c]) groups[c] = [];
      groups[c].push(s);
    }
    return groups;
  }, [scripts]);

  /** Scripts attached to a specific GameObject — nested under it in the tree. */
  const scriptsByObject = useMemo(() => {
    const groups: Record<string, Script[]> = {};
    for (const s of scripts) {
      if (!s.objectId) continue;
      if (!groups[s.objectId]) groups[s.objectId] = [];
      groups[s.objectId].push(s);
    }
    return groups;
  }, [scripts]);


  /** Open a script in the editor tab. */
  const openScript = (s: Script) => {
    setSelectedScriptId(s.id);
    setScriptDraft(s.code);
    setActiveTab("script");
    setHierarchyOpen(false);
  };

  /** Create a new script — either attached to a service container, or parented
   *  to a specific GameObject/group. Only the first script gets a helpful comment. */
  const addScriptTo = (containerName: string, objectId?: string) => {
    const containerCfg = CONTAINERS.find((c) => c.name === containerName);
    const scriptType = containerCfg?.defaultScriptType ?? "Script";
    const isFirstScript = scripts.length === 0;
    createScriptMutation.mutate({
      gameId,
      name: `Script${scripts.length + 1}.js`,
      code: isFirstScript ? DEFAULT_SCRIPT : "",
      enabled: true,
      container: containerName,
      scriptType,
      objectId: objectId ?? null,
    } as Partial<Script>);
  };

  const [collapsedContainers, setCollapsedContainers] = useState<Record<string, boolean>>({});
  const toggleContainer = (name: string) =>
    setCollapsedContainers((prev) => ({ ...prev, [name]: !prev[name] }));

  const handleObjectFieldChange = (field: keyof GameObject, value: any) => {
    if (!selected) return;
    updateObjectMutation.mutate({ id: selected.id, updates: { [field]: value } });
  };

  /** Patch one or more keys inside the object's `properties` JSON column. */
  const handlePropertyChange = (patch: Record<string, any>) => {
    if (!selected) return;
    const current = (selected.properties ?? {}) as Record<string, any>;
    updateObjectMutation.mutate({
      id: selected.id,
      updates: { properties: { ...current, ...patch } },
    });
  };
  const getProp = <T,>(key: string, fallback: T): T => {
    const p = (selected?.properties ?? {}) as Record<string, any>;
    return (p[key] ?? fallback) as T;
  };

  const handleScriptFieldChange = (field: keyof Script, value: any) => {
    if (!selectedScript) return;
    updateScriptMutation.mutate({ id: selectedScript.id, updates: { [field]: value } });
  };

  const createGroupObject = (containerName: string, type: "folder" | "model", parentId?: string | null) => {
    const count = objects.filter((o) => o.type === type).length + 1;
    createObjectMutation.mutate({
      gameId,
      name: `${type === "folder" ? "Folder" : "Model"}${count}`,
      type,
      primitiveType: null,
      container: containerName,
      parentId: parentId ?? null,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      color: type === "folder" ? "#64748b" : "#38bdf8",
      properties: { anchored: true, canCollide: false, transparency: 1 },
    } as Partial<GameObject>);
  };

  const handleNewScript = () => {
    const isFirstScript = scripts.length === 0;
    createScriptMutation.mutate({
      gameId,
      name: `Script${scripts.length + 1}.js`,
      code: isFirstScript ? DEFAULT_SCRIPT : "",
      enabled: true,
    });
  };

  /** Add a primitive/light into a specific container, optionally parented to a group. */
  const addPrimitiveTo = (
    containerName: string,
    primitiveType: "cube" | "sphere" | "cylinder" | "plane" | "light",
    parentId?: string | null,
  ) => {
    const isLight = primitiveType === "light";
    const baseName = primitiveType.charAt(0).toUpperCase() + primitiveType.slice(1);
    const count = objects.filter((o) =>
      isLight ? o.type === "light" : o.primitiveType === primitiveType,
    ).length;
    createObjectMutation.mutate({
      name: `${baseName}${count > 0 ? count + 1 : ""}`,
      type: isLight ? "light" : "primitive",
      primitiveType: isLight ? null : primitiveType,
      container: containerName,
      parentId: parentId ?? null,
      positionX: 0,
      positionY: isLight ? 3 : 0.5,
      positionZ: 0,
      color: isLight ? "#ffffaa" : "#a3a3a3",
    } as Partial<GameObject>);
  };

  const moveHierarchyItem = (target: { container: string; parentId?: string | null }) => {
    if (!dragItem) return;
    if (dragItem.kind === "object") {
      if (dragItem.id === target.parentId) return;
      const descendantIds = new Set<string>();
      const collect = (id: string) => {
        for (const child of objects.filter((o) => o.parentId === id)) {
          descendantIds.add(child.id);
          collect(child.id);
        }
      };
      collect(dragItem.id);
      if (target.parentId && descendantIds.has(target.parentId)) return;
      updateObjectMutation.mutate({ id: dragItem.id, updates: { container: target.container, parentId: target.parentId ?? null } });
      descendantIds.forEach((id) => updateObjectMutation.mutate({ id, updates: { container: target.container } }));
    } else {
      updateScriptMutation.mutate({
        id: dragItem.id,
        updates: { container: target.container, objectId: target.parentId ?? null } as Partial<Script>,
      });
    }
    setDragItem(null);
  };

  const dropTargetProps = (target: { container: string; parentId?: string | null }) => ({
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      moveHierarchyItem(target);
    },
  });

  const handleSaveScript = () => {
    if (!selectedScript) return;
    updateScriptMutation.mutate({ id: selectedScript.id, updates: { code: scriptDraft } });
  };

  const monacoRef = useRef<any>(null);
  const [editorFontSize, setEditorFontSize] = useState(14);

  const focusEditor = () => monacoRef.current?.focus();
  const triggerEditor = (action: string) => {
    const ed = monacoRef.current;
    if (!ed) return;
    ed.trigger("toolbar", action, null);
    focusEditor();
  };

  const handleCopyEditor = async () => {
    const ed = monacoRef.current;
    if (!ed) return;
    const sel = ed.getSelection();
    const model = ed.getModel();
    const text =
      sel && !sel.isEmpty()
        ? model?.getValueInRange(sel) ?? ""
        : model?.getValue() ?? "";
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: sel && !sel.isEmpty() ? "Selection copied" : "All code copied" });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available", variant: "destructive" });
    }
    focusEditor();
  };

  const handlePasteEditor = async () => {
    const ed = monacoRef.current;
    if (!ed) return;
    try {
      const text = await navigator.clipboard.readText();
      const sel = ed.getSelection();
      ed.executeEdits("paste", [{ range: sel, text, forceMoveMarkers: true }]);
    } catch {
      toast({ title: "Paste failed", description: "Allow clipboard access in your browser", variant: "destructive" });
    }
    focusEditor();
  };

  const handleInsertSnippet = (code: string) => {
    const ed = monacoRef.current;
    if (!ed) return;
    const sel = ed.getSelection();
    ed.executeEdits("snippet", [{ range: sel, text: code, forceMoveMarkers: true }]);
    focusEditor();
  };

  const username = (() => {
    const u = user as User | undefined;
    return u?.firstName ?? u?.email ?? "Player";
  })();

  // Tiny icon for a GameObject row, picked from its primitive type.
  const ObjectIcon = ({ o }: { o: GameObject }) => {
    const Icon =
      o.type === "light" ? Lightbulb
      : o.primitiveType === "sphere" ? Circle
      : o.primitiveType === "cylinder" ? Cylinder
      : o.primitiveType === "plane" ? Square
      : Box;
    return <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  };

  // A single script row in the hierarchy. Clicking it selects the script AND
  // jumps to the Scripts tab — the Scripts tab no longer has its own list.
  const ScriptRow = ({ s, indent }: { s: Script; indent: number }) => {
    const isDragging = draggingId === s.id;
    return (
      <div
        className={`group flex items-center gap-0.5 rounded-md transition-all duration-150 ${
          isDragging ? "opacity-50 scale-[0.98]" : "hover-elevate"
        } ${
          selectedScriptId === s.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
        }`}
        style={{ paddingLeft: indent }}
        draggable
        onDragStart={(e) => {
          setDragItem({ kind: "script", id: s.id });
          setDraggingId(s.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggingId(null)}
      >
        <div className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
        <button
          onClick={() => openScript(s)}
          className="flex-1 min-w-0 text-left px-1 py-1.5 text-sm flex items-center gap-2"
          data-testid={`row-script-${s.id}`}
        >
          <FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{s.name}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteScriptMutation.mutate(s.id); }}
          className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity"
          title="Delete script"
          data-testid={`button-delete-script-row-${s.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  /** Popover menu: lets the user pick what to add (object / light / folder / model / script). */
  const AddItemMenu = ({
    containerName,
    parentId,
    testId,
    title,
  }: { containerName: string; parentId?: string | null; testId: string; title: string }) => {
    const [open, setOpen] = useState(false);
    const close = () => setOpen(false);
    const Item = ({ icon: I, label, onClick, testId: t }: { icon: any; label: string; onClick: () => void; testId: string }) => (
      <button
        onClick={() => { onClick(); close(); }}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover-elevate text-left"
        data-testid={t}
      >
        <I className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{label}</span>
      </button>
    );
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="opacity-60 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/20 hover:text-primary transition-opacity"
            title={title}
            data-testid={testId}
          >
            <Plus className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-52 p-1" onClick={(e) => e.stopPropagation()}>
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Object</div>
          <Item icon={Box}      label="Cube"     onClick={() => addPrimitiveTo(containerName, "cube", parentId)}     testId={`add-cube-${testId}`} />
          <Item icon={Circle}   label="Sphere"   onClick={() => addPrimitiveTo(containerName, "sphere", parentId)}   testId={`add-sphere-${testId}`} />
          <Item icon={Cylinder} label="Cylinder" onClick={() => addPrimitiveTo(containerName, "cylinder", parentId)} testId={`add-cylinder-${testId}`} />
          <Item icon={Square}   label="Plane"    onClick={() => addPrimitiveTo(containerName, "plane", parentId)}    testId={`add-plane-${testId}`} />
          <Item icon={Lightbulb} label="Light"   onClick={() => addPrimitiveTo(containerName, "light", parentId)}    testId={`add-light-${testId}`} />
          <Separator className="my-1" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Group</div>
          <Item icon={Folder} label="Folder" onClick={() => createGroupObject(containerName, "folder", parentId)} testId={`add-folder-${testId}`} />
          <Item icon={Layers} label="Model"  onClick={() => createGroupObject(containerName, "model",  parentId)} testId={`add-model-${testId}`} />
          <Separator className="my-1" />
          <Item icon={FileCode} label="Script" onClick={() => addScriptTo(containerName, parentId ?? undefined)} testId={`add-script-${testId}`} />
        </PopoverContent>
      </Popover>
    );
  };

  const HierarchyContent = (
    <ScrollArea className="flex-1 h-full">
      <div className="p-2 space-y-2">
        {objects.length === 0 && scripts.length === 0 && (
          <div className="text-xs text-muted-foreground px-3 py-4 text-center">
            Empty scene. Add objects from the toolbar, or click "+" on a service to add a script.
          </div>
        )}
        {CONTAINERS.map((c) => {
          const items = objectsByContainer[c.name] ?? [];
          const containerScripts = scriptsByContainer[c.name] ?? [];
          const collapsed = !!collapsedContainers[c.name];
          const Icon = c.icon;
          const totalCount = items.length + containerScripts.length;
          return (
            <div key={c.name} data-testid={`group-container-${c.name}`} {...dropTargetProps({ container: c.name, parentId: null })}>
              <div className="group flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground hover-elevate rounded-md">
                <button
                  onClick={() => toggleContainer(c.name)}
                  className="flex-1 flex items-center gap-1 min-w-0"
                  title={c.hint}
                  data-testid={`button-toggle-container-${c.name}`}
                >
                  {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <Icon className="w-3 h-3" />
                  <span className="font-semibold truncate">{(c as any).displayName ?? c.name}</span>
                  <span className="ml-auto text-[10px] opacity-60">{totalCount}</span>
                </button>
                <AddItemMenu
                  containerName={c.name}
                  parentId={null}
                  testId={`button-add-${c.name}`}
                  title={`Add to ${(c as any).displayName ?? c.name}`}
                />
              </div>
              {!collapsed && (
                <div className="mt-0.5 space-y-0.5 pl-2">
                  {items.length === 0 && containerScripts.length === 0 && (
                    <div className="text-[11px] text-muted-foreground px-3 py-1 italic">
                      empty
                    </div>
                  )}
                  {/* Scripts parented directly to the service. */}
                  {containerScripts.map((s) => (
                    <ScriptRow key={s.id} s={s} indent={12} />
                  ))}
                  {/* Objects, with attached scripts + nested children. */}
                  {items.map((o) => (
                    <ObjectTreeRow key={o.id} o={o} containerName={c.name} indent={12} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );

  function ObjectTreeRow({ o, containerName, indent }: { o: GameObject; containerName: string; indent: number }) {
    const childObjs = objectsByParent[o.id] ?? [];
    const childScripts = scriptsByObject[o.id] ?? [];
    const isGroup = o.type === "folder" || o.type === "model";
    const GroupIcon = o.type === "folder" ? Folder : o.type === "model" ? Layers : null;
    const isDragging = draggingId === o.id;
    const isDropTarget = dragItem && dragItem.id !== o.id && isGroup;
    
    return (
      <div className="space-y-0.5">
        <div
          draggable
          onDragStart={(e) => {
            setDragItem({ kind: "object", id: o.id });
            setDraggingId(o.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggingId(null);
          }}
          onDragOver={(e) => { 
            if (isGroup && dragItem && dragItem.id !== o.id) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDragEnter={(e) => {
            if (isGroup && dragItem && dragItem.id !== o.id) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            if (!isGroup) return;
            e.preventDefault();
            e.stopPropagation();
            moveHierarchyItem({ container: containerName, parentId: o.id });
            setDraggingId(null);
          }}
          className={`group flex items-center gap-0.5 rounded-md transition-all duration-150 ${
            isDragging ? "opacity-50 scale-[0.98]" : ""
          } ${
            isDropTarget ? "ring-2 ring-primary/50 bg-primary/10" : "hover-elevate"
          } ${
            selectedId === o.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
          }`}
          style={{ paddingLeft: indent }}
        >
          <div className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity">
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
          {/* Expand/collapse chevron for model objects that have a Rebur Scene loaded */}
          {o.type === "model" && !!reburScenes[o.id]?.rootNodeIds?.length && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedModelIds(prev => {
                  const next = new Set(prev);
                  next.has(o.id) ? next.delete(o.id) : next.add(o.id);
                  return next;
                });
              }}
              className="p-1 opacity-60 hover:opacity-100 transition-opacity shrink-0"
              title={expandedModelIds.has(o.id) ? "Collapse parts" : "Expand parts"}
            >
              {expandedModelIds.has(o.id)
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
          <button
            onClick={() => { setSelectedId(o.id); setHierarchyOpen(false); }}
            className="flex-1 min-w-0 text-left px-1 py-1.5 text-sm flex items-center gap-2"
            data-testid={`row-object-${o.id}`}
          >
            {GroupIcon ? <GroupIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ObjectIcon o={o} />}
            <span className="truncate">{o.name}</span>
          </button>
          <AddItemMenu
            containerName={containerName}
            parentId={o.id}
            testId={`button-add-on-${o.id}`}
            title={isGroup ? `Add into ${o.name}` : `Attach a script to ${o.name}`}
          />
        </div>
        {childScripts.map((s) => (
          <ScriptRow key={s.id} s={s} indent={indent + 16} />
        ))}
        {childObjs.map((child) => (
          <ObjectTreeRow key={child.id} o={child} containerName={containerName} indent={indent + 12} />
        ))}
        {/* Rebur Scene node tree — collapsible hierarchy from extracted model */}
        {o.type === "model" && reburScenes[o.id] && expandedModelIds.has(o.id) && (() => {
          const rs = reburScenes[o.id];
          return rs.rootNodeIds.map((nodeId) => {
            const node = rs.nodes[nodeId];
            if (!node) return null;
            const partKey = `${o.id}:${nodeId}`;
            const isPartSelected = selectedPartKey === partKey;
            const KindIcon =
              node.kind === "mesh" || node.kind === "skinned-mesh" ? Box
              : node.kind === "light" ? Sun
              : node.kind === "camera" ? Eye
              : Layers;
            const kindLabel =
              node.kind === "skinned-mesh" ? "rigged mesh"
              : node.kind === "mesh" ? `${rs.meshes[node.meshIds[0]]?.vertexCount ?? 0} verts`
              : node.kind === "light" ? "light"
              : node.kind === "camera" ? "camera"
              : `${node.childIds.length} children`;
            return (
              <div
                key={partKey}
                className={`flex items-center gap-1.5 rounded-md cursor-pointer transition-colors ${
                  isPartSelected
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/40 text-muted-foreground hover:text-foreground"
                }`}
                style={{ paddingLeft: indent + 20 }}
                onClick={() => setSelectedPartKey(isPartSelected ? null : partKey)}
              >
                <KindIcon className="w-3 h-3 shrink-0 opacity-60 my-0.5" />
                <span className="text-xs py-1.5 truncate flex-1">{node.name}</span>
                <span className="text-[10px] opacity-40 pr-1 shrink-0">{kindLabel}</span>
              </div>
            );
          });
        })()}
      </div>
    );
  }

  const PropertiesContent = (
    <ScrollArea className="flex-1 h-full">
      {selected ? (
        <div className="p-3 space-y-4">

          {/* ─── Name (always shown) ─── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={selected.name}
              onChange={(e) => handleObjectFieldChange("name", e.target.value)}
              data-testid="input-object-name"
            />
          </div>

          {/* ─── Type badge ─── */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</span>
            <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">
              {selected.type}{selected.primitiveType ? ` / ${selected.primitiveType}` : ""}
            </span>
          </div>

          {/* ─── Container dropdown ─── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Container</Label>
            <Select
              value={selected.container ?? "Workspace"}
              onValueChange={(v) => handleObjectFieldChange("container", v)}
            >
              <SelectTrigger data-testid="select-container">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTAINERS.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ─── Audio-specific properties ─── */}
          {selected.type === "audio" && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Audio</Label>

                {/* File (read-only) */}
                {getProp<string>("audioFile", "") && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">File</Label>
                    <div className="text-xs font-mono text-foreground/70 bg-muted px-2 py-1.5 rounded truncate">
                      {getProp<string>("audioFile", "")}
                    </div>
                  </div>
                )}

                {/* Volume */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Volume</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {getProp<number>("volume", 1).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[getProp<number>("volume", 1)]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={([v]) => handlePropertyChange({ volume: v })}
                    data-testid="slider-volume"
                  />
                </div>

                {/* Loop */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-loop" className="text-xs">Loop</Label>
                  <Switch
                    id="prop-loop"
                    checked={getProp("loop", false)}
                    onCheckedChange={(v) => handlePropertyChange({ loop: v })}
                    data-testid="switch-loop"
                  />
                </div>

                {/* Autoplay */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-autoplay" className="text-xs">Autoplay</Label>
                  <Switch
                    id="prop-autoplay"
                    checked={getProp("autoplay", false)}
                    onCheckedChange={(v) => handlePropertyChange({ autoplay: v })}
                    data-testid="switch-autoplay"
                  />
                </div>

                {/* Spatial (3D positional audio) */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-spatial" className="text-xs">Spatial (3D)</Label>
                  <Switch
                    id="prop-spatial"
                    checked={getProp("spatial", false)}
                    onCheckedChange={(v) => handlePropertyChange({ spatial: v })}
                    data-testid="switch-spatial"
                  />
                </div>

                {getProp<boolean>("spatial", false) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Max Distance</Label>
                      <Input
                        type="number"
                        step={1}
                        min={1}
                        value={getProp<number>("maxDistance", 40)}
                        onChange={(e) => handlePropertyChange({ maxDistance: parseFloat(e.target.value) || 1 })}
                        data-testid="input-max-distance"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Rolloff</Label>
                      <Input
                        type="number"
                        step={0.1}
                        min={0}
                        max={1}
                        value={getProp<number>("rolloff", 1)}
                        onChange={(e) => handlePropertyChange({ rolloff: parseFloat(e.target.value) || 0 })}
                        data-testid="input-rolloff"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Position for spatial audio */}
              <Separator />
              <VectorField
                label="Position"
                testIdPrefix="position"
                values={[selected.positionX ?? 0, selected.positionY ?? 0, selected.positionZ ?? 0]}
                onChange={(i, v) => {
                  const field = (["positionX", "positionY", "positionZ"] as const)[i];
                  handleObjectFieldChange(field, v);
                }}
              />
            </>
          )}

          {/* ─── Light-specific properties ─── */}
          {selected.type === "light" && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Light</Label>

                {/* Light type */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Light Type</Label>
                  <Select
                    value={getProp<string>("lightType", "point")}
                    onValueChange={(v) => handlePropertyChange({ lightType: v })}
                  >
                    <SelectTrigger data-testid="select-light-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="point">Point</SelectItem>
                      <SelectItem value="spot">Spot</SelectItem>
                      <SelectItem value="directional">Directional</SelectItem>
                      <SelectItem value="ambient">Ambient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Color */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selected.color ?? "#ffffff"}
                      onChange={(e) => handleObjectFieldChange("color", e.target.value)}
                      className="w-9 h-9 rounded-md bg-transparent border border-border cursor-pointer"
                      data-testid="input-object-color"
                    />
                    <Input
                      value={selected.color ?? "#ffffff"}
                      onChange={(e) => handleObjectFieldChange("color", e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Intensity */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Intensity</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {getProp<number>("intensity", 1).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[getProp<number>("intensity", 1)]}
                    min={0}
                    max={5}
                    step={0.05}
                    onValueChange={([v]) => handlePropertyChange({ intensity: v })}
                    data-testid="slider-intensity"
                  />
                </div>

                {/* Range */}
                {getProp<string>("lightType", "point") !== "directional" && getProp<string>("lightType", "point") !== "ambient" && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Range</Label>
                    <Input
                      type="number"
                      step={1}
                      min={0}
                      value={getProp<number>("range", 10)}
                      onChange={(e) => handlePropertyChange({ range: parseFloat(e.target.value) || 0 })}
                      data-testid="input-light-range"
                    />
                  </div>
                )}

                {/* Spot angle */}
                {getProp<string>("lightType", "point") === "spot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Cone Angle</Label>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {getProp<number>("spotAngle", 45)}°
                      </span>
                    </div>
                    <Slider
                      value={[getProp<number>("spotAngle", 45)]}
                      min={5}
                      max={170}
                      step={1}
                      onValueChange={([v]) => handlePropertyChange({ spotAngle: v })}
                      data-testid="slider-spot-angle"
                    />
                  </div>
                )}

                {/* Cast shadows */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-shadows" className="text-xs">Cast Shadows</Label>
                  <Switch
                    id="prop-shadows"
                    checked={getProp("castShadows", false)}
                    onCheckedChange={(v) => handlePropertyChange({ castShadows: v })}
                    data-testid="switch-cast-shadows"
                  />
                </div>
              </div>

              <Separator />
              <VectorField
                label="Position"
                testIdPrefix="position"
                values={[selected.positionX ?? 0, selected.positionY ?? 0, selected.positionZ ?? 0]}
                onChange={(i, v) => {
                  const field = (["positionX", "positionY", "positionZ"] as const)[i];
                  handleObjectFieldChange(field, v);
                }}
              />
              <VectorField
                label="Rotation"
                testIdPrefix="rotation"
                values={[selected.rotationX ?? 0, selected.rotationY ?? 0, selected.rotationZ ?? 0]}
                step={0.05}
                onChange={(i, v) => {
                  const field = (["rotationX", "rotationY", "rotationZ"] as const)[i];
                  handleObjectFieldChange(field, v);
                }}
              />
            </>
          )}

          {/* ─── Entity (primitive/model) properties ─── */}
          {selected.type !== "audio" && selected.type !== "light" && selected.type !== "folder" && (
            <>
              {/* Model-specific section */}
              {selected.type === "model" && (() => {
                const fileUrl = getProp<string>("fileUrl", "");
                const fileName = fileUrl ? fileUrl.split("/").pop() ?? fileUrl : null;
                const playingClip = getProp<string>("playingClip", "");
                const animSpeed = getProp<number>("animationSpeed", 1);
                return (
                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">3D Model</Label>
                    {fileName ? (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">File</Label>
                        <div className="text-xs font-mono text-foreground/70 bg-muted px-2 py-1.5 rounded truncate" title={fileUrl}>
                          {fileName}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">No model file — import a .glb via the menu.</p>
                    )}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Playing Clip</Label>
                      <Input
                        value={playingClip}
                        onChange={(e) => handlePropertyChange({ playingClip: e.target.value })}
                        placeholder='e.g. "idle" or "walk"'
                        className="text-xs font-mono"
                        data-testid="input-playing-clip"
                      />
                      <p className="text-[10px] text-muted-foreground">Clip name from the Model Clips tab (Animate panel)</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground">Anim Speed</Label>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{animSpeed.toFixed(2)}×</span>
                      </div>
                      <Slider
                        value={[animSpeed]}
                        min={0}
                        max={4}
                        step={0.05}
                        onValueChange={([v]) => handlePropertyChange({ animationSpeed: v })}
                      />
                    </div>
                  </div>
                );
              })()}

              {selected.type !== "model" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selected.color ?? "#888888"}
                      onChange={(e) => handleObjectFieldChange("color", e.target.value)}
                      className="w-9 h-9 rounded-md bg-transparent border border-border cursor-pointer"
                      data-testid="input-object-color"
                    />
                    <Input
                      value={selected.color ?? "#888888"}
                      onChange={(e) => handleObjectFieldChange("color", e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              )}
              {selected.type === "model" && (
                <p className="text-[10px] text-muted-foreground italic">
                  Colors come from the GLTF materials — edit in Blender/Maya and re-import.
                </p>
              )}
              <Separator />
              <VectorField
                label="Position"
                testIdPrefix="position"
                values={[selected.positionX ?? 0, selected.positionY ?? 0, selected.positionZ ?? 0]}
                onChange={(i, v) => {
                  const field = (["positionX", "positionY", "positionZ"] as const)[i];
                  handleObjectFieldChange(field, v);
                }}
              />
              <VectorField
                label="Rotation"
                testIdPrefix="rotation"
                values={[selected.rotationX ?? 0, selected.rotationY ?? 0, selected.rotationZ ?? 0]}
                step={0.05}
                onChange={(i, v) => {
                  const field = (["rotationX", "rotationY", "rotationZ"] as const)[i];
                  handleObjectFieldChange(field, v);
                }}
              />
              <VectorField
                label="Scale"
                testIdPrefix="scale"
                values={[selected.scaleX ?? 1, selected.scaleY ?? 1, selected.scaleZ ?? 1]}
                step={0.1}
                onChange={(i, v) => {
                  const field = (["scaleX", "scaleY", "scaleZ"] as const)[i];
                  handleObjectFieldChange(field, v);
                }}
              />

              <Separator />

              {/* ─── Physics body ─── */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Physics Body</Label>

                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-anchored" className="text-xs">Anchored</Label>
                  <Switch
                    id="prop-anchored"
                    checked={getProp("anchored", true)}
                    onCheckedChange={(v) => handlePropertyChange({ anchored: v })}
                    data-testid="switch-anchored"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-cancollide" className="text-xs">Can Collide</Label>
                  <Switch
                    id="prop-cancollide"
                    checked={getProp("canCollide", true)}
                    onCheckedChange={(v) => handlePropertyChange({ canCollide: v })}
                    data-testid="switch-cancollide"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="prop-trigger" className="text-xs">Is Trigger</Label>
                  <Switch
                    id="prop-trigger"
                    checked={getProp("isTrigger", false)}
                    onCheckedChange={(v) => handlePropertyChange({ isTrigger: v })}
                    data-testid="switch-trigger"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Transparency</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {getProp<number>("transparency", 0).toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[getProp<number>("transparency", 0)]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={([v]) => handlePropertyChange({ transparency: v })}
                    data-testid="slider-transparency"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Mass</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0.01}
                      value={getProp<number>("mass", 1)}
                      onChange={(e) => handlePropertyChange({ mass: parseFloat(e.target.value) || 0 })}
                      data-testid="input-mass"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Friction</Label>
                    <Input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={getProp<number>("friction", 0.4)}
                      onChange={(e) => handlePropertyChange({ friction: parseFloat(e.target.value) || 0 })}
                      data-testid="input-friction"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Bounce</Label>
                    <Input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={getProp<number>("restitution", 0)}
                      onChange={(e) => handlePropertyChange({ restitution: parseFloat(e.target.value) || 0 })}
                      data-testid="input-restitution"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* ─── Custom Gravity Source ─── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Gravity Source</Label>
                  <Switch
                    checked={getProp("gravityEnabled", false)}
                    onCheckedChange={(v) => handlePropertyChange({ gravityEnabled: v })}
                    data-testid="switch-gravity-enabled"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  When on, this entity pulls players & parts toward its center — like a planet.
                </p>
                {getProp<boolean>("gravityEnabled", false) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Strength</Label>
                      <Input
                        type="number"
                        step={0.5}
                        value={getProp<number>("gravityStrength", 9.81)}
                        onChange={(e) =>
                          handlePropertyChange({ gravityStrength: parseFloat(e.target.value) || 0 })
                        }
                        data-testid="input-gravity-strength"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Radius</Label>
                      <Input
                        type="number"
                        step={1}
                        value={getProp<number>("gravityRadius", 30)}
                        onChange={(e) =>
                          handlePropertyChange({ gravityRadius: parseFloat(e.target.value) || 0 })
                        }
                        data-testid="input-gravity-radius"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => deleteObjectMutation.mutate(selected.id)}
            data-testid="button-delete-object"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="ml-1">Delete Entity</span>
          </Button>
        </div>
      ) : selectedScript ? (
        <div className="p-3 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Script Name</Label>
            <Input
              value={selectedScript.name}
              onChange={(e) => handleScriptFieldChange("name", e.target.value)}
              data-testid="input-script-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={selectedScript.scriptType ?? "Script"}
                onValueChange={(v) => handleScriptFieldChange("scriptType", v)}
              >
                <SelectTrigger data-testid="select-script-type-panel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Script">Script</SelectItem>
                  <SelectItem value="LocalScript">LocalScript</SelectItem>
                  <SelectItem value="ModuleScript">ModuleScript</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Enabled</Label>
              <Switch
                checked={!!selectedScript.enabled}
                onCheckedChange={(v) => handleScriptFieldChange("enabled", v)}
                data-testid="switch-script-enabled"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <div className="text-sm text-muted-foreground">
              {selectedScript.objectId
                ? `Attached to ${objects.find((o) => o.id === selectedScript.objectId)?.name ?? "object"}`
                : selectedScript.container}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedScript.scriptType === "LocalScript" ? "bg-blue-400" : "bg-green-400"}`} />
            <span className="text-[11px] text-muted-foreground">
              {selectedScript.scriptType === "LocalScript"
                ? "Runs client-side in the player's browser"
                : selectedScript.scriptType === "ModuleScript"
                ? "Shared module — required by other scripts"
                : "Runs server-side in the secure sandbox"}
            </span>
          </div>
          <Separator />
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => deleteScriptMutation.mutate(selectedScript.id)}
            data-testid="button-delete-script-panel"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="ml-1">Delete Script</span>
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground px-3 py-6 text-center">
          Select an object or script to inspect it, or click the + icon to create a new script.
        </div>
      )}
    </ScrollArea>
  );

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 h-12 px-2 sm:px-3 border-b border-border bg-card/40 shrink-0">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          {/* Three-dot menu for importing 3D models */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-menu-import">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 p-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">
                Import
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover-elevate text-left"
                data-testid="button-import-3d-model"
              >
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Import 3D Model</span>
              </button>
              <button
                onClick={() => audioInputRef.current?.click()}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover-elevate text-left"
                data-testid="button-import-audio"
              >
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Import Audio</span>
              </button>
              <div className="my-1 border-t border-border" />
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">
                Publish
              </div>
              <button
                onClick={() => setPublishOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover-elevate text-left"
                data-testid="button-publish-game"
              >
                <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Publish Settings…</span>
              </button>
              {game?.isPublished && (
                <button
                  onClick={async () => {
                    if (!game) return;
                    await apiRequest("PATCH", `/api/games/${game.id}`, { isPublished: false });
                    queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
                    toast({ title: "Experience unpublished", description: "Now private" });
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover-elevate text-left text-red-400"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Unpublish</span>
                </button>
              )}
            </PopoverContent>
          </Popover>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.fbx"
            onChange={handleImport3DModel}
            className="hidden"
            data-testid="input-import-model"
          />
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.aac"
            onChange={handleImportAudio}
            className="hidden"
            data-testid="input-import-audio"
          />
          <Link href="/dashboard">
            <Button size="sm" variant="ghost" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
              <span className="ml-1 hidden sm:inline">Dashboard</span>
            </Button>
          </Link>
          {/* Mobile: open hierarchy */}
          <Sheet open={hierarchyOpen} onOpenChange={setHierarchyOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="md:hidden" data-testid="button-open-hierarchy">
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              <SheetHeader className="px-3 py-2 border-b border-border">
                <SheetTitle className="text-sm">Hierarchy</SheetTitle>
                <SheetDescription className="sr-only">Scene object tree</SheetDescription>
              </SheetHeader>
              {HierarchyContent}
            </SheetContent>
          </Sheet>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2 text-sm min-w-0">
            <Code2 className="w-4 h-4 text-primary shrink-0" />
            <span className="font-medium truncate" data-testid="text-game-title">
              {game?.title ?? "Loading..."}
            </span>
          </div>
        </div>

        {/* Center: Add primitives + transform mode */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {PRIMITIVES.map((p) => {
            const Icon = p.icon;
            return (
              <Tooltip key={p.type}>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleAddPrimitive(p.type)}
                    data-testid={`button-add-${p.type}`}
                  >
                    <Icon className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add {p.label}</TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={() => createGroupObject("Workspace", "folder", null)} data-testid="button-add-folder">
                <Folder className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Folder</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={() => createGroupObject("Workspace", "model", null)} data-testid="button-add-model">
                <Layers className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Model</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-6 mx-1 hidden md:block" />
          <Button
            size="sm"
            variant={transformMode === "translate" ? "default" : "ghost"}
            onClick={() => setTransformMode("translate")}
            data-testid="button-mode-translate"
            className="hidden md:inline-flex"
          >
            <MoveIcon className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={transformMode === "rotate" ? "default" : "ghost"}
            onClick={() => setTransformMode("rotate")}
            data-testid="button-mode-rotate"
            className="hidden md:inline-flex"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={transformMode === "scale" ? "default" : "ghost"}
            onClick={() => setTransformMode("scale")}
            data-testid="button-mode-scale"
            className="hidden md:inline-flex"
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Sheet open={propsOpen} onOpenChange={setPropsOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="md:hidden" data-testid="button-open-properties">
                <PanelRight className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 p-0 flex flex-col">
              <SheetHeader className="px-3 py-2 border-b border-border">
                <SheetTitle className="text-sm">Properties</SheetTitle>
                <SheetDescription className="sr-only">Selected object properties</SheetDescription>
              </SheetHeader>
              {PropertiesContent}
            </SheetContent>
          </Sheet>
          <Button size="sm" variant={consoleOpen ? "default" : "ghost"} onClick={() => setConsoleOpen((value) => !value)} data-testid="button-toggle-console">
            <Terminal className="w-4 h-4" />
            <span className="ml-1 hidden sm:inline">Console</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={async () => {
              // Flush any unsaved script edits so Play Mode runs the latest code.
              if (selectedScript && scriptDraft !== selectedScript.code) {
                try {
                  await apiRequest("PATCH", `/api/scripts/${selectedScript.id}`, { code: scriptDraft });
                  await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "scripts"] });
                  await queryClient.refetchQueries({ queryKey: ["/api/games", gameId, "scripts"] });
                } catch {
                  /* fall through and play with whatever the server has */
                }
              }
              setPlaying(true);
            }}
            data-testid="button-play"
          >
            <Play className="w-4 h-4" />
            <span className="ml-1 hidden sm:inline">Play</span>
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Hierarchy (desktop only) */}
        <aside className="w-64 border-r border-border bg-card/30 flex-col shrink-0 hidden md:flex">
          <div className="flex items-center gap-2 h-9 px-3 border-b border-border">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hierarchy</span>
          </div>
          {HierarchyContent}
        </aside>

        {/* Center: Viewport / Script */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-border bg-card/20 px-2">
              <TabsList className="h-9 bg-transparent">
                <TabsTrigger value="scene" data-testid="tab-scene">
                  <Layers className="w-3.5 h-3.5 mr-1.5" />
                  Scene
                </TabsTrigger>
                {/* Script tab only appears when a script is open */}
                {selectedScriptId && (
                  <TabsTrigger value="script" data-testid="tab-script" className="relative pr-6">
                    <FileCode className="w-3.5 h-3.5 mr-1.5" />
                    <span className="truncate max-w-[100px]">
                      {scripts.find(s => s.id === selectedScriptId)?.name ?? "Script"}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedScriptId(null);
                        setActiveTab("scene");
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </TabsTrigger>
                )}
                {/* Animate tab — always visible */}
                <TabsTrigger value="animate" data-testid="tab-animate">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Animate
                </TabsTrigger>
                {/* Character tab — always visible */}
                <TabsTrigger value="character" data-testid="tab-character">
                  <Users className="w-3.5 h-3.5 mr-1.5" />
                  Character
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="scene" className="flex-1 m-0 min-h-0">
              <div className="w-full h-full bg-[#0a0a0a] relative">
                {webglAvailable ? (
                  <ViewportErrorBoundary
                    fallback={
                      <SVGScene
                        objects={renderableObjects}
                        selectedId={selectedId}
                        onSelectObject={setSelectedId}
                      />
                    }
                  >
                    <Canvas
                      shadows
                      camera={{ position: [6, 5, 6], fov: 50 }}
                      onPointerMissed={() => setSelectedId(null)}
                      data-testid="canvas-3d-viewport"
                    >
                      <ambientLight intensity={0.4} />
                      <directionalLight
                        position={[10, 12, 8]}
                        intensity={0.8}
                        castShadow
                        shadow-mapSize={[1024, 1024]}
                      />
                      <Grid
                        args={[40, 40]}
                        cellSize={1}
                        cellThickness={0.5}
                        cellColor="#262626"
                        sectionSize={5}
                        sectionThickness={1}
                        sectionColor="#404040"
                        fadeDistance={40}
                        fadeStrength={1}
                        infiniteGrid
                      />
                      <Suspense fallback={null}>
                        {renderableObjects.map((obj) => {
                          const isSelected = selectedId === obj.id;
                          const mesh = (
                            <PrimitiveMesh
                              key={obj.id}
                              obj={obj}
                              selected={isSelected}
                              onClick={() => setSelectedId(obj.id)}
                              ref={isSelected ? selectedMeshRef : null}
                              onSceneExtracted={(oid, rs) => setReburScenes(prev => ({ ...prev, [oid]: rs }))}
                            />
                          );
                          if (isSelected && selectedObjectIsTransformable) {
                            return (
                              <TransformControls
                                key={obj.id}
                                mode={transformMode}
                                onObjectChange={handleTransformUpdate}
                              >
                                {mesh}
                              </TransformControls>
                            );
                          }
                          return mesh;
                        })}
                      </Suspense>
                      <OrbitControls makeDefault enableDamping />
                      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#a3a3a3"]} labelColor="white" />
                      </GizmoHelper>
                    </Canvas>
                  </ViewportErrorBoundary>
                ) : (
                  <>
                    <SVGScene
                      objects={objects}
                      selectedId={selectedId}
                      onSelectObject={setSelectedId}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 text-white/80 text-[10px] uppercase tracking-wide pointer-events-none" data-testid="badge-svg-fallback">
                      SVG fallback (no WebGL)
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="script" className="flex-1 m-0 min-h-0">
              <div className="h-full flex flex-col">
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                  {selectedScript ? (
                    <>
                      <div className="flex items-center justify-between gap-2 h-9 px-3 border-b border-border bg-card/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-mono truncate" data-testid="text-script-name">
                            {selectedScript.name}
                          </span>
                          {/* Script type — drives where the script will run once
                              multiplayer is wired up. Today every script runs locally,
                              but the value is recorded for future replication. */}
                          <Select
                            value={selectedScript.scriptType ?? "Script"}
                            onValueChange={(v) =>
                              updateScriptMutation.mutate({
                                id: selectedScript.id,
                                updates: { scriptType: v } as Partial<Script>,
                              })
                            }
                          >
                            <SelectTrigger className="h-7 w-32 text-xs" data-testid="select-script-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Script">Script (server)</SelectItem>
                              <SelectItem value="LocalScript">LocalScript (client)</SelectItem>
                              <SelectItem value="ModuleScript">ModuleScript (shared)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="default" onClick={handleSaveScript} data-testid="button-save-script">
                            <Save className="w-3.5 h-3.5" />
                            <span className="ml-1 hidden sm:inline">Save</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteScriptMutation.mutate(selectedScript.id)}
                            data-testid="button-delete-script"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Mobile-friendly script toolbar (visible on every size, especially helpful on touch) */}
                      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-card/30 overflow-x-auto">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => triggerEditor("undo")} data-testid="button-editor-undo">
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Undo</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={() => triggerEditor("redo")} data-testid="button-editor-redo">
                              <Redo2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Redo</TooltipContent>
                        </Tooltip>
                        <Separator orientation="vertical" className="h-6 mx-1" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={handleCopyEditor} data-testid="button-editor-copy">
                              <Copy className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy (selection or all)</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" onClick={handlePasteEditor} data-testid="button-editor-paste">
                              <ClipboardPaste className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Paste</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => triggerEditor("editor.action.selectAll")}
                              data-testid="button-editor-select-all"
                            >
                              <span className="text-[10px] font-bold">SEL</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Select all</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => triggerEditor("editor.action.commentLine")}
                              data-testid="button-editor-comment"
                            >
                              <span className="text-xs font-mono">//</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Toggle comment</TooltipContent>
                        </Tooltip>
                        <Separator orientation="vertical" className="h-6 mx-1" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditorFontSize((s) => Math.max(10, s - 1))}
                              data-testid="button-editor-font-smaller"
                            >
                              <span className="text-xs">A-</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Smaller text</TooltipContent>
                        </Tooltip>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-5 text-center" data-testid="text-editor-font-size">
                          {editorFontSize}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditorFontSize((s) => Math.min(28, s + 1))}
                              data-testid="button-editor-font-larger"
                            >
                              <span className="text-xs">A+</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Larger text</TooltipContent>
                        </Tooltip>
                        <Separator orientation="vertical" className="h-6 mx-1" />
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="ghost" data-testid="button-editor-snippets">
                              <Sparkles className="w-4 h-4" />
                              <span className="ml-1 hidden sm:inline">Snippets</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 p-1">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-1">
                              Insert snippet
                            </div>
                            {SCRIPT_SNIPPETS.map((s) => (
                              <button
                                key={s.label}
                                onClick={() => handleInsertSnippet(s.code)}
                                className="w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate"
                                data-testid={`button-snippet-${s.label.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button size="sm" variant="ghost" data-testid="button-editor-docs">
                              <BookOpen className="w-4 h-4" />
                              <span className="ml-1 hidden sm:inline">Docs</span>
                            </Button>
                          </SheetTrigger>
                          <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
                            <SheetHeader className="px-4 py-3 border-b border-border">
                              <SheetTitle className="text-sm">Scripting Guide</SheetTitle>
                              <SheetDescription className="sr-only">Reference for the scripting API</SheetDescription>
                            </SheetHeader>
                            <ScrollArea className="flex-1">
                              <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed">{SCRIPTING_DOCS}</pre>
                            </ScrollArea>
                          </SheetContent>
                        </Sheet>
                      </div>
                      <div className="flex-1 min-h-0">
                        <MonacoEditor
                          height="100%"
                          defaultLanguage="javascript"
                          language="javascript"
                          value={scriptDraft}
                          onChange={(v) => setScriptDraft(v ?? "")}
                          beforeMount={(monaco) => configureMonacoForEngine(monaco)}
                          onMount={(editor) => { monacoRef.current = editor; }}
                          options={{
                            ...ENGINE_EDITOR_OPTIONS,
                            fontSize: editorFontSize,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-6 text-center">
                      <div className="max-w-sm space-y-3">
                        <FileCode className="w-10 h-10 mx-auto opacity-40" />
                        <p>
                          Pick a script in the <span className="font-semibold text-foreground">Hierarchy</span> to edit it,
                          or click the <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Plus className="w-3 h-3" />button</span>{" "}
                          next to a service or object to attach a new one.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="animate" className="flex-1 m-0 min-h-0 overflow-hidden">
              <RigAnimationEditor gameId={gameId} />
            </TabsContent>

            <TabsContent value="character" className="flex-1 m-0 min-h-0 overflow-hidden">
              <CharacterEditor />
            </TabsContent>
          </Tabs>
        </main>

        {/* Right: Properties (desktop only) */}
        <aside className="w-72 border-l border-border bg-card/30 flex-col shrink-0 hidden md:flex">
          <div className="flex items-center gap-2 h-9 px-3 border-b border-border">
            <SettingsIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Properties</span>
          </div>
          {PropertiesContent}
        </aside>
      </div>

      <div className="hidden md:flex flex-col border-t border-border bg-card/30 transition-all duration-200">
        <div className="flex items-center justify-between h-10 px-3 border-b border-border">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Terminal className="w-3.5 h-3.5" />
            <span>Console</span>
          </div>
          <button
            onClick={() => setConsoleOpen((value) => !value)}
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-toggle-editor-console"
          >
            {consoleOpen ? "Hide" : "Show"}
          </button>
        </div>
        {consoleOpen && (
          <ScrollArea className="h-36 p-3 text-xs font-mono text-foreground overflow-y-auto">
            {editorLogs.length === 0 ? (
              <div className="text-muted-foreground">No runtime logs yet. Play the game to capture script output here.</div>
            ) : (
              editorLogs.map((line, index) => (
                <div key={index} className="py-0.5">{line}</div>
              ))
            )}
          </ScrollArea>
        )}
      </div>

      {playing && (
        <PlayMode
          objects={objects}
          scripts={scripts}
          username={username}
          gameId={gameId}
          userId={(user as any)?.id ?? (user as any)?.claims?.sub}
          onExit={handlePlayExit}
        />
      )}

      {/* Publish Settings Dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="bg-[#141414] border-[#2a2a2a] text-white max-w-sm mx-auto rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Share2 className="w-5 h-5 text-violet-400" />
              Publish Settings
            </DialogTitle>
            <DialogDescription className="text-gray-500 text-sm">
              Choose how and where to share your experience.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-5">
            {/* Publishing destination */}
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-2 font-semibold">Where to publish</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "platform", label: "Platform", icon: Globe, desc: "Show in Explore" },
                  { value: "embed", label: "Embed", icon: Code, desc: "Get iframe code" },
                  { value: "both", label: "Both", icon: Share2, desc: "Platform + Embed" },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPublishDest(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      publishDest === opt.value
                        ? "border-violet-500 bg-violet-500/10 text-violet-300"
                        : "border-[#2a2a2a] bg-[#1a1a1a] text-gray-400 hover:border-[#3a3a3a]"
                    }`}
                  >
                    <opt.icon className="w-4 h-4" />
                    <span className="text-[11px] font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-center leading-tight opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Audience */}
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-2 font-semibold">Who can play</p>
              <div className="space-y-2">
                {([
                  { value: "everyone", label: "Everyone", icon: Globe, desc: "Any player can join", premium: false },
                  { value: "friends", label: "Friends only", icon: Users, desc: "Only your friends", premium: true },
                  { value: "private", label: "Private", icon: EyeOff, desc: "Only you", premium: false },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => !opt.premium && setPublishAudience(opt.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      publishAudience === opt.value && !opt.premium
                        ? "border-violet-500 bg-violet-500/10"
                        : opt.premium
                        ? "border-[#2a2a2a] bg-[#1a1a1a] opacity-60 cursor-default"
                        : "border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a]"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      publishAudience === opt.value && !opt.premium ? "bg-violet-500/20" : "bg-[#222]"
                    }`}>
                      <opt.icon className={`w-4 h-4 ${publishAudience === opt.value && !opt.premium ? "text-violet-400" : "text-gray-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{opt.label}</span>
                        {opt.premium && (
                          <span className="flex items-center gap-0.5 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">
                            <Lock className="w-2.5 h-2.5" />Premium
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                    {publishAudience === opt.value && !opt.premium && (
                      <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Embed code preview */}
            {(publishDest === "embed" || publishDest === "both") && (
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-2 font-semibold">Embed code</p>
                <div className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl p-3 font-mono text-xs text-gray-400 break-all select-all">
                  {`<iframe src="${window.location.origin}/play/${gameId}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`}
                </div>
                <p className="text-[11px] text-gray-600 mt-1.5">Tap and copy the code above to embed this experience on any website.</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={() => setPublishOpen(false)}
              className="flex-1 py-3 rounded-xl border border-[#2a2a2a] text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!game) return;
                const shouldPublish = publishDest === "platform" || publishDest === "both";
                await apiRequest("PATCH", `/api/games/${game.id}`, {
                  isPublished: shouldPublish,
                });
                queryClient.invalidateQueries({ queryKey: ["/api/games", gameId] });
                setPublishOpen(false);
                toast({
                  title: shouldPublish ? "Experience published!" : "Embed settings saved",
                  description: publishDest === "platform"
                    ? "Now visible in Explore"
                    : publishDest === "embed"
                    ? "Share the embed code to let others play"
                    : "Visible in Explore and embeddable",
                });
              }}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-indigo-500 transition-all active:scale-95"
            >
              Publish
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VectorField({
  label,
  values,
  step = 0.1,
  onChange,
  testIdPrefix,
}: {
  label: string;
  values: [number, number, number];
  step?: number;
  onChange: (index: number, value: number) => void;
  testIdPrefix: string;
}) {
  const axes = ["X", "Y", "Z"];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground text-center">{axes[i]}</span>
            <Input
              type="number"
              step={step}
              value={Number(v.toFixed(3))}
              onChange={(e) => onChange(i, parseFloat(e.target.value) || 0)}
              className="h-8 px-1.5 text-xs font-mono text-center"
              data-testid={`input-${testIdPrefix}-${axes[i].toLowerCase()}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
