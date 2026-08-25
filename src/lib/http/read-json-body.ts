export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength: string | null = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    throw new Error("请求内容超过允许大小。 ");
  }
  if (!request.body) {
    throw new Error("请求内容为空。 ");
  }

  const reader: ReadableStreamDefaultReader<Uint8Array> = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes: number = 0;

  while (true) {
    const { done, value }: ReadableStreamReadResult<Uint8Array> = await reader.read();
    if (done) {
      break;
    }
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error("请求内容超过允许大小。 ");
    }
    chunks.push(value);
  }

  const bodyBytes: Uint8Array = new Uint8Array(receivedBytes);
  let offset: number = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const bodyText: string = new TextDecoder().decode(bodyBytes);
  return JSON.parse(bodyText) as unknown;
}
