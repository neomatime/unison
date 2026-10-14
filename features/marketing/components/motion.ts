import type { CSSProperties } from 'react'

/** The delay of one element inside a revealed group, as the CSS variable the landing page's motion rules read. A plain module, so server components can call it. */
export const stagger = (index: number, step = 90, base = 0): CSSProperties => ({ '--lux-delay': `${base + index * step}ms` }) as CSSProperties
