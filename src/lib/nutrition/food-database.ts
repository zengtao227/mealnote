import type { FoodKind } from "@/lib/ai/meal-analysis-schema";

export interface PortionBasis {
  bowl_grams?: number;
  piece_grams?: number;
  plate_grams?: number;
  spoon_grams?: number;
  bite_grams?: number;
}

export interface FoodProfile {
  canonical_name: string;
  aliases: string[];
  kind: FoodKind;
  kcal_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  uncertainty_ratio: number;
  source_type: "trusted-table" | "standard-recipe" | "demo-fallback";
  source_ref: string;
  default_grams: number;
  portion_basis: PortionBasis;
}

export const FOOD_PROFILES: FoodProfile[] = [
  {
    canonical_name: "米饭",
    aliases: ["白米饭", "米饭"],
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
    aliases: ["西红柿炒鸡蛋", "番茄炒鸡蛋", "番茄炒蛋"],
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
    aliases: ["排骨", "红烧排骨"],
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
    aliases: ["冬瓜汤"],
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
    aliases: ["水饺", "饺子"],
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
    aliases: ["牛肉面", "汤面", "面条"],
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
    aliases: ["宫保鸡丁"],
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

export const GENERIC_RECIPE_PROFILE: FoodProfile = {
  canonical_name: "通用家常菜估算",
  aliases: [],
  kind: "recipe",
  kcal_per_100g: 150,
  protein_per_100g: 8,
  fat_per_100g: 9,
  carbs_per_100g: 10,
  uncertainty_ratio: 0.4,
  source_type: "demo-fallback",
  source_ref: "仅用于 V1 演示；保存前应替换为真实食物或菜谱",
  default_grams: 150,
  portion_basis: { plate_grams: 350, spoon_grams: 25, bite_grams: 20 },
};

export function findFoodProfile(foodName: string): FoodProfile {
  const normalizedName: string = foodName.trim().toLowerCase();
  return (
    FOOD_PROFILES.find((profile: FoodProfile) =>
      [profile.canonical_name, ...profile.aliases].some((alias: string) =>
        normalizedName.includes(alias.toLowerCase()),
      ),
    ) ?? GENERIC_RECIPE_PROFILE
  );
}
