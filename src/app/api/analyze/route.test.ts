import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { POST } from "@/app/api/analyze/route";
import type { MealAnalysis } from "@/lib/ai/meal-analysis-schema";

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

const openAiAnalysis: MealAnalysis = {
  schema_version: "1.0",
  items: [
    {
      food_name: "米饭",
      portion_text: "半碗",
      estimated_grams: 100,
      oil_level: "none",
      confidence: 0.9,
      source: "text",
      type: "food",
      assumptions: ["一碗按 200 克估算"],
      needs_confirmation: false,
    },
  ],
  overall_confidence: 0.9,
  uncertainty_note: "份量仍可由用户确认。",
};

function stubOpenAiFetch(body: unknown, status: number = 200): Mock<typeof fetch> {
  const fetchMock: Mock<typeof fetch> = vi.fn<typeof fetch>();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
  vi.unstubAllGlobals();
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

describe("POST /api/analyze provider boundary", () => {
  it("returns validated OpenAI structured output when the provider succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    stubOpenAiFetch({ output_text: JSON.stringify(openAiAnalysis) });

    const response: Response = await POST(
      analyzeRequest(JSON.stringify({ text: "半碗米饭", source: "text" })),
    );
    const body = (await response.json()) as { provider?: string; analysis?: MealAnalysis };

    expect(response.status).toBe(200);
    expect(body.provider).toBe("openai");
    expect(body.analysis).toEqual(openAiAnalysis);
  });

  it("falls back to local text analysis when the configured provider fails", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    const fetchMock: Mock<typeof fetch> = vi.fn<typeof fetch>();
    fetchMock.mockRejectedValue(new DOMException("sensitive timeout detail", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const response: Response = await POST(
      analyzeRequest(JSON.stringify({ text: "半碗米饭", source: "text" })),
    );
    const body = (await response.json()) as {
      provider?: string;
      warning?: string;
      analysis?: MealAnalysis;
    };

    expect(response.status).toBe(200);
    expect(body.provider).toBe("heuristic-fallback");
    expect(body.warning).toContain("AI 服务暂不可用");
    expect(body.warning).not.toContain("sensitive timeout detail");
    expect(body.analysis?.items[0]?.food_name).toBe("米饭");
  });

  it("fails safely when image-only OpenAI analysis is unavailable", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    const fetchMock: Mock<typeof fetch> = vi.fn<typeof fetch>();
    fetchMock.mockRejectedValue(new Error("sensitive upstream detail"));
    vi.stubGlobal("fetch", fetchMock);

    const response: Response = await POST(
      analyzeRequest(
        JSON.stringify({
          text: "",
          source: "image",
          image_data_url: dataUrl("png", fixture("valid.png")),
        }),
      ),
    );
    const body = (await response.json()) as { error?: string; analysis?: unknown };

    expect(response.status).toBe(502);
    expect(body.error).toBe("图片识别暂时失败，请重试。");
    expect(body.error).not.toContain("sensitive upstream detail");
    expect(body.analysis).toBeUndefined();
  });
});
