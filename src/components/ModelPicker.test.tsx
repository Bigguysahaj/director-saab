import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelPicker } from "./ModelPicker";
import { ARK_VIDEO_MODELS, FALLBACK_MODELS } from "@/lib/models";

const mini = FALLBACK_MODELS.find((m) => m.id === "bytedance/seedance-2.0-mini")!;
const flash = ARK_VIDEO_MODELS[0];

describe("ModelPicker", () => {
  it("shows the Flash badge and price", () => {
    render(<ModelPicker models={[mini, flash]} value={flash} onChange={() => {}} />);
    const trigger = screen.getByRole("button");
    expect(within(trigger).getByText("Fast · cheap")).toBeTruthy();
    expect(within(trigger).getByText(/\$0\.0673\/s/)).toBeTruthy();

    fireEvent.click(trigger);
    const options = screen.getAllByRole("button").slice(1);
    const flashOption = options.find((b) => b.textContent?.includes("Seedance 2.5 Flash"))!;
    const miniOption = options.find((b) => b.textContent?.includes("Seedance 2.0 Mini"))!;
    expect(within(flashOption).getByText("Fast · cheap")).toBeTruthy();
    expect(within(flashOption).getByText(/\$0\.0673\/s/)).toBeTruthy();
    expect(within(miniOption).queryByText("Fast · cheap")).toBeNull();
  });
});
