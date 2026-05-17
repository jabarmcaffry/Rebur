/**
 * GUI Manager
 * 
 * Handles both legacy flat GUI elements and new hierarchical object-based GUI.
 * Provides backward compatibility while enabling advanced UI features.
 */

import type { GameAPI } from "../types";
import {
  type AnyGuiObject,
  type GuiObject,
  type TextObject,
  type ButtonObject,
  type FrameObject,
  type ImageObject,
  type ScrollObject,
  type InputObject,
  type GuiAnchor,
  type LayoutMode,
  type GuiSize,
  createText,
  createButton,
  createFrame,
  createImage,
  createScroll,
  createInput,
  createHStack,
  createVStack,
  createGrid,
  parseSize,
  updateAllAnimations,
} from "./gui-elements";

// Re-export types
export type { 
  GuiAnchor, 
  LayoutMode, 
  GuiSize,
  GuiObject,
  TextObject,
  ButtonObject,
  FrameObject,
  ImageObject,
  ScrollObject,
  InputObject,
  AnyGuiObject,
};

// ============================================================================
// Legacy GUI Element (flat, for backward compatibility)
// ============================================================================

export interface GuiElement {
  id: string;
  kind: "text" | "button";
  text: string;
  x: number;
  y: number;
  anchor: GuiAnchor;
  color: string;
  size: number;
  bg?: string;
  onClick?: (game: any) => void;
}

// ============================================================================
// Enhanced GUI API (script-facing)
// ============================================================================

export interface GuiAPI {
  // Legacy API (flat elements)
  text: (id: string, text: string, opts?: Partial<Omit<GuiElement, "id" | "kind" | "text">>) => void;
  button: (id: string, text: string, opts: Partial<Omit<GuiElement, "id" | "kind" | "text">> | undefined, onClick?: (game: GameAPI) => void) => void;
  clear: (id?: string) => void;
  
  // Object-Based API (hierarchical)
  frame: (id: string, opts?: FrameOptions) => FrameObject;
  label: (id: string, text: string, opts?: TextOptions) => TextObject;
  btn: (id: string, text: string, opts?: ButtonOptions) => ButtonObject;
  image: (id: string, src: string, opts?: ImageOptions) => ImageObject;
  scroll: (id: string, opts?: ScrollOptions) => ScrollObject;
  input: (id: string, opts?: InputOptions) => InputObject;
  
  // Layout Helpers
  hstack: (id: string, opts?: LayoutOptions) => FrameObject;
  vstack: (id: string, opts?: LayoutOptions) => FrameObject;
  grid: (id: string, columns: number, opts?: LayoutOptions) => FrameObject;
  
  // Hierarchy
  root: GuiObject;
  find: (name: string) => GuiObject | null;
  destroy: (idOrObj: string | GuiObject) => void;
}

// ============================================================================
// Option Types for Object-Based API
// ============================================================================

type FrameOptions = Partial<Omit<FrameObject, "id" | "kind" | "children" | "parent">>;
type TextOptions = Partial<Omit<TextObject, "id" | "kind" | "text" | "children" | "parent">>;
type ButtonOptions = Partial<Omit<ButtonObject, "id" | "kind" | "text" | "children" | "parent">>;
type ImageOptions = Partial<Omit<ImageObject, "id" | "kind" | "src" | "children" | "parent">>;
type ScrollOptions = Partial<Omit<ScrollObject, "id" | "kind" | "children" | "parent">>;
type InputOptions = Partial<Omit<InputObject, "id" | "kind" | "children" | "parent">>;
type LayoutOptions = Partial<Omit<FrameObject, "id" | "kind" | "layoutMode" | "children" | "parent">>;

// ============================================================================
// GUI Manager
// ============================================================================

/**
 * Create GUI manager
 */
export function createGuiManager() {
  // Legacy flat elements
  const elements = new Map<string, GuiElement>();
  
  // Object-based elements
  const objects = new Map<string, AnyGuiObject>();
  
  // Root object (invisible container at screen level)
  const root = createFrame("__root__", {
    visible: true,
    backgroundColor: null,
    width: parseSize("fill"),
    height: parseSize("fill"),
  });
  objects.set(root.id, root);
  
  let version = 0;

  const manager = {
    /**
     * Get all legacy GUI elements
     */
    get elements(): Map<string, GuiElement> {
      return elements;
    },

    /**
     * Get all object-based GUI elements
     */
    get objects(): Map<string, AnyGuiObject> {
      return objects;
    },

    /**
     * Get the root GUI object
     */
    get root(): GuiObject {
      return root;
    },

    /**
     * Get version for change detection
     */
    get version(): number {
      return version;
    },

    // ========================================================================
    // Legacy API
    // ========================================================================

    /**
     * Create or update a text element (legacy)
     */
    text(id: string, text: string, opts?: Partial<Omit<GuiElement, "id" | "kind" | "text">>): void {
      const prev = elements.get(id);
      const el: GuiElement = {
        id,
        kind: "text",
        text,
        x: opts?.x ?? prev?.x ?? 0,
        y: opts?.y ?? prev?.y ?? 0,
        anchor: opts?.anchor ?? prev?.anchor ?? "tl",
        color: opts?.color ?? prev?.color ?? "#ffffff",
        size: opts?.size ?? prev?.size ?? 16,
        bg: opts?.bg ?? prev?.bg,
      };
      elements.set(id, el);
      version++;
    },

    /**
     * Create or update a button element (legacy)
     */
    button(
      id: string, 
      text: string, 
      opts: Partial<Omit<GuiElement, "id" | "kind" | "text">> | undefined, 
      onClick?: (game: GameAPI) => void
    ): void {
      const prev = elements.get(id);
      const el: GuiElement = {
        id,
        kind: "button",
        text,
        x: opts?.x ?? prev?.x ?? 16,
        y: opts?.y ?? prev?.y ?? 16,
        anchor: opts?.anchor ?? prev?.anchor ?? "tl",
        color: opts?.color ?? prev?.color ?? "#ffffff",
        size: opts?.size ?? prev?.size ?? 14,
        bg: opts?.bg ?? prev?.bg ?? "rgba(30,40,60,0.85)",
        onClick: onClick ?? prev?.onClick,
      };
      elements.set(id, el);
      version++;
    },

    /**
     * Clear one or all GUI elements (both legacy and object-based)
     */
    clear(id?: string): void {
      if (id == null) {
        elements.clear();
        // Clear all children from root but keep root
        for (const child of [...root.children]) {
          child.destroy();
        }
        objects.clear();
        objects.set(root.id, root);
      } else {
        elements.delete(id);
        const obj = objects.get(id);
        if (obj && obj !== root) {
          obj.destroy();
          objects.delete(id);
        }
      }
      version++;
    },

    /**
     * Get legacy element by ID
     */
    get(id: string): GuiElement | undefined {
      return elements.get(id);
    },

    // ========================================================================
    // Object-Based API
    // ========================================================================

    /**
     * Create a frame (container)
     */
    frame(id: string, opts: FrameOptions = {}): FrameObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "frame") {
        Object.assign(existing, opts);
        version++;
        return existing as FrameObject;
      }
      
      const obj = createFrame(id, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a text label
     */
    label(id: string, text: string, opts: TextOptions = {}): TextObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "text") {
        (existing as TextObject).text = text;
        Object.assign(existing, opts);
        version++;
        return existing as TextObject;
      }
      
      const obj = createText(id, text, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a button
     */
    btn(id: string, text: string, opts: ButtonOptions = {}): ButtonObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "button") {
        (existing as ButtonObject).text = text;
        Object.assign(existing, opts);
        version++;
        return existing as ButtonObject;
      }
      
      const obj = createButton(id, text, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create an image
     */
    image(id: string, src: string, opts: ImageOptions = {}): ImageObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "image") {
        (existing as ImageObject).src = src;
        Object.assign(existing, opts);
        version++;
        return existing as ImageObject;
      }
      
      const obj = createImage(id, src, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a scroll container
     */
    scroll(id: string, opts: ScrollOptions = {}): ScrollObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "scroll") {
        Object.assign(existing, opts);
        version++;
        return existing as ScrollObject;
      }
      
      const obj = createScroll(id, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a text input
     */
    input(id: string, opts: InputOptions = {}): InputObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "input") {
        Object.assign(existing, opts);
        version++;
        return existing as InputObject;
      }
      
      const obj = createInput(id, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a horizontal stack layout
     */
    hstack(id: string, opts: LayoutOptions = {}): FrameObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "frame") {
        (existing as FrameObject).layoutMode = "horizontal";
        Object.assign(existing, opts);
        version++;
        return existing as FrameObject;
      }
      
      const obj = createHStack(id, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a vertical stack layout
     */
    vstack(id: string, opts: LayoutOptions = {}): FrameObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "frame") {
        (existing as FrameObject).layoutMode = "vertical";
        Object.assign(existing, opts);
        version++;
        return existing as FrameObject;
      }
      
      const obj = createVStack(id, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Create a grid layout
     */
    grid(id: string, columns: number, opts: LayoutOptions = {}): FrameObject {
      const existing = objects.get(id);
      if (existing && existing.kind === "frame") {
        const frame = existing as FrameObject;
        frame.layoutMode = "grid";
        frame.gridColumns = columns;
        Object.assign(existing, opts);
        version++;
        return frame;
      }
      
      const obj = createGrid(id, columns, opts);
      objects.set(id, obj);
      root.addChild(obj);
      version++;
      return obj;
    },

    /**
     * Find an object by name (searches entire tree)
     */
    find(name: string): GuiObject | null {
      const direct = objects.get(name);
      if (direct) return direct;
      return root.findDescendant(name);
    },

    /**
     * Destroy an object by ID or reference
     */
    destroy(idOrObj: string | GuiObject): void {
      const obj = typeof idOrObj === "string" ? objects.get(idOrObj) : idOrObj;
      if (obj && obj !== root) {
        obj.destroy();
        objects.delete(obj.id);
        version++;
      }
    },

    /**
     * Update animations on all objects
     */
    update(): void {
      updateAllAnimations(root);
    },

    /**
     * Create the script-facing API
     */
    createAPI(): GuiAPI {
      return {
        // Legacy
        text: (id, text, opts) => manager.text(id, text, opts),
        button: (id, text, opts, onClick) => manager.button(id, text, opts, onClick),
        clear: (id) => manager.clear(id),
        
        // Object-based
        frame: (id, opts) => manager.frame(id, opts),
        label: (id, text, opts) => manager.label(id, text, opts),
        btn: (id, text, opts) => manager.btn(id, text, opts),
        image: (id, src, opts) => manager.image(id, src, opts),
        scroll: (id, opts) => manager.scroll(id, opts),
        input: (id, opts) => manager.input(id, opts),
        
        // Layout
        hstack: (id, opts) => manager.hstack(id, opts),
        vstack: (id, opts) => manager.vstack(id, opts),
        grid: (id, columns, opts) => manager.grid(id, columns, opts),
        
        // Hierarchy
        root: root,
        find: (name) => manager.find(name),
        destroy: (idOrObj) => manager.destroy(idOrObj),
      };
    },

    /**
     * Invoke click handler for a button element (legacy or object-based)
     * @param id - Element ID
     * @param buildApi - Function to build the GameAPI for the callback
     * @param pushLog - Function to log errors
     */
    invokeGuiClick(
      id: string,
      buildApi: () => GameAPI,
      pushLog: (line: string) => void
    ): void {
      // Check legacy elements first
      const el = elements.get(id);
      if (el?.onClick) {
        try {
          el.onClick(buildApi());
        } catch (e: any) {
          pushLog(`gui[${id}] onClick error: ${e.message ?? e}`);
        }
        return;
      }
      
      // Check object-based buttons
      const obj = objects.get(id);
      if (obj?.kind === "button" && (obj as ButtonObject).onClick) {
        try {
          (obj as ButtonObject).onClick!(buildApi());
        } catch (e: any) {
          pushLog(`gui[${id}] onClick error: ${e.message ?? e}`);
        }
      }
    },

    /**
     * Handle input submission
     */
    invokeInputSubmit(
      id: string,
      value: string,
      buildApi: () => GameAPI,
      pushLog: (line: string) => void
    ): void {
      const obj = objects.get(id);
      if (obj?.kind === "input" && (obj as InputObject).onSubmit) {
        try {
          (obj as InputObject).onSubmit!(value, buildApi());
        } catch (e: any) {
          pushLog(`gui[${id}] onSubmit error: ${e.message ?? e}`);
        }
      }
    },

    /**
     * Handle input change
     */
    invokeInputChange(
      id: string,
      value: string,
      buildApi: () => GameAPI,
      pushLog: (line: string) => void
    ): void {
      const obj = objects.get(id);
      if (obj?.kind === "input") {
        (obj as InputObject).value = value;
        if ((obj as InputObject).onChange) {
          try {
            (obj as InputObject).onChange!(value, buildApi());
          } catch (e: any) {
            pushLog(`gui[${id}] onChange error: ${e.message ?? e}`);
          }
        }
      }
    },

    /**
     * Handle drag start
     */
    startDrag(id: string, mouseX: number, mouseY: number): boolean {
      const obj = objects.get(id);
      if (obj?.draggable) {
        obj._isDragging = true;
        obj._dragOffset = { x: mouseX - obj.x, y: mouseY - obj.y };
        obj.emit("dragStart", mouseX, mouseY);
        return true;
      }
      return false;
    },

    /**
     * Handle drag move
     */
    updateDrag(id: string, mouseX: number, mouseY: number): void {
      const obj = objects.get(id);
      if (obj?._isDragging) {
        let newX = mouseX - obj._dragOffset.x;
        let newY = mouseY - obj._dragOffset.y;
        
        // Apply bounds
        if (obj.dragBounds) {
          newX = Math.max(obj.dragBounds.minX, Math.min(obj.dragBounds.maxX, newX));
          newY = Math.max(obj.dragBounds.minY, Math.min(obj.dragBounds.maxY, newY));
        }
        
        obj.x = newX;
        obj.y = newY;
        obj.emit("drag", newX, newY);
        version++;
      }
    },

    /**
     * Handle drag end
     */
    endDrag(id: string): void {
      const obj = objects.get(id);
      if (obj?._isDragging) {
        obj._isDragging = false;
        obj.emit("dragEnd", obj.x, obj.y);
      }
    },

    /**
     * Get currently dragging element
     */
    getDragging(): GuiObject | null {
      for (const obj of objects.values()) {
        if (obj._isDragging) return obj;
      }
      return null;
    },
  };

  return manager;
}

export type GuiManager = ReturnType<typeof createGuiManager>;
