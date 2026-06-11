/**
 * Monaco Editor Configuration for Rebur Engine Scripts
 * Updated to match new Rebur API contract.
 */

import type * as Monaco from "monaco-editor";

export const ENGINE_TYPE_DEFS = `
interface Vec3 { x: number; y: number; z: number; }

interface EntityBody {
  anchored: boolean;
  canCollide: boolean;
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  isKinematic: boolean;
  isTrigger: boolean;
  readonly velocity: Vec3;
  readonly angularVelocity: Vec3;
  constraints: {
    lockPositionX?: boolean;
    lockPositionY?: boolean;
    lockPositionZ?: boolean;
    lockRotationX?: boolean;
    lockRotationY?: boolean;
    lockRotationZ?: boolean;
  };
  applyForce(force: Vec3): void;
  applyImpulse(impulse: Vec3): void;
  applyTorque(torque: Vec3): void;
  applyAngularImpulse(impulse: Vec3): void;
  clearForces(): void;
}

interface Entity {
  readonly id: string;
  name: string;
  readonly type: string;
  readonly isPlayer: boolean;
  readonly destroyed: boolean;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  transparency: number;
  health: number;
  maxHealth: number;
  readonly body: EntityBody;
  gravity: any;
  readonly parent: Entity | null;
  readonly children: Entity[];
  setParent(parent: Entity | null, opts?: { keepWorldPosition?: boolean }): void;
  find(name: string): Entity | null;
  descendants(): Entity[];
  destroy(): void;
  on(event: string, fn: (...args: any[]) => void): () => void;
}

interface PlayerEntity extends Entity {
  readonly isPlayer: true;
  readonly username: string;
  speed: number;
  jump: number;
  readonly gui: PlayerGuiAPI;
  readonly data: PlayerDataAPI;
  readonly input: PlayerInputAPI;
}

interface PlayerGuiAPI {
  text(id: string, text: string, opts?: any): void;
  button(id: string, text: string, opts?: any, onClick?: () => void): void;
  bar(id: string, value: number, maxValue: number, opts?: any): void;
  image(id: string, url: string, opts?: any): void;
  input(id: string, opts?: any, onInput?: (text: string) => void): void;
  clear(id?: string): void;
}

interface PlayerDataAPI {
  get(key: string): any;
  set(key: string, value: any): void;
  increment(key: string, amount?: number): number;
  decrement(key: string, amount?: number): number;
  has(key: string): boolean;
  delete(key: string): void;
  getAll(): Record<string, any>;
}

interface PlayerInputAPI {
  key(name: string): boolean;
  readonly mouse: { x: number; y: number };
  on(event: string, fn: (...args: any[]) => void): () => void;
}

interface ReburAPI {
  Workspace: {
    find(name: string): Entity | null;
    get(id: string): Entity | null;
    all(): Entity[];
    create(type: string, props?: any): Entity;
    clone(name: string, overrides?: any): Entity | null;
    raycast(origin: Vec3, direction: Vec3, opts?: any): any;
  };
  Players: {
    all(): PlayerEntity[];
    find(username: string): PlayerEntity | null;
    get(id: string): PlayerEntity | null;
    readonly count: number;
    closest(pos: Vec3, exclude?: any): PlayerEntity | null;
  };
  Lighting: any;
  Assets: { Shared: any; Server: any };
  State: any;
  DataStore: any;
  Gui: any;
  Sound: any;
  Tween: any;
  Camera: any;
  Input: any;
  Physics: any;
  Network: any;
  Tags: any;
  Math: any;
  Timer: any;
  Labels: any;
  Scene: any;
  Debug: any;
  on(event: string, fn: (...args: any[]) => void): () => void;
}

declare const Rebur: ReburAPI;
declare function after(s: number, fn: () => void): () => void;
declare function every(s: number, fn: () => void): () => void;
declare function wait(s: number): Promise<void>;
declare function log(...args: any[]): void;
declare function warn(...args: any[]): void;
declare function error(...args: any[]): void;
declare function Vector3(x?: number, y?: number, z?: number): any;
declare function Color3(r?: number, g?: number, b?: number): string;
`;

export const COMPLETIONS: any[] = [
  { label: "Rebur", kind: 5, detail: "ReburAPI", doc: "The engine global.", insert: "Rebur" },
  { label: "Rebur.on", kind: 1, detail: "Rebur.on(event, fn)", doc: "Subscribe to global events.", insert: "Rebur.on(\"${1:tick}\", (${2:dt}) => {\n\t$0\n})", snippet: true },
  { label: "Rebur.Workspace", kind: 5, detail: "Workspace", doc: "Entity container.", insert: "Rebur.Workspace" },
  { label: "Rebur.Players", kind: 5, detail: "Players", doc: "Player container.", insert: "Rebur.Players" }
];

export function configureMonacoForEngine(editor: any) {
  const monaco = (window as any).monaco;
  if (!monaco) return;

  // Register engine types
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    ENGINE_TYPE_DEFS,
    "ts:rebur-api.d.ts"
  );

  // Set up completion provider
  monaco.languages.registerCompletionItemProvider("javascript", {
    provideCompletionItems: () => ({
      suggestions: COMPLETIONS.map((c) => ({
        ...c,
        kind: c.kind ?? monaco.languages.CompletionItemKind.Property,
        insertText: c.insert,
        insertTextRules: c.snippet
          ? monaco.languages.CompletionItemInsertReason.Snippet
          : undefined,
      })),
    }),
  });
}

export const ENGINE_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  roundedSelection: true,
  scrollBeyondLastLine: false,
  readOnly: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: "on",
  padding: { top: 8, bottom: 8 },
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontLigatures: true,
  cursorBlinking: "smooth",
  smoothScrolling: true,
  contextmenu: true,
};
