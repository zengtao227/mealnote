import { describe, expect, it } from "vitest";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import { calculateNutrition } from "@/lib/nutrition/engine";
import {
  acknowledgeNutritionItem,
  NutritionConfirmationError,
  applyNutritionItemEdit,
  createNutritionInputItem,
  getNutritionFieldProvenance,
} from "@/lib/nutrition/review";

const trustedRice: MealItemAnalysis = {
  food_name: "米饭",
  portion_text: "半碗米饭",
  estimated_grams: 100,
  oil_level: "none",
  confidence: 0.9,
  source: "text",
  type: "food",
  assumptions: ["按一碗约 200 克换算"],
  needs_confirmation: false,
};

describe("nutrition identity edit dependency reset", () => {
  it("does not carry rice oil/type/confirmation authority into a renamed recipe", () => {
    const rice = createNutritionInputItem(trustedRice);
    const renamed = applyNutritionItemEdit(rice, { food_name: "红烧排骨" });

    expect(renamed).toMatchObject({
      food_name: "红烧排骨",
      type: "recipe",
      oil_level: "unknown",
      needs_confirmation: true,
      confirmation_acknowledged: false,
    });
    expect(renamed.edited_fields).toEqual(["food_name"]);
    expect(getNutritionFieldProvenance(renamed)).toEqual({
      food_name: "user",
      estimated_grams: "analysis",
      oil_level: "review-derived",
    });
    expect(() => calculateNutrition([renamed])).toThrow(NutritionConfirmationError);

    const confirmed = acknowledgeNutritionItem(renamed);
    expect(calculateNutrition([confirmed]).totals.kcal).toBe(260);
  });

  it("preserves an oil level only when the user explicitly edits it with the identity", () => {
    const rice = createNutritionInputItem(trustedRice);
    const renamed = applyNutritionItemEdit(rice, {
      food_name: "红烧排骨",
      oil_level: "light",
    });

    expect(renamed).toMatchObject({
      type: "recipe",
      oil_level: "light",
      needs_confirmation: true,
      confirmation_acknowledged: false,
    });
    expect(renamed.edited_fields).toEqual(["food_name", "oil_level"]);
    expect(getNutritionFieldProvenance(renamed).oil_level).toBe("user");
  });

  it("invalidates an older explicit oil edit when the food identity changes again", () => {
    const rice = createNutritionInputItem(trustedRice);
    const first = applyNutritionItemEdit(rice, {
      food_name: "红烧排骨",
      oil_level: "light",
    });
    const second = applyNutritionItemEdit(first, { food_name: "白米饭" });

    expect(second.oil_level).toBe("none");
    expect(second.edited_fields).toEqual(["food_name"]);
    expect(getNutritionFieldProvenance(second).oil_level).toBe("review-derived");
  });
});
