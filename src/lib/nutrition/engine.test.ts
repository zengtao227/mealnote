import { describe, expect, it } from "vitest";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import { calculateNutrition } from "@/lib/nutrition/engine";

const rice: MealItemAnalysis = {
  food_name: "米饭",
  portion_text: "半碗",
  estimated_grams: 100,
  oil_level: "none",
  confidence: 0.9,
  source: "text",
  type: "food",
  assumptions: ["一碗按 200 克"],
  needs_confirmation: false,
};

describe("calculateNutrition", () => {
  it("uses the food profile instead of model-provided calories", () => {
    const result = calculateNutrition([rice]);
    expect(result.totals).toEqual({ kcal: 116, protein: 2.6, fat: 0.3, carbs: 25.9 });
    expect(result.kcal_low).toBeLessThan(116);
    expect(result.kcal_high).toBeGreaterThan(116);
  });

  it("widens uncertainty for an unmatched recipe", () => {
    const result = calculateNutrition([
      { ...rice, food_name: "妈妈的拿手菜", type: "recipe", oil_level: "unknown" },
    ]);
    expect(result.items[0].used_generic_fallback).toBe(true);
    expect(result.kcal_high - result.kcal_low).toBeGreaterThan(100);
  });
});
