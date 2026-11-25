import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveStageSnapshot } from "@/lib/stageSnapshots";
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

let fetched: string[] = [];
const CONTENTS: Record<string, string> = { "/sheet.png": "S", "/closeup.png": "C", "/cand1.png": "K" };

function setup(onSubmit = vi.fn(), candidates: string[] = ["/cand1.png"]) {
  fetched = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (url === "/api/cast") return new Response(JSON.stringify([
      { id: "m1", name: "Ana", sheet: "/sheet.png", closeup: "/closeup.png", candidates },
    ]));
    fetched.push(String(url));
    return { ok: true, blob: async () => new Blob([CONTENTS[String(url)] ?? "X"], { type: "image/png" }) } as Response;
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

describe("SendTake cast image ticks", () => {
  it("attaches a ticked candidate after the sheets, with uploads after it", async () => {
    const onSubmit = vi.fn();
    const input = setup(onSubmit);
    await chooseCast();
    expect(fetched).not.toContain("/cand1.png");
    pick(input, "a.png", "A");
    await screen.findByRole("img", { name: "@Image3" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Send Ana candidate 1" }));
    expect((await screen.findByRole("img", { name: "@Image4" })).getAttribute("src")).toBe("data:image/png;base64,QQ==");
    expect(screen.getByRole("img", { name: "@Image3" }).getAttribute("src")).toBe("data:image/png;base64,Sw==");
    expect(fetched).toContain("/cand1.png");
    await submitTake();
    expect(onSubmit.mock.calls[0][0].input_references).toEqual([
      videoReference, imageReference("Uw=="), imageReference("Qw=="), imageReference("Sw=="), imageReference("QQ=="),
    ]);
  });

  it("sends only what is ticked, down to no cast images", async () => {
    const onSubmit = vi.fn();
    setup(onSubmit);
    await chooseCast();
    fireEvent.click(screen.getByRole("checkbox", { name: "Send Ana sheet" }));
    await waitFor(() => expect(screen.queryByRole("img", { name: "@Image2" })).toBeNull());
    expect(screen.getByRole("img", { name: "@Image1" }).getAttribute("src")).toBe("data:image/png;base64,Qw==");
    expect((screen.getByRole("checkbox", { name: "Send Ana close-up" }) as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Send Ana close-up" }));
    await waitFor(() => expect(screen.queryByRole("img", { name: "@Image1" })).toBeNull());
    await submitTake();
    expect(onSubmit.mock.calls[0][0].input_references).toEqual([videoReference]);
  });

  it("catches going over the 9-image limit on Preview", async () => {
    const onSubmit = vi.fn();
    const candidates = Array.from({ length: 8 }, (_, i) => `/c${i}.png`);
    setup(onSubmit, candidates);
    await chooseCast();
    for (let i = 1; i <= 8; i++) fireEvent.click(screen.getByRole("checkbox", { name: `Send Ana candidate ${i}` }));
    await screen.findByRole("img", { name: "@Image10" });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:take");
    vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(5);
    vi.spyOn(HTMLMediaElement.prototype, "src", "set").mockImplementation(function (this: HTMLMediaElement) {
      queueMicrotask(() => fireEvent.loadedMetadata(this));
    });
    fireEvent.change(screen.getByLabelText("Take video"), { target: { files: [new File(["V"], "take.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByText(/At most 9 reference images \(got 10\)/))).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

const priced: VideoModel = {
  ...model,
  id: "bytedance/seedance-2.0-mini",
  label: "Seedance 2.0 Mini",
  supported_durations: [4, 5, 8, 10],
  supported_resolutions: ["720p", "480p"],
  supported_aspect_ratios: ["16:9", "9:16"],
  supports_audio: true,
  token_rate: 0.0000035,
  video_input_token_rate: 0.0000021,
};

// Independent of estimateVideoCost, so a shared pricing bug does not hide itself.
function estimatedCost(outputSeconds: number, referenceSeconds: number): string {
  const tokens = (480 * 854 * 24 * (outputSeconds + referenceSeconds)) / 1024;
  return `Estimated cost: $${(tokens * 0.0000021).toFixed(2)}`;
}

function mockClip(seconds: number) {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:take");
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(seconds);
  vi.spyOn(HTMLMediaElement.prototype, "src", "set").mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => fireEvent.loadedMetadata(this));
  });
}

function renderTake(models: VideoModel[] = [priced], onSubmit = vi.fn()) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]"));
  render(<SendTake models={models} onSubmit={onSubmit} />);
  return onSubmit;
}

async function chooseClip(name: string, type = "video/mp4") {
  fireEvent.change(screen.getByLabelText("Take video"), {
    target: { files: [new File(["V"], name, { type })] },
  });
  await waitFor(() => expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(false));
}

describe("SendTake duration and cost", () => {
  afterEach(() => localStorage.clear());

  it("bills the next duration that covers the clip, at 480p, on the video-input rate", async () => {
    const onSubmit = renderTake();
    mockClip(7.4);
    await chooseClip("take.mp4");

    expect((screen.getByLabelText("Take duration") as HTMLSelectElement).value).toBe("8");
    expect((screen.getByLabelText("Take resolution") as HTMLSelectElement).value).toBe("480p");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByTestId("take-cost").textContent).toBe(estimatedCost(8, 7.4));
    expect(screen.getByLabelText("Take preview").textContent).toContain("480p · 8 s out · 7.4 s reference");

    fireEvent.change(screen.getByLabelText("Take duration"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByTestId("take-cost").textContent).toBe(estimatedCost(4, 7.4));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & generate" }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      duration: 4,
      resolution: "480p",
      aspect_ratio: "9:16",
      generate_audio: true,
    });
  });

  it("caps the billed duration at the longest option when the clip is longer", async () => {
    renderTake();
    mockClip(12);
    await chooseClip("take.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((screen.getByLabelText("Take duration") as HTMLSelectElement).value).toBe("10");
    expect(screen.getByTestId("take-cost").textContent).toBe(estimatedCost(10, 12));
  });

  it("says the cost is unknown when the model has no token rate", async () => {
    renderTake([model]);
    mockClip(5);
    await chooseClip("take.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByTestId("take-cost").textContent).toBe("Estimated cost: unknown for this model");
  });

  it("sends the model's aspect ratio when 9:16 is not offered", async () => {
    const onSubmit = renderTake([{ ...model, supported_aspect_ratios: ["1:1"] }]);
    mockClip(5);
    await chooseClip("take.mp4");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & generate" }));
    expect(onSubmit.mock.calls[0][0].aspect_ratio).toBe("1:1");
    expect(onSubmit.mock.calls[0][0].generate_audio).toBeUndefined();
  });

  it("rewrites an empty browser file type from the extension", async () => {
    const onSubmit = renderTake();
    mockClip(5);
    await chooseClip("take.MOV", "");
    fireEvent.change(screen.getByLabelText("Voice line"), {
      target: { files: [new File(["A"], "line.MP3", { type: "" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByLabelText("Voice line preview");
    fireEvent.click(screen.getByRole("button", { name: "Confirm & generate" }));

    const refs = onSubmit.mock.calls[0][0].input_references;
    expect(refs[0].video_url.url).toMatch(/^data:video\/quicktime;base64,/);
    expect(refs[1].audio_url.url).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("refuses a blank prompt and a WebM take before sending", async () => {
    const onSubmit = renderTake();
    mockClip(5);
    await chooseClip("take.webm", "video/webm");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/mp4|mov/i);
    expect(screen.queryByLabelText("Take preview")).toBeNull();

    await chooseClip("take.mp4");
    fireEvent.change(screen.getByLabelText("Take prompt"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toMatch(/prompt/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("logs the recorded stage snapshot after the stage has changed", async () => {
    const objects = [{ id: 1, kind: "box", position: [1, 0, 0], rotation: [0, 0, 0] }];
    saveStageSnapshot(localStorage, 1700, objects);
    localStorage.setItem("director-stage-layout-v3", JSON.stringify([{ id: 1, kind: "box", position: [9, 0, 0], rotation: [0, 0, 0] }]));
    const onSubmit = renderTake([model]);
    mockClip(5);
    await chooseClip("stage-clip-1700.mp4");
    expect(screen.getByText("Stage changed since this take was recorded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & generate" }));
    expect(onSubmit.mock.calls[0][0].stage).toEqual({ schema: "director-stage-scene/v1", objects });
  });

  it("does not attach a stage spec to a renamed clip", async () => {
    saveStageSnapshot(localStorage, 1700, [{ id: 1, kind: "box", position: [1, 0, 0], rotation: [0, 0, 0] }]);
    const onSubmit = renderTake([model]);
    mockClip(5);
    await chooseClip("my-take.mp4");
    expect(screen.getByText("No stage spec for this clip.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & generate" }));
    expect(onSubmit.mock.calls[0][0].stage).toBeUndefined();
  });
});

