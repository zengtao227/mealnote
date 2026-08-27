import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ImageValidationError,
  MAX_IMAGE_PIXELS,
  validateImageDataUrl,
} from "@/lib/http/validate-image-data-url";

type ImageType = "jpeg" | "png" | "webp";

const VALID_ANIMATED_WEBP_BASE64 =
  "UklGRoQAAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAAEAAAEAAGQAAAJWUDhMDwAAAC8BQAAABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAAEAAAEAAGQAAABWUDhMDwAAAC8BQAAAB9D/iP4HIqL/AQA=";

function fixture(name: string): Buffer {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));
}

function toDataUrl(type: ImageType, bytes: Buffer): string {
  return `data:image/${type};base64,${bytes.toString("base64")}`;
}

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

describe("validateImageDataUrl", () => {
  it.each<ImageType>(["jpeg", "png", "webp"])(
    "accepts a fully decodable %s fixture",
    async (type: ImageType) => {
      const bytes: Buffer = fixture(`valid.${type}`);
      await expect(validateImageDataUrl(toDataUrl(type, bytes), bytes.byteLength)).resolves.toBeUndefined();
    },
  );

  it.each<ImageType>(["jpeg", "png", "webp"])(
    "rejects a truncated %s fixture even when its signature is intact",
    async (type: ImageType) => {
      const bytes: Buffer = fixture(`truncated.${type}`);
      await expect(validateImageDataUrl(toDataUrl(type, bytes), 1024 * 1024)).rejects.toThrow(
        /损坏|无法解码|安全解码范围/,
      );
    },
  );

  it.each<ImageType>(["jpeg", "png", "webp"])(
    "rejects a magic-bytes-only %s fixture",
    async (type: ImageType) => {
      const bytes: Buffer = fixture(`magic-only.${type}`);
      await expect(validateImageDataUrl(toDataUrl(type, bytes), 1024)).rejects.toThrow(
        /损坏|无法解码|安全解码范围/,
      );
    },
  );

  it.each<[ImageType, ImageType]>([
    ["jpeg", "png"],
    ["png", "webp"],
    ["webp", "jpeg"],
  ])(
    "rejects a valid %s image declared as %s",
    async (actualType: ImageType, declaredType: ImageType) => {
      const bytes: Buffer = fixture(`valid.${actualType}`);
      await expect(validateImageDataUrl(toDataUrl(declaredType, bytes), 1024 * 1024)).rejects.toThrow(
        "内容与声明格式不一致",
      );
    },
  );

  it("rejects a valid animated WebP because V1 only accepts single-frame images", async () => {
    const webp: Buffer = Buffer.from(VALID_ANIMATED_WEBP_BASE64, "base64");
    await expect(validateImageDataUrl(toDataUrl("webp", webp), 1024 * 1024)).rejects.toThrow(
      "暂不支持动画或多帧图片",
    );
  });

  it("rejects a multi-frame WebP before any later damaged frame can reach a provider", async () => {
    const webp: Buffer = fixture("corrupt-second-frame.webp");
    await expect(validateImageDataUrl(toDataUrl("webp", webp), 1024 * 1024)).rejects.toThrow(
      "暂不支持动画或多帧图片",
    );
  });

  it("accepts an image exactly at the 16 MP application pixel budget", async () => {
    const png: Buffer = await solidPng(4000, 4000);
    expect(4000 * 4000).toBe(MAX_IMAGE_PIXELS);
    await expect(validateImageDataUrl(toDataUrl("png", png), 5 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it("rejects an image just above the 16 MP pixel budget before raw decoding is authorized", async () => {
    const png: Buffer = await solidPng(4001, 4000);
    expect(4001 * 4000).toBeGreaterThan(MAX_IMAGE_PIXELS);
    await expect(validateImageDataUrl(toDataUrl("png", png), 5 * 1024 * 1024)).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });

  it("rejects a small compressed image with a very large decoded pixel count", async () => {
    const png: Buffer = fixture("high-pixel.png");
    expect(png.byteLength).toBeLessThan(1024 * 1024);
    await expect(validateImageDataUrl(toDataUrl("png", png), 5 * 1024 * 1024)).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });

  it("accepts a valid image exactly at the encoded byte limit", async () => {
    const png: Buffer = fixture("valid.png");
    await expect(validateImageDataUrl(toDataUrl("png", png), png.byteLength)).resolves.toBeUndefined();
  });

  it("rejects a valid image one byte over the encoded byte limit", async () => {
    const png: Buffer = fixture("valid.png");
    await expect(validateImageDataUrl(toDataUrl("png", png), png.byteLength - 1)).rejects.toThrow(
      "不能超过 5 MB",
    );
  });
});
