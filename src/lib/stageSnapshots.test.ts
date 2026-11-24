import { beforeEach, describe, expect, it } from "vitest";
import { MAX_SNAPSHOTS, saveStageSnapshot, stageSpecForClip } from "./stageSnapshots";

const LAYOUT_KEY = "director-stage-layout-v3";
const layout = (x: number) => [{ id: 1, kind: "box", position: [x, 0, 0], rotation: [0, 0, 0] }];

beforeEach(() => localStorage.clear());

describe("stage snapshots", () => {
  it("stores a snapshot per recording, keeping only the newest", () => {
    for (let ts = 1; ts <= MAX_SNAPSHOTS + 5; ts++) saveStageSnapshot(localStorage, ts, layout(ts));

    expect(stageSpecForClip(localStorage, "stage-clip-1.mp4").stage).toBeNull();
    const newest = stageSpecForClip(localStorage, `stage-clip-${MAX_SNAPSHOTS + 5}.mp4`);
    expect(newest.stage?.objects).toEqual(layout(MAX_SNAPSHOTS + 5));
    expect(stageSpecForClip(localStorage, "stage-clip-6.mp4").stage).not.toBeNull();
  });

  it("attaches the matching snapshot with no warning when the stage is unchanged", () => {
    saveStageSnapshot(localStorage, 1700, layout(1));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout(1)));

    const spec = stageSpecForClip(localStorage, "stage-clip-1700.mp4");
    expect(spec.stage).toEqual({ schema: "director-stage-scene/v1", objects: layout(1) });
    expect(spec.warning).toBeNull();
  });

  it("warns when the stage changed after recording, but keeps the recorded snapshot", () => {
    saveStageSnapshot(localStorage, 1700, layout(1));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout(2)));

    const spec = stageSpecForClip(localStorage, "stage-clip-1700.mp4");
    expect(spec.stage?.objects).toEqual(layout(1));
    expect(spec.warning).toBe("Stage changed since this take was recorded.");
  });

  it("finds the spec for a clip with a suffix after the timestamp", () => {
    saveStageSnapshot(localStorage, 1700, layout(1));

    for (const name of ["stage-clip-1700_cut.mp4", "stage-clip-1700 (1).mp4"]) {
      expect(stageSpecForClip(localStorage, name).stage).not.toBeNull();
    }
    expect(stageSpecForClip(localStorage, "stage-clip-17001.mp4").stage).toBeNull();
  });

  it("replaces the snapshot for a timestamp and ignores a list it cannot read", () => {
    saveStageSnapshot(localStorage, 1700, layout(1));
    saveStageSnapshot(localStorage, 1700, layout(2));
    expect(stageSpecForClip(localStorage, "stage-clip-1700.mp4").stage?.objects).toEqual(layout(2));
    expect(JSON.parse(localStorage.getItem("director-stage-snapshots-v1")!)).toHaveLength(1);

    localStorage.setItem("director-stage-snapshots-v1", "{");
    expect(stageSpecForClip(localStorage, "stage-clip-1700.mp4")).toEqual({
      stage: null,
      warning: "No stage spec for this clip.",
    });
    saveStageSnapshot(localStorage, 1700, layout(3));
    expect(stageSpecForClip(localStorage, "stage-clip-1700.mp4").stage?.objects).toEqual(layout(3));
  });

  it("does not warn when the current layout was never stored, and survives a store that rejects writes", () => {
    saveStageSnapshot(localStorage, 1700, layout(1));
    expect(stageSpecForClip(localStorage, "stage-clip-1700.mp4").warning).toBeNull();

    const full: Storage = {
      getItem: () => JSON.stringify([{ ts: 1700, objects: layout(1) }]),
      setItem: () => { throw new Error("quota"); },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    expect(() => saveStageSnapshot(full, 1800, layout(2))).not.toThrow();
    expect(stageSpecForClip(full, "stage-clip-1700.mp4").stage?.objects).toEqual(layout(1));
  });

  it("notes a missing spec for renamed or unknown clips", () => {
    saveStageSnapshot(localStorage, 1700, layout(1));

    for (const name of ["my-take.mp4", "stage-clip-9999.mp4"]) {
      const spec = stageSpecForClip(localStorage, name);
      expect(spec.stage).toBeNull();
      expect(spec.warning).toBe("No stage spec for this clip.");
    }
  });
});
