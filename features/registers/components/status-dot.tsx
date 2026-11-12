import { cn } from '@/lib/utils'
import { statusTone, type StatusTone } from '../status-tone'

const DOT: Record<StatusTone, string> = {
  positive: 'bg-success',
  attention: 'bg-warning',
  negative: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground/50',
}

/** A status as a small coloured dot and its word, instead of a filled badge. The word always carries the meaning. */
export function StatusDot({ status }: { status: string | null | undefined }) {
  const label = status ? String(status) : '—'
  return (
    <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap text-foreground">
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT[statusTone(status)])} />
      {label}
    </span>
  )
}
