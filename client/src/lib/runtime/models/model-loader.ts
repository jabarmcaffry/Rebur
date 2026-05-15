/**
 * 3D Model Loader
 * 
 * Handles loading, caching, and management of GLTF/GLB 3D models.
 * Provides a registry for models used in the game engine.
 */

// ============================================================================
// Types
// ============================================================================

export interface ModelMetadata {
  /** Unique model identifier */
  id: string;
  /** Display name */
  name: string;
  /** URL to the model file (GLTF or GLB) */
  url: string;
  /** File format */
  format: "gltf" | "glb";
  /** Load status */
  status: "pending" | "loading" | "loaded" | "error";
  /** Error message if loading failed */
  error?: string;
  /** Bounding box dimensions (calculated after load) */
  bounds?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
  };
  /** Animation names available in the model */
  animations: string[];
  /** Scene count */
  sceneCount: number;
  /** Mesh count */
  meshCount: number;
  /** Material count */
  materialCount: number;
  /** Timestamp when loaded */
  loadedAt?: number;
  /** File size in bytes */
  fileSize?: number;
}

export interface ModelInstance {
  /** Instance ID */
  id: string;
  /** Reference to the model metadata */
  modelId: string;
  /** Currently playing animation */
  currentAnimation: string | null;
  /** Animation playback speed */
  animationSpeed: number;
  /** Is animation looping */
  animationLoop: boolean;
  /** Animation time position */
  animationTime: number;
  /** Custom properties */
  userData: Record<string, any>;
}

export interface ModelLoadOptions {
  /** Override model name */
  name?: string;
  /** Preload animations */
  preloadAnimations?: boolean;
  /** Custom base path for resolving relative URLs */
  basePath?: string;
}

// ============================================================================
// Model Registry
// ============================================================================

export class ModelRegistry {
  private models = new Map<string, ModelMetadata>();
  private loadPromises = new Map<string, Promise<ModelMetadata>>();
  private instances = new Map<string, ModelInstance>();
  private onLoadCallbacks = new Map<string, Set<(model: ModelMetadata) => void>>();
  private nextInstanceId = 1;

  /**
   * Register a model URL for lazy loading
   */
  register(id: string, url: string, opts: ModelLoadOptions = {}): ModelMetadata {
    const format = url.toLowerCase().endsWith(".glb") ? "glb" : "gltf";
    
    const metadata: ModelMetadata = {
      id,
      name: opts.name ?? id,
      url,
      format,
      status: "pending",
      animations: [],
      sceneCount: 0,
      meshCount: 0,
      materialCount: 0,
    };
    
    this.models.set(id, metadata);
    return metadata;
  }

  /**
   * Check if a model is registered
   */
  has(id: string): boolean {
    return this.models.has(id);
  }

  /**
   * Get model metadata
   */
  get(id: string): ModelMetadata | undefined {
    return this.models.get(id);
  }

  /**
   * Get all registered models
   */
  getAll(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  /**
   * Load a model (returns cached if already loaded)
   */
  async load(id: string): Promise<ModelMetadata> {
    const metadata = this.models.get(id);
    if (!metadata) {
      throw new Error(`Model "${id}" not registered`);
    }
    
    if (metadata.status === "loaded") {
      return metadata;
    }
    
    // Return existing load promise if loading
    const existing = this.loadPromises.get(id);
    if (existing) {
      return existing;
    }
    
    // Start loading
    const promise = this.loadModel(metadata);
    this.loadPromises.set(id, promise);
    
    try {
      const result = await promise;
      this.loadPromises.delete(id);
      return result;
    } catch (error) {
      this.loadPromises.delete(id);
      throw error;
    }
  }

  /**
   * Load model implementation
   */
  private async loadModel(metadata: ModelMetadata): Promise<ModelMetadata> {
    metadata.status = "loading";
    
    try {
      // Fetch model to validate URL and get size
      const response = await fetch(metadata.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      metadata.fileSize = blob.size;
      
      // For now, we just validate the fetch works
      // The actual Three.js loading happens in the render component
      // This is because Three.js GLTFLoader needs to be in a React context
      
      metadata.status = "loaded";
      metadata.loadedAt = Date.now();
      
      // Notify callbacks
      const callbacks = this.onLoadCallbacks.get(metadata.id);
      if (callbacks) {
        callbacks.forEach(cb => cb(metadata));
        this.onLoadCallbacks.delete(metadata.id);
      }
      
      return metadata;
    } catch (error: any) {
      metadata.status = "error";
      metadata.error = error.message ?? String(error);
      throw error;
    }
  }

  /**
   * Register a callback for when a model loads
   */
  onLoad(id: string, callback: (model: ModelMetadata) => void): () => void {
    const metadata = this.models.get(id);
    if (metadata?.status === "loaded") {
      callback(metadata);
      return () => {};
    }
    
    let callbacks = this.onLoadCallbacks.get(id);
    if (!callbacks) {
      callbacks = new Set();
      this.onLoadCallbacks.set(id, callbacks);
    }
    callbacks.add(callback);
    
    return () => callbacks!.delete(callback);
  }

  /**
   * Preload multiple models
   */
  async preload(ids: string[]): Promise<ModelMetadata[]> {
    return Promise.all(ids.map(id => this.load(id)));
  }

  /**
   * Create a model instance
   */
  createInstance(modelId: string): ModelInstance {
    const metadata = this.models.get(modelId);
    if (!metadata) {
      throw new Error(`Model "${modelId}" not registered`);
    }
    
    const instance: ModelInstance = {
      id: `instance_${this.nextInstanceId++}`,
      modelId,
      currentAnimation: null,
      animationSpeed: 1,
      animationLoop: true,
      animationTime: 0,
      userData: {},
    };
    
    this.instances.set(instance.id, instance);
    return instance;
  }

  /**
   * Get a model instance
   */
  getInstance(instanceId: string): ModelInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Remove a model instance
   */
  removeInstance(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  /**
   * Update model metadata after Three.js loads it
   */
  updateMetadata(id: string, updates: Partial<ModelMetadata>): void {
    const metadata = this.models.get(id);
    if (metadata) {
      Object.assign(metadata, updates);
    }
  }

  /**
   * Unregister a model and its instances
   */
  unregister(id: string): void {
    this.models.delete(id);
    this.loadPromises.delete(id);
    this.onLoadCallbacks.delete(id);
    
    // Remove all instances of this model
    for (const [instanceId, instance] of this.instances) {
      if (instance.modelId === id) {
        this.instances.delete(instanceId);
      }
    }
  }

  /**
   * Clear all models and instances
   */
  clear(): void {
    this.models.clear();
    this.loadPromises.clear();
    this.instances.clear();
    this.onLoadCallbacks.clear();
  }

  /**
   * Get loading statistics
   */
  getStats(): {
    total: number;
    loaded: number;
    loading: number;
    pending: number;
    error: number;
    instances: number;
  } {
    let loaded = 0, loading = 0, pending = 0, error = 0;
    
    for (const model of this.models.values()) {
      switch (model.status) {
        case "loaded": loaded++; break;
        case "loading": loading++; break;
        case "pending": pending++; break;
        case "error": error++; break;
      }
    }
    
    return {
      total: this.models.size,
      loaded,
      loading,
      pending,
      error,
      instances: this.instances.size,
    };
  }
}

// ============================================================================
// Default Model Registry
// ============================================================================

export const defaultModelRegistry = new ModelRegistry();

// ============================================================================
// API Builder Helper
// ============================================================================

export interface ModelAPI {
  /** Register a model for loading */
  register: (id: string, url: string, opts?: ModelLoadOptions) => ModelMetadata;
  /** Load a registered model */
  load: (id: string) => Promise<ModelMetadata>;
  /** Preload multiple models */
  preload: (ids: string[]) => Promise<ModelMetadata[]>;
  /** Get model metadata */
  get: (id: string) => ModelMetadata | undefined;
  /** Check if model exists */
  has: (id: string) => boolean;
  /** Get all models */
  all: () => ModelMetadata[];
  /** Get loading stats */
  stats: () => ReturnType<ModelRegistry["getStats"]>;
}

/**
 * Create a model API for scripts
 */
export function createModelAPI(registry: ModelRegistry = defaultModelRegistry): ModelAPI {
  return {
    register: (id, url, opts) => registry.register(id, url, opts),
    load: (id) => registry.load(id),
    preload: (ids) => registry.preload(ids),
    get: (id) => registry.get(id),
    has: (id) => registry.has(id),
    all: () => registry.getAll(),
    stats: () => registry.getStats(),
  };
}

// ============================================================================
// Common Model URLs (examples)
// ============================================================================

export const CommonModels = {
  // Placeholder URLs - users would replace with real model URLs
  character: "/models/character.glb",
  tree: "/models/tree.glb",
  rock: "/models/rock.glb",
  crate: "/models/crate.glb",
  coin: "/models/coin.glb",
  sword: "/models/sword.glb",
  shield: "/models/shield.glb",
} as const;

// ============================================================================
// Model Type Extension for RuntimeObject
// ============================================================================

export interface ModelObjectExtension {
  /** Model ID (references ModelRegistry) */
  modelId: string | null;
  /** Model URL (for inline loading) */
  modelUrl: string | null;
  /** Model instance ID */
  modelInstanceId: string | null;
  /** Current animation */
  animation: string | null;
  /** Animation speed multiplier */
  animationSpeed: number;
  /** Loop animation */
  animationLoop: boolean;
}

export const DEFAULT_MODEL_EXTENSION: ModelObjectExtension = {
  modelId: null,
  modelUrl: null,
  modelInstanceId: null,
  animation: null,
  animationSpeed: 1,
  animationLoop: true,
};
