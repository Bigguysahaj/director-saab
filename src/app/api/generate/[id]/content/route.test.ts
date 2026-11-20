// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const openrouter = vi.hoisted(() => ({ fetchVideoContent: vi.fn() }));
vi.mock("@/lib/openrouter", () => openrouter);

import { GET } from "./route";

const get = (id: string, index?: string) =>
  GET(new Request(`http://localhost/api/generate/${id}/content${index === undefined ? "" : `?index=${index}`}`), {
    params: Promise.resolve({ id }),
  });

describe("GET /api/generate/[id]/content", () => {
  it("proxies the clip and forwards the index, defaulting to 0", async () => {
    openrouter.fetchVideoContent.mockResolvedValueOnce(
      new Response(Uint8Array.from([9, 8]), { headers: { "content-type": "video/mp4" } }),
    );
    const res = await get("job-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([9, 8]));
    expect(openrouter.fetchVideoContent).toHaveBeenCalledWith("job-1", 0);

    openrouter.fetchVideoContent.mockResolvedValueOnce(new Response(Uint8Array.from([4])));
    const second = await get("job/1", "2");
    expect(second.headers.get("Content-Type")).toBe("video/mp4");
    expect(openrouter.fetchVideoContent).toHaveBeenCalledWith("job/1", 2);
  });

  it("returns 502 when the provider content fetch fails", async () => {
    openrouter.fetchVideoContent.mockRejectedValue(new Error("OpenRouter content fetch failed (404)"));
    const res = await get("job-1", "0");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("OpenRouter content fetch failed (404)");
  });
});
