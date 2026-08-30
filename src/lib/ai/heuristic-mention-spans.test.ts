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

interface CompoundCase {
  connector: string;
  compound: "糯米饭" | "蛋炒米饭";
  compoundFirst: boolean;
}

const compoundCases: CompoundCase[] = ["以及", "与", "还有"].flatMap(
  (connector: string) =>
    (["糯米饭", "蛋炒米饭"] as const).flatMap((compound) => [
      { connector, compound, compoundFirst: true },
      { connector, compound, compoundFirst: false },
    ]),
);

function assertCompoundAndRice(caseDefinition: CompoundCase): void {
  const compoundText: string = `${caseDefinition.compound}100克`;
  const riceText: string = "半碗米饭";
  const text: string = caseDefinition.compoundFirst
    ? `${compoundText}${caseDefinition.connector}${riceText}`
    : `${riceText}${caseDefinition.connector}${compoundText}`;
  const analysis = analyzeWithHeuristics({ text, source: "text" });

  expect(analysis.items).toHaveLength(2);
  const expectedNames: string[] = caseDefinition.compoundFirst
    ? [caseDefinition.compound, "米饭"]
    : ["米饭", caseDefinition.compound];
  const expectedPortions: string[] = caseDefinition.compoundFirst
    ? [compoundText, riceText]
    : [riceText, compoundText];
  expect(analysis.items.map((item) => item.food_name)).toEqual(expectedNames);
  expect(analysis.items.map((item) => item.portion_text)).toEqual(expectedPortions);

  const compoundIndex: number = analysis.items.findIndex(
    (item) => item.food_name === caseDefinition.compound,
  );
  const trustedIndex: number = analysis.items.findIndex((item) => item.food_name === "米饭");
  expect(compoundIndex).toBeGreaterThanOrEqual(0);
  expect(trustedIndex).toBeGreaterThanOrEqual(0);
  const compoundIsCatalogSupported: boolean = caseDefinition.compound === "糯米饭";
  expect(analysis.items[compoundIndex]).toMatchObject({
    estimated_grams: 100,
    needs_confirmation: !compoundIsCatalogSupported,
  });
  expect(analysis.items[trustedIndex]).toMatchObject({
    estimated_grams: 100,
    needs_confirmation: false,
  });

  const compound = createNutritionInputItem(analysis.items[compoundIndex]);
  if (compoundIsCatalogSupported) {
    expect(calculateNutrition([compound]).totals.kcal).toBe(188);
  } else {
    expect(() =>
      calculateNutrition([acknowledgeNutritionItem(compound)]),
    ).toThrow(NutritionResolutionError);
  }
  const trusted = createNutritionInputItem(analysis.items[trustedIndex]);
  expect(calculateNutrition([trusted]).totals.kcal).toBe(116);
}

describe("heuristic mention-span authority isolation", () => {
  it.each(compoundCases)(
    "keeps $compound and plain rice independent with connector $connector (compoundFirst=$compoundFirst)",
    (caseDefinition: CompoundCase) => {
      assertCompoundAndRice(caseDefinition);
    },
  );

  it("keeps broad garlic ribs and trusted red-braised ribs independent without connector segmentation", () => {
    const analysis = analyzeWithHeuristics({
      text: "蒜香排骨四块以及红烧排骨四块",
      source: "text",
    });

    expect(analysis.items.map((item) => item.food_name)).toEqual(["排骨", "红烧排骨"]);
    expect(analysis.items.map((item) => item.portion_text)).toEqual([
      "蒜香排骨四块",
      "红烧排骨四块",
    ]);
    expect(analysis.items.map((item) => item.estimated_grams)).toEqual([112, 112]);

    const broad = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[0]));
    expect(() => calculateNutrition([broad])).toThrow(NutritionResolutionError);
    const trusted = acknowledgeNutritionItem(createNutritionInputItem(analysis.items[1]));
    expect(calculateNutrition([trusted]).totals.kcal).toBe(291);
  });

  it("keeps trusted red-braised ribs and later broad garlic ribs independent", () => {
    const analysis = analyzeWithHeuristics({
      text: "红烧排骨四块还有蒜香排骨四块",
      source: "text",
    });

    expect(analysis.items.map((item) => item.food_name)).toEqual(["红烧排骨", "排骨"]);
    expect(analysis.items.map((item) => item.portion_text)).toEqual([
      "红烧排骨四块",
      "蒜香排骨四块",
    ]);
    expect(analysis.items.map((item) => item.estimated_grams)).toEqual([112, 112]);
  });

  it("retains repeated trusted mentions and makes unknown joiners fail closed", () => {
    const repeated = analyzeWithHeuristics({
      text: "半碗米饭以及一碗米饭",
      source: "text",
    });

    expect(repeated.items).toHaveLength(2);
    expect(repeated.items.map((item) => item.food_name)).toEqual(["米饭", "米饭"]);
    expect(repeated.items.map((item) => item.portion_text)).toEqual(["半碗米饭", "一碗米饭"]);
    expect(repeated.items.map((item) => item.estimated_grams)).toEqual([100, 200]);
    expect(repeated.items.every((item) => item.needs_confirmation === false)).toBe(true);

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
});
