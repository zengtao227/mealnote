import type { OilLevel } from "@/lib/ai/meal-analysis-schema";
import {
  resolveFoodProfile,
  type FoodProfile,
  type FoodProfileResolution,
  type MatchedFoodProfileResolution,
} from "@/lib/nutrition/food-database";
import {
  assertNutritionItemsReady,
  getNutritionFieldProvenance,
  type NutritionFieldProvenance,
  type NutritionInputItem,
  type ProvenanceVerification,
} from "@/lib/nutrition/review";

export interface NutrientTotals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface CalculatedMealItem {
  food_name: string;
  matched_profile_name: string;
  matched_by: MatchedFoodProfileResolution["matched_by"];
  estimated_grams: number;
  oil_level: OilLevel;
  recognition_confidence: number;
  recognition_source: NutritionInputItem["source"];
  recognition_metadata_verification: ProvenanceVerification;
  field_provenance: NutritionFieldProvenance;
  field_provenance_verification: ProvenanceVerification;
  confirmation_required: boolean;
  confirmation_acknowledged: boolean;
  confirmation_verification: ProvenanceVerification;
  source_type: FoodProfile["source_type"];
  source_ref: string;
  nutrients: NutrientTotals;
  kcal_low: number;
  kcal_high: number;
}

export interface NutritionResult {
  items: CalculatedMealItem[];
  totals: NutrientTotals;
  kcal_low: number;
  kcal_high: number;
  recognition_confidence: number;
  recognition_confidence_verification: ProvenanceVerification;
  explanation: string;
}

export class NutritionResolutionError extends Error {
  readonly unresolved_food_names: string[];

  constructor(unresolvedFoodNames: string[]) {
    super(
      `未匹配到可信营养条目：${unresolvedFoodNames.join("、")}。请修改为明确的食物或菜谱名称后再计算。`,
    );
    this.name = "NutritionResolutionError";
    this.unresolved_food_names = unresolvedFoodNames;
  }
}

function round(value: number, precision: number = 1): number {
  const factor: number = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function oilAdjustmentPer100g(oilLevel: OilLevel, profile: FoodProfile): number {
  if (profile.kind !== "recipe") {
    return 0;
  }

  const adjustments: Record<OilLevel, number> = {
    none: -4,
    light: -2,
    standard: 0,
    heavy: 4,
    unknown: 0,
  };
  return adjustments[oilLevel];
}

function calculateItem(
  item: NutritionInputItem,
  resolution: MatchedFoodProfileResolution,
): CalculatedMealItem {
  const profile: FoodProfile = resolution.profile;
  const scale: number = item.estimated_grams / 100;
  const fatAdjustment: number = Math.max(
    -profile.fat_per_100g * scale,
    oilAdjustmentPer100g(item.oil_level, profile) * scale,
  );
  const nutrients: NutrientTotals = {
    kcal: round(profile.kcal_per_100g * scale + fatAdjustment * 9),
    protein: round(profile.protein_per_100g * scale),
    fat: round(Math.max(0, profile.fat_per_100g * scale + fatAdjustment)),
    carbs: round(profile.carbs_per_100g * scale),
  };
  const unknownOilPenalty: number =
    item.oil_level === "unknown" && profile.kind === "recipe" ? 0.1 : 0;
  const uncertaintyRatio: number = Math.min(
    0.6,
    profile.uncertainty_ratio + unknownOilPenalty,
  );

  return {
    food_name: item.food_name,
    matched_profile_name: profile.canonical_name,
    matched_by: resolution.matched_by,
    estimated_grams: item.estimated_grams,
    oil_level: item.oil_level,
    recognition_confidence: item.confidence,
    recognition_source: item.source,
    recognition_metadata_verification: item.review_metadata_basis,
    field_provenance: getNutritionFieldProvenance(item),
    field_provenance_verification: item.review_metadata_basis,
    confirmation_required: item.needs_confirmation,
    confirmation_acknowledged: item.confirmation_acknowledged,
    confirmation_verification: item.review_metadata_basis,
    source_type: profile.source_type,
    source_ref: profile.source_ref,
    nutrients,
    kcal_low: round(Math.max(0, nutrients.kcal * (1 - uncertaintyRatio)), 0),
    kcal_high: round(nutrients.kcal * (1 + uncertaintyRatio), 0),
  };
}

export function calculateNutrition(items: NutritionInputItem[]): NutritionResult {
  if (items.length === 0) {
    throw new Error("至少需要一个已确认食物才能计算营养。");
  }

  assertNutritionItemsReady(items);

  const resolutions: FoodProfileResolution[] = items.map(
    (item: NutritionInputItem) => resolveFoodProfile(item.food_name),
  );
  const unresolvedFoodNames: string[] = items
    .filter((_: NutritionInputItem, index: number) => resolutions[index].status !== "matched")
    .map((item: NutritionInputItem) => item.food_name);

  if (unresolvedFoodNames.length > 0) {
    throw new NutritionResolutionError(unresolvedFoodNames);
  }

  const calculatedItems: CalculatedMealItem[] = items.map(
    (item: NutritionInputItem, index: number) =>
      calculateItem(item, resolutions[index] as MatchedFoodProfileResolution),
  );
  const totals: NutrientTotals = calculatedItems.reduce<NutrientTotals>(
    (sum: NutrientTotals, item: CalculatedMealItem) => ({
      kcal: sum.kcal + item.nutrients.kcal,
      protein: sum.protein + item.nutrients.protein,
      fat: sum.fat + item.nutrients.fat,
      carbs: sum.carbs + item.nutrients.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  const recognitionConfidence: number =
    calculatedItems.reduce(
      (sum: number, item: CalculatedMealItem) => sum + item.recognition_confidence,
      0,
    ) / calculatedItems.length;
  const hasReviewChanges: boolean = calculatedItems.some((item: CalculatedMealItem) =>
    Object.values(item.field_provenance).some((source) => source !== "analysis"),
  );

  return {
    items: calculatedItems,
    totals: {
      kcal: round(totals.kcal, 0),
      protein: round(totals.protein),
      fat: round(totals.fat),
      carbs: round(totals.carbs),
    },
    kcal_low: calculatedItems.reduce(
      (sum: number, item: CalculatedMealItem) => sum + item.kcal_low,
      0,
    ),
    kcal_high: calculatedItems.reduce(
      (sum: number, item: CalculatedMealItem) => sum + item.kcal_high,
      0,
    ),
    recognition_confidence: round(recognitionConfidence, 2),
    recognition_confidence_verification: "client-reported",
    explanation: hasReviewChanges
      ? "营养值仅来自已匹配的 MealNote 食物/菜谱条目；字段来源、确认状态和原始识别元数据目前均由客户端报告，尚未与服务端原始分析绑定，因此不作为已验证审计来源。"
      : "营养值仅来自已匹配的 MealNote 食物/菜谱条目；原始识别置信度、字段来源和确认状态目前均由客户端报告，尚未与服务端原始分析绑定，因此不作为已验证审计来源。",
  };
}
