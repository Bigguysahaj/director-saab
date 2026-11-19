// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createVideoTask, fetchVideoTaskContent, generateImage, pollVideoTask } from "./modelark";

const request = {
  model: "modelark/seedream-4-5-251128",
  prompt: "Keep the actor recognizable",
  input_references: [
    { type: "image_url" as const, image_url: { url: "data:image/png;base64,AAA" } },
    { type: "image_url" as const, image_url: { url: "data:image/jpeg;base64,BBB" } },
  ],
};

beforeEach(() => vi.stubEnv("ARK_API_KEY", "test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ModelArk image generation", () => {
  it("sends Seedream's request shape and normalizes response cost", async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      expect(args).toHaveLength(2);
      return Response.json({
        data: [{ b64_json: "AAA", size: "2048x2048" }],
        usage: { generated_images: 1 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateImage(request)).resolves.toEqual({
      data: [{ b64_json: "AAA", media_type: "image/jpeg" }],
      usage: { cost: 0.04 },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(options).toBeDefined();
    expect(url).toBe("https://ark.ap-southeast.bytepluses.com/api/v3/images/generations");
    expect(options?.method).toBe("POST");
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer test");
    expect(JSON.parse(options?.body as string)).toMatchObject({
      model: "seedream-4-5-251128",
      prompt: request.prompt,
      image: ["data:image/png;base64,AAA", "data:image/jpeg;base64,BBB"],
      response_format: "b64_json",
      watermark: false,
      size: "2K",
    });
  });

  it.each([200, 400])("surfaces Ark error codes on HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: { code: "InputImageSensitiveContentDetected", message: "image rejected" },
    }, { status })));
    await expect(generateImage(request)).rejects.toThrow("InputImageSensitiveContentDetected");
  });
});

describe("ModelArk video generation", () => {
  const FLASH = "modelark/dreamina-seedance-2-5-flash-261115";
  const TASKS = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
  const videoRequest = {
    model: FLASH,
    prompt: "A dolly-in on a cup",
    duration: 4,
    resolution: "480p",
    aspect_ratio: "16:9",
    seed: 7,
    generate_audio: true,
    frame_images: [{ type: "image_url" as const, image_url: { url: "https://x/first.png" }, frame_type: "first_frame" as const }],
    input_references: [
      { type: "image_url" as const, image_url: { url: "https://x/ref.png" } },
      { type: "video_url" as const, video_url: { url: "https://x/ref.mp4" } },
      { type: "audio_url" as const, audio_url: { url: "https://x/ref.mp3" } },
    ],
  };

  it("createVideoTask sends ModelArk's task shape", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => Response.json({ id: "cgt-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createVideoTask(videoRequest)).resolves.toMatchObject({ id: "ark-cgt-1", status: "pending" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(TASKS);
    expect(options?.method).toBe("POST");
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer test");
    expect(JSON.parse(options?.body as string)).toEqual({
      model: "dreamina-seedance-2-5-flash-261115",
      content: [
        { type: "text", text: videoRequest.prompt },
        { type: "image_url", image_url: { url: "https://x/first.png" }, role: "first_frame" },
        { type: "image_url", image_url: { url: "https://x/ref.png" }, role: "reference_image" },
        { type: "video_url", video_url: { url: "https://x/ref.mp4" }, role: "reference_video" },
        { type: "audio_url", audio_url: { url: "https://x/ref.mp3" }, role: "reference_audio" },
      ],
      resolution: "480p",
      ratio: "16:9",
      duration: 4,
      seed: 7,
      generate_audio: true,
      watermark: false,
    });
  });

  it("createVideoTask rejects without a key or a modelark/ id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createVideoTask({ ...videoRequest, model: "bytedance/seedance-2.5" })).rejects.toThrow();
    vi.stubEnv("ARK_API_KEY", "");
    await expect(createVideoTask(videoRequest)).rejects.toThrow("ARK_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createVideoTask surfaces ModelArk errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: { code: "InvalidParameter", message: "bad ratio" } }, { status: 400 })));
    await expect(createVideoTask(videoRequest)).rejects.toThrow(/400.*InvalidParameter: bad ratio/);
  });

  it.each([
    ["queued", "pending"],
    ["running", "in_progress"],
    ["succeeded", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["expired", "expired"],
  ])("pollVideoTask maps %s to %s", async (arkStatus, status) => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => Response.json({
      id: "cgt-1",
      model: "dreamina-seedance-2-5-flash-261115",
      status: arkStatus,
      ...(arkStatus === "succeeded" && { content: { video_url: "https://ark/out.mp4" }, usage: { completion_tokens: 48000 } }),
      ...(arkStatus === "failed" && { error: { code: "OutputVideoSensitive", message: "blocked" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await pollVideoTask("ark-cgt-1");
    expect(fetchMock.mock.calls[0][0]).toBe(`${TASKS}/cgt-1`);
    expect(res).toMatchObject({ id: "ark-cgt-1", status });
    if (arkStatus === "succeeded") {
      expect(res.unsigned_urls).toEqual(["https://ark/out.mp4"]);
      expect(res.usage?.cost).toBeCloseTo(0.336, 6);
    }
    if (arkStatus === "failed") expect(res.error).toContain("blocked");
  });

  it("fetchVideoTaskContent streams the task's video_url", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url === "https://ark/out.mp4"
        ? new Response("mp4bytes", { headers: { "content-type": "video/mp4" } })
        : Response.json({ id: "cgt-1", status: "succeeded", content: { video_url: "https://ark/out.mp4" } })));
    const res = await fetchVideoTaskContent("ark-cgt-1");
    expect(await res.text()).toBe("mp4bytes");

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "cgt-1", status: "running" })));
    await expect(fetchVideoTaskContent("ark-cgt-1")).rejects.toThrow();
  });
});
