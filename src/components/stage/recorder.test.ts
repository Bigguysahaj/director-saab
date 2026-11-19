import { describe, expect, it } from "vitest";
import { recorderReducer, type RecorderState } from "./recorder";

const arming: RecorderState = { phase: "arming", mode: "clip", autoEntered: true };
const take: RecorderState = { phase: "recording", mode: "take", autoEntered: true };
const clip: RecorderState = { phase: "recording", mode: "clip", autoEntered: false };

describe("recorderReducer", () => {
  it("ignores a second start while arming or recording", () => {
    expect(recorderReducer({ phase: "idle" }, { type: "start", mode: "clip", autoEntered: true })).toEqual(arming);
    for (const state of [arming, take]) {
      for (const mode of ["clip", "take"] as const) {
        expect(recorderReducer(state, { type: "start", mode, autoEntered: false })).toBe(state);
      }
    }
  });

  it("leaving camera view while arming aborts", () => {
    const aborted = recorderReducer(arming, { type: "exitView" });
    expect(aborted).toEqual({ phase: "idle" });
    // The awaits finishing afterwards must not start a recorder.
    expect(recorderReducer(aborted, { type: "armed" })).toBe(aborted);
    expect(recorderReducer(arming, { type: "armed" })).toEqual({ ...arming, phase: "recording" });
  });

  it("take stops at end of playback, clip does not", () => {
    expect(recorderReducer(take, { type: "playbackEnded" })).toEqual({ phase: "stopping", autoEntered: true });
    expect(recorderReducer(clip, { type: "playbackEnded" })).toBe(clip);
  });
});
