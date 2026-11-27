// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createVideoJob, fetchImageModelsRaw, fetchVideoModelsRaw, generateImage } from "./openrouter";

const fetchMock = vi.fn();
const KEY = "sk-test-key";

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", KEY);
  vi.stubEnv("OPENROUTER_SITE_URL", "");
  vi.stubEnv("OPENROUTER_SITE_NAME", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: "job-1", status: "pending" }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("openrouter paid calls", () => {
  it("does not call OpenRouter without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(createVideoJob({ model: "m", prompt: "a dog" })).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(generateImage({ model: "m", prompt: "a dog" })).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(fetchVideoModelsRaw()).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(fetchImageModelsRaw()).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the video job body and the image body to their own endpoints", async () => {
    vi.stubEnv("OPENROUTER_SITE_URL", "https://director.example");
    vi.stubEnv("OPENROUTER_SITE_NAME", "Director Saab");
    const video = { model: "m", prompt: "a dog", input_references: [{ type: "image_url" as const, image_url: { url: "https://cdn.example/a.png" } }] };
    await createVideoJob(video);
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ b64_json: "AAA" }] }));
    await generateImage({ model: "image/m", prompt: "a portrait" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/videos");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(video);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://director.example",
      "X-Title": "Director Saab",
    });

    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/images");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ model: "image/m", prompt: "a portrait" });
  });

  it("names the failed action and status, and does not add the API key", async () => {
    fetchMock.mockImplementation(async () => new Response("payment required", { status: 402 }));
    const err = await createVideoJob({ model: "m", prompt: "a dog" }).catch((e: Error) => e);
    expect((err as Error).message).toBe("OpenRouter create video job failed (402): payment required");
    expect((err as Error).message).not.toContain(KEY);

    fetchMock.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    await expect(fetchVideoModelsRaw()).rejects.toThrow("OpenRouter list models failed (503): unavailable");
    await expect(fetchImageModelsRaw()).rejects.toThrow("OpenRouter list image models failed (503): unavailable");
  });
});
