# Task Eval: S3.5 corpus contract and baseline

## Goal

- Establish a trustworthy, reproducible text/heuristic evaluation baseline before any production catalog, UI, OpenAI, or Auth change.

## Acceptance Criteria

- [x] The corpus has an explicit schema version, synthetic-data provenance, no personal data, and a frozen `discovery` / `holdout` split.
- [x] All nine approved categories contain at least 10 unique meals, with at least 3 holdout meals per category.
- [x] Every entry ID and normalized input is unique; every `(mention, occurrence)` resolves deterministically inside its input and expected spans do not overlap.
- [x] Broad text such as `排骨` is not mislabeled as a specific recipe such as `红烧排骨`.
- [x] Portion ranges are marked as heuristic labels with an explicit basis and are not used as nutrition truth or a release gate.
- [x] The baseline distinguishes extraction recall, specific-identity catalog coverage, safe confirmation, silent wrong canonicalization, omissions, trusted extras, and current-UI recoverability.
- [x] Alignment is deterministic and fail-closed: longest source mention wins, repeated identical mentions pair in occurrence order, and genuinely ambiguous/no-evidence candidates remain unaligned.
- [x] The report records the engine revision/digest, corpus digest, provider, catalog count/digest, metric numerators/denominators, and discovery/holdout breakdowns.
- [x] Silent wrong canonicalization and unattributed trusted candidates are both zero. Passing these gates does not replace the later collision audit or nutrition-source review.
- [x] No runtime production behavior, catalog entry, UI, OpenAI contract, database, or Auth code changed in this task.

## Verification

- Command: `npm run measure:catalog-baseline`
- Expected: corpus validation and checked-in baseline report comparison pass.
- Command: `npm run lint`
- Expected: 0 errors.
- Command: `npm run typecheck`
- Expected: pass.
- Command: `npm test`
- Expected: all existing and new tests pass.
- Command: `npm run build`
- Expected: production build passes.
- Command: `npm audit --audit-level=low`
- Expected: 0 vulnerabilities.
- Command: `git diff --check`
- Expected: no whitespace errors.

## Manual Checks

- [x] Review category counts, discovery/holdout balance, and the highest-miss examples in the generated report.
- [x] Confirm report language does not claim image, voice, OpenAI, real-user time, or nutrition accuracy.
- [x] Confirm only S3.5-A evaluation/docs/fixture files and the package script changed.

## Result

- Status: PASS
- Evidence:
  - Node 22.19.0 clean `npm ci`: 0 vulnerabilities.
  - `npm run measure:catalog-baseline`: 1 file / 5 tests passed and checked-in report matched exactly.
  - `npm run lint`: 0 errors; 2 unchanged S2 baseline warnings.
  - `npm run typecheck`: passed.
  - `npm test`: 19 files / 147 tests passed.
  - `npm run build`: production build passed.
  - `npm audit --audit-level=low`: 0 vulnerabilities.
  - `git diff --check`: passed.
  - Baseline: 90 meals / 112 expected mentions; extraction recall 58.9%; specific-identity catalog coverage 49.5%; current-UI recoverability 41.1%; silent wrong and unattributed trusted candidate counts both 0.
- Remaining risks:
  - Synthetic text fixtures can establish deterministic regression behavior but cannot prove real-user distribution or the 10-second product promise.
  - Current heuristic extraction and seven-profile catalog coverage remain intentionally low; the next product slice must add missing-item recovery before any source-reviewed catalog batch.
