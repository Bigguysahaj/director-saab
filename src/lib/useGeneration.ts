"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerateRequest, GenerationStatus } from "./types";

export type GenerationState = {
  jobId: string | null;
  status: GenerationStatus | "idle";
  error: string | null;
  videoUrl: string | null;
  cost: number | null;
};

const TERMINAL: GenerationStatus[] = ["completed", "failed", "cancelled", "expired"];

export function useGeneration(onSettled?: (state: GenerationState) => void) {
  const [state, setState] = useState<GenerationState>({
    jobId: null,
    status: "idle",
    error: null,
    videoUrl: null,
    cost: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  const stopPolling = useCallback(() => {
    cancelled.current = true;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Held in a ref (rather than useCallback) so the function can call itself
  // recursively via setTimeout without a temporal-dead-zone self-reference,
  // while always closing over the latest onSettled. Assigned in an effect
  // (not during render) since ref writes are a side effect.
  const pollRef = useRef<(id: string, delay: number) => Promise<void>>(null);
  useEffect(() => {
    pollRef.current = async (id: string, delay: number) => {
      if (cancelled.current) return;
      try {
        const res = await fetch(`/api/generate/${id}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Poll failed");

        if (TERMINAL.includes(data.status)) {
          const next: GenerationState = {
            jobId: id,
            status: data.status,
            error:
              data.status === "completed" ? null : data.error ?? "Generation did not complete",
            videoUrl:
              data.status === "completed" ? `/api/generate/${id}/content?index=0` : null,
            cost: data.usage?.cost ?? null,
          };
          setState(next);
          onSettled?.(next);
          return;
        }

        setState((s) => ({ ...s, jobId: id, status: data.status }));
        const nextDelay = Math.min(delay * 1.3, 10000);
        timer.current = setTimeout(() => pollRef.current?.(id, nextDelay), nextDelay);
      } catch (err) {
        const next: GenerationState = {
          jobId: id,
          status: "failed",
          error: err instanceof Error ? err.message : "Poll failed",
          videoUrl: null,
          cost: null,
        };
        setState(next);
        onSettled?.(next);
      }
    };
  });

  const submit = useCallback(async (body: GenerateRequest) => {
    cancelled.current = false;
    setState({ jobId: null, status: "pending", error: null, videoUrl: null, cost: null });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation request failed");
      setState((s) => ({ ...s, jobId: data.id, status: data.status ?? "pending" }));
      timer.current = setTimeout(() => pollRef.current?.(data.id, 3000), 3000);
    } catch (err) {
      setState({
        jobId: null,
        status: "failed",
        error: err instanceof Error ? err.message : "Generation request failed",
        videoUrl: null,
        cost: null,
      });
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState({ jobId: null, status: "idle", error: null, videoUrl: null, cost: null });
  }, [stopPolling]);

  return { state, submit, reset, stopPolling };
}
