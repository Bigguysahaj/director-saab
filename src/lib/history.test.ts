import { beforeEach, describe, expect, it } from "vitest";
import { loadTakes, removeTake, saveTakes, upsertTake } from "./history";
import type { Take } from "./types";

const KEY = "director.dailies.v1";

function take(id: string, status: Take["status"] = "pending"): Take {
  return { id, prompt: id, model: "m", modelLabel: "Model", createdAt: 1, status };
}

beforeEach(() => localStorage.clear());

describe("dailies history", () => {
  it("keeps the pre-projects reel on the default key and isolates other projects", () => {
    saveTakes("default", [take("a")]);
    saveTakes("gini", [take("b")]);

    expect(localStorage.getItem(KEY)).toContain('"a"');
    expect(localStorage.getItem(`${KEY}:gini`)).toContain('"b"');
    expect(loadTakes("default").map((t) => t.id)).toEqual(["a"]);
    expect(loadTakes("gini").map((t) => t.id)).toEqual(["b"]);
    expect(loadTakes("other")).toEqual([]);
  });

  it("returns an empty reel when the stored JSON cannot be parsed", () => {
    localStorage.setItem(KEY, "{");
    expect(loadTakes("default")).toEqual([]);
  });

  it("stores at most 60 takes, keeping the front of the list", () => {
    const takes = Array.from({ length: 61 }, (_, i) => take(`t${i}`));
    saveTakes("default", takes);
    expect(loadTakes("default").map((t) => t.id)).toEqual(takes.slice(0, 60).map((t) => t.id));
  });

  it("updates a take in place and drops only the requested id", () => {
    const updated = upsertTake([take("a"), take("b")], take("b", "completed"));
    expect(updated.map((t) => t.id)).toEqual(["a", "b"]);
    expect(updated[1].status).toBe("completed");

    const withNew = upsertTake(updated, take("c"));
    expect(withNew.map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(removeTake(withNew, "a").map((t) => t.id)).toEqual(["c", "b"]);
    expect(removeTake(withNew, "missing")).toEqual(withNew);
  });
});
