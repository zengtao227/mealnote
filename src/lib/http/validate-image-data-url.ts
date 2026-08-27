import sharp from "sharp";

const DATA_URL_PATTERN: RegExp = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export const MAX_IMAGE_PIXELS: number = 16_000_000;
export const MAX_IMAGE_CHANNELS: number = 4;
export const IMAGE_DECODE_TIMEOUT_SECONDS: number = 3;

const SHARP_INPUT_OPTIONS = {
  failOn: "warning" as const,
  limitInputPixels: MAX_IMAGE_PIXELS,
  limitInputChannels: MAX_IMAGE_CHANNELS,
  unlimited: false,
};

type SupportedImageSubtype = "jpeg" | "png" | "webp";

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

function startsWithBytes(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte: number, index: number) => buffer[index] === byte);
}

function signatureType(buffer: Buffer): SupportedImageSubtype | undefined {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return undefined;
}

export async function validateImageDataUrl(
  imageDataUrl: string | undefined,
  maxBytes: number,
): Promise<void> {
  if (imageDataUrl === undefined) {
    return;
  }

  const match: RegExpMatchArray | null = imageDataUrl.match(DATA_URL_PATTERN);
  if (!match || match[2].length % 4 !== 0) {
    throw new ImageValidationError("照片格式仅支持有效的 JPEG、PNG 或 WebP。 ");
  }

  const mimeSubtype: SupportedImageSubtype = match[1] as SupportedImageSubtype;
  const base64Payload: string = match[2];
  const imageBytes: Buffer = Buffer.from(base64Payload, "base64");
  if (imageBytes.toString("base64") !== base64Payload) {
    throw new ImageValidationError("照片格式仅支持有效的 JPEG、PNG 或 WebP。 ");
  }
  if (imageBytes.byteLength === 0 || imageBytes.byteLength > maxBytes) {
    throw new ImageValidationError("照片不能超过 5 MB，且内容不能为空。 ");
  }
  if (signatureType(imageBytes) !== mimeSubtype) {
    throw new ImageValidationError("照片内容与声明格式不一致。 ");
  }

  let decodedFormat: string | undefined;
  try {
    const metadata = await sharp(imageBytes, SHARP_INPUT_OPTIONS)
      .timeout({ seconds: IMAGE_DECODE_TIMEOUT_SECONDS })
      .metadata();
    decodedFormat = metadata.format;

    const width: number | undefined = metadata.width;
    const height: number | undefined = metadata.height;
    const pages: number = metadata.pages ?? 1;
    const channels: number | undefined = metadata.channels;
    if (
      width === undefined ||
      height === undefined ||
      channels === undefined ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      !Number.isInteger(channels) ||
      width <= 0 ||
      height <= 0 ||
      channels <= 0 ||
      channels > MAX_IMAGE_CHANNELS ||
      !Number.isInteger(pages) ||
      pages <= 0
    ) {
      throw new ImageValidationError("照片文件损坏或无法解码。 ");
    }
    if (pages !== 1) {
      throw new ImageValidationError("当前版本暂不支持动画或多帧图片。 ");
    }

    const totalPixels: number = width * height;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_IMAGE_PIXELS) {
      throw new ImageValidationError("照片像素尺寸过大，请缩小后重试。 ");
    }

    await sharp(imageBytes, SHARP_INPUT_OPTIONS)
      .timeout({ seconds: IMAGE_DECODE_TIMEOUT_SECONDS })
      .raw()
      .toBuffer();
  } catch (error: unknown) {
    if (error instanceof ImageValidationError) {
      throw error;
    }
    throw new ImageValidationError("照片文件损坏、超出安全解码范围或无法解码。 ");
  }

  if (decodedFormat !== mimeSubtype) {
    throw new ImageValidationError("照片内容与声明格式不一致。 ");
  }
}
