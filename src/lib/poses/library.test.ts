import { describe, expect, it } from "vitest";
import { BUILTIN_POSES } from "./catalog";
import { DEFAULT_POSE, parsePose, resolvePose } from "./model";
import { importPoses, loadLibrary, MAX_POSES, parsePack, posesForCharacter, RIG_ID, saveLibrary, serializeLibrary, type PoseAsset } from "./library";

const asset = (id = "a", characterId?: string): PoseAsset => ({ id, name: "Custom wave", pose: resolvePose({ rightArm: [0, 0, 2] }), ...(characterId ? { characterId } : {}) });
const pack = (poses: unknown[]) => JSON.stringify({ version: 1, rig: RIG_ID, poses });

describe("pose assets", () => {
  it("keeps library assets, live poses, and default joints independent", () => {
    const a = resolvePose(); const b = resolvePose(a);
    b.head[0] = 1;
    expect(a.head[0]).toBe(0); expect(DEFAULT_POSE.head[0]).toBe(0);
    const applied = resolvePose(BUILTIN_POSES[0].pose); applied.leftHand[0] = 2;
    expect(BUILTIN_POSES[0].pose.leftHand[0]).toBe(0);
  });
  it("fills missing joints from legacy poses", () => {
    const pose = parsePose({ leftArm: [0, 0, 0.15] });
    expect(pose.leftArm).toEqual([0, 0, 0.15]); expect(pose.leftKnee).toEqual([0, 0, 0]);
  });
  it.each([null, [], { tentacle: [0, 0, 0] }, { head: [0, 0] }, { head: [0, NaN, 0] }, { head: [Infinity, 0, 0] }, { head: [4, 0, 0] }, { head: ["0", 0, 0] }])("rejects invalid joint data %j", (value) => {
    expect(() => parsePose(value)).toThrow();
  });
  it("validates every bundled pose with unique IDs", () => {
    expect(BUILTIN_POSES.length).toBeGreaterThan(6);
    expect(parsePack(serializeLibrary(BUILTIN_POSES)).poses).toEqual(BUILTIN_POSES);
  });
});

describe("pose library persistence and imports", () => {
  it("round trips poses including character ownership", () => {
    localStorage.clear(); const poses = [asset(), asset("b", "actor-1")];
    saveLibrary(localStorage, poses); expect(loadLibrary(localStorage)).toEqual(poses);
  });
  it("reports storage read/write failure instead of claiming success", () => {
    const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
    expect(() => loadLibrary(storage)).toThrow("blocked");
    expect(() => saveLibrary(storage, [asset()])).toThrow("full");
  });
  it("keeps character poses with their cast identity", () => {
    const poses = [asset("shared"), asset("a", "actor-a"), asset("b", "actor-b")];
    expect(posesForCharacter(poses, "actor-a").map((p) => p.id)).toEqual(["shared", "a"]);
    expect(posesForCharacter(poses).map((p) => p.id)).toEqual(["shared"]);
  });
  it("imports without overwriting existing poses or foreign character assignments", () => {
    const existing = [asset("same")];
    const result = importPoses(existing, pack([asset("same", "foreign-actor")]), () => "new-id");
    expect(result.map((p) => p.id)).toEqual(["same", "new-id"]);
    expect(result[1].characterId).toBeUndefined(); expect(existing).toHaveLength(1);
  });
  it.each([
    "not json", JSON.stringify({ version: 2, rig: RIG_ID, poses: [] }),
    JSON.stringify({ version: 1, rig: "other-rig", poses: [] }),
    pack([asset(), asset()]), pack([{ ...asset(), name: " " }]),
    pack([{ ...asset(), pose: { head: [99, 0, 0] } }]),
  ])("rejects a malformed pack atomically", (text) => {
    const existing = [asset("keep")];
    expect(() => importPoses(existing, text, () => "new")).toThrow(); expect(existing).toEqual([asset("keep")]);
  });
  it("enforces size and library limits", () => {
    expect(() => parsePack(" ".repeat(1_000_001))).toThrow("too large");
    const existing = Array.from({ length: MAX_POSES }, (_, i) => asset(String(i)));
    expect(() => importPoses(existing, pack([asset()]), () => "extra")).toThrow("200");
  });
});
