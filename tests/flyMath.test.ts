import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  FLY_MAX,
  FLY_MIN,
  MAX_PITCH,
  flyStep,
  hasFlyInput,
  lookStep,
} from "../src/components/stage/flyMath.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const forwardOf = (q: THREE.Quaternion) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);
const rightOf = (q: THREE.Quaternion) => new THREE.Vector3(1, 0, 0).applyQuaternion(q);
const step = (pos: THREE.Vector3, q: THREE.Quaternion, i: Partial<{ forward: number; right: number; up: number }>, dt = 1, speed = 1) =>
  flyStep(pos, q, { forward: 0, right: 0, up: 0, ...i }, speed, dt);

test("W moves along the camera's facing direction, S the opposite", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)); // facing -X
  const p = new THREE.Vector3(0, 2, 0);
  step(p, q, { forward: 1 });
  near(p.x, -1);
  near(p.z, 0);
  step(p, q, { forward: -1 });
  near(p.x, 0);
});

test("W follows pitch (fly, not walk): looking up climbs", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, 0, 0));
  const p = new THREE.Vector3(0, 2, 0);
  step(p, q, { forward: 1 });
  assert.ok(p.y > 2.5);
});

test("A/D strafe along the camera's right axis, perpendicular to facing", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, -1.19, 0)); // the default camera
  const p = new THREE.Vector3(0, 2, 0);
  step(p, q, { right: 1 });
  const moved = p.clone().sub(new THREE.Vector3(0, 2, 0));
  near(moved.dot(forwardOf(q)), 0);
  near(moved.dot(rightOf(q)), 1);
});

test("Q/E move along world vertical regardless of tilt", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.4, 0.3));
  const p = new THREE.Vector3(0, 2, 0);
  step(p, q, { up: 1 });
  near(p.x, 0);
  near(p.z, 0);
  near(p.y, 3);
});

test("diagonals are normalised: W+D covers the same distance as W", () => {
  const q = new THREE.Quaternion();
  const straight = new THREE.Vector3(0, 2, 0);
  const diag = new THREE.Vector3(0, 2, 0);
  step(straight, q, { forward: 1 });
  step(diag, q, { forward: 1, right: 1, up: 1 });
  near(straight.distanceTo(new THREE.Vector3(0, 2, 0)), 1);
  near(diag.distanceTo(new THREE.Vector3(0, 2, 0)), 1);
});

test("distance scales with dt and speed; zero input is a no-op", () => {
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3(0, 2, 0);
  step(p, q, { forward: 1 }, 0.5, 4);
  near(p.z, -2);
  const before = p.clone();
  step(p, q, {});
  assert.ok(p.equals(before));
  assert.equal(hasFlyInput({ forward: 0, right: 0, up: 0 }), false);
  assert.equal(hasFlyInput({ forward: 0, right: -1, up: 0 }), true);
});

test("the camera can't leave the room: floor, ceiling, walls", () => {
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3(0, 1, 0);
  step(p, q, { up: -1 }, 100);
  near(p.y, FLY_MIN.y);
  step(p, q, { up: 1 }, 100);
  near(p.y, FLY_MAX.y);
  step(p, q, { forward: 1 }, 100); // facing -Z, into the backdrop
  near(p.z, FLY_MIN.z);
  step(p, q, { right: -1 }, 100);
  near(p.x, FLY_MIN.x);
  step(p, q, { right: 1 }, 100);
  near(p.x, FLY_MAX.x);
  step(p, q, { forward: -1 }, 100);
  near(p.z, FLY_MAX.z);
});

test("dragging right looks right, dragging down looks down", () => {
  const q = new THREE.Quaternion();
  lookStep(q, 100, 0);
  assert.ok(forwardOf(q).x > 0.2, "yaws toward +X");
  const q2 = new THREE.Quaternion();
  lookStep(q2, 0, 100);
  assert.ok(forwardOf(q2).y < -0.2, "pitches down");
});

test("yaw doesn't disturb pitch, and pitch is clamped short of vertical", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0));
  const pitchBefore = Math.asin(forwardOf(q).y);
  lookStep(q, 250, 0);
  near(Math.asin(forwardOf(q).y), pitchBefore);

  lookStep(q, 0, -1e5); // absurd upward drag
  near(Math.asin(forwardOf(q).y), MAX_PITCH, 1e-6);
  lookStep(q, 0, 1e5);
  near(Math.asin(forwardOf(q).y), -MAX_PITCH, 1e-6);
});

test("looking keeps the quaternion unit-length over a long drag", () => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, -1.19, 0.4));
  for (let i = 0; i < 5000; i++) lookStep(q, Math.sin(i) * 9, Math.cos(i * 0.7) * 9);
  near(q.length(), 1, 1e-9);
});

test("existing roll survives looking around", () => {
  const roll = 0.5;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, roll));
  lookStep(q, 40, 20);
  // camera-up projected onto camera-right stays non-zero only when rolled;
  // an un-rolled camera would have right.y === 0.
  assert.ok(Math.abs(rightOf(q).y) > 0.3);
});
