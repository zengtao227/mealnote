import { describe, expect, it } from "vitest";
import {
  LOCAL_MEAL_STORAGE_SCHEMA_VERSION,
  LocalPersistenceError,
  type LocalStorageLike,
  type SavedMeal,
  localPersistenceErrorMessage,
  mealsKeyForProfile,
  parseSavedMeals,
  readSavedMeals,
  writeSavedMeals,
} from "@/lib/storage/local-meal-storage";

class FakeStorage implements LocalStorageLike {
  readonly values = new Map<string, string>();
  getFailure: unknown;
  setFailure: unknown;
  removeFailure: unknown;

  getItem(key: string): string | null {
    if (this.getFailure) {
      throw this.getFailure;
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.setFailure) {
      throw this.setFailure;
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    if (this.removeFailure) {
      throw this.removeFailure;
    }
    this.values.delete(key);
  }
}

const validMeal: SavedMeal = {
  id: "meal-1",
  created_at: "2026-08-26T12:00:00.000Z",
  input_text: "半碗米饭",
  nutrition: {
    items: [
      {
        food_name: "米饭",
        matched_profile_name: "米饭",
        matched_by: "canonical_name",
        estimated_grams: 100,
        oil_level: "none",
        recognition_confidence: 0.9,
        recognition_source: "text",
        recognition_metadata_verification: "client-reported",
        field_provenance: {
          food_name: "analysis",
          estimated_grams: "analysis",
          oil_level: "analysis",
        },
        field_provenance_verification: "client-reported",
        confirmation_required: false,
        confirmation_acknowledged: true,
        confirmation_verification: "client-reported",
        source_type: "trusted-table",
        source_ref: "test fixture",
        nutrients: { kcal: 116, protein: 2.6, fat: 0.3, carbs: 25.9 },
        kcal_low: 107,
        kcal_high: 125,
      },
    ],
    totals: { kcal: 116, protein: 2.6, fat: 0.3, carbs: 25.9 },
    kcal_low: 107,
    kcal_high: 125,
    recognition_confidence: 0.9,
    recognition_confidence_verification: "client-reported",
    explanation: "test nutrition snapshot",
  },
};

function envelopeFor(meal: SavedMeal = validMeal): string {
  return JSON.stringify({
    schema_version: LOCAL_MEAL_STORAGE_SCHEMA_VERSION,
    meals: [meal],
  });
}

describe("local meal storage", () => {
  it("writes and reads the V1 envelope", () => {
    const storage = new FakeStorage();
    writeSavedMeals(storage, "alice", [validMeal]);

    const raw = storage.values.get(mealsKeyForProfile("alice"));
    expect(raw).toBeDefined();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ schema_version: 1 });
    expect(readSavedMeals(storage, "alice")).toEqual([validMeal]);
  });

  it("reads a valid base-version raw array and lazily migrates it on the next successful save", () => {
    const storage = new FakeStorage();
    const key = mealsKeyForProfile("alice");
    storage.values.set(key, JSON.stringify([validMeal]));

    const legacyMeals = readSavedMeals(storage, "alice");
    expect(legacyMeals).toEqual([validMeal]);

    const newMeal: SavedMeal = {
      ...validMeal,
      id: "meal-2",
      created_at: "2026-08-26T13:00:00.000Z",
      input_text: "一碗米饭",
    };
    writeSavedMeals(storage, "alice", [newMeal, ...legacyMeals]);

    const migratedRaw = storage.values.get(key);
    expect(JSON.parse(migratedRaw ?? "{}")).toEqual({
      schema_version: LOCAL_MEAL_STORAGE_SCHEMA_VERSION,
      meals: [newMeal, validMeal],
    });
    expect(readSavedMeals(storage, "alice")).toEqual([newMeal, validMeal]);
  });

  it("leaves valid legacy bytes unchanged when a lazy-migration write fails", () => {
    const storage = new FakeStorage();
    const key = mealsKeyForProfile("alice");
    const legacyRaw = JSON.stringify([validMeal]);
    storage.values.set(key, legacyRaw);
    const legacyMeals = readSavedMeals(storage, "alice");
    const newMeal: SavedMeal = {
      ...validMeal,
      id: "meal-2",
      created_at: "2026-08-26T13:00:00.000Z",
      input_text: "一碗米饭",
    };
    storage.setFailure = new DOMException("quota internals", "QuotaExceededError");

    expect(() => writeSavedMeals(storage, "alice", [newMeal, ...legacyMeals])).toThrow(
      LocalPersistenceError,
    );
    expect(storage.values.get(key)).toBe(legacyRaw);
  });

  it("rejects an invalid legacy raw array instead of treating it as compatible history", () => {
    const invalidLegacyMeal = { ...validMeal, nutrition: {} };
    expect(() => parseSavedMeals(JSON.stringify([invalidLegacyMeal]))).toThrow("旧版记录结构不正确");
  });

  it("keeps the existing profile-specific key isolation", () => {
    const storage = new FakeStorage();
    writeSavedMeals(storage, "alice", [validMeal]);
    writeSavedMeals(storage, "bob", [{ ...validMeal, id: "meal-2" }]);

    expect(readSavedMeals(storage, "alice")[0]?.id).toBe("meal-1");
    expect(readSavedMeals(storage, "bob")[0]?.id).toBe("meal-2");
    expect(mealsKeyForProfile("alice")).not.toBe(mealsKeyForProfile("bob"));
  });

  it("rejects malformed JSON instead of casting it to saved meals", () => {
    expect(() => parseSavedMeals("{not-json")).toThrow("不是有效数据");
  });

  it("rejects valid JSON with the wrong structure", () => {
    expect(() => parseSavedMeals(JSON.stringify({ schema_version: 1, meals: "not-an-array" }))).toThrow(
      "结构不正确",
    );
  });

  it("rejects an unknown schema version without treating it as V1", () => {
    expect(() => parseSavedMeals(JSON.stringify({ schema_version: 2, meals: [] }))).toThrow(
      "无法识别的格式",
    );
  });

  it("rejects an invalid saved date", () => {
    const invalidDateMeal = { ...validMeal, created_at: "2026-02-30T12:00:00.000Z" };
    expect(() => parseSavedMeals(envelopeFor(invalidDateMeal as SavedMeal))).toThrow("结构不正确");
  });

  it("rejects invalid nutrition data", () => {
    const invalidNutritionMeal = {
      ...validMeal,
      nutrition: {
        ...validMeal.nutrition,
        totals: { ...validMeal.nutrition.totals, kcal: -1 },
      },
    };
    expect(() => parseSavedMeals(envelopeFor(invalidNutritionMeal as SavedMeal))).toThrow("结构不正确");
  });

  it("turns SecurityError reads into a safe user-facing error", () => {
    const storage = new FakeStorage();
    storage.getFailure = new DOMException("secret browser detail", "SecurityError");

    expect(() => readSavedMeals(storage, "alice")).toThrow(LocalPersistenceError);
    try {
      readSavedMeals(storage, "alice");
    } catch (error: unknown) {
      expect(localPersistenceErrorMessage(error)).toContain("无法读取");
      expect(localPersistenceErrorMessage(error)).not.toContain("secret browser detail");
    }
  });

  it("turns QuotaExceededError writes into a safe retryable error without mutating storage", () => {
    const storage = new FakeStorage();
    storage.setFailure = new DOMException("quota internals", "QuotaExceededError");

    expect(() => writeSavedMeals(storage, "alice", [validMeal])).toThrow(LocalPersistenceError);
    expect(storage.values.size).toBe(0);
    try {
      writeSavedMeals(storage, "alice", [validMeal]);
    } catch (error: unknown) {
      expect(localPersistenceErrorMessage(error)).toContain("本餐内容仍保留");
      expect(localPersistenceErrorMessage(error)).not.toContain("quota internals");
    }
  });
});
