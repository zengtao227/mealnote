import type { CatalogSubstringRegression } from "@/lib/nutrition/catalog-integrity";

/**
 * Every cross-profile substring relationship in FOOD_PROFILES must have one entry here.
 * The catalog-integrity test turns each entry into two real heuristic inputs, one per order.
 */
export const CATALOG_SUBSTRING_REGRESSIONS: readonly CatalogSubstringRegression[] = [
  {
    shorter: {
      profile_name: "米饭",
      name: "米饭",
      source: "canonical_name",
    },
    longer: {
      profile_name: "糯米饭",
      name: "糯米饭",
      source: "canonical_name",
    },
    unenumerated_connector: "配着",
  },
];
