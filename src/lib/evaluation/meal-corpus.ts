import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { z } from "zod";

import { analyzeWithHeuristics } from "@/lib/ai/heuristic-provider";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import {
  FOOD_PROFILES,
  resolveFoodProfile,
  type FoodProfileResolution,
} from "@/lib/nutrition/food-database";

export const S35_ENGINE_BASE_REVISION: string =
  "b6cb11ff03ce07608bf84e7e07eb46a2f93991b0";

const CATEGORY_LABELS = {
  "colloquial-portions": "口语份量",
  "compound-names": "复合菜名",
  "home-cooking": "家常炒菜",
  "hotpot-noodles": "火锅与汤面",
  "multi-clause": "多子句与连接词",
  "overseas-substitutes": "海外替代食材",
  "shared-dishes": "合菜分摊",
  staples: "主食",
  takeout: "外卖",
} as const;

const corpusCategorySchema = z.enum(Object.keys(CATEGORY_LABELS) as [
  keyof typeof CATEGORY_LABELS,
  ...(keyof typeof CATEGORY_LABELS)[],
]);

const expectedItemSchema = z
  .object({
    identity: z.string().trim().min(1).max(80),
    mention: z.string().min(1).max(80),
    occurrence: z.number().int().positive(),
    identity_specificity: z.enum(["specific", "broad"]).optional(),
    expected_grams_range: z.tuple([
      z.number().positive().max(5000),
      z.number().positive().max(5000),
    ]),
  })
  .strict();

const corpusEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z]+(?:-[a-z]+)*-\d{3}$/),
    input_text: z.string().trim().min(1).max(1000),
    source: z.literal("text"),
    expected_items: z.array(expectedItemSchema).min(1).max(20),
    notes: z.string().trim().min(1).max(240).optional(),
  })
  .strict();

const corpusFileSchema = z
  .object({
    schema_version: z.literal(1),
    category: corpusCategorySchema,
    category_label: z.string().trim().min(1),
    provenance: z
      .object({
        origin: z.literal("synthetic"),
        description: z.string().trim().min(1),
        contains_personal_data: z.literal(false),
        label_review_status: z.literal("reviewed"),
      })
      .strict(),
    portion_label_policy: z
      .object({
        status: z.literal("heuristic"),
        basis: z.string().trim().min(1),
      })
      .strict(),
    holdout_entry_ids: z.array(z.string()).min(3),
    entries: z.array(corpusEntrySchema).min(10),
  })
  .strict();

type RawCorpusFile = z.infer<typeof corpusFileSchema>;
type RawCorpusEntry = z.infer<typeof corpusEntrySchema>;
type RawExpectedItem = z.infer<typeof expectedItemSchema>;

export type CorpusCategory = z.infer<typeof corpusCategorySchema>;
export type CorpusSplit = "discovery" | "holdout";

export interface ExpectedMealItem extends RawExpectedItem {
  mention_start: number;
  mention_end: number;
  identity_specificity: "specific" | "broad";
}

export interface MealCorpusEntry extends Omit<RawCorpusEntry, "expected_items"> {
  category: CorpusCategory;
  category_label: string;
  split: CorpusSplit;
  expected_items: ExpectedMealItem[];
}

export interface LoadedMealCorpus {
  corpus_digest: string;
  entries: MealCorpusEntry[];
  filenames: string[];
}

interface AlignmentPair {
  expected_index: number;
  candidate_index: number;
  basis: "longest-evidence" | "ordered-repeated-evidence";
}

export type MealCorpusAnalyzer = (entry: MealCorpusEntry) => MealItemAnalysis[];

interface EntryMeasurement {
  id: string;
  category: CorpusCategory;
  split: CorpusSplit;
  input_text: string;
  analysis_failed: boolean;
  expected_items: number;
  provider_candidates: number;
  aligned_items: number;
  omitted_items: number;
  unaligned_candidates: number;
  trusted_unaligned_candidates: number;
  specific_expected_items: number;
  broad_expected_items: number;
  catalog_covered_items: number;
  resolved_correct_items: number;
  resolved_wrong_items: number;
  silent_wrong_items: number;
  confirmation_candidates: number;
  trusted_correct_items: number;
  portion_diagnostic_items: number;
  portion_in_range_items: number;
  current_ui_recoverable: boolean;
  minimum_review_actions?: number;
  expected_identities: string[];
  omitted_identities: string[];
  catalog_gap_identities: string[];
  candidate_names: string[];
}

export interface BaselineSummary {
  meals: number;
  expected_items: number;
  provider_candidates: number;
  analysis_failures: number;
  aligned_items: number;
  omitted_items: number;
  unaligned_candidates: number;
  trusted_unaligned_candidates: number;
  specific_expected_items: number;
  broad_expected_items: number;
  catalog_covered_items: number;
  resolved_correct_items: number;
  resolved_wrong_items: number;
  silent_wrong_items: number;
  confirmation_candidates: number;
  trusted_correct_items: number;
  portion_diagnostic_items: number;
  portion_in_range_items: number;
  current_ui_recoverable_meals: number;
  median_minimum_review_actions?: number;
}

export interface MealCorpusBaseline {
  metadata: {
    corpus_schema_version: 1;
    engine_base_revision: string;
    engine_digest: string;
    corpus_digest: string;
    provider: "heuristic";
    input_modality: "text";
    required_node_major: 22;
    catalog_profile_count: number;
    catalog_digest: string;
  };
  overall: BaselineSummary;
  by_split: Record<CorpusSplit, BaselineSummary>;
  by_category: Record<CorpusCategory, BaselineSummary>;
  measurements: EntryMeasurement[];
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function findMentionSpan(
  inputText: string,
  mention: string,
  occurrence: number,
): { start: number; end: number } | undefined {
  let fromIndex: number = 0;
  let start: number = -1;
  for (let currentOccurrence: number = 1; currentOccurrence <= occurrence; currentOccurrence += 1) {
    start = inputText.indexOf(mention, fromIndex);
    if (start === -1) {
      return undefined;
    }
    fromIndex = start + mention.length;
  }
  return { start, end: start + mention.length };
}

function parseCorpusFile(filename: string, rawText: string): RawCorpusFile {
  let rawValue: unknown;
  try {
    rawValue = JSON.parse(rawText) as unknown;
  } catch (caughtError: unknown) {
    const message: string = caughtError instanceof Error ? caughtError.message : "unknown JSON error";
    throw new Error(`${filename}: invalid JSON: ${message}`);
  }
  return corpusFileSchema.parse(rawValue);
}

function validateCategoryFile(filename: string, corpusFile: RawCorpusFile): void {
  const expectedLabel: string = CATEGORY_LABELS[corpusFile.category];
  if (corpusFile.category_label !== expectedLabel) {
    throw new Error(`${filename}: category_label must be ${expectedLabel}`);
  }
  const entryIds: Set<string> = new Set(
    corpusFile.entries.map((entry: RawCorpusEntry) => entry.id),
  );
  const uniqueHoldoutIds: Set<string> = new Set(corpusFile.holdout_entry_ids);
  if (uniqueHoldoutIds.size !== corpusFile.holdout_entry_ids.length) {
    throw new Error(`${filename}: holdout_entry_ids must be unique`);
  }
  for (const holdoutId of uniqueHoldoutIds) {
    if (!entryIds.has(holdoutId)) {
      throw new Error(`${filename}: unknown holdout entry ${holdoutId}`);
    }
  }
  if (corpusFile.entries.length - uniqueHoldoutIds.size < 7) {
    throw new Error(`${filename}: each category needs at least 7 discovery entries`);
  }
}

function materializeEntry(
  corpusFile: RawCorpusFile,
  entry: RawCorpusEntry,
): MealCorpusEntry {
  const seenEvidenceKeys: Set<string> = new Set();
  const expectedItems: ExpectedMealItem[] = entry.expected_items.map(
    (expectedItem: RawExpectedItem): ExpectedMealItem => {
      if (expectedItem.expected_grams_range[0] > expectedItem.expected_grams_range[1]) {
        throw new Error(`${entry.id}: expected_grams_range must be ascending`);
      }
      const span: { start: number; end: number } | undefined = findMentionSpan(
        entry.input_text,
        expectedItem.mention,
        expectedItem.occurrence,
      );
      if (!span) {
        throw new Error(
          `${entry.id}: cannot locate mention ${expectedItem.mention} occurrence ${expectedItem.occurrence}`,
        );
      }
      const evidenceKey: string = `${expectedItem.mention}\u0000${expectedItem.occurrence}`;
      if (seenEvidenceKeys.has(evidenceKey)) {
        throw new Error(`${entry.id}: duplicate evidence key ${evidenceKey}`);
      }
      seenEvidenceKeys.add(evidenceKey);
      return {
        ...expectedItem,
        identity_specificity: expectedItem.identity_specificity ?? "specific",
        mention_start: span.start,
        mention_end: span.end,
      };
    },
  );
  const orderedExpectedItems: ExpectedMealItem[] = [...expectedItems].sort(
    (left: ExpectedMealItem, right: ExpectedMealItem) =>
      left.mention_start - right.mention_start || left.mention_end - right.mention_end,
  );
  for (let index: number = 1; index < orderedExpectedItems.length; index += 1) {
    if (orderedExpectedItems[index].mention_start < orderedExpectedItems[index - 1].mention_end) {
      throw new Error(`${entry.id}: expected mention spans must not overlap`);
    }
  }

  return {
    ...entry,
    category: corpusFile.category,
    category_label: corpusFile.category_label,
    split: corpusFile.holdout_entry_ids.includes(entry.id) ? "holdout" : "discovery",
    expected_items: expectedItems,
  };
}

export function loadMealCorpus(
  corpusDirectory: string = resolve(process.cwd(), "fixtures", "meal-corpus"),
): LoadedMealCorpus {
  const filenames: string[] = readdirSync(corpusDirectory)
    .filter((filename: string) => filename.endsWith(".json"))
    .sort();
  if (filenames.length !== Object.keys(CATEGORY_LABELS).length) {
    throw new Error(`expected 9 corpus JSON files, found ${filenames.length}`);
  }

  const entries: MealCorpusEntry[] = [];
  const seenCategories: Set<CorpusCategory> = new Set();
  const seenIds: Set<string> = new Set();
  const seenInputs: Set<string> = new Set();
  const digestParts: string[] = [];

  for (const filename of filenames) {
    const rawText: string = readFileSync(join(corpusDirectory, filename), "utf8");
    const corpusFile: RawCorpusFile = parseCorpusFile(filename, rawText);
    validateCategoryFile(filename, corpusFile);
    if (seenCategories.has(corpusFile.category)) {
      throw new Error(`duplicate corpus category ${corpusFile.category}`);
    }
    seenCategories.add(corpusFile.category);
    digestParts.push(`${filename}\u0000${JSON.stringify(corpusFile)}`);

    for (const entry of corpusFile.entries) {
      if (seenIds.has(entry.id)) {
        throw new Error(`duplicate corpus entry id ${entry.id}`);
      }
      const normalizedInput: string = normalize(entry.input_text).replace(/\s+/g, " ");
      if (seenInputs.has(normalizedInput)) {
        throw new Error(`duplicate corpus input ${entry.input_text}`);
      }
      seenIds.add(entry.id);
      seenInputs.add(normalizedInput);
      entries.push(materializeEntry(corpusFile, entry));
    }
  }

  return {
    corpus_digest: digest(digestParts.join("\u0001")),
    entries,
    filenames,
  };
}

function resolutionMatchesIdentity(
  resolution: FoodProfileResolution,
  identity: string,
): boolean {
  return (
    resolution.status === "matched" &&
    normalize(resolution.profile.canonical_name) === normalize(identity)
  );
}

function alignCandidates(
  expectedItems: ExpectedMealItem[],
  candidates: MealItemAnalysis[],
): AlignmentPair[] {
  const pairs: AlignmentPair[] = [];
  const unmatchedExpected: Set<number> = new Set(
    expectedItems.map((_: ExpectedMealItem, index: number) => index),
  );
  const unmatchedCandidates: Set<number> = new Set(
    candidates.map((_: MealItemAnalysis, index: number) => index),
  );

  for (const candidateIndex of [...unmatchedCandidates]) {
    const evidenceMatches: number[] = [...unmatchedExpected].filter((expectedIndex: number) =>
      candidates[candidateIndex].portion_text.includes(expectedItems[expectedIndex].mention),
    );
    if (evidenceMatches.length === 0) {
      continue;
    }
    const longestMentionLength: number = Math.max(
      ...evidenceMatches.map(
        (expectedIndex: number) => expectedItems[expectedIndex].mention.length,
      ),
    );
    const longestMatches: number[] = evidenceMatches.filter(
      (expectedIndex: number) =>
        expectedItems[expectedIndex].mention.length === longestMentionLength,
    );
    const longestMentions: Set<string> = new Set(
      longestMatches.map((expectedIndex: number) => expectedItems[expectedIndex].mention),
    );
    if (longestMatches.length > 1 && longestMentions.size > 1) {
      continue;
    }
    const expectedIndex: number = longestMatches[0];
    pairs.push({
      expected_index: expectedIndex,
      candidate_index: candidateIndex,
      basis: longestMatches.length === 1 ? "longest-evidence" : "ordered-repeated-evidence",
    });
    unmatchedExpected.delete(expectedIndex);
    unmatchedCandidates.delete(candidateIndex);
  }

  return pairs.sort(
    (left: AlignmentPair, right: AlignmentPair) => left.expected_index - right.expected_index,
  );
}

function isExpectedCatalogCovered(expectedItem: ExpectedMealItem): boolean {
  if (expectedItem.identity_specificity === "broad") {
    return false;
  }
  return resolutionMatchesIdentity(resolveFoodProfile(expectedItem.identity), expectedItem.identity);
}

function analyzeEntryWithHeuristics(entry: MealCorpusEntry): MealItemAnalysis[] {
  return analyzeWithHeuristics({ text: entry.input_text, source: "text" }).items;
}

function measureEntry(
  entry: MealCorpusEntry,
  analyzer: MealCorpusAnalyzer,
): EntryMeasurement {
  let candidates: MealItemAnalysis[] = [];
  let analysisFailed: boolean = false;
  try {
    candidates = analyzer(entry);
  } catch {
    analysisFailed = true;
  }

  const pairs: AlignmentPair[] = alignCandidates(entry.expected_items, candidates);
  const pairedExpectedIndexes: Set<number> = new Set(
    pairs.map((pair: AlignmentPair) => pair.expected_index),
  );
  const pairedCandidateIndexes: Set<number> = new Set(
    pairs.map((pair: AlignmentPair) => pair.candidate_index),
  );
  const unalignedCandidates: MealItemAnalysis[] = candidates.filter(
    (_: MealItemAnalysis, index: number) => !pairedCandidateIndexes.has(index),
  );
  let resolvedCorrectItems: number = 0;
  let resolvedWrongItems: number = 0;
  let silentWrongItems: number = 0;
  let confirmationCandidates: number = 0;
  let trustedCorrectItems: number = 0;
  let portionInRangeItems: number = 0;
  let minimumReviewActions: number = unalignedCandidates.length;

  for (const pair of pairs) {
    const expectedItem: ExpectedMealItem = entry.expected_items[pair.expected_index];
    const candidate: MealItemAnalysis = candidates[pair.candidate_index];
    const resolution: FoodProfileResolution = resolveFoodProfile(candidate.food_name);
    const resolvedCorrect: boolean = resolutionMatchesIdentity(resolution, expectedItem.identity);
    const resolvedWrong: boolean = resolution.status === "matched" && !resolvedCorrect;
    if (resolvedCorrect) {
      resolvedCorrectItems += 1;
    }
    if (resolvedWrong) {
      resolvedWrongItems += 1;
    }
    if (resolvedWrong && !candidate.needs_confirmation) {
      silentWrongItems += 1;
    }
    if (candidate.needs_confirmation) {
      confirmationCandidates += 1;
    }
    if (resolvedCorrect && !candidate.needs_confirmation) {
      trustedCorrectItems += 1;
    }
    const [minimumGrams, maximumGrams] = expectedItem.expected_grams_range;
    if (candidate.estimated_grams >= minimumGrams && candidate.estimated_grams <= maximumGrams) {
      portionInRangeItems += 1;
    }
    if (!resolvedCorrect) {
      minimumReviewActions += 1;
    } else if (candidate.needs_confirmation) {
      minimumReviewActions += 1;
    }
  }

  const omittedExpectedItems: ExpectedMealItem[] = entry.expected_items.filter(
    (_: ExpectedMealItem, index: number) => !pairedExpectedIndexes.has(index),
  );
  const catalogGapItems: ExpectedMealItem[] = entry.expected_items.filter(
    (expectedItem: ExpectedMealItem) =>
      expectedItem.identity_specificity === "specific" &&
      !isExpectedCatalogCovered(expectedItem),
  );
  const specificExpectedItems: number = entry.expected_items.filter(
    (expectedItem: ExpectedMealItem) => expectedItem.identity_specificity === "specific",
  ).length;
  const omittedItems: number = omittedExpectedItems.length;
  const catalogCoveredItems: number = specificExpectedItems - catalogGapItems.length;
  const currentUiRecoverable: boolean =
    !analysisFailed && catalogCoveredItems === entry.expected_items.length;
  if (currentUiRecoverable) {
    minimumReviewActions += omittedItems * 2;
  }

  return {
    id: entry.id,
    category: entry.category,
    split: entry.split,
    input_text: entry.input_text,
    analysis_failed: analysisFailed,
    expected_items: entry.expected_items.length,
    provider_candidates: candidates.length,
    aligned_items: pairs.length,
    omitted_items: omittedItems,
    unaligned_candidates: unalignedCandidates.length,
    trusted_unaligned_candidates: unalignedCandidates.filter(
      (candidate: MealItemAnalysis) => !candidate.needs_confirmation,
    ).length,
    specific_expected_items: specificExpectedItems,
    broad_expected_items: entry.expected_items.length - specificExpectedItems,
    catalog_covered_items: catalogCoveredItems,
    resolved_correct_items: resolvedCorrectItems,
    resolved_wrong_items: resolvedWrongItems,
    silent_wrong_items: silentWrongItems,
    confirmation_candidates: confirmationCandidates,
    trusted_correct_items: trustedCorrectItems,
    portion_diagnostic_items: pairs.length,
    portion_in_range_items: portionInRangeItems,
    current_ui_recoverable: currentUiRecoverable,
    minimum_review_actions: currentUiRecoverable ? minimumReviewActions : undefined,
    expected_identities: entry.expected_items.map(
      (expectedItem: ExpectedMealItem) => expectedItem.identity,
    ),
    omitted_identities: omittedExpectedItems.map(
      (expectedItem: ExpectedMealItem) => expectedItem.identity,
    ),
    catalog_gap_identities: catalogGapItems.map(
      (expectedItem: ExpectedMealItem) => expectedItem.identity,
    ),
    candidate_names: candidates.map((candidate: MealItemAnalysis) => candidate.food_name),
  };
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sortedValues: number[] = [...values].sort((left: number, right: number) => left - right);
  const middleIndex: number = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }
  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function summarize(measurements: EntryMeasurement[]): BaselineSummary {
  const summary: BaselineSummary = {
    meals: measurements.length,
    expected_items: 0,
    provider_candidates: 0,
    analysis_failures: 0,
    aligned_items: 0,
    omitted_items: 0,
    unaligned_candidates: 0,
    trusted_unaligned_candidates: 0,
    specific_expected_items: 0,
    broad_expected_items: 0,
    catalog_covered_items: 0,
    resolved_correct_items: 0,
    resolved_wrong_items: 0,
    silent_wrong_items: 0,
    confirmation_candidates: 0,
    trusted_correct_items: 0,
    portion_diagnostic_items: 0,
    portion_in_range_items: 0,
    current_ui_recoverable_meals: 0,
  };
  const reviewActions: number[] = [];

  for (const measurement of measurements) {
    summary.expected_items += measurement.expected_items;
    summary.provider_candidates += measurement.provider_candidates;
    summary.analysis_failures += measurement.analysis_failed ? 1 : 0;
    summary.aligned_items += measurement.aligned_items;
    summary.omitted_items += measurement.omitted_items;
    summary.unaligned_candidates += measurement.unaligned_candidates;
    summary.trusted_unaligned_candidates += measurement.trusted_unaligned_candidates;
    summary.specific_expected_items += measurement.specific_expected_items;
    summary.broad_expected_items += measurement.broad_expected_items;
    summary.catalog_covered_items += measurement.catalog_covered_items;
    summary.resolved_correct_items += measurement.resolved_correct_items;
    summary.resolved_wrong_items += measurement.resolved_wrong_items;
    summary.silent_wrong_items += measurement.silent_wrong_items;
    summary.confirmation_candidates += measurement.confirmation_candidates;
    summary.trusted_correct_items += measurement.trusted_correct_items;
    summary.portion_diagnostic_items += measurement.portion_diagnostic_items;
    summary.portion_in_range_items += measurement.portion_in_range_items;
    if (measurement.current_ui_recoverable) {
      summary.current_ui_recoverable_meals += 1;
    }
    if (measurement.minimum_review_actions !== undefined) {
      reviewActions.push(measurement.minimum_review_actions);
    }
  }
  summary.median_minimum_review_actions = median(reviewActions);
  return summary;
}

function digestFiles(relativePaths: string[]): string {
  const parts: string[] = relativePaths.map((relativePath: string) => {
    const filePath: string = resolve(process.cwd(), relativePath);
    return `${relativePath}\u0000${readFileSync(filePath, "utf8")}`;
  });
  return digest(parts.join("\u0001"));
}

export function measureMealCorpus(
  corpus: LoadedMealCorpus,
  analyzer: MealCorpusAnalyzer = analyzeEntryWithHeuristics,
): MealCorpusBaseline {
  const measurements: EntryMeasurement[] = corpus.entries.map((entry: MealCorpusEntry) =>
    measureEntry(entry, analyzer),
  );
  const bySplit: Record<CorpusSplit, BaselineSummary> = {
    discovery: summarize(
      measurements.filter((measurement: EntryMeasurement) => measurement.split === "discovery"),
    ),
    holdout: summarize(
      measurements.filter((measurement: EntryMeasurement) => measurement.split === "holdout"),
    ),
  };
  const byCategory: Record<CorpusCategory, BaselineSummary> = Object.fromEntries(
    Object.keys(CATEGORY_LABELS).map((category: string) => [
      category,
      summarize(
        measurements.filter(
          (measurement: EntryMeasurement) => measurement.category === category,
        ),
      ),
    ]),
  ) as Record<CorpusCategory, BaselineSummary>;

  return {
    metadata: {
      corpus_schema_version: 1,
      engine_base_revision: S35_ENGINE_BASE_REVISION,
      engine_digest: digestFiles([
        "src/lib/ai/heuristic-provider.ts",
        "src/lib/ai/meal-analysis-schema.ts",
        "src/lib/nutrition/catalog-collision-regressions.ts",
        "src/lib/nutrition/catalog-integrity.ts",
        "src/lib/nutrition/food-database.ts",
      ]),
      corpus_digest: corpus.corpus_digest,
      provider: "heuristic",
      input_modality: "text",
      required_node_major: 22,
      catalog_profile_count: FOOD_PROFILES.length,
      catalog_digest: digest(JSON.stringify(FOOD_PROFILES)),
    },
    overall: summarize(measurements),
    by_split: bySplit,
    by_category: byCategory,
    measurements,
  };
}

function percentage(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "n/a";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function renderSummaryRow(label: string, summary: BaselineSummary): string {
  return [
    label,
    summary.meals,
    summary.expected_items,
    percentage(summary.aligned_items, summary.expected_items),
    percentage(summary.catalog_covered_items, summary.specific_expected_items),
    summary.analysis_failures,
    summary.omitted_items,
    summary.silent_wrong_items,
    summary.trusted_unaligned_candidates,
    percentage(summary.current_ui_recoverable_meals, summary.meals),
    summary.median_minimum_review_actions ?? "n/a",
  ].join(" | ");
}

function renderIdentityDistribution(identities: string[]): string[] {
  const counts: Map<string, number> = new Map();
  for (const identity of identities) {
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(
      ([leftIdentity, leftCount]: [string, number], [rightIdentity, rightCount]: [string, number]) =>
        rightCount - leftCount || leftIdentity.localeCompare(rightIdentity),
    )
    .map(([identity, count]: [string, number]) => `| ${identity} | ${count} |`);
}

export function renderMealCorpusBaseline(baseline: MealCorpusBaseline): string {
  const metadata = baseline.metadata;
  const overall = baseline.overall;
  const splitRows: string[] = (["discovery", "holdout"] as CorpusSplit[]).map(
    (split: CorpusSplit) => `| ${renderSummaryRow(split, baseline.by_split[split])} |`,
  );
  const categoryRows: string[] = (Object.keys(CATEGORY_LABELS) as CorpusCategory[]).map(
    (category: CorpusCategory) =>
      `| ${renderSummaryRow(CATEGORY_LABELS[category], baseline.by_category[category])} |`,
  );
  const highMissMeasurements: EntryMeasurement[] = baseline.measurements
    .filter(
      (measurement: EntryMeasurement) =>
        measurement.omitted_items > 0 ||
        measurement.unaligned_candidates > 0 ||
        measurement.resolved_wrong_items > 0 ||
        measurement.analysis_failed,
    )
    .sort(
      (left: EntryMeasurement, right: EntryMeasurement) =>
        Number(right.analysis_failed) - Number(left.analysis_failed) ||
        right.silent_wrong_items - left.silent_wrong_items ||
        right.omitted_items - left.omitted_items ||
        left.id.localeCompare(right.id),
    );
  const findingRows: string[] = highMissMeasurements.slice(0, 25).map(
    (finding: EntryMeasurement) =>
      `| ${finding.id} | ${finding.split} | ${finding.analysis_failed ? "yes" : "no"} | ${finding.omitted_items} | ${finding.unaligned_candidates} | ${finding.expected_identities.join("、")} | ${finding.candidate_names.join("、") || "—"} |`,
  );
  const discoveryMeasurements: EntryMeasurement[] = baseline.measurements.filter(
    (measurement: EntryMeasurement) => measurement.split === "discovery",
  );
  const discoveryOmissionRows: string[] = renderIdentityDistribution(
    discoveryMeasurements.flatMap(
      (measurement: EntryMeasurement) => measurement.omitted_identities,
    ),
  );
  const discoveryCatalogGapRows: string[] = renderIdentityDistribution(
    discoveryMeasurements.flatMap(
      (measurement: EntryMeasurement) => measurement.catalog_gap_identities,
    ),
  );

  return `# S3.5 text/heuristic catalog baseline

> Generated regression artifact. Recreate with \`UPDATE_MEAL_CORPUS_BASELINE=1 npm run measure:catalog-baseline\`, then verify with \`npm run measure:catalog-baseline\` under Node 22.

## Scope and provenance

- Engine base revision: \`${metadata.engine_base_revision}\`
- Engine digest: \`${metadata.engine_digest}\`
- Corpus schema: V${metadata.corpus_schema_version}
- Corpus digest: \`${metadata.corpus_digest}\`
- Provider / modality: \`${metadata.provider}\` / \`${metadata.input_modality}\`
- Runtime contract: Node ${metadata.required_node_major}.x
- Catalog: ${metadata.catalog_profile_count} profiles, digest \`${metadata.catalog_digest}\`
- Dataset grain: ${overall.meals} synthetic meals / ${overall.expected_items} consumed-food mentions
- This report does **not** measure image, voice, OpenAI, real-user time, completion behavior, or nutrition accuracy.

## Gates

- Silent wrong canonicalization: **${overall.silent_wrong_items}** — ${overall.silent_wrong_items === 0 ? "PASS" : "BLOCKED"}
- Trusted candidates without unique expected evidence: **${overall.trusted_unaligned_candidates}** — ${overall.trusted_unaligned_candidates === 0 ? "PASS" : "BLOCKED"}
- These are necessary authority gates, not sufficient authorization to expand the catalog; the collision audit and nutrition-source review are still required.

## Overall counts

- Provider extraction recall: ${overall.aligned_items}/${overall.expected_items} (${percentage(overall.aligned_items, overall.expected_items)})
- Ground-truth specific-identity catalog coverage: ${overall.catalog_covered_items}/${overall.specific_expected_items} (${percentage(overall.catalog_covered_items, overall.specific_expected_items)})
- Broad expected identities requiring confirmation: ${overall.broad_expected_items}
- Current-UI-recoverable meals: ${overall.current_ui_recoverable_meals}/${overall.meals} (${percentage(overall.current_ui_recoverable_meals, overall.meals)})
- Analysis failures: ${overall.analysis_failures}/${overall.meals}
- Omitted expected items: ${overall.omitted_items}/${overall.expected_items}
- Provider candidates requiring confirmation: ${overall.confirmation_candidates}/${overall.provider_candidates}
- Trusted correctly resolved candidates: ${overall.trusted_correct_items}/${overall.expected_items}
- Resolved-wrong candidates: ${overall.resolved_wrong_items} total / ${overall.silent_wrong_items} silent

## Measurement contract

1. Align from \`portion_text\` evidence before looking at resolved canonical identity.
2. Prefer the longest unmatched mention, so a nested \`米饭\` cannot steal a \`糯米饭\` occurrence.
3. Repeated identical mentions pair in occurrence order; zero or genuinely ambiguous evidence matches remain unaligned.
4. An expected item without a pair is an omission. After S3.5-B, an analyzed meal remains recoverable only when every omission has an exact catalog identity that the user can add; an analysis failure or any broad/unsupported identity remains unrecoverable.
5. Catalog coverage is measured independently from provider extraction by resolving the ground-truth identity.
6. Minimum review actions are reported only for currently recoverable meals and count select/rename, acknowledgement, deletion, and two actions for each catalog-supported omission (add/select plus explicit confirmation). They exclude heuristic gram-range edits.
7. Portion range agreement is diagnostic only: ${overall.portion_in_range_items}/${overall.portion_diagnostic_items} aligned items (${percentage(overall.portion_in_range_items, overall.portion_diagnostic_items)}).

## By split

| Split | Meals | Items | Extraction recall | Catalog coverage | Analysis failures | Omitted items | Silent wrong | Trusted extra | UI-recoverable meals | Median minimum actions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${splitRows.join("\n")}

## By category

| Category | Meals | Items | Extraction recall | Catalog coverage | Analysis failures | Omitted items | Silent wrong | Trusted extra | UI-recoverable meals | Median minimum actions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${categoryRows.join("\n")}

## Discovery-only miss distribution

These tables are the only baseline distributions that may guide the next catalog/recovery slice. Holdout identities are deliberately excluded.

### Provider omissions

| Ground-truth identity | Omitted mentions |
| --- | ---: |
${discoveryOmissionRows.join("\n") || "| — | 0 |"}

### Catalog gaps

| Ground-truth identity | Unsupported mentions |
| --- | ---: |
${discoveryCatalogGapRows.join("\n") || "| — | 0 |"}

## Highest-miss examples

| Entry | Split | Analysis failed | Omitted | Unaligned candidates | Expected | Provider candidates |
| --- | --- | --- | ---: | ---: | --- | --- |
${findingRows.join("\n") || "| — | — | — | 0 | 0 | — | — |"}

## Interpretation boundary

- Discovery misses may guide a future catalog batch; holdout misses must not be used for catalog selection.
- Synthetic fixtures support deterministic regression decisions but do not establish real-world food frequency, the 85% product recall target, or the 10-second promise.
- All gram ranges are heuristic labels. Nutrition authority remains the MealNote-owned food/recipe data and is outside this baseline.
`;
}
