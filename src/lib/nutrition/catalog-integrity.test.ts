import { describe, expect, it } from "vitest";
import {
  analyzeWithHeuristics,
  KNOWN_MENTION_JOINERS,
} from "@/lib/ai/heuristic-provider";
import type { MealAnalysis } from "@/lib/ai/meal-analysis-schema";
import { CATALOG_SUBSTRING_REGRESSIONS } from "@/lib/nutrition/catalog-collision-regressions";
import {
  assertFoodProfileCatalogIntegrity,
  catalogSubstringCollisionKey,
  findCatalogSubstringCollisions,
  type CatalogSubstringCollision,
  type CatalogSubstringRegression,
  FoodProfileCatalogIntegrityError,
} from "@/lib/nutrition/catalog-integrity";
import {
  FOOD_PROFILES,
  type FoodProfile,
} from "@/lib/nutrition/food-database";

function createProfile(canonicalName: string, aliases: string[] = []): FoodProfile {
  return {
    canonical_name: canonicalName,
    aliases,
    kind: "food",
    kcal_per_100g: 100,
    protein_per_100g: 1,
    fat_per_100g: 1,
    carbs_per_100g: 1,
    uncertainty_ratio: 0.1,
    source_type: "trusted-table",
    source_ref: "catalog collision test fixture",
    default_grams: 100,
    portion_basis: {},
  };
}

function createRegression(collision: CatalogSubstringCollision): CatalogSubstringRegression {
  return {
    ...collision,
    unenumerated_connector: "配着",
  };
}

describe("food profile catalog integrity", () => {
  it("keeps the current production catalog collision-free and covered", () => {
    expect(findCatalogSubstringCollisions(FOOD_PROFILES)).toEqual([]);
    expect(CATALOG_SUBSTRING_REGRESSIONS).toEqual([]);
    expect(() =>
      assertFoodProfileCatalogIntegrity(FOOD_PROFILES, CATALOG_SUBSTRING_REGRESSIONS),
    ).not.toThrow();
  });

  it("detects normalized cross-profile canonical and alias substring relationships", () => {
    const profiles: FoodProfile[] = [
      createProfile(" Rice "),
      createProfile("粥", ["white ＲＩＣＥ porridge"]),
    ];
    const collisions: CatalogSubstringCollision[] = findCatalogSubstringCollisions(profiles);

    expect(collisions).toEqual([
      {
        shorter: {
          profile_name: " Rice ",
          name: " Rice ",
          source: "canonical_name",
        },
        longer: {
          profile_name: "粥",
          name: "white ＲＩＣＥ porridge",
          source: "alias",
        },
      },
    ]);
  });

  it("rejects an uncovered strict substring collision", () => {
    const profiles: FoodProfile[] = [createProfile("米饭"), createProfile("糯米饭")];

    expect(() => assertFoodProfileCatalogIntegrity(profiles, [])).toThrow(
      /missing mention-span regression for substring collision/,
    );
  });

  it("accepts one exact regression declaration for a strict substring collision", () => {
    const profiles: FoodProfile[] = [createProfile("米饭"), createProfile("糯米饭")];
    const collision: CatalogSubstringCollision = findCatalogSubstringCollisions(profiles)[0];

    expect(() =>
      assertFoodProfileCatalogIntegrity(profiles, [createRegression(collision)]),
    ).not.toThrow();
  });

  it("rejects cross-profile exact authority collisions even when declared", () => {
    const profiles: FoodProfile[] = [
      createProfile("Rice"),
      createProfile("粥", ["ＲＩＣＥ"]),
    ];
    const impossibleRegression: CatalogSubstringRegression = {
      shorter: {
        profile_name: "Rice",
        name: "Rice",
        source: "canonical_name",
      },
      longer: {
        profile_name: "粥",
        name: "ＲＩＣＥ",
        source: "alias",
      },
      unenumerated_connector: "配着",
    };

    expect(() =>
      assertFoodProfileCatalogIntegrity(profiles, [impossibleRegression]),
    ).toThrow(/exact cross-profile authority collision/);
  });

  it("rejects duplicate names inside one profile", () => {
    const profiles: FoodProfile[] = [createProfile("Rice", [" ＲＩＣＥ "])];

    expect(() => assertFoodProfileCatalogIntegrity(profiles, [])).toThrow(
      /duplicate normalized name within one profile/,
    );
  });

  it("rejects duplicate and stale regression declarations", () => {
    const profiles: FoodProfile[] = [createProfile("米饭"), createProfile("糯米饭")];
    const collision: CatalogSubstringCollision = findCatalogSubstringCollisions(profiles)[0];
    const regression: CatalogSubstringRegression = createRegression(collision);
    const staleRegression: CatalogSubstringRegression = {
      shorter: {
        profile_name: "米饭",
        name: "米饭",
        source: "canonical_name",
      },
      longer: {
        profile_name: "蛋炒米饭",
        name: "蛋炒米饭",
        source: "canonical_name",
      },
      unenumerated_connector: "配着",
    };

    expect(() =>
      assertFoodProfileCatalogIntegrity(profiles, [regression, regression]),
    ).toThrow(/duplicate collision regression/);
    expect(() => assertFoodProfileCatalogIntegrity(profiles, [regression, staleRegression])).toThrow(
      /stale collision regression without a current catalog collision/,
    );
  });
});

describe("catalog substring regression registry", () => {
  it("executes both name orders for every registered collision", () => {
    CATALOG_SUBSTRING_REGRESSIONS.forEach(
      (regression: CatalogSubstringRegression): void => {
        const key: string = catalogSubstringCollisionKey(regression);
        const overlapsKnownJoiner: boolean = KNOWN_MENTION_JOINERS.some(
          (joiner: string): boolean =>
            regression.unenumerated_connector.includes(joiner) ||
            joiner.includes(regression.unenumerated_connector),
        );
        expect(overlapsKnownJoiner, `${key}: connector must stay unenumerated`).toBe(false);
        const shorterFirstInput: string =
          `${regression.shorter.name}100克` +
          `${regression.unenumerated_connector}${regression.longer.name}100克`;
        const shorterFirstAnalysis: MealAnalysis = analyzeWithHeuristics({
          text: shorterFirstInput,
          source: "text",
        });
        const shorterFirstNames: string[] = shorterFirstAnalysis.items.map(
          (item): string => item.food_name,
        );

        expect(shorterFirstNames, `${key}: shorter name first`).toEqual([
          regression.shorter.profile_name,
          regression.longer.profile_name,
        ]);
        expect(
          shorterFirstAnalysis.items.map((item): string => item.portion_text),
          `${key}: shorter-first mention spans`,
        ).toEqual([`${regression.shorter.name}100克`, `${regression.longer.name}100克`]);
        expect(shorterFirstAnalysis.items.map((item): number => item.estimated_grams)).toEqual([
          100,
          100,
        ]);
        const longerFirstInput: string =
          `${regression.longer.name}100克` +
          `${regression.unenumerated_connector}${regression.shorter.name}100克`;
        const longerFirstAnalysis: MealAnalysis = analyzeWithHeuristics({
          text: longerFirstInput,
          source: "text",
        });
        const longerFirstNames: string[] = longerFirstAnalysis.items.map(
          (item): string => item.food_name,
        );

        expect(longerFirstNames, `${key}: longer name first`).toEqual([
          regression.longer.profile_name,
          regression.shorter.profile_name,
        ]);
        expect(
          longerFirstAnalysis.items.map((item): string => item.portion_text),
          `${key}: longer-first mention spans`,
        ).toEqual([`${regression.longer.name}100克`, `${regression.shorter.name}100克`]);
        expect(longerFirstAnalysis.items.map((item): number => item.estimated_grams)).toEqual([
          100,
          100,
        ]);
      },
    );
  });
});

describe("FoodProfileCatalogIntegrityError", () => {
  it("keeps deterministic issue details for CI diagnostics", () => {
    const error: FoodProfileCatalogIntegrityError = new FoodProfileCatalogIntegrityError([
      "second issue",
      "first issue",
    ]);

    expect(error.name).toBe("FoodProfileCatalogIntegrityError");
    expect(error.issues).toEqual(["second issue", "first issue"]);
    expect(error.message).toContain("second issue\n- first issue");
  });
});
