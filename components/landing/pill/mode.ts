"use client";

import { useReducedMotion } from "framer-motion";
import { useSyncExternalStore } from "react";

let webgl: boolean | null = null;
function hasWebGL(): boolean {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noop = () => () => {};

/**
 * "3d" when WebGL works and motion is welcome; "static" for reduced motion or
 * no WebGL; null during SSR/hydration (render nothing pill-related yet).
 */
export function usePillMode(): "3d" | "static" | null {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const gl = useSyncExternalStore(noop, hasWebGL, () => false);
  const reduce = useReducedMotion();
  if (!mounted) return null;
  return gl && !reduce ? "3d" : "static";
}
