import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGeneration } from "./useGeneration";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useGeneration", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls until the job completes, then stops and reports the clip once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ id: "job-1", status: "pending" }))
      .mockResolvedValueOnce(json({ id: "job-1", status: "in_progress" }))
      .mockResolvedValueOnce(json({ id: "job-1", status: "completed", usage: { cost: 0.2 } }));
    const onSettled = vi.fn();
    const { result } = renderHook(() => useGeneration(onSettled));

    await act(async () => {
      await result.current.submit({ model: "m", prompt: "a dog" });
    });

    expect(result.current.state).toMatchObject({ jobId: "job-1", status: "pending", videoUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/generate");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.state.status).toBe("in_progress");
    expect(fetchMock.mock.calls[1]).toEqual(["/api/generate/job-1", { cache: "no-store" }]);
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3900);
    });
    expect(result.current.state).toMatchObject({
      jobId: "job-1",
      status: "completed",
      error: null,
      videoUrl: "/api/generate/job-1/content?index=0",
      cost: 0.2,
    });
    expect(onSettled).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["failed", "cancelled", "expired"] as const)(
    "settles a %s poll without a video url",
    async (status) => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(json({ id: "job-1", status: "pending" }))
        .mockResolvedValueOnce(json({ id: "job-1", status, error: "provider stopped" }));
      const onSettled = vi.fn();
      const { result } = renderHook(() => useGeneration(onSettled));

      await act(async () => {
        await result.current.submit({ model: "m", prompt: "a dog" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(result.current.state).toMatchObject({
        status,
        error: "provider stopped",
        videoUrl: null,
        cost: null,
      });
      expect(onSettled).toHaveBeenCalledTimes(1);
    },
  );

  it("uses a fallback error when a terminal poll has none", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ id: "job-1", status: "pending" }))
      .mockResolvedValueOnce(json({ id: "job-1", status: "failed" }));
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.submit({ model: "m", prompt: "a dog" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.state.error).toBe("Generation did not complete");
    expect(result.current.state.videoUrl).toBeNull();
  });

  it("stops after a failed poll and surfaces the server error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ id: "job-1", status: "pending" }))
      .mockResolvedValueOnce(json({ error: "OpenRouter poll video job failed (500)" }, 502));
    const onSettled = vi.fn();
    const { result } = renderHook(() => useGeneration(onSettled));

    await act(async () => {
      await result.current.submit({ model: "m", prompt: "a dog" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.state).toMatchObject({
      status: "failed",
      error: "OpenRouter poll video job failed (500)",
      videoUrl: null,
    });
    expect(onSettled).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails the submit itself when the server rejects the job", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json({ error: "OPENROUTER_API_KEY is not configured on the server." }, 501),
    );
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.submit({ model: "m", prompt: "a dog" });
    });

    expect(result.current.state).toMatchObject({
      jobId: null,
      status: "failed",
      error: "OPENROUTER_API_KEY is not configured on the server.",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reset cancels a poll that has not fired yet", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      json({ id: "job-1", status: "pending" }),
    );
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.submit({ model: "m", prompt: "a dog" });
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(result.current.state.status).toBe("idle");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
