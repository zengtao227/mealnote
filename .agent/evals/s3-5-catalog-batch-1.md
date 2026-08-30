# Task Eval: S3.5 catalog batch 1

## Goal

- Add the smallest discovery-miss-driven catalog batch with auditable nutrition authority, starting with cooked plain glutinous rice (`糯米饭`).

## Acceptance Criteria

- [x] Selection is supported only by the frozen discovery split: `糯米饭` is the highest-frequency discovery catalog gap at 3 mentions; no holdout identity drives selection.
- [x] Nutrition values match the Japanese Standard Tables of Food Composition 2023 supplement, item 01154, cooked well-milled glutinous rice, per 100 g: 188 kcal, 3.5 g protein, 0.5 g fat, 43.9 g carbohydrate.
- [x] `source_ref` identifies the government table, edition, item number, food state, and stable source URL.
- [x] No unverified alias is added; regional names such as `江米饭` remain unresolved.
- [x] `米饭` and `糯米饭` remain distinct exact Nutrition Engine authorities.
- [x] The `米饭 ⊂ 糯米饭` relationship has exactly one collision declaration and passes real heuristic regression in both orders with an unenumerated connector.
- [x] Existing compound protections remain fail closed, including `蛋炒米饭` not resolving as either rice profile.
- [x] The corpus and holdout membership do not change.
- [x] Regenerated measurement keeps silent wrong canonicalization and unattributed trusted candidates at zero.
- [x] The report shows 8 profiles, an unchanged corpus digest, and the expected discovery-only catalog-coverage improvement.
- [x] A durable nutrition-source review records included values, source matching, portion-model boundary, and deferred candidates.

## Verification

- Command: `npm run measure:catalog-baseline`
- Expected: deterministic report matches the checked-in artifact; authority gates remain zero.
- Command: `npm run lint`
- Expected: 0 errors; only documented pre-existing warnings are allowed.
- Command: `npm run typecheck`
- Expected: pass.
- Command: `npm test`
- Expected: all tests pass, including catalog collision and nutrition calculation coverage.
- Command: `npm run build`
- Expected: production build passes.
- Command: `npm audit --audit-level=low`
- Expected: 0 vulnerabilities.
- Command: `git diff --check`
- Expected: no whitespace errors.

## Manual Checks

- [x] Confirm only `糯米饭` is added to `FOOD_PROFILES` and no existing nutrition values change.
- [x] Confirm the source page describes cooked glutinous rice rather than raw rice or rice cake.
- [x] Confirm no UI, Auth, OpenAI, database, image, or persistence files change.

## Result

- Status: PASS
- Evidence:
  - Source reviewed at `https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01154_7`; exact table values and source reference are asserted in tests.
  - Node 22.19.0 / npm 10.9.3: deterministic baseline update + verification PASS.
  - Baseline: 8 profiles, unchanged corpus digest, 58/111 catalog coverage, 0 silent wrong, 0 unattributed trusted candidates.
  - Lint PASS with 0 errors and 2 unchanged pre-existing warnings; typecheck PASS.
  - 20 test files / 171 tests PASS; production build PASS.
  - `npm audit --audit-level=low`: 0 vulnerabilities; `git diff --check`: PASS.
- Remaining risks:
  - `糯米饭` is a plain cooked-food profile only; mixed, sweetened, filled, or recipe variants remain unsupported.
  - Default/bowl grams and uncertainty remain V1 product heuristics rather than claims from the composition table.
