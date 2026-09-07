# UNISON design system

UNISON uses Tailwind CSS with semantic CSS variables. The visual language is a
quiet, architectural enterprise workspace: deep navy type, off-white canvas,
flat white surfaces, fine borders, a restrained ocean-blue accent, and a light
sidebar that reads as part of the workspace rather than a separate panel.

## Sources of truth

- `styles/tokens.css` owns the shared palette, type weights, radius scale,
  motion timing, easing, focus treatment, and overlay elevation.
- `styles/globals.css` maps those values into Tailwind and defines global base
  and animation rules.
- `styles/unison.css` contains semantic interface classes and tenant-scoped
  visual rules.
- `components/ui/` contains reusable React primitives.
- `components/internal/internal-theme.module.css` scopes the same language to
  HIMARK Internal without leaking tenant theme variables into it.

## Geometry and surfaces

Primary surfaces, controls, navigation states, menus, badges, dialogs, and
tables use a zero-radius scale and flat 1px borders. Shadows are reserved for
overlay elevation. `rounded-full` is an explicit exception for avatars, small
status dots, radio/switch controls, and numbered progress nodes.

## Typography

The `--unison-brand-font` stack is used through these semantic classes:

- `unison-page-title`
- `unison-section-title`
- `unison-metric-label`
- `unison-record-name`

Body copy remains in the UI font. Legacy `font-semibold` resolves to medium
weight and heavier utilities are capped at restrained 600 weight.

## Motion and accessibility

Use `--motion-micro` (150ms), `--motion-panel` (220ms), and `--motion-view`
(260ms) with `--ease-unison`. Route content, overlays, drawers, menus, and
skeletons have shared classes in `styles/unison.css`. The application honours
`prefers-reduced-motion` and retains visible keyboard focus throughout.

New screens should use semantic tokens and shared primitives rather than
introducing page-specific colour, radius, shadow, typography, or motion rules.
