import { z } from "zod";
import { inputSourceSchema, oilLevelSchema } from "@/lib/ai/meal-analysis-schema";

const PROFILE_KEY = "mealnote-demo-profile";
const MEALS_KEY_PREFIX = "mealnote-demo-meals";
export const LOCAL_MEAL_STORAGE_SCHEMA_VERSION = 1 as const;

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LocalPersistenceErrorCode =
  | "read-failed"
  | "write-failed"
  | "invalid-data"
  | "unsupported-version";

export class LocalPersistenceError extends Error {
  readonly code: LocalPersistenceErrorCode;

  constructor(code: LocalPersistenceErrorCode, message: string) {
    super(message);
    this.name = "LocalPersistenceError";
    this.code = code;
  }
}

const profileNameSchema = z
  .string()
  .min(1)
  .max(30)
  .refine((value: string) => value.trim() === value, "profile must already be normalized");

const finiteNonNegativeNumberSchema = z.number().finite().nonnegative();
const nutrientTotalsSchema = z
  .object({
    kcal: finiteNonNegativeNumberSchema,
    protein: finiteNonNegativeNumberSchema,
    fat: finiteNonNegativeNumberSchema,
    carbs: finiteNonNegativeNumberSchema,
  })
  .strict();

const fieldProvenanceSchema = z
  .object({
    food_name: z.enum(["analysis", "user", "review-derived"]),
    estimated_grams: z.enum(["analysis", "user", "review-derived"]),
    oil_level: z.enum(["analysis", "user", "review-derived"]),
  })
  .strict();

const savedNutritionItemSchema = z
  .object({
    food_name: z.string().min(1).max(80),
    matched_profile_name: z.string().min(1).max(80),
    matched_by: z.enum(["canonical_name", "alias"]),
    estimated_grams: z.number().finite().positive().max(5000),
    oil_level: oilLevelSchema,
    recognition_confidence: z.number().finite().min(0).max(1),
    recognition_source: inputSourceSchema,
    recognition_metadata_verification: z.literal("client-reported"),
    field_provenance: fieldProvenanceSchema,
    field_provenance_verification: z.literal("client-reported"),
    confirmation_required: z.boolean(),
    confirmation_acknowledged: z.boolean(),
    confirmation_verification: z.literal("client-reported"),
    source_type: z.enum(["trusted-table", "standard-recipe"]),
    source_ref: z.string().min(1).max(1000),
    nutrients: nutrientTotalsSchema,
    kcal_low: finiteNonNegativeNumberSchema,
    kcal_high: finiteNonNegativeNumberSchema,
  })
  .strict()
  .refine((value) => value.kcal_low <= value.kcal_high, {
    message: "invalid nutrition range",
  });

const savedNutritionResultSchema = z
  .object({
    items: z.array(savedNutritionItemSchema).min(1).max(20),
    totals: nutrientTotalsSchema,
    kcal_low: finiteNonNegativeNumberSchema,
    kcal_high: finiteNonNegativeNumberSchema,
    recognition_confidence: z.number().finite().min(0).max(1),
    recognition_confidence_verification: z.literal("client-reported"),
    explanation: z.string().min(1).max(4000),
  })
  .strict()
  .refine((value) => value.kcal_low <= value.kcal_high, {
    message: "invalid meal nutrition range",
  });

const canonicalIsoDateSchema = z.string().refine((value: string) => {
  const parsedDate = new Date(value);
  return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString() === value;
}, "invalid canonical ISO date");

export const savedMealSchema = z
  .object({
    id: z.string().min(1).max(100),
    created_at: canonicalIsoDateSchema,
    input_text: z.string().max(1000),
    nutrition: savedNutritionResultSchema,
  })
  .strict();

const legacySavedMealsSchema = z.array(savedMealSchema);

export const localMealStorageEnvelopeSchema = z
  .object({
    schema_version: z.literal(LOCAL_MEAL_STORAGE_SCHEMA_VERSION),
    meals: z.array(savedMealSchema),
  })
  .strict();

export type SavedMeal = z.infer<typeof savedMealSchema>;

export function mealsKeyForProfile(profileName: string): string {
  return `${MEALS_KEY_PREFIX}:${encodeURIComponent(profileName)}`;
}

function readStorageValue(storage: LocalStorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    throw new LocalPersistenceError(
      "read-failed",
      "无法读取这台设备上的本地记录。请检查浏览器存储权限后重试。",
    );
  }
}

function writeStorageValue(storage: LocalStorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    throw new LocalPersistenceError(
      "write-failed",
      "保存失败，本餐内容仍保留。请检查浏览器存储空间或权限后重试。",
    );
  }
}

export function readLocalProfileName(storage: LocalStorageLike): string | null {
  const storedProfile = readStorageValue(storage, PROFILE_KEY);
  if (storedProfile === null) {
    return null;
  }
  const parsedProfile = profileNameSchema.safeParse(storedProfile);
  if (!parsedProfile.success) {
    throw new LocalPersistenceError(
      "invalid-data",
      "本机登录信息格式不正确，已停止载入。请重新进入本地演示。",
    );
  }
  return parsedProfile.data;
}

export function writeLocalProfileName(storage: LocalStorageLike, profileName: string): void {
  const parsedProfile = profileNameSchema.safeParse(profileName);
  if (!parsedProfile.success) {
    throw new LocalPersistenceError("invalid-data", "本地演示昵称格式不正确。请重新输入。 ");
  }
  writeStorageValue(storage, PROFILE_KEY, parsedProfile.data);
}

export function removeLocalProfileName(storage: LocalStorageLike): void {
  try {
    storage.removeItem(PROFILE_KEY);
  } catch {
    throw new LocalPersistenceError(
      "write-failed",
      "无法退出本地演示。请检查浏览器存储权限后重试。",
    );
  }
}

export function parseSavedMeals(rawValue: string | null): SavedMeal[] {
  if (rawValue === null) {
    return [];
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(rawValue) as unknown;
  } catch {
    throw new LocalPersistenceError(
      "invalid-data",
      "本机已有记录不是有效数据，已停止载入且不会覆盖。",
    );
  }

  if (Array.isArray(parsedValue)) {
    const parsedLegacyMeals = legacySavedMealsSchema.safeParse(parsedValue);
    if (!parsedLegacyMeals.success) {
      throw new LocalPersistenceError(
        "invalid-data",
        "本机已有旧版记录结构不正确，已停止载入且不会覆盖。",
      );
    }
    return parsedLegacyMeals.data;
  }

  if (
    typeof parsedValue === "object" &&
    parsedValue !== null &&
    "schema_version" in parsedValue &&
    (parsedValue as { schema_version?: unknown }).schema_version !== LOCAL_MEAL_STORAGE_SCHEMA_VERSION
  ) {
    throw new LocalPersistenceError(
      "unsupported-version",
      "本机记录来自当前版本无法识别的格式，已停止载入且不会覆盖。",
    );
  }

  const parsedEnvelope = localMealStorageEnvelopeSchema.safeParse(parsedValue);
  if (!parsedEnvelope.success) {
    throw new LocalPersistenceError(
      "invalid-data",
      "本机已有记录结构不正确，已停止载入且不会覆盖。",
    );
  }
  return parsedEnvelope.data.meals;
}

export function readSavedMeals(storage: LocalStorageLike, profileName: string): SavedMeal[] {
  return parseSavedMeals(readStorageValue(storage, mealsKeyForProfile(profileName)));
}

export function writeSavedMeals(
  storage: LocalStorageLike,
  profileName: string,
  meals: readonly SavedMeal[],
): void {
  const envelope = localMealStorageEnvelopeSchema.safeParse({
    schema_version: LOCAL_MEAL_STORAGE_SCHEMA_VERSION,
    meals,
  });
  if (!envelope.success) {
    throw new LocalPersistenceError(
      "invalid-data",
      "当前餐食数据无法安全保存。请保留本餐并重新计算后重试。",
    );
  }
  writeStorageValue(
    storage,
    mealsKeyForProfile(profileName),
    JSON.stringify(envelope.data),
  );
}

export function localPersistenceErrorMessage(error: unknown): string {
  return error instanceof LocalPersistenceError
    ? error.message
    : "本地存储操作失败，本餐内容仍保留。请重试。";
}
