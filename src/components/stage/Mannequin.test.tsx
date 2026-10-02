import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Mannequin } from "./Mannequin";
import { BUILTIN_POSES } from "../../lib/poses/catalog";
import { JOINTS, resolvePose, type JointKey, type MannequinPose, type Vec3 } from "../../lib/poses/model";

// Inspect the component's declared joint tree; world matrices verify the
// actual hierarchy rendered by Mannequin, independently of a WebGL context.
function rig(pose?: MannequinPose) {
  const joints = {} as Record<JointKey, THREE.Object3D>;
  const handlers = {} as Record<JointKey, (event: { stopPropagation(): void }) => void>;
  let selected: JointKey | undefined;
  const tree = Mannequin({ id: 1, position: [0, 0, 0], rotation: [0, 0, 0], color: "#888", pose,
    poseMode: true, activeJoint: "leftArm", selected: true, onSelect() {}, objRef() {}, jointRef() {},
    onSelectJoint(joint) { selected = joint; } });
  function visit(element: ReactNode, parent: THREE.Object3D) {
    if (Array.isArray(element)) { element.forEach((child) => visit(child, parent)); return; }
    if (!isValidElement(element)) return;
    const props = element.props as { joint?: JointKey; position: Vec3; rotation: Vec3; children?: ReactNode };
    if (props.joint && typeof element.type === "function") {
      const node = new THREE.Object3D(); node.position.fromArray(props.position); node.rotation.set(...props.rotation);
      parent.add(node); joints[props.joint] = node;
      const rendered = (element.type as (props: unknown) => ReactNode)(props);
      if (isValidElement(rendered)) handlers[props.joint] = (rendered.props as { onClick: typeof handlers[JointKey] }).onClick;
      visit(props.children, node);
    } else visit(props.children, parent);
  }
  const root = new THREE.Object3D(); visit(tree, root); root.updateMatrixWorld(true);
  return { joints, handlers, selected: () => selected };
}
const point = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());

describe("mannequin rig", () => {
  it("connects all joints and keeps hands/feet attached to their limb chains", () => {
    const { joints } = rig();
    expect(Object.keys(joints).sort()).toEqual([...JOINTS].sort());
    for (const side of ["left", "right"] as const) {
      expect(joints[`${side}Hand`].parent).toBe(joints[`${side}Elbow`]);
      expect(joints[`${side}Elbow`].parent).toBe(joints[`${side}Arm`]);
      expect(joints[`${side}Foot`].parent).toBe(joints[`${side}Knee`]);
      expect(joints[`${side}Knee`].parent).toBe(joints[`${side}Leg`]);
    }
    expect(joints.head.parent).toBe(joints.spine);
  });
  it("moves a hand when its elbow bends while leaving the shoulder and opposite hand in place", () => {
    const neutral = rig().joints; const bent = rig(resolvePose({ leftElbow: [-1.4, 0, 0] })).joints;
    expect(point(bent.leftHand).distanceTo(point(neutral.leftHand))).toBeGreaterThan(0.2);
    expect(point(bent.leftArm).distanceTo(point(neutral.leftArm))).toBeLessThan(1e-8);
    expect(point(bent.rightHand).distanceTo(point(neutral.rightHand))).toBeLessThan(1e-8);
  });
  it("selects every joint through its body part handler", () => {
    const rendered = rig();
    for (const joint of JOINTS) { rendered.handlers[joint]({ stopPropagation() {} }); expect(rendered.selected()).toBe(joint); }
  });
  it.each(BUILTIN_POSES)("renders finite transforms for $name", ({ pose }) => {
    const { joints } = rig(pose);
    for (const node of Object.values(joints)) expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true);
  });
});
