# MealNote Project Context

**Last curated:** 2026-08-27
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

PR #6 completed S2 confirmation + nutrition correctness hardening and merged to `main` as `5c0fb4b70d0a16c29a2e182c995f4eb5582bea82`. During independent review it went through three valid NO-GO rounds before approval and merge:

- head `575b87bb75cf98af3cfe48f1a183e07f8eb3a435`: stale in-flight calculation responses, heuristic substring-to-canonical promotion, and client-reported provenance described too strongly;
- head `3e7fcfe2837a22381becf0a0c3b3d89307039866`: candidate classification/suppression was still meal-global per food profile, allowing a trusted mention in one clause to authorize or suppress another clause;
- head `b471bd62ccf75a3b2a455c65553f1c764dc07831`: clause segmentation itself was still an authority boundary, so user-controlled unenumerated joiners such as `以及 / 与 / 还有` could leave two mentions in one segment and recreate fuzzy-to-canonical promotion.

The merged S2 baseline addresses all known S2 findings:

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
npm test             # 10 files / 55 tests  (S2 checkpoint only — see PR #7 below for current totals)
npm run build
bash scripts/test-db-owner-integrity.sh
git diff --check origin/main...HEAD
```

All passed. New mention-span coverage includes `以及 / 与 / 还有` in both orders, both `糯米饭` and `蛋炒米饭`, broad/trusted ribs without punctuation segmentation, and repeated trusted rice mentions with independent portions. Independent rereview approved the final S2 candidate, and PR #6 is now merged into the exact S3 base `5c0fb4b70d0a16c29a2e182c995f4eb5582bea82`.

PR #7 completed S3 input + local-persistence hardening and squash-merged to `main` as `2afd0dc3c633636a050c60a69c1d85ec3fa0664e`. It was reviewed on the exact range `5c0fb4b…706070e` (1 commit / 25 changed files). Three blockers found during review were closed before approval: a corrupt-second-frame WebP is now detected as multi-frame and rejected before any provider runs; an 11,237-byte 6000x6000 PNG is rejected at the metadata pixel guard without ever creating a raw decode pipeline; and the previous raw `SavedMeal[]` format is read back and lazily migrated to the V1 envelope on the next successful save.

Verification on the merged candidate (Node 22, npm `npm ci` 0 vulnerabilities): lint 0 errors, typecheck, **18 files / 142 tests**, production build, `npm audit --audit-level=low` 0 vulnerabilities, and `git diff --check`. A real production-browser run covered the legacy-to-V1 migration path and the `QuotaExceededError` path end-to-end: the stored bytes, today's summary and the current meal state are unchanged on a failed save, and the retry after recovery saves exactly once. The remaining local-persistence fail-closed branches (invalid JSON, unknown `schema_version`, malformed nutrition snapshot, `getItem` throwing) are unit-covered rather than browser-covered.

PR #8 added the repository's first reusable CI workflow, merged as `80ebd37fdfb002672ad7b18c14509def9f29506f`. `.github/workflows/ci.yml` runs `npm ci`, lint, typecheck, test, build and `npm audit --audit-level=low` on Node 22 for every pull request and every push to `main`. Do not add per-PR throwaway verification workflows; reuse this one.

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
src/lib/storage/local-meal-storage.ts

src/lib/nutrition/engine.ts
src/lib/nutrition/food-database.ts
src/lib/nutrition/request-guard.ts
src/lib/nutrition/review.ts

fixtures/meal-corpus/
src/lib/evaluation/meal-corpus.ts
docs/reports/s3.5-text-heuristic-baseline.md

supabase/migrations/0001_initial.sql
supabase/migrations/0002_owner_integrity.sql

.github/workflows/ci.yml
```

Use the current repository tree rather than this list if files move later.

## 5. Independent-audit findings and current status

### A. Cross-table owner integrity — CLOSED in S1

PR #5 binds meal relationships to owner-aware foreign keys and enforces private food/recipe ownership at the database boundary. Sequential, privileged/RLS-bypass, concurrent, and failed-migration regression tests passed on PostgreSQL 15.19.

### B. Real OpenAI would currently be an unauthenticated paid endpoint — OPEN

`/api/analyze` calls OpenAI whenever `OPENAI_API_KEY` exists. Until real Auth and per-user usage protection exist, a real key must not be deployed to a public environment.

### C. Image validation is not full image validation — CLOSED in S3

PR #7 retains the streamed request-body limit, data URL/type checks and 5 MiB encoded-image byte cap, and pins the direct decoder dependency at `sharp 0.35.4`. Both metadata inspection and raw decode use the same untrusted-input options: `failOn: "warning"`, a 16 MP `limitInputPixels`, a 4-channel `limitInputChannels`, `unlimited: false`, and a 3-second libvips processing timeout. V1 rejects any `pages !== 1` before a provider can run, so valid animation and malformed later frames cannot pass through a first-frame-only decode. JPEG/PNG/WebP must survive a bounded full single-frame decode, and MIME/signature/decoded format must agree.

The 16 MP / 4-channel / 3-second values are an S3 application-level resource budget, not proof that a public image endpoint is fully DoS-hardened. They close the reproduced 36 MP single-request amplification and later-frame bypass, but `sharp.timeout()` starts only after libvips opens the input and does not bound thread-queue delay or total request lifetime. Outer request deadlines plus deployment-level concurrency, CPU and memory controls remain required before public OpenAI deployment.

### D. Generic nutrition fallback is too permissive — CLOSED in S2

PR #6 removes generic nutrition authority. Unknown or ambiguous names do not manufacture a nutrition result; they fail closed until the user supplies an explicit supported food/recipe.

### E. Food matching can over-authorize or suppress fuzzy candidates — CLOSED in S2

The Nutrition Engine resolver only accepts normalized exact canonical-name / curated exact-alias matches. The heuristic producer now binds candidate authority to individual mention spans rather than whole meals or enumerated clauses. A trusted occurrence can only suppress an overlapping broad occurrence; it cannot authorize, rebind or remove another occurrence elsewhere in the text. Unknown segmentation fails closed. Regression coverage includes all `以及 / 与 / 还有 × 糯米饭 / 蛋炒米饭 × both orders`, broad/trusted ribs, and repeated trusted rice mentions.

### F. Confirmation/provenance/stale result boundary — CLOSED in S2

PR #6 uses a separate review state and explicit acknowledgement gate. User edits clear stale assumptions and invalidate confirmation when required. In-flight calculation results are revision-bound and abortable, so an edit/remove/reset/new analysis invalidates the request before the response can become current nutrition. Because the calculation endpoint has no server-verifiable original analysis binding yet, field provenance, confirmation state and recognition source/confidence are explicitly labeled `client-reported`, not verified audit provenance.

### G. Local persistence needs resilience/versioning — CLOSED in S3

PR #7 stores meals in a strict V1 `{ schema_version, meals }` envelope and validates the full saved nutrition snapshot at runtime. Valid base-version raw arrays are accepted only after the same strict `SavedMeal` validation and are lazily migrated to the V1 envelope on the next successful save. Invalid legacy arrays, invalid JSON, invalid fields/dates/nutrition, unknown versions and storage read/write exceptions fail closed. A failed save leaves the current result/draft and summary unchanged and remains retryable.

## 6. Approved immediate development order

The detailed plan lives in `docs/DEVELOPMENT_PLAN.md`. The current order is:

```text
S0  dependency security baseline          DONE
 ↓
S1  database authority / owner integrity  DONE
 ↓
S2  confirmation + nutrition correctness  DONE (merged PR #6)
 ↓
S3  image + local persistence hardening   DONE (merged PR #7)
 ↓
S3.5-A corpus + heuristic baseline        CURRENT CANDIDATE
 ↓
S3.5-B missing-item recovery + catalog UX
 ↓
S3.5 catalog audit/batch + formative test
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

### S3 scope as merged

PR #7 stayed limited to input/local persistence hardening:

- bounded single-frame structural/decode validation for JPEG/PNG/WebP, including malformed/truncated/corrupt-later-frame and high-pixel fixtures;
- retain the real streamed request-body byte limit;
- add minimal localStorage schema/version runtime validation plus strict compatibility for the previous raw-array format;
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
   CI (`.github/workflows/ci.yml`) runs this same set on every PR — reuse it rather than adding a per-PR workflow;
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

S0-S3 are merged. S3.5 is partially approved: A1/A4 is the current candidate and must be independently reviewed before merge. Its synthetic text/heuristic baseline contains 90 meals / 112 expected mentions and currently reports 58.9% extraction recall, 49.5% specific-identity catalog coverage, 41.1% current-UI-recoverable meals, and zero silent wrong or unattributed trusted candidates. These numbers are deterministic regression evidence only, not real-user or 10-second validation. After A1/A4, implement missing-item recovery + catalog search, then collision audit and a source-reviewed small catalog batch, followed by an early formative usability test. S4 Auth follows that bounded product-value slice; source evidence and OpenAI contract tests remain mandatory before S5 real-key deployment.
