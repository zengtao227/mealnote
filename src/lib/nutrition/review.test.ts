import { describe, expect, it } from "vitest";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import {
  acknowledgeNutritionItem,
  applyNutritionItemEdit,
  assertNutritionItemsReady,
  createNutritionInputItem,
  getNutritionFieldProvenance,
  NutritionConfirmationError,
} from "@/lib/nutrition/review";

const uncertainRice: MealItemAnalysis = {
  food_name: "米饭",
  portion_text: "大概半碗",
  estimated_grams: 100,
  oil_level: "none",
  confidence: 0.6,
  source: "text",
  type: "food",
  assumptions: ["半碗按 100 克估算"],
  needs_confirmation: true,
};

describe("nutrition review state", () => {
  it("keeps AI-requested confirmation pending until explicit acknowledgement", () => {
    const reviewed = createNutritionInputItem(uncertainRice);

    expect(reviewed.confirmation_acknowledged).toBe(false);
    expect(() => assertNutritionItemsReady([reviewed])).toThrow(NutritionConfirmationError);
  });

  it("does not treat a field edit as confirmation and clears stale assumptions", () => {
    const reviewed = createNutritionInputItem(uncertainRice);
    const edited = applyNutritionItemEdit(reviewed, { estimated_grams: 120 });

    expect(edited.confirmation_acknowledged).toBe(false);
    expect(edited.needs_confirmation).toBe(true);
    expect(edited.estimated_grams).toBe(120);
    expect(edited.portion_text).toBe("120 克（用户修改）");
    expect(edited.assumptions).toEqual([]);
    expect(edited.edited_fields).toEqual(["estimated_grams"]);
  });

  it("invalidates acknowledgement when a required item is edited again", () => {
    const acknowledged = acknowledgeNutritionItem(createNutritionInputItem(uncertainRice));
    const edited = applyNutritionItemEdit(acknowledged, { food_name: "白米饭" });

    expect(acknowledged.confirmation_acknowledged).toBe(true);
    expect(edited.confirmation_acknowledged).toBe(false);
  });

  it("records field-level user provenance without overwriting recognition source", () => {
    const reviewed = createNutritionInputItem({ ...uncertainRice, needs_confirmation: false });
    const edited = applyNutritionItemEdit(reviewed, {
      food_name: "白米饭",
      oil_level: "light",
    });

    expect(edited.source).toBe("text");
    expect(edited.confidence).toBe(0.6);
    expect(getNutritionFieldProvenance(edited)).toEqual({
      food_name: "user",
      estimated_grams: "analysis",
      oil_level: "user",
    });
  });
});
