import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStageUndo } from "./useStageUndo";

const BEFORE = ["box"];
const AFTER = ["box", "ball"];

/** Hook wired to real state, with one recorded edit (an object added). */
function setup() {
  const hook = renderHook(() => {
    const [objects, setObjects] = useState(BEFORE);
    const { record } = useStageUndo(objects, setObjects);
    return { objects, setObjects, record };
  });
  act(() => {
    hook.result.current.record();
    hook.result.current.setObjects(AFTER);
  });
  return hook;
}

function press(init: KeyboardEventInit, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

function withInput(run: (input: HTMLInputElement) => void) {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  try {
    run(input);
  } finally {
    input.remove();
  }
}

describe("useStageUndo", () => {
  it("Ctrl+Z restores previous objects; ignored when typing in an input", () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      const { result, unmount } = setup();
      withInput((input) => press({ key: "z", ...mod }, input));
      expect(result.current.objects).toBe(AFTER);
      press({ key: "z", ...mod });
      expect(result.current.objects).toBe(BEFORE);
      unmount();
    }
  });

  it("Ctrl+Shift+Z / Ctrl+Y re-apply an undone edit; ignored when typing in an input", () => {
    const redos: KeyboardEventInit[] = [
      { key: "Z", ctrlKey: true, shiftKey: true },
      { key: "Z", metaKey: true, shiftKey: true },
      { key: "y", ctrlKey: true },
    ];
    for (const redo of redos) {
      const { result, unmount } = setup();
      press({ key: "z", ctrlKey: true });
      expect(result.current.objects).toBe(BEFORE);
      withInput((input) => press(redo, input));
      expect(result.current.objects).toBe(BEFORE);
      press(redo);
      expect(result.current.objects).toBe(AFTER);
      unmount();
    }
  });
});
