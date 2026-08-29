import type { FoodKind } from "@/lib/ai/meal-analysis-schema";
import { CATALOG_SUBSTRING_REGRESSIONS } from "@/lib/nutrition/catalog-collision-regressions";
import {
  assertFoodProfileCatalogIntegrity,
  normalizeFoodProfileName,
} from "@/lib/nutrition/catalog-integrity";

export interface PortionBasis {
  bowl_grams?: number;
  piece_grams?: number;
  plate_grams?: number;
  spoon_grams?: number;
  bite_grams?: number;
}

export interface FoodProfile {
  canonical_name: string;
  /** Exact synonyms only. Do not use parent categories or recipe variants as aliases. */
  aliases: string[];
  kind: FoodKind;
  kcal_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  uncertainty_ratio: number;
  source_type: "trusted-table" | "standard-recipe";
  source_ref: string;
  default_grams: number;
  portion_basis: PortionBasis;
}

export interface MatchedFoodProfileResolution {
  status: "matched";
  profile: FoodProfile;
  matched_name: string;
  matched_by: "canonical_name" | "alias";
}

export interface UnmatchedFoodProfileResolution {
  status: "unmatched";
}

export interface AmbiguousFoodProfileResolution {
  status: "ambiguous";
  candidates: string[];
}

export type FoodProfileResolution =
  | MatchedFoodProfileResolution
  | UnmatchedFoodProfileResolution
  | AmbiguousFoodProfileResolution;

export interface FoodProfileSearchResult {
  profile: FoodProfile;
  matched_name: string;
  matched_by: "canonical_name" | "alias";
}

export const FOOD_PROFILES: FoodProfile[] = [
  {
    canonical_name: "米饭",
    aliases: ["白米饭"],
    kind: "food",
    kcal_per_100g: 116,
    protein_per_100g: 2.6,
    fat_per_100g: 0.3,
    carbs_per_100g: 25.9,
    uncertainty_ratio: 0.08,
    source_type: "trusted-table",
    source_ref: "V1 demo seed；上线前按《中国食物成分表》版本复核",
    default_grams: 150,
    portion_basis: { bowl_grams: 200, spoon_grams: 15, bite_grams: 18 },
  },
  {
    canonical_name: "番茄炒蛋",
    aliases: ["西红柿炒鸡蛋", "番茄炒鸡蛋"],
    kind: "recipe",
    kcal_per_100g: 120,
    protein_per_100g: 5.2,
    fat_per_100g: 8,
    carbs_per_100g: 7.4,
    uncertainty_ratio: 0.2,
    source_type: "standard-recipe",
    source_ref: "V1 标准家常菜模型；待实测菜谱校准",
    default_grams: 150,
    portion_basis: { plate_grams: 360, spoon_grams: 25, bite_grams: 20 },
  },
  {
    canonical_name: "红烧排骨",
    aliases: [],
    kind: "recipe",
    kcal_per_100g: 260,
    protein_per_100g: 18,
    fat_per_100g: 20,
    carbs_per_100g: 5,
    uncertainty_ratio: 0.22,
    source_type: "standard-recipe",
    source_ref: "V1 标准家常菜模型；可食部和酱汁待校准",
    default_grams: 100,
    portion_basis: { piece_grams: 28, plate_grams: 320, bite_grams: 22 },
  },
  {
    canonical_name: "冬瓜汤",
    aliases: [],
    kind: "recipe",
    kcal_per_100g: 20,
    protein_per_100g: 1,
    fat_per_100g: 0.8,
    carbs_per_100g: 2.3,
    uncertainty_ratio: 0.18,
    source_type: "standard-recipe",
    source_ref: "V1 清汤模型；配料和用油待确认",
    default_grams: 220,
    portion_basis: { bowl_grams: 240, spoon_grams: 15 },
  },
  {
    canonical_name: "饺子",
    aliases: ["水饺"],
    kind: "food",
    kcal_per_100g: 210,
    protein_per_100g: 9,
    fat_per_100g: 8,
    carbs_per_100g: 25,
    uncertainty_ratio: 0.15,
    source_type: "trusted-table",
    source_ref: "V1 通用饺子条目；馅料差异待确认",
    default_grams: 200,
    portion_basis: { piece_grams: 25, plate_grams: 300 },
  },
  {
    canonical_name: "汤面",
    aliases: [],
    kind: "recipe",
    kcal_per_100g: 105,
    protein_per_100g: 4.5,
    fat_per_100g: 2.7,
    carbs_per_100g: 16,
    uncertainty_ratio: 0.2,
    source_type: "standard-recipe",
    source_ref: "V1 汤面模型；面汤比例和浇头待确认",
    default_grams: 420,
    portion_basis: { bowl_grams: 420, bite_grams: 22 },
  },
  {
    canonical_name: "宫保鸡丁",
    aliases: [],
    kind: "recipe",
    kcal_per_100g: 180,
    protein_per_100g: 12,
    fat_per_100g: 12,
    carbs_per_100g: 8,
    uncertainty_ratio: 0.25,
    source_type: "standard-recipe",
    source_ref: "V1 标准菜谱模型；花生、糖和油量待确认",
    default_grams: 160,
    portion_basis: { plate_grams: 360, spoon_grams: 25, bite_grams: 20 },
  },
];

assertFoodProfileCatalogIntegrity(FOOD_PROFILES, CATALOG_SUBSTRING_REGRESSIONS);

function getSearchMatchRank(
  normalizedName: string,
  normalizedQuery: string,
  matchedBy: FoodProfileSearchResult["matched_by"],
): number | undefined {
  if (normalizedQuery.length === 0) {
    return matchedBy === "canonical_name" ? 0 : undefined;
  }
  if (normalizedName === normalizedQuery) {
    return 0;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 1;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 2;
  }
  return undefined;
}

export function searchFoodProfiles(
  query: string,
  limit: number = 8,
): FoodProfileSearchResult[] {
  const normalizedQuery: string = normalizeFoodProfileName(query);
  const boundedLimit: number = Number.isFinite(limit)
    ? Math.max(0, Math.min(20, Math.floor(limit)))
    : 0;
  if (boundedLimit === 0) {
    return [];
  }

  const rankedResults: Array<FoodProfileSearchResult & { rank: number }> = [];
  for (const profile of FOOD_PROFILES) {
    const searchableNames: Array<{
      value: string;
      matched_by: FoodProfileSearchResult["matched_by"];
    }> = [
      { value: profile.canonical_name, matched_by: "canonical_name" },
      ...profile.aliases.map((alias: string) => ({ value: alias, matched_by: "alias" as const })),
    ];

    let bestMatch:
      | { value: string; matched_by: FoodProfileSearchResult["matched_by"]; rank: number }
      | undefined;
    for (const name of searchableNames) {
      const normalizedName: string = normalizeFoodProfileName(name.value);
      const rank: number | undefined = getSearchMatchRank(
        normalizedName,
        normalizedQuery,
        name.matched_by,
      );
      if (rank === undefined || (bestMatch && rank >= bestMatch.rank)) {
        continue;
      }
      bestMatch = { ...name, rank };
    }

    if (bestMatch) {
      rankedResults.push({
        profile,
        matched_name: bestMatch.value,
        matched_by: bestMatch.matched_by,
        rank: bestMatch.rank,
      });
    }
  }

  return rankedResults
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.profile.canonical_name.localeCompare(right.profile.canonical_name, "zh-CN"),
    )
    .slice(0, boundedLimit)
    .map(
      (result): FoodProfileSearchResult => ({
        profile: result.profile,
        matched_name: result.matched_name,
        matched_by: result.matched_by,
      }),
    );
}

export function resolveFoodProfile(foodName: string): FoodProfileResolution {
  const normalizedName: string = normalizeFoodProfileName(foodName);
  if (!normalizedName) {
    return { status: "unmatched" };
  }

  const matches: MatchedFoodProfileResolution[] = [];
  for (const profile of FOOD_PROFILES) {
    if (normalizeFoodProfileName(profile.canonical_name) === normalizedName) {
      matches.push({
        status: "matched",
        profile,
        matched_name: profile.canonical_name,
        matched_by: "canonical_name",
      });
      continue;
    }

    const matchedAlias: string | undefined = profile.aliases.find(
      (alias: string) => normalizeFoodProfileName(alias) === normalizedName,
    );
    if (matchedAlias) {
      matches.push({
        status: "matched",
        profile,
        matched_name: matchedAlias,
        matched_by: "alias",
      });
    }
  }

  if (matches.length === 0) {
    return { status: "unmatched" };
  }
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      candidates: matches.map(
        (match: MatchedFoodProfileResolution) => match.profile.canonical_name,
      ),
    };
  }

  return matches[0];
}
