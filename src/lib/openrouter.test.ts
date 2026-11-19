// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { fetchVideoContent, isConfigured, pollVideoJob } from "./openrouter";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: "job", status: "pending" }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("openrouter job urls", () => {
  it("encodes job ids so reserved characters stay inside one path segment", async () => {
    const id = "job/a?b#c d";
    await pollVideoJob(id);
    const content = await fetchVideoContent(id, 2);
    expect(content.ok).toBe(true);

    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/videos/job%2Fa%3Fb%23c%20d");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer sk-test-key" } });
    expect(fetchMock.mock.calls[1][0]).toBe("https://openrouter.ai/api/v1/videos/job%2Fa%3Fb%23c%20d/content?index=2");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer sk-test-key");
  });

  it("does not call OpenRouter without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(isConfigured()).toBe(false);
    await expect(pollVideoJob("job-1")).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(fetchVideoContent("job-1", 0)).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes the upstream status when a poll or content fetch fails", async () => {
    fetchMock.mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(pollVideoJob("job-1")).rejects.toThrow(/poll video job failed \(404\)/);
    await expect(fetchVideoContent("job-1", 0)).rejects.toThrow(/content fetch failed \(404\)/);
  });
});
