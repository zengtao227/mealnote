import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/analyze/route";

function fixture(name: string): Buffer {
  return readFileSync(new URL("../../../lib/http/__fixtures__/" + name, import.meta.url));
}

function dataUrl(type: "jpeg" | "png" | "webp", bytes: Buffer): string {
  return `data:image/${type};base64,${bytes.toString("base64")}`;
}

function analyzeRequest(body: string): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});

describe("POST /api/analyze image boundary", () => {
  it("rejects a magic-bytes-only image before the heuristic provider can accept the text", async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await POST(
      analyzeRequest(
        JSON.stringify({
          text: "半碗米饭",
          source: "mixed",
          image_data_url: dataUrl("jpeg", fixture("magic-only.jpeg")),
        }),
      ),
    );
    const body = (await response.json()) as { error?: string; analysis?: unknown };

    expect(response.status).toBe(400);
    expect(body.analysis).toBeUndefined();
    expect(body.error).toMatch(/损坏|无法解码|安全解码范围/);
  });

  it("accepts a valid decodable image before continuing to the configured local fallback", async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await POST(
      analyzeRequest(
        JSON.stringify({
          text: "半碗米饭",
          source: "mixed",
          image_data_url: dataUrl("png", fixture("valid.png")),
        }),
      ),
    );
    const body = (await response.json()) as { provider?: string; analysis?: unknown };

    expect(response.status).toBe(200);
    expect(body.provider).toBe("heuristic-demo");
    expect(body.analysis).toBeDefined();
  });

  it("does not expose JSON parser internals for malformed request bodies", async () => {
    const response = await POST(analyzeRequest("{not-json"));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("请求 JSON 格式不正确。");
  });
});
