# UNISON design system

UNISON uses Tailwind CSS with semantic CSS variables.

- `styles/tokens.css` owns color, status, sidebar, chart, and radius values.
- `styles/globals.css` maps tokens into Tailwind and defines global base rules.
- `styles/unison.css` contains reusable UNISON-specific component classes.
- `components/ui/` contains reusable React primitives.

The visual language is a premium light workspace with a dark navy sidebar, light cards, subtle borders and shadows, restrained accents, clean typography, and generous spacing. New screens should reuse semantic tokens rather than introduce isolated color values.

