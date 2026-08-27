import { describe, expect, it } from "vitest";
import { readJsonBody } from "@/lib/http/read-json-body";

function streamedRequest(chunks: string[], contentLength?: number): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  const headers = new Headers({ "Content-Type": "application/json" });
  if (contentLength !== undefined) {
    headers.set("Content-Length", String(contentLength));
  }
  return new Request("http://localhost/test", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readJsonBody", () => {
  it("accepts a streamed JSON body exactly at the byte limit", async () => {
    const body = '{"value":"米饭"}';
    const byteLength = new TextEncoder().encode(body).byteLength;

    await expect(readJsonBody(streamedRequest([body]), byteLength)).resolves.toEqual({ value: "米饭" });
  });

  it("rejects a streamed body as soon as received bytes exceed the limit", async () => {
    const chunks = ['{"value":"', "米饭", '"}'];
    const byteLength = new TextEncoder().encode(chunks.join("")).byteLength;

    await expect(readJsonBody(streamedRequest(chunks), byteLength - 1)).rejects.toThrow(
      "请求内容超过允许大小",
    );
  });

  it("rejects an oversized declared Content-Length before reading the body", async () => {
    const body = '{"ok":true}';
    const byteLength = new TextEncoder().encode(body).byteLength;

    await expect(readJsonBody(streamedRequest([body], byteLength + 1), byteLength)).rejects.toThrow(
      "请求内容超过允许大小",
    );
  });

  it("returns a stable client-safe error for malformed JSON", async () => {
    await expect(readJsonBody(streamedRequest(["{not-json"]), 1024)).rejects.toThrow(
      "请求 JSON 格式不正确",
    );
  });
});
