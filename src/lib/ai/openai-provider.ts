import {
  mealAnalysisJsonSchema,
  mealAnalysisSchema,
  type AnalysisRequest,
  type MealAnalysis,
} from "@/lib/ai/meal-analysis-schema";

interface ResponsesApiContent {
  type?: string;
  text?: string;
}

interface ResponsesApiOutput {
  content?: ResponsesApiContent[];
}

interface ResponsesApiBody {
  output_text?: string;
  output?: ResponsesApiOutput[];
  error?: { message?: string };
}

function extractOutputText(body: ResponsesApiBody): string | undefined {
  if (body.output_text) {
    return body.output_text;
  }

  for (const output of body.output ?? []) {
    const textContent: ResponsesApiContent | undefined = output.content?.find(
      (content: ResponsesApiContent) => content.type === "output_text" && content.text,
    );
    if (textContent?.text) {
      return textContent.text;
    }
  }

  return undefined;
}

export async function analyzeWithOpenAI(request: AnalysisRequest): Promise<MealAnalysis> {
  const apiKey: string | undefined = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const prompt: string = [
    "你是MealNote的食物识别层，只识别食物、份量表达和不确定信息。",
    "不要提供 kcal 或任何营养数值；营养计算由独立 Nutrition Engine 完成。",
    "优先保留用户的中式份量原话。对油量、合菜分摊和不可见食材保持保守，并标记确认。",
    `用户描述：${request.text || "（仅照片）"}`,
    `输入来源：${request.source}`,
  ].join("\n");
  const content: Array<Record<string, string>> = [{ type: "input_text", text: prompt }];
  if (request.image_data_url) {
    content.push({ type: "input_image", image_url: request.image_data_url });
  }

  const response: Response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "meal_analysis",
          strict: true,
          schema: mealAnalysisJsonSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body: ResponsesApiBody = (await response.json()) as ResponsesApiBody;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `OpenAI request failed with ${response.status}`);
  }

  const outputText: string | undefined = extractOutputText(body);
  if (!outputText) {
    throw new Error("OpenAI response did not contain structured output");
  }

  return mealAnalysisSchema.parse(JSON.parse(outputText));
}
