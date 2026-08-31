# Task Eval: S3.5 OpenAI provider contract baseline

## Goal

- Give the existing OpenAI Responses provider and `/api/analyze` fallback boundary executable coverage before any real API key is deployed, without changing production behavior.

## Acceptance Criteria

- [x] Tests prove the provider sends the existing strict `meal_analysis` JSON schema and does not add nutrition-truth authority.
- [x] Supported, unknown, and compound food names are preserved exactly as returned; unknown/compound names do not silently gain catalog authority.
- [x] Unexpected nutrition fields, untrusted catalog suggestions, malformed JSON, and missing structured output fail closed.
- [x] Missing API configuration and HTTP/timeout failures reject without making a real network request.
- [x] `/api/analyze` returns OpenAI output on success, falls back to text heuristics on provider failure, and returns a safe 502 for image-only failure.
- [x] No real API key, recorded customer payload, production dependency, production runtime change, Auth, database, UI, or Nutrition Engine change is introduced.

## Verification

- Command: `npm run lint`
- Expected: 0 errors; only documented unchanged warnings are allowed.
- Command: `npm run typecheck`
- Expected: pass.
- Command: `npm test`
- Expected: all provider, route, authority, and existing regression tests pass.
- Command: `npm run build`
- Expected: production build passes.
- Command: `npm audit --audit-level=low`
- Expected: 0 vulnerabilities.
- Command: `git diff --check`
- Expected: no whitespace errors.

## Manual Checks

- [x] Confirm every network call is intercepted by a local Vitest mock.
- [x] Confirm test fixtures contain synthetic food descriptions only.
- [x] Confirm the diff contains no production runtime file changes.
- [x] Confirm fieldwork remains incomplete and this test slice does not claim to unlock S4 or S5.

## Result

- Status: PASS
- Evidence:
  - Node 22.19.0 / npm 10.9.3.
  - Focused provider + route boundary tests: 2 files / 11 tests PASS.
  - Lint PASS with 0 errors and 2 unchanged pre-existing warnings; typecheck PASS.
  - Full suite: 22 files / 190 tests PASS; production build PASS.
  - `npm audit --audit-level=low`: 0 vulnerabilities; `git diff --check`: PASS.
  - Changed-file audit confirms that only two test files and this task eval changed.
- Remaining risks:
  - `source_evidence` and server-validated text spans remain a separate implementation slice.
  - Real-model quality and latency remain unmeasured until Auth and usage protection permit a controlled real-key evaluation.
