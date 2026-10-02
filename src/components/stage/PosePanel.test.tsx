import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PosePanel } from "./PosePanel";
import { resolvePose } from "../../lib/poses/model";
afterEach(cleanup);

it("edits the selected joint while preserving every other joint", () => {
  const pose = resolvePose({ head: [0.4, 0, 0], leftElbow: [-1, 0, 0] }); const change = vi.fn();
  render(<PosePanel pose={pose} joint="leftElbow" onSelect={vi.fn()} onChange={change} />);
  fireEvent.change(screen.getByRole("slider", { name: "Bend (X)" }), { target: { value: "-90" } });
  const result = change.mock.calls[0][0];
  expect(result.leftElbow[0]).toBeCloseTo(-Math.PI / 2);
  expect(result.head).toEqual(pose.head); expect(pose.leftElbow[0]).toBe(-1);
});
it("reset joint preserves the rest of the pose; reset pose restores neutral", () => {
  const pose = resolvePose({ head: [0.4, 0, 0], rightKnee: [1, 0, 0] }); const change = vi.fn();
  render(<PosePanel pose={pose} joint="rightKnee" onSelect={vi.fn()} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Reset joint" }));
  expect(change.mock.calls[0][0].rightKnee).toEqual([0, 0, 0]);
  expect(change.mock.calls[0][0].head).toEqual([0.4, 0, 0]);
  fireEvent.click(screen.getByRole("button", { name: "Reset pose" }));
  expect(change.mock.calls[1][0]).toEqual(resolvePose());
});
