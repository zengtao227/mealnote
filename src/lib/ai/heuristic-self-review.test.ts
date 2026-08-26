import { describe, expect, it } from "vitest";
import { analyzeWithHeuristics } from "@/lib/ai/heuristic-provider";
import {
  calculateNutrition,
  NutritionResolutionError,
} from "@/lib/nutrition/engine";
import {
  acknowledgeNutritionItem,
  createNutritionInputItem,
} from "@/lib/nutrition/review";

function acknowledgedNutritionError(text: string): void {
  const analysis = analyzeWithHeuristics({ text, source: "text" });
  const acknowledged = analysis.items.map((item) =>
    acknowledgeNutritionItem(createNutritionInputItem(item)),
  );
  expect(() => calculateNutrition(acknowledged)).toThrow(NutritionResolutionError);
}

describe("heuristic self-review regressions", () => {
  it("preserves prefix grams as the trusted rice portion", () => {
    const analysis = analyzeWithHeuristics({ text: "200克米饭", source: "text" });
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "米饭",
      portion_text: "200克米饭",
      estimated_grams: 200,
      needs_confirmation: false,
    });
    expect(calculateNutrition([createNutritionInputItem(analysis.items[0])]).totals.kcal).toBe(232);
  });

  it("supports approximate local portion grammar without falling back to defaults", () => {
    const rice = analyzeWithHeuristics({ text: "米饭大概半碗", source: "text" });
    expect(rice.items[0]).toMatchObject({
      food_name: "米饭",
      estimated_grams: 100,
      needs_confirmation: false,
    });

    const eggs = analyzeWithHeuristics({
      text: "番茄炒蛋大概吃了三分之一盘",
      source: "text",
    });
    expect(eggs.items[0]).toMatchObject({
      food_name: "番茄炒蛋",
      estimated_grams: 120,
      needs_confirmation: true,
    });
  });

  it("does not let trusted-boundary characters turn a compound into plain rice authority", () => {
    const analysis = analyzeWithHeuristics({ text: "米饭大饼100克", source: "text" });
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "米饭大饼",
      estimated_grams: 100,
      needs_confirmation: true,
    });
    acknowledgedNutritionError("米饭大饼100克");
  });

  it("suppresses an overlapping broad ribs occurrence even when the specific recipe is embedded", () => {
    const analysis = analyzeWithHeuristics({ text: "红烧排骨饭100克", source: "text" });
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({
      food_name: "红烧排骨饭",
      estimated_grams: 100,
      needs_confirmation: true,
    });
    acknowledgedNutritionError("红烧排骨饭100克");
  });

  it("keeps prefix grams bound to the right mention across a known connector", () => {
    const forward = analyzeWithHeuristics({
      text: "糯米饭100克以及200克米饭",
      source: "text",
    });
    expect(forward.items.map((item) => item.food_name)).toEqual(["糯米饭", "米饭"]);
    expect(forward.items.map((item) => item.estimated_grams)).toEqual([100, 200]);
    expect(forward.items.map((item) => item.needs_confirmation)).toEqual([true, false]);

    const reverse = analyzeWithHeuristics({
      text: "200克米饭以及糯米饭100克",
      source: "text",
    });
    expect(reverse.items.map((item) => item.food_name)).toEqual(["米饭", "糯米饭"]);
    expect(reverse.items.map((item) => item.estimated_grams)).toEqual([200, 100]);
    expect(reverse.items.map((item) => item.needs_confirmation)).toEqual([false, true]);
  });

  it("fails closed rather than sharing a portion across adjacent unsplit mentions", () => {
    const analysis = analyzeWithHeuristics({
      text: "米饭100克红烧排骨四块",
      source: "text",
    });
    expect(analysis.items).toHaveLength(2);
    expect(analysis.items.every((item) => item.needs_confirmation)).toBe(true);
    const acknowledged = analysis.items.map((item) =>
      acknowledgeNutritionItem(createNutritionInputItem(item)),
    );
    expect(() => calculateNutrition(acknowledged)).toThrow(NutritionResolutionError);
  });

  it("makes unknown connectors conservative in both directions", () => {
    for (const text of [
      "糯米饭100克顺带半碗米饭",
      "半碗米饭顺带糯米饭100克",
    ]) {
      const analysis = analyzeWithHeuristics({ text, source: "text" });
      expect(analysis.items).toHaveLength(2);
      expect(analysis.items.every((item) => item.needs_confirmation)).toBe(true);
      const acknowledged = analysis.items.map((item) =>
        acknowledgeNutritionItem(createNutritionInputItem(item)),
      );
      expect(() => calculateNutrition(acknowledged)).toThrow(NutritionResolutionError);
    }
  });

  it("does not treat a non-terminating oil phrase as authority for a compound recipe", () => {
    const compound = analyzeWithHeuristics({
      text: "红烧排骨少油饭100克",
      source: "text",
    });
    expect(compound.items).toHaveLength(1);
    expect(compound.items[0]).toMatchObject({
      food_name: "红烧排骨少油饭",
      estimated_grams: 100,
      needs_confirmation: true,
    });
    const acknowledged = acknowledgeNutritionItem(createNutritionInputItem(compound.items[0]));
    expect(() => calculateNutrition([acknowledged])).toThrow(NutritionResolutionError);

    const separated = analyzeWithHeuristics({
      text: "红烧排骨少油和米饭100克",
      source: "text",
    });
    expect(separated.items[0]).toMatchObject({
      food_name: "红烧排骨",
      oil_level: "light",
      needs_confirmation: false,
    });
  });


  it("keeps common multi-token meal leads attached to a local explicit portion", () => {
    for (const [text, grams] of [
      ["我今天吃了200克米饭", 200],
      ["我中午吃了半碗米饭", 100],
      ["我今天中午大概吃了半碗米饭", 100],
    ] as const) {
      const analysis = analyzeWithHeuristics({ text, source: "text" });
      expect(analysis.items).toHaveLength(1);
      expect(analysis.items[0]).toMatchObject({
        food_name: "米饭",
        estimated_grams: grams,
        needs_confirmation: false,
      });
    }
  });

  it("treats an explicit known joiner as a boundary between exact food mentions", () => {
    for (const text of ["米饭和饺子", "米饭与饺子", "米饭以及饺子"]) {
      const analysis = analyzeWithHeuristics({ text, source: "text" });
      expect(analysis.items.map((item) => item.food_name)).toEqual(["米饭", "饺子"]);
      expect(analysis.items.every((item) => !item.needs_confirmation)).toBe(true);
    }

    const compound = analyzeWithHeuristics({ text: "糯米饭和饺子", source: "text" });
    expect(compound.items[0].food_name).toBe("糯米饭");
    expect(compound.items[0].needs_confirmation).toBe(true);
    expect(compound.items[1]).toMatchObject({ food_name: "饺子", needs_confirmation: false });
  });


  it("requires joiner authority to be directional between actual mentions", () => {
    for (const text of [
      "大和米饭100克",
      "大和200克米饭",
      "共和米饭100克",
      "红烧排骨和风盖饭100克",
      "米饭和风盖饭100克",
    ]) {
      acknowledgedNutritionError(text);
    }

    const reverseCompound = analyzeWithHeuristics({
      text: "200克米饭以及糯米饭100克",
      source: "text",
    });
    expect(reverseCompound.items.map((item) => item.food_name)).toEqual(["米饭", "糯米饭"]);
    expect(reverseCompound.items.map((item) => item.needs_confirmation)).toEqual([false, true]);

    const suffixCompound = analyzeWithHeuristics({
      text: "米饭团100克以及200克饺子",
      source: "text",
    });
    expect(suffixCompound.items[0].needs_confirmation).toBe(true);
    expect(suffixCompound.items[1]).toMatchObject({
      food_name: "饺子",
      estimated_grams: 200,
      needs_confirmation: false,
    });
  });


  it("does not turn lexical action suffixes into consumption authority", () => {
    for (const text of [
      "好吃米饭100克",
      "小吃米饭100克",
      "贪吃米饭100克",
      "好喝冬瓜汤一碗",
      "能喝冬瓜汤一碗",
    ]) {
      acknowledgedNutritionError(text);
    }

    for (const text of ["我吃米饭", "今天我吃米饭", "我今天晚上吃米饭"]) {
      const analysis = analyzeWithHeuristics({ text, source: "text" });
      expect(analysis.items).toHaveLength(1);
      expect(analysis.items[0]).toMatchObject({
        food_name: "米饭",
        needs_confirmation: false,
      });
    }
  });

  it("does not let stacked known joiners impersonate name fragments", () => {
    for (const text of [
      "米饭和以及饺子200克",
      "米饭以及和饺子200克",
      "米饭还有另外饺子200克",
    ]) {
      const analysis = analyzeWithHeuristics({ text, source: "text" });
      const reviewed = analysis.items.map((item) =>
        acknowledgeNutritionItem(createNutritionInputItem(item)),
      );
      expect(() => calculateNutrition(reviewed)).toThrow(NutritionResolutionError);
      expect(analysis.items.every((item) => item.needs_confirmation)).toBe(true);
    }
  });

});
