import { cn } from '@/lib/utils'

type StatusTone = 'brand' | 'warning' | 'info' | 'neutral'

const toneClasses: Record<StatusTone, string> = {
  brand: 'bg-brand-soft text-brand',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
}

type StatusBadgeProps = {
  children: React.ReactNode
  tone?: StatusTone
  className?: string
}

/**
 * A small pill used for statuses like "On Track" / "At Risk".
 */
export function StatusBadge({ children, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
