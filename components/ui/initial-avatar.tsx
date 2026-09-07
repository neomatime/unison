import { cn } from '@/lib/utils'

type InitialAvatarProps = {
  initials: string
  className?: string
}

/**
 * A square monogram used for client/project logos in activity lists. Human
 * avatars opt back into `rounded-full` at their call site.
 */
export function InitialAvatar({ initials, className }: InitialAvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-none bg-foreground text-xs font-medium tracking-tight text-primary-foreground',
        className,
      )}
    >
      {initials}
    </span>
  )
}
