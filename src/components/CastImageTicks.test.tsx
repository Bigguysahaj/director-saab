import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CastImageTicks } from "./CastImageTicks";
import type { CastMember } from "@/lib/cast";

afterEach(cleanup);

const member = (m: Partial<CastMember>): CastMember => ({
  id: "m", name: "Ana", photo: "", shots: {}, stageColor: null, sheet: "", closeup: "", candidates: [], ...m,
});
const ANA = member({ sheet: "/s.png", closeup: "/c.png", candidates: ["/k1.png", "/k2.png"] });
const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

function setup(m: CastMember) {
  const onChange = vi.fn();
  render(<CastImageTicks member={m} onChange={onChange} />);
  return onChange;
}

describe("CastImageTicks", () => {
  it("shows every image in order, with sheet and close-up ticked by default", () => {
    const onChange = setup(ANA);
    const views = screen.getAllByRole("button", { name: /^View Ana/ });
    expect(views.map((b) => b.querySelector("img")?.getAttribute("src"))).toEqual(["/s.png", "/c.png", "/k1.png", "/k2.png"]);
    expect([box("Send Ana sheet").checked, box("Send Ana close-up").checked]).toEqual([true, true]);
    expect([box("Send Ana candidate 1").checked, box("Send Ana candidate 2").checked]).toEqual([false, false]);
    expect(onChange).toHaveBeenLastCalledWith(["/s.png", "/c.png"]);
  });

  it("reports ticked images in strip order, not click order", () => {
    const onChange = setup(ANA);
    fireEvent.click(box("Send Ana candidate 2"));
    fireEvent.click(box("Send Ana candidate 1"));
    expect(onChange).toHaveBeenLastCalledWith(["/s.png", "/c.png", "/k1.png", "/k2.png"]);
  });

  it("lets every image be unticked", () => {
    const onChange = setup(ANA);
    fireEvent.click(box("Send Ana sheet"));
    expect(onChange).toHaveBeenLastCalledWith(["/c.png"]);
    expect(box("Send Ana close-up").disabled).toBe(false);
    fireEvent.click(box("Send Ana close-up"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("opens a thumbnail full size without changing its tick", () => {
    const onChange = setup(ANA);
    const calls = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "View Ana candidate 1" }));
    expect(within(screen.getByRole("dialog")).getByRole("img").getAttribute("src")).toBe("/k1.png");
    expect(box("Send Ana candidate 1").checked).toBe(false);
    expect(onChange.mock.calls.length).toBe(calls);
  });

  it("shows the fallback image for a member without a sheet, ticked but untickable", () => {
    const onChange = setup(member({ name: "Ben", photo: "/ben.png", shots: { "angle-front": { image: "/ben-front.png", cost: 0 } } }));
    expect(screen.getAllByRole("button", { name: /^View Ben/ })).toHaveLength(1);
    expect(box("Send Ben photo").checked).toBe(true);
    expect(box("Send Ben photo").disabled).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(["/ben-front.png"]);
    cleanup();
    const onChange2 = setup(member({ name: "Ben", photo: "/ben.png" }));
    expect(onChange2).toHaveBeenLastCalledWith(["/ben.png"]);
  });
});
