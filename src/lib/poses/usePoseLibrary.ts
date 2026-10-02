"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parsePack, POSE_LIBRARY_KEY, type PoseAsset } from "./library";

export const POSE_LIBRARY_CHANGED = "director-pose-library-changed";
const STORAGE_UNAVAILABLE = "storage-unavailable";
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === POSE_LIBRARY_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(POSE_LIBRARY_CHANGED, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(POSE_LIBRARY_CHANGED, notify);
  };
}
function snapshot() {
  try { return window.localStorage.getItem(POSE_LIBRARY_KEY); }
  catch { return STORAGE_UNAVAILABLE; }
}

/** A cached string snapshot avoids render loops and keeps multiple tabs in sync. */
export function usePoseLibrary() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo((): { saved: PoseAsset[]; ready: boolean; error: string } => {
    try {
      return { saved: raw === null ? [] : parsePack(raw).poses, ready: true, error: "" };
    } catch {
      return { saved: [], ready: false, error: "Your pose library could not be read. Existing data has been preserved; reload after restoring browser storage." };
    }
  }, [raw]);
}
