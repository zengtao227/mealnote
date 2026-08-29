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

  it("keeps plain rice and glutinous rice as distinct exact authorities", () => {
    const plainRice = resolveFoodProfile("米饭");
    const glutinousRice = resolveFoodProfile("糯米饭");

    expect(plainRice.status).toBe("matched");
    expect(glutinousRice.status).toBe("matched");
    if (plainRice.status === "matched" && glutinousRice.status === "matched") {
      expect(plainRice.profile.canonical_name).toBe("米饭");
      expect(glutinousRice.profile.canonical_name).toBe("糯米饭");
      expect(glutinousRice.profile).toMatchObject({
        kcal_per_100g: 188,
        protein_per_100g: 3.5,
        fat_per_100g: 0.5,
        carbs_per_100g: 43.9,
        source_type: "trusted-table",
        source_ref:
          "日本食品標準成分表（八訂）増補2023年，食品番号01154，精白もち米・炊飯：https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01154_7",
      });
    }
  });

  it("does not authorize unreviewed regional glutinous-rice aliases", () => {
    expect(resolveFoodProfile("江米饭")).toEqual({ status: "unmatched" });
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

  it("discovers the new canonical glutinous-rice entry without changing exact authority", () => {
    const results = searchFoodProfiles("糯米");

    expect(results.map((result) => result.profile.canonical_name)).toEqual(["糯米饭"]);
    expect(resolveFoodProfile("糯米")).toEqual({ status: "unmatched" });
  });

  it("returns no addable result for an unknown query", () => {
    expect(searchFoodProfiles("妈妈的拿手菜")).toEqual([]);
  });

  it("bounds empty-query discovery results", () => {
    expect(searchFoodProfiles("", 3)).toHaveLength(3);
    expect(searchFoodProfiles("", 0)).toEqual([]);
  });
});
