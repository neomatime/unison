import { cn } from '@/lib/utils'

type ProgressBarProps = {
  value: number
  color?: string
  className?: string
  trackClassName?: string
}

/**
 * A slim horizontal progress track used in the Projects panel.
 */
export function ProgressBar({
  value,
  color = 'var(--foreground)',
  className,
  trackClassName,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-none bg-muted', trackClassName)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-none transition-[width] duration-200 ease-out', className)}
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  )
}
