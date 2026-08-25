import { describe, expect, it } from "vitest";
import { validateImageDataUrl } from "@/lib/http/validate-image-data-url";

function toDataUrl(type: "jpeg" | "png" | "webp", bytes: number[]): string {
  return `data:image/${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("validateImageDataUrl", () => {
  it("accepts an image whose declared type matches its signature", () => {
    const jpegDataUrl: string = toDataUrl("jpeg", [0xff, 0xd8, 0xff, 0x00]);
    expect(() => validateImageDataUrl(jpegDataUrl, 1024)).not.toThrow();
  });

  it("rejects a forged MIME declaration", () => {
    const forgedPng: string = toDataUrl("png", [0xff, 0xd8, 0xff, 0x00]);
    expect(() => validateImageDataUrl(forgedPng, 1024)).toThrow("内容与声明格式不一致");
  });

  it("rejects decoded content over the byte limit", () => {
    const oversizedJpeg: string = toDataUrl("jpeg", [0xff, 0xd8, 0xff, 0x00, 0x00]);
    expect(() => validateImageDataUrl(oversizedJpeg, 4)).toThrow("不能超过 5 MB");
  });
});
