import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendTake } from "./SendTake";
import type { VideoModel } from "@/lib/types";

const model: VideoModel = {
  id: "test-model",
  label: "Test model",
  provider: "test",
  tagline: "",
  supported_durations: [5],
  supported_resolutions: ["480p"],
  supported_aspect_ratios: ["9:16"],
  supports_audio: false,
  supports_seed: false,
  supports_frame_images: false,
  supports_input_references: true,
  supports_video_reference: true,
};

afterEach(cleanup);

function setup() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
  render(<SendTake models={[model]} onSubmit={() => {}} />);
  return screen.getByLabelText("Reference images");
}

function pick(input: HTMLElement, name: string, contents: string) {
  fireEvent.change(input, { target: { files: [new File([contents], name, { type: "image/png" })] } });
}

describe("SendTake reference images", () => {
  it("appends images from separate picks in @Image order", async () => {
    const input = setup();
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image1" });
    pick(input, "b.png", "B");

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByRole("img", { name: "@Image1" }).getAttribute("src")).toBe("data:image/png;base64,QQ==");
    expect(screen.getByRole("img", { name: "@Image2" }).getAttribute("src")).toBe("data:image/png;base64,Qg==");
  });

  it("renumbers remaining images after removal", async () => {
    const input = setup();
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image1" });
    pick(input, "b.png", "B");
    await screen.findByRole("img", { name: "@Image2" });

    fireEvent.click(screen.getByRole("button", { name: "Remove @Image1" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "@Image1" }).getAttribute("src")).toBe("data:image/png;base64,Qg==");
  });

  it("shows a limit message and keeps three images when a fourth is picked", async () => {
    const input = setup();
    for (const [index, contents] of ["A", "B", "C"].entries()) {
      pick(input, `${contents}.png`, contents);
      await screen.findByRole("img", { name: `@Image${index + 1}` });
    }

    pick(input, "d.png", "D");
    expect((await screen.findByRole("alert")).textContent).toMatch(/3.*image|image.*3/i);
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("labels the field Reference images", () => {
    setup();
    expect(screen.getByText(/^Reference images/)).toBeTruthy();
  });
});
