/**
 * gltf-loader.ts — Unified model loader supporting GLB/GLTF and FBX.
 *
 * After a model loads, the scene is immediately passed through the Rebur Scene
 * extractor so callers receive structured metadata (hierarchy, materials,
 * bounding info, animation clips) alongside the Three.js scene object.
 *
 * Caching strategy
 * ----------------
 * • GLTFLoader + FBXLoader each keep a per-URL CachedModel map.
 * • The extracted ReburScene is stored in model-extractor's own cache.
 * • Hooks return cached values synchronously on the first render if the URL
 *   was already loaded, so there's no flash of "loading" for hot reloads.
 */

import { useState, useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { Group, AnimationClip } from "three";
import {
  extractReburScene,
  cacheReburScene,
  getCachedReburScene,
} from "./model-extractor";
import type { ReburScene } from "@shared/rebur-scene";

// ─── Loaders (singletons) ─────────────────────────────────────────────────────

const _draco = new DRACOLoader();
_draco.setDecoderPath("/draco/");
_draco.preload();

const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_draco);

const _fbxLoader = new FBXLoader();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedModel {
  scene: Group;
  animations: AnimationClip[];
}

/** @deprecated Use CachedModel */
export type CachedGLTF = CachedModel;

export interface ModelState {
  scene: Group | null;
  animations: AnimationClip[];
  loading: boolean;
  error: string | null;
  /** Structured Rebur Scene extracted from the model — available once loaded. */
  reburScene: ReburScene | null;
}

/** @deprecated Use ModelState */
export type GLTFModelState = ModelState;

// ─── Caches ───────────────────────────────────────────────────────────────────

const _gltfCache = new Map<string, CachedModel>();
const _fbxCache  = new Map<string, CachedModel>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFBX(url: string): boolean {
  return url.toLowerCase().endsWith(".fbx");
}

function fmtFromUrl(url: string): "gltf" | "glb" | "fbx" {
  const u = url.toLowerCase();
  if (u.endsWith(".fbx"))  return "fbx";
  if (u.endsWith(".gltf")) return "gltf";
  return "glb";
}

function initState(url: string | undefined, cache: Map<string, CachedModel>): ModelState {
  if (url && cache.has(url)) {
    const c = cache.get(url)!;
    return {
      scene: c.scene,
      animations: c.animations,
      loading: false,
      error: null,
      reburScene: getCachedReburScene(url),
    };
  }
  return { scene: null, animations: [], loading: !!url, error: null, reburScene: null };
}

// ─── useGLTFModel ─────────────────────────────────────────────────────────────

export function useGLTFModel(url: string | undefined): ModelState {
  const [state, setState] = useState<ModelState>(() => initState(url, _gltfCache));

  useEffect(() => {
    if (!url) {
      setState({ scene: null, animations: [], loading: false, error: null, reburScene: null });
      return;
    }
    if (_gltfCache.has(url)) {
      const c = _gltfCache.get(url)!;
      setState({
        scene: c.scene, animations: c.animations, loading: false, error: null,
        reburScene: getCachedReburScene(url),
      });
      return;
    }

    let cancelled = false;
    setState({ scene: null, animations: [], loading: true, error: null, reburScene: null });

    _gltfLoader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const entry: CachedModel = { scene: gltf.scene, animations: gltf.animations ?? [] };
        _gltfCache.set(url, entry);

        // Extract and cache the Rebur Scene
        const rs = extractReburScene(gltf.scene, fmtFromUrl(url), url, gltf.animations ?? []);
        cacheReburScene(url, rs);

        if (gltf.animations?.length) {
          console.log(`[GLTFLoader] ${url}: ${gltf.animations.length} clip(s)`,
            gltf.animations.map((a) => a.name));
        }
        setState({ scene: entry.scene, animations: entry.animations, loading: false, error: null, reburScene: rs });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GLTFLoader] Failed:", url, msg);
        setState({ scene: null, animations: [], loading: false, error: msg, reburScene: null });
      },
    );

    return () => { cancelled = true; };
  }, [url]);

  return state;
}

// ─── useFBXModel ─────────────────────────────────────────────────────────────

export function useFBXModel(url: string | undefined): ModelState {
  const [state, setState] = useState<ModelState>(() => initState(url, _fbxCache));

  useEffect(() => {
    if (!url) {
      setState({ scene: null, animations: [], loading: false, error: null, reburScene: null });
      return;
    }
    if (_fbxCache.has(url)) {
      const c = _fbxCache.get(url)!;
      setState({
        scene: c.scene, animations: c.animations, loading: false, error: null,
        reburScene: getCachedReburScene(url),
      });
      return;
    }

    let cancelled = false;
    setState({ scene: null, animations: [], loading: true, error: null, reburScene: null });

    _fbxLoader.load(
      url,
      (group: any) => {
        if (cancelled) return;
        const anims: AnimationClip[] = group.animations ?? [];
        const entry: CachedModel = { scene: group as Group, animations: anims };
        _fbxCache.set(url, entry);

        // Extract and cache the Rebur Scene
        const rs = extractReburScene(group as Group, "fbx", url, anims);
        cacheReburScene(url, rs);

        if (anims.length) {
          console.log(`[FBXLoader] ${url}: ${anims.length} clip(s)`, anims.map((a: any) => a.name));
        }
        setState({ scene: entry.scene, animations: anims, loading: false, error: null, reburScene: rs });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[FBXLoader] Failed:", url, msg);
        setState({ scene: null, animations: [], loading: false, error: msg, reburScene: null });
      },
    );

    return () => { cancelled = true; };
  }, [url]);

  return state;
}

// ─── useModelFile — auto-dispatches by extension ──────────────────────────────

export function useModelFile(url: string | undefined): ModelState {
  const fbx  = url ? isFBX(url) : false;
  const gltf = useGLTFModel(fbx ? undefined : url);
  const fbxs = useFBXModel (fbx ? url : undefined);
  return fbx ? fbxs : gltf;
}

// ─── Imperative helpers ───────────────────────────────────────────────────────

export function loadGLTFAsync(url: string): Promise<CachedModel> {
  if (_gltfCache.has(url)) return Promise.resolve(_gltfCache.get(url)!);
  return new Promise((resolve, reject) => {
    _gltfLoader.load(
      url,
      (gltf) => {
        const entry: CachedModel = { scene: gltf.scene, animations: gltf.animations ?? [] };
        _gltfCache.set(url, entry);
        const rs = extractReburScene(gltf.scene, fmtFromUrl(url), url, gltf.animations ?? []);
        cacheReburScene(url, rs);
        resolve(entry);
      },
      undefined,
      reject,
    );
  });
}

export function loadFBXAsync(url: string): Promise<CachedModel> {
  if (_fbxCache.has(url)) return Promise.resolve(_fbxCache.get(url)!);
  return new Promise((resolve, reject) => {
    _fbxLoader.load(
      url,
      (group: any) => {
        const anims: AnimationClip[] = group.animations ?? [];
        const entry: CachedModel = { scene: group as Group, animations: anims };
        _fbxCache.set(url, entry);
        const rs = extractReburScene(group as Group, "fbx", url, anims);
        cacheReburScene(url, rs);
        resolve(entry);
      },
      undefined,
      reject,
    );
  });
}

export function loadModelAsync(url: string): Promise<CachedModel> {
  return isFBX(url) ? loadFBXAsync(url) : loadGLTFAsync(url);
}
