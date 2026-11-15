// Contour lines of two hills, drawn from a formula rather than a photograph: no verified picture of a site is held, and a stock
// photo would suggest one. The lines take the colour of the surrounding text, so the band reads in both light and dark.

const HILLS = [
  { cx: 112, cy: 46, stretch: 3.1, rings: 9, phase: 0.3 },
  { cx: 318, cy: 30, stretch: 2.6, rings: 7, phase: 1.7 },
]

const CONTOURS = HILLS.flatMap((hill) =>
  Array.from({ length: hill.rings }, (_, index) => {
    const ring = index + 1
    const radius = ring * 5.2
    const points = Array.from({ length: 73 }, (_, step) => {
      const angle = (step / 72) * Math.PI * 2
      const wobble = 1 + 0.13 * Math.sin(3 * angle + ring * 0.45 + hill.phase) + 0.07 * Math.sin(5 * angle + ring * 0.8 + hill.phase)
      return `${(hill.cx + Math.cos(angle) * radius * hill.stretch * wobble).toFixed(1)} ${(hill.cy + Math.sin(angle) * radius * wobble).toFixed(1)}`
    })
    return `M${points.join('L')}Z`
  }),
)

/** Fills its (relatively positioned) parent. Decorative: hidden from assistive technology. */
export function TopographyBackdrop() {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 80" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full text-[var(--briefing-muted)]" fill="none">
      <g stroke="currentColor" strokeWidth="0.6" opacity="0.4">
        {CONTOURS.map((path, index) => <path key={index} d={path} />)}
      </g>
    </svg>
  )
}
