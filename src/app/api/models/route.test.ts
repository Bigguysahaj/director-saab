// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const or = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => or.configured,
  fetchVideoModelsRaw: vi.fn(async () => ({ data: [{ id: "bytedance/seedance-2.0-mini" }] })),
}));

import { FALLBACK_MODELS } from "@/lib/models";
import type { VideoModel } from "@/lib/types";
import { GET } from "./route";

const FLASH = "modelark/dreamina-seedance-2-5-flash-261115";
const ids = async () => ((await (await GET()).json()).models as VideoModel[]);

afterEach(() => {
  vi.unstubAllEnvs();
  or.configured = true;
});

describe("GET /api/models", () => {
  it("includes Seedance 2.5 Flash when ARK_API_KEY is set", async () => {
    vi.stubEnv("ARK_API_KEY", "test");
    const models = await ids();
    expect(models.map((m) => m.id)).toEqual(expect.arrayContaining(["bytedance/seedance-2.0-mini", FLASH]));
    const flash = models.find((m) => m.id === FLASH)!;
    expect(flash).toMatchObject({
      label: "Seedance 2.5 Flash",
      provider: "ModelArk",
      badge: "Fast · cheap",
      supported_resolutions: ["480p", "720p"],
      token_rate: 0.000007,
    });
    expect(flash.video_input_token_rate).toBeGreaterThan(0);
    expect(Math.min(...flash.supported_durations)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...flash.supported_durations)).toBeLessThanOrEqual(30);
    expect(flash.price_per_second).toBeCloseTo(0.0673, 4);
  });

  it("leaves Flash out when ARK_API_KEY is unset", async () => {
    vi.stubEnv("ARK_API_KEY", "");
    expect((await ids()).some((m) => m.id.startsWith("modelark/"))).toBe(false);
  });

  it("still lists Flash when only ARK_API_KEY is set", async () => {
    or.configured = false;
    vi.stubEnv("ARK_API_KEY", "test");
    expect((await ids()).map((m) => m.id)).toEqual([...FALLBACK_MODELS.map((m) => m.id), FLASH]);
  });
});
