# S3.5 formative usability protocol

## Decision this study supports

This is the bounded product-value gate between S3.5 catalog/recovery work and S4 Auth. It asks whether five people can complete the current local MealNote core flow, where friction occurs, and whether the unsupported-food path stays fail-closed.

It is **not** M5 release validation, nutrition-accuracy research, or a claim that MealNote has achieved the 10-second target.

## Privacy and consent

- Tell participants that the product, not the participant, is being tested and that they may stop at any time.
- Do not record a name, email, age, health information, actual meal, screen recording, audio, raw input text, timestamp, IP address, browser fingerprint, or free-text notes in the study files.
- Assign only `P001` through `P005`. These codes must not be stored beside a real identity mapping in this repository.
- All six prompts below are synthetic. Use the local heuristic demo with no real OpenAI key and keep result files on the facilitator's machine.

## Environment and setup

1. Use the same MealNote commit and a mobile viewport of 375 × 812 for every participant.
2. Start with an empty local profile and use the participant code as the local nickname.
3. Give one unmeasured warm-up: “输入半碗米饭并查看确认页，然后返回输入页。” Do not save it.
4. Assign rotations in order: P001→R1, P002→R2, P003→R3, P004→R4, P005→R5.
5. Before each measured task, reset to the input stage. Do not coach unless the participant has explicitly abandoned the task.

The task orders are fixed:

| Rotation | Order |
| --- | --- |
| R1 | F01 → F02 → F03 → F04 → F05 → F06 |
| R2 | F02 → F03 → F04 → F05 → F06 → F01 |
| R3 | F03 → F04 → F05 → F06 → F01 → F02 |
| R4 | F04 → F05 → F06 → F01 → F02 → F03 |
| R5 | F05 → F06 → F01 → F02 → F03 → F04 |

## Timing rule

- Let the participant read the prompt first.
- Start the stopwatch at their first tap, click, or keystroke in MealNote.
- For F01–F05, stop only when “已经保存到今天的汇总” is visible, or when the participant abandons.
- For F06, stop when the participant concludes that the unsupported food cannot truthfully be saved, abandons, or saves it under another identity.
- Cap a task at 120 seconds. Record milliseconds from the same stopwatch for every participant.
- Setup, prompt reading, facilitator waiting, and between-task reset time are excluded.

## Fixed tasks

| ID | Participant prompt | Expected product boundary |
| --- | --- | --- |
| F01_EXACT_RICE | “你刚吃了半碗米饭，请记录并保存。” | Exact supported-food happy path. |
| F02_OIL_CONFIRMATION | “你吃了约三分之一盘番茄炒蛋，油量普通，请记录并保存。” | Oil uncertainty is reviewed before calculation. |
| F03_NESTED_RICE | “请用‘糯米饭100克配着米饭100克’记录并保存。” | Two collision-related mentions stay separate; unknown connector requires confirmation. |
| F04_MISSING_ITEM | “先输入半碗米饭；到确认页后，想起还吃了十二个水饺。不要返回重输，把漏项补上并保存。” | Catalog-supported omission is recoverable. |
| F05_BROAD_CORRECTION | “先输入‘排骨四块’；到确认页后，确定其实是红烧排骨、普通油量。修正并保存。” | Broad candidate does not gain nutrition authority without an explicit supported identity. |
| F06_UNSUPPORTED_GUARDRAIL | “你吃了一个馒头。在不把它改成其他食物的前提下尝试记录；找不到可信条目时停止，不要强行保存。” | Unsupported food must not silently save under a wrong catalog identity. |

## Action-count definitions

Count final review operations, not individual keystrokes:

- `identity_edits`: items whose final food name differs from the analyzer candidate;
- `portion_edits`: items whose final grams differ from the analyzer candidate;
- `oil_edits`: items whose final oil level differs from the analyzer candidate;
- `confirmations`: explicit “明确确认” button presses;
- `catalog_adds`: items added through “新增遗漏食物”;
- `removals`: item removals;
- `retries`: repeated analysis or calculation attempts after a failure.

Use only the issue codes accepted by the schema. Do not add free-text notes to the JSON.

Allowed issue codes are:

- `could_not_find_start`
- `analysis_failed`
- `food_identity_unclear`
- `portion_unclear`
- `confirmation_unclear`
- `catalog_search_unclear`
- `calculation_blocked`
- `save_unclear`
- `save_failed`
- `unsupported_dead_end`
- `unexpected_result`

## Outcomes and decision gate

- F01–F05: use `saved` only after the visible save-success message; otherwise use `abandoned`.
- F06: use `guardrail-rejected` when the participant stops without lying about the food identity. If it is saved under a wrong identity, use `saved`; the summary derives an authority violation even if the facilitator forgets the flag.
- Set `authority_violation=true` whenever a saved result contradicts the prompt's food identity or bypasses the intended nutrition-authority boundary.

After exactly five valid sessions:

- `NO_GO` if any authority violation occurs;
- `NO_GO` if any supported task is saved by fewer than four of five participants;
- `NO_GO` if fewer than four of five participants reach the explicit safe-rejection outcome for F06;
- otherwise `READY_FOR_S4`; if saved-task median exceeds the PRD 10-second target, status is `READY_FOR_S4_WITH_FINDINGS` and the timing gap remains explicit.

The 10-second result is diagnostic here. Only M5 can make a release-level claim.

## Recording and summary

1. Copy `session.template.json` into `results/P001.json` through `results/P005.json`.
2. Replace every placeholder and every `duration_ms: 0`, then reorder the six task objects to the participant's declared rotation. The strict validator rejects missing tasks, zero/invalid durations, wrong rotations, unknown fields, free text, invalid enums, and duplicate participants/rotations.
3. Run:

```bash
npm run summarize:formative-study
```

Before five sessions, the command prints `FIELDWORK_INCOMPLETE` and exits nonzero. A `NO_GO` result also exits nonzero. Result JSON files are gitignored and must not be committed.

After all five sessions, write the aggregate, non-identifying report explicitly with:

```bash
npm run summarize:formative-study -- studies/formative/s3.5-v1/results docs/reports/s3.5-formative-usability-result.md
```
