import { describe, expect, it } from "vitest";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import {
  calculateNutrition,
  NutritionResolutionError,
} from "@/lib/nutrition/engine";
import {
  acknowledgeNutritionItem,
  applyNutritionItemEdit,
  createNutritionInputItem,
  NutritionConfirmationError,
} from "@/lib/nutrition/review";

const riceAnalysis: MealItemAnalysis = {
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
  it("uses a matched MealNote profile instead of model-provided nutrition", () => {
    const result = calculateNutrition([createNutritionInputItem(riceAnalysis)]);

    expect(result.totals).toEqual({ kcal: 116, protein: 2.6, fat: 0.3, carbs: 25.9 });
    expect(result.items[0].matched_profile_name).toBe("米饭");
    expect(result.items[0].source_type).toBe("trusted-table");
    expect(result.kcal_low).toBeLessThan(116);
    expect(result.kcal_high).toBeGreaterThan(116);
  });

  it("fails closed for an unmatched home recipe instead of using a generic fallback", () => {
    const unknown = createNutritionInputItem({
      ...riceAnalysis,
      food_name: "妈妈的拿手菜",
      type: "recipe",
      oil_level: "unknown",
    });

    expect(() => calculateNutrition([unknown])).toThrow(NutritionResolutionError);
  });

  it("does not authorize a recipe variant through substring matching", () => {
    const variant = createNutritionInputItem({
      ...riceAnalysis,
      food_name: "蒜香排骨",
      type: "recipe",
      oil_level: "standard",
    });

    expect(() => calculateNutrition([variant])).toThrow(/未匹配到可信营养条目/);
  });

  it("blocks a required confirmation until the user explicitly acknowledges it", () => {
    const pending = createNutritionInputItem({
      ...riceAnalysis,
      needs_confirmation: true,
    });

    expect(() => calculateNutrition([pending])).toThrow(NutritionConfirmationError);
    expect(() => calculateNutrition([acknowledgeNutritionItem(pending)])).not.toThrow();
  });

  it("records field-level client reports without presenting them as verified provenance", () => {
    const edited = applyNutritionItemEdit(createNutritionInputItem(riceAnalysis), {
      food_name: "白米饭",
      estimated_grams: 120,
    });
    const result = calculateNutrition([acknowledgeNutritionItem(edited)]);

    expect(result.items[0].matched_profile_name).toBe("米饭");
    expect(result.items[0].matched_by).toBe("alias");
    expect(result.items[0].field_provenance).toEqual({
      food_name: "user",
      estimated_grams: "user",
      oil_level: "review-derived",
    });
    expect(result.items[0].field_provenance_verification).toBe("client-reported");
    expect(result.items[0].recognition_source).toBe("text");
    expect(result.items[0].recognition_confidence).toBe(0.9);
    expect(result.items[0].recognition_metadata_verification).toBe("client-reported");
    expect(result.items[0].confirmation_verification).toBe("client-reported");
    expect(result.recognition_confidence_verification).toBe("client-reported");
  });

  it("does not let client-reported recognition confidence change nutrition uncertainty", () => {
    const base = createNutritionInputItem(riceAnalysis);
    const lowConfidence = calculateNutrition([{ ...base, confidence: 0 }]);
    const highConfidence = calculateNutrition([{ ...base, confidence: 1 }]);

    expect(lowConfidence.totals).toEqual(highConfidence.totals);
    expect({ low: lowConfidence.kcal_low, high: lowConfidence.kcal_high }).toEqual({
      low: highConfidence.kcal_low,
      high: highConfidence.kcal_high,
    });
    expect(lowConfidence.items[0].recognition_confidence).toBe(0);
    expect(highConfidence.items[0].recognition_confidence).toBe(1);
    expect(lowConfidence.recognition_confidence_verification).toBe("client-reported");
  });

});