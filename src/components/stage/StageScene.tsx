"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows, TransformControls } from "@react-three/drei";
import * as THREE from "three";

const BACKDROP_COLOR = "#e8e2d6";
const PROP_COLOR = "#2a2a28";
const PALETTE = ["#c65d3b", "#3b6b5c", "#c9a13b", "#4a5a7a", "#a3432f"];
const DEFAULT_SIZE = { box: 0.8, ball: 0.5 };
// Bump the suffix if SceneObject's shape ever changes, so old saved layouts
// are ignored instead of crashing on load.
const STORAGE_KEY = "director-stage-layout-v1";

type ObjectKind = "box" | "ball" | "light" | "camera";
type Vec3 = [number, number, number];

type SceneObject = {
  id: number;
  kind: ObjectKind;
  position: Vec3;
  rotation: Vec3;
  color?: string; // box/ball only
  size?: number; // box/ball only — side length for box, radius for ball
};

// Static layout to start from. Y on the box/ball props is each shape's own
// half-height/radius so it sits flush on the floor.
const INITIAL_OBJECTS: SceneObject[] = [
  { id: 0, kind: "box", position: [-1.4, 0.4, 0.6], rotation: [0, 0, 0], color: PALETTE[0], size: 0.8 },
  { id: 1, kind: "ball", position: [-0.4, 0.5, -0.5], rotation: [0, 0, 0], color: PALETTE[1], size: 0.5 },
  { id: 2, kind: "box", position: [0.5, 0.4, 0.8], rotation: [0, 0, 0], color: PALETTE[2], size: 0.8 },
  { id: 3, kind: "ball", position: [1.4, 0.5, -0.2], rotation: [0, 0, 0], color: PALETTE[3], size: 0.5 },
  { id: 4, kind: "box", position: [-0.9, 0.4, -1.2], rotation: [0, 0, 0], color: PALETTE[4], size: 0.8 },
  { id: 5, kind: "ball", position: [0.9, 0.5, 1.1], rotation: [0, 0, 0], color: PALETTE[0], size: 0.5 },
  { id: 6, kind: "light", position: [-3, 0, 1.5], rotation: [0, 0.6, 0] },
  { id: 7, kind: "light", position: [3, 0, 1.5], rotation: [0, -0.6, 0] },
  { id: 8, kind: "camera", position: [-2.5, 1.6, 1], rotation: [-0.22, -1.19, 0] },
];

type ItemProps = {
  id: number;
  selected: boolean;
  onSelect: (id: number) => void;
  objRef: (id: number, obj: THREE.Object3D | null) => void;
};

function ShapeProp({ id, shape, position, rotation, color, size, selected, onSelect, objRef }: ItemProps & {
  shape: "box" | "ball";
  position: Vec3;
  rotation: Vec3;
  color: string;
  size: number;
}) {
  return (
    <mesh
      ref={(mesh) => objRef(id, mesh)}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {shape === "box" ? <boxGeometry args={[size, size, size]} /> : <sphereGeometry args={[size, 32, 32]} />}
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

/**
 * A softbox-on-a-stand light. The spotlight's target is a plain Object3D
 * nested in the same group (not a fixed world coordinate) so the beam turns
 * with the stand instead of always pointing at a hardcoded spot — that's
 * what makes the rotate gizmo actually re-aim the light.
 */
function LightStand({ id, position, rotation, selected, onSelect, objRef }: ItemProps & {
  position: Vec3;
  rotation: Vec3;
}) {
  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
    }
  }, []);

  return (
    <group
      ref={(g) => objRef(id, g)}
      position={position}
      rotation={rotation}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {/* tripod pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.8, 12]} />
        <meshStandardMaterial
          color={PROP_COLOR}
          roughness={0.6}
          emissive={selected ? "#ffffff" : "#000000"}
          emissiveIntensity={selected ? 0.15 : 0}
        />
      </mesh>
      {/* softbox head, tilted toward the set */}
      <mesh position={[0, 1.9, 0.15]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.15]} />
        <meshStandardMaterial color="#f2f2f0" roughness={0.9} />
      </mesh>
      <spotLight ref={spotRef} position={[0, 1.9, 0.15]} angle={0.6} penumbra={0.8} intensity={30} castShadow />
      {/* aim point, forward and down from the head — moves with the group's rotation */}
      <object3D ref={targetRef} position={[0, 0.6, 3]} />
    </group>
  );
}

/** A simple camera-shaped marker. Its own PerspectiveCamera becomes the
 * active view while "looking through" it — a full viewport swap (not a
 * picture-in-picture), so the main camera and OrbitControls step aside
 * while this one is active. */
function CameraMarker({ id, position, rotation, selected, onSelect, objRef, lookingThrough }: ItemProps & {
  position: Vec3;
  rotation: Vec3;
  lookingThrough: boolean;
}) {
  return (
    <group
      ref={(g) => objRef(id, g)}
      position={position}
      rotation={rotation}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {/* body + lens, hidden while looking through this camera's own view */}
      <group visible={!lookingThrough}>
        <mesh castShadow>
          <boxGeometry args={[0.35, 0.25, 0.3]} />
          <meshStandardMaterial
            color="#1c1c1a"
            roughness={0.4}
            emissive={selected ? "#ffffff" : "#000000"}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
        <mesh position={[0, 0, -0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.12, 0.22, 16]} />
          <meshStandardMaterial color="#333330" roughness={0.3} metalness={0.4} />
        </mesh>
      </group>
      {/* PerspectiveCamera looks down local -Z by default, same direction the lens cone points */}
      <PerspectiveCamera makeDefault={lookingThrough} fov={50} />
    </group>
  );
}

type SceneContentsProps = {
  objects: SceneObject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  objRef: (id: number, obj: THREE.Object3D | null) => void;
  lookingThroughId: number | null;
};

/** The room shell (lights, walls, floor) plus every scene object. */
function SceneContents({ objects, selectedId, onSelect, objRef, lookingThroughId }: SceneContentsProps) {
  return (
    <>
      <hemisphereLight args={[BACKDROP_COLOR, "#3a352c", 0.8]} />
      <ambientLight intensity={0.4} />

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

      {objects.map((o) => {
        const common = { id: o.id, selected: o.id === selectedId, onSelect, objRef };
        if (o.kind === "box" || o.kind === "ball") {
          return (
            <ShapeProp
              key={o.id}
              {...common}
              shape={o.kind}
              position={o.position}
              rotation={o.rotation}
              color={o.color ?? PALETTE[0]}
              size={o.size ?? DEFAULT_SIZE[o.kind]}
            />
          );
        }
        if (o.kind === "light") {
          return <LightStand key={o.id} {...common} position={o.position} rotation={o.rotation} />;
        }
        return (
          <CameraMarker
            key={o.id}
            {...common}
            position={o.position}
            rotation={o.rotation}
            lookingThrough={o.id === lookingThroughId}
          />
        );
      })}
    </>
  );
}

/** Bottom-right readout of the selected object's live transform. */
function TransformReadout({ mode, position, rotation }: { mode: "translate" | "rotate"; position: Vec3; rotation: Vec3 }) {
  if (mode === "translate") {
    const [x, y, z] = position;
    return (
      <p className="absolute bottom-6 right-6 text-[10px] uppercase tracking-[0.15em] text-fg-faint">
        x {x.toFixed(2)} · y {y.toFixed(2)} · z {z.toFixed(2)}
      </p>
    );
  }
  const [rx, ry, rz] = rotation.map((r) => THREE.MathUtils.radToDeg(r));
  return (
    <p className="absolute bottom-6 right-6 text-[10px] uppercase tracking-[0.15em] text-fg-faint">
      pitch {rx.toFixed(0)}° · yaw {ry.toFixed(0)}° · roll {rz.toFixed(0)}°
    </p>
  );
}

/** Reads a saved layout on mount. Safe as a `useState` lazy initializer
 * (rather than an effect) because none of the objects it returns changes
 * any server-rendered DOM — the 3D content is drawn imperatively onto a
 * <canvas>, not diffed HTML, so there's no hydration mismatch to avoid by
 * deferring this to an effect. */
function loadSavedObjects(): SceneObject[] {
  if (typeof window === "undefined") return INITIAL_OBJECTS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted or inaccessible storage — fall back to the default layout
  }
  return INITIAL_OBJECTS;
}

export function StageScene() {
  const [objects, setObjects] = useState(loadSavedObjects);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
  const [newSize, setNewSize] = useState(0.8);
  const [lookingThrough, setLookingThrough] = useState(false);

  const nodes = useRef(new Map<number, THREE.Object3D>());
  const setObjRef = (id: number, obj: THREE.Object3D | null) => {
    if (obj) nodes.current.set(id, obj);
    else nodes.current.delete(id);
  };

  // Ctrl is tracked on window rather than read from the gizmo's mouse event,
  // since TransformControls' onMouseDown doesn't forward the source PointerEvent.
  const ctrlHeld = useRef(false);
  const nextId = useRef(Math.max(1000, ...objects.map((o) => o.id + 1)));
  useEffect(() => {
    const setFlag = (e: KeyboardEvent) => (ctrlHeld.current = e.ctrlKey);
    const handleKeydown = (e: KeyboardEvent) => {
      ctrlHeld.current = e.ctrlKey;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (e.key === "r" || e.key === "R") {
        setGizmoMode((m) => (m === "translate" ? "rotate" : "translate"));
      }
    };
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", setFlag);
    window.addEventListener("blur", () => (ctrlHeld.current = false));
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", setFlag);
    };
  }, []);

  // Auto-save on every change (drag, rotate, add, duplicate).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(objects));
    } catch {
      // storage full or unavailable (private browsing) — layout just won't persist
    }
  }, [objects]);

  function resetLayout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setObjects(INITIAL_OBJECTS);
    setSelectedId(null);
  }

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const canDuplicate = selected?.kind === "box" || selected?.kind === "ball";
  const lookingThroughId = lookingThrough && selected?.kind === "camera" ? selected.id : null;

  // Refs attach during the commit that follows a selectedId change, so the
  // live Object3D isn't readable until an effect runs after that commit —
  // reading nodes.current straight in the render body would risk a stale
  // (pre-attach) value on the render where selection just changed.
  const [selectedNode, setSelectedNode] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    setSelectedNode(selectedId !== null ? (nodes.current.get(selectedId) ?? null) : null);
  }, [selectedId]);

  function addShape(kind: "box" | "ball") {
    const id = nextId.current++;
    const y = kind === "box" ? newSize / 2 : newSize;
    setObjects((prev) => [
      ...prev,
      { id, kind, position: [0, y, 2], rotation: [0, 0, 0], color: PALETTE[id % PALETTE.length], size: newSize },
    ]);
    setSelectedId(id);
    setGizmoMode("translate");
  }

  // Ctrl+drag leaves a copy at the start position — the gizmo keeps
  // manipulating the object it already grabbed, so the "moved" one and the
  // "left behind" one are just whichever mesh instance ends up where.
  function handleGizmoMouseDown() {
    if (!ctrlHeld.current || !selected || !canDuplicate) return;
    const clone: SceneObject = { ...selected, id: nextId.current++ };
    setObjects((prev) => [...prev, clone]);
  }

  // Fires continuously while dragging. Reads the gizmo-mutated transform
  // back into React state — without this, the next render's position/
  // rotation props would snap the object back to its pre-drag value.
  function syncSelectedTransform() {
    if (selectedId === null || !selectedNode) return;
    const { x, y, z } = selectedNode.position;
    const rotation: Vec3 = [selectedNode.rotation.x, selectedNode.rotation.y, selectedNode.rotation.z];
    setObjects((prev) => prev.map((o) => (o.id === selectedId ? { ...o, position: [x, y, z], rotation } : o)));
  }

  return (
    <div className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} className="!absolute inset-0" onPointerMissed={() => setSelectedId(null)}>
        <color attach="background" args={[BACKDROP_COLOR]} />
        <PerspectiveCamera makeDefault={!lookingThrough} position={[3.5, 2.2, 5]} fov={45} />
        <OrbitControls
          makeDefault
          enabled={!lookingThrough}
          target={[0, 1, 0]}
          minDistance={3}
          maxDistance={12}
          maxPolarAngle={1.5}
          enableDamping
        />

        <SceneContents
          objects={objects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          objRef={setObjRef}
          lookingThroughId={lookingThroughId}
        />

        {selectedNode && (
          <TransformControls
            object={selectedNode}
            mode={gizmoMode}
            space={gizmoMode === "translate" ? "world" : "local"}
            onMouseDown={handleGizmoMouseDown}
            onObjectChange={syncSelectedTransform}
          />
        )}

        <ContactShadows position={[0, 0.11, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      </Canvas>

      <div className="absolute bottom-6 left-6 flex items-center gap-3">
        <div className="flex rounded-full border border-border bg-bg-panel p-1">
          {(["translate", "rotate"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setGizmoMode(mode)}
              title="Toggle with R"
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                gizmoMode === mode ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              {mode === "translate" ? "Move" : "Rotate"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-full border border-border bg-bg-panel py-1 pl-3 pr-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Size</span>
          <input
            type="number"
            min={0.2}
            max={2}
            step={0.1}
            value={newSize}
            onChange={(e) => setNewSize(Number(e.target.value) || DEFAULT_SIZE.box)}
            className="w-12 rounded-full bg-transparent px-2 py-1 text-[10px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => addShape("box")}
            className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:text-fg"
          >
            + Box
          </button>
          <button
            onClick={() => addShape("ball")}
            className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:text-fg"
          >
            + Ball
          </button>
        </div>

        {selected?.kind === "camera" && (
          <button
            onClick={() => setLookingThrough((v) => !v)}
            className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
          >
            {lookingThrough ? "Exit camera view" : "Look through camera"}
          </button>
        )}
        {lookingThrough && selected?.kind !== "camera" && (
          <button
            onClick={() => setLookingThrough(false)}
            className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
          >
            Exit camera view
          </button>
        )}

        <button
          onClick={resetLayout}
          className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          Reset layout
        </button>
      </div>

      {selected && (
        <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1">
          {canDuplicate && (
            <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">hold ctrl and drag to duplicate</p>
          )}
          <TransformReadout mode={gizmoMode} position={selected.position} rotation={selected.rotation} />
        </div>
      )}
    </div>
  );
}
