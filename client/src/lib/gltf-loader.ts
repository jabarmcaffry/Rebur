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
import type { Group } from "three";

const _draco = new DRACOLoader();
_draco.setDecoderPath("/draco/");
_draco.preload();

const _loader = new GLTFLoader();
_loader.setDRACOLoader(_draco);

/** Cached scenes so the same URL is only loaded once per session */
const _cache = new Map<string, Group>();

export interface GLTFModelState {
  scene: Group | null;
  loading: boolean;
  error: string | null;
}

/**
 * Load a GLB/GLTF model imperatively (no Suspense, no error-boundary needed).
 * Returns { scene, loading, error }.
 */
export function useGLTFModel(url: string | undefined): GLTFModelState {
  const [state, setState] = useState<GLTFModelState>(() => {
    if (url && _cache.has(url)) return { scene: _cache.get(url)!, loading: false, error: null };
    return { scene: null, loading: !!url, error: null };
  });

  useEffect(() => {
    if (!url) {
      setState({ scene: null, loading: false, error: null });
      return;
    }

    if (_cache.has(url)) {
      setState({ scene: _cache.get(url)!, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ scene: null, loading: true, error: null });

    _loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        _cache.set(url, gltf.scene);
        setState({ scene: gltf.scene, loading: false, error: null });
      },
      undefined,
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GLTFLoader] Failed to load:", url, "\n", msg);
        setState({ scene: null, loading: false, error: msg });
      },
    );

    return () => { cancelled = true; };
  }, [url]);

  return state;
}
