import { describe, expect, it } from "vitest";
import { analyzeWithHeuristics } from "@/lib/ai/heuristic-provider";
import {
  calculateNutrition,
  NutritionResolutionError,
} from "@/lib/nutrition/engine";
import {
  acknowledgeNutritionItem,
  applyNutritionItemEdit,
  createNutritionInputItem,
} from "@/lib/nutrition/review";

describe("heuristic candidate vs nutrition authority", () => {
  it("keeps broad ribs input as a confirmable candidate without authorizing nutrition", () => {
    const analysis = analyzeWithHeuristics({
      text: "排骨四块",
      source: "text",
    });

    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "排骨",
      estimated_grams: 112,
      needs_confirmation: true,
    });
    expect(analysis.items[0].assumptions.join(" ")).toContain("宽泛");

    const acknowledged = acknowledgeNutritionItem(
      createNutritionInputItem(analysis.items[0]),
    );
    expect(() => calculateNutrition([acknowledged])).toThrow(NutritionResolutionError);
  });

  it("allows a broad candidate only after the user changes it to an explicit supported entry and confirms again", () => {
    const analysis = analyzeWithHeuristics({
      text: "排骨四块",
      source: "text",
    });
    const reviewed = createNutritionInputItem(analysis.items[0]);
    const edited = applyNutritionItemEdit(reviewed, { food_name: "红烧排骨" });

    expect(edited.confirmation_acknowledged).toBe(false);
    expect(edited.edited_fields).toEqual(["food_name"]);
    expect(() => calculateNutrition([edited])).toThrow(/明确确认/);

    const confirmed = acknowledgeNutritionItem(edited);
    const result = calculateNutrition([confirmed]);

    expect(result.totals.kcal).toBe(291);
    expect(result.items[0]).toMatchObject({
      food_name: "红烧排骨",
      matched_profile_name: "红烧排骨",
      estimated_grams: 112,
      field_provenance: {
        food_name: "user",
        estimated_grams: "analysis",
        oil_level: "review-derived",
      },
      field_provenance_verification: "client-reported",
      confirmation_acknowledged: true,
    });
  });

  it("prefers an explicit trusted recipe over its contained broad candidate", () => {
    const analysis = analyzeWithHeuristics({
      text: "红烧排骨四块",
      source: "text",
    });

    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0].food_name).toBe("红烧排骨");
    expect(analysis.items[0].estimated_grams).toBe(112);
  });

  it("keeps specific but unmodeled noodle names unresolved for nutrition", () => {
    const analysis = analyzeWithHeuristics({
      text: "一碗牛肉面",
      source: "text",
    });

    expect(analysis.items[0]).toMatchObject({
      food_name: "牛肉面",
      estimated_grams: 420,
      needs_confirmation: true,
    });
    const acknowledged = acknowledgeNutritionItem(
      createNutritionInputItem(analysis.items[0]),
    );
    expect(() => calculateNutrition([acknowledged])).toThrow(/未匹配到可信营养条目/);
  });

  it("does not rewrite sticky-rice compound text into trusted rice authority", () => {
    const analysis = analyzeWithHeuristics({
      text: "糯米饭100克",
      source: "text",
    });

    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "糯米饭",
      estimated_grams: 100,
      needs_confirmation: true,
    });
    const acknowledged = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[0]));
    expect(() => calculateNutrition([acknowledged])).toThrow(NutritionResolutionError);
  });

  it("does not rewrite fried-rice compound text into trusted plain rice authority", () => {
    const analysis = analyzeWithHeuristics({
      text: "蛋炒米饭100克",
      source: "text",
    });

    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "蛋炒米饭",
      estimated_grams: 100,
      needs_confirmation: true,
    });
    const acknowledged = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[0]));
    expect(() => calculateNutrition([acknowledged])).toThrow(NutritionResolutionError);
  });

  it("still recognizes an explicit portion phrase for plain rice", () => {
    const analysis = analyzeWithHeuristics({
      text: "半碗米饭",
      source: "text",
    });

    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "米饭",
      estimated_grams: 100,
      needs_confirmation: false,
    });
    expect(calculateNutrition([createNutritionInputItem(analysis.items[0])]).totals.kcal).toBe(116);
  });

  it("keeps sticky rice and trusted plain rice as separate clause-bound candidates", () => {
    const analysis = analyzeWithHeuristics({
      text: "糯米饭100克，半碗米饭",
      source: "text",
    });

    expect(analysis.items).toHaveLength(2);
    expect(analysis.items[0]).toMatchObject({
      food_name: "糯米饭",
      portion_text: "糯米饭100克",
      estimated_grams: 100,
      needs_confirmation: true,
    });
    expect(analysis.items[1]).toMatchObject({
      food_name: "米饭",
      portion_text: "半碗米饭",
      estimated_grams: 100,
      needs_confirmation: false,
    });

    const compound = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[0]));
    const trusted = createNutritionInputItem(analysis.items[1]);
    expect(() => calculateNutrition([compound])).toThrow(NutritionResolutionError);
    expect(calculateNutrition([trusted]).totals.kcal).toBe(116);
  });

  it("keeps trusted plain rice and fried-rice compound as separate candidates in reverse order", () => {
    const analysis = analyzeWithHeuristics({
      text: "半碗米饭，蛋炒米饭100克",
      source: "text",
    });

    expect(analysis.items).toHaveLength(2);
    expect(analysis.items[0]).toMatchObject({
      food_name: "米饭",
      portion_text: "半碗米饭",
      estimated_grams: 100,
      needs_confirmation: false,
    });
    expect(analysis.items[1]).toMatchObject({
      food_name: "蛋炒米饭",
      portion_text: "蛋炒米饭100克",
      estimated_grams: 100,
      needs_confirmation: true,
    });

    expect(calculateNutrition([createNutritionInputItem(analysis.items[0])]).totals.kcal).toBe(116);
    const compound = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[1]));
    expect(() => calculateNutrition([compound])).toThrow(NutritionResolutionError);
  });

  it("does not let trusted red-braised ribs suppress broad ribs in an earlier clause", () => {
    const analysis = analyzeWithHeuristics({
      text: "蒜香排骨四块，红烧排骨四块",
      source: "text",
    });

    expect(analysis.items).toHaveLength(2);
    expect(analysis.items[0]).toMatchObject({
      food_name: "排骨",
      portion_text: "蒜香排骨四块",
      estimated_grams: 112,
      needs_confirmation: true,
    });
    expect(analysis.items[1]).toMatchObject({
      food_name: "红烧排骨",
      portion_text: "红烧排骨四块",
      estimated_grams: 112,
      needs_confirmation: true,
    });

    const broad = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[0]));
    expect(() => calculateNutrition([broad])).toThrow(NutritionResolutionError);
    const trusted = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[1]));
    expect(calculateNutrition([trusted]).totals.kcal).toBe(291);
  });

  it("does not let trusted red-braised ribs suppress broad ribs in a later clause", () => {
    const analysis = analyzeWithHeuristics({
      text: "红烧排骨四块，蒜香排骨四块",
      source: "text",
    });

    expect(analysis.items).toHaveLength(2);
    expect(analysis.items[0]).toMatchObject({
      food_name: "红烧排骨",
      portion_text: "红烧排骨四块",
      estimated_grams: 112,
      needs_confirmation: true,
    });
    expect(analysis.items[1]).toMatchObject({
      food_name: "排骨",
      portion_text: "蒜香排骨四块",
      estimated_grams: 112,
      needs_confirmation: true,
    });

    const trusted = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[0]));
    expect(calculateNutrition([trusted]).totals.kcal).toBe(291);
    const broad = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[1]));
    expect(() => calculateNutrition([broad])).toThrow(NutritionResolutionError);
  });

  it("keeps multiple mentions separated by a conjunction instead of globally collapsing a profile", () => {
    const analysis = analyzeWithHeuristics({
      text: "糯米饭100克和半碗米饭",
      source: "text",
    });

    expect(analysis.items.map((item) => item.food_name)).toEqual(["糯米饭", "米饭"]);
    expect(analysis.items.map((item) => item.portion_text)).toEqual(["糯米饭100克", "半碗米饭"]);
  });
});