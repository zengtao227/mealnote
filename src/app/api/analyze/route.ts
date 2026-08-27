import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  analysisRequestSchema,
  type AnalysisRequest,
  type MealAnalysis,
} from "@/lib/ai/meal-analysis-schema";
import { analyzeWithHeuristics } from "@/lib/ai/heuristic-provider";
import { analyzeWithOpenAI } from "@/lib/ai/openai-provider";
import { readJsonBody, RequestBodyError } from "@/lib/http/read-json-body";
import {
  ImageValidationError,
  validateImageDataUrl,
} from "@/lib/http/validate-image-data-url";

const MAX_REQUEST_BYTES: number = 7_200_000;
const MAX_IMAGE_BYTES: number = 5 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody: unknown = await readJsonBody(request, MAX_REQUEST_BYTES);
    const input: AnalysisRequest = analysisRequestSchema.parse(rawBody);
    await validateImageDataUrl(input.image_data_url, MAX_IMAGE_BYTES);

    if (process.env.OPENAI_API_KEY) {
      try {
        const analysis: MealAnalysis = await analyzeWithOpenAI(input);
        return NextResponse.json({ analysis, provider: "openai" });
      } catch {
        if (!input.text) {
          return NextResponse.json(
            { error: "图片识别暂时失败，请重试。" },
            { status: 502 },
          );
        }
        const analysis: MealAnalysis = analyzeWithHeuristics(input);
        return NextResponse.json({
          analysis,
          provider: "heuristic-fallback",
          warning: "AI 服务暂不可用，已改用本地文字识别；照片内容未参与判断。",
        });
      }
    }

    if (!input.text) {
      return NextResponse.json(
        { error: "本地演示不能单独识别照片。请补充一句描述，或配置 OPENAI_API_KEY。" },
        { status: 422 },
      );
    }
    const analysis: MealAnalysis = analyzeWithHeuristics(input);
    return NextResponse.json({
      analysis,
      provider: "heuristic-demo",
      warning: input.image_data_url ? "当前未配置 AI，照片仅作预览，识别来自文字描述。" : undefined,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: (error.issues[0]?.message ?? "输入结构不正确。").trim() },
        { status: 400 },
      );
    }
    if (error instanceof RequestBodyError || error instanceof ImageValidationError) {
      return NextResponse.json({ error: error.message.trim() }, { status: 400 });
    }
    return NextResponse.json({ error: "识别请求失败，请重试。" }, { status: 500 });
  }
}
