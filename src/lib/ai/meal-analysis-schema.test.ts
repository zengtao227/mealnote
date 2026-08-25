import { describe, expect, it } from "vitest";
import { mealAnalysisSchema } from "@/lib/ai/meal-analysis-schema";

const validAnalysis: Record<string, unknown> = {
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
      assumptions: ["一碗按 200 克"],
      needs_confirmation: false,
    },
  ],
  overall_confidence: 0.9,
  uncertainty_note: "份量需要确认。",
};

describe("mealAnalysisSchema", () => {
  it("accepts the strict V1 structure", () => {
    expect(mealAnalysisSchema.parse(validAnalysis)).toEqual(validAnalysis);
  });

  it("rejects unexpected nutrition truth fields", () => {
    const withModelCalories: unknown = { ...validAnalysis, calories: 432 };
    expect(() => mealAnalysisSchema.parse(withModelCalories)).toThrow();
  });
});
