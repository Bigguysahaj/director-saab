"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows, TransformControls } from "@react-three/drei";
import * as THREE from "three";

const BACKDROP_COLOR = "#e8e2d6";
const PROP_COLOR = "#2a2a28";
const PALETTE = ["#c65d3b", "#3b6b5c", "#c9a13b", "#4a5a7a", "#a3432f"];
const DEFAULT_SIZE = { box: 0.8, ball: 0.5 };
const DEFAULT_FOV = 50;
// Bump the suffix if SceneObject's shape ever changes, so old saved layouts
// are ignored instead of crashing on load.
const STORAGE_KEY = "director-stage-layout-v1";

type ObjectKind = "box" | "ball" | "light" | "camera" | "mannequin";
type Vec3 = [number, number, number];

type SceneObject = {
  id: number;
  kind: ObjectKind;
  position: Vec3;
  rotation: Vec3;
  color?: string; // box/ball/mannequin only
  size?: number; // ball radius; box height (Y) and fallback for length/breadth
  length?: number; // box X dimension — defaults to `size` (a cube) when unset
  breadth?: number; // box Z dimension — defaults to `size` (a cube) when unset
  fov?: number; // camera only
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
  { id: 8, kind: "camera", position: [-2.5, 1.6, 1], rotation: [-0.22, -1.19, 0], fov: DEFAULT_FOV },
];

type ItemProps = {
  id: number;
  selected: boolean;
  onSelect: (id: number) => void;
  objRef: (id: number, obj: THREE.Object3D | null) => void;
};

function ShapeProp({ id, shape, position, rotation, color, size, length, breadth, selected, onSelect, objRef }: ItemProps & {
  shape: "box" | "ball";
  position: Vec3;
  rotation: Vec3;
  color: string;
  size: number;
  length?: number;
  breadth?: number;
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
      {shape === "box" ? (
        <boxGeometry args={[length ?? size, size, breadth ?? size]} />
      ) : (
        <sphereGeometry args={[size, 32, 32]} />
      )}
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
 * while this one is active. `camRef` exposes the live THREE.PerspectiveCamera
 * so camera-move presets can drive its FOV directly. */
function CameraMarker({ id, position, rotation, selected, onSelect, objRef, lookingThrough, fov, camRef }: ItemProps & {
  position: Vec3;
  rotation: Vec3;
  lookingThrough: boolean;
  fov: number;
  camRef?: React.Ref<THREE.PerspectiveCamera>;
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
      <PerspectiveCamera ref={camRef} makeDefault={lookingThrough} fov={fov} />
    </group>
  );
}

/**
 * A plain stand-in figure for blocking out where a person goes — built from
 * primitives (head/torso/arms/legs), not a rig. Posing individual limbs is
 * future work (see TODO.md); for now the whole figure moves/rotates as one
 * selectable unit, feet at the group's local origin so it stands flush on
 * the floor.
 */
function Mannequin({ id, position, rotation, color, selected, onSelect, objRef }: ItemProps & {
  position: Vec3;
  rotation: Vec3;
  color: string;
}) {
  const limbMaterial = (
    <meshStandardMaterial
      color={color}
      roughness={0.6}
      emissive={selected ? "#ffffff" : "#000000"}
      emissiveIntensity={selected ? 0.15 : 0}
    />
  );
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
      {/* legs */}
      <mesh position={[-0.12, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 12]} />
        {limbMaterial}
      </mesh>
      <mesh position={[0.12, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 12]} />
        {limbMaterial}
      </mesh>
      {/* torso */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.25]} />
        {limbMaterial}
      </mesh>
      {/* arms */}
      <mesh position={[-0.3, 1.05, 0]} rotation={[0, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.6, 12]} />
        {limbMaterial}
      </mesh>
      <mesh position={[0.3, 1.05, 0]} rotation={[0, 0, -0.15]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.6, 12]} />
        {limbMaterial}
      </mesh>
      {/* head */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.15, 24, 24]} />
        {limbMaterial}
      </mesh>
    </group>
  );
}

type SceneContentsProps = {
  objects: SceneObject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  objRef: (id: number, obj: THREE.Object3D | null) => void;
  lookingThroughId: number | null;
  cameraRef?: React.Ref<THREE.PerspectiveCamera>;
};

/** The room shell (lights, walls, floor) plus every scene object. */
function SceneContents({ objects, selectedId, onSelect, objRef, lookingThroughId, cameraRef }: SceneContentsProps) {
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
              length={o.length}
              breadth={o.breadth}
            />
          );
        }
        if (o.kind === "light") {
          return <LightStand key={o.id} {...common} position={o.position} rotation={o.rotation} />;
        }
        if (o.kind === "mannequin") {
          return (
            <Mannequin key={o.id} {...common} position={o.position} rotation={o.rotation} color={o.color ?? "#c9b8a0"} />
          );
        }
        return (
          <CameraMarker
            key={o.id}
            {...common}
            position={o.position}
            rotation={o.rotation}
            lookingThrough={o.id === lookingThroughId}
            fov={o.fov ?? DEFAULT_FOV}
            camRef={cameraRef}
          />
        );
      })}
    </>
  );
}

type MoveKind = "dolly-zoom-in" | "zoom" | "pan";
type StopStyle = "linear" | "quad";

// Key bound to each move — held down (not clicked) to run it.
const MOVE_KEYS: Record<string, MoveKind> = { i: "dolly-zoom-in", z: "zoom", p: "pan" };
const MOVE_LABELS: Record<MoveKind, string> = { "dolly-zoom-in": "Dolly zoom in (I)", zoom: "Zoom (Z)", pan: "Pan (P)" };
// How fast each move progresses per second while held.
const MOVE_RATES: Record<MoveKind, number> = { "dolly-zoom-in": 0.7, zoom: 14, pan: 24 };
const STOP_DECAY_MS = 400; // "quad" stop style eases the rate to 0 over this long
const MIN_FOV = 8;
const MAX_FOV = 100;
const MIN_DOLLY_DIST = 0.5;

type HoldState = {
  kind: MoveKind;
  phase: "hold" | "decay";
  decayStart?: number;
  rateAtRelease?: number;
  k?: number; // dolly-zoom-in only: apparent-size constant fixed at grab time
};

/**
 * Drives whichever camera move is currently held by mutating the camera's
 * live Object3D/PerspectiveCamera directly every frame (not via React state
 * — that would mean a re-render per frame). `holdRef` is written from
 * outside (keyboard/mouse handlers in StageScene) and read here every
 * frame; `nodesRef`/`cameraIdRef` are dereferenced inside useFrame rather
 * than resolved by the caller during render, since reading a ref's
 * `.current` in a render body is unsound (see the syncSelectedTransform
 * comment below for the same reasoning).
 */
function HoldMoveAnimator({
  nodesRef,
  cameraIdRef,
  camRef,
  holdRef,
  onSettled,
}: {
  nodesRef: React.RefObject<Map<number, THREE.Object3D>>;
  cameraIdRef: React.RefObject<number | null>;
  camRef: React.RefObject<THREE.PerspectiveCamera | null>;
  holdRef: React.RefObject<HoldState | null>;
  onSettled: () => void;
}) {
  useFrame((_, delta) => {
    const hold = holdRef.current;
    const cameraId = cameraIdRef.current;
    if (!hold || cameraId === null) return;
    const camNode = nodesRef.current.get(cameraId);
    const cam = camRef.current;
    if (!camNode || !cam) return;

    let rate = MOVE_RATES[hold.kind];
    if (hold.phase === "decay") {
      const t = Math.min((performance.now() - hold.decayStart!) / STOP_DECAY_MS, 1);
      const remaining = 1 - t;
      rate = hold.rateAtRelease! * remaining * remaining; // quad ease-out
      if (t >= 1) holdRef.current = null;
    }

    if (hold.kind === "zoom") {
      // FOV only — a plain optical zoom, camera stays put.
      cam.fov = THREE.MathUtils.clamp(cam.fov - rate * delta, MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
    } else if (hold.kind === "pan") {
      // Rotate in place — position/FOV untouched, matches swinging a camera
      // on a fixed tripod head.
      camNode.rotation.y += THREE.MathUtils.degToRad(rate * delta);
    } else if (hold.kind === "dolly-zoom-in" && hold.k !== undefined) {
      // Push toward the focus point while widening FOV to compensate, so
      // the focus point stays the same apparent size and the background
      // warps — the actual Vertigo/"trombone" effect, not a plain push-in.
      // Derivation: apparent size ∝ 1 / (distance · tan(fov/2)), so holding
      // that product constant (k, fixed at grab time) gives fov from dist.
      const dir = new THREE.Vector3();
      camNode.getWorldDirection(dir);
      const focus = new THREE.Vector3(0, 1, 0);
      const dist = camNode.position.distanceTo(focus);
      const newDist = Math.max(MIN_DOLLY_DIST, dist - rate * delta);
      camNode.position.addScaledVector(dir, dist - newDist);
      cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(hold.k / newDist)), MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
    }

    if (!holdRef.current) onSettled();
  });

  return null;
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

/** Resolves after `n` animation frames — used to give a camera-swap a
 * moment to actually render before we grab a photo/start recording from it. */
function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    function tick() {
      count++;
      if (count >= n) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

export function StageScene() {
  const [objects, setObjects] = useState(loadSavedObjects);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
  const [newSize, setNewSize] = useState(0.8);
  const [newLength, setNewLength] = useState(0.8);
  const [newBreadth, setNewBreadth] = useState(0.8);
  const [lookingThrough, setLookingThrough] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [cameraMovesOpen, setCameraMovesOpen] = useState(false);
  const [stopStyle, setStopStyle] = useState<StopStyle>("quad");
  // Mirrors holdRef for UI highlighting only — the physics itself never
  // reads this, so it doesn't need to update every frame.
  const [activeHoldKind, setActiveHoldKind] = useState<MoveKind | null>(null);

  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const cameraFovRef = useRef<THREE.PerspectiveCamera | null>(null);
  // Whether capture/recording auto-entered camera view (vs. the user already
  // being there) — only auto-entered sessions auto-exit when done.
  const autoEnteredCameraView = useRef(false);
  const holdRef = useRef<HoldState | null>(null);
  const stopStyleRef = useRef<StopStyle>(stopStyle);
  useEffect(() => {
    stopStyleRef.current = stopStyle;
  }, [stopStyle]);

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function capturePhoto() {
    if (!cameraObj) return;
    const wasLookingThrough = lookingThrough;
    if (!wasLookingThrough) {
      setLookingThrough(true);
      await waitFrames(3);
    }
    canvasEl.current?.toBlob((blob) => {
      if (blob) downloadBlob(blob, `stage-photo-${Date.now()}.png`);
      if (!wasLookingThrough) setLookingThrough(false);
    }, "image/png");
  }

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorder.current?.stop();
      return;
    }
    if (!cameraObj) return;
    const wasLookingThrough = lookingThrough;
    if (!wasLookingThrough) {
      setLookingThrough(true);
      await waitFrames(3);
    }
    autoEnteredCameraView.current = !wasLookingThrough;
    const canvas = canvasEl.current;
    if (!canvas) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType });
    recordedChunks.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.current.push(e.data);
    };
    recorder.onstop = () => {
      downloadBlob(new Blob(recordedChunks.current, { type: mimeType }), `stage-clip-${Date.now()}.webm`);
      setIsRecording(false);
      if (autoEnteredCameraView.current) setLookingThrough(false);
    };
    recorder.start();
    mediaRecorder.current = recorder;
    setIsRecording(true);
  }

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
    const handleKeydown = (e: KeyboardEvent) => {
      ctrlHeld.current = e.ctrlKey;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.isContentEditable)) return;
      if (e.key === "r" || e.key === "R") {
        setGizmoMode((m) => (m === "translate" ? "rotate" : "translate"));
      }
      const kind = MOVE_KEYS[e.key.toLowerCase()];
      if (kind) startHold(kind);
    };
    const handleKeyup = (e: KeyboardEvent) => {
      ctrlHeld.current = e.ctrlKey;
      const kind = MOVE_KEYS[e.key.toLowerCase()];
      if (kind) stopHold(kind);
    };
    // A held key/mouse-button whose release event never fires (alt-tabbing
    // away mid-hold) would otherwise leave the move stuck running forever.
    const handleBlur = () => {
      ctrlHeld.current = false;
      if (holdRef.current) {
        holdRef.current = null;
        setActiveHoldKind(null);
        syncCameraFromLive();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", handleKeyup);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
      window.removeEventListener("blur", handleBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on every change (drag, rotate, add, duplicate).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(objects));
    } catch {
      // storage full or unavailable (private browsing) — layout just won't persist
    }
  }, [objects]);

  // Recording only makes sense while looking through the camera — stop it
  // (and trigger the download) if the user exits that view mid-recording.
  useEffect(() => {
    if (!lookingThrough && mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
    }
  }, [lookingThrough]);

  function resetLayout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setObjects(INITIAL_OBJECTS);
    setSelectedId(null);
  }

  const cameraObj = objects.find((o) => o.kind === "camera") ?? null;
  // Not tied to selection — capture/record and the move presets need to
  // engage the camera's view regardless of what's currently selected.
  const lookingThroughId = lookingThrough ? (cameraObj?.id ?? null) : null;

  // Mirrored into a ref (same reasoning as stopStyleRef above) so the
  // mount-once keydown/keyup listeners always see the current camera id
  // without needing to be torn down and rebuilt on every objects change.
  const cameraIdRef = useRef<number | null>(cameraObj?.id ?? null);
  useEffect(() => {
    cameraIdRef.current = cameraObj?.id ?? null;
  }, [cameraObj?.id]);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const canDuplicate = selected?.kind === "box" || selected?.kind === "ball";

  // Refs attach during the commit that follows a selectedId change, so the
  // live Object3D isn't readable until an effect runs after that commit —
  // reading nodes.current straight in the render body would risk a stale
  // (pre-attach) value on the render where selection just changed.
  const [selectedNode, setSelectedNode] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    setSelectedNode(selectedId !== null ? (nodes.current.get(selectedId) ?? null) : null);
  }, [selectedId]);

  function addFromInventory(kind: "box" | "ball" | "mannequin") {
    const id = nextId.current++;
    const base: SceneObject = {
      id,
      kind,
      position: [0, 0, 2],
      rotation: [0, 0, 0],
      color: PALETTE[id % PALETTE.length],
    };
    if (kind === "box") {
      base.position = [0, newSize / 2, 2];
      base.size = newSize;
      base.length = newLength;
      base.breadth = newBreadth;
    } else if (kind === "ball") {
      base.position = [0, newSize, 2];
      base.size = newSize;
    }
    // mannequin stands at y=0 — its own geometry is already floor-relative
    setObjects((prev) => [...prev, base]);
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

  // Persists the camera's live (imperatively-mutated) transform/FOV back
  // into React state once a hold move fully stops — same idea as
  // syncSelectedTransform, just for whichever move just finished.
  function syncCameraFromLive() {
    const cameraId = cameraIdRef.current;
    if (cameraId === null) return;
    const camNode = nodes.current.get(cameraId);
    const cam = cameraFovRef.current;
    if (!camNode || !cam) return;
    const position: Vec3 = [camNode.position.x, camNode.position.y, camNode.position.z];
    const rotation: Vec3 = [camNode.rotation.x, camNode.rotation.y, camNode.rotation.z];
    setObjects((prev) => prev.map((o) => (o.id === cameraId ? { ...o, position, rotation, fov: cam.fov } : o)));
  }

  // Grabbed on keydown/mousedown. Ignores a repeat trigger for the move
  // already in progress (keyboard auto-repeat would otherwise re-arm
  // dolly-zoom-in's fixed `k` constant every ~30ms).
  function startHold(kind: MoveKind) {
    const cameraId = cameraIdRef.current;
    if (cameraId === null) return;
    const camNode = nodes.current.get(cameraId);
    const cam = cameraFovRef.current;
    if (!camNode || !cam) return;
    if (holdRef.current?.kind === kind && holdRef.current.phase === "hold") return;

    const state: HoldState = { kind, phase: "hold" };
    if (kind === "dolly-zoom-in") {
      const focus = new THREE.Vector3(0, 1, 0);
      const d0 = camNode.position.distanceTo(focus);
      state.k = d0 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    }
    holdRef.current = state;
    setActiveHoldKind(kind);
  }

  // Released on keyup/mouseup/mouseleave. "linear" stops immediately;
  // "quad" hands off to HoldMoveAnimator's decay phase for a smoother stop.
  function stopHold(kind: MoveKind) {
    if (holdRef.current?.kind !== kind || holdRef.current.phase !== "hold") return;
    if (stopStyleRef.current === "linear") {
      holdRef.current = null;
      syncCameraFromLive();
    } else {
      holdRef.current = { ...holdRef.current, phase: "decay", decayStart: performance.now(), rateAtRelease: MOVE_RATES[kind] };
    }
    setActiveHoldKind(null);
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        className="!absolute inset-0"
        onPointerMissed={() => setSelectedId(null)}
        // Photo/video capture reads pixels back from this buffer on demand
        // (a button click, not synced to the render loop) — without this,
        // the WebGL buffer can already be cleared by the time toBlob/
        // captureStream runs, producing a blank capture.
        gl={{ preserveDrawingBuffer: true }}
        onCreated={(state) => {
          canvasEl.current = state.gl.domElement;
        }}
      >
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
          cameraRef={cameraFovRef}
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

        {cameraObj && (
          <HoldMoveAnimator
            nodesRef={nodes}
            cameraIdRef={cameraIdRef}
            camRef={cameraFovRef}
            holdRef={holdRef}
            onSettled={syncCameraFromLive}
          />
        )}

        <ContactShadows position={[0, 0.11, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      </Canvas>

      {/* Manipulation tools: transform mode, camera view + capture, reset */}
      <div className="absolute bottom-16 left-6 flex items-center gap-3">
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

        {cameraObj && (
          <div className="flex items-center gap-1 rounded-full border border-border bg-bg-panel p-1">
            <button
              onClick={() => setLookingThrough((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                lookingThrough ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              {lookingThrough ? "Exit camera view" : "Camera view"}
            </button>
            <button
              onClick={capturePhoto}
              className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:text-fg"
            >
              Capture photo
            </button>
            <button
              onClick={toggleRecording}
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                isRecording ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              {isRecording ? "● Stop recording" : "Record clip"}
            </button>
          </div>
        )}

        <button
          onClick={resetLayout}
          className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          Reset layout
        </button>
      </div>

      {/* Creation tools: canned camera moves, and the inventory to add new objects */}
      <div className="absolute bottom-6 left-6 flex items-end gap-3">
        {cameraObj && (
          <div className="relative">
            {cameraMovesOpen && (
              <div className="absolute bottom-full left-0 mb-2 flex flex-col gap-2 rounded-2xl border border-border bg-bg-panel p-3">
                <div className="flex items-center gap-1">
                  <span className="pl-2 pr-1 text-[10px] uppercase tracking-[0.2em] text-fg-dim">Hold</span>
                  {(["dolly-zoom-in", "zoom", "pan"] as const).map((kind) => (
                    <button
                      key={kind}
                      onMouseDown={() => startHold(kind)}
                      onMouseUp={() => stopHold(kind)}
                      onMouseLeave={() => stopHold(kind)}
                      className={`rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                        activeHoldKind === kind ? "bg-accent text-bg font-medium" : "text-fg-dim hover:border-accent hover:text-fg"
                      }`}
                    >
                      {MOVE_LABELS[kind]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="pl-2 pr-1 text-[10px] uppercase tracking-[0.2em] text-fg-dim">Stop</span>
                  {(["linear", "quad"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStopStyle(s)}
                      title={s === "linear" ? "Stops abruptly the instant you release" : "Eases to a stop over ~0.4s"}
                      className={`rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                        stopStyle === s ? "bg-accent text-bg font-medium" : "text-fg-dim hover:border-accent hover:text-fg"
                      }`}
                    >
                      {s === "linear" ? "Linear" : "Quad"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setCameraMovesOpen((v) => !v)}
              className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                cameraMovesOpen
                  ? "border-accent bg-accent text-bg"
                  : "border-border bg-bg-panel text-fg-dim hover:border-accent hover:text-fg"
              }`}
            >
              {cameraMovesOpen ? "× Camera moves" : "+ Camera moves"}
            </button>
          </div>
        )}

        <div className="relative">
          {inventoryOpen && (
            <div className="absolute bottom-full left-0 mb-2 flex flex-col gap-2 rounded-2xl border border-border bg-bg-panel p-3">
              <div className="flex items-center gap-2">
                {([
                  ["Size", newSize, setNewSize],
                  ["L", newLength, setNewLength],
                  ["B", newBreadth, setNewBreadth],
                ] as const).map(([label, value, setValue]) => (
                  <span key={label} className="flex items-center gap-1 rounded-full border border-border py-1 pl-3 pr-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
                    <input
                      type="number"
                      min={0.2}
                      max={2}
                      step={0.1}
                      value={value}
                      onChange={(e) => setValue(Number(e.target.value) || DEFAULT_SIZE.box)}
                      className="w-11 rounded-full bg-transparent px-1 py-1 text-[10px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {([
                  ["box", "Box"],
                  ["ball", "Ball"],
                  ["mannequin", "Mannequin"],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={() => addFromInventory(kind)}
                    className="rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => setInventoryOpen((v) => !v)}
            className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.2em] transition-colors ${
              inventoryOpen
                ? "border-accent bg-accent text-bg"
                : "border-border bg-bg-panel text-fg-dim hover:border-accent hover:text-fg"
            }`}
          >
            {inventoryOpen ? "× Inventory" : "+ Inventory"}
          </button>
        </div>
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
