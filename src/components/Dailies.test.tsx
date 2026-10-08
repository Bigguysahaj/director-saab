import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dailies } from "./Dailies";
import type { Take } from "@/lib/types";

const take: Take = {
  id: "job-1",
  prompt: "a dog",
  model: "m",
  modelLabel: "Model",
  createdAt: 1,
  status: "completed",
};

describe("Dailies keep / discard", () => {
  it("PATCHes the take and reflects the choice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const onKept = vi.fn();
    const { rerender } = render(<Dailies takes={[take]} onSelect={() => {}} onRemove={() => {}} onKept={onKept} />);

    fireEvent.click(screen.getByRole("button", { name: "Keep take" }));

    await waitFor(() => expect(onKept).toHaveBeenCalledWith("job-1", true));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/takes/job-1");
    expect(init).toMatchObject({ method: "PATCH", body: JSON.stringify({ kept: true }) });

    rerender(<Dailies takes={[{ ...take, kept: true }]} onSelect={() => {}} onRemove={() => {}} onKept={onKept} />);
    expect(screen.getByRole("button", { name: "Keep take" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Discard take" }));
    await waitFor(() => expect(onKept).toHaveBeenCalledWith("job-1", false));
  });
});
