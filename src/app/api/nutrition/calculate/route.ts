import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { readJsonBody } from "@/lib/http/read-json-body";
import {
  calculateNutrition,
  NutritionResolutionError,
  type NutritionResult,
} from "@/lib/nutrition/engine";
import {
  nutritionInputItemSchema,
  NutritionConfirmationError,
  type NutritionInputItem,
} from "@/lib/nutrition/review";

const calculationRequestSchema = z
  .object({ items: z.array(nutritionInputItemSchema).min(1).max(20) })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody: unknown = await readJsonBody(request, 100_000);
    const input: { items: NutritionInputItem[] } = calculationRequestSchema.parse(rawBody);
    const nutrition: NutritionResult = calculateNutrition(input.items);
    return NextResponse.json({ nutrition });
  } catch (error: unknown) {
    const message: string =
      error instanceof ZodError
        ? error.issues[0]?.message ?? "确认数据结构不正确。"
        : error instanceof Error
          ? error.message
          : "营养计算失败。";
    const status: number =
      error instanceof NutritionConfirmationError || error instanceof NutritionResolutionError
        ? 422
        : 400;
    return NextResponse.json({ error: message.trim() }, { status });
  }
}
