# S3.5-B missing-item recovery evaluation

## Goal

Allow a user on the meal confirmation screen to add a food omitted by analysis by selecting an existing trusted MealNote food/catalog profile, then review its grams and oil before nutrition calculation.

## Scope

- Add deterministic, bounded catalog search over canonical names and curated aliases.
- Add a mobile-first, progressively disclosed “add missing food” control to the confirmation screen.
- Create user-added review items without manufacturing AI recognition authority.
- Preserve calculation invalidation, explicit confirmation, and exact catalog resolution.
- Do not add catalog profiles, fuzzy nutrition authority, Auth, OpenAI, database, or persistence architecture work.

## Acceptance criteria

1. The confirmation screen exposes a keyboard- and touch-accessible “add missing food” action.
2. Empty or partial search text can discover only existing catalog profiles; aliases lead to the canonical profile.
3. Selecting a result appends exactly one item with the profile default grams and safe oil default (`none` for food, `unknown` for recipes), both labeled as client-reported `review-derived` values.
4. A user-added item is distinguishable from AI analysis, starts with zero recognition confidence, and requires explicit confirmation before calculation.
5. Editing or adding an item invalidates any prior nutrition result/request and does not disturb the other reviewed items.
6. Unknown search text cannot create an item or reach nutrition authority.
7. Existing remove, edit, acknowledgement, stale-response, Nutrition Engine, S2 authority, S3 persistence, and S3.5-A baseline tests remain green.
8. The interaction has no horizontal overflow at 375 px, all new controls meet a 44 px touch target, labels/focus/error or empty states are present, and dark/reduced-motion modes remain usable.

## Automated verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=low
git diff --check
```

## Manual browser checks

- Sign into the local demo, analyze a meal, open “add missing food,” search by canonical name and alias, add a recipe, confirm it, calculate, and verify the result includes the added item.
- Search for an unknown food and verify no add path is offered.
- Verify cancel/reopen, item removal, and calculation retry behavior.
- Inspect at 375 px and desktop width, including keyboard focus and dark mode.

## Result

PASS — ready for independent review.

### Automated evidence

- `npm ci`: PASS, 385 packages installed, 0 vulnerabilities.
- `npm run measure:catalog-baseline`: PASS, 1 file / 5 tests; report reproduced after its implementation digest changed, with all baseline metrics unchanged.
- `npm run lint`: PASS with 0 errors and the same 2 pre-existing S2 unused-function warnings in `heuristic-provider.ts`.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 19 files / 157 tests.
- `npm run build`: PASS, all static/dynamic routes built successfully.
- `npm audit --audit-level=low`: PASS, 0 vulnerabilities.
- `git diff --check`: PASS.

Local final verification used Node 23.10.0 because this host does not currently expose a Node 22 binary. The repository CI remains pinned to Node 22 and must pass on the pushed PR before merge.

### Browser evidence

Headless Chromium at 375×812 completed the real UI path:

1. entered the local demo and analyzed `半碗米饭`;
2. opened the missing-food panel and received keyboard focus in search;
3. searched an unknown home dish and confirmed no result/add authority was offered;
4. searched alias `西红柿`, selected canonical `番茄炒蛋`, and received a second read-only catalog identity card;
5. verified calculation remained disabled until explicit confirmation;
6. confirmed, calculated, and saw `番茄炒蛋 → 番茄炒蛋` in calculation evidence;
7. returned to review, removed the added item, and verified stale success state cleared;
8. repeated panel rendering in dark mode with reduced motion;
9. verified no horizontal overflow and no browser console errors.

### Similar-pattern review

Repository-wide search found no other nutrition catalog search path. The only substring logic remains in heuristic candidate construction; Nutrition Engine authority still routes exclusively through exact canonical/curated-alias `resolveFoodProfile` matching.
