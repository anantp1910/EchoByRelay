"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useRef } from "react";

import { Pill, PillLights, useWindowPointer } from "./PillCanvas";

// A standalone pill that spins non-stop. Interactive: drag to turn it (orbit,
// no zoom/pan), hover to spin faster, and it tilts toward the pointer.
export default function SpinningCanvas({ distance = 6.2 }: { distance?: number }) {
  const pointer = useWindowPointer();
  const boost = useRef(1);
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, distance], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onPointerOver={() => (boost.current = 3)}
      onPointerOut={() => (boost.current = 1)}
      style={{ cursor: "grab" }}
      aria-hidden
    >
      <PillLights />
      <Pill pointer={pointer} mode="spin" boost={boost} />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.8} />
    </Canvas>
  );
}
