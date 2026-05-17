/**
 * Object-Based GUI System
 * 
 * Hierarchical UI components with nesting, layouts, animations, and dragging.
 * Designed for game creators who need advanced UI capabilities.
 * 
 * Usage:
 *   const frame = gui.frame("main", { width: 300, height: 200 });
 *   const button = gui.button("btn", "Click Me", { onClick: () => log("clicked") });
 *   frame.addChild(button);
 */

import type { GameAPI } from "../types";

// ============================================================================
// Types
// ============================================================================

export type GuiAnchor = "tl" | "tc" | "tr" | "cl" | "cc" | "cr" | "bl" | "bc" | "br";

export type GuiElementKind = 
  | "text" 
  | "button" 
  | "frame" 
  | "image" 
  | "scroll" 
  | "input";

export type LayoutMode = "none" | "horizontal" | "vertical" | "grid";

export type SizeMode = "fixed" | "fill" | "fit" | "percent";

export interface GuiSize {
  mode: SizeMode;
  value: number;
}

export interface GuiPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GuiAnimation {
  property: string;
  from: number;
  to: number;
  duration: number;
  easing: string;
  loop: boolean;
  yoyo: boolean;
}

// ============================================================================
// Base GUI Object
// ============================================================================

export interface GuiObject {
  // Identity
  readonly id: string;
  readonly kind: GuiElementKind;
  name: string;
  
  // Hierarchy
  parent: GuiObject | null;
  readonly children: GuiObject[];
  
  // Position & Size
  x: number;
  y: number;
  width: GuiSize;
  height: GuiSize;
  anchor: GuiAnchor;
  rotation: number;
  
  // Appearance
  visible: boolean;
  transparency: number;
  backgroundColor: string | null;
  borderColor: string | null;
  borderWidth: number;
  borderRadius: number;
  zIndex: number;
  
  // Layout
  layoutMode: LayoutMode;
  layoutGap: number;
  layoutPadding: GuiPadding;
  layoutAlign: "start" | "center" | "end" | "stretch";
  layoutJustify: "start" | "center" | "end" | "between" | "around";
  gridColumns: number;
  
  // Interaction
  draggable: boolean;
  dragBounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
  clipsChildren: boolean;
  
  // State
  _isDragging: boolean;
  _dragOffset: { x: number; y: number };
  _computedX: number;
  _computedY: number;
  _computedWidth: number;
  _computedHeight: number;
  _animations: Map<string, GuiAnimation & { startTime: number; currentValue: number }>;
  
  // Methods
  addChild: (child: GuiObject) => void;
  removeChild: (child: GuiObject) => void;
  findChild: (name: string) => GuiObject | null;
  findDescendant: (name: string) => GuiObject | null;
  destroy: () => void;
  setSize: (width: number | string, height: number | string) => void;
  animate: (property: string, to: number, duration: number, opts?: { easing?: string; loop?: boolean; yoyo?: boolean }) => void;
  stopAnimation: (property?: string) => void;
  
  // Events
  _eventHandlers: Map<string, Set<(...args: any[]) => void>>;
  on: (event: string, handler: (...args: any[]) => void) => () => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
}

// ============================================================================
// Text Element
// ============================================================================

export interface TextObject extends GuiObject {
  kind: "text";
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number | string;
  textAlign: "left" | "center" | "right";
  textWrap: boolean;
  textShadow: string | null;
}

// ============================================================================
// Button Element
// ============================================================================

export interface ButtonObject extends GuiObject {
  kind: "button";
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number | string;
  disabled: boolean;
  hoverColor: string | null;
  pressedColor: string | null;
  onClick: ((game: GameAPI) => void) | null;
}

// ============================================================================
// Frame Element (Container)
// ============================================================================

export interface FrameObject extends GuiObject {
  kind: "frame";
}

// ============================================================================
// Image Element
// ============================================================================

export interface ImageObject extends GuiObject {
  kind: "image";
  src: string;
  fit: "contain" | "cover" | "fill" | "none";
}

// ============================================================================
// Scroll Container
// ============================================================================

export interface ScrollObject extends GuiObject {
  kind: "scroll";
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  showScrollbarX: boolean;
  showScrollbarY: boolean;
}

// ============================================================================
// Input Element
// ============================================================================

export interface InputObject extends GuiObject {
  kind: "input";
  value: string;
  placeholder: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  maxLength: number;
  inputType: "text" | "number" | "password";
  onSubmit: ((value: string, game: GameAPI) => void) | null;
  onChange: ((value: string, game: GameAPI) => void) | null;
}

// ============================================================================
// Union Type
// ============================================================================

export type AnyGuiObject = 
  | TextObject 
  | ButtonObject 
  | FrameObject 
  | ImageObject 
  | ScrollObject 
  | InputObject;

// ============================================================================
// Size Helpers
// ============================================================================

export function parseSize(value: number | string): GuiSize {
  if (typeof value === "number") {
    return { mode: "fixed", value };
  }
  
  if (value.endsWith("%")) {
    return { mode: "percent", value: parseFloat(value) / 100 };
  }
  
  if (value === "fill") {
    return { mode: "fill", value: 1 };
  }
  
  if (value === "fit") {
    return { mode: "fit", value: 0 };
  }
  
  return { mode: "fixed", value: parseFloat(value) || 0 };
}

export function defaultPadding(): GuiPadding {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export function defaultSize(): GuiSize {
  return { mode: "fixed", value: 100 };
}

// ============================================================================
// GUI Object Factory
// ============================================================================

let nextId = 1;

function generateId(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

function createBaseObject(id: string, kind: GuiElementKind): GuiObject {
  const eventHandlers = new Map<string, Set<(...args: any[]) => void>>();
  const children: GuiObject[] = [];
  const animations = new Map<string, GuiAnimation & { startTime: number; currentValue: number }>();
  
  const obj: GuiObject = {
    id,
    kind,
    name: id,
    parent: null,
    get children() { return children; },
    
    x: 0,
    y: 0,
    width: defaultSize(),
    height: defaultSize(),
    anchor: "tl",
    rotation: 0,
    
    visible: true,
    transparency: 0,
    backgroundColor: null,
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    zIndex: 0,
    
    layoutMode: "none",
    layoutGap: 0,
    layoutPadding: defaultPadding(),
    layoutAlign: "start",
    layoutJustify: "start",
    gridColumns: 2,
    
    draggable: false,
    dragBounds: null,
    clipsChildren: false,
    
    _isDragging: false,
    _dragOffset: { x: 0, y: 0 },
    _computedX: 0,
    _computedY: 0,
    _computedWidth: 100,
    _computedHeight: 100,
    _animations: animations,
    _eventHandlers: eventHandlers,
    
    addChild(child: GuiObject) {
      if (child.parent) {
        child.parent.removeChild(child);
      }
      child.parent = obj;
      children.push(child);
      obj.emit("childAdded", child);
    },
    
    removeChild(child: GuiObject) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parent = null;
        obj.emit("childRemoved", child);
      }
    },
    
    findChild(name: string) {
      return children.find(c => c.name === name) ?? null;
    },
    
    findDescendant(name: string): GuiObject | null {
      for (const child of children) {
        if (child.name === name) return child;
        const found = child.findDescendant(name);
        if (found) return found;
      }
      return null;
    },
    
    destroy() {
      if (obj.parent) {
        obj.parent.removeChild(obj);
      }
      for (const child of [...children]) {
        child.destroy();
      }
      eventHandlers.clear();
      animations.clear();
      obj.emit("destroyed");
    },
    
    setSize(width: number | string, height: number | string) {
      obj.width = parseSize(width);
      obj.height = parseSize(height);
    },
    
    animate(property: string, to: number, duration: number, opts: { easing?: string; loop?: boolean; yoyo?: boolean } = {}) {
      const from = (obj as any)[property] ?? 0;
      animations.set(property, {
        property,
        from,
        to,
        duration: duration * 1000, // Convert to ms
        easing: opts.easing ?? "easeInOut",
        loop: opts.loop ?? false,
        yoyo: opts.yoyo ?? false,
        startTime: Date.now(),
        currentValue: from,
      });
    },
    
    stopAnimation(property?: string) {
      if (property) {
        animations.delete(property);
      } else {
        animations.clear();
      }
    },
    
    on(event: string, handler: (...args: any[]) => void) {
      let handlers = eventHandlers.get(event);
      if (!handlers) {
        handlers = new Set();
        eventHandlers.set(event, handlers);
      }
      handlers.add(handler);
      return () => handlers!.delete(handler);
    },
    
    off(event: string, handler: (...args: any[]) => void) {
      eventHandlers.get(event)?.delete(handler);
    },
    
    emit(event: string, ...args: any[]) {
      eventHandlers.get(event)?.forEach(h => h(...args));
    },
  };
  
  return obj;
}

// ============================================================================
// Element Creators
// ============================================================================

export function createText(
  id: string,
  text: string,
  opts: Partial<Omit<TextObject, "id" | "kind" | "text">> = {}
): TextObject {
  const base = createBaseObject(id, "text") as TextObject;
  
  return Object.assign(base, {
    text,
    color: opts.color ?? "#ffffff",
    fontSize: opts.fontSize ?? 16,
    fontFamily: opts.fontFamily ?? "Inter, system-ui, sans-serif",
    fontWeight: opts.fontWeight ?? 400,
    textAlign: opts.textAlign ?? "left",
    textWrap: opts.textWrap ?? false,
    textShadow: opts.textShadow ?? "0 1px 2px rgba(0,0,0,0.5)",
    ...opts,
  });
}

export function createButton(
  id: string,
  text: string,
  opts: Partial<Omit<ButtonObject, "id" | "kind" | "text">> = {}
): ButtonObject {
  const base = createBaseObject(id, "button") as ButtonObject;
  
  return Object.assign(base, {
    text,
    color: opts.color ?? "#ffffff",
    fontSize: opts.fontSize ?? 14,
    fontFamily: opts.fontFamily ?? "Inter, system-ui, sans-serif",
    fontWeight: opts.fontWeight ?? 600,
    disabled: opts.disabled ?? false,
    hoverColor: opts.hoverColor ?? null,
    pressedColor: opts.pressedColor ?? null,
    backgroundColor: opts.backgroundColor ?? "rgba(30,40,60,0.85)",
    borderRadius: opts.borderRadius ?? 6,
    onClick: opts.onClick ?? null,
    width: opts.width ?? parseSize("fit"),
    height: opts.height ?? parseSize("fit"),
    ...opts,
  });
}

export function createFrame(
  id: string,
  opts: Partial<Omit<FrameObject, "id" | "kind">> = {}
): FrameObject {
  const base = createBaseObject(id, "frame") as FrameObject;
  
  return Object.assign(base, {
    backgroundColor: opts.backgroundColor ?? null,
    width: opts.width ?? parseSize(200),
    height: opts.height ?? parseSize(150),
    ...opts,
  });
}

export function createImage(
  id: string,
  src: string,
  opts: Partial<Omit<ImageObject, "id" | "kind" | "src">> = {}
): ImageObject {
  const base = createBaseObject(id, "image") as ImageObject;
  
  return Object.assign(base, {
    src,
    fit: opts.fit ?? "contain",
    width: opts.width ?? parseSize(100),
    height: opts.height ?? parseSize(100),
    ...opts,
  });
}

export function createScroll(
  id: string,
  opts: Partial<Omit<ScrollObject, "id" | "kind">> = {}
): ScrollObject {
  const base = createBaseObject(id, "scroll") as ScrollObject;
  
  return Object.assign(base, {
    scrollX: 0,
    scrollY: 0,
    contentWidth: opts.contentWidth ?? 0,
    contentHeight: opts.contentHeight ?? 0,
    showScrollbarX: opts.showScrollbarX ?? false,
    showScrollbarY: opts.showScrollbarY ?? true,
    clipsChildren: true,
    width: opts.width ?? parseSize(200),
    height: opts.height ?? parseSize(300),
    ...opts,
  });
}

export function createInput(
  id: string,
  opts: Partial<Omit<InputObject, "id" | "kind">> = {}
): InputObject {
  const base = createBaseObject(id, "input") as InputObject;
  
  return Object.assign(base, {
    value: opts.value ?? "",
    placeholder: opts.placeholder ?? "",
    color: opts.color ?? "#ffffff",
    fontSize: opts.fontSize ?? 14,
    fontFamily: opts.fontFamily ?? "Inter, system-ui, sans-serif",
    maxLength: opts.maxLength ?? 256,
    inputType: opts.inputType ?? "text",
    backgroundColor: opts.backgroundColor ?? "rgba(0,0,0,0.4)",
    borderColor: opts.borderColor ?? "rgba(255,255,255,0.2)",
    borderWidth: opts.borderWidth ?? 1,
    borderRadius: opts.borderRadius ?? 4,
    width: opts.width ?? parseSize(200),
    height: opts.height ?? parseSize(32),
    onSubmit: opts.onSubmit ?? null,
    onChange: opts.onChange ?? null,
    ...opts,
  });
}

// ============================================================================
// Layout Helpers
// ============================================================================

export function createHStack(
  id: string,
  opts: Partial<Omit<FrameObject, "id" | "kind" | "layoutMode">> = {}
): FrameObject {
  const frame = createFrame(id, opts);
  frame.layoutMode = "horizontal";
  frame.layoutGap = opts.layoutGap ?? 8;
  frame.layoutAlign = opts.layoutAlign ?? "center";
  return frame;
}

export function createVStack(
  id: string,
  opts: Partial<Omit<FrameObject, "id" | "kind" | "layoutMode">> = {}
): FrameObject {
  const frame = createFrame(id, opts);
  frame.layoutMode = "vertical";
  frame.layoutGap = opts.layoutGap ?? 8;
  frame.layoutAlign = opts.layoutAlign ?? "start";
  return frame;
}

export function createGrid(
  id: string,
  columns: number,
  opts: Partial<Omit<FrameObject, "id" | "kind" | "layoutMode" | "gridColumns">> = {}
): FrameObject {
  const frame = createFrame(id, opts);
  frame.layoutMode = "grid";
  frame.gridColumns = columns;
  frame.layoutGap = opts.layoutGap ?? 8;
  return frame;
}

// ============================================================================
// Animation Easing Functions
// ============================================================================

export const Easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  bounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  elastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3));
  },
};

/**
 * Update animations on a GUI object
 */
export function updateAnimations(obj: GuiObject): void {
  const now = Date.now();
  
  for (const [property, anim] of obj._animations) {
    const elapsed = now - anim.startTime;
    let t = Math.min(1, elapsed / anim.duration);
    
    // Apply easing
    const easingFn = Easing[anim.easing as keyof typeof Easing] ?? Easing.linear;
    const easedT = easingFn(t);
    
    // Calculate value
    let value = anim.from + (anim.to - anim.from) * easedT;
    
    // Handle yoyo
    if (anim.yoyo && t >= 1) {
      const temp = anim.from;
      anim.from = anim.to;
      anim.to = temp;
      anim.startTime = now;
    }
    
    // Handle loop
    if (anim.loop && t >= 1 && !anim.yoyo) {
      anim.startTime = now;
    }
    
    // Apply value
    (obj as any)[property] = value;
    anim.currentValue = value;
    
    // Remove completed non-looping animations
    if (t >= 1 && !anim.loop && !anim.yoyo) {
      obj._animations.delete(property);
    }
  }
}

/**
 * Recursively update all animations in a tree
 */
export function updateAllAnimations(root: GuiObject): void {
  updateAnimations(root);
  for (const child of root.children) {
    updateAllAnimations(child);
  }
}
