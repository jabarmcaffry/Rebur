/**
 * gltf-loader.ts — Unified model loader supporting GLB/GLTF and FBX.
 *
 * Uses a singleton GLTFLoader (with DRACO) for .glb/.gltf and a singleton
 * FBXLoader for .fbx.  Both share a per-URL result cache so the same asset
 * is only fetched and parsed once per session.
 *
 * The DRACO decoder files live at /draco/ (three/examples/jsm/libs/draco/gltf/).
 */

import { useState, useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { Group, AnimationClip } from "three";

// ─── GLTF / GLB loader ───────────────────────────────────────────────────────

const _draco = new DRACOLoader();
_draco.setDecoderPath("/draco/");
_draco.preload();

const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_draco);

// ─── FBX loader ──────────────────────────────────────────────────────────────

const _fbxLoader = new FBXLoader();

// ─── Shared cache and types ──────────────────────────────────────────────────

export interface CachedModel {
  scene: Group;
  animations: AnimationClip[];
}

/** @deprecated Use CachedModel — kept for import compat */
export type CachedGLTF = CachedModel;

const _gltfCache = new Map<string, CachedModel>();
const _fbxCache  = new Map<string, CachedModel>();

export interface ModelState {
  scene: Group | null;
  animations: AnimationClip[];
  loading: boolean;
  error: string | null;
}

/** @deprecated Use ModelState — kept for import compat */
export type GLTFModelState = ModelState;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFBX(url: string) { return url.toLowerCase().endsWith(".fbx"); }

// ─── useGLTFModel (legacy name — works for GLB/GLTF only) ───────────────────

export function useGLTFModel(url: string | undefined): ModelState {
  const [state, setState] = useState<ModelState>(() => {
    if (url && _gltfCache.has(url)) {
      const c = _gltfCache.get(url)!;
      return { scene: c.scene, animations: c.animations, loading: false, error: null };
    }
    return { scene: null, animations: [], loading: !!url, error: null };
  });

  useEffect(() => {
    if (!url) { setState({ scene: null, animations: [], loading: false, error: null }); return; }

    if (_gltfCache.has(url)) {
      const c = _gltfCache.get(url)!;
      setState({ scene: c.scene, animations: c.animations, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ scene: null, animations: [], loading: true, error: null });

    _gltfLoader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const entry: CachedModel = { scene: gltf.scene, animations: gltf.animations ?? [] };
        _gltfCache.set(url, entry);
        if (gltf.animations?.length) {
          console.log(`[GLTFLoader] ${url} — ${gltf.animations.length} clip(s):`,
            gltf.animations.map(a => a.name));
        }
        setState({ scene: entry.scene, animations: entry.animations, loading: false, error: null });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GLTFLoader] Failed:", url, msg);
        setState({ scene: null, animations: [], loading: false, error: msg });
      },
    );

    return () => { cancelled = true; };
  }, [url]);

  return state;
}

// ─── useFBXModel ─────────────────────────────────────────────────────────────

export function useFBXModel(url: string | undefined): ModelState {
  const [state, setState] = useState<ModelState>(() => {
    if (url && _fbxCache.has(url)) {
      const c = _fbxCache.get(url)!;
      return { scene: c.scene, animations: c.animations, loading: false, error: null };
    }
    return { scene: null, animations: [], loading: !!url, error: null };
  });

  useEffect(() => {
    if (!url) { setState({ scene: null, animations: [], loading: false, error: null }); return; }

    if (_fbxCache.has(url)) {
      const c = _fbxCache.get(url)!;
      setState({ scene: c.scene, animations: c.animations, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ scene: null, animations: [], loading: true, error: null });

    _fbxLoader.load(
      url,
      (group: any) => {
        if (cancelled) return;
        const anims: AnimationClip[] = group.animations ?? [];
        const entry: CachedModel = { scene: group as Group, animations: anims };
        _fbxCache.set(url, entry);
        if (anims.length) {
          console.log(`[FBXLoader] ${url} — ${anims.length} clip(s):`, anims.map((a: any) => a.name));
        }
        setState({ scene: entry.scene, animations: anims, loading: false, error: null });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[FBXLoader] Failed:", url, msg);
        setState({ scene: null, animations: [], loading: false, error: msg });
      },
    );

    return () => { cancelled = true; };
  }, [url]);

  return state;
}

// ─── useModelFile — auto-dispatches to correct loader ────────────────────────
/**
 * Unified hook.  Uses FBXLoader for .fbx, GLTFLoader for everything else.
 * Both inner hooks are always called (Rules of Hooks); one receives undefined.
 */
export function useModelFile(url: string | undefined): ModelState {
  const fbx  = url ? isFBX(url) : false;
  const gltf = useGLTFModel(fbx ? undefined : url);
  const fbxs = useFBXModel (fbx ? url : undefined);
  return fbx ? fbxs : gltf;
}

// ─── Imperative helpers ───────────────────────────────────────────────────────

/** Async GLTF/GLB load (no React state). */
export function loadGLTFAsync(url: string): Promise<CachedModel> {
  if (_gltfCache.has(url)) return Promise.resolve(_gltfCache.get(url)!);
  return new Promise((resolve, reject) => {
    _gltfLoader.load(
      url,
      (gltf) => {
        const entry: CachedModel = { scene: gltf.scene, animations: gltf.animations ?? [] };
        _gltfCache.set(url, entry);
        resolve(entry);
      },
      undefined,
      reject,
    );
  });
}

/** Async FBX load (no React state). */
export function loadFBXAsync(url: string): Promise<CachedModel> {
  if (_fbxCache.has(url)) return Promise.resolve(_fbxCache.get(url)!);
  return new Promise((resolve, reject) => {
    _fbxLoader.load(
      url,
      (group: any) => {
        const anims: AnimationClip[] = group.animations ?? [];
        const entry: CachedModel = { scene: group as Group, animations: anims };
        _fbxCache.set(url, entry);
        resolve(entry);
      },
      undefined,
      reject,
    );
  });
}

/** Async load for any model type — detects format from URL extension. */
export function loadModelAsync(url: string): Promise<CachedModel> {
  return isFBX(url) ? loadFBXAsync(url) : loadGLTFAsync(url);
}
