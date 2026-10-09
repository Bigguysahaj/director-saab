import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CastColorMark } from "./CastColorMark";
afterEach(cleanup);

it("draws the circle in the member's stageColor", () => {
  render(<CastColorMark color="#c65d3b" />);
  const mark = screen.getByRole("img", { name: "On stage: burnt orange mannequin" });
  const paths = mark.querySelectorAll("path");
  expect(paths.length).toBeGreaterThan(0);
  paths.forEach((p) => expect(p.getAttribute("stroke")).toBe("#c65d3b"));
});
it("renders nothing when the member is unassigned", () => {
  const { container } = render(<CastColorMark color={null} />);
  expect(container.innerHTML).toBe("");
});
