import type { FoodProfile } from "@/lib/nutrition/food-database";

export type CatalogNameSource = "canonical_name" | "alias";

export interface CatalogNameReference {
  profile_name: string;
  name: string;
  source: CatalogNameSource;
}

export interface CatalogSubstringCollision {
  shorter: CatalogNameReference;
  longer: CatalogNameReference;
}

export interface CatalogSubstringRegression extends CatalogSubstringCollision {
  unenumerated_connector: string;
}

interface NormalizedCatalogNameReference extends CatalogNameReference {
  normalized_name: string;
  profile_index: number;
}

export class FoodProfileCatalogIntegrityError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Food profile catalog integrity failed:\n- ${issues.join("\n- ")}`);
    this.name = "FoodProfileCatalogIntegrityError";
    this.issues = issues;
  }
}

export function normalizeFoodProfileName(foodName: string): string {
  return foodName.normalize("NFKC").trim().toLowerCase();
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function referenceKey(reference: CatalogNameReference): string {
  return JSON.stringify([
    normalizeFoodProfileName(reference.profile_name),
    reference.source,
    normalizeFoodProfileName(reference.name),
  ]);
}

export function catalogSubstringCollisionKey(collision: CatalogSubstringCollision): string {
  return `${referenceKey(collision.shorter)}->${referenceKey(collision.longer)}`;
}

function describeReference(reference: CatalogNameReference): string {
  return `${reference.profile_name}.${reference.source}=${JSON.stringify(reference.name)}`;
}

function collectCatalogNames(
  profiles: readonly FoodProfile[],
  issues: string[],
): NormalizedCatalogNameReference[] {
  const references: NormalizedCatalogNameReference[] = [];

  profiles.forEach((profile: FoodProfile, profileIndex: number): void => {
    const profileName: string = profile.canonical_name;
    const names: Array<{ name: string; source: CatalogNameSource }> = [
      { name: profile.canonical_name, source: "canonical_name" },
      ...profile.aliases.map(
        (alias: string): { name: string; source: CatalogNameSource } => ({
          name: alias,
          source: "alias",
        }),
      ),
    ];
    const namesSeenInProfile: Map<string, CatalogNameReference> = new Map();

    names.forEach((entry: { name: string; source: CatalogNameSource }): void => {
      const normalizedName: string = normalizeFoodProfileName(entry.name);
      const reference: CatalogNameReference = {
        profile_name: profileName,
        name: entry.name,
        source: entry.source,
      };
      if (normalizedName.length === 0) {
        issues.push(`empty normalized catalog name at ${describeReference(reference)}`);
        return;
      }

      const existing: CatalogNameReference | undefined = namesSeenInProfile.get(normalizedName);
      if (existing) {
        issues.push(
          `duplicate normalized name within one profile: ${describeReference(existing)} and ${describeReference(reference)}`,
        );
        return;
      }
      namesSeenInProfile.set(normalizedName, reference);
      references.push({
        ...reference,
        normalized_name: normalizedName,
        profile_index: profileIndex,
      });
    });
  });

  return references;
}

export function findCatalogSubstringCollisions(
  profiles: readonly FoodProfile[],
): CatalogSubstringCollision[] {
  const collectionIssues: string[] = [];
  const references: NormalizedCatalogNameReference[] = collectCatalogNames(
    profiles,
    collectionIssues,
  );
  if (collectionIssues.length > 0) {
    throw new FoodProfileCatalogIntegrityError(collectionIssues.sort(compareText));
  }

  const collisions: CatalogSubstringCollision[] = [];
  for (let leftIndex: number = 0; leftIndex < references.length; leftIndex += 1) {
    const left: NormalizedCatalogNameReference = references[leftIndex];
    for (let rightIndex: number = leftIndex + 1; rightIndex < references.length; rightIndex += 1) {
      const right: NormalizedCatalogNameReference = references[rightIndex];
      if (left.profile_index === right.profile_index) {
        continue;
      }
      if (left.normalized_name === right.normalized_name) {
        continue;
      }

      let shorter: NormalizedCatalogNameReference;
      let longer: NormalizedCatalogNameReference;
      if (right.normalized_name.includes(left.normalized_name)) {
        shorter = left;
        longer = right;
      } else if (left.normalized_name.includes(right.normalized_name)) {
        shorter = right;
        longer = left;
      } else {
        continue;
      }

      collisions.push({
        shorter: {
          profile_name: shorter.profile_name,
          name: shorter.name,
          source: shorter.source,
        },
        longer: {
          profile_name: longer.profile_name,
          name: longer.name,
          source: longer.source,
        },
      });
    }
  }

  return collisions.sort((left: CatalogSubstringCollision, right: CatalogSubstringCollision) =>
    compareText(catalogSubstringCollisionKey(left), catalogSubstringCollisionKey(right)),
  );
}

export function assertFoodProfileCatalogIntegrity(
  profiles: readonly FoodProfile[],
  regressions: readonly CatalogSubstringRegression[],
): void {
  const issues: string[] = [];
  const references: NormalizedCatalogNameReference[] = collectCatalogNames(profiles, issues);

  for (let leftIndex: number = 0; leftIndex < references.length; leftIndex += 1) {
    const left: NormalizedCatalogNameReference = references[leftIndex];
    for (let rightIndex: number = leftIndex + 1; rightIndex < references.length; rightIndex += 1) {
      const right: NormalizedCatalogNameReference = references[rightIndex];
      if (
        left.profile_index !== right.profile_index &&
        left.normalized_name === right.normalized_name
      ) {
        issues.push(
          `exact cross-profile authority collision: ${describeReference(left)} and ${describeReference(right)}`,
        );
      }
    }
  }

  let collisions: CatalogSubstringCollision[] = [];
  if (issues.every((issue: string) => !issue.startsWith("empty normalized"))) {
    try {
      collisions = findCatalogSubstringCollisions(profiles);
    } catch (error: unknown) {
      if (error instanceof FoodProfileCatalogIntegrityError) {
        issues.push(...error.issues);
      } else {
        throw error;
      }
    }
  }

  const collisionsByKey: Map<string, CatalogSubstringCollision> = new Map(
    collisions.map(
      (collision: CatalogSubstringCollision): [string, CatalogSubstringCollision] => [
        catalogSubstringCollisionKey(collision),
        collision,
      ],
    ),
  );
  const coveredKeys: Set<string> = new Set();

  regressions.forEach((regression: CatalogSubstringRegression): void => {
    const key: string = catalogSubstringCollisionKey(regression);
    if (regression.unenumerated_connector.trim().length === 0) {
      issues.push(`empty unenumerated connector for collision regression ${key}`);
    }
    if (!collisionsByKey.has(key)) {
      issues.push(`stale collision regression without a current catalog collision: ${key}`);
      return;
    }
    if (coveredKeys.has(key)) {
      issues.push(`duplicate collision regression: ${key}`);
      return;
    }
    coveredKeys.add(key);
  });

  collisionsByKey.forEach((collision: CatalogSubstringCollision, key: string): void => {
    if (!coveredKeys.has(key)) {
      issues.push(
        `missing mention-span regression for substring collision: ${describeReference(collision.shorter)} inside ${describeReference(collision.longer)}`,
      );
    }
  });

  if (issues.length > 0) {
    throw new FoodProfileCatalogIntegrityError([...new Set(issues)].sort(compareText));
  }
}
