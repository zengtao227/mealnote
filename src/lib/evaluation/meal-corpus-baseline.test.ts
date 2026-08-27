import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadMealCorpus,
  measureMealCorpus,
  renderMealCorpusBaseline,
  type CorpusCategory,
  type MealCorpusAnalyzer,
} from "@/lib/evaluation/meal-corpus";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";

const REPORT_PATH: string = resolve(
  process.cwd(),
  "docs",
  "reports",
  "s3.5-text-heuristic-baseline.md",
);

describe("S3.5 meal corpus baseline", () => {
  const corpus = loadMealCorpus();
  const baseline = measureMealCorpus(corpus);
  const renderedReport: string = renderMealCorpusBaseline(baseline);

  it("keeps every category above the measurement floor with a frozen holdout", () => {
    expect(corpus.entries).toHaveLength(90);
    expect(baseline.overall.expected_items).toBe(112);
    const categories: CorpusCategory[] = Object.keys(baseline.by_category) as CorpusCategory[];
    expect(categories).toHaveLength(9);
    for (const category of categories) {
      expect(baseline.by_category[category].meals).toBeGreaterThanOrEqual(10);
      const holdoutMeals: number = corpus.entries.filter(
        (entry) => entry.category === category && entry.split === "holdout",
      ).length;
      expect(holdoutMeals).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps broad identities broad and portion labels outside authority gates", () => {
    const broadRibs = corpus.entries
      .flatMap((entry) => entry.expected_items)
      .find((item) => item.mention === "排骨" && item.identity_specificity === "broad");
    expect(broadRibs?.identity).toBe("排骨");
  });

  it("blocks catalog expansion on silent wrong or unattributed trusted output", () => {
    expect(baseline.overall.silent_wrong_items).toBe(0);
    expect(baseline.overall.trusted_unaligned_candidates).toBe(0);
  });

  it("attributes a nested trusted canonical to the longest source mention", () => {
    const adversarialEntry = corpus.entries.find((entry) => entry.id === "compound-007");
    if (!adversarialEntry) {
      throw new Error("compound-007 fixture is required for the alignment regression");
    }
    const wrongTrustedRice: MealItemAnalysis = {
      food_name: "米饭",
      portion_text: "半碗糯米饭",
      estimated_grams: 100,
      oil_level: "none",
      confidence: 0.99,
      source: "text",
      type: "food",
      assumptions: ["adversarial harness fixture"],
      needs_confirmation: false,
    };
    const analyzer: MealCorpusAnalyzer = (entry) =>
      entry.id === "compound-007" ? [wrongTrustedRice] : [];
    const adversarialBaseline = measureMealCorpus(
      { ...corpus, entries: [adversarialEntry] },
      analyzer,
    );
    expect(adversarialBaseline.overall.silent_wrong_items).toBe(1);
    expect(adversarialBaseline.overall.omitted_items).toBe(1);
  });

  it("renders a deterministic checked-in baseline report", () => {
    if (process.env.UPDATE_MEAL_CORPUS_BASELINE === "1") {
      writeFileSync(REPORT_PATH, renderedReport, "utf8");
    }
    expect(readFileSync(REPORT_PATH, "utf8")).toBe(renderedReport);
  });
});
