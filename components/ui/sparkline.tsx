import { cn } from '@/lib/utils'

type SparklineProps = {
  data: number[]
  width?: number
  height?: number
  color?: string
  className?: string
  /** Unique id used for the gradient fill definition */
  id: string
}

/**
 * A minimal area sparkline rendered as SVG with a soft gradient fill.
 * Used inside the trend KPI cards (Revenue, MRR, Cash Flow).
 */
export function Sparkline({
  data,
  width = 240,
  height = 56,
  color = 'var(--chart-4)',
  className,
  id,
}: SparklineProps) {
  if (data.length === 0) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data.map((value, index) => {
    const x = index * stepX
    const y = height - ((value - min) / range) * (height - 6) - 3
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`
  const gradientId = `sparkline-gradient-${id}`

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('block', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
