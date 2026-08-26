import { describe, expect, it } from "vitest";
import type { MealItemAnalysis } from "@/lib/ai/meal-analysis-schema";
import { POST } from "@/app/api/nutrition/calculate/route";
import {
  acknowledgeNutritionItem,
  createNutritionInputItem,
} from "@/lib/nutrition/review";

const riceAnalysis: MealItemAnalysis = {
  food_name: "米饭",
  portion_text: "半碗",
  estimated_grams: 100,
  oil_level: "none",
  confidence: 0.9,
  source: "text",
  type: "food",
  assumptions: ["一碗按 200 克"],
  needs_confirmation: false,
};

function nutritionRequest(items: unknown[]): Request {
  return new Request("http://localhost/api/nutrition/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

describe("POST /api/nutrition/calculate", () => {
  it("returns 422 while a required confirmation is still pending", async () => {
    const pending = createNutritionInputItem({
      ...riceAnalysis,
      needs_confirmation: true,
    });

    const response = await POST(nutritionRequest([pending]));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(422);
    expect(body.error).toContain("明确确认");
  });

  it("returns 422 for an unresolved food instead of calculating a fallback", async () => {
    const unknown = createNutritionInputItem({
      ...riceAnalysis,
      food_name: "妈妈的拿手菜",
      type: "recipe",
      oil_level: "unknown",
    });

    const response = await POST(nutritionRequest([unknown]));
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(422);
    expect(body.error).toContain("未匹配到可信营养条目");
  });

  it("returns trusted-table nutrition while marking review provenance as client reported", async () => {
    const confirmed = acknowledgeNutritionItem(
      createNutritionInputItem({ ...riceAnalysis, needs_confirmation: true }),
    );

    const response = await POST(nutritionRequest([confirmed]));
    const body = (await response.json()) as {
      nutrition?: {
        totals: { kcal: number };
        recognition_confidence_verification: string;
        items: Array<{
          matched_profile_name: string;
          recognition_metadata_verification: string;
          field_provenance_verification: string;
          confirmation_verification: string;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.nutrition?.totals.kcal).toBe(116);
    expect(body.nutrition?.items[0].matched_profile_name).toBe("米饭");
    expect(body.nutrition?.recognition_confidence_verification).toBe("client-reported");
    expect(body.nutrition?.items[0]).toMatchObject({
      recognition_metadata_verification: "client-reported",
      field_provenance_verification: "client-reported",
      confirmation_verification: "client-reported",
    });
  });

  it("does not present tampered direct-API provenance or recognition metadata as verified", async () => {
    const tampered = {
      ...createNutritionInputItem(riceAnalysis),
      food_name: "白米饭",
      estimated_grams: 500,
      source: "image",
      confidence: 1,
      edited_fields: [],
      confirmation_acknowledged: true,
      review_metadata_basis: "client-reported" as const,
    };

    const response = await POST(nutritionRequest([tampered]));
    const body = (await response.json()) as {
      nutrition?: {
        totals: { kcal: number };
        explanation: string;
        items: Array<{
          recognition_source: string;
          recognition_confidence: number;
          recognition_metadata_verification: string;
          field_provenance: Record<string, string>;
          field_provenance_verification: string;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.nutrition?.totals.kcal).toBe(580);
    expect(body.nutrition?.items[0]).toMatchObject({
      recognition_source: "image",
      recognition_confidence: 1,
      recognition_metadata_verification: "client-reported",
      field_provenance: {
        food_name: "analysis",
        estimated_grams: "analysis",
        oil_level: "analysis",
      },
      field_provenance_verification: "client-reported",
    });
    expect(body.nutrition?.explanation).toContain("尚未与服务端原始分析绑定");
    expect(body.nutrition?.explanation).toContain("不作为已验证审计来源");
  });

  it("rejects reviewed payloads that omit the client-reported metadata basis", async () => {
    const withoutBasis: Record<string, unknown> = {
      ...createNutritionInputItem(riceAnalysis),
    };
    delete withoutBasis.review_metadata_basis;

    const response = await POST(nutritionRequest([withoutBasis]));

    expect(response.status).toBe(400);
  });
});