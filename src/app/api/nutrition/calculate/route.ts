import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { mealItemAnalysisSchema, type MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import { readJsonBody } from "@/lib/http/read-json-body";
import { calculateNutrition, type NutritionResult } from "@/lib/nutrition/engine";

const calculationRequestSchema = z
  .object({ items: z.array(mealItemAnalysisSchema).min(1).max(20) })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody: unknown = await readJsonBody(request, 100_000);
    const input: { items: MealItemAnalysis[] } = calculationRequestSchema.parse(rawBody);
    const nutrition: NutritionResult = calculateNutrition(input.items);
    return NextResponse.json({ nutrition });
  } catch (error: unknown) {
    const message: string =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "确认数据结构不正确。"
        : error instanceof Error
          ? error.message
          : "营养计算失败。";
    return NextResponse.json({ error: message.trim() }, { status: 400 });
  }
}
