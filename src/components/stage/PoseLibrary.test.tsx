import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoseLibrary } from "./PoseLibrary";
import { resolvePose } from "../../lib/poses/model";
import { loadLibrary, POSE_LIBRARY_KEY } from "../../lib/poses/library";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("applies a preset without mutating its stored asset", async () => {
  const apply = vi.fn(); const user = userEvent.setup();
  render(<PoseLibrary pose={resolvePose()} onApply={apply} />);
  await user.click(screen.getByRole("button", { name: "Wave" }));
  expect(apply.mock.calls[0][0].rightArm[2]).toBe(2.2);
  apply.mock.calls[0][0].rightArm[2] = 0;
  await user.click(screen.getByRole("button", { name: "Wave" }));
  expect(apply.mock.calls[1][0].rightArm[2]).toBe(2.2);
});
it("saves the current pose for a character and restores it after remount", async () => {
  const user = userEvent.setup(); const pose = resolvePose({ head: [0.2, 0.3, 0] }); const apply = vi.fn();
  const view = render(<PoseLibrary pose={pose} characterId="actor-a" onApply={apply} />);
  await user.type(screen.getByRole("textbox", { name: "Pose name" }), "Quiet listener");
  await user.selectOptions(screen.getByRole("combobox", { name: "Save pose for" }), "character");
  await user.click(screen.getByRole("button", { name: "Save current pose" }));
  expect(loadLibrary(localStorage)[0]).toMatchObject({ name: "Quiet listener", characterId: "actor-a", pose });
  view.unmount();
  render(<PoseLibrary pose={resolvePose()} characterId="actor-a" onApply={apply} />);
  await user.click(screen.getByRole("tab", { name: "My poses" }));
  await user.click(screen.getByRole("button", { name: "Quiet listener ★" }));
  expect(apply).toHaveBeenCalledWith(pose);
});
it("filters, deletes, and persists a saved pose", async () => {
  const user = userEvent.setup(); render(<PoseLibrary pose={resolvePose()} onApply={vi.fn()} />);
  await user.type(screen.getByRole("textbox", { name: "Pose name" }), "My pose");
  await user.click(screen.getByRole("button", { name: "Save current pose" }));
  await user.type(screen.getByRole("textbox", { name: "Search poses" }), "missing");
  expect(screen.queryByRole("button", { name: "My pose" })).toBeNull();
  await user.clear(screen.getByRole("textbox", { name: "Search poses" }));
  await user.click(screen.getByRole("button", { name: "Delete My pose" }));
  expect(loadLibrary(localStorage)).toEqual([]);
});
it("preserves unreadable stored data and disables writes", async () => {
  localStorage.setItem(POSE_LIBRARY_KEY, "broken");
  render(<PoseLibrary pose={resolvePose()} onApply={vi.fn()} />);
  expect(await screen.findByRole("alert")).toBeDefined();
  expect((screen.getByRole("button", { name: "Import pack" }) as HTMLButtonElement).disabled).toBe(true);
  expect(localStorage.getItem(POSE_LIBRARY_KEY)).toBe("broken");
});
it("shows write errors and does not claim a pose was saved", async () => {
  const user = userEvent.setup(); render(<PoseLibrary pose={resolvePose()} onApply={vi.fn()} />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  await user.type(screen.getByRole("textbox", { name: "Pose name" }), "Unsaved");
  await user.click(screen.getByRole("button", { name: "Save current pose" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Storage full"));
  expect(screen.getByRole("status").textContent).not.toContain("Saved");
});

it("refreshes the visible library when another tab updates storage", async () => {
  const user = userEvent.setup(); render(<PoseLibrary pose={resolvePose()} onApply={vi.fn()} />);
  await user.click(screen.getByRole("tab", { name: "My poses" }));
  const text = JSON.stringify({ version: 1, rig: "director-mannequin-v1", poses: [{ id: "external", name: "From another tab", pose: {} }] });
  localStorage.setItem(POSE_LIBRARY_KEY, text);
  window.dispatchEvent(new StorageEvent("storage", { key: POSE_LIBRARY_KEY, newValue: text }));
  expect(await screen.findByRole("button", { name: "From another tab" })).toBeDefined();
});
