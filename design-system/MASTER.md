# MealNote Design System

> 页面级规则若存在于 `design-system/pages/`，优先于本文件。原始检索结果保留在 `design-system/generated/MASTER.md`。

## Direction

- Aesthetic: flat, touch-first functionalism with a calm Chinese dining context.
- Signature: a visible three-step rail — 识别、确认、计算 — that makes AI uncertainty understandable.
- Layout: mobile-first single column; one primary action per state; no marketing dashboard clutter.
- Motion: only state transitions and press feedback, 150–220ms; respect reduced motion.

## Tokens

| Role | Value |
|---|---|
| Primary | `#059669` |
| Primary dark | `#047857` |
| Accent / CTA | `#C2410C` |
| Background | `#ECFDF5` |
| Surface | `#FFFFFF` |
| Foreground | `#0F172A` |
| Muted text | `#475569` |
| Border | `#CFE8DF` |
| Error | `#B91C1C` |
| Focus ring | `#059669` |

- Heading / numeric: Lora, Songti SC, serif.
- Body / controls: Raleway, PingFang SC, Noto Sans SC, sans-serif.
- Spacing: 4, 8, 16, 24, 32, 48, 64px.
- Radius: 8px controls, 12px cards, 20px main work surface.
- Elevation: flat surfaces and borders; no decorative shadows.

## Interaction Rules

- Touch targets are at least 44×44px and separated by at least 8px.
- Inputs have visible labels, 16px minimum text, inline errors, and visible focus rings.
- Color never carries status alone; pair it with text or an icon.
- Camera and microphone are optional input helpers; text always remains available.
- Low-confidence AI fields are visibly marked and editable before calculation.
- No emoji as structural icons; use one consistent SVG icon family.

## Avoid

- Generic purple AI gradients, floating glass cards, calorie-shaming copy, crowded feature grids.
- Pretending a single calorie number is precise when oil or portion is uncertain.
- Community, coaching, store, workout, or course navigation in V1.
