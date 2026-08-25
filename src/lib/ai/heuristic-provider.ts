import type {
  AnalysisRequest,
  InputSource,
  MealAnalysis,
  MealItemAnalysis,
  OilLevel,
} from "@/lib/ai/meal-analysis-schema";
import { FOOD_PROFILES, type FoodProfile } from "@/lib/nutrition/food-database";

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseCount(rawValue: string): number | undefined {
  const numericValue: number = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  if (rawValue.length === 1) {
    return CHINESE_DIGITS[rawValue];
  }

  if (rawValue.startsWith("十")) {
    return 10 + (CHINESE_DIGITS[rawValue.slice(1)] ?? 0);
  }

  if (rawValue.includes("十")) {
    const [tens, ones] = rawValue.split("十");
    return (CHINESE_DIGITS[tens] ?? 1) * 10 + (CHINESE_DIGITS[ones] ?? 0);
  }

  return undefined;
}

function getClause(text: string, aliases: string[]): string {
  const clauses: string[] = text.split(/[，,、；;。\n]/).map((clause: string) => clause.trim());
  return clauses.find((clause: string) => aliases.some((alias: string) => clause.includes(alias))) ?? text;
}

function inferOilLevel(clause: string, profile: FoodProfile): OilLevel {
  if (profile.kind !== "recipe") {
    return "none";
  }
  if (/无油|不放油/.test(clause)) {
    return "none";
  }
  if (/少油|清淡|油少/.test(clause)) {
    return "light";
  }
  if (/重油|油大|很多油|多油/.test(clause)) {
    return "heavy";
  }
  return "unknown";
}

function inferGrams(clause: string, profile: FoodProfile): { grams: number; note: string } {
  const exactGrams: RegExpMatchArray | null = clause.match(/(\d+(?:\.\d+)?)\s*(?:g|克)/i);
  if (exactGrams) {
    return { grams: Number(exactGrams[1]), note: "使用了用户提供的克数" };
  }

  if (/一两/.test(clause)) {
    return { grams: 50, note: "按一两约 50 克换算" };
  }

  const countMatch: RegExpMatchArray | null = clause.match(/(\d+|[一二三四五六七八九十两]+)\s*(块|个|只|勺|口)/);
  if (countMatch) {
    const count: number | undefined = parseCount(countMatch[1]);
    const unit: string = countMatch[2];
    const unitGrams: number | undefined =
      unit === "勺"
        ? profile.portion_basis.spoon_grams
        : unit === "口"
          ? profile.portion_basis.bite_grams
          : profile.portion_basis.piece_grams;
    if (count !== undefined && unitGrams !== undefined) {
      return { grams: count * unitGrams, note: `按每${unit}约 ${unitGrams} 克换算` };
    }
  }

  if (/三分之一|1\s*\/\s*3/.test(clause) && profile.portion_basis.plate_grams) {
    return {
      grams: Math.round(profile.portion_basis.plate_grams / 3),
      note: `按一盘约 ${profile.portion_basis.plate_grams} 克换算`,
    };
  }

  if (/一半|半盘|二分之一|1\s*\/\s*2/.test(clause) && profile.portion_basis.plate_grams) {
    return {
      grams: Math.round(profile.portion_basis.plate_grams / 2),
      note: `按一盘约 ${profile.portion_basis.plate_grams} 克换算`,
    };
  }

  if (/半碗/.test(clause) && profile.portion_basis.bowl_grams) {
    return {
      grams: Math.round(profile.portion_basis.bowl_grams / 2),
      note: `按一碗约 ${profile.portion_basis.bowl_grams} 克换算`,
    };
  }

  if (/(?:一|1|整)碗/.test(clause) && profile.portion_basis.bowl_grams) {
    return {
      grams: profile.portion_basis.bowl_grams,
      note: `按一碗约 ${profile.portion_basis.bowl_grams} 克换算`,
    };
  }

  return { grams: profile.default_grams, note: `暂按常见份量 ${profile.default_grams} 克估算` };
}

function buildItem(text: string, profile: FoodProfile, source: InputSource): MealItemAnalysis {
  const aliases: string[] = [profile.canonical_name, ...profile.aliases];
  const clause: string = getClause(text, aliases);
  const portion: { grams: number; note: string } = inferGrams(clause, profile);
  const oilLevel: OilLevel = inferOilLevel(clause, profile);
  const needsOilConfirmation: boolean = profile.kind === "recipe" && oilLevel === "unknown";

  return {
    food_name: profile.canonical_name,
    portion_text: clause,
    estimated_grams: portion.grams,
    oil_level: oilLevel,
    confidence: needsOilConfirmation ? 0.72 : 0.86,
    source,
    type: profile.kind,
    assumptions: [portion.note, ...(needsOilConfirmation ? ["未说明油量，计算前请确认"] : [])],
    needs_confirmation: needsOilConfirmation,
  };
}

export function analyzeWithHeuristics(request: AnalysisRequest): MealAnalysis {
  const recognizedProfiles: FoodProfile[] = FOOD_PROFILES.filter((profile: FoodProfile) =>
    [profile.canonical_name, ...profile.aliases].some((alias: string) => request.text.includes(alias)),
  );

  if (recognizedProfiles.length === 0) {
    throw new Error("本地演示暂未识别出食物。请补充菜名，或配置 OpenAI API 进行图片识别。");
  }

  const uniqueProfiles: FoodProfile[] = recognizedProfiles.filter(
    (profile: FoodProfile, index: number, profiles: FoodProfile[]) =>
      profiles.findIndex((candidate: FoodProfile) => candidate.canonical_name === profile.canonical_name) === index,
  );
  const items: MealItemAnalysis[] = uniqueProfiles.map((profile: FoodProfile) =>
    buildItem(request.text, profile, request.source),
  );
  const overallConfidence: number =
    items.reduce((total: number, item: MealItemAnalysis) => total + item.confidence, 0) / items.length;

  return {
    schema_version: "1.0",
    items,
    overall_confidence: Number(overallConfidence.toFixed(2)),
    uncertainty_note: "本地演示根据中式份量词换算；家常菜用油和实际餐具大小需要你确认。",
  };
}
