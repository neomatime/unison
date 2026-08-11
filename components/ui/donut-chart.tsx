import { cn } from '@/lib/utils'

export type DonutSegment = {
  value: number
  /** Any valid CSS color, typically a design token like "var(--brand)" */
  color: string
}

type DonutChartProps = {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  /** Track (unfilled) color */
  trackColor?: string
  className?: string
  children?: React.ReactNode
  rounded?: boolean
}

/**
 * A lightweight SVG donut/ring chart. Renders segments proportional to their
 * values around a circle. Used for the Business Health gauge and Automation
 * Status ring.
 */
export function DonutChart({
  segments,
  size = 120,
  thickness = 12,
  trackColor = 'var(--border)',
  className,
  children,
  rounded = true,
}: DonutChartProps) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1

  let offsetAccumulator = 0

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        {segments.map((segment, index) => {
          const fraction = segment.value / total
          const dash = fraction * circumference
          const gap = circumference - dash
          const dashOffset = -offsetAccumulator
          offsetAccumulator += dash
          return (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={dashOffset}
              strokeLinecap={rounded ? 'round' : 'butt'}
            />
          )
        })}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      ) : null}
    </div>
  )
}
