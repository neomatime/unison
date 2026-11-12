import { cn } from '@/lib/utils'
import { statusTone, type StatusTone } from '@/lib/ui/status-tone'

const DOT: Record<StatusTone, string> = {
  positive: 'bg-success',
  attention: 'bg-warning',
  negative: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground/50',
}

/** A status as a small coloured dot and its word, instead of a filled badge. The word always carries the meaning. */
export function StatusDot({ status, tone, wrap }: { status: string | null | undefined; /** Set when the words are a sentence, not a known status. */ tone?: StatusTone; /** Let a long sentence wrap instead of staying on one line. */ wrap?: boolean }) {
  const label = status ? String(status) : '—'
  return (
    <span className={cn('inline-flex gap-2 text-xs text-foreground', wrap ? 'items-start' : 'items-center whitespace-nowrap')}>
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', wrap && 'mt-1', DOT[tone ?? statusTone(status)])} />
      {label}
    </span>
  )
}
