import { describe, expect, it } from "vitest";
import { analyzeWithHeuristics } from "@/lib/ai/heuristic-provider";
import { calculateNutrition, NutritionResolutionError } from "@/lib/nutrition/engine";
import { acknowledgeNutritionItem, createNutritionInputItem } from "@/lib/nutrition/review";

const analyze = (text: string) => analyzeWithHeuristics({ text, source: "text" });
function calculates(item: ReturnType<typeof analyze>["items"][number]): boolean {
  try {
    calculateNutrition([acknowledgeNutritionItem(createNutritionInputItem(item))]);
    return true;
  } catch (error) {
    if (error instanceof NutritionResolutionError) return false;
    throw error;
  }
}

describe("heuristic neighbor boundaries", () => {
  it.each([
    "米饭 和 以及 饺子200克",
    "米饭　和　以及　饺子200克",
    "米饭\n和\n以及\n饺子200克",
    "米饭 和 另外 再加 饺子200克",
    "100克米饭 还有 另外 和 200克饺子",
  ])("stacked joiners cannot become authority through whitespace: %s", (text) => {
    const result = analyze(text);
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items.every((item) => !calculates(item))).toBe(true);
  });

  it.each([
    "100克米饭 和 200克饺子",
    "100克米饭　和　200克饺子",
    "100克米饭，200克饺子",
  ])("keeps one explicit boundary usable: %s", (text) => {
    const result = analyze(text);
    expect(result.items).toHaveLength(2);
    expect(result.items.every(calculates)).toBe(true);
  });

  it("keeps punctuation directional around an embedded compound", () => {
    const result = analyze("100克米饭，糯米饭100克；200克饺子");
    expect(result.items.map((item) => item.food_name)).toEqual(["米饭", "糯米饭", "饺子"]);
    expect(result.items.map(calculates)).toEqual([true, false, true]);
  });

  it("keeps punctuation plus structured joiners occurrence-local", () => {
    const result = analyze(
      "100克米饭，糯米饭100克；200克饺子，还有红烧排骨四块重油，再加300克米饭",
    );
    expect(result.items.map((item) => item.food_name)).toEqual([
      "米饭",
      "糯米饭",
      "饺子",
      "红烧排骨",
      "米饭",
    ]);
    expect(result.items.map(calculates)).toEqual([true, false, true, true, true]);
    expect(result.items[3].oil_level).toBe("heavy");
  });

  it.each([
    "米饭 顺带 饺子200克",
    "米饭　顺带　饺子200克",
    "米饭\n顺带\n饺子200克",
  ])("unknown token separator remains fail-closed: %s", (text) => {
    const result = analyze(text);
    expect(result.items.every((item) => !calculates(item))).toBe(true);
  });
});
