# MealNote Project Context

**Last curated:** 2026-08-25  
**Canonical project name / brand / package / directory:** `MealNote` / `mealnote`  
**Repository:** `zengtao227/mealnote`  
**Canonical local path:** `/Users/zengtao/Doc/My code/mealnote`

> This file is the durable handoff context for humans and coding agents. It records project intent, current implementation truth, non-negotiable boundaries, known risks and the next approved development direction. When this file conflicts with current code/tests, the current code plus verified evidence wins and this file must be updated.

## 1. What MealNote is

MealNote is a mobile-first AI-assisted food diary for Chinese eating patterns and overseas Chinese users. The product is designed around natural input such as:

- “半碗米饭”；
- “排骨四块”；
- “番茄炒蛋吃了三分之一盘”；
- text + photo + spoken context.

The core product promise is not “AI guesses an exact calorie number”. The product separates uncertain input understanding from auditable nutrition calculation.

```text
text / voice / image
        ↓
AI or heuristic analyzer
(structured candidate only)
        ↓
user confirmation / correction
        ↓
Nutrition Engine
        ↓
meal + nutrition snapshot
```

## 2. Non-negotiable architecture boundaries

### AI is not nutrition authority

AI may identify food, estimate portion grams, oil level, source, confidence and assumptions. It must not become the truth source for kcal/protein/fat/carbs.

All nutrition values must come from MealNote's Nutrition Engine using MealNote-owned food/recipe/portion data. The AI schema is strict so unexpected nutrition-truth fields are rejected.

### User history belongs to MealNote

Meals, confirmed items, recipes, portion memories, nutrition snapshots and AI run metadata must live in MealNote's own persistence layer. They must not depend on model memory or chat context.

### Historical nutrition is a snapshot

Updating a food table, recipe or engine version must not silently rewrite previously saved meals. Recalculation must be explicit and version-aware.

### Production identity comes from authentication

Browser-supplied `user_id` / `owner_id` is never authoritative. Production ownership must be derived from the authenticated session and enforced again at the database boundary.

### Keep the system simple

Current architecture is a Next.js monolith/PWA. Do not introduce microservices, Kubernetes, queues, event buses or vector databases unless real product/load evidence requires them.

## 3. Current implementation truth

As of the 2026-08-25 baseline:

### Working local demo

- Next.js 16 mobile-first PWA skeleton;
- local nickname demo login;
- text input;
- browser speech-to-text input;
- JPEG/PNG/WebP photo selection and preview;
- heuristic meal analyzer;
- server-side OpenAI Responses API provider implementation;
- strict Zod/JSON schema for meal analysis;
- independent Nutrition Engine;
- portion/oil editing and kcal range display;
- `localStorage` meal saving and today's summary;
- initial Supabase/PostgreSQL migration and RLS policies.

### Verified baseline quality

The bootstrap baseline was manually verified at 375 px for the main local flow and had 7 unit tests. On 2026-08-25, PR #3 upgraded Next.js / eslint-config-next from 16.2.7 to 16.3.3. A clean Linux + Node.js 22 dependency tree passed:

```text
npm ci
npm run lint
npm run typecheck
npm test          # 7/7
npm run build
npm audit         # 0 vulnerabilities at that checkpoint
```

PR #3 was independently reviewed and approved, then merged to `main` as commit `ff6d02ec0e6b595dd21a3a2841fe51e365f702cc`.

### Not production-ready yet

The project has **not** yet completed real Supabase Auth/PostgreSQL integration or real OpenAI multimodal quality validation. A real OpenAI key should not be deployed to a public environment yet.

## 4. Current code map

Important entry points:

```text
README.md
CONTEXT.md
agent-demand.md

docs/
  PRODUCT_REQUIREMENTS.md
  ARCHITECTURE.md
  DEVELOPMENT_PLAN.md

design-system/
  MASTER.md

src/app/api/analyze/route.ts
src/app/api/nutrition/calculate/route.ts
src/components/meal-workbench.tsx

src/lib/ai/meal-analysis-schema.ts
src/lib/ai/openai-provider.ts
src/lib/ai/heuristic-provider.ts

src/lib/http/read-json-body.ts
src/lib/http/validate-image-data-url.ts

src/lib/nutrition/engine.ts
src/lib/nutrition/food-database.ts

supabase/migrations/0001_initial.sql
```

Use the current repository tree rather than this list if files move later.

## 5. Known findings from the first independent audit

These are the important unresolved findings, ordered roughly by production risk.

### A. Cross-table owner integrity is incomplete

Current RLS checks row-level `owner_id`, but a row can still potentially reference another user's object if the foreign key relationship itself is not owner-bound. The audit specifically identified:

- `meal_items → meals`;
- `ai_analysis_runs → meals`;
- also review `meal_items.food_id` and `meal_items.recipe_id` so private rows cannot cross owners while intended system rows remain usable.

This is the **next development slice**.

### B. Real OpenAI would currently be an unauthenticated paid endpoint

`/api/analyze` calls OpenAI whenever `OPENAI_API_KEY` exists. Until real Auth and per-user usage protection exist, a real key must not be deployed to a public environment.

### C. Image validation is not full image validation

Current code validates request body size, data URL format, decoded size and basic JPEG/PNG/WebP signatures. Magic bytes alone do not prove that a file is complete or decodable. Truncated/malformed image tests and structural/decode validation are still needed.

### D. Generic nutrition fallback is too permissive

Unknown food names currently fall back to a generic home-cooking profile around 150 kcal/100g and can continue through the save flow. Production behavior should instead surface explicit missing-data/low-confidence state or require a user choice.

### E. Food matching can over-authorize a fuzzy match

The current food database lookup uses substring-style alias matching. This can cause a different dish containing an alias to inherit the wrong nutrition profile. Fuzzy understanding belongs in the analyzer/resolver; a trusted nutrition profile should require an explicit canonical/alias resolution result.

### F. Confirmation/provenance is incomplete

`needs_confirmation` exists in the schema, but it is not yet a hard domain/UI gate. User edits can clear confirmation without preserving complete provenance, and assumptions/confidence can become stale after edits.

### G. Local persistence needs resilience/versioning

`localStorage.setItem()` errors are not yet surfaced to the user, and stored arrays are not runtime-validated/versioned. This is acceptable for the demo, not for a production-quality fallback/local cache.

## 6. Approved immediate development order

The detailed plan lives in `docs/DEVELOPMENT_PLAN.md`. The current order is:

```text
S0  dependency security baseline          DONE
 ↓
S1  database authority / owner integrity  NEXT
 ↓
S2  confirmation + nutrition correctness
 ↓
S3  image + local persistence hardening
 ↓
S4  Supabase Auth + PostgreSQL adapter
 ↓
S5  real OpenAI quality slice
 ↓
M5  real-user validation / V1 release gate
```

### S1 scope guard

The next implementation PR should stay narrowly scoped to database authority/integrity:

- define allowed owner relationships for each relevant FK;
- enforce them at the database boundary;
- add two-user adversarial tests;
- keep current demo/API/UI behavior unchanged.

Do **not** mix Supabase login UI, real OpenAI calls, nutrition redesign or new product features into that PR.

## 7. Review and development conventions

For security/hardening work:

1. Use a dedicated branch/PR rather than editing `main` directly;
2. state exact base/head when requesting independent review;
3. list changed files and explicit non-goals;
4. run at minimum:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

5. dependency changes also run `npm audit`;
6. database changes require owner/RLS/integrity regression tests;
7. input-boundary changes require adversarial malformed-input tests;
8. do not mark a checklist item PASS because the design intends it—PASS needs executable evidence.

## 8. Product non-goals for V1

Do not expand V1 into:

- social/community features;
- marketplace/commerce;
- weight-loss courses;
- complex fitness-device synchronization;
- medical diagnosis or medical-grade nutrition claims;
- autonomous always-on AI coach;
- infrastructure work unrelated to the core meal-recording loop.

## 9. Brand and naming

The canonical name is **MealNote**. The old Chinese working name “吃记” has been retired. Do not reintroduce old brand/package/directory naming in code, docs, metadata or deployment configuration.

## 10. How to resume work

A new developer or agent should read, in this order:

1. `CONTEXT.md` — current handoff state and known risks;
2. `docs/PRODUCT_REQUIREMENTS.md` — what the product should do;
3. `docs/ARCHITECTURE.md` — system boundaries and data ownership;
4. `docs/DEVELOPMENT_PLAN.md` — current implementation sequence;
5. the current branch diff and tests — actual source of truth for the task at hand.

If the repository has materially changed since this file's last curated date, update this context as part of the next planning/documentation pass.
