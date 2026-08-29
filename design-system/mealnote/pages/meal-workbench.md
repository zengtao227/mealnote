# Meal workbench override

This page extends MealNote's Scandinavian/functional food-journal system for the record-and-review workflow.

## Visual direction

- Preserve the existing emerald, warm-white, orange-accent token palette in `src/app/globals.css`.
- Preserve Lora for restrained food-journal headings and Raleway/PingFang SC for interface copy.
- Prefer visible borders and soft solid surfaces over low-contrast neumorphic shadows.
- Maintain the existing single-column mobile workflow and numbered food cards.

## Missing-item recovery

- Place one secondary “新增遗漏食物” action directly after the analyzed food list.
- Reveal the catalog search inline; do not use a modal or navigate away from the review state.
- Give the search input a persistent label and short authority explanation.
- Render catalog matches as full-width buttons with canonical name, kind, and matching alias when relevant.
- An unknown query has a clear empty state and no free-text add action.
- After selection, append a standard food card and require explicit confirmation of its default portion.

## Interaction and accessibility

- All new buttons and inputs are at least 44 px high.
- Use semantic buttons, labels, status text, and visible focus states.
- Focus the search field when the panel opens; return focus to the add action when it closes.
- Keep the layout usable at 375 px without horizontal scrolling.
- Reuse existing dark-mode tokens and reduced-motion behavior.
