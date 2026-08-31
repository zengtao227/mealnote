import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  mealAnalysisJsonSchema,
  type AnalysisRequest,
  type MealAnalysis,
} from "@/lib/ai/meal-analysis-schema";
import { analyzeWithOpenAI } from "@/lib/ai/openai-provider";
import { resolveFoodProfile } from "@/lib/nutrition/food-database";

interface ResponsesRequestPayload {
  model: string;
  input: Array<{
    role: string;
    content: Array<{ type: string; text?: string; image_url?: string }>;
  }>;
  text: {
    format: {
      type: string;
      name: string;
      strict: boolean;
      schema: unknown;
    };
  };
}

const originalApiKey: string | undefined = process.env.OPENAI_API_KEY;
const originalModel: string | undefined = process.env.OPENAI_MODEL;

const textRequest: AnalysisRequest = {
  text: "半碗米饭",
  source: "text",
};

const supportedAnalysis: MealAnalysis = {
  schema_version: "1.0",
  items: [
    {
      food_name: "米饭",
      portion_text: "半碗",
      estimated_grams: 100,
      oil_level: "none",
      confidence: 0.92,
      source: "text",
      type: "food",
      assumptions: ["一碗按 200 克估算"],
      needs_confirmation: false,
    },
  ],
  overall_confidence: 0.92,
  uncertainty_note: "份量仍可由用户确认。",
};

function restoreEnvironment(): void {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }

  if (originalModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalModel;
  }
}

function stubJsonResponse(body: unknown, status: number = 200): Mock<typeof fetch> {
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

function parseRequestPayload(fetchMock: Mock<typeof fetch>): ResponsesRequestPayload {
  const requestInit: RequestInit | undefined = fetchMock.mock.calls[0]?.[1];
  if (typeof requestInit?.body !== "string") {
    throw new Error("OpenAI request body must be a JSON string");
  }
  return JSON.parse(requestInit.body) as ResponsesRequestPayload;
}

afterEach((): void => {
  restoreEnvironment();
  vi.unstubAllGlobals();
});

describe("analyzeWithOpenAI", () => {
  it("sends the strict MealNote schema and accepts supported structured output", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.OPENAI_MODEL = "test-model";
    const fetchMock: Mock<typeof fetch> = stubJsonResponse({
      output_text: JSON.stringify(supportedAnalysis),
    });

    const result: MealAnalysis = await analyzeWithOpenAI(textRequest);

    expect(result).toEqual(supportedAnalysis);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");

    const requestInit: RequestInit | undefined = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({ Authorization: "Bearer test-api-key" });
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);

    const payload: ResponsesRequestPayload = parseRequestPayload(fetchMock);
    expect(payload.model).toBe("test-model");
    expect(payload.text.format).toMatchObject({
      type: "json_schema",
      name: "meal_analysis",
      strict: true,
      schema: mealAnalysisJsonSchema,
    });
    expect(payload.input[0]?.content[0]?.text).toContain("不要提供 kcal 或任何营养数值");
  });

  it("preserves unknown and compound candidates without granting catalog authority", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    const unresolvedAnalysis: MealAnalysis = {
      ...supportedAnalysis,
      items: [
        {
          ...supportedAnalysis.items[0],
          food_name: "自制豆腐卷",
          portion_text: "两块",
          needs_confirmation: true,
        },
        {
          ...supportedAnalysis.items[0],
          food_name: "蛋炒米饭",
          portion_text: "半碗",
          needs_confirmation: true,
        },
      ],
      overall_confidence: 0.45,
    };
    stubJsonResponse({
      output: [
        {
          content: [{ type: "output_text", text: JSON.stringify(unresolvedAnalysis) }],
        },
      ],
    });

    const result: MealAnalysis = await analyzeWithOpenAI(textRequest);

    expect(result.items.map((item): string => item.food_name)).toEqual([
      "自制豆腐卷",
      "蛋炒米饭",
    ]);
    for (const item of result.items) {
      expect(resolveFoodProfile(item.food_name).status).toBe("unmatched");
    }
  });

  it("rejects nutrition truth fields and untrusted catalog suggestions", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    const forbiddenFields: Array<Record<string, unknown>> = [
      { calories: 116 },
      { suggested_catalog_id: "rice-001" },
    ];

    for (const forbiddenField of forbiddenFields) {
      stubJsonResponse({
        output_text: JSON.stringify({
          ...supportedAnalysis,
          items: [{ ...supportedAnalysis.items[0], ...forbiddenField }],
        }),
      });

      await expect(analyzeWithOpenAI(textRequest)).rejects.toThrow();
    }
  });

  it("rejects malformed JSON and missing structured output", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    stubJsonResponse({ output_text: "{not-json" });
    await expect(analyzeWithOpenAI(textRequest)).rejects.toThrow();

    stubJsonResponse({ output: [{ content: [{ type: "reasoning", text: "hidden" }] }] });
    await expect(analyzeWithOpenAI(textRequest)).rejects.toThrow(
      "OpenAI response did not contain structured output",
    );
  });

  it("rejects missing configuration, HTTP failures, and timeouts", async () => {
    delete process.env.OPENAI_API_KEY;
    const unusedFetch: Mock<typeof fetch> = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", unusedFetch);
    await expect(analyzeWithOpenAI(textRequest)).rejects.toThrow(
      "OPENAI_API_KEY is not configured",
    );
    expect(unusedFetch).not.toHaveBeenCalled();

    process.env.OPENAI_API_KEY = "test-api-key";
    stubJsonResponse({ error: { message: "rate limited" } }, 429);
    await expect(analyzeWithOpenAI(textRequest)).rejects.toThrow("rate limited");

    const timeoutFetch: Mock<typeof fetch> = vi.fn<typeof fetch>();
    timeoutFetch.mockRejectedValue(new DOMException("request timed out", "TimeoutError"));
    vi.stubGlobal("fetch", timeoutFetch);
    await expect(analyzeWithOpenAI(textRequest)).rejects.toThrow("request timed out");
  });
});
