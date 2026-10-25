import { describe, expect, it } from "vitest";
import { createUndoStack } from "./undoStack";

describe("undo stack", () => {
  it("undo: returns previous snapshots in LIFO order", () => {
    const stack = createUndoStack<string>();
    stack.push("A");
    stack.push("B");
    stack.push("C");
    expect(stack.undo("D")).toBe("C");
    expect(stack.undo("C")).toBe("B");
    expect(stack.undo("B")).toBe("A");
    expect(stack.undo("A")).toBeUndefined();
  });

  it("undo: caps history and drops oldest", () => {
    const cap = 5;
    const stack = createUndoStack<number>(cap);
    for (let i = 0; i < cap + 5; i++) stack.push(i);
    let current = cap + 5;
    const undone: number[] = [];
    for (let i = 0; i < cap; i++) {
      const prev = stack.undo(current);
      expect(prev).toBeDefined();
      undone.push(prev!);
      current = prev!;
    }
    expect(undone).toEqual([9, 8, 7, 6, 5]);
    expect(stack.undo(current)).toBeUndefined();
  });

  it("redo: re-applies undone snapshots in order", () => {
    const stack = createUndoStack<string>();
    stack.push("A");
    stack.push("B");
    expect(stack.undo("C")).toBe("B");
    expect(stack.undo("B")).toBe("A");
    expect(stack.redo("A")).toBe("B");
    expect(stack.redo("B")).toBe("C");
    expect(stack.redo("C")).toBeUndefined();
  });

  it("redo: a new edit clears redo history", () => {
    const stack = createUndoStack<string>();
    stack.push("A");
    expect(stack.undo("B")).toBe("A");
    stack.push("A");
    expect(stack.redo("A2")).toBeUndefined();
  });
});
