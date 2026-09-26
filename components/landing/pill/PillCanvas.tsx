"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { SCENE, story } from "./storyState";

// The Echo pill: a two-tone glossy capsule (teal / ice-blue). Idle float and
// slow spin, tilts toward the mouse, splits into halves at "the wall",
// reassembles at "Echo finds a path", glows amber at "the cliff".
// Lazy-loaded; DPR capped at 1.5; lit by in-code light formers (no HDR fetch).

const R = 0.5; // capsule radius
const H = 0.85; // cylinder length per half
const TEAL = new THREE.Color("#0f7f86");
const ICE = new THREE.Color("#d9eef4");
const AMBER = new THREE.Color("#f59e0b");

function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function Half({ top, material }: { top: boolean; material: THREE.MeshPhysicalMaterial }) {
  const sign = top ? 1 : -1;
  const geo = useMemo(
    () => ({
      body: new THREE.CylinderGeometry(R, R, H, 64, 1, true),
      cap: new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2),
      seam: new THREE.CircleGeometry(R, 64),
    }),
    [top]
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return (
    <group>
      <mesh geometry={geo.body} material={material} position={[0, (sign * H) / 2, 0]} />
      <mesh geometry={geo.cap} material={material} position={[0, sign * H, 0]} />
      {/* Solid face where the halves meet (visible when split). */}
      <mesh geometry={geo.seam} material={material} rotation={[top ? Math.PI / 2 : -Math.PI / 2, 0, 0]} />
    </group>
  );
}

function Pill({ pointer }: { pointer: React.RefObject<{ x: number; y: number }> }) {
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const bottom = useRef<THREE.Group>(null);
  const s = useRef({ split: 0, amber: 0 });

  const mats = useMemo(() => {
    const make = () =>
      new THREE.MeshPhysicalMaterial({ roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, emissive: AMBER, emissiveIntensity: 0 });
    return { teal: make(), ice: make() };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const scene = story.scene;
    const st = s.current;
    st.split = damp(st.split, scene === SCENE.wall ? 1 : 0, 3.5, dt);
    st.amber = damp(st.amber, scene === SCENE.cliff ? 1 : 0, 3, dt);

    if (root.current) {
      root.current.position.y = Math.sin(t * 1.1) * 0.07; // idle float
      const p = pointer.current ?? { x: 0, y: 0 };
      root.current.rotation.x = damp(root.current.rotation.x, 0.25 - p.y * 0.3, 4, dt); // tilt to mouse
      root.current.rotation.z = damp(root.current.rotation.z, -0.62 - p.x * 0.3, 4, dt);
    }
    if (spin.current) spin.current.rotation.y += dt * 0.35; // slow spin
    if (top.current && bottom.current) {
      top.current.position.y = st.split * 0.42;
      bottom.current.position.y = -st.split * 0.42;
      top.current.rotation.z = st.split * 0.35;
      bottom.current.rotation.z = -st.split * 0.25;
    }
    for (const m of [mats.teal, mats.ice]) m.emissiveIntensity = st.amber * 0.55;
    mats.teal.color.copy(TEAL).lerp(AMBER, st.amber * 0.35);
    mats.ice.color.copy(ICE).lerp(AMBER, st.amber * 0.25);
  });

  return (
    <group ref={root}>
      <group ref={spin}>
        <group ref={top}>
          <Half top material={mats.teal} />
        </group>
        <group ref={bottom}>
          <Half top={false} material={mats.ice} />
        </group>
      </group>
    </group>
  );
}

export default function PillCanvas({ active }: { active: boolean }) {
  // Pointer from the window (the canvas ignores pointer events so it never
  // blocks clicks); normalized to -1..1.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 6.2], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 3]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-4, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="ring" color="#bff3ee" intensity={1.2} position={[3, -1, 3]} scale={2} />
      </Environment>
      <Pill pointer={pointer} />
    </Canvas>
  );
}
