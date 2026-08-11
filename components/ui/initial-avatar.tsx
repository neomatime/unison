import { cn } from '@/lib/utils'

type InitialAvatarProps = {
  initials: string
  className?: string
}

/**
 * A rounded square monogram used for client/project logos in activity lists.
 */
export function InitialAvatar({ initials, className }: InitialAvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-xs font-semibold tracking-tight text-primary-foreground',
        className,
      )}
    >
      {initials}
    </span>
  )
}
