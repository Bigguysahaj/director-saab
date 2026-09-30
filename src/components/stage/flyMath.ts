import * as THREE from "three";

export const FLY_SPEED = 2.5; // metres per second
export const FLY_BOOST = 3; // speed multiplier while Shift is held
export const MAX_FLY_DELTA = 0.1; // seconds; longest single frame we'll integrate
export const LOOK_SENSITIVITY = 0.003; // radians per pixel of drag
export const MAX_PITCH = THREE.MathUtils.degToRad(85);

// Keeps the camera inside the room shell: floor top is y=0.1, back wall face
// is z=-2.9, and the floor/wall are 12 wide.
export const FLY_MIN = new THREE.Vector3(-5.8, 0.2, -2.8);
export const FLY_MAX = new THREE.Vector3(5.8, 7.5, 3.8);

export type FlyInput = {
  forward: number; // +1 forward, -1 back — along the camera's facing direction
  right: number; // +1 right, -1 left — along the camera's own right axis
  up: number; // +1 up, -1 down — world vertical, so Q/E never drift with tilt
};

const move = new THREE.Vector3();
const forwardVec = new THREE.Vector3();
const yawQuat = new THREE.Quaternion();
const pitchQuat = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);

export function hasFlyInput(input: FlyInput): boolean {
  return input.forward !== 0 || input.right !== 0 || input.up !== 0;
}

/** Advances `position` by one frame of fly movement, in place. Diagonals are
 * normalised so W+D isn't faster than W alone. No allocation — this runs
 * inside useFrame. */
export function flyStep(position: THREE.Vector3, quaternion: THREE.Quaternion, input: FlyInput, speed: number, dt: number) {
  move.set(input.right, 0, -input.forward).applyQuaternion(quaternion);
  move.y += input.up;
  const len = move.length();
  if (len === 0) return;
  if (len > 1) move.divideScalar(len);
  position.addScaledVector(move, speed * dt);
  position.clamp(FLY_MIN, FLY_MAX);
}

/** Turns `quaternion` by a mouse drag of (dx, dy) pixels, in place. Yaw is
 * about world-up (so the horizon stays level however the camera is pitched),
 * pitch is about the camera's own X axis and clamped short of straight
 * up/down. Any roll already on the camera is preserved. Dragging right looks
 * right; dragging down looks down. */
export function lookStep(quaternion: THREE.Quaternion, dx: number, dy: number, sensitivity = LOOK_SENSITIVITY) {
  yawQuat.setFromAxisAngle(WORLD_UP, -dx * sensitivity);
  quaternion.premultiply(yawQuat);

  forwardVec.set(0, 0, -1).applyQuaternion(quaternion);
  const pitch = Math.asin(THREE.MathUtils.clamp(forwardVec.y, -1, 1));
  const target = THREE.MathUtils.clamp(pitch - dy * sensitivity, -MAX_PITCH, MAX_PITCH);
  pitchQuat.setFromAxisAngle(LOCAL_RIGHT, target - pitch);
  quaternion.multiply(pitchQuat).normalize();
}
