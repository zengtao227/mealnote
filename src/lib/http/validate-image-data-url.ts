const DATA_URL_PATTERN: RegExp = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function startsWithBytes(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte: number, index: number) => buffer[index] === byte);
}

function hasValidSignature(mimeSubtype: string, buffer: Buffer): boolean {
  if (mimeSubtype === "jpeg") {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }
  if (mimeSubtype === "png") {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeSubtype === "webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

export function validateImageDataUrl(imageDataUrl: string | undefined, maxBytes: number): void {
  if (imageDataUrl === undefined) {
    return;
  }

  const match: RegExpMatchArray | null = imageDataUrl.match(DATA_URL_PATTERN);
  if (!match || match[2].length % 4 !== 0) {
    throw new Error("照片格式仅支持有效的 JPEG、PNG 或 WebP。 ");
  }

  const mimeSubtype: string = match[1];
  const imageBytes: Buffer = Buffer.from(match[2], "base64");
  if (imageBytes.byteLength === 0 || imageBytes.byteLength > maxBytes) {
    throw new Error("照片不能超过 5 MB，且内容不能为空。 ");
  }
  if (!hasValidSignature(mimeSubtype, imageBytes)) {
    throw new Error("照片内容与声明格式不一致。 ");
  }
}
