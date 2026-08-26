import { z } from "zod";
import {
  mealItemAnalysisSchema,
  type MealItemAnalysis,
  type OilLevel,
} from "@/lib/ai/meal-analysis-schema";
import { resolveFoodProfile } from "@/lib/nutrition/food-database";

export const editableNutritionFieldSchema = z.enum([
  "food_name",
  "estimated_grams",
  "oil_level",
]);

export type EditableNutritionField = z.infer<typeof editableNutritionFieldSchema>;
export type ProvenanceVerification = "client-reported";
export type NutritionFieldSource = "analysis" | "user" | "review-derived";

export const nutritionInputItemSchema = mealItemAnalysisSchema
  .extend({
    confirmation_acknowledged: z.boolean(),
    edited_fields: z.array(editableNutritionFieldSchema).max(3),
    review_metadata_basis: z.literal("client-reported"),
  })
  .strict();

export type NutritionInputItem = z.infer<typeof nutritionInputItemSchema>;

export interface EditableNutritionItemUpdates {
  food_name?: string;
  estimated_grams?: number;
  oil_level?: OilLevel;
}

export interface NutritionFieldProvenance {
  food_name: NutritionFieldSource;
  estimated_grams: NutritionFieldSource;
  oil_level: NutritionFieldSource;
}

export class NutritionConfirmationError extends Error {
  readonly pending_food_names: string[];

  constructor(pendingFoodNames: string[]) {
    super(`仍有需要明确确认的食物：${pendingFoodNames.join("、")}。请确认后再计算营养。`);
    this.name = "NutritionConfirmationError";
    this.pending_food_names = pendingFoodNames;
  }
}

export function createNutritionInputItem(item: MealItemAnalysis): NutritionInputItem {
  return {
    ...item,
    confirmation_acknowledged: !item.needs_confirmation,
    edited_fields: [],
    review_metadata_basis: "client-reported",
  };
}

export function applyNutritionItemEdit(
  item: NutritionInputItem,
  updates: EditableNutritionItemUpdates,
): NutritionInputItem {
  const changedFields: EditableNutritionField[] = [];
  if (updates.food_name !== undefined && updates.food_name !== item.food_name) {
    changedFields.push("food_name");
  }
  if (
    updates.estimated_grams !== undefined &&
    updates.estimated_grams !== item.estimated_grams
  ) {
    changedFields.push("estimated_grams");
  }
  if (updates.oil_level !== undefined && updates.oil_level !== item.oil_level) {
    changedFields.push("oil_level");
  }
  if (changedFields.length === 0) {
    return item;
  }

  const foodNameChanged: boolean = changedFields.includes("food_name");
  const editedFieldSet: Set<EditableNutritionField> = new Set<EditableNutritionField>([
    ...item.edited_fields,
    ...changedFields,
  ]);
  const explicitOilEdit: boolean = updates.oil_level !== undefined;
  if (foodNameChanged && !explicitOilEdit) {
    // A food identity change invalidates any older oil edit. The replacement oil value below
    // is review-derived, not copied from analysis and not a direct user oil edit.
    editedFieldSet.delete("oil_level");
  }
  const editedFields: EditableNutritionField[] = Array.from(editedFieldSet);
  const nextEstimatedGrams: number = updates.estimated_grams ?? item.estimated_grams;
  const nextFoodName: string = updates.food_name ?? item.food_name;
  const resolution = foodNameChanged ? resolveFoodProfile(nextFoodName) : undefined;
  const nextOilLevel: OilLevel = explicitOilEdit
    ? updates.oil_level as OilLevel
    : foodNameChanged
      ? resolution?.status === "matched"
        ? resolution.profile.kind === "recipe"
          ? "unknown"
          : "none"
        : "unknown"
      : item.oil_level;
  const nextType =
    foodNameChanged && resolution?.status === "matched" ? resolution.profile.kind : item.type;
  const needsConfirmation: boolean = foodNameChanged ? true : item.needs_confirmation;

  return {
    ...item,
    ...updates,
    type: nextType,
    oil_level: nextOilLevel,
    needs_confirmation: needsConfirmation,
    portion_text: changedFields.includes("estimated_grams")
      ? `${nextEstimatedGrams} 克（用户修改）`
      : item.portion_text,
    assumptions: [],
    confirmation_acknowledged: needsConfirmation ? false : item.confirmation_acknowledged,
    edited_fields: editedFields,
    review_metadata_basis: "client-reported",
  };
}

export function acknowledgeNutritionItem(item: NutritionInputItem): NutritionInputItem {
  return {
    ...item,
    confirmation_acknowledged: true,
    review_metadata_basis: "client-reported",
  };
}

export function assertNutritionItemsReady(items: NutritionInputItem[]): void {
  const pendingFoodNames: string[] = items
    .filter(
      (item: NutritionInputItem) =>
        item.needs_confirmation && !item.confirmation_acknowledged,
    )
    .map((item: NutritionInputItem) => item.food_name);
  if (pendingFoodNames.length > 0) {
    throw new NutritionConfirmationError(pendingFoodNames);
  }
}

export function getNutritionFieldProvenance(
  item: NutritionInputItem,
): NutritionFieldProvenance {
  const editedFields: Set<EditableNutritionField> = new Set(item.edited_fields);
  return {
    food_name: editedFields.has("food_name") ? "user" : "analysis",
    estimated_grams: editedFields.has("estimated_grams") ? "user" : "analysis",
    oil_level: editedFields.has("oil_level")
      ? "user"
      : editedFields.has("food_name")
        ? "review-derived"
        : "analysis",
  };
}
