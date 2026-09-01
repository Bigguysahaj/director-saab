"use client";

import { useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows, TransformControls } from "@react-three/drei";
import * as THREE from "three";

const BACKDROP_COLOR = "#e8e2d6";
const PROP_COLOR = "#2a2a28";
const PALETTE = ["#c65d3b", "#3b6b5c", "#c9a13b", "#4a5a7a", "#a3432f"];

// Round dragged positions to the nearest 1/4 unit — makes props easy to
// line up by eye without needing exact pixel-perfect drops.
const GRID_SNAP = 0.25;

type PropData = {
  id: number;
  shape: "box" | "ball";
  position: [number, number, number];
  color: string;
};

// Static layout — no physics. Y is each shape's own half-height/radius so
// it sits flush on the floor (boxes are 0.8 side, balls are 0.5 radius).
const INITIAL_PROPS: PropData[] = [
  { id: 0, shape: "box", position: [-1.4, 0.4, 0.6], color: PALETTE[0] },
  { id: 1, shape: "ball", position: [-0.4, 0.5, -0.5], color: PALETTE[1] },
  { id: 2, shape: "box", position: [0.5, 0.4, 0.8], color: PALETTE[2] },
  { id: 3, shape: "ball", position: [1.4, 0.5, -0.2], color: PALETTE[3] },
  { id: 4, shape: "box", position: [-0.9, 0.4, -1.2], color: PALETTE[4] },
  { id: 5, shape: "ball", position: [0.9, 0.5, 1.1], color: PALETTE[0] },
];

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

type PropProps = PropData & {
  selected: boolean;
  onSelect: (id: number) => void;
  meshRef: (id: number, mesh: THREE.Mesh | null) => void;
};

function Prop({ id, shape, position, color, selected, onSelect, meshRef }: PropProps) {
  return (
    <mesh
      ref={(mesh) => meshRef(id, mesh)}
      position={position}
      castShadow
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {shape === "box" ? <boxGeometry args={[0.8, 0.8, 0.8]} /> : <sphereGeometry args={[0.5, 32, 32]} />}
      <meshStandardMaterial
        color={color}
        roughness={0.5}
        metalness={0.05}
        emissive={selected ? "#ffffff" : "#000000"}
        emissiveIntensity={selected ? 0.15 : 0}
      />
    </mesh>
  );
}

/** Bottom-right readout of the selected prop's live position while the gizmo is in use. */
function PositionReadout({ position }: { position: [number, number, number] }) {
  const [x, y, z] = position;
  return (
    <p className="absolute bottom-6 right-6 text-[10px] uppercase tracking-[0.15em] text-fg-faint">
      x {x.toFixed(2)} · y {y.toFixed(2)} · z {z.toFixed(2)}
    </p>
  );
}

export function StageScene() {
  const [props, setProps] = useState(INITIAL_PROPS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const meshes = useRef(new Map<number, THREE.Mesh>());
  const setMeshRef = (id: number, mesh: THREE.Mesh | null) => {
    if (mesh) meshes.current.set(id, mesh);
    else meshes.current.delete(id);
  };

  const selectedProp = props.find((p) => p.id === selectedId) ?? null;
  const selectedMesh = selectedId !== null ? meshes.current.get(selectedId) : undefined;

  // Fires continuously while dragging. Reads the gizmo-mutated mesh position
  // back into React state — without this, the next render's `position` prop
  // on <Prop> would snap the mesh back to its pre-drag value.
  function syncSelectedPosition() {
    if (selectedId === null || !selectedMesh) return;
    const { x, y, z } = selectedMesh.position;
    setProps((prev) => prev.map((p) => (p.id === selectedId ? { ...p, position: [x, y, z] } : p)));
  }

  return (
    <div className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} className="!absolute inset-0" onPointerMissed={() => setSelectedId(null)}>
        <color attach="background" args={[BACKDROP_COLOR]} />
        <PerspectiveCamera makeDefault position={[3.5, 2.2, 5]} fov={45} />
        <OrbitControls
          makeDefault
          target={[0, 1, 0]}
          minDistance={3}
          maxDistance={12}
          maxPolarAngle={1.5}
          enableDamping
        />

        <hemisphereLight args={[BACKDROP_COLOR, "#3a352c", 0.8]} />
        <ambientLight intensity={0.4} />
        <LightStand position={[-3, 0, 1.5]} rotationY={0.6} />
        <LightStand position={[3, 0, 1.5]} rotationY={-0.6} />

        {/* backdrop wall */}
        <mesh position={[0, 4, -3]} receiveShadow>
          <boxGeometry args={[12, 8, 0.2]} />
          <meshStandardMaterial color={BACKDROP_COLOR} roughness={1} />
        </mesh>
        {/* floor */}
        <mesh position={[0, 0, 0]} receiveShadow>
          <boxGeometry args={[12, 0.2, 8]} />
          <meshStandardMaterial color={BACKDROP_COLOR} roughness={1} />
        </mesh>

        {props.map((p) => (
          <Prop key={p.id} {...p} selected={p.id === selectedId} onSelect={setSelectedId} meshRef={setMeshRef} />
        ))}

        {selectedMesh && (
          <TransformControls
            object={selectedMesh}
            mode="translate"
            translationSnap={GRID_SNAP}
            onObjectChange={syncSelectedPosition}
          />
        )}

        <ContactShadows position={[0, 0.11, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      </Canvas>

      {selectedProp && <PositionReadout position={selectedProp.position} />}
    </div>
  );
}
