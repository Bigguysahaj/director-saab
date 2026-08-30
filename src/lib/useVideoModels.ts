"use client";

import { useEffect, useState } from "react";
import type { VideoModel } from "./types";

export function useVideoModels() {
  const [models, setModels] = useState<VideoModel[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setModels(data.models ?? []);
        setLive(Boolean(data.live));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { models, live, loading };
}
