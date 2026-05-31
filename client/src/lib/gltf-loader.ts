/**
 * gltf-loader.ts — Singleton GLTFLoader with local DRACO decoder support.
 *
 * Using a singleton ensures the DRACO decoder is only instantiated once and that
 * the internal cache is shared across all model consumers (editor + play mode).
 *
 * The DRACO decoder files are served from /draco/ (copied into client/public/draco/
 * from three/examples/jsm/libs/draco/gltf/ at build time).
 */

import { useState, useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Group, AnimationClip } from "three";

const _draco = new DRACOLoader();
_draco.setDecoderPath("/draco/");
_draco.preload();

const _loader = new GLTFLoader();
_loader.setDRACOLoader(_draco);

/** Cached result per URL so the same URL is only loaded once per session */
interface CachedGLTF {
  scene: Group;
  animations: AnimationClip[];
}
const _cache = new Map<string, CachedGLTF>();

export interface GLTFModelState {
  scene: Group | null;
  /** Animation clips embedded in the GLTF/GLB file (empty array if none). */
  animations: AnimationClip[];
  loading: boolean;
  error: string | null;
}

/**
 * Load a GLB/GLTF model imperatively (no Suspense, no error-boundary needed).
 * Returns { scene, animations, loading, error }.
 * `animations` contains any AnimationClips baked into the file.
 */
export function useGLTFModel(url: string | undefined): GLTFModelState {
  const [state, setState] = useState<GLTFModelState>(() => {
    if (url && _cache.has(url)) {
      const cached = _cache.get(url)!;
      return { scene: cached.scene, animations: cached.animations, loading: false, error: null };
    }
    return { scene: null, animations: [], loading: !!url, error: null };
  });

  useEffect(() => {
    if (!url) {
      setState({ scene: null, animations: [], loading: false, error: null });
      return;
    }

    if (_cache.has(url)) {
      const cached = _cache.get(url)!;
      setState({ scene: cached.scene, animations: cached.animations, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ scene: null, animations: [], loading: true, error: null });

    _loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const entry: CachedGLTF = { scene: gltf.scene, animations: gltf.animations ?? [] };
        _cache.set(url, entry);
        if (gltf.animations?.length) {
          console.log(`[GLTFLoader] ${url} — ${gltf.animations.length} animation clip(s):`,
            gltf.animations.map(a => a.name));
        }
        setState({ scene: gltf.scene, animations: gltf.animations ?? [], loading: false, error: null });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GLTFLoader] Failed to load:", url, "\n", msg);
        setState({ scene: null, animations: [], loading: false, error: msg });
      },
    );

    return () => { cancelled = true; };
  }, [url]);

  return state;
}

/** Imperatively load a GLTF and return the result (no React state). */
export function loadGLTFAsync(url: string): Promise<CachedGLTF> {
  if (_cache.has(url)) return Promise.resolve(_cache.get(url)!);
  return new Promise((resolve, reject) => {
    _loader.load(
      url,
      (gltf) => {
        const entry: CachedGLTF = { scene: gltf.scene, animations: gltf.animations ?? [] };
        _cache.set(url, entry);
        resolve(entry);
      },
      undefined,
      reject,
    );
  });
}
