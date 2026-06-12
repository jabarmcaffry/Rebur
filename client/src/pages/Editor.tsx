import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useGLTFModel } from "@/lib/gltf-loader";
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
  Music,
  Layout,
  User,
  Search,
  MousePointer2,
  Tag,
  Dna,
  Zap,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Game, GameObject, Script } from "@shared/schema";
import PlayMode from "@/components/PlayMode";
import AnimationEditor from "@/components/AnimationEditor";
import SVGScene from "@/components/SVGScene";
import { DEFAULT_SCRIPT, SCRIPTING_DOCS } from "@/lib/runtime/docs";
import { isWebGLAvailable } from "@/lib/webgl";
import { configureMonacoForEngine, ENGINE_EDITOR_OPTIONS } from "@/lib/runtime/scripting/monaco-config";
import { marked } from "marked";

type TransformMode = "translate" | "rotate" | "scale";

const PRIMITIVES = [
  { type: "cube", label: "Cube", icon: Box },
  { type: "sphere", label: "Sphere", icon: Circle },
  { type: "cylinder", label: "Cylinder", icon: Cylinder },
  { type: "plane", label: "Plane", icon: Square },
  { type: "light", label: "Light", icon: Lightbulb },
] as const;

interface ContainerDef {
  name: string;
  displayName: string;
  icon: any;
  hint: string;
  allowedScripts: Array<"server" | "client" | "shared">;
  canHoldObjects: boolean;
  isAssetContainer?: boolean;
  isUIContainer?: boolean;
  children?: ContainerDef[];
}

const CONTAINERS: ContainerDef[] = [
  {
    name: "Workspace",
    displayName: "Workspace",
    icon: Box,
    hint: "Freeform 3D world — organize it however your game needs. Scripts attach directly to entities.",
    allowedScripts: ["server", "client"],
    canHoldObjects: true,
  },
  {
    name: "Lighting",
    displayName: "Lighting",
    icon: Sun,
    hint: "Global lighting, atmosphere, skybox. Not spatial — use Rebur.Lighting.* in scripts.",
    allowedScripts: [],
    canHoldObjects: true,
  },
  {
    name: "Players",
    displayName: "Players",
    icon: Users,
    hint: "Connected players appear here during a session. StarterCharacter and StarterInventory define defaults for each player on join.",
    allowedScripts: [],
    canHoldObjects: false,
    children: [
      {
        name: "Players/StarterInventory",
        displayName: "StarterInventory",
        icon: Archive,
        hint: "Items given to every player on join. Use Rebur.Players.StarterInventory.add() in scripts.",
        allowedScripts: [],
        canHoldObjects: false,
      },
      {
        name: "Players/StarterCharacter",
        displayName: "StarterCharacter",
        icon: Layers,
        hint: "Character templates applied to each player on join. Accepts server and client scripts.",
        allowedScripts: ["server", "client"],
        canHoldObjects: true,
      },
    ],
  },
  {
    name: "GUI",
    displayName: "GUI",
    icon: Eye,
    hint: "All GUI definitions — screen layouts, HUDs, overlays, and reusable components.",
    allowedScripts: ["client"],
    canHoldObjects: false,
    isUIContainer: true,
    children: [
      {
        name: "GUI/Player",
        displayName: "Player",
        icon: Users,
        hint: "Per-player private GUI: HUD, Inventory, Menus. ClientScripts only.",
        allowedScripts: ["client"],
        canHoldObjects: false,
        isUIContainer: true,
      },
      {
        name: "GUI/Global",
        displayName: "Global",
        icon: Globe,
        hint: "GUI visible to all players: Notifications, SystemOverlays. ClientScripts only.",
        allowedScripts: ["client"],
        canHoldObjects: false,
        isUIContainer: true,
      },
      {
        name: "GUI/Components",
        displayName: "Components",
        icon: Sparkles,
        hint: "Reusable GUI building blocks shared across Player and Global GUI.",
        allowedScripts: ["client"],
        canHoldObjects: false,
        isUIContainer: true,
      },
    ],
  },
  {
    name: "Assets",
    displayName: "Assets",
    icon: Archive,
    hint: "Reusable assets — add your own folders and files inside Shared or Server.",
    allowedScripts: [],
    canHoldObjects: false,
    children: [
      {
        name: "Assets/Shared",
        displayName: "Shared",
        icon: Globe,
        hint: "Replicated to all clients (like ReplicatedStorage). Use + to add Folders, Models, and Audio.",
        allowedScripts: ["client"],
        canHoldObjects: false,
        isAssetContainer: true,
      },
      {
        name: "Assets/Server",
        displayName: "Server",
        icon: Lock,
        hint: "Server-only assets, never sent to clients. Use + to add Folders, Models, and Audio.",
        allowedScripts: ["server"],
        canHoldObjects: false,
        isAssetContainer: true,
      },
    ],
  },
  {
    name: "ServerScripts",
    displayName: "ServerScripts",
    icon: FileCode,
    hint: "Global server-authoritative scripts — game managers, round systems, spawn logic. Server scripts only.",
    allowedScripts: ["server"],
    canHoldObjects: false,
  },
  {
    name: "Teams",
    displayName: "Teams",
    icon: Users,
    hint: "Team configuration — use Rebur.Teams.create(), assign(), score() in scripts.",
    allowedScripts: [],
    canHoldObjects: false,
  },
  {
    name: "Chat",
    displayName: "Chat",
    icon: Terminal,
    hint: "Chat settings — use Rebur.Chat.send(), on(), channels.* in scripts.",
    allowedScripts: [],
    canHoldObjects: false,
  },
  {
    name: "Network",
    displayName: "Network",
    icon: Share2,
    hint: "Network event definitions — use Rebur.Network.broadcast(), send(player, ...), on() in scripts.",
    allowedScripts: [],
    canHoldObjects: false,
  },
];

function flattenContainers(cs: ContainerDef[]): ContainerDef[] {
  const result: ContainerDef[] = [];
  for (const c of cs) {
    result.push(c);
    if (c.children) result.push(...flattenContainers(c.children));
  }
  return result;
}
const ALL_CONTAINERS = flattenContainers(CONTAINERS);

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
    label: "Create an entity",
    code: `const enemy = Rebur.Workspace.create("sphere", {\n  name: "Goblin",\n  position: { x: 5, y: 1, z: 0 },\n  color: "#ff4444",\n});\nenemy.body.anchored = false;\nenemy.body.mass = 2;\n`,
  },
  {
    label: "Tween: move entity",
    code: `const door = Rebur.Workspace.find("Door");\nif (door) {\n  Rebur.Input.on("press", (player, key) => {\n    if (key === "e") {\n      Rebur.Tween(door.position, { y: 5 }, 1, "easeOutQuad", () => {\n        log("Door opened!");\n      });\n    }\n  });\n}\n`,
  },
];

export default function Editor() {
  const { gameId } = useParams<{ gameId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"scene" | "script" | "docs" | "animate">("scene");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [scriptDraft, setScriptDraft] = useState("");
  const [isHierarchyOpen, setHierarchyOpen] = useState(true);
  const [isPropertiesOpen, setPropertiesOpen] = useState(true);
  const [isPlayMode, setIsPlayMode] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [dragItem, setDragItem] = useState<{ kind: "object" | "script"; id: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hierarchySearch, setHierarchySearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const reburInputRef = useRef<HTMLInputElement>(null);

  const { data: game } = useQuery<Game>({
    queryKey: [`/api/games/${gameId}`],
  });

  const { data: objects = [] } = useQuery<GameObject[]>({
    queryKey: [`/api/games/${gameId}/objects`],
  });

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: [`/api/games/${gameId}/scripts`],
  });

  const selected = objects.find((o) => o.id === selectedId);
  const selectedScript = scripts.find((s) => s.id === selectedScriptId);

  const createObjectMutation = useMutation({
    mutationFn: async (obj: Partial<GameObject>) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/objects`, obj);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/objects`] });
    },
  });

  const updateObjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<GameObject> }) => {
      const res = await apiRequest("PATCH", `/api/objects/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/objects`] });
    },
  });

  const deleteObjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/objects/${id}`);
    },
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/objects`] });
    },
  });

  const createScriptMutation = useMutation({
    mutationFn: async (script: Partial<Script>) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/scripts`, script);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/scripts`] });
      setSelectedScriptId(data.id);
      setScriptDraft(data.code);
      setActiveTab("script");
    },
  });

  const updateScriptMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Script> }) => {
      const res = await apiRequest("PATCH", `/api/scripts/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/scripts`] });
    },
  });

  const deleteScriptMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/scripts/${id}`);
    },
    onSuccess: () => {
      setSelectedScriptId(null);
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/scripts`] });
    },
  });

  const [activePlayers, setActivePlayers] = useState<{ id: string; name: string }[]>([]);

  const objectsByContainer = useMemo(() => {
    const groups: Record<string, GameObject[]> = {};
    for (const c of ALL_CONTAINERS) groups[c.name] = [];
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

  const scriptsByContainer = useMemo(() => {
    const groups: Record<string, Script[]> = {};
    for (const c of ALL_CONTAINERS) groups[c.name] = [];
    for (const s of scripts) {
      if (s.objectId) continue;
      const c = s.container ?? "ServerScripts";
      if (!groups[c]) groups[c] = [];
      groups[c].push(s);
    }
    return groups;
  }, [scripts]);

  const scriptsByObject = useMemo(() => {
    const groups: Record<string, Script[]> = {};
    for (const s of scripts) {
      if (!s.objectId) continue;
      if (!groups[s.objectId]) groups[s.objectId] = [];
      groups[s.objectId].push(s);
    }
    return groups;
  }, [scripts]);

  const openScript = (s: Script) => {
    setSelectedScriptId(s.id);
    setScriptDraft(s.code);
    setActiveTab("script");
  };

  const addScriptTo = (containerName: string, scriptType: "server" | "client" | "shared", objectId?: string) => {
    const isFirstScript = scripts.length === 0;
    createScriptMutation.mutate({
      gameId,
      name: `Script${scripts.length + 1}`,
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

  const createGroupObject = (containerName: string, type: "folder" | "model" | "guiFrame" | "guiText" | "guiButton" | "guiImage" | "particleEmitter", parentId?: string | null) => {
    const count = objects.filter((o) => o.type === type).length + 1;
    const typeNames: Record<string, string> = {
      folder: "Folder",
      model: "Model",
      guiFrame: "Frame",
      guiText: "TextLabel",
      guiButton: "Button",
      guiImage: "Image",
      particleEmitter: "ParticleEmitter"
    };
    const displayName = typeNames[type] || type;
    const isGUI = type.startsWith("gui");
    const isParticle = type === "particleEmitter";
    
    createObjectMutation.mutate({
      gameId,
      name: `${displayName}${count}`,
      type,
      primitiveType: null,
      container: containerName,
      parentId: parentId ?? null,
      positionX: 0, positionY: 0, positionZ: 0,
      scaleX: isGUI ? 0.1 : (isParticle ? 1 : 1),
      scaleY: isGUI ? 0.05 : (isParticle ? 1 : 1),
      scaleZ: isGUI ? 0.1 : (isParticle ? 1 : 1),
      color: isGUI ? "#ffffff" : (isParticle ? "#ffaa00" : "#38bdf8"),
      properties: { anchored: true, canCollide: false, transparency: isGUI ? 0 : 0, effectType: isParticle ? "smoke" : undefined },
    } as Partial<GameObject>);
  };

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
      gameId,
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
      updateObjectMutation.mutate({ id: dragItem.id, updates: { container: target.container, parentId: target.parentId ?? null } });
    } else {
      updateScriptMutation.mutate({
        id: dragItem.id,
        updates: { container: target.container, objectId: target.parentId ?? null } as Partial<Script>,
      });
    }
    setDragItem(null);
  };

  const dropTargetProps = (target: { container: string; parentId?: string | null }) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      moveHierarchyItem(target);
    },
  });

  const ObjectIcon = ({ o }: { o: GameObject }) => {
    const Icon =
      o.type === "light" ? Lightbulb
      : o.type === "particleEmitter" ? Sparkles
      : o.type === "audio" ? Music
      : o.type === "uiElement" ? Layout
      : o.type === "folder" ? Folder
      : o.type === "model" ? Layers
      : o.primitiveType === "sphere" ? Circle
      : o.primitiveType === "cylinder" ? Cylinder
      : o.primitiveType === "plane" ? Square
      : Box;
    return <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  };

  const ScriptRow = ({ s, indent }: { s: Script; indent: number }) => {
    const isDragging = draggingId === s.id;
    const isSelected = selectedScriptId === s.id;
    if (hierarchySearch && !s.name.toLowerCase().includes(hierarchySearch.toLowerCase())) return null;

    return (
      <div
        className={`group flex items-center gap-1 px-2 py-1 rounded-sm transition-colors cursor-pointer ${
          isDragging ? "opacity-50" : ""
        } ${isSelected ? "bg-primary/20 text-primary" : "hover:bg-muted/50"}`}
        style={{ paddingLeft: indent }}
        draggable
        onDragStart={(e) => {
          setDragItem({ kind: "script", id: s.id });
          setDraggingId(s.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggingId(null)}
        onClick={() => openScript(s)}
      >
        <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="text-xs truncate flex-1">{s.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); deleteScriptMutation.mutate(s.id); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const AddItemMenu = ({ containerDef, parentId, title, showObjects }: any) => {
    const [open, setOpen] = useState(false);
    const Item = ({ icon: I, label, onClick }: any) => (
      <button
        onClick={() => { onClick(); setOpen(false); }}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent text-left"
      >
        <I className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{label}</span>
      </button>
    );

    // Determine what this container can hold
    // Top-level containers (parentId === null) should allow direct item creation
    // Folders/Models (parentId !== null) should allow children
    const isTopLevelContainer = parentId === null;
    const canHoldPrimitives = (isTopLevelContainer && containerDef.canHoldObjects) || (parentId !== null && showObjects);
    const canHoldScripts = containerDef.allowedScripts.length > 0;
    const canHoldGroups = (isTopLevelContainer && (containerDef.canHoldObjects || containerDef.isAssetContainer || containerDef.name.includes("Assets"))) || (parentId !== null && showObjects);

    if (!canHoldGroups && !canHoldScripts && !canHoldPrimitives) return null;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button 
            onClick={(e) => { e.stopPropagation(); }}
            className="md:opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1">
          {canHoldPrimitives && (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">Entities</div>
              <Item icon={Box} label="Cube" onClick={() => addPrimitiveTo(containerDef.name, "cube", parentId)} />
              <Item icon={Circle} label="Sphere" onClick={() => addPrimitiveTo(containerDef.name, "sphere", parentId)} />
              <Item icon={Lightbulb} label="Light" onClick={() => addPrimitiveTo(containerDef.name, "light", parentId)} />
            </>
          )}
          {containerDef.isUIContainer && (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">GUI Elements</div>
              <Item icon={Folder} label="Frame" onClick={() => createGroupObject(containerDef.name, "guiFrame", isTopLevelContainer ? null : parentId)} />
              <Item icon={FileCode} label="Text Label" onClick={() => createGroupObject(containerDef.name, "guiText", isTopLevelContainer ? null : parentId)} />
              <Item icon={Square} label="Button" onClick={() => createGroupObject(containerDef.name, "guiButton", isTopLevelContainer ? null : parentId)} />
              <Item icon={Circle} label="Image" onClick={() => createGroupObject(containerDef.name, "guiImage", isTopLevelContainer ? null : parentId)} />
            </>
          )}
          {canHoldGroups && !containerDef.isUIContainer && (
            <>
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">Organization</div>
              <Item icon={Folder} label="Folder" onClick={() => createGroupObject(containerDef.name, "folder", isTopLevelContainer ? null : parentId)} />
              <Item icon={Layers} label="Model" onClick={() => createGroupObject(containerDef.name, "model", isTopLevelContainer ? null : parentId)} />
            </>
          )}
          {canHoldScripts && (
            <>
              <Separator className="my-1" />
              <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">Scripts</div>
              {containerDef.allowedScripts.includes("server") && <Item icon={FileCode} label="Server Script" onClick={() => addScriptTo(containerDef.name, "server", parentId)} />}
              {containerDef.allowedScripts.includes("client") && <Item icon={FileCode} label="Client Script" onClick={() => addScriptTo(containerDef.name, "client", parentId)} />}
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  const ObjectTreeRow = ({ o, containerDef, indent }: { o: GameObject; containerDef: ContainerDef; indent: number }) => {
    const childObjs = objectsByParent[o.id] ?? [];
    const childScripts = scriptsByObject[o.id] ?? [];
    const [collapsed, setCollapsed] = useState(false);
    const isSelected = selectedId === o.id;
    const isDragging = draggingId === o.id;
    const isGroup = o.type === "folder" || o.type === "model";

    if (hierarchySearch && !o.name.toLowerCase().includes(hierarchySearch.toLowerCase())) {
      if (childObjs.length === 0 && childScripts.length === 0) return null;
    }

    return (
      <div className="space-y-0.5">
        <div
          className={`group flex items-center gap-1 px-2 py-1 rounded-sm transition-colors cursor-pointer ${
            isDragging ? "opacity-50" : ""
          } ${isSelected ? "bg-primary/20 text-primary" : "hover:bg-muted/50"}`}
          style={{ paddingLeft: indent }}
          draggable
          onClick={() => { setSelectedId(o.id); setSelectedScriptId(null); }}
          onDragStart={(e) => {
            setDragItem({ kind: "object", id: o.id });
            setDraggingId(o.id);
          }}
          onDragEnd={() => setDraggingId(null)}
          onDragOver={(e) => isGroup && e.preventDefault()}
          onDrop={(e) => {
            if (!isGroup) return;
            e.preventDefault(); e.stopPropagation();
            moveHierarchyItem({ container: containerDef.name, parentId: o.id });
          }}
        >
          <button onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }} className="p-0.5 hover:bg-accent rounded">
            {(childObjs.length > 0 || childScripts.length > 0) ? (
              collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            ) : <div className="w-3" />}
          </button>
          <ObjectIcon o={o} />
          <span className="text-xs truncate flex-1">{o.name}</span>
          <AddItemMenu containerDef={containerDef} parentId={o.id} showObjects={isGroup} />
        </div>
        {!collapsed && (
          <>
            {childScripts.map(s => <ScriptRow key={s.id} s={s} indent={indent + 16} />)}
            {childObjs.map(child => <ObjectTreeRow key={child.id} o={child} containerDef={containerDef} indent={indent + 12} />)}
          </>
        )}
      </div>
    );
  };

  const ContainerSection = ({ c, depth = 0 }: { c: ContainerDef; depth?: number }) => {
    const items = objectsByContainer[c.name] ?? [];
    const containerScripts = scriptsByContainer[c.name] ?? [];
    const collapsed = !!collapsedContainers[c.name];

    return (
      <div className="space-y-0.5" {...dropTargetProps({ container: c.name, parentId: null })}>
        <div
          className="group flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted/30 cursor-pointer"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => toggleContainer(c.name)}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold flex-1">{c.displayName}</span>
          <AddItemMenu containerDef={c} parentId={null} showObjects={true} />
        </div>
        {!collapsed && (
          <div className="space-y-0.5">
            {(c.children ?? []).map(child => <ContainerSection key={child.name} c={child} depth={depth + 1} />)}
            {containerScripts.map(s => <ScriptRow key={s.id} s={s} indent={depth * 12 + 24} />)}
            {items.map(o => <ObjectTreeRow key={o.id} o={o} containerDef={c} indent={depth * 12 + 24} />)}
          </div>
        )}
      </div>
    );
  };

  const HierarchyPanel = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={`flex flex-col h-full bg-card/50 border-r border-border w-64 shrink-0 ${!isMobile ? "max-md:hidden" : ""}`}>
      <div className="p-2 border-b border-border flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Hierarchy
          </span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedId(null)}>
                  <MousePointer2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear Selection</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search hierarchy..."
            className="h-7 pl-7 text-xs bg-muted/50 border-none focus-visible:ring-1"
            value={hierarchySearch}
            onChange={(e) => setHierarchySearch(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-1">
          {CONTAINERS.map(c => <ContainerSection key={c.name} c={c} />)}
        </div>
      </ScrollArea>
    </div>
  );

  const VectorField = ({ label, values, onChange, step = 1, testIdPrefix }: any) => (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {["X", "Y", "Z"].map((axis, i) => (
          <div key={axis} className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/50">{axis}</span>
            <Input
              type="number"
              step={step}
              className="h-7 pl-5 pr-1 text-xs bg-muted/30 border-none text-right tabular-nums"
              value={Number(values[i]).toFixed(2)}
              onChange={(e) => onChange(i, parseFloat(e.target.value) || 0)}
              data-testid={`${testIdPrefix}-${axis.toLowerCase()}`}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const PropertiesPanel = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={`flex flex-col h-full bg-card/50 border-l border-border w-72 shrink-0 ${!isMobile ? "max-md:hidden" : ""}`}>
      <div className="p-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <SettingsIcon className="w-3.5 h-3.5" /> Properties
        </span>
      </div>
      <ScrollArea className="flex-1">
        {selected ? (
          <div className="p-3 space-y-5">
            {/* --- IDENTITY SECTION --- */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-primary">
                <Tag className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Identity</span>
              </div>
              <div className="space-y-2.5 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Name</Label>
                  <Input
                    className="h-7 text-xs bg-background/50"
                    value={selected.name}
                    onChange={(e) => handleObjectFieldChange("name", e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase">Class</span>
                  <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                    {selected.type} {selected.primitiveType && `/ ${selected.primitiveType}`}
                  </span>
                </div>
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* --- TRANSFORM SECTION --- */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-orange-400">
                <Maximize className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Transform</span>
              </div>
              <VectorField
                label="Position"
                values={[selected.positionX, selected.positionY, selected.positionZ]}
                onChange={(i, v) => handleObjectFieldChange(["positionX", "positionY", "positionZ"][i] as any, v)}
              />
              <VectorField
                label="Rotation"
                step={0.1}
                values={[selected.rotationX, selected.rotationY, selected.rotationZ]}
                onChange={(i, v) => handleObjectFieldChange(["rotationX", "rotationY", "rotationZ"][i] as any, v)}
              />
              <VectorField
                label="Scale"
                step={0.1}
                values={[selected.scaleX, selected.scaleY, selected.scaleZ]}
                onChange={(i, v) => handleObjectFieldChange(["scaleX", "scaleY", "scaleZ"][i] as any, v)}
              />
            </div>

            <Separator className="opacity-50" />

            {/* --- APPEARANCE SECTION --- */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-blue-400">
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Appearance</span>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="w-7 h-7 rounded-md border border-border cursor-pointer overflow-hidden p-0 bg-transparent"
                    value={selected.color ?? "#888888"}
                    onChange={(e) => handleObjectFieldChange("color", e.target.value)}
                  />
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded uppercase">{selected.color}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Transparency</Label>
                  <span className="text-[10px] font-mono tabular-nums bg-muted/50 px-1.5 py-0.5 rounded">{(getProp("transparency", 0) * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[getProp("transparency", 0)]}
                  min={0} max={1} step={0.01}
                  onValueChange={([v]) => handlePropertyChange({ transparency: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Visible</Label>
                <Switch
                  checked={getProp("visible", true)}
                  onCheckedChange={(v) => handlePropertyChange({ visible: v })}
                />
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* --- PARTICLE EMITTER SECTION --- */}
            {selected.type === "particleEmitter" && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-yellow-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Particle Emitter</span>
                  </div>
                  <div className="space-y-3 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase">Effect Type</Label>
                      <Select value={getProp("effectType", "smoke")} onValueChange={(v) => handlePropertyChange({ effectType: v })}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="smoke">Smoke</SelectItem>
                          <SelectItem value="fire">Fire</SelectItem>
                          <SelectItem value="sparkle">Sparkle</SelectItem>
                          <SelectItem value="explosion">Explosion</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Rate</Label>
                        <Input type="number" className="h-7 text-xs bg-background/50" value={getProp("rate", 10)} onChange={(e) => handlePropertyChange({ rate: parseFloat(e.target.value) || 10 })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Lifetime</Label>
                        <Input type="number" className="h-7 text-xs bg-background/50" value={getProp("lifetime", 2)} onChange={(e) => handlePropertyChange({ lifetime: parseFloat(e.target.value) || 2 })} />
                      </div>
                    </div>
                  </div>
                </div>
                <Separator className="opacity-50" />
              </>
            )}

            {/* --- GUI ELEMENT SECTION --- */}
            {selected.container?.includes("GUI") && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-cyan-400">
                    <Layout className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">GUI Properties</span>
                  </div>
                  <div className="space-y-3 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase">Element Type</Label>
                      <Select value={getProp("guiKind", "frame")} onValueChange={(v) => handlePropertyChange({ guiKind: v })}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="frame">Frame</SelectItem>
                          <SelectItem value="text">Text Label</SelectItem>
                          <SelectItem value="button">Button</SelectItem>
                          <SelectItem value="image">Image</SelectItem>
                          <SelectItem value="bar">Progress Bar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Width</Label>
                        <Input type="number" className="h-7 text-xs bg-background/50" value={getProp("guiWidth", 100)} onChange={(e) => handlePropertyChange({ guiWidth: parseFloat(e.target.value) || 100 })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground uppercase">Height</Label>
                        <Input type="number" className="h-7 text-xs bg-background/50" value={getProp("guiHeight", 50)} onChange={(e) => handlePropertyChange({ guiHeight: parseFloat(e.target.value) || 50 })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground uppercase">Anchor Point</Label>
                      <Select value={getProp("guiAnchor", "center")} onValueChange={(v) => handlePropertyChange({ guiAnchor: v })}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="topLeft">Top Left</SelectItem>
                          <SelectItem value="topCenter">Top Center</SelectItem>
                          <SelectItem value="topRight">Top Right</SelectItem>
                          <SelectItem value="centerLeft">Center Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="centerRight">Center Right</SelectItem>
                          <SelectItem value="bottomLeft">Bottom Left</SelectItem>
                          <SelectItem value="bottomCenter">Bottom Center</SelectItem>
                          <SelectItem value="bottomRight">Bottom Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <Separator className="opacity-50" />
              </>
            )}

            {/* --- PHYSICS SECTION --- */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-green-400">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Physics</span>
              </div>
              <div className="space-y-3 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Anchored</Label>
                  <Switch
                    checked={getProp("anchored", true)}
                    onCheckedChange={(v) => handlePropertyChange({ anchored: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Can Collide</Label>
                  <Switch
                    checked={getProp("canCollide", true)}
                    onCheckedChange={(v) => handlePropertyChange({ canCollide: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Mass</Label>
                  <Input
                    type="number"
                    className="h-7 text-xs bg-background/50"
                    value={getProp("mass", 1)}
                    onChange={(e) => handlePropertyChange({ mass: parseFloat(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Friction</Label>
                  <Input
                    type="number"
                    className="h-7 text-xs bg-background/50"
                    value={getProp("friction", 0.5)}
                    onChange={(e) => handlePropertyChange({ friction: parseFloat(e.target.value) || 0.5 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Elasticity</Label>
                  <span className="text-[10px] font-mono tabular-nums bg-muted/50 px-1.5 py-0.5 rounded">{(getProp("restitution", 0) * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[getProp("restitution", 0)]}
                  min={0} max={1} step={0.01}
                  onValueChange={([v]) => handlePropertyChange({ restitution: v })}
                />
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* --- DATA SECTION --- */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-purple-400">
                <Dna className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Behavior</span>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Attributes (JSON)</Label>
                <div className="text-[10px] p-2 bg-muted/30 rounded border border-border/50 font-mono text-muted-foreground break-all">
                  {JSON.stringify(selected.properties)}
                </div>
              </div>
            </div>

            <Separator className="opacity-50" />

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs font-bold"
              onClick={() => deleteObjectMutation.mutate(selected.id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Entity
            </Button>
          </div>
        ) : selectedScript ? (
          <div className="p-3 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-blue-400">
                <FileCode className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Script Settings</span>
              </div>
              <div className="space-y-3 bg-muted/20 p-3 rounded-lg border border-border/50">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Name</Label>
                  <Input
                    className="h-7 text-xs bg-background/50"
                    value={selectedScript.name}
                    onChange={(e) => handleScriptFieldChange("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Execution Target</Label>
                  <Select
                    value={selectedScript.scriptType ?? "server"}
                    onValueChange={(v) => handleScriptFieldChange("scriptType", v)}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="server">Server (Secure)</SelectItem>
                      <SelectItem value="client">Client (Local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Label className="text-xs text-muted-foreground">Active</Label>
                  <Switch
                    checked={!!selectedScript.enabled}
                    onCheckedChange={(v) => handleScriptFieldChange("enabled", v)}
                  />
                </div>
              </div>
            </div>
            <Separator className="opacity-50" />
            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground uppercase">Location</Label>
              <div className="text-[11px] bg-muted/30 p-2 rounded border border-border/50 flex items-center gap-2">
                <Folder className="w-3 h-3 text-muted-foreground" />
                <span className="truncate">
                  {selectedScript.objectId
                    ? `Attached to ${objects.find((o) => o.id === selectedScript.objectId)?.name ?? "object"}`
                    : selectedScript.container}
                </span>
              </div>
            </div>
            <Separator className="opacity-50" />
            <Button
              variant="destructive"
              size="sm"
              className="w-full h-9 text-xs font-bold"
              onClick={() => deleteScriptMutation.mutate(selectedScript.id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Script
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 opacity-30">
            <MousePointer2 className="w-10 h-10" />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest">Selection Required</p>
              <p className="text-[10px]">Select an object or script from the hierarchy to view and edit its properties.</p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col bg-background text-foreground overflow-hidden font-sans">
      <header className="flex items-center justify-between h-10 px-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="hover:opacity-80 transition-opacity shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex flex-col -space-y-1 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary hidden sm:inline">Rebur Studio</span>
            <span className="text-xs font-medium truncate">{game?.title ?? "Loading..."}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setIsPlayMode(true)}>
            <Play className="w-3 h-3 fill-primary text-primary" /> <span className="hidden sm:inline">Play</span>
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1 hidden sm:block" />
          <Button variant="default" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setPublishOpen(true)}>
            <Share2 className="w-3 h-3" /> <span className="hidden sm:inline">Publish</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden flex-col md:flex-row">
        {/* Mobile Hierarchy Sheet */}
        <Sheet open={isHierarchyOpen && window.innerWidth < 768} onOpenChange={setHierarchyOpen}>
          <SheetContent side="left" className="w-64 p-0 md:hidden">
            <HierarchyPanel isMobile={true} />
          </SheetContent>
        </Sheet>

        {/* Desktop Hierarchy Panel */}
        {isHierarchyOpen && <HierarchyPanel />}
        
        <div className="flex-1 flex flex-col min-w-0 bg-muted/10 relative">
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="h-full flex flex-col">
            <div className="flex items-center justify-between px-2 border-b border-border bg-card/40 shrink-0 overflow-x-auto">
              <TabsList className="bg-transparent h-9 p-0 gap-1">
                <TabsTrigger value="scene" className="h-7 text-xs px-3 data-[state=active]:bg-muted">Scene</TabsTrigger>
                {selectedScript && (
                  <div className="flex items-center gap-0.5 bg-muted/50 rounded-md px-1">
                    <TabsTrigger value="script" className="h-7 text-xs px-2 data-[state=active]:bg-muted">
                      <FileCode className="w-3 h-3 mr-1" /> Scripts
                    </TabsTrigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedScriptId(null);
                        if (activeTab === "script") setActiveTab("scene");
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <TabsTrigger value="docs" className="h-7 text-xs px-3 data-[state=active]:bg-muted">Docs</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={() => setHierarchyOpen(!isHierarchyOpen)}>
                  <Menu className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={() => setPropertiesOpen(!isPropertiesOpen)}>
                  <PanelRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="scene" className="h-full m-0 p-0">
                <Canvas shadows camera={{ position: [5, 5, 5], fov: 50 }}>
                  <ambientLight intensity={0.5} />
                  <pointLight position={[10, 10, 10]} castShadow />
                  <Grid infiniteGrid fadeDistance={50} sectionSize={1} />
                  {objects.map((o) => (
                    <mesh
                      key={o.id}
                      position={[o.positionX, o.positionY, o.positionZ]}
                      rotation={[o.rotationX, o.rotationY, o.rotationZ]}
                      scale={[o.scaleX, o.scaleY, o.scaleZ]}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(o.id); setSelectedScriptId(null); }}
                    >
                      {o.primitiveType === "sphere" ? <sphereGeometry /> : <boxGeometry />}
                      <meshStandardMaterial color={o.color} transparent opacity={1 - (o.properties as any)?.transparency || 1} />
                    </mesh>
                  ))}
                  <OrbitControls makeDefault />
                </Canvas>
              </TabsContent>
              <TabsContent value="script" className="h-full m-0 p-0 flex flex-col">
                {selectedScript ? (
                  <>
                    <div className="flex items-center justify-between p-2 bg-muted/30 border-b border-border">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-medium">{selectedScript.name}</span>
                      </div>
                      <Button size="sm" className="h-7 text-xs" onClick={() => updateScriptMutation.mutate({ id: selectedScript.id, updates: { code: scriptDraft } })}>
                        <Save className="w-3 h-3 mr-1.5" /> Save
                      </Button>
                    </div>
                    <MonacoEditor
                      height="100%"
                      language="javascript"
                      theme="vs-dark"
                      value={scriptDraft}
                      onChange={(v) => setScriptDraft(v ?? "")}
                      onMount={(editor) => configureMonacoForEngine(editor)}
                      options={ENGINE_EDITOR_OPTIONS as any}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-50">
                    <Code2 className="w-10 h-10" />
                    <p className="text-sm">Select a script from the hierarchy to edit.</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="docs" className="h-full m-0 p-0 overflow-hidden">
                <ScrollArea className="h-full w-full">
                  <div className="p-4 max-w-4xl prose prose-invert prose-sm dark">
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(SCRIPTING_DOCS) as string }} />
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Mobile Properties Sheet */}
        <Sheet open={isPropertiesOpen && window.innerWidth < 768} onOpenChange={setPropertiesOpen}>
          <SheetContent side="right" className="w-72 p-0 md:hidden">
            <PropertiesPanel isMobile={true} />
          </SheetContent>
        </Sheet>

        {/* Desktop Properties Panel */}
        {isPropertiesOpen && <PropertiesPanel />}
      </main>

      {isPlayMode && (
        <PlayMode
          objects={objects}
          scripts={scripts}
          username={(user as any)?.username || (user as any)?.email || "Player"}
          gameId={gameId}
          userId={(user as any)?.id}
          onExit={() => setIsPlayMode(false)}
        />
      )}
    </div>
  );
}
