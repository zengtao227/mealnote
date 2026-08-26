import { describe, expect, it } from "vitest";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import { calculateNutrition } from "@/lib/nutrition/engine";
import { createNutritionInputItem } from "@/lib/nutrition/review";

const fixtureItems: MealItemAnalysis[] = [
  {
    food_name: "米饭",
    portion_text: "半碗",
    estimated_grams: 100,
    oil_level: "none",
    confidence: 1,
    source: "text",
    type: "food",
    assumptions: ["一碗按 200 克"],
    needs_confirmation: false,
  },
  {
    food_name: "番茄炒蛋",
    portion_text: "三分之一盘",
    estimated_grams: 120,
    oil_level: "standard",
    confidence: 1,
    source: "text",
    type: "recipe",
    assumptions: ["一盘按 360 克"],
    needs_confirmation: false,
  },
  {
    food_name: "红烧排骨",
    portion_text: "四块",
    estimated_grams: 112,
    oil_level: "standard",
    confidence: 1,
    source: "text",
    type: "recipe",
    assumptions: ["每块按 28 克"],
    needs_confirmation: false,
  },
  {
    food_name: "冬瓜汤",
    portion_text: "一碗，少油",
    estimated_grams: 240,
    oil_level: "light",
    confidence: 1,
    source: "text",
    type: "recipe",
    assumptions: ["一碗按 240 克"],
    needs_confirmation: false,
  },
];

describe("representative Chinese meal nutrition fixture", () => {
  it("keeps deterministic totals and authoritative profile resolution stable", () => {
    const result = calculateNutrition(fixtureItems.map(createNutritionInputItem));

    expect(result.totals).toEqual({
      kcal: 582,
      protein: 31.4,
      fat: 32.3,
      carbs: 45.9,
    });
    expect(result.items.map((item) => item.matched_profile_name)).toEqual([
      "米饭",
      "番茄炒蛋",
      "红烧排骨",
      "冬瓜汤",
    ]);
    expect(result.items.every((item) => item.matched_by === "canonical_name")).toBe(true);
    expect(result.kcal_low).toBeLessThan(result.totals.kcal);
    expect(result.kcal_high).toBeGreaterThan(result.totals.kcal);
  });
});
