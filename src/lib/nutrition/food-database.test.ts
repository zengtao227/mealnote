import { describe, expect, it } from "vitest";
import { resolveFoodProfile } from "@/lib/nutrition/food-database";

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
