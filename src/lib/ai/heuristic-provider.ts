import type {
  AnalysisRequest,
  FoodKind,
  InputSource,
  MealAnalysis,
  MealItemAnalysis,
  OilLevel,
} from "@/lib/ai/meal-analysis-schema";
import { mealAnalysisSchema } from "@/lib/ai/meal-analysis-schema";
import {
  FOOD_PROFILES,
  type FoodProfile,
  type PortionBasis,
} from "@/lib/nutrition/food-database";

interface HeuristicProfile {
  food_name: string;
  aliases: string[];
  kind: FoodKind;
  default_grams: number;
  portion_basis: PortionBasis;
  force_confirmation: boolean;
}

interface ProfileMention {
  profile: HeuristicProfile;
  alias: string;
  start: number;
  end: number;
  trusted: boolean;
  source: "trusted-profile" | "broad-profile";
}

interface MentionSurface {
  name: string;
  start: number;
  end: number;
}

interface PortionMatch {
  start: number;
  end: number;
}

interface MentionBounds {
  lower: number;
  upper: number;
}

interface RecognizedCandidate {
  profile: HeuristicProfile;
  portion_text: string;
  mention_start: number;
  mention_end: number;
}

const BROAD_CANDIDATE_PROFILES: HeuristicProfile[] = [
  {
    food_name: "排骨",
    aliases: ["排骨"],
    kind: "recipe",
    default_grams: 100,
    portion_basis: { piece_grams: 28 },
    force_confirmation: true,
  },
  {
    food_name: "牛肉面",
    aliases: ["牛肉面"],
    kind: "recipe",
    default_grams: 420,
    portion_basis: { bowl_grams: 420 },
    force_confirmation: true,
  },
  {
    food_name: "面条",
    aliases: ["面条"],
    kind: "food",
    default_grams: 200,
    portion_basis: { bowl_grams: 300 },
    force_confirmation: true,
  },
];

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

const SURFACE_LEFT_STOP_CHARS: Set<string> = new Set([
  "碗",
  "盘",
  "份",
  "个",
  "只",
  "块",
  "勺",
  "口",
  "两",
  "克",
  "斤",
  "杯",
  "盒",
  "包",
  "片",
  "根",
  "串",
]);

const KNOWN_MENTION_JOINERS: string[] = [
  "以及",
  "还有",
  "并且",
  "然后",
  "另外",
  "外加",
  "再加",
  "与",
  "和",
  "跟",
];

const MEAL_LEAD_SOURCE: string = "(?:(?:我|今天|早餐|午餐|晚餐|中午|晚上)\\s*){0,3}";
const APPROX_SOURCE: string = "(?:(?:大概|大约|约)\\s*)?";
const ACTION_SOURCE: string = "(?:(?:吃了|吃|喝了|喝)\\s*)?";
const PORTION_MODIFIER_SOURCE: string = `${APPROX_SOURCE}${ACTION_SOURCE}${APPROX_SOURCE}`;
const EXACT_GRAMS_SOURCE: string = "\\d+(?:\\.\\d+)?\\s*(?:g|克)";
const ONE_LIANG_SOURCE: string = "一\\s*两";
const FRACTION_SOURCE: string =
  "(?:三分之一|二分之一|一半|1\\s*\\/\\s*3|1\\s*\\/\\s*2)\\s*(?:盘|碗|份)?";
const COUNT_SOURCE: string =
  "(?:半|整|\\d+(?:\\.\\d+)?|[一二三四五六七八九十两]+)\\s*(?:碗|盘|份|个|只|块|勺|口|两|杯|盒|包|片|根|串)";
const PORTION_CORE_SOURCE: string =
  `(?:${EXACT_GRAMS_SOURCE}|${ONE_LIANG_SOURCE}|${FRACTION_SOURCE}|${COUNT_SOURCE})`;

const PREFIX_PORTION_PATTERN: RegExp = new RegExp(
  `${MEAL_LEAD_SOURCE}${PORTION_MODIFIER_SOURCE}${PORTION_CORE_SOURCE}\\s*$`,
  "i",
);
const POSTFIX_PORTION_PATTERN: RegExp = new RegExp(
  `^\\s*${PORTION_MODIFIER_SOURCE}${PORTION_CORE_SOURCE}`,
  "i",
);
const OIL_SUFFIX_PATTERN: RegExp =
  /^\s*(?:无油|不放油|少油|清淡|油少|重油|油大|很多油|多油)/;
const OIL_LEVEL_SOURCE: string =
  "(?:无油|不放油|少油|清淡|油少|重油|油大|很多油|多油)";
const CURRENT_MENTION_TAIL_PATTERN: RegExp = new RegExp(
  `^\\s*(?:${PORTION_MODIFIER_SOURCE}${PORTION_CORE_SOURCE}\\s*)?` +
    `(?:${OIL_LEVEL_SOURCE}\\s*)?$`,
  "i",
);
const NEXT_MENTION_HEAD_PATTERN: RegExp = new RegExp(
  `^\\s*(?:${PORTION_MODIFIER_SOURCE}${PORTION_CORE_SOURCE})?\\s*$`,
  "i",
);
const SORTED_MENTION_JOINERS: string[] = [...KNOWN_MENTION_JOINERS].sort(
  (left: string, right: string) => right.length - left.length,
);
const CONSUMPTION_LEAD_PATTERN: RegExp = new RegExp(
  `^\\s*${MEAL_LEAD_SOURCE}(?:吃了|吃|喝了|喝)\\s*$`,
  "i",
);
const LEADING_DISPLAY_JOINER_PATTERN: RegExp =
  /^(?:以及|还有|并且|然后|另外|外加|再加|与|和|跟)+/;

function toHeuristicProfile(profile: FoodProfile): HeuristicProfile {
  return {
    food_name: profile.canonical_name,
    aliases: [profile.canonical_name, ...profile.aliases],
    kind: profile.kind,
    default_grams: profile.default_grams,
    portion_basis: profile.portion_basis,
    force_confirmation: false,
  };
}

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

function isNameCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{Script=Han}A-Za-z]/u.test(character);
}

function isTokenCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{Script=Han}A-Za-z0-9]/u.test(character);
}

function hasHardBoundaryBefore(text: string, index: number): boolean {
  return index <= 0 || !isTokenCharacter(text[index - 1]);
}

function hasHardBoundaryAfter(text: string, index: number): boolean {
  return index >= text.length || !isTokenCharacter(text[index]);
}

const EXPLICIT_MENTION_DELIMITERS: Set<string> = new Set([
  ",",
  "，",
  "、",
  ";",
  "；",
  ".",
  "。",
  "!",
  "！",
  "?",
  "？",
  ":",
  "：",
]);

function hasExplicitRightMentionBoundary(text: string, start: number, end: number): boolean {
  const gap: string = text.slice(start, end);
  for (const character of gap) {
    if (/\s/u.test(character)) {
      continue;
    }
    return EXPLICIT_MENTION_DELIMITERS.has(character);
  }
  return /[\r\n]/u.test(gap);
}

function hasExplicitLeftMentionBoundary(text: string, start: number, end: number): boolean {
  const gap: string = text.slice(start, end);
  for (let index: number = gap.length - 1; index >= 0; index -= 1) {
    const character: string = gap[index];
    if (/\s/u.test(character)) {
      continue;
    }
    return EXPLICIT_MENTION_DELIMITERS.has(character);
  }
  return /[\r\n]/u.test(gap);
}

function isWhitespaceOnly(text: string, start: number, end: number): boolean {
  return /^\s*$/u.test(text.slice(start, end));
}

function isShortNameFragment(text: string): boolean {
  const trimmed: string = text.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 3 &&
    Array.from(trimmed).every((character: string) => isNameCharacter(character)) &&
    !KNOWN_MENTION_JOINERS.some((joiner: string) => trimmed.includes(joiner))
  );
}

function isDisplayLeftTail(text: string): boolean {
  if (CURRENT_MENTION_TAIL_PATTERN.test(text)) {
    return true;
  }
  const trimmed: string = text.trim();
  for (let prefixLength: number = 1; prefixLength <= Math.min(3, trimmed.length); prefixLength += 1) {
    const nameSuffix: string = trimmed.slice(0, prefixLength);
    const remainder: string = trimmed.slice(prefixLength);
    if (isShortNameFragment(nameSuffix) && CURRENT_MENTION_TAIL_PATTERN.test(remainder)) {
      return true;
    }
  }
  return false;
}

function isDisplayRightHead(text: string): boolean {
  if (NEXT_MENTION_HEAD_PATTERN.test(text)) {
    return true;
  }
  const trimmed: string = text.trim();
  for (let suffixLength: number = 1; suffixLength <= Math.min(3, trimmed.length); suffixLength += 1) {
    const namePrefix: string = trimmed.slice(trimmed.length - suffixLength);
    const prefix: string = trimmed.slice(0, trimmed.length - suffixLength);
    if (isShortNameFragment(namePrefix) && NEXT_MENTION_HEAD_PATTERN.test(prefix)) {
      return true;
    }
  }
  return false;
}

interface MentionGapSeparator {
  start: number;
  end: number;
}

function findMentionGapSeparator(
  text: string,
  gapStart: number,
  gapEnd: number,
  mode: "right-authority" | "left-authority" | "display",
): MentionGapSeparator | undefined {
  if (gapStart >= gapEnd) {
    return undefined;
  }
  const gap: string = text.slice(gapStart, gapEnd);
  for (let index: number = 0; index < gap.length; index += 1) {
    for (const joiner of SORTED_MENTION_JOINERS) {
      if (!gap.startsWith(joiner, index)) {
        continue;
      }
      const left: string = gap.slice(0, index);
      const right: string = gap.slice(index + joiner.length);
      const normalizedLeft: string = left.replace(
        /\s*[,，、;；.。!！?？:：]+\s*$/u,
        "",
      );
      const normalizedRight: string = right.replace(
        /^\s*[,，、;；.。!！?？:：]+\s*/u,
        "",
      );
      const leftDisplaySafe: boolean = isDisplayLeftTail(normalizedLeft);
      const rightDisplaySafe: boolean = isDisplayRightHead(normalizedRight);
      const matches: boolean =
        mode === "right-authority"
          ? CURRENT_MENTION_TAIL_PATTERN.test(normalizedLeft) && rightDisplaySafe
          : mode === "left-authority"
            ? leftDisplaySafe && NEXT_MENTION_HEAD_PATTERN.test(normalizedRight)
            : leftDisplaySafe && rightDisplaySafe;
      if (matches) {
        return {
          start: gapStart + index,
          end: gapStart + index + joiner.length,
        };
      }
    }
  }
  return undefined;
}

function hasStructuredRightBoundary(text: string, start: number, end: number): boolean {
  return findMentionGapSeparator(text, start, end, "right-authority") !== undefined;
}

function hasStructuredLeftBoundary(text: string, start: number, end: number): boolean {
  return findMentionGapSeparator(text, start, end, "left-authority") !== undefined;
}

function mentionsOverlap(left: ProfileMention, right: ProfileMention): boolean {
  return left.start < right.end && right.start < left.end;
}

function sameProfile(left: ProfileMention, right: ProfileMention): boolean {
  return left.profile.food_name === right.profile.food_name && left.profile.kind === right.profile.kind;
}

function findProfileMentions(
  text: string,
  profile: HeuristicProfile,
  source: ProfileMention["source"],
): ProfileMention[] {
  const mentions: ProfileMention[] = [];
  for (const alias of profile.aliases) {
    let searchFrom: number = 0;
    while (searchFrom <= text.length - alias.length) {
      const start: number = text.indexOf(alias, searchFrom);
      if (start < 0) {
        break;
      }
      const end: number = start + alias.length;
      mentions.push({ profile, alias, start, end, trusted: false, source });
      searchFrom = start + Math.max(alias.length, 1);
    }
  }
  return mentions;
}

function preferLongestOverlappingAlias(mentions: ProfileMention[]): ProfileMention[] {
  const sorted: ProfileMention[] = [...mentions].sort(
    (left: ProfileMention, right: ProfileMention) =>
      left.start - right.start || right.alias.length - left.alias.length,
  );
  const kept: ProfileMention[] = [];

  for (const mention of sorted) {
    const overlappingIndex: number = kept.findIndex(
      (existing: ProfileMention) => sameProfile(existing, mention) && mentionsOverlap(existing, mention),
    );
    if (overlappingIndex < 0) {
      kept.push(mention);
      continue;
    }
    const existing: ProfileMention = kept[overlappingIndex];
    if (mention.alias.length > existing.alias.length) {
      kept[overlappingIndex] = mention;
    }
  }
  return kept.sort((left: ProfileMention, right: ProfileMention) => left.start - right.start);
}

function broadMentionCoveredBySpecificMention(
  broadMention: ProfileMention,
  specificMentions: ProfileMention[],
): boolean {
  return specificMentions.some(
    (specificMention: ProfileMention) =>
      mentionsOverlap(broadMention, specificMention) &&
      (specificMention.profile.food_name.includes(broadMention.profile.food_name) ||
        specificMention.profile.aliases.some((alias: string) =>
          alias.includes(broadMention.profile.food_name),
        )),
  );
}

function buildMentionAnchors(mentions: ProfileMention[]): ProfileMention[] {
  const sorted: ProfileMention[] = [...mentions].sort(
    (left: ProfileMention, right: ProfileMention) =>
      left.start - right.start || right.alias.length - left.alias.length,
  );
  const anchors: ProfileMention[] = [];
  for (const mention of sorted) {
    const last: ProfileMention | undefined = anchors.at(-1);
    if (!last || !mentionsOverlap(last, mention)) {
      anchors.push(mention);
      continue;
    }
    if (mention.alias.length > last.alias.length) {
      anchors[anchors.length - 1] = mention;
    }
  }
  return anchors;
}

function mentionNeighborBounds(
  mention: ProfileMention,
  anchors: ProfileMention[],
  textLength: number,
): MentionBounds {
  let lower: number = 0;
  let upper: number = textLength;
  for (const anchor of anchors) {
    if (anchor.end <= mention.start) {
      lower = Math.max(lower, anchor.end);
      continue;
    }
    if (anchor.start >= mention.end) {
      upper = Math.min(upper, anchor.start);
      break;
    }
  }
  return { lower, upper };
}

function matchOilSuffix(
  text: string,
  start: number,
  upperBound: number,
): PortionMatch | undefined {
  const window: string = text.slice(start, upperBound);
  const match: RegExpMatchArray | null = window.match(OIL_SUFFIX_PATTERN);
  if (!match?.[0]) {
    return undefined;
  }
  return { start, end: start + match[0].length };
}

function hasValidPostfixTerminator(
  text: string,
  mentionEnd: number,
  end: number,
  upperBound: number,
): boolean {
  if (end >= text.length) {
    return true;
  }
  const hasRightMention: boolean = upperBound < text.length;
  if (
    !hasRightMention &&
    (isWhitespaceOnly(text, end, text.length) ||
      hasExplicitRightMentionBoundary(text, end, text.length))
  ) {
    return true;
  }
  if (
    hasRightMention &&
    (hasStructuredRightBoundary(text, mentionEnd, upperBound) ||
      hasExplicitRightMentionBoundary(text, end, upperBound))
  ) {
    return true;
  }
  const oilMatch: PortionMatch | undefined = matchOilSuffix(text, end, upperBound);
  if (!oilMatch) {
    return false;
  }
  return (
    oilMatch.end >= text.length ||
    (!hasRightMention &&
      (isWhitespaceOnly(text, oilMatch.end, text.length) ||
        hasExplicitRightMentionBoundary(text, oilMatch.end, text.length))) ||
    (hasRightMention &&
      (hasStructuredRightBoundary(text, mentionEnd, upperBound) ||
        hasExplicitRightMentionBoundary(text, oilMatch.end, upperBound)))
  );
}

function matchPrefixPortion(
  text: string,
  mentionStart: number,
  lowerBound: number,
): PortionMatch | undefined {
  const window: string = text.slice(lowerBound, mentionStart);
  const match: RegExpMatchArray | null = window.match(PREFIX_PORTION_PATTERN);
  if (!match?.[0]) {
    return undefined;
  }
  const start: number = lowerBound + (match.index ?? 0);
  const startsAtInput: boolean = start === 0;
  const hasLeftMention: boolean = lowerBound > 0;
  const separated: boolean =
    startsAtInput ||
    (!hasLeftMention &&
      (isWhitespaceOnly(text, 0, start) ||
        hasExplicitLeftMentionBoundary(text, 0, start))) ||
    (hasLeftMention &&
      (hasStructuredLeftBoundary(text, lowerBound, mentionStart) ||
        hasExplicitLeftMentionBoundary(text, lowerBound, start)));
  return separated ? { start, end: mentionStart } : undefined;
}

function matchPostfixPortion(
  text: string,
  mentionEnd: number,
  upperBound: number,
): PortionMatch | undefined {
  const window: string = text.slice(mentionEnd, upperBound);
  const match: RegExpMatchArray | null = window.match(POSTFIX_PORTION_PATTERN);
  if (!match?.[0]) {
    return undefined;
  }
  const end: number = mentionEnd + match[0].length;
  return hasValidPostfixTerminator(text, mentionEnd, end, upperBound)
    ? { start: mentionEnd, end }
    : undefined;
}

function isTrustedSpecificMention(
  text: string,
  mention: ProfileMention,
  anchors: ProfileMention[],
): boolean {
  const bounds: MentionBounds = mentionNeighborBounds(mention, anchors, text.length);
  const prefix: PortionMatch | undefined = matchPrefixPortion(text, mention.start, bounds.lower);
  const postfix: PortionMatch | undefined = matchPostfixPortion(text, mention.end, bounds.upper);
  const oilMatch: PortionMatch | undefined = matchOilSuffix(text, mention.end, bounds.upper);
  const oil: PortionMatch | undefined =
    oilMatch && hasValidPostfixTerminator(text, mention.end, oilMatch.end, bounds.upper)
      ? oilMatch
      : undefined;
  const before: string = text.slice(bounds.lower, mention.start);
  const hasLeftMention: boolean = bounds.lower > 0;
  const hasRightMention: boolean = bounds.upper < text.length;
  const structuredLeftBoundary: boolean =
    hasLeftMention && hasStructuredLeftBoundary(text, bounds.lower, mention.start);
  const structuredRightBoundary: boolean =
    hasRightMention && hasStructuredRightBoundary(text, mention.end, bounds.upper);

  const leftSafe: boolean =
    mention.start === 0 ||
    prefix !== undefined ||
    (!hasLeftMention && CONSUMPTION_LEAD_PATTERN.test(before)) ||
    (!hasLeftMention &&
      (isWhitespaceOnly(text, 0, mention.start) ||
        hasExplicitLeftMentionBoundary(text, 0, mention.start))) ||
    structuredLeftBoundary ||
    (hasLeftMention &&
      hasExplicitLeftMentionBoundary(text, bounds.lower, mention.start));
  const rightSafe: boolean =
    mention.end === text.length ||
    postfix !== undefined ||
    oil !== undefined ||
    (!hasRightMention &&
      (isWhitespaceOnly(text, mention.end, text.length) ||
        hasExplicitRightMentionBoundary(text, mention.end, text.length))) ||
    structuredRightBoundary ||
    (hasRightMention &&
      hasExplicitRightMentionBoundary(text, mention.end, bounds.upper));

  return leftSafe && rightSafe;
}

function cleanEmbeddedSurface(
  rawSurface: string,
  profile: HeuristicProfile,
): { name: string; removedPrefixLength: number } {
  let name: string = rawSurface;
  let removedPrefixLength: number = 0;
  const joinerMatch: RegExpMatchArray | null = name.match(LEADING_DISPLAY_JOINER_PATTERN);
  if (joinerMatch) {
    removedPrefixLength += joinerMatch[0].length;
    name = name.slice(joinerMatch[0].length);
  }
  const mealLeadMatch: RegExpMatchArray | null = name.match(
    /^(?:我|今天|早餐|午餐|晚餐|中午|晚上)?(?:大概|大约|约)?(?:吃了|吃|喝了|喝)?/,
  );
  if (mealLeadMatch?.[0]) {
    removedPrefixLength += mealLeadMatch[0].length;
    name = name.slice(mealLeadMatch[0].length);
  }
  name = name.trim();
  const trustedNames: string[] = [profile.food_name, ...profile.aliases];
  if (!name || trustedNames.includes(name)) {
    return { name: `${profile.food_name}（复合）`, removedPrefixLength };
  }
  return { name, removedPrefixLength };
}

function extractMentionSurface(
  text: string,
  mention: ProfileMention,
  bounds: MentionBounds,
): MentionSurface {
  if (mention.trusted) {
    return { name: mention.profile.food_name, start: mention.start, end: mention.end };
  }

  let start: number = mention.start;
  let end: number = mention.end;
  let leftCharacters: number = 0;
  let rightCharacters: number = 0;
  const displaySeparator: MentionGapSeparator | undefined =
    bounds.upper < text.length
      ? findMentionGapSeparator(text, mention.end, bounds.upper, "right-authority") ??
        findMentionGapSeparator(text, mention.end, bounds.upper, "display")
      : undefined;
  while (
    start > bounds.lower &&
    leftCharacters < 6 &&
    isNameCharacter(text[start - 1]) &&
    !SURFACE_LEFT_STOP_CHARS.has(text[start - 1])
  ) {
    start -= 1;
    leftCharacters += 1;
  }
  while (
    end < bounds.upper &&
    rightCharacters < 6 &&
    isNameCharacter(text[end])
  ) {
    if (displaySeparator && end >= displaySeparator.start) {
      break;
    }
    const postfix: PortionMatch | undefined = matchPostfixPortion(text, end, bounds.upper);
    const oil: PortionMatch | undefined = matchOilSuffix(text, end, bounds.upper);
    const terminatingOil: boolean =
      oil !== undefined && hasValidPostfixTerminator(text, end, oil.end, bounds.upper);
    if (postfix || terminatingOil) {
      break;
    }
    end += 1;
    rightCharacters += 1;
  }

  const cleaned: { name: string; removedPrefixLength: number } = cleanEmbeddedSurface(
    text.slice(start, end),
    mention.profile,
  );
  start = Math.min(end, start + cleaned.removedPrefixLength);
  return { name: cleaned.name, start, end };
}

function extractMentionContext(
  text: string,
  surface: MentionSurface,
  bounds: MentionBounds,
): string {
  let start: number = surface.start;
  let end: number = surface.end;
  const prefix: PortionMatch | undefined = matchPrefixPortion(text, surface.start, bounds.lower);
  if (prefix) {
    start = prefix.start;
  }
  const postfix: PortionMatch | undefined = matchPostfixPortion(text, surface.end, bounds.upper);
  if (postfix) {
    end = postfix.end;
  }
  const oil: PortionMatch | undefined = matchOilSuffix(text, end, bounds.upper);
  if (oil && hasValidPostfixTerminator(text, surface.end, oil.end, bounds.upper)) {
    end = oil.end;
  }
  return text.slice(start, end).trim();
}

function inferOilLevel(context: string, profile: HeuristicProfile): OilLevel {
  if (profile.kind !== "recipe") {
    return "none";
  }
  if (/无油|不放油/.test(context)) {
    return "none";
  }
  if (/少油|清淡|油少/.test(context)) {
    return "light";
  }
  if (/重油|油大|很多油|多油/.test(context)) {
    return "heavy";
  }
  return "unknown";
}

function inferGrams(context: string, profile: HeuristicProfile): { grams: number; note: string } {
  const exactGrams: RegExpMatchArray | null = context.match(/(\d+(?:\.\d+)?)\s*(?:g|克)/i);
  if (exactGrams) {
    return { grams: Number(exactGrams[1]), note: "使用了用户提供的克数" };
  }
  if (/一\s*两/.test(context)) {
    return { grams: 50, note: "按一两约 50 克换算" };
  }
  const countMatch: RegExpMatchArray | null = context.match(
    /(\d+|[一二三四五六七八九十两]+)\s*(块|个|只|勺|口)/,
  );
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
  if (/三分之一|1\s*\/\s*3/.test(context) && profile.portion_basis.plate_grams) {
    return {
      grams: Math.round(profile.portion_basis.plate_grams / 3),
      note: `按一盘约 ${profile.portion_basis.plate_grams} 克换算`,
    };
  }
  if (/一半|半盘|二分之一|1\s*\/\s*2/.test(context) && profile.portion_basis.plate_grams) {
    return {
      grams: Math.round(profile.portion_basis.plate_grams / 2),
      note: `按一盘约 ${profile.portion_basis.plate_grams} 克换算`,
    };
  }
  if (/半碗/.test(context) && profile.portion_basis.bowl_grams) {
    return {
      grams: Math.round(profile.portion_basis.bowl_grams / 2),
      note: `按一碗约 ${profile.portion_basis.bowl_grams} 克换算`,
    };
  }
  if (/(?:一|1|整)碗/.test(context) && profile.portion_basis.bowl_grams) {
    return {
      grams: profile.portion_basis.bowl_grams,
      note: `按一碗约 ${profile.portion_basis.bowl_grams} 克换算`,
    };
  }
  return { grams: profile.default_grams, note: `暂按常见份量 ${profile.default_grams} 克估算` };
}

function buildItem(candidate: RecognizedCandidate, source: InputSource): MealItemAnalysis {
  const portion: { grams: number; note: string } = inferGrams(
    candidate.portion_text,
    candidate.profile,
  );
  const oilLevel: OilLevel = inferOilLevel(candidate.portion_text, candidate.profile);
  const needsOilConfirmation: boolean =
    candidate.profile.kind === "recipe" && oilLevel === "unknown";
  const needsConfirmation: boolean = candidate.profile.force_confirmation || needsOilConfirmation;
  return {
    food_name: candidate.profile.food_name,
    portion_text: candidate.portion_text,
    estimated_grams: portion.grams,
    oil_level: oilLevel,
    confidence: candidate.profile.force_confirmation ? 0.45 : needsOilConfirmation ? 0.72 : 0.86,
    source,
    type: candidate.profile.kind,
    assumptions: [
      portion.note,
      ...(candidate.profile.force_confirmation
        ? ["只识别到宽泛/复合食物名称，或份量边界不够明确；请修改或确认明确条目后再计算营养"]
        : []),
      ...(needsOilConfirmation ? ["未说明油量，计算前请确认"] : []),
    ],
    needs_confirmation: needsConfirmation,
  };
}

function mentionToCandidate(
  text: string,
  mention: ProfileMention,
  anchors: ProfileMention[],
): RecognizedCandidate {
  const bounds: MentionBounds = mentionNeighborBounds(mention, anchors, text.length);
  const surface: MentionSurface = extractMentionSurface(text, mention, bounds);
  const profile: HeuristicProfile = mention.trusted
    ? mention.profile
    : {
        ...mention.profile,
        food_name: mention.source === "broad-profile" ? mention.profile.food_name : surface.name,
        force_confirmation: true,
      };
  return {
    profile,
    portion_text: extractMentionContext(text, surface, bounds),
    mention_start: mention.start,
    mention_end: mention.end,
  };
}

export function analyzeWithHeuristics(request: AnalysisRequest): MealAnalysis {
  const allTrustedProfiles: HeuristicProfile[] = FOOD_PROFILES.map(toHeuristicProfile);
  const specificMentions: ProfileMention[] = preferLongestOverlappingAlias(
    allTrustedProfiles.flatMap((profile: HeuristicProfile) =>
      findProfileMentions(request.text, profile, "trusted-profile"),
    ),
  );
  const broadMentions: ProfileMention[] = BROAD_CANDIDATE_PROFILES.flatMap(
    (profile: HeuristicProfile) => findProfileMentions(request.text, profile, "broad-profile"),
  ).filter(
    (mention: ProfileMention) =>
      !broadMentionCoveredBySpecificMention(mention, specificMentions),
  );
  const rawMentions: ProfileMention[] = [...specificMentions, ...broadMentions].sort(
    (left: ProfileMention, right: ProfileMention) =>
      left.start - right.start || right.alias.length - left.alias.length,
  );

  if (rawMentions.length === 0) {
    throw new Error("本地演示暂未识别出食物。请补充菜名，或配置 OpenAI API 进行图片识别。");
  }

  const anchors: ProfileMention[] = buildMentionAnchors(rawMentions);
  const classifiedMentions: ProfileMention[] = rawMentions.map((mention: ProfileMention) =>
    mention.source === "trusted-profile"
      ? { ...mention, trusted: isTrustedSpecificMention(request.text, mention, anchors) }
      : mention,
  );
  const recognizedCandidates: RecognizedCandidate[] = classifiedMentions.map(
    (mention: ProfileMention) => mentionToCandidate(request.text, mention, anchors),
  );
  const uniqueCandidates: RecognizedCandidate[] = recognizedCandidates.filter(
    (candidate: RecognizedCandidate, index: number, candidates: RecognizedCandidate[]) =>
      candidates.findIndex(
        (other: RecognizedCandidate) =>
          other.mention_start === candidate.mention_start &&
          other.mention_end === candidate.mention_end &&
          other.profile.food_name === candidate.profile.food_name &&
          other.profile.kind === candidate.profile.kind,
      ) === index,
  );
  const items: MealItemAnalysis[] = uniqueCandidates.map((candidate: RecognizedCandidate) =>
    buildItem(candidate, request.source),
  );
  const overallConfidence: number =
    items.reduce((total: number, item: MealItemAnalysis) => total + item.confidence, 0) / items.length;

  return mealAnalysisSchema.parse({
    schema_version: "1.0",
    items,
    overall_confidence: Number(overallConfidence.toFixed(2)),
    uncertainty_note:
      "本地演示只把可明确归属到单个食物 mention 的份量语法用于可信候选；模糊连接或共享份量会保守降级，Nutrition Engine 仍只接受明确匹配的 MealNote 食物/菜谱条目。",
  });
}