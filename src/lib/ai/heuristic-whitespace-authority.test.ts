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

describe("heuristic whitespace authority", () => {
  it.each([
    "好吃 米饭100克",
    "好吃　米饭100克",
    "好吃\n米饭100克",
    "小吃 米饭100克",
    "贪吃 米饭100克",
    "好喝 冬瓜汤一碗",
    "蛋炒 米饭100克",
  ])("whitespace cannot turn lexical context into authority: %s", (text) => {
    const result = analyze(text);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every(calculates)).toBe(false);
  });

  it.each([
    "米饭100克 好吃",
    "米饭100克　好吃",
    "米饭100克\n好吃",
    "红烧排骨四块少油 好吃",
  ])("whitespace cannot terminate a trusted portion before arbitrary trailing text: %s", (text) => {
    const result = analyze(text);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every(calculates)).toBe(false);
  });

  it.each([
    "  米饭100克  ",
    "\n米饭100克\n",
    "我吃 米饭100克",
    "今天我吃了 100克米饭",
    "早餐 100克米饭",
    "随便说，100克米饭",
  ])("keeps explicit or edge-bounded trusted input usable: %s", (text) => {
    const result = analyze(text);
    expect(result.items).toHaveLength(1);
    expect(calculates(result.items[0])).toBe(true);
  });

  it.each([
    "米饭 和 以及 饺子200克",
    "米饭　和　以及　饺子200克",
    "米饭\n和\n以及\n饺子200克",
  ])("retains stacked-joiner fail-closed behavior: %s", (text) => {
    const result = analyze(text);
    expect(result.items.every(calculates)).toBe(false);
  });
});
