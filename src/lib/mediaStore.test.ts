// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchR2 } = vi.hoisted(() => ({ fetchR2: vi.fn() }));
vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch(url: string, init: RequestInit = {}) {
      return fetchR2(String(url), init.method ?? "GET", new Headers(init.headers), init.body);
    }
  },
}));

let root: string;
const BASE = "https://director.example.ngrok.app";
const R2 = {
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "references",
  R2_PUBLIC_BASE_URL: "https://media.example.com",
};
const ENDPOINT = "https://account.r2.cloudflarestorage.com/references";
const NAME = "00000000-0000-4000-8000-000000000001.mp4";
const SECOND = "00000000-0000-4000-8000-000000000002.png";
const KEY = `proj/${NAME}`;
const bytes = Buffer.from("mp4-bytes");
const useR2 = () => {
  for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
};
const listXml = () => new Response(
  `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${KEY}</Key></Contents><Contents><Key>proj/${SECOND}</Key></Contents></ListBucketResult>`,
  { headers: { "Content-Type": "application/xml" } }
);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-media-store-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
  vi.stubEnv("PUBLIC_MEDIA_BASE_URL", BASE);
  for (const name of Object.keys(R2)) vi.stubEnv(name, "");
  fetchR2.mockReset();
  fetchR2.mockImplementation(async () => new Response(null, { status: 200 }));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("mediaStore local", () => {
  it("put writes the file and returns a public https URL", async () => {
    const { mediaStore } = await import("./mediaStore");
    const stored = await mediaStore().put("proj", NAME, bytes, "video/mp4");
    expect(stored).toEqual({ key: KEY, url: `${BASE}/api/media/${KEY}` });
    expect(await readFile(path.join(root, "media", KEY))).toEqual(bytes);
  });

  it("list returns only what was put for a project", async () => {
    const { mediaStore } = await import("./mediaStore");
    const store = mediaStore();
    await store.put("proj", NAME, bytes, "video/mp4");
    await store.put("proj", SECOND, Buffer.from("png"), "image/png");
    await store.put("other", NAME, bytes, "video/mp4");
    expect((await store.list("proj")).sort()).toEqual([KEY, `proj/${SECOND}`].sort());
  });

  it("delete removes a single file and the media GET returns 404", async () => {
    const { mediaStore } = await import("./mediaStore");
    const store = mediaStore();
    await store.put("proj", NAME, bytes, "video/mp4");
    await store.delete(KEY);
    await expect(readFile(path.join(root, "media", KEY))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.list("proj")).toEqual([]);
    const { GET } = await import("../app/api/media/[project]/[filename]/route");
    const response = await GET(new Request(`${BASE}/api/media/${KEY}`), {
      params: Promise.resolve({ project: "proj", filename: NAME }),
    });
    expect(response.status).toBe(404);
  });

  it("deleteAll removes only that project's files", async () => {
    const { mediaStore } = await import("./mediaStore");
    const store = mediaStore();
    await store.put("proj", NAME, bytes, "video/mp4");
    await store.put("proj", SECOND, Buffer.from("png"), "image/png");
    await store.put("other", NAME, bytes, "video/mp4");
    await store.deleteAll("proj");
    expect(await store.list("proj")).toEqual([]);
    await expect(readFile(path.join(root, "media", KEY))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(root, "media", "proj", SECOND))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.list("other")).toEqual([`other/${NAME}`]);
    expect(await readFile(path.join(root, "media", "other", NAME))).toEqual(bytes);
  });

  it("delete rejects traversal and leaves files outside media untouched", async () => {
    const { mediaStore } = await import("./mediaStore");
    await mkdir(path.join(root, "projects"));
    const outside = path.join(root, "projects", "x");
    await writeFile(outside, "keep");
    await expect(async () => mediaStore().delete("../projects/x")).rejects.toThrow();
    expect(await readFile(outside, "utf-8")).toBe("keep");
    expect(fetchR2).not.toHaveBeenCalled();
  });
});

describe("mediaStore R2", () => {
  it("selects R2 and puts bytes with the content type and public URL", async () => {
    useR2();
    const { mediaStore } = await import("./mediaStore");
    expect(await mediaStore().put("proj", NAME, bytes, "video/mp4"))
      .toEqual({ key: KEY, url: `${R2.R2_PUBLIC_BASE_URL}/${KEY}` });
    expect(fetchR2).toHaveBeenCalledTimes(1);
    const [url, method, headers, body] = fetchR2.mock.calls[0];
    expect(url).toBe(`${ENDPOINT}/${KEY}`);
    expect(method).toBe("PUT");
    expect(headers.get("Content-Type")).toBe("video/mp4");
    expect(headers.get("Content-Length")).toBe(String(bytes.byteLength));
    expect(Buffer.from(body)).toEqual(bytes);
    expect(await readdir(root)).toEqual([]);
  });

  it("list maps ListObjectsV2 keys under the project prefix", async () => {
    useR2();
    fetchR2.mockImplementation(async () => listXml());
    const { mediaStore } = await import("./mediaStore");
    expect(await mediaStore().list("proj")).toEqual([KEY, `proj/${SECOND}`]);
    expect(fetchR2).toHaveBeenCalledTimes(1);
    const [url, method] = fetchR2.mock.calls[0];
    const request = new URL(url);
    expect(`${request.origin}${request.pathname}`).toBe(ENDPOINT);
    expect(method).toBe("GET");
    expect(request.searchParams.get("list-type")).toBe("2");
    expect(request.searchParams.get("prefix")).toBe("proj/");
  });

  it("delete sends DeleteObject for the key", async () => {
    useR2();
    const { mediaStore } = await import("./mediaStore");
    await mediaStore().delete(KEY);
    expect(fetchR2).toHaveBeenCalledTimes(1);
    expect(fetchR2.mock.calls[0].slice(0, 2)).toEqual([`${ENDPOINT}/${KEY}`, "DELETE"]);
  });

  it("deleteAll deletes every listed key under the project prefix", async () => {
    useR2();
    fetchR2.mockImplementation(async (_url, method) => method === "GET" ? listXml() : new Response(null));
    const { mediaStore } = await import("./mediaStore");
    await mediaStore().deleteAll("proj");
    expect(fetchR2).toHaveBeenCalledTimes(3);
    const [url, method] = fetchR2.mock.calls[0];
    const request = new URL(url);
    expect(`${request.origin}${request.pathname}`).toBe(ENDPOINT);
    expect(method).toBe("GET");
    expect(request.searchParams.get("list-type")).toBe("2");
    expect(request.searchParams.get("prefix")).toBe("proj/");
    expect(fetchR2.mock.calls.slice(1).map(([url, method]) => [url, method]).sort())
      .toEqual([[`${ENDPOINT}/${KEY}`, "DELETE"], [`${ENDPOINT}/proj/${SECOND}`, "DELETE"]].sort());
  });

  it("partial config throws MediaConfigError naming the missing variable", async () => {
    useR2();
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    const { mediaStore, MediaConfigError } = await import("./mediaStore");
    const upload = async () => mediaStore().put("proj", NAME, bytes, "video/mp4");
    await expect(upload()).rejects.toBeInstanceOf(MediaConfigError);
    await expect(upload()).rejects.toThrow(/R2_SECRET_ACCESS_KEY/);
    expect(fetchR2).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });
});
