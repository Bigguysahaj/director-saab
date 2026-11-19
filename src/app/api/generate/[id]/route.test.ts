// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/openrouter", () => ({
  pollVideoJob: vi.fn(async (id: string) => ({ id, status: "in_progress" })),
  fetchVideoContent: vi.fn(),
}));
vi.mock("@/lib/modelark", () => ({
  pollVideoTask: vi.fn(async (id: string) => ({ id, status: "completed", usage: { cost: 0.3 } })),
  fetchVideoTaskContent: vi.fn(async () => new Response("mp4")),
}));
vi.mock("@/lib/takeLog", () => ({ recordTakeResult: vi.fn(async () => {}) }));

import { fetchVideoTaskContent, pollVideoTask } from "@/lib/modelark";
import { pollVideoJob } from "@/lib/openrouter";
import { recordTakeResult } from "@/lib/takeLog";
import { GET } from "./route";

const get = (id: string) => GET(new Request(`http://localhost/api/generate/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/generate/[id]", () => {
  it("routes ark- ids to ModelArk and others to OpenRouter", async () => {
    expect((await get("ark-cgt-1")).status).toBe(200);
    expect(pollVideoTask).toHaveBeenCalledWith("ark-cgt-1");
    expect(pollVideoJob).not.toHaveBeenCalled();

    const [, , fetchOutput] = vi.mocked(recordTakeResult).mock.calls[0];
    await fetchOutput();
    expect(fetchVideoTaskContent).toHaveBeenCalledWith("ark-cgt-1");

    vi.mocked(pollVideoTask).mockClear();
    await get("or-job-1");
    expect(pollVideoJob).toHaveBeenCalledWith("or-job-1");
    expect(pollVideoTask).not.toHaveBeenCalled();
  });
});
