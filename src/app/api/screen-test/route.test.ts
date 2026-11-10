// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({ isConfigured: () => false, generateImage: vi.fn() }));
vi.mock("@/lib/modelark", () => ({ isArkConfigured: () => Boolean(process.env.ARK_API_KEY), generateImage: vi.fn() }));
vi.mock("@/lib/screenTestStore", () => ({
  readLatestScreenTest: vi.fn(),
  saveScreenTest: vi.fn(async (_image: string, cost: number) => ({ cost })),
  toClientScreenTest: vi.fn((record) => record),
}));

import { generateImage as generateArkImage } from "@/lib/modelark";
import { generateImage as generateOpenRouterImage } from "@/lib/openrouter";
import { saveScreenTest } from "@/lib/screenTestStore";
import { POST } from "./route";

const post = () => POST(new Request("http://localhost/api/screen-test", {
  method: "POST",
  body: JSON.stringify({
    stagePhoto: "data:image/png;base64,STAGE",
    cast: [
      { name: "Actor A", photo: "data:image/png;base64,A" },
      { name: "Actor B", photo: "data:image/png;base64,B" },
    ],
    model: "modelark/seedream-4-5-251128",
  }),
}));

beforeEach(() => {
  vi.stubEnv("ARK_API_KEY", "test");
  vi.mocked(generateArkImage).mockResolvedValue({
    data: [{ b64_json: "RESULT", media_type: "image/jpeg" }],
    usage: { cost: 0.04 },
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/screen-test", () => {
  it("dispatches Ark models and records their cost", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(generateArkImage).toHaveBeenCalledOnce();
    expect(vi.mocked(generateArkImage).mock.calls[0][0].input_references).toHaveLength(3);
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(saveScreenTest).toHaveBeenCalledWith("data:image/jpeg;base64,RESULT", 0.04);
  });

  it("returns 501 with a missing Ark key", async () => {
    vi.stubEnv("ARK_API_KEY", "");
    const res = await post();
    expect(res.status).toBe(501);
    expect((await res.json()).error).toContain("ARK_API_KEY");
  });
});
