import { beforeEach, describe, expect, it, vi } from "vitest";

const sharpMockState = vi.hoisted(() => {
  const pipelines: Array<{
    timeout: ReturnType<typeof vi.fn>;
    metadata: ReturnType<typeof vi.fn>;
    raw: ReturnType<typeof vi.fn>;
    toBuffer: ReturnType<typeof vi.fn>;
  }> = [];
  let metadataFailure: Error | undefined;
  let decodeFailure: Error | undefined;

  const sharpMock = vi.fn((...args: [unknown, unknown]) => {
    void args;
    const pipeline = {
      timeout: vi.fn(),
      metadata: vi.fn(),
      raw: vi.fn(),
      toBuffer: vi.fn(),
    };
    pipeline.timeout.mockReturnValue(pipeline);
    pipeline.raw.mockReturnValue(pipeline);
    if (pipelines.length === 0) {
      if (metadataFailure) {
        pipeline.metadata.mockRejectedValue(metadataFailure);
      } else {
        pipeline.metadata.mockResolvedValue({
          format: "jpeg",
          width: 1,
          height: 1,
          pages: 1,
          channels: 3,
        });
      }
    } else if (decodeFailure) {
      pipeline.toBuffer.mockRejectedValue(decodeFailure);
    } else {
      pipeline.toBuffer.mockResolvedValue(Buffer.alloc(3));
    }
    pipelines.push(pipeline);
    return pipeline;
  });

  return {
    pipelines,
    sharpMock,
    setMetadataFailure(error: Error | undefined): void {
      metadataFailure = error;
    },
    setDecodeFailure(error: Error | undefined): void {
      decodeFailure = error;
    },
  };
});

vi.mock("sharp", () => ({ default: sharpMockState.sharpMock }));

import {
  IMAGE_DECODE_TIMEOUT_SECONDS,
  ImageValidationError,
  MAX_IMAGE_CHANNELS,
  MAX_IMAGE_PIXELS,
  validateImageDataUrl,
} from "@/lib/http/validate-image-data-url";

function jpegDataUrl(): string {
  return `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64")}`;
}

function expectSafeSharpOptions(): void {
  for (const call of sharpMockState.sharpMock.mock.calls) {
    expect(call[1]).toEqual({
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
      limitInputChannels: MAX_IMAGE_CHANNELS,
      unlimited: false,
    });
  }
  for (const pipeline of sharpMockState.pipelines) {
    expect(pipeline.timeout).toHaveBeenCalledWith({ seconds: IMAGE_DECODE_TIMEOUT_SECONDS });
  }
}

beforeEach(() => {
  sharpMockState.pipelines.length = 0;
  sharpMockState.sharpMock.mockClear();
  sharpMockState.setMetadataFailure(undefined);
  sharpMockState.setDecodeFailure(undefined);
});

describe("validateImageDataUrl resource boundaries", () => {
  it("applies the same resource options and timeout to metadata and raw decode, and fails closed on decode timeout", async () => {
    sharpMockState.setDecodeFailure(new Error("libvips timeout: internal decoder detail"));

    let caught: unknown;
    try {
      await validateImageDataUrl(jpegDataUrl(), 1024);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ImageValidationError);
    expect((caught as Error).message).not.toContain("internal decoder detail");
    expect(sharpMockState.sharpMock).toHaveBeenCalledTimes(2);
    expectSafeSharpOptions();
  });

  it("fails closed at metadata pixel-limit rejection before a raw decode pipeline is created", async () => {
    sharpMockState.setMetadataFailure(new Error("Input image exceeds pixel limit"));

    await expect(validateImageDataUrl(jpegDataUrl(), 1024)).rejects.toBeInstanceOf(ImageValidationError);

    expect(sharpMockState.sharpMock).toHaveBeenCalledTimes(1);
    expect(sharpMockState.pipelines[0]?.raw).not.toHaveBeenCalled();
    expectSafeSharpOptions();
  });
});
