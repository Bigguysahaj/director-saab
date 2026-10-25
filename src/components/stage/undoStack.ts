export const UNDO_CAP = 100;

/** Snapshot history for undo/redo. `push` records the state before an edit;
 * `undo`/`redo` take the current state (so it can be stepped back to) and
 * return the one to restore, or undefined when there's nothing to step to. */
export function createUndoStack<T>(cap = UNDO_CAP) {
  const past: T[] = [];
  let future: T[] = [];
  return {
    push(snapshot: T) {
      past.push(snapshot);
      if (past.length > cap) past.shift();
      future = [];
    },
    undo(current: T): T | undefined {
      const prev = past.pop();
      if (prev !== undefined) future.push(current);
      return prev;
    },
    redo(current: T): T | undefined {
      const next = future.pop();
      if (next !== undefined) past.push(current);
      return next;
    },
  };
}
