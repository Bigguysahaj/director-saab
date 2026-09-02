import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { DEFAULT_POSE, type JointKey, type MannequinPose, type Vec3 } from "./types";

type ItemProps = {
  id: number;
  selected: boolean;
  onSelect: (id: number) => void;
  objRef: (id: number, obj: THREE.Object3D | null) => void;
};

const JOINT_HANDLE_COLOR = "#ffd23f";

type JointPivotProps = {
  joint: JointKey;
  position: Vec3;
  rotation: Vec3;
  poseMode: boolean;
  active: boolean;
  onSelectJoint: (joint: JointKey) => void;
  jointRef: (joint: JointKey, obj: THREE.Object3D | null) => void;
  children: React.ReactNode;
};

/** A single limb's pivot — position is the joint itself (shoulder/hip), so
 * rotating this group swings the limb from that point instead of its own
 * center. Mirrors the LightStand pattern of nesting a moving part inside a
 * group whose own transform is what actually gets manipulated. */
function JointPivot({ joint, position, rotation, poseMode, active, onSelectJoint, jointRef, children }: JointPivotProps) {
  return (
    <group ref={(g) => jointRef(joint, g)} position={position} rotation={rotation}>
      {poseMode && (
        <mesh
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelectJoint(joint);
          }}
        >
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial
            color={JOINT_HANDLE_COLOR}
            emissive={active ? JOINT_HANDLE_COLOR : "#000000"}
            emissiveIntensity={active ? 0.6 : 0}
          />
        </mesh>
      )}
      {children}
    </group>
  );
}

/**
 * A stand-in figure for blocking out where a person goes — built from
 * primitives (head/torso/arms/legs). The whole figure moves/rotates as one
 * selectable unit via the root group below; each limb additionally hangs
 * from its own joint pivot (shoulder/hip) so it can be posed independently
 * in "Pose" gizmo mode. Forward-kinematics only, one joint per limb — no
 * elbow/knee/neck, no IK.
 */
export function Mannequin({
  id,
  position,
  rotation,
  color,
  pose,
  poseMode,
  activeJoint,
  onSelectJoint,
  jointRef,
  selected,
  onSelect,
  objRef,
}: ItemProps & {
  position: Vec3;
  rotation: Vec3;
  color: string;
  pose?: MannequinPose;
  poseMode: boolean;
  activeJoint: JointKey | null;
  onSelectJoint: (joint: JointKey) => void;
  jointRef: (joint: JointKey, obj: THREE.Object3D | null) => void;
}) {
  const resolvedPose = { ...DEFAULT_POSE, ...pose };
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
      {/* hips — legs hang from y=0.8 down to the floor */}
      <JointPivot
        joint="leftLeg"
        position={[-0.12, 0.8, 0]}
        rotation={resolvedPose.leftLeg}
        poseMode={poseMode}
        active={activeJoint === "leftLeg"}
        onSelectJoint={onSelectJoint}
        jointRef={jointRef}
      >
        <mesh position={[0, -0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8, 12]} />
          {limbMaterial}
        </mesh>
      </JointPivot>
      <JointPivot
        joint="rightLeg"
        position={[0.12, 0.8, 0]}
        rotation={resolvedPose.rightLeg}
        poseMode={poseMode}
        active={activeJoint === "rightLeg"}
        onSelectJoint={onSelectJoint}
        jointRef={jointRef}
      >
        <mesh position={[0, -0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8, 12]} />
          {limbMaterial}
        </mesh>
      </JointPivot>

      {/* torso — spans the same 0.8-to-1.4 range the shoulder/hip pivots sit at */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.25]} />
        {limbMaterial}
      </mesh>

      {/* shoulders — arms hang from y=1.4 down alongside the torso */}
      <JointPivot
        joint="leftArm"
        position={[-0.3, 1.4, 0]}
        rotation={resolvedPose.leftArm}
        poseMode={poseMode}
        active={activeJoint === "leftArm"}
        onSelectJoint={onSelectJoint}
        jointRef={jointRef}
      >
        <mesh position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 12]} />
          {limbMaterial}
        </mesh>
      </JointPivot>
      <JointPivot
        joint="rightArm"
        position={[0.3, 1.4, 0]}
        rotation={resolvedPose.rightArm}
        poseMode={poseMode}
        active={activeJoint === "rightArm"}
        onSelectJoint={onSelectJoint}
        jointRef={jointRef}
      >
        <mesh position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 12]} />
          {limbMaterial}
        </mesh>
      </JointPivot>

      {/* head */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.15, 24, 24]} />
        {limbMaterial}
      </mesh>
    </group>
  );
}
