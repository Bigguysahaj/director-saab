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
    <group ref={(g) => jointRef(joint, g)} position={position} rotation={rotation}
      onClick={(e) => { if (poseMode) { e.stopPropagation(); onSelectJoint(joint); } }}>

      {poseMode && (
        <mesh renderOrder={10}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelectJoint(joint);
          }}
        >
          <sphereGeometry args={[active ? 0.075 : 0.055, 16, 16]} />
          <meshBasicMaterial
            depthTest={false}
            depthWrite={false}
            color={active ? "#ffffff" : JOINT_HANDLE_COLOR}
          />
        </mesh>
      )}
      {children}
    </group>
  );
}

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

  function pivot(joint: JointKey, position: Vec3, children: React.ReactNode) {
    return <JointPivot key={joint} joint={joint} position={position} rotation={resolvedPose[joint]}
      poseMode={poseMode} active={activeJoint === joint} onSelectJoint={onSelectJoint} jointRef={jointRef}>
      {children}
    </JointPivot>;
  }
  function segment(length: number, radius: number) {
    return <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, length - radius * 2, 6, 12]} />{limbMaterial}
    </mesh>;
  }
  function arm(side: "left" | "right", x: number) {
    return pivot(`${side}Arm`, [x, 0.53, 0], <>
      {segment(0.29, 0.06)}
      {pivot(`${side}Elbow`, [0, -0.29, 0], <>
        {segment(0.26, 0.05)}
        {pivot(`${side}Hand`, [0, -0.26, 0], <mesh position={[0, -0.065, 0]} castShadow>
          <boxGeometry args={[0.085, 0.13, 0.055]} />{limbMaterial}
        </mesh>)}
      </>)}
    </>);
  }
  function leg(side: "left" | "right", x: number) {
    return pivot(`${side}Leg`, [x, 0.86, 0], <>
      {segment(0.4, 0.08)}
      {pivot(`${side}Knee`, [0, -0.4, 0], <>
        {segment(0.38, 0.065)}
        {pivot(`${side}Foot`, [0, -0.38, 0], <mesh position={[0, -0.035, 0.06]} castShadow>
          <boxGeometry args={[0.13, 0.09, 0.25]} />{limbMaterial}
        </mesh>)}
      </>)}
    </>);
  }
  return (
    <group ref={(g) => objRef(id, g)} position={position} rotation={rotation}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(id); }}>
      {leg("left", -0.12)}{leg("right", 0.12)}
      {pivot("spine", [0, 0.86, 0], <>
        <mesh position={[0, 0.26, 0]} castShadow><boxGeometry args={[0.4, 0.52, 0.25]} />{limbMaterial}</mesh>
        {arm("left", -0.27)}{arm("right", 0.27)}
        {pivot("head", [0, 0.58, 0], <>
          <mesh position={[0, 0.12, 0]} castShadow><sphereGeometry args={[0.15, 24, 24]} />{limbMaterial}</mesh>
          <mesh position={[0, 0.12, 0.145]}><boxGeometry args={[0.045, 0.045, 0.045]} />{limbMaterial}</mesh>
        </>)}
      </>)}
    </group>
  );
}
