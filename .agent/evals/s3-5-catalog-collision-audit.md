# Task Eval: S3.5 catalog collision audit

## Goal

- Make every future `FOOD_PROFILES` change fail CI when exact authority names collide or when a cross-profile substring relationship lacks executable mention-span regression coverage.

## Acceptance Criteria

- [x] Normalization used by the audit is identical to the exact Nutrition Engine resolver normalization.
- [x] Cross-profile exact canonical/alias collisions always fail closed and cannot be waived by a regression declaration.
- [x] Every strict cross-profile canonical/alias substring collision is detected deterministically.
- [x] Every detected substring collision must have one exact coverage declaration; missing, duplicate, or stale declarations fail closed.
- [x] Each declaration is exercised against `analyzeWithHeuristics()` in both name orders with an explicitly unenumerated connector.
- [x] The current seven-profile catalog passes without changing catalog contents, nutrition values, search behavior, resolver behavior, UI, or persistence.
- [x] Focused tests prove canonical/canonical, canonical/alias, normalization, exact-collision, missing-coverage, duplicate-coverage, and stale-coverage behavior.
- [x] The normal repository test command includes the audit, so the reusable Node 22 CI enforces it without a temporary workflow.
- [x] Documentation records PR #11 as merged and identifies this audit as the next candidate without claiming catalog expansion.

## Verification

- Command: `npm run lint`
- Expected: 0 errors; only documented pre-existing warnings are allowed.
- Command: `npm run typecheck`
- Expected: pass.
- Command: `npm test`
- Expected: all tests pass, including collision audit and dynamic regression cases.
- Command: `npm run build`
- Expected: production build passes.
- Command: `npm audit --audit-level=low`
- Expected: 0 vulnerabilities.
- Command: `git diff --check`
- Expected: no whitespace errors.

## Manual Checks

- [x] Confirm the diff contains no `FOOD_PROFILES` data additions or nutrition-value changes.
- [x] Confirm no UI, Auth, OpenAI, database, image, or persistence files changed.
- [x] Confirm the committed regression registry is empty while the current catalog has no cross-profile substring collisions.

## Result

- Status: PASS
- Evidence:
  - Node `22.19.0` / npm `10.9.3`: `npm ci` completed with 0 vulnerabilities.
  - `npm run lint`: 0 errors; only the two pre-existing unused warnings in `heuristic-provider.ts` remain.
  - `npm run typecheck`: PASS.
  - `npm test`: 20 files / 166 tests PASS, including the new catalog-integrity gate.
  - `npm run build`: PASS on Next.js 16.3.3.
  - `npm audit --audit-level=low`: 0 vulnerabilities.
  - `git diff --check`: PASS.
  - The generated baseline changed only its engine digest; corpus digest, seven-profile catalog digest, metrics, and miss distribution stayed fixed.
- Remaining risks:
  - The current catalog has no cross-profile substring collision, so the production regression registry is intentionally empty. Fake-profile tests prove gate behavior; the first real collision will be required to add and pass both generated heuristic orders before merge.
