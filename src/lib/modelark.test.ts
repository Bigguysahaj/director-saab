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

  it("does not call Ark without a key, a modelark id, or image-only references", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ARK_API_KEY", "");
    await expect(generateImage(request)).rejects.toThrow(/ARK_API_KEY/);

    vi.stubEnv("ARK_API_KEY", "test");
    await expect(generateImage({ ...request, model: "google/gemini" })).rejects.toThrow(/modelark\//);
    await expect(generateImage({
      ...request,
      input_references: [{ type: "video_url", video_url: { url: "https://cdn.example/clip.mp4" } }],
    })).rejects.toThrow(/image references only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty or unreadable image payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [] })));
    await expect(generateImage(request)).rejects.toThrow(/no image/);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ size: "1024x1024" }] })));
    await expect(generateImage(request)).rejects.toThrow(/no image/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    await expect(generateImage(request)).rejects.toThrow(/invalid response/);
  });

  it("keeps the base price at 2.6 megapixels and for a size it cannot parse", async () => {
    const pro = "modelark/dola-seedream-5-0-pro-260628";
    const priced = async (model: string, size: string) => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({
        data: [{ b64_json: "A", size }],
        usage: { generated_images: 1 },
      })));
      return (await generateImage({ ...request, model })).usage.cost;
    };

    expect(await priced(pro, "2000x1300")).toBeCloseTo(0.045);
    expect(await priced(pro, "2000x1301")).toBeCloseTo(0.09);
    expect(await priced(pro, "2K")).toBeCloseTo(0.045);
    expect(await priced("modelark/seedream-4-5-251128", "4096x4096")).toBeCloseTo(0.04);
  });
});
