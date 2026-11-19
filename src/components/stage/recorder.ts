export type RecorderMode = "clip" | "take";

/** The /stage recorder's lifecycle. `autoEntered`: recording switched to
 * camera view itself, so it switches back when the clip is saved. */
export type RecorderState =
  | { phase: "idle" }
  // Entering camera view and waiting for the canvas; no MediaRecorder yet.
  | { phase: "arming"; mode: RecorderMode; autoEntered: boolean }
  | { phase: "recording"; mode: RecorderMode; autoEntered: boolean }
  // stop() called, waiting for the recorder's onstop to save the clip.
  | { phase: "stopping"; autoEntered: boolean };

export type RecorderEvent =
  | { type: "start"; mode: RecorderMode; autoEntered: boolean }
  | { type: "armed" }
  | { type: "stop" }
  | { type: "exitView" }
  | { type: "playbackEnded" }
  | { type: "stopped" };

/** Returns the same object when the event doesn't apply in this phase, so
 * callers can tell "ignored" from "moved" with `===`. */
export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  // TODO(human): implement the transitions.
  void event;
  return state;
}
