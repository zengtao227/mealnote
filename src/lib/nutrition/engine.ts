import type { MealItemAnalysis, OilLevel } from "@/lib/ai/meal-analysis-schema";
import { findFoodProfile, type FoodProfile } from "@/lib/nutrition/food-database";

export interface NutrientTotals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface CalculatedMealItem {
  food_name: string;
  estimated_grams: number;
  oil_level: OilLevel;
  confidence: number;
  source_type: FoodProfile["source_type"];
  source_ref: string;
  used_generic_fallback: boolean;
  nutrients: NutrientTotals;
  kcal_low: number;
  kcal_high: number;
}

export interface NutritionResult {
  items: CalculatedMealItem[];
  totals: NutrientTotals;
  kcal_low: number;
  kcal_high: number;
  confidence: number;
  explanation: string;
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

function calculateItem(item: MealItemAnalysis): CalculatedMealItem {
  const profile: FoodProfile = findFoodProfile(item.food_name);
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
  const confidencePenalty: number = (1 - item.confidence) * 0.25;
  const unknownOilPenalty: number = item.oil_level === "unknown" && profile.kind === "recipe" ? 0.1 : 0;
  const uncertaintyRatio: number = Math.min(
    0.6,
    profile.uncertainty_ratio + confidencePenalty + unknownOilPenalty,
  );

  return {
    food_name: item.food_name,
    estimated_grams: item.estimated_grams,
    oil_level: item.oil_level,
    confidence: item.confidence,
    source_type: profile.source_type,
    source_ref: profile.source_ref,
    used_generic_fallback: profile.source_type === "demo-fallback",
    nutrients,
    kcal_low: round(Math.max(0, nutrients.kcal * (1 - uncertaintyRatio)), 0),
    kcal_high: round(nutrients.kcal * (1 + uncertaintyRatio), 0),
  };
}

export function calculateNutrition(items: MealItemAnalysis[]): NutritionResult {
  if (items.length === 0) {
    throw new Error("至少需要一个已确认食物才能计算营养。 ");
  }

  const calculatedItems: CalculatedMealItem[] = items.map(calculateItem);
  const totals: NutrientTotals = calculatedItems.reduce<NutrientTotals>(
    (sum: NutrientTotals, item: CalculatedMealItem) => ({
      kcal: sum.kcal + item.nutrients.kcal,
      protein: sum.protein + item.nutrients.protein,
      fat: sum.fat + item.nutrients.fat,
      carbs: sum.carbs + item.nutrients.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  const confidence: number =
    calculatedItems.reduce((sum: number, item: CalculatedMealItem) => sum + item.confidence, 0) /
    calculatedItems.length;
  const usedFallback: boolean = calculatedItems.some((item: CalculatedMealItem) => item.used_generic_fallback);

  return {
    items: calculatedItems,
    totals: {
      kcal: round(totals.kcal, 0),
      protein: round(totals.protein),
      fat: round(totals.fat),
      carbs: round(totals.carbs),
    },
    kcal_low: calculatedItems.reduce((sum: number, item: CalculatedMealItem) => sum + item.kcal_low, 0),
    kcal_high: calculatedItems.reduce((sum: number, item: CalculatedMealItem) => sum + item.kcal_high, 0),
    confidence: round(confidence, 2),
    explanation: usedFallback
      ? "部分食物暂用通用家常菜模型，结果范围已放宽；上线前需匹配可信食物或个人菜谱。"
      : "热量范围综合了份量置信度、标准菜谱差异和用油不确定性。",
  };
}
