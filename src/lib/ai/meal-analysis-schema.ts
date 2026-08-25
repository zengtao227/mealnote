import { z } from "zod";

export const inputSourceSchema = z.enum(["text", "voice", "image", "mixed"]);
export const foodKindSchema = z.enum(["food", "recipe", "drink", "condiment"]);
export const oilLevelSchema = z.enum(["none", "light", "standard", "heavy", "unknown"]);

export const mealItemAnalysisSchema = z
  .object({
    food_name: z.string().trim().min(1).max(80),
    portion_text: z.string().trim().min(1).max(80),
    estimated_grams: z.number().positive().max(5000),
    oil_level: oilLevelSchema,
    confidence: z.number().min(0).max(1),
    source: inputSourceSchema,
    type: foodKindSchema,
    assumptions: z.array(z.string().trim().min(1).max(160)).max(6),
    needs_confirmation: z.boolean(),
  })
  .strict();

export const mealAnalysisSchema = z
  .object({
    schema_version: z.literal("1.0"),
    items: z.array(mealItemAnalysisSchema).min(1).max(20),
    overall_confidence: z.number().min(0).max(1),
    uncertainty_note: z.string().trim().min(1).max(240),
  })
  .strict();

export const analysisRequestSchema = z
  .object({
    text: z.string().trim().max(1000),
    source: inputSourceSchema,
    image_data_url: z.string().max(7_000_000).optional(),
  })
  .strict()
  .refine((value) => value.text.length > 0 || value.image_data_url !== undefined, {
    message: "请提供文字描述或照片。",
  });

export type InputSource = z.infer<typeof inputSourceSchema>;
export type FoodKind = z.infer<typeof foodKindSchema>;
export type OilLevel = z.infer<typeof oilLevelSchema>;
export type MealItemAnalysis = z.infer<typeof mealItemAnalysisSchema>;
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export const mealAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "items", "overall_confidence", "uncertainty_note"],
  properties: {
    schema_version: { type: "string", enum: ["1.0"] },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "food_name",
          "portion_text",
          "estimated_grams",
          "oil_level",
          "confidence",
          "source",
          "type",
          "assumptions",
          "needs_confirmation",
        ],
        properties: {
          food_name: { type: "string" },
          portion_text: { type: "string" },
          estimated_grams: { type: "number", exclusiveMinimum: 0, maximum: 5000 },
          oil_level: { type: "string", enum: oilLevelSchema.options },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source: { type: "string", enum: inputSourceSchema.options },
          type: { type: "string", enum: foodKindSchema.options },
          assumptions: { type: "array", maxItems: 6, items: { type: "string" } },
          needs_confirmation: { type: "boolean" },
        },
      },
    },
    overall_confidence: { type: "number", minimum: 0, maximum: 1 },
    uncertainty_note: { type: "string" },
  },
} as const;
