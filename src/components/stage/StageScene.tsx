"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";

const BACKDROP_COLOR = "#e8e2d6";
const PROP_COLOR = "#2a2a28";

type Prop = {
  id: number;
  shape: "box" | "ball";
  position: [number, number, number];
  color: string;
};

const PALETTE = ["#c65d3b", "#3b6b5c", "#c9a13b", "#4a5a7a", "#a3432f"];

function spawnStack(seedOffset: number): Prop[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: seedOffset + i,
    shape: i % 2 === 0 ? "box" : "ball",
    position: [
      (Math.random() - 0.5) * 1.2,
      2 + i * 1.1,
      (Math.random() - 0.5) * 1.2,
    ],
    color: PALETTE[i % PALETTE.length],
  }));
}

/** A softbox-on-a-stand prop — decorative only, not physics-simulated. */
function LightStand({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* tripod pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.8, 12]} />
        <meshStandardMaterial color={PROP_COLOR} roughness={0.6} />
      </mesh>
      {/* softbox head, tilted toward the set */}
      <mesh position={[0, 1.9, 0.15]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.15]} />
        <meshStandardMaterial color="#f2f2f0" roughness={0.9} />
      </mesh>
      <spotLight
        position={[0, 1.9, 0.15]}
        target-position={[0, 0.8, 0]}
        angle={0.6}
        penumbra={0.8}
        intensity={30}
        castShadow
      />
    </group>
  );
}

function Prop({ shape, position, color }: Prop) {
  return (
    <RigidBody position={position} colliders={shape === "box" ? "cuboid" : "ball"} restitution={0.15} friction={0.8}>
      <mesh castShadow receiveShadow>
        {shape === "box" ? <boxGeometry args={[0.8, 0.8, 0.8]} /> : <sphereGeometry args={[0.5, 32, 32]} />}
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
      </mesh>
    </RigidBody>
  );
}

export function StageScene() {
  const [generation, setGeneration] = useState(0);
  const props = useMemo(() => spawnStack(generation * 100), [generation]);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} className="!absolute inset-0">
        <color attach="background" args={[BACKDROP_COLOR]} />
        <PerspectiveCamera makeDefault position={[3.5, 2.2, 5]} fov={45} />
        <OrbitControls target={[0, 1, 0]} minDistance={3} maxDistance={12} maxPolarAngle={1.5} enableDamping />

        <hemisphereLight args={[BACKDROP_COLOR, "#3a352c", 0.8]} />
        <ambientLight intensity={0.4} />
        <LightStand position={[-3, 0, 1.5]} rotationY={0.6} />
        <LightStand position={[3, 0, 1.5]} rotationY={-0.6} />

        <Physics gravity={[0, -9.81, 0]}>
          {/* backdrop wall */}
          <RigidBody type="fixed">
            <mesh position={[0, 4, -3]} receiveShadow>
              <boxGeometry args={[12, 8, 0.2]} />
              <meshStandardMaterial color={BACKDROP_COLOR} roughness={1} />
            </mesh>
          </RigidBody>
          {/* floor */}
          <RigidBody type="fixed">
            <mesh position={[0, 0, 0]} receiveShadow>
              <boxGeometry args={[12, 0.2, 8]} />
              <meshStandardMaterial color={BACKDROP_COLOR} roughness={1} />
            </mesh>
          </RigidBody>

          {props.map((p) => (
            <Prop key={p.id} {...p} />
          ))}
        </Physics>

        <ContactShadows position={[0, 0.11, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      </Canvas>

      <button
        onClick={() => setGeneration((g) => g + 1)}
        className="absolute bottom-6 left-6 rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
      >
        Reset stack
      </button>
    </div>
  );
}
