"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import {
  DEFAULT_POSE,
  KEYFRAME_EPSILON,
  TIMELINE_DURATION,
  type JointKey,
  type SceneObject,
  type Vec3,
} from "./types";
import { deleteKeyframeNear, interpolateTransform, upsertKeyframe } from "./keyframes";
import { SCENE_SCHEMA, parseScene } from "./scene";
import { FLY_BOOST, FLY_SPEED, MAX_FLY_DELTA, flyStep, hasFlyInput, lookStep, type FlyInput } from "./flyMath";
import { PosePanel, JOINT_LABELS } from "./PosePanel";
import { Mannequin } from "./Mannequin";
import { Timeline } from "./Timeline";
import { CastPanel } from "./CastPanel";
import { DEFAULT_MANNEQUIN_COLOR, STAGE_PALETTE } from "@/lib/stageColors";
import { JOINTS } from "@/lib/poses/model";
import { projectStageKeypoints, type StageMannequin } from "@/lib/stageKeypoints";

const BACKDROP_COLOR = "#e8e2d6";
// Chroma green for keying the captured clip in an editor.
const GREEN_SCREEN_COLOR = "#00b140";

export type Backdrop = { kind: "plain" } | { kind: "green" } | { kind: "image"; url: string };

/** Backdrop wall with a user-dropped image, scaled to cover the 12x8 wall
 * (cropped, not stretched). Unlit so the plate reads as-is on camera. */
function ImageBackdropWall({ url }: { url: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let tex: THREE.Texture | null = null;
    let cancelled = false;
    new THREE.TextureLoader().load(url, (t) => {
      if (cancelled) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      const img = t.image as { width: number; height: number };
      const wallAspect = 12 / 8;
      const imgAspect = img.width / img.height;
      if (imgAspect > wallAspect) {
        t.repeat.set(wallAspect / imgAspect, 1);
        t.offset.set((1 - t.repeat.x) / 2, 0);
      } else {
        t.repeat.set(1, imgAspect / wallAspect);
        t.offset.set(0, (1 - t.repeat.y) / 2);
      }
      tex = t;
      setTexture(t);
    });
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [url]);
  // Mount only once loaded: adding a map to an already-compiled material
  // doesn't recompile its shader, so it would render without the texture.
  if (!texture) return null;
  return (
    <mesh position={[0, 4, -2.89]}>
      <planeGeometry args={[12, 8]} />
      <meshBasicMaterial key={texture.uuid} map={texture} toneMapped={false} />
    </mesh>
  );
}
const PROP_COLOR = "#2a2a28";
const PALETTE = STAGE_PALETTE.map((c) => c.hex);
const DEFAULT_SIZE = { box: 0.8, ball: 0.5 };
// Handbag scale next to the ~1.75-unit mannequin.
const PURSE_SIZE = { height: 0.3, length: 0.45, breadth: 0.2 };
const PURSE_WALL = 0.012;
const DEFAULT_FOV = 50;
// Bump the suffix if SceneObject's shape ever changes, so old saved layouts
// are ignored instead of crashing on load. v2 adds mannequin `pose` and
// `keyframes`; v3 adds `castId` — all optional, but old saves are dropped
// anyway per convention.
const STORAGE_KEY = "director-stage-layout-v3";

// Opt-in "+ Keypoints" toggle: when on, Capture photo also downloads the eval
// keypoint JSON (evals/). Off by default so a normal capture is just the PNG.
// Read through useSyncExternalStore (same approach as usePoseLibrary) since the
// toggle is server-rendered DOM; falls back to memory if storage is blocked.
const EXPORT_KEYPOINTS_KEY = "director-stage-export-keypoints";
const EXPORT_KEYPOINTS_CHANGED = "director-stage-export-keypoints-changed";
let exportKeypointsFallback = false;
function subscribeExportKeypoints(notify: () => void) {
  window.addEventListener(EXPORT_KEYPOINTS_CHANGED, notify);
  return () => window.removeEventListener(EXPORT_KEYPOINTS_CHANGED, notify);
}
function readExportKeypoints(): boolean {
  try {
    return localStorage.getItem(EXPORT_KEYPOINTS_KEY) === "1";
  } catch {
    return exportKeypointsFallback;
  }
}
function writeExportKeypoints(on: boolean) {
  exportKeypointsFallback = on;
  try {
    localStorage.setItem(EXPORT_KEYPOINTS_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable — the in-memory fallback carries it for this session
  }
  window.dispatchEvent(new Event(EXPORT_KEYPOINTS_CHANGED));
}

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
 * Open-top hollow bag (floor + four walls + a strap), for shots from inside
 * it looking up — a solid box would back-face cull and the camera would see
 * straight through it. Walls are double-sided so the interior reads from
 * inside. The group origin is the bag's floor center, so it sits at y=0.
 */
function Purse({ id, position, rotation, color, height, length, breadth, selected, onSelect, objRef }: ItemProps & {
  position: Vec3;
  rotation: Vec3;
  color: string;
  height: number;
  length: number;
  breadth: number;
}) {
  const t = PURSE_WALL;
  const panels: { pos: Vec3; dims: Vec3 }[] = [
    { pos: [0, t / 2, 0], dims: [length, t, breadth] },
    { pos: [0, height / 2, breadth / 2 - t / 2], dims: [length, height, t] },
    { pos: [0, height / 2, -breadth / 2 + t / 2], dims: [length, height, t] },
    { pos: [length / 2 - t / 2, height / 2, 0], dims: [t, height, breadth] },
    { pos: [-length / 2 + t / 2, height / 2, 0], dims: [t, height, breadth] },
  ];
  const material = (
    <meshStandardMaterial
      color={color}
      roughness={0.6}
      side={THREE.DoubleSide}
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
      {panels.map(({ pos, dims }, i) => (
        <mesh key={i} position={pos} castShadow receiveShadow>
          <boxGeometry args={dims} />
          {material}
        </mesh>
      ))}
      {/* strap: half-torus arching over the opening along X */}
      <mesh position={[0, height, 0]} castShadow>
        <torusGeometry args={[length * 0.32, 0.012, 8, 24, Math.PI]} />
        {material}
      </mesh>
    </group>
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
      {/* near=0.01 so the camera can sit inside a purse without clipping its walls */}
      <PerspectiveCamera ref={camRef} makeDefault={lookingThrough} fov={fov} near={0.01} />
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
  playheadTime: number;
  poseModeId: number | null;
  activeJoint: JointKey | null;
  onSelectJoint: (joint: JointKey) => void;
  jointRef: (mannequinId: number, joint: JointKey, obj: THREE.Object3D | null) => void;
  backdrop: Backdrop;
};

/** The room shell (lights, walls, floor) plus every scene object. Box/ball/
 * mannequin render at their keyframe-interpolated transform when they have
 * keyframes, falling back to their static position/rotation otherwise —
 * computed here, declaratively, so there's nothing imperative fighting the
 * gizmo mid-drag (see the keyframe-aware branch of syncSelectedTransform in
 * StageScene for why that matters). */
function SceneContents({
  objects,
  selectedId,
  onSelect,
  objRef,
  lookingThroughId,
  cameraRef,
  playheadTime,
  poseModeId,
  activeJoint,
  onSelectJoint,
  jointRef,
  backdrop,
}: SceneContentsProps) {
  // Green screen covers wall + floor (a cyc), so the whole set keys out.
  // Wall is unlit (flat, even key); floor stays lit so contact shadows read.
  const floorColor = backdrop.kind === "green" ? GREEN_SCREEN_COLOR : BACKDROP_COLOR;
  return (
    <>
      <hemisphereLight args={[BACKDROP_COLOR, "#3a352c", 0.8]} />
      <ambientLight intensity={0.4} />

      {/* backdrop wall */}
      <mesh position={[0, 4, -3]} receiveShadow>
        <boxGeometry args={[12, 8, 0.2]} />
        {backdrop.kind === "green" ? (
          <meshBasicMaterial key="green" color={GREEN_SCREEN_COLOR} toneMapped={false} />
        ) : (
          <meshStandardMaterial key="lit" color={BACKDROP_COLOR} roughness={1} />
        )}
      </mesh>
      {backdrop.kind === "image" && <ImageBackdropWall url={backdrop.url} />}
      {/* floor */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[12, 0.2, 8]} />
        <meshStandardMaterial color={floorColor} roughness={1} />
      </mesh>

      {objects.map((o) => {
        const common = { id: o.id, selected: o.id === selectedId, onSelect, objRef };
        const kf = o.keyframes?.length ? interpolateTransform(o.keyframes, playheadTime) : null;
        const displayPosition = kf?.position ?? o.position;
        const displayRotation = kf?.rotation ?? o.rotation;

        if (o.kind === "box" || o.kind === "ball") {
          return (
            <ShapeProp
              key={o.id}
              {...common}
              shape={o.kind}
              position={displayPosition}
              rotation={displayRotation}
              color={o.color ?? PALETTE[0]}
              size={o.size ?? DEFAULT_SIZE[o.kind]}
              length={o.length}
              breadth={o.breadth}
            />
          );
        }
        if (o.kind === "purse") {
          return (
            <Purse
              key={o.id}
              {...common}
              position={displayPosition}
              rotation={displayRotation}
              color={o.color ?? PALETTE[0]}
              height={o.size ?? PURSE_SIZE.height}
              length={o.length ?? PURSE_SIZE.length}
              breadth={o.breadth ?? PURSE_SIZE.breadth}
            />
          );
        }
        if (o.kind === "light") {
          return <LightStand key={o.id} {...common} position={o.position} rotation={o.rotation} />;
        }
        if (o.kind === "mannequin") {
          return (
            <Mannequin
              key={o.id}
              {...common}
              position={displayPosition}
              rotation={displayRotation}
              color={o.color ?? DEFAULT_MANNEQUIN_COLOR}
              pose={o.pose}
              poseMode={o.id === poseModeId}
              activeJoint={o.id === poseModeId ? activeJoint : null}
              onSelectJoint={onSelectJoint}
              jointRef={(joint, obj) => jointRef(o.id, joint, obj)}
            />
          );
        }
        return (
          <CameraMarker
            key={o.id}
            {...common}
            position={displayPosition}
            rotation={displayRotation}
            lookingThrough={o.id === lookingThroughId}
            fov={o.fov ?? DEFAULT_FOV}
            camRef={cameraRef}
          />
        );
      })}
    </>
  );
}

type MoveKind = "dolly-zoom-in" | "dolly-zoom-out" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-top" | "pan-bottom" | "roll-left" | "roll-right";

// Key bound to each move — held down (not clicked) to run it.
const MOVE_KEYS: Record<string, MoveKind> = {
  i: "dolly-zoom-in",
  o: "dolly-zoom-out",
  z: "zoom-in",
  x: "zoom-out",
  p: "pan-right",
  l: "pan-left",
  t: "pan-top",
  b: "pan-bottom",
  ".": "roll-right",
  ",": "roll-left",
};
// Short label shown on each button — paired with the row's own move-name label.
const MOVE_SHORT_LABELS: Record<MoveKind, string> = {
  "dolly-zoom-in": "In (I)",
  "dolly-zoom-out": "Out (O)",
  "zoom-in": "In (Z)",
  "zoom-out": "Out (X)",
  "pan-left": "Left (L)",
  "pan-right": "Right (P)",
  "pan-top": "Top (T)",
  "pan-bottom": "Bottom (B)",
  "roll-left": "Left (,)",
  "roll-right": "Right (.)",
};
// Row groupings for the popover: [negative-direction kind, positive-direction kind, row label].
const MOVE_ROWS = [
  ["dolly-zoom-out", "dolly-zoom-in", "Dolly zoom"],
  ["zoom-out", "zoom-in", "Zoom"],
  ["pan-top", "pan-bottom", "Tilt / pitch"],
  ["pan-left", "pan-right", "Pan / yaw"],
  ["roll-left", "roll-right", "Roll"],
] as const;
// How fast each move progresses per second while held.
const MOVE_RATES: Record<MoveKind, number> = {
  "dolly-zoom-in": 2,
  "dolly-zoom-out": 2,
  "zoom-in": 14,
  "zoom-out": 14,
  "pan-left": 24,
  "pan-right": 24,
  "pan-top": 24,
  "pan-bottom": 24,
  "roll-left": 24,
  "roll-right": 24,
};
const MIN_FOV = 8;
const MAX_FOV = 100;
const MIN_DOLLY_DIST = 0.5;
const MAX_DOLLY_DIST = 10;

type HoldState = {
  kind: MoveKind;
  k?: number; // dolly-zoom-in/out only: apparent-size constant fixed at grab time
};

// Whip moves: one click plays a short, eased, self-terminating sweep —
// unlike a MoveKind hold, they don't run for as long as you hold them down.
type WhipKind = "whip-pan-left" | "whip-pan-right" | "whip-dolly-zoom-in" | "whip-dolly-zoom-out";
const WHIP_SHORT_LABELS: Record<WhipKind, string> = {
  "whip-pan-left": "Left",
  "whip-pan-right": "Right",
  "whip-dolly-zoom-in": "In",
  "whip-dolly-zoom-out": "Out",
};
const WHIP_ROWS = [
  ["whip-dolly-zoom-out", "whip-dolly-zoom-in", "Dolly zoom"],
  ["whip-pan-left", "whip-pan-right", "Pan"],
] as const;
const WHIP_DURATION_MS = 220;
const WHIP_PAN_ANGLE_DEG = 45;
const WHIP_DOLLY_FACTOR = 2; // whip-in halves distance to focus, whip-out doubles it

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type WhipState = {
  kind: WhipKind;
  start: number; // performance.now() at click
  from: number; // starting rotation.y (pan) or distance-to-focus (dolly)
  to: number; // eased target for the same quantity
  k?: number; // dolly only: apparent-size constant fixed at click, as with HoldState
  focus?: THREE.Vector3; // dolly only
  dir?: THREE.Vector3; // dolly only: fixed unit vector from focus out to the camera's start position
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
}: {
  nodesRef: React.RefObject<Map<number, THREE.Object3D>>;
  cameraIdRef: React.RefObject<number | null>;
  camRef: React.RefObject<THREE.PerspectiveCamera | null>;
  holdRef: React.RefObject<HoldState | null>;
}) {
  // Reused every frame instead of `new THREE.Vector3()` inside useFrame —
  // allocating there was GC pressure on every single frame of a held dolly
  // move (zoom/pan don't allocate anything per frame, which is why only
  // dolly ever jittered).
  const dirRef = useRef(new THREE.Vector3());
  const focusRef = useRef(new THREE.Vector3(0, 1, 0));

  useFrame((_, delta) => {
    const hold = holdRef.current;
    const cameraId = cameraIdRef.current;
    if (!hold || cameraId === null) return;
    const camNode = nodesRef.current.get(cameraId);
    const cam = camRef.current;
    if (!camNode || !cam) return;

    const rate = MOVE_RATES[hold.kind];

    if (hold.kind === "zoom-in" || hold.kind === "zoom-out") {
      // FOV only — a plain optical zoom, camera stays put.
      const sign = hold.kind === "zoom-in" ? -1 : 1;
      cam.fov = THREE.MathUtils.clamp(cam.fov + sign * rate * delta, MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
    } else if (hold.kind === "pan-left" || hold.kind === "pan-right") {
      // Rotate in place — position/FOV untouched, matches swinging a camera
      // on a fixed tripod head.
      const sign = hold.kind === "pan-right" ? 1 : -1;
      camNode.rotation.y += sign * THREE.MathUtils.degToRad(rate * delta);
    } else if (hold.kind === "pan-top" || hold.kind === "pan-bottom") {
      // Tilt — same idea as pan, but around the local X axis.
      const sign = hold.kind === "pan-top" ? 1 : -1;
      camNode.rotation.x += sign * THREE.MathUtils.degToRad(rate * delta);
    } else if (hold.kind === "roll-left" || hold.kind === "roll-right") {
      // Roll — rotate around the local Z axis.
      const sign = hold.kind === "roll-right" ? 1 : -1;
      camNode.rotation.z += sign * THREE.MathUtils.degToRad(rate * delta);
    } else if ((hold.kind === "dolly-zoom-in" || hold.kind === "dolly-zoom-out") && hold.k !== undefined) {
      // Move along the focus axis while adjusting FOV to compensate, so the
      // focus point stays the same apparent size and the background warps —
      // the actual Vertigo/"trombone" effect, not a plain push-in/pull-out.
      // Derivation: apparent size ∝ 1 / (distance · tan(fov/2)), so holding
      // that product constant (k, fixed at grab time) gives fov from dist.
      //
      // Must track straight toward/away from the focus point, NOT the
      // camera's facing direction — the camera is basically never aimed
      // exactly at the focus (even the default pose is off by a few
      // degrees, more so after a pan/tilt/roll). Sliding along facing-
      // direction instead of the to-focus radius let position drift past
      // the ray's closest approach to the focus; once past that point,
      // moving further in the same fixed forward direction *increased*
      // distance-to-focus while the loop still thought it was dollying in,
      // so it kept pushing forward — a feedback runaway on long holds.
      const sign = hold.kind === "dolly-zoom-in" ? -1 : 1;
      const focus = focusRef.current;
      const dir = dirRef.current.subVectors(focus, camNode.position).normalize();
      const dist = camNode.position.distanceTo(focus);
      const newDist = THREE.MathUtils.clamp(dist + sign * rate * delta, MIN_DOLLY_DIST, MAX_DOLLY_DIST);
      camNode.position.addScaledVector(dir, dist - newDist);
      cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(hold.k / newDist)), MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

/** Drives a whip move: unlike HoldMoveAnimator, this runs to completion on
 * its own timer once started — from/to and duration are fixed at click time
 * (startWhip), so this component just interpolates between them every frame
 * with an ease-in/ease-out curve and clears itself (and calls onSettled)
 * when the timer runs out. */
function WhipMoveAnimator({
  nodesRef,
  cameraIdRef,
  camRef,
  whipRef,
  onSettled,
}: {
  nodesRef: React.RefObject<Map<number, THREE.Object3D>>;
  cameraIdRef: React.RefObject<number | null>;
  camRef: React.RefObject<THREE.PerspectiveCamera | null>;
  whipRef: React.RefObject<WhipState | null>;
  onSettled: () => void;
}) {
  useFrame(() => {
    const whip = whipRef.current;
    const cameraId = cameraIdRef.current;
    if (!whip || cameraId === null) return;
    const camNode = nodesRef.current.get(cameraId);
    const cam = camRef.current;
    if (!camNode || !cam) return;

    const t = Math.min((performance.now() - whip.start) / WHIP_DURATION_MS, 1);
    const eased = easeInOutCubic(t);

    if (whip.kind === "whip-pan-left" || whip.kind === "whip-pan-right") {
      camNode.rotation.y = whip.from + (whip.to - whip.from) * eased;
    } else if (whip.k !== undefined && whip.focus && whip.dir) {
      const dist = whip.from + (whip.to - whip.from) * eased;
      camNode.position.copy(whip.focus).addScaledVector(whip.dir, dist);
      cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(whip.k / dist)), MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
    }

    if (t >= 1) {
      whipRef.current = null;
      onSettled();
    }
  });

  return null;
}

/**
 * Fly controls for the camera while looking through it: W/A/S/D move along
 * the view (Q/E down/up, Shift for boost), and holding the right mouse button
 * while dragging looks around. F + primary drag and the Drag to look
 * toggle offer the same control without a secondary mouse button.
 * Like the move animators, it mutates the
 * camera's live node directly every frame and only writes back to React
 * state (`onSettled`) once the input stops, so there's no re-render per frame.
 * Look gestures are intercepted before gizmos and click-to-select.
 * Does nothing outside camera view, and yields to a whip
 * move that's mid-flight since both drive the same node.
 */
function FlyController({
  active,
  dragLookEnabled,
  nodesRef,
  cameraIdRef,
  whipRef,
  onSettled,
}: {
  active: boolean;
  dragLookEnabled: boolean;
  nodesRef: React.RefObject<Map<number, THREE.Object3D>>;
  cameraIdRef: React.RefObject<number | null>;
  whipRef: React.RefObject<WhipState | null>;
  onSettled: () => void;
}) {
  const canvas = useThree((s) => s.gl.domElement);
  const keys = useRef(new Set<string>());
  const input = useRef<FlyInput>({ forward: 0, right: 0, up: 0 });
  const wasMoving = useRef(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!active) return;
    const pressed = keys.current;
    let lookPointerId: number | null = null;
    let lookButton = 2;
    let suppressClick = false;
    let lastX = 0;
    let lastY = 0;
    const originalCursor = canvas.style.cursor;
    const updateCursor = () => {
      canvas.style.setProperty("cursor", lookPointerId !== null ? "grabbing" : dragLookEnabled || pressed.has("KeyF") ? "grab" : originalCursor);
    };
    const stopLooking = () => {
      if (lookPointerId === null) return;
      const pointerId = lookPointerId;
      lookPointerId = null;
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      updateCursor();
      onSettledRef.current();
    };
    updateCursor();

    const cameraNode = () => {
      const id = cameraIdRef.current;
      return id === null ? undefined : nodesRef.current.get(id);
    };
    const flushMoving = () => {
      if (wasMoving.current) {
        wasMoving.current = false;
        onSettledRef.current();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      pressed.add(e.code);
      if (e.code === "KeyF") {
        e.preventDefault();
        updateCursor();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressed.delete(e.code);
      if (e.code === "KeyF") {
        if (!dragLookEnabled && lookButton === 0) stopLooking();
        updateCursor();
      }
    };
    const onBlur = () => {
      pressed.clear();
      stopLooking();
      updateCursor();
      flushMoving();
    };
    const onPointerDown = (e: PointerEvent) => {
      suppressClick = false;
      if (e.button !== 2 && !(e.button === 0 && (dragLookEnabled || pressed.has("KeyF")))) return;
      if (lookPointerId !== null) return;
      // Capture before the scene/gizmo handlers, so a look drag cannot
      // select or manipulate a prop beneath the pointer.
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClick = true;
      lookPointerId = e.pointerId;
      lookButton = e.button;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      updateCursor();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const node = cameraNode();
      if (node && !whipRef.current) lookStep(node.quaternion, dx, dy);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== lookPointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      stopLooking();
    };
    const onLostPointerCapture = (e: PointerEvent) => {
      if (e.pointerId === lookPointerId) stopLooking();
    };
    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", onPointerUp, true);
    canvas.addEventListener("pointercancel", onPointerUp, true);
    canvas.addEventListener("lostpointercapture", onLostPointerCapture);
    canvas.addEventListener("click", onClick, true);
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", onPointerUp, true);
      canvas.removeEventListener("pointercancel", onPointerUp, true);
      canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
      canvas.removeEventListener("click", onClick, true);
      canvas.removeEventListener("contextmenu", onContextMenu);
      pressed.clear();
      stopLooking();
      canvas.style.setProperty("cursor", originalCursor);
      flushMoving();
    };
  }, [active, dragLookEnabled, canvas, cameraIdRef, nodesRef, whipRef]);

  useFrame((_, delta) => {
    if (!active) return;
    const pressed = keys.current;
    const axis = (pos: string, neg: string) => (pressed.has(pos) ? 1 : 0) - (pressed.has(neg) ? 1 : 0);
    const i = input.current;
    i.forward = axis("KeyW", "KeyS");
    i.right = axis("KeyD", "KeyA");
    i.up = axis("KeyE", "KeyQ");

    const moving = hasFlyInput(i);
    const cameraId = cameraIdRef.current;
    const node = cameraId === null ? undefined : nodesRef.current.get(cameraId);
    if (moving && node && !whipRef.current) {
      const boost = pressed.has("ShiftLeft") || pressed.has("ShiftRight") ? FLY_BOOST : 1;
      // capped so a stalled frame (tab switch, GC hitch) can't lurch the camera
      flyStep(node.position, node.quaternion, i, FLY_SPEED * boost, Math.min(delta, MAX_FLY_DELTA));
    }
    if (wasMoving.current && !moving) onSettledRef.current();
    wasMoving.current = moving;
  });

  return null;
}

/** Advances the timeline playhead while playing. A plain useFrame instead of
 * a setInterval/rAF loop of its own, and reads isPlaying/duration straight
 * from props (refreshed every render) rather than a ref, since every
 * playhead tick already causes a React re-render anyway (the Timeline UI
 * needs it), so there's no stale-closure concern to dodge here — unlike
 * HoldMoveAnimator above, which deliberately avoids per-frame React state. */
function PlaybackDriver({ isPlaying, duration, onFrame }: { isPlaying: boolean; duration: number; onFrame: (delta: number) => void }) {
  useFrame((_, delta) => {
    if (!isPlaying) return;
    onFrame(Math.min(delta, duration));
  });
  return null;
}

/** Bottom-right readout of the selected object's live transform (or, in
 * Pose mode, the active joint's rotation). */
function TransformReadout({ mode, position, rotation, label }: { mode: "translate" | "rotate"; position: Vec3; rotation: Vec3; label?: string }) {
  if (mode === "translate") {
    const [x, y, z] = position;
    return (
      <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">
        x {x.toFixed(2)} · y {y.toFixed(2)} · z {z.toFixed(2)}
      </p>
    );
  }
  const [rx, ry, rz] = rotation.map((r) => THREE.MathUtils.radToDeg(r));
  return (
    <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">
      {label ? `${label} — ` : ""}pitch {rx.toFixed(0)}° · yaw {ry.toFixed(0)}° · roll {rz.toFixed(0)}°
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
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate" | "pose">("translate");
  const [activeJoint, setActiveJoint] = useState<JointKey | null>("leftArm");
  const [newSize, setNewSize] = useState(0.8);
  const [newLength, setNewLength] = useState(0.8);
  const [newBreadth, setNewBreadth] = useState(0.8);
  const [lookingThrough, setLookingThrough] = useState(false);
  const [dragLookEnabled, setDragLookEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const [orbitCamera, setOrbitCamera] = useState<THREE.PerspectiveCamera | null>(null);
  const [backdrop, setBackdrop] = useState<Backdrop>({ kind: "plain" });
  // Session-only: the object URL dies with the tab, so the image isn't persisted.
  useEffect(() => {
    if (backdrop.kind !== "image") return;
    return () => URL.revokeObjectURL(backdrop.url);
  }, [backdrop]);
  const exportKeypoints = useSyncExternalStore(subscribeExportKeypoints, readExportKeypoints, () => false);
  const [cameraMovesOpen, setCameraMovesOpen] = useState(false);
  // Mirrors holdRef for UI highlighting only — the physics itself never
  // reads this, so it doesn't need to update every frame.
  const [activeHoldKind, setActiveHoldKind] = useState<MoveKind | null>(null);
  // Mirrors whipRef for UI highlighting only, same reasoning as activeHoldKind.
  const [activeWhipKind, setActiveWhipKind] = useState<WhipKind | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const cameraFovRef = useRef<THREE.PerspectiveCamera | null>(null);
  // Whether capture/recording auto-entered camera view (vs. the user already
  // being there) — only auto-entered sessions auto-exit when done.
  const autoEnteredCameraView = useRef(false);
  const holdRef = useRef<HoldState | null>(null);
  const whipRef = useRef<WhipState | null>(null);

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function capturePhoto() {
    // No canvas until the renderer is created (onCreated) — bail before
    // switching views, or an early click strands you in camera view.
    if (!cameraObj || !canvasEl.current) return;
    const wasLookingThrough = lookingThrough;
    if (!wasLookingThrough) {
      setLookingThrough(true);
      await waitFrames(3);
    }
    const canvas = canvasEl.current;
    const cam = cameraFovRef.current;
    const ts = Date.now();
    // Blocking ground truth for the Screen Test eval (evals/), saved beside the photo.
    if (exportKeypoints && canvas && cam) {
      const mannequins: StageMannequin[] = objects
        .filter((o) => o.kind === "mannequin")
        .map((o) => ({
          color: o.color ?? DEFAULT_MANNEQUIN_COLOR,
          castId: o.castId ?? null,
          joints: Object.fromEntries(
            JOINTS.flatMap((j) => {
              const node = jointNodes.current.get(`${o.id}:${j}`);
              return node ? [[j, node]] : [];
            })
          ),
        }));
      const keypoints = projectStageKeypoints(cam, mannequins, [canvas.width, canvas.height]);
      downloadBlob(new Blob([JSON.stringify(keypoints, null, 2)], { type: "application/json" }), `stage-photo-${ts}.json`);
    }
    canvas?.toBlob((blob) => {
      if (blob) downloadBlob(blob, `stage-photo-${ts}.png`);
      if (!wasLookingThrough) setLookingThrough(false);
    }, "image/png");
  }

  // Set while a "Record take" is running: the recorder stops itself when
  // timeline playback reaches the end (see the effect below).
  const recordingTake = useRef(false);

  async function recordTake() {
    if (isRecording || !cameraObj) return;
    setIsPlaying(false);
    setPlayheadTime(0);
    await toggleRecording();
    // toggleRecording can bail before starting (no canvas yet) — only arm
    // the take if a recorder is actually running.
    if (mediaRecorder.current?.state !== "recording") return;
    recordingTake.current = true;
    setIsPlaying(true);
  }

  useEffect(() => {
    if (isRecording && recordingTake.current && !isPlaying) {
      recordingTake.current = false;
      mediaRecorder.current?.stop();
    }
  }, [isRecording, isPlaying]);

  async function toggleRecording() {
    if (isRecording) {
      mediaRecorder.current?.stop();
      return;
    }
    // Same early-click guard as capturePhoto.
    if (!cameraObj || !canvasEl.current) return;
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
      // Every stop path (button, take end, pause) lands here, so a take cut
      // short can't leave the flag set and kill the next manual recording.
      recordingTake.current = false;
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

  // Keyed `${mannequinId}:${joint}` — a mannequin's own root node lives in
  // `nodes` above via the same objRef path every other object uses; this map
  // contains the articulated joint nodes nested inside it.
  const jointNodes = useRef(new Map<string, THREE.Object3D>());
  const setJointRef = (mannequinId: number, joint: JointKey, obj: THREE.Object3D | null) => {
    const key = `${mannequinId}:${joint}`;
    if (obj) jointNodes.current.set(key, obj);
    else jointNodes.current.delete(key);
  };

  // Ctrl is tracked on window rather than read from the gizmo's mouse event,
  // since TransformControls' onMouseDown doesn't forward the source PointerEvent.
  const ctrlHeld = useRef(false);
  const nextId = useRef(Math.max(1000, ...objects.map((o) => o.id + 1)));
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      ctrlHeld.current = e.ctrlKey;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
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

  // Auto-save on every change (drag, rotate, pose, keyframe, add, duplicate).
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

  /** Whole scene as JSON (the same objects array the layout persists), so a
   * shot can be authored by hand or by an LLM/agent and loaded back in. */
  function exportScene() {
    const blob = new Blob([JSON.stringify({ schema: SCENE_SCHEMA, objects }, null, 2)], { type: "application/json" });
    downloadBlob(blob, `stage-scene-${Date.now()}.json`);
  }

  async function importScene(file: File) {
    try {
      const loaded = parseScene(JSON.parse(await file.text()));
      nextId.current = Math.max(nextId.current, ...loaded.map((o) => o.id + 1));
      setObjects(loaded);
      setSelectedId(null);
      setGizmoMode("translate");
      setPlayheadTime(0);
      setIsPlaying(false);
    } catch (err) {
      alert(`Couldn't load scene: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function resetLayout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setObjects(INITIAL_OBJECTS);
    setSelectedId(null);
    setGizmoMode("translate");
    setActiveJoint(null);
    setPlayheadTime(0);
    setIsPlaying(false);
  }

  const cameraObj = objects.find((o) => o.kind === "camera") ?? null;
  // Not tied to selection — capture/record and the move presets need to
  // engage the camera's view regardless of what's currently selected.
  const lookingThroughId = lookingThrough ? (cameraObj?.id ?? null) : null;

  // Mirrored into a ref so the
  // mount-once keydown/keyup listeners always see the current camera id
  // without needing to be torn down and rebuilt on every objects change.
  const cameraIdRef = useRef<number | null>(cameraObj?.id ?? null);
  useEffect(() => {
    cameraIdRef.current = cameraObj?.id ?? null;
  }, [cameraObj?.id]);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const canDuplicate = selected?.kind === "box" || selected?.kind === "ball" || selected?.kind === "purse";
  const canKeyframeSelection =
    selected?.kind === "box" ||
    selected?.kind === "ball" ||
    selected?.kind === "purse" ||
    selected?.kind === "mannequin" ||
    selected?.kind === "camera";

  // Refs attach during the commit that follows a selectedId change, so the
  // live Object3D isn't readable until an effect runs after that commit —
  // reading nodes.current straight in the render body would risk a stale
  // (pre-attach) value on the render where selection just changed.
  const [selectedNode, setSelectedNode] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    setSelectedNode(selectedId !== null ? (nodes.current.get(selectedId) ?? null) : null);
  }, [selectedId]);

  // Pose mode only applies to a selected mannequin — derived rather than
  // synced back into `gizmoMode` via an effect, so selecting something else
  // falls back to Move/Rotate for this render without a cascading update.
  const selectedKind = selected?.kind ?? null;
  const effectiveGizmoMode = gizmoMode === "pose" && selectedKind !== "mannequin" ? "translate" : gizmoMode;
  const effectiveActiveJoint = effectiveGizmoMode === "pose" ? activeJoint : null;

  const [activeJointNode, setActiveJointNode] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    setActiveJointNode(
      selectedId !== null && effectiveActiveJoint
        ? (jointNodes.current.get(`${selectedId}:${effectiveActiveJoint}`) ?? null)
        : null
    );
  }, [selectedId, effectiveActiveJoint]);

  function addFromInventory(kind: "box" | "ball" | "purse" | "mannequin") {
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
    } else if (kind === "purse") {
      // fixed handbag scale; the Size/L/B inputs are box-scale. Lifted onto
      // the floor's top face (y=0.1) so the opening isn't partly buried.
      base.position = [0, 0.1, 2];
      base.size = PURSE_SIZE.height;
      base.length = PURSE_SIZE.length;
      base.breadth = PURSE_SIZE.breadth;
    }
    // mannequin stands at y=0 — its own geometry is already floor-relative,
    // and its rest pose defaults inside the Mannequin component
    setObjects((prev) => [...prev, base]);
    setInventoryOpen(false);
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
  //
  // A keyframed object skips the write instead: its rendered position comes
  // from interpolating keyframes (see SceneContents), not from these base
  // fields, so writing here would do nothing useful — and since we don't
  // touch `objects`, nothing re-renders mid-drag to fight the gizmo's own
  // direct mutation of the node. The drag is only made permanent by an
  // explicit "+ Key" click, which reads the (now-dragged) live node.
  function syncSelectedTransform() {
    if (selectedId === null || !selectedNode || selected?.keyframes?.length) return;
    const { x, y, z } = selectedNode.position;
    const rotation: Vec3 = [selectedNode.rotation.x, selectedNode.rotation.y, selectedNode.rotation.z];
    setObjects((prev) => prev.map((o) => (o.id === selectedId ? { ...o, position: [x, y, z], rotation } : o)));
  }

  /** Same idea as syncSelectedTransform, but for one limb's pivot rotation —
   * joint poses are never keyframed (static/manual only), so this always
   * writes straight through. */
  function syncJointTransform() {
    if (selectedId === null || !effectiveActiveJoint || !activeJointNode) return;
    const rotation: Vec3 = [activeJointNode.rotation.x, activeJointNode.rotation.y, activeJointNode.rotation.z];
    setObjects((prev) =>
      prev.map((o) =>
        o.id === selectedId ? { ...o, pose: { ...DEFAULT_POSE, ...o.pose, [effectiveActiveJoint]: rotation } } : o
      )
    );
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
  // already in progress (keyboard auto-repeat would otherwise re-arm a
  // dolly-zoom move's fixed `k` constant every ~30ms).
  function startHold(kind: MoveKind) {
    const cameraId = cameraIdRef.current;
    if (cameraId === null) return;
    const camNode = nodes.current.get(cameraId);
    const cam = cameraFovRef.current;
    if (!camNode || !cam) return;
    if (holdRef.current?.kind === kind) return;

    // A hold and a whip both drive the same camera node directly — starting
    // one while the other is mid-flight would fight over its position/FOV.
    if (whipRef.current) {
      whipRef.current = null;
      setActiveWhipKind(null);
    }

    const state: HoldState = { kind };
    if (kind === "dolly-zoom-in" || kind === "dolly-zoom-out") {
      const focus = new THREE.Vector3(0, 1, 0);
      const d0 = camNode.position.distanceTo(focus);
      state.k = d0 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    }
    holdRef.current = state;
    setActiveHoldKind(kind);
  }

  // Released on keyup/mouseup/mouseleave — stops immediately, no ease-out.
  function stopHold(kind: MoveKind) {
    if (holdRef.current?.kind !== kind) return;
    holdRef.current = null;
    syncCameraFromLive();
    setActiveHoldKind(null);
  }

  // Fired on click, not held. Unlike a hold, a whip doesn't need a matching
  // "stop" call — WhipMoveAnimator runs it to completion on its own timer
  // and syncs the result back via onSettled.
  function startWhip(kind: WhipKind) {
    const cameraId = cameraIdRef.current;
    if (cameraId === null) return;
    const camNode = nodes.current.get(cameraId);
    const cam = cameraFovRef.current;
    if (!camNode || !cam) return;
    if (whipRef.current) return; // let the current whip finish before starting another

    if (holdRef.current) {
      holdRef.current = null;
      setActiveHoldKind(null);
    }

    if (kind === "whip-pan-left" || kind === "whip-pan-right") {
      const sign = kind === "whip-pan-right" ? 1 : -1;
      whipRef.current = {
        kind,
        start: performance.now(),
        from: camNode.rotation.y,
        to: camNode.rotation.y + sign * THREE.MathUtils.degToRad(WHIP_PAN_ANGLE_DEG),
      };
    } else {
      const focus = new THREE.Vector3(0, 1, 0);
      const dir = camNode.position.clone().sub(focus).normalize();
      const d0 = camNode.position.distanceTo(focus);
      const factor = kind === "whip-dolly-zoom-in" ? 1 / WHIP_DOLLY_FACTOR : WHIP_DOLLY_FACTOR;
      const to = THREE.MathUtils.clamp(d0 * factor, MIN_DOLLY_DIST, MAX_DOLLY_DIST);
      whipRef.current = {
        kind,
        start: performance.now(),
        from: d0,
        to,
        k: d0 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2),
        focus,
        dir,
      };
    }
    setActiveWhipKind(kind);
  }

  function togglePlay() {
    if (!isPlaying && playheadTime >= TIMELINE_DURATION) setPlayheadTime(0);
    setIsPlaying((p) => !p);
  }

  /** Captures the selected object's current live transform (its dragged
   * position if mid-edit, its interpolated one otherwise) as a keyframe at
   * the current playhead time — the only way a keyframed object's pose
   * actually changes, and how a static object gets its first keyframe. */
  function addKeyframe() {
    if (!selected || !selectedNode || !canKeyframeSelection) return;
    const { x, y, z } = selectedNode.position;
    const rotation: Vec3 = [selectedNode.rotation.x, selectedNode.rotation.y, selectedNode.rotation.z];
    setObjects((prev) =>
      prev.map((o) =>
        o.id === selected.id ? { ...o, keyframes: upsertKeyframe(o.keyframes, playheadTime, [x, y, z], rotation) } : o
      )
    );
  }

  function deleteKeyframe() {
    if (!selected) return;
    const { keyframes, removed } = deleteKeyframeNear(selected.keyframes, playheadTime);
    if (!removed) return;
    setObjects((prev) =>
      prev.map((o) => {
        if (o.id !== selected.id) return o;
        if (keyframes.length === 0) {
          // last keyframe gone — freeze at its pose so the object doesn't
          // jump back to whatever the base position/rotation used to be
          return { ...o, keyframes: undefined, position: removed.position, rotation: removed.rotation };
        }
        return { ...o, keyframes };
      })
    );
  }

  const keyframeTimes = selected?.keyframes?.map((k) => k.time) ?? [];
  const hasKeyframeAtPlayhead = !!selected?.keyframes?.some((k) => Math.abs(k.time - playheadTime) < KEYFRAME_EPSILON);
  const selectedDisplay =
    selected && (selected.keyframes?.length ? interpolateTransform(selected.keyframes, playheadTime) : { position: selected.position, rotation: selected.rotation });

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
        <PerspectiveCamera ref={setOrbitCamera} makeDefault={!lookingThrough} position={[3.5, 2.2, 5]} fov={45} />
        {/* Pinned to the orbit camera: left to follow the default camera, the
            controls get rebuilt on the look-through swap and OrbitControls'
            constructor re-aims the shot camera at the world origin. */}
        <OrbitControls
          camera={orbitCamera ?? undefined}
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
          playheadTime={playheadTime}
          poseModeId={effectiveGizmoMode === "pose" ? selectedId : null}
          activeJoint={effectiveActiveJoint}
          onSelectJoint={setActiveJoint}
          jointRef={setJointRef}
          backdrop={backdrop}
        />

        {selectedNode && effectiveGizmoMode !== "pose" && !isPlaying && (
          <TransformControls
            object={selectedNode}
            mode={effectiveGizmoMode}
            space={effectiveGizmoMode === "translate" ? "world" : "local"}
            onMouseDown={handleGizmoMouseDown}
            onObjectChange={syncSelectedTransform}
          />
        )}

        {activeJointNode && effectiveGizmoMode === "pose" && !isPlaying && (
          <TransformControls object={activeJointNode} mode="rotate" space="local" onObjectChange={syncJointTransform} />
        )}

        {cameraObj && (
          <>
            <HoldMoveAnimator nodesRef={nodes} cameraIdRef={cameraIdRef} camRef={cameraFovRef} holdRef={holdRef} />
            <WhipMoveAnimator
              nodesRef={nodes}
              cameraIdRef={cameraIdRef}
              camRef={cameraFovRef}
              whipRef={whipRef}
              onSettled={() => {
                syncCameraFromLive();
                setActiveWhipKind(null);
              }}
            />
            <FlyController
              active={lookingThrough}
              dragLookEnabled={dragLookEnabled}
              nodesRef={nodes}
              cameraIdRef={cameraIdRef}
              whipRef={whipRef}
              onSettled={syncCameraFromLive}
            />
          </>
        )}

        <PlaybackDriver
          isPlaying={isPlaying}
          duration={TIMELINE_DURATION}
          onFrame={(delta) => {
            // Stops (doesn't loop) once the playhead reaches the end. This
            // is a useFrame callback, not a React effect, so setting two
            // pieces of state from it directly — rather than deriving the
            // stop from an effect watching playheadTime — is the intended
            // "notify React from an external system" pattern, not the
            // derived-state-in-an-effect anti-pattern.
            const next = Math.min(playheadTime + delta, TIMELINE_DURATION);
            setPlayheadTime(next);
            if (next >= TIMELINE_DURATION) setIsPlaying(false);
          }}
        />

        <ContactShadows position={[0, 0.11, 0]} opacity={0.4} scale={10} blur={2} far={4} />
      </Canvas>

      {lookingThrough && (
        <div aria-label="Camera view controls" className="absolute left-1/2 top-6 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-bg-panel py-1.5 pl-4 pr-2 text-[11px] text-fg-dim shadow-sm">
            <span className="hidden whitespace-nowrap sm:inline">W A S D move</span>
            <span className="hidden whitespace-nowrap sm:inline">{dragLookEnabled ? "Left-drag to look" : "F + left-drag to look"}</span>
            <button
              type="button"
              aria-pressed={dragLookEnabled}
              aria-label={`Drag to look ${dragLookEnabled ? "on" : "off"}`}
              onClick={() => setDragLookEnabled((v) => !v)}
              className={`shrink-0 rounded-full border px-3 py-1.5 transition-colors ${
                dragLookEnabled ? "border-accent bg-accent text-bg font-medium" : "border-border hover:border-accent hover:text-fg"
              }`}
            >
              Drag to look {dragLookEnabled ? "on" : "off"}
            </button>
            <details className="group shrink-0">
              <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-fg transition-colors hover:bg-border [&::-webkit-details-marker]:hidden">
                Shortcuts <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="absolute right-0 top-full mt-2 max-h-[60vh] w-[360px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-bg-panel p-4 text-xs leading-5 shadow-lg">
                <p className="mb-3 text-fg">Hold a key to move. Release it to stop.</p>
                {([
                  ["Movement", [["W / S", "Forward / back"], ["A / D", "Strafe left / right"], ["Q / E", "Down / up"], ["Shift", "Speed boost"]]],
                  ["Rotation", [["L / P", "Pan / yaw — left / right"], ["T / B", "Tilt / pitch — up / down"], [", / .", "Roll — left / right"]]],
                  ["Lens", [["Z / X", "Zoom in / out"], ["I / O", "Dolly zoom in / out"]]],
                ] as const).map(([heading, rows]) => (
                  <section key={heading} className="mb-3">
                    <h3 className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">{heading}</h3>
                    <dl className="grid grid-cols-[5rem_1fr] items-baseline gap-x-3 gap-y-1">
                      {rows.map(([keys, action]) => (
                        <div key={keys} className="contents">
                          <dt className="font-mono font-medium text-fg">{keys}</dt>
                          <dd>{action}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                <div className="border-t border-border pt-3">
                  <p className="font-medium text-fg">Look around</p>
                  <p>Hold <kbd className="font-mono text-fg">F</kbd> and left-drag, or right-drag.</p>
                  <p className="mt-1">Turn on <span className="text-fg">Drag to look</span> for left-drag without holding a key. Turn it off to select objects again.</p>
                </div>
              </div>
            </details>
        </div>
      )}

      {/* Manipulation tools: transform mode, camera view + capture, reset */}
      <div className="absolute bottom-32 left-6 flex items-center gap-3">
        <div className="flex rounded-full border border-border bg-bg-panel p-1">
          {(["translate", "rotate"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setGizmoMode(mode)}
              title="Toggle with R"
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                effectiveGizmoMode === mode ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              {mode === "translate" ? "Move" : "Rotate"}
            </button>
          ))}
          {selected?.kind === "mannequin" && (
            <button
              onClick={() => { setIsPlaying(false); setGizmoMode("pose"); }}
              title="Select body parts, adjust joints, or apply a preset pose"
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                effectiveGizmoMode === "pose" ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              Pose
            </button>
          )}
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
              onClick={() => writeExportKeypoints(!exportKeypoints)}
              aria-pressed={exportKeypoints}
              title="Also download the mannequins' joint keypoints (stage-photo-<ts>.json) with each photo, as ground truth for the Screen Test eval"
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                exportKeypoints ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              + Keypoints
            </button>
            <button
              onClick={toggleRecording}
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                isRecording ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              {isRecording ? "● Stop recording" : "Record clip"}
            </button>
            <button
              onClick={recordTake}
              disabled={isRecording}
              title="Plays the timeline from 0 while recording and stops at the end"
              className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:text-fg disabled:opacity-40"
            >
              Record take
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 rounded-full border border-border bg-bg-panel p-1" aria-label="Backdrop">
          {(["plain", "green"] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setBackdrop({ kind })}
              className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                backdrop.kind === kind ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
              }`}
            >
              {kind === "plain" ? "Plain" : "Green screen"}
            </button>
          ))}
          <label
            className={`cursor-pointer rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
              backdrop.kind === "image" ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
            }`}
          >
            Image…
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setBackdrop({ kind: "image", url: URL.createObjectURL(file) });
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-border bg-bg-panel p-1">
          <button
            onClick={exportScene}
            className="rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:text-fg"
          >
            Export scene
          </button>
          <label className="cursor-pointer rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:text-fg">
            Import scene
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importScene(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <button
          onClick={resetLayout}
          className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          Reset layout
        </button>
      </div>

      {/* Creation tools: canned camera moves, and the inventory to add new objects */}
      <div className="absolute bottom-20 left-6 flex items-end gap-3">
        {cameraObj && (
          <div className="relative">
            {cameraMovesOpen && (
              <div className="absolute bottom-full left-0 mb-2 flex flex-col gap-2 rounded-2xl border border-border bg-bg-panel p-3">
                <div className="flex flex-col gap-1">
                  <span className="pl-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">Hold</span>
                  {MOVE_ROWS.map(([negKind, posKind, label]) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className="w-20 pl-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
                      {[negKind, posKind].map((kind) => (
                        <button
                          key={kind}
                          onMouseDown={() => startHold(kind)}
                          onMouseUp={() => stopHold(kind)}
                          onMouseLeave={() => stopHold(kind)}
                          className={`rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                            activeHoldKind === kind ? "bg-accent text-bg font-medium" : "text-fg-dim hover:border-accent hover:text-fg"
                          }`}
                        >
                          {MOVE_SHORT_LABELS[kind]}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1 border-t border-border pt-2">
                  <span className="pl-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">Whip</span>
                  {WHIP_ROWS.map(([negKind, posKind, label]) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className="w-20 pl-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
                      {[negKind, posKind].map((kind) => (
                        <button
                          key={kind}
                          onClick={() => startWhip(kind)}
                          className={`rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                            activeWhipKind === kind ? "bg-accent text-bg font-medium" : "text-fg-dim hover:border-accent hover:text-fg"
                          }`}
                        >
                          {WHIP_SHORT_LABELS[kind]}
                        </button>
                      ))}
                    </div>
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
                  ["purse", "Purse"],
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

        <CastPanel
          open={castOpen}
          onToggle={() => setCastOpen((v) => !v)}
          canAssign={selected?.kind === "mannequin"}
          assignedId={selected?.kind === "mannequin" ? (selected.castId ?? null) : null}
          mannequinColor={selected?.kind === "mannequin" ? (selected.color ?? DEFAULT_MANNEQUIN_COLOR) : DEFAULT_MANNEQUIN_COLOR}
          onAssign={(castId) => {
            if (!selected || selected.kind !== "mannequin") return;
            setObjects((prev) => prev.map((o) => (o.id === selected.id ? { ...o, castId: castId ?? undefined } : o)));
          }}
        />
      </div>

      {selected && canKeyframeSelection && (
        <Timeline
          duration={TIMELINE_DURATION}
          playheadTime={playheadTime}
          onScrub={(t) => {
            setIsPlaying(false);
            setPlayheadTime(t);
          }}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          keyframeTimes={keyframeTimes}
          canKeyframe={canKeyframeSelection}
          hasKeyframeAtPlayhead={hasKeyframeAtPlayhead}
          onAddKey={addKeyframe}
          onDeleteKey={deleteKeyframe}
        />
      )}

      {selected?.kind === "mannequin" && effectiveGizmoMode === "pose" && !isPlaying && (
        <PosePanel key={`${selected.id}:${selected.castId ?? "unassigned"}`} characterId={selected.castId} pose={selected.pose} joint={effectiveActiveJoint ?? "leftArm"} onSelect={setActiveJoint}
          onChange={(pose) => setObjects((prev) => prev.map((o) => o.id === selectedId ? { ...o, pose } : o))} />
      )}

      {selected && selectedDisplay && (
        <div className="absolute bottom-20 right-6 flex flex-col items-end gap-1">
          {canDuplicate && (
            <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">hold ctrl and drag to duplicate</p>
          )}
          {effectiveGizmoMode === "pose" ? (
            effectiveActiveJoint ? (
              <TransformReadout
                mode="rotate"
                position={[0, 0, 0]}
                rotation={selected.pose?.[effectiveActiveJoint] ?? DEFAULT_POSE[effectiveActiveJoint]}
                label={JOINT_LABELS[effectiveActiveJoint]}
              />
            ) : (
              <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">click a joint to pose it</p>
            )
          ) : (
            <TransformReadout mode={effectiveGizmoMode} position={selectedDisplay.position} rotation={selectedDisplay.rotation} />
          )}
        </div>
      )}
    </div>
  );
}
