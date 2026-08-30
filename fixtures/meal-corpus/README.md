# Meal corpus contract

This directory is the synthetic text corpus for the S3.5 heuristic/catalog baseline. It is regression and decision-support data, not real-user data and not nutrition truth.

## Grain and split

- One JSON file represents one product scenario category.
- One `entry` represents one synthetic meal description.
- One `expected_item` represents one consumed food mention in that description.
- `holdout_entry_ids` freezes the category's holdout set. Every other entry is discovery data.
- Catalog selection may use discovery misses only. Holdout results may be inspected for regression and generalization, but must not drive which catalog rows are added.

## Label semantics

- `identity` is the most specific identity justified by the input text. It may be outside the current catalog.
- `mention` and one-indexed `occurrence` locate the evidence in `input_text` without relying on a provider-generated name.
- `identity_specificity: "broad"` is required when the text does not justify a specific food or recipe. Absence means `specific`.
- `expected_grams_range` is governed by the file-level `portion_label_policy`. V1 labels are heuristic diagnostics only; they are excluded from authority and release gates.
- Every file declares synthetic provenance, no personal data, and label review status.

## Baseline authority rules

- Provider candidates are aligned from their source-like `portion_text`, never from canonical identity first. The longest unmatched mention contained in that evidence wins, preventing `米饭` from stealing the `糯米饭` occurrence.
- Equal longest matches fail closed unless they are repeated occurrences of the same mention; repeated identical mentions are paired in occurrence order.
- Zero or genuinely ambiguous evidence matches remain unaligned instead of being guessed into place.
- An expected item without an aligned provider candidate is an omission. Since S3.5-B, an analyzed meal remains recoverable when every omission has an exact catalog identity that the user can add and explicitly confirm; analysis failures and broad or unsupported identities remain unrecoverable.
- A wrong resolved canonical with `needs_confirmation === false` is silent wrong canonicalization and blocks catalog expansion.
- A trusted candidate that cannot be attributed to one expected mention is also a blocker.

Run `npm run measure:catalog-baseline` to validate the corpus and compare the current result with the checked-in report.
