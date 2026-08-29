import { describe, expect, it } from "vitest";
import {
  resolveFoodProfile,
  searchFoodProfiles,
} from "@/lib/nutrition/food-database";

describe("resolveFoodProfile", () => {
  it("matches an exact canonical name", () => {
    const resolution = resolveFoodProfile("红烧排骨");

    expect(resolution.status).toBe("matched");
    if (resolution.status === "matched") {
      expect(resolution.profile.canonical_name).toBe("红烧排骨");
      expect(resolution.matched_by).toBe("canonical_name");
    }
  });

  it("matches curated exact synonyms after safe normalization", () => {
    const resolution = resolveFoodProfile("  白米饭  ");

    expect(resolution.status).toBe("matched");
    if (resolution.status === "matched") {
      expect(resolution.profile.canonical_name).toBe("米饭");
      expect(resolution.matched_by).toBe("alias");
    }
  });

  it("does not authorize a recipe variant through substring matching", () => {
    expect(resolveFoodProfile("蒜香排骨")).toEqual({ status: "unmatched" });
  });

  it("does not promote a broad ingredient name into a specific recipe", () => {
    expect(resolveFoodProfile("排骨")).toEqual({ status: "unmatched" });
    expect(resolveFoodProfile("牛肉面")).toEqual({ status: "unmatched" });
    expect(resolveFoodProfile("面条")).toEqual({ status: "unmatched" });
  });

  it("leaves unknown home recipes unresolved instead of returning a demo fallback", () => {
    expect(resolveFoodProfile("妈妈的拿手菜")).toEqual({ status: "unmatched" });
  });
});

describe("searchFoodProfiles", () => {
  it("finds canonical names without granting fuzzy resolution authority", () => {
    const results = searchFoodProfiles("排骨");

    expect(results.map((result) => result.profile.canonical_name)).toEqual(["红烧排骨"]);
    expect(resolveFoodProfile("排骨")).toEqual({ status: "unmatched" });
  });

  it("uses curated aliases for discovery and returns the canonical profile", () => {
    const results = searchFoodProfiles("西红柿");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      matched_name: "西红柿炒鸡蛋",
      matched_by: "alias",
      profile: { canonical_name: "番茄炒蛋" },
    });
  });

  it("returns no addable result for an unknown query", () => {
    expect(searchFoodProfiles("妈妈的拿手菜")).toEqual([]);
  });

  it("bounds empty-query discovery results", () => {
    expect(searchFoodProfiles("", 3)).toHaveLength(3);
    expect(searchFoodProfiles("", 0)).toEqual([]);
  });
});
