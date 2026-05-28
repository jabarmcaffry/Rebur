/**
 * gltf-loader.ts — Singleton GLTFLoader with local DRACO decoder support.
 *
 * Each call to useGLTFModel() returns a freshly cloned scene so multiple
 * consumers (editor + play mode) can each own their own copy in the scene
 * graph without Three.js silently re-parenting the shared root.
 *
 * The DRACO decoder files are served from /draco/ (copied into client/public/draco/
 * from three/examples/jsm/libs/draco/gltf/ at build time).
 */

import { useState, useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { Group } from "three";

const _draco = new DRACOLoader();
_draco.setDecoderPath("/draco/");
_draco.preload();

const _loader = new GLTFLoader();
_loader.setDRACOLoader(_draco);

/** Cache the raw GLTF result so we can clone the scene per consumer */
const _cache = new Map<string, GLTF>();

/**
 * Deep-clone a GLTF scene using Three.js's built-in clone.
 * Each consumer gets its own object graph so it can be safely parented
 * to any Three.js scene without causing re-parenting issues.
 */
function cloneScene(gltf: GLTF): Group {
  return gltf.scene.clone(true);
}

export interface GLTFModelState {
  scene: Group | null;
  loading: boolean;
  error: string | null;
}

/**
 * Load a GLB/GLTF model imperatively (no Suspense, no error-boundary needed).
 * Returns a CLONED scene each time so it can safely live in any Three.js scene.
 */
export function useGLTFModel(url: string | undefined): GLTFModelState {
  const [state, setState] = useState<GLTFModelState>(() => {
    if (url && _cache.has(url)) {
      return { scene: cloneScene(_cache.get(url)!), loading: false, error: null };
    }
    return { scene: null, loading: !!url, error: null };
  });

  useEffect(() => {
    if (!url) {
      setState({ scene: null, loading: false, error: null });
      return;
    }

    if (_cache.has(url)) {
      setState({ scene: cloneScene(_cache.get(url)!), loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ scene: null, loading: true, error: null });

    _loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        _cache.set(url, gltf);
        setState({ scene: cloneScene(gltf), loading: false, error: null });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GLTFLoader] Failed to load:", url, "\n", msg);
        setState({ scene: null, loading: false, error: msg });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
