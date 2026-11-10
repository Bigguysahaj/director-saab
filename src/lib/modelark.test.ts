// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { generateImage } from "./modelark";

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
