# MealNote design system

> Global source of truth for MealNote UI work. Page files in `pages/` override this document for a specific surface.

## Direction

MealNote uses a calm Scandinavian/functional food-journal aesthetic: warm enough to feel personal, structured enough to make uncertain nutrition data easy to review. The interface is mobile-first, content-led, and intentionally avoids dashboard density, decorative gradients, and low-contrast neumorphism.

## Color tokens

The implementation source is `src/app/globals.css`.

| Role | Light | Dark |
|---|---|---|
| Primary | `#059669` | `#34d399` |
| Primary dark/surface | `#047857` | `#065f46` |
| Accent/CTA | `#c2410c` | `#ea580c` |
| Background | `#ecfdf5` | `#0b1713` |
| Surface | `#ffffff` | `#12221c` |
| Foreground | `#0f172a` | `#eefbf5` |
| Muted text | `#475569` | `#b8c9c2` |
| Border | `#cfe8df` | `#315348` |

Color is functional: emerald identifies trusted progress and calm review states; orange is reserved for the primary forward action; red is reserved for destructive/error states.

## Typography

- Heading: Lora with Songti fallbacks, used sparingly for MealNote's journal character.
- Interface/body: Raleway with PingFang SC / Noto Sans SC fallbacks.
- Mobile form controls and body copy remain at least 16 px where input zoom or readability matters.
- Nutrition values use clear numeric hierarchy and never rely on color alone.

## Shape and spacing

- 4/8 px spacing rhythm; common section gaps are 16, 24, and 32 px.
- Radii: 8 px controls, 12 px cards, 20 px major workflow surfaces.
- Prefer solid surfaces and visible 1 px borders over decorative shadows.
- Interactive targets are at least 44 px; primary actions are 48 px or taller.

## Layout

- One primary workflow column, maximum width 760 px.
- Start at 375 px and progressively enhance at 640 px and above.
- Keep one primary CTA per stage; secondary actions are visibly subordinate.
- Progressive disclosure keeps optional correction tools close to the item being reviewed.
- No fixed controls may cover content or safe-area insets.

## Interaction and accessibility

- Use semantic buttons, labels, lists, status/alert regions, and sequential headings.
- Visible focus rings are mandatory; keyboard focus follows revealed content.
- Hover/pressed transitions last 150–300 ms and do not shift surrounding layout.
- Respect `prefers-reduced-motion` and system dark mode.
- Maintain WCAG AA text contrast and provide text alongside functional color/icon states.
- Unknown or unsupported nutrition input must show a recovery path without silently creating authority.

## Avoid

- Free-text or fuzzy matches becoming nutrition authority without explicit catalog selection.
- Emoji used as structural icons; use the existing Lucide outline family.
- Modal flows for lightweight corrections that can remain inline.
- Rebuilding the visual language for a single feature.
- Claims that AI confidence or client-reported provenance is independently verified.
