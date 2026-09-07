import { cn } from '@/lib/utils'

type StatusTone = 'brand' | 'warning' | 'info' | 'neutral' | 'danger'

const toneClasses: Record<StatusTone, string> = {
  brand: 'bg-brand-soft text-brand',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
  // Added so a Critical status has somewhere to land that is not amber. Without
  // it the only options were to leave Critical grey or to demote it to the same
  // tone as At Risk, and neither distinguishes the worst state from the second
  // worst. Purely additive: `tone` defaults to 'neutral' and every existing
  // caller passes one of the four tones above.
  danger: 'bg-danger-soft text-danger',
}

type StatusBadgeProps = {
  children: React.ReactNode
  tone?: StatusTone
  className?: string
}

/**
 * A compact status label used for values like "On Track" / "At Risk".
 */
export function StatusBadge({ children, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-none border border-current/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
