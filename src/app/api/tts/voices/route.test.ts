// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({ isElevenLabsConfigured: vi.fn(() => true), listVoices: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/elevenlabs", () => lib);
import { GET } from "./route";

beforeEach(() => lib.isElevenLabsConfigured.mockReturnValue(true));

describe("GET /api/tts/voices", () => {
  it("returns the voice list", async () => {
    lib.listVoices.mockResolvedValue([{ id: "a", name: "Rachel" }, { id: "b", name: "Adam" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "a", name: "Rachel" }, { id: "b", name: "Adam" }]);
  });

  it("returns 503 when not configured", async () => {
    lib.isElevenLabsConfigured.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(lib.listVoices).not.toHaveBeenCalled();
  });

  it("returns a provider error as 502", async () => {
    lib.listVoices.mockRejectedValue(new Error("ElevenLabs failed (500)"));
    expect((await GET()).status).toBe(502);
  });
});
