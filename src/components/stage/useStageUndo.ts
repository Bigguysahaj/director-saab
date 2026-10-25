import { useEffect, useRef, useState } from "react";
import { createUndoStack } from "./undoStack";

/** Ctrl/Cmd+Z undo and Ctrl/Cmd+Shift+Z or Ctrl+Y redo over `objects`.
 *
 * Call `record()` right before an edit. The snapshot is only pushed once
 * `objects` actually changes, so a whole gizmo drag (recorded on mouse down)
 * is one step, and a click that moves nothing adds no empty step. */
export function useStageUndo<T>(objects: T, setObjects: (next: T) => void) {
  const [stack] = useState(() => createUndoStack<T>());
  const current = useRef(objects);
  const pending = useRef<T | null>(null);

  useEffect(() => {
    current.current = objects;
    if (pending.current !== null && pending.current !== objects) {
      stack.push(pending.current);
      pending.current = null;
    }
  }, [objects, stack]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const isRedo = (key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey);
      if (key !== "z" && !isRedo) return;
      e.preventDefault();
      pending.current = null;
      const next = isRedo ? stack.redo(current.current) : stack.undo(current.current);
      if (next !== undefined) setObjects(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stack, setObjects]);

  return {
    record() {
      pending.current = current.current;
    },
  };
}
