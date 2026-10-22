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

function setup(onSubmit = vi.fn()) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (url === "/api/cast") return new Response(JSON.stringify([
      { id: "m1", name: "Ana", sheet: "/sheet.png", closeup: "/closeup.png" },
    ]));
    return { ok: true, blob: async () => new Blob([url === "/sheet.png" ? "S" : "C"], { type: "image/png" }) } as Response;
  });
  render(<SendTake models={[model]} onSubmit={onSubmit} />);
  return screen.getByLabelText("Reference images");
}

function pick(input: HTMLElement, name: string, contents: string) {
  fireEvent.change(input, { target: { files: [new File([contents], name, { type: "image/png" })] } });
}

async function chooseCast() {
  await screen.findByRole("option", { name: "Ana" });
  fireEvent.change(screen.getByLabelText("Cast from sheet"), { target: { value: "m1" } });
  await screen.findByRole("img", { name: "@Image2" });
}

async function submitTake() {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:take");
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(5);
  vi.spyOn(HTMLMediaElement.prototype, "src", "set").mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => fireEvent.loadedMetadata(this));
  });
  fireEvent.change(screen.getByLabelText("Take video"), {
    target: { files: [new File(["V"], "take.mp4", { type: "video/mp4" })] },
  });
  await waitFor(() => expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm & generate" }));
}

const videoReference = { type: "video_url", video_url: { url: "data:video/mp4;base64,Vg==" } };
const imageReference = (base64: string) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } });

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

  it("shows cast sheet images with @Image tags and a ticked Use cast sheet box", async () => {
    setup();
    await chooseCast();
    expect((screen.getByRole("checkbox", { name: "Use cast sheet" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("img", { name: "@Image1" }).getAttribute("src")).toBe("data:image/png;base64,Uw==");
    expect(screen.getByRole("img", { name: "@Image2" }).getAttribute("src")).toBe("data:image/png;base64,Qw==");
    expect(screen.queryByRole("region", { name: "Take preview" })).toBeNull();
  });

  it("numbers uploads after the cast sheet", async () => {
    const input = setup();
    await chooseCast();
    pick(input, "a.png", "A");
    expect((await screen.findByRole("img", { name: "@Image3" })).getAttribute("src")).toBe("data:image/png;base64,QQ==");
  });

  it("unticking the cast sheet removes its images and renumbers uploads", async () => {
    const input = setup();
    await chooseCast();
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image3" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Use cast sheet" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "@Image1" }).getAttribute("src")).toBe("data:image/png;base64,QQ==");
  });

  it("re-ticking puts the cast sheet back ahead of uploads", async () => {
    const input = setup();
    await chooseCast();
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image3" });
    const checkbox = screen.getByRole("checkbox", { name: "Use cast sheet" });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    expect(screen.getByRole("img", { name: "@Image1" }).getAttribute("src")).toBe("data:image/png;base64,Uw==");
    expect(screen.getByRole("img", { name: "@Image2" }).getAttribute("src")).toBe("data:image/png;base64,Qw==");
    expect(screen.getByRole("img", { name: "@Image3" }).getAttribute("src")).toBe("data:image/png;base64,QQ==");
  });

  it("sends cast sheet then uploads in input_references order", async () => {
    const onSubmit = vi.fn();
    const input = setup(onSubmit);
    await chooseCast();
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image3" });
    await submitTake();
    expect(onSubmit.mock.calls[0][0].input_references).toEqual([
      videoReference, imageReference("Uw=="), imageReference("Qw=="), imageReference("QQ=="),
    ]);
  });

  it("leaves the cast sheet out of the request when unticked", async () => {
    const onSubmit = vi.fn();
    const input = setup(onSubmit);
    await chooseCast();
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image3" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Use cast sheet" }));
    await submitTake();
    expect(onSubmit.mock.calls[0][0].input_references).toEqual([videoReference, imageReference("QQ==")]);
    expect(onSubmit.mock.calls[0][0].prompt).toContain("@Image1");
  });

  it("sends only the video when unticked and no uploads", async () => {
    const onSubmit = vi.fn();
    setup(onSubmit);
    await chooseCast();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use cast sheet" }));
    expect((screen.getByLabelText("Take prompt") as HTMLTextAreaElement).value).not.toContain("@Image1");
    await submitTake();
    expect(onSubmit.mock.calls[0][0].input_references).toEqual([videoReference]);
    expect(onSubmit.mock.calls[0][0].prompt).not.toContain("@Image1");
  });

  it("adds an image dropped onto the reference images field", async () => {
    const input = setup();
    fireEvent.drop(input, { dataTransfer: { files: [new File(["A"], "a.png", { type: "image/png" })] } });
    expect((await screen.findByRole("img", { name: "@Image1" })).getAttribute("src")).toBe("data:image/png;base64,QQ==");
    fireEvent.drop(input, { dataTransfer: { files: ["B", "C", "D", "E"].map((s) => new File([s], `${s}.png`, { type: "image/png" })) } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/3.*image|image.*3/i);
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });
});
