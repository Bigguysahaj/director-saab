// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentType, parseDataUrl } from "./dataUrl";

describe("parseDataUrl", () => {
  it("parses a plain base64 data URL", () => {
    const parsed = parseDataUrl("data:image/png;base64,cGhvdG8=", "jpg");
    expect(parsed).toMatchObject({ mime: "image/png", ext: "png" });
    expect(parsed?.buffer.toString()).toBe("photo");
  });

  it("accepts extra parameters before base64", () => {
    expect(parseDataUrl("data:image/png;name=a.png;base64,cGhvdG8=", "jpg")).toMatchObject({ mime: "image/png", ext: "png" });
  });

  it("unknown MIME uses the caller's fallback", () => {
    const url = "data:application/x-foo;base64,cGhvdG8=";
    expect(parseDataUrl(url, "jpg")?.ext).toBe("jpg");
    expect(parseDataUrl(url, "bin")?.ext).toBe("bin");
  });

  it("rejects a non-data URL", () => {
    expect(parseDataUrl("https://example.com/a.png", "jpg")).toBeNull();
  });

  it("maps an uppercase MIME onto the lowercase extension", () => {
    const parsed = parseDataUrl("data:IMAGE/JPEG;base64,cGhvdG8=", "bin");
    expect(parsed).toMatchObject({ mime: "IMAGE/JPEG", ext: "jpg" });
    expect(parsed?.buffer.toString()).toBe("photo");
  });
});

describe("contentType", () => {
  it("maps an extension to its content type", () => {
    expect(contentType("png")).toBe("image/png");
    expect(contentType("a.jpeg")).toBe("image/jpeg");
    expect(contentType("mp4")).toBe("video/mp4");
    expect(contentType("clip.MOV")).toBe("video/quicktime");
    expect(contentType("photo.JPEG")).toBe("image/jpeg");
    expect(contentType("xyz")).toBe("application/octet-stream");
  });
});
