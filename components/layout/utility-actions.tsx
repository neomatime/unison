'use client'

import { Bell, CircleHelp, Search } from 'lucide-react'

import { useUtilities } from '@/components/layout/utility-context'
import { cn } from '@/lib/utils'

const iconButton =
  'unison-action-control relative inline-flex size-10 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/** The bell and help buttons. Shared by the desktop top bar and the phone header. */
export function UtilityIcons({ withSearch, className }: { withSearch?: boolean; className?: string }) {
  const { open, unread } = useUtilities()
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {withSearch ? (
        <button type="button" aria-label="Search" title="Search" onClick={() => open('search')} className={iconButton}>
          <Search className="size-[1.125rem]" strokeWidth={1.75} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        onClick={() => open('notifications')}
        className={iconButton}
      >
        <Bell className="size-[1.125rem]" strokeWidth={1.75} />
        {unread > 0 ? <span aria-hidden="true" className="absolute top-2 right-2.5 size-2 rounded-full bg-warning" /> : null}
      </button>
      <button type="button" aria-label="Help" title="Help" onClick={() => open('help')} className={iconButton}>
        <CircleHelp className="size-[1.125rem]" strokeWidth={1.75} />
      </button>
    </div>
  )
}
