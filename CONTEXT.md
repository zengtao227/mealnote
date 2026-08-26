# MealNote Project Context

**Last curated:** 2026-08-26
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

As of 2026-08-26:

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
- Supabase/PostgreSQL schema, RLS, and owner-integrity migration/regression harness.

### Verified hardening checkpoints

PR #3 upgraded Next.js / eslint-config-next from 16.2.7 to 16.3.3 and passed clean Linux + Node.js 22 install, lint, typecheck, tests, production build, and `npm audit` with 0 vulnerabilities at that checkpoint. It merged as `ff6d02ec0e6b595dd21a3a2841fe51e365f702cc`.

PR #5 closed S1 database owner-integrity boundaries. It was independently re-reviewed after concurrency and migration-failure fixes, then squash-merged to `main` as `bbb7314970596bd3a753b94ebbdd119ea4027a19`. The database boundary now includes owner-aware meal foreign keys, serialized private catalog ownership checks, privileged-write coverage, and fail-closed migration tests.

PR #6 is the current S2 confirmation + nutrition correctness review candidate. Independent review has produced three valid NO-GO rounds before the current rereview candidate:

- head `575b87bb75cf98af3cfe48f1a183e07f8eb3a435`: stale in-flight calculation responses, heuristic substring-to-canonical promotion, and client-reported provenance described too strongly;
- head `3e7fcfe2837a22381becf0a0c3b3d89307039866`: candidate classification/suppression was still meal-global per food profile, allowing a trusted mention in one clause to authorize or suppress another clause;
- head `b471bd62ccf75a3b2a455c65553f1c764dc07831`: clause segmentation itself was still an authority boundary, so user-controlled unenumerated joiners such as `以及 / 与 / 还有` could leave two mentions in one segment and recreate fuzzy-to-canonical promotion.

The current branch addresses all known S2 findings:

- calculation requests use an abortable revision guard; edits, removals, acknowledgement changes, reset, return-to-input and new analysis invalidate the active calculation, and stale responses cannot commit nutrition;
- exact Nutrition Engine resolution remains unchanged and fail-closed;
- heuristic candidate construction is now mention-span based rather than meal- or clause-global: every alias occurrence keeps its own start/end span, portion context, trusted/embedded classification and deduplication identity;
- broad-candidate suppression only applies when that broad occurrence actually overlaps a trusted occurrence, rather than when the same food family appears elsewhere in the meal;
- compound occurrences such as the `米饭` inside `糯米饭` or `蛋炒米饭` remain unresolved even when a separate plain-rice occurrence is trusted;
- known joiners are recognized only to preserve normal trusted-mention UX; unknown joiners do not create authority and instead fail closed, so security does not depend on an exhaustive connector list;
- repeated mentions of the same trusted profile remain separate, e.g. `半碗米饭以及一碗米饭` preserves independent 100 g and 200 g candidates;
- review provenance, confirmation state and recognition metadata remain explicitly marked `client-reported`; they are not described as verified audit provenance until a future server-side analysis binding exists.

The mention-span rereview-fix content tree was verified on Linux / Node.js 22.23.2 / PostgreSQL 15.19 with:

```text
npm ci              # 0 vulnerabilities
npm run lint
npm run typecheck
npm test             # 10 files / 55 tests
npm run build
bash scripts/test-db-owner-integrity.sh
git diff --check origin/main...HEAD
```

All passed. New mention-span coverage includes `以及 / 与 / 还有` in both orders, both `糯米饭` and `蛋炒米饭`, broad/trusted ribs without punctuation segmentation, and repeated trusted rice mentions with independent portions. S2 is still not considered merged or approved until independent rereview approves PR #6.

### Not production-ready yet

The project has **not** yet completed real Supabase Auth/PostgreSQL application integration or real OpenAI multimodal quality validation. A real OpenAI key should not be deployed to a public environment yet.

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
src/lib/nutrition/request-guard.ts
src/lib/nutrition/review.ts

supabase/migrations/0001_initial.sql
supabase/migrations/0002_owner_integrity.sql
```

Use the current repository tree rather than this list if files move later.

## 5. Independent-audit findings and current status

### A. Cross-table owner integrity — CLOSED in S1

PR #5 binds meal relationships to owner-aware foreign keys and enforces private food/recipe ownership at the database boundary. Sequential, privileged/RLS-bypass, concurrent, and failed-migration regression tests passed on PostgreSQL 15.19.

### B. Real OpenAI would currently be an unauthenticated paid endpoint — OPEN

`/api/analyze` calls OpenAI whenever `OPENAI_API_KEY` exists. Until real Auth and per-user usage protection exist, a real key must not be deployed to a public environment.

### C. Image validation is not full image validation — OPEN

Current code validates request body size, data URL format, decoded size and basic JPEG/PNG/WebP signatures. Magic bytes alone do not prove that a file is complete or decodable. Truncated/malformed image tests and structural/decode validation are still needed.

### D. Generic nutrition fallback is too permissive — ADDRESSED in S2 candidate

PR #6 removes generic nutrition authority. Unknown or ambiguous names do not manufacture a nutrition result; they fail closed until the user supplies an explicit supported food/recipe.

### E. Food matching can over-authorize or suppress fuzzy candidates — ADDRESSED in current S2 candidate, pending rereview

The Nutrition Engine resolver only accepts normalized exact canonical-name / curated exact-alias matches. The heuristic producer now binds candidate authority to individual mention spans rather than whole meals or enumerated clauses. A trusted occurrence can only suppress an overlapping broad occurrence; it cannot authorize, rebind or remove another occurrence elsewhere in the text. Unknown segmentation fails closed. Regression coverage includes all `以及 / 与 / 还有 × 糯米饭 / 蛋炒米饭 × both orders`, broad/trusted ribs, and repeated trusted rice mentions.

### F. Confirmation/provenance/stale result boundary — ADDRESSED in S2 candidate, pending rereview

PR #6 uses a separate review state and explicit acknowledgement gate. User edits clear stale assumptions and invalidate confirmation when required. In-flight calculation results are revision-bound and abortable, so an edit/remove/reset/new analysis invalidates the request before the response can become current nutrition. Because the calculation endpoint has no server-verifiable original analysis binding yet, field provenance, confirmation state and recognition source/confidence are explicitly labeled `client-reported`, not verified audit provenance.

### G. Local persistence needs resilience/versioning — OPEN

`localStorage.setItem()` errors are not yet surfaced to the user, and stored arrays are not runtime-validated/versioned. This remains S3 work.

## 6. Approved immediate development order

The detailed plan lives in `docs/DEVELOPMENT_PLAN.md`. The current order is:

```text
S0  dependency security baseline          DONE
 ↓
S1  database authority / owner integrity  DONE
 ↓
S2  confirmation + nutrition correctness  REREVIEW (PR #6)
 ↓
S3  image + local persistence hardening   NEXT after S2 approval/merge
 ↓
S4  Supabase Auth + PostgreSQL adapter
 ↓
S5  real OpenAI quality slice
 ↓
M5  real-user validation / V1 release gate
```

### Current S2 scope guard

PR #6 must stay limited to confirmation and nutrition correctness:

- unknown/broad/compound candidates cannot become hidden nutrition authority;
- trusted profile resolution is exact canonical/curated alias only;
- heuristic candidate authority, suppression and deduplication must be bound to individual mention spans rather than meal-global or clause-global state;
- one trusted mention cannot canonicalize, rebind or suppress a non-overlapping compound/broad mention;
- unknown segmentation must fail closed rather than depend on an exhaustive connector list;
- `needs_confirmation` is a real UI/domain/API gate;
- in-flight calculation responses cannot outlive the review revision they were calculated from;
- user edits clear stale assumptions; provenance/recognition metadata are explicitly client-reported until server-verifiable binding exists;
- representative and adversarial regression tests prove deterministic and fail-closed behavior.

Do **not** mix Supabase Auth, real OpenAI deployment, image decode hardening, localStorage resilience/versioning, database-schema redesign, or product expansion into S2.

### S3 scope after S2 merge

The next implementation slice should only address input/local persistence hardening:

- structural/decode validation for JPEG/PNG/WebP, including malformed/truncated fixtures;
- retain the real streamed request-body byte limit;
- add minimal localStorage schema/version runtime validation;
- surface local save failures while preserving the current draft for retry.

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
8. async state changes require stale-response/deferred-result tests when a network response can overwrite mutable user state;
9. candidate/authority work must test upstream producer + downstream resolver together, including repeated mentions, unsplit joiners, both ordering directions and unknown-segmentation fail-closed behavior;
10. do not mark a checklist item PASS because the design intends it—PASS needs executable evidence.

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

If PR #6 has since been approved/merged, update S2 to DONE and make S3 the sole next implementation priority before beginning new work.