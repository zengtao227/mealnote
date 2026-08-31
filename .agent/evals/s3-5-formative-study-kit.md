# Task Eval: S3.5 formative usability study kit

## Goal

- Make the approved five-person, six-task formative usability gate executable and reproducible without adding production telemetry or collecting participant identity/free text.

## Acceptance Criteria

- [x] The protocol fixes five supported-flow tasks plus one unsupported-food guardrail task before fieldwork.
- [x] Timing starts at the participant's first product interaction after reading the prompt and ends only on successful save, abandonment, or the guardrail stop condition.
- [x] The data model stores only pseudonymous participant codes, fixed task IDs, duration, enumerated outcome/actions/issues, and an authority-violation flag.
- [x] Participant identity is a closed schema enum containing only the predeclared `P001` through `P005` slots.
- [x] Session validation is strict, rejects unknown/free-text fields, requires all six tasks exactly once, and enforces one of the predeclared task rotations.
- [x] Study aggregation requires five unique completed sessions and fails closed as `FIELDWORK_INCOMPLETE` before that point.
- [x] Primary metrics report supported-task save completion plus saved-task median/P90 duration; driver metrics report review actions and issue distribution.
- [x] The S4 decision is `NO_GO` for any nutrition-authority violation or any supported task completed by fewer than four of five participants.
- [x] The S4 decision is also `NO_GO` if fewer than four of five participants reach the explicit safe-rejection outcome on the unsupported-food guardrail.
- [x] A median above the PRD's 10-second target is reported as a finding, not silently converted into success and not treated as release-level validation.
- [x] No participant result data is committed; the results directory is ignored while a non-personal template remains versioned.
- [x] Production UI, Auth, OpenAI, database, image, persistence, and nutrition authority paths remain unchanged.
- [x] Development-plan/proposal status reflects PR #13 as merged and fieldwork as the next blocked gate; `CONTEXT.md` remains untouched to avoid the mandatory cross-project catalog sync in this MealNote-only slice.

## Verification

- Command: `npm run test:formative-study`
- Expected: schema, aggregation, percentile, privacy, incomplete-fieldwork, and decision-gate tests pass.
- Command: `npm run lint`
- Expected: 0 errors; only documented pre-existing warnings are allowed.
- Command: `npm run typecheck`
- Expected: pass.
- Command: `npm test`
- Expected: full suite passes.
- Command: `npm run build`
- Expected: production build passes.
- Command: `npm audit --audit-level=low`
- Expected: 0 vulnerabilities.
- Command: `git diff --check`
- Expected: no whitespace errors.

## Manual Checks

- [x] Confirm task wording contains no participant/customer data and does not disclose nutrition answers.
- [x] Confirm the template contains no name, email, timestamp, raw meal text, notes, or arbitrary-string observation field.
- [x] Confirm running the CLI against an empty/missing results directory does not claim the gate passed.
- [x] Confirm no production runtime file changed.

## Result

- Status: PASS
- Evidence:
  - Node 22.19.0 / npm 10.9.3.
  - Formative-study gate tests: 1 file / 11 tests PASS.
  - Empty results directory: `FIELDWORK_INCOMPLETE`, process exit 2 as required.
  - Lint PASS with 0 errors and 2 unchanged pre-existing warnings; typecheck PASS.
  - Full suite: 21 files / 182 tests PASS; production build PASS.
  - `npm audit --audit-level=low`: 0 vulnerabilities; `git diff --check`: PASS.
  - Changed-file audit confirms no `src/app`, `src/components`, API, Auth, OpenAI, database, image, persistence, or Nutrition Engine runtime file changed.
- Remaining risks:
  - Real participant fieldwork is not yet performed and cannot be simulated by automated tests; the product-value gate therefore remains `FIELDWORK_INCOMPLETE`.
  - Facilitator stopwatch/action counts can contain observation error; the fixed protocol reduces but cannot eliminate it.
