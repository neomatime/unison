'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Bell, Search } from 'lucide-react'
import { useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { TenantSwitcher } from '@/components/shared/tenant-switcher'
import { UtilityPanel, type UtilityPanelKind } from '@/components/shared/utility-panel'
import { InitialAvatar } from '@/components/ui/initial-avatar'
import { getInitials } from '@/lib/utils'

type DeliveryBriefingHeaderProps = {
  dateTime: string
  dateLabel: string
}

export function DeliveryBriefingHeader({ dateTime, dateLabel }: DeliveryBriefingHeaderProps) {
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null)
  const { user, organization } = useShellContext()
  const firstName = user.displayName.trim().split(/\s+/)[0] || 'there'
  // Was hard-coded to "Good afternoon", which told a 7am reader it was the
  // afternoon — the one line on a page whose whole design argument is that
  // everything on it is derived from data.
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <header className="mb-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--briefing-muted)]">{greeting}, {firstName}.</p>
          <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-[2rem]">
            Here&apos;s the delivery briefing.
          </h1>
          <p className="mt-1 text-sm leading-6 text-[var(--briefing-muted)] sm:text-[0.9375rem]">
            A clear view of what&apos;s happening, what matters, and what needs your attention.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPanel('search')}
              className="relative hidden h-10 w-64 items-center rounded-lg border border-border bg-card pr-3 pl-9 text-left text-xs text-[var(--briefing-muted)] transition-colors hover:border-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand min-[1360px]:flex 2xl:w-72"
            >
              <Search aria-hidden="true" className="absolute left-3 size-4" />
              Search projects, clients, vendors...
            </button>
            <button
              type="button"
              onClick={() => setPanel('search')}
              aria-label="Search UNISON"
              className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-[var(--briefing-muted)] transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand min-[1360px]:hidden"
            >
              <Search aria-hidden="true" className="size-4.5" />
            </button>
            <TenantSwitcher />
            <button
              type="button"
              onClick={() => setPanel('notifications')}
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-lg border border-transparent text-[var(--briefing-muted)] transition-colors hover:border-border hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Bell aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
            <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
            <Link
              href="/people/team"
              aria-label={`Open the Team workspace for ${user.displayName}`}
              className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {user.avatarUrl ? (
                <Image src={user.avatarUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover" />
              ) : (
                <InitialAvatar initials={getInitials(user.displayName)} className="size-9 rounded-full" />
              )}
              <span className="hidden min-w-0 2xl:block">
                <span className="block max-w-36 truncate text-xs font-semibold text-foreground">{user.displayName}</span>
                <span className="block max-w-36 truncate text-[0.6875rem] text-[var(--briefing-muted)]">{organization.name}</span>
              </span>
            </Link>
          </div>
          <time dateTime={dateTime} className="text-xs text-[var(--briefing-muted)]">{dateLabel}</time>
        </div>
      </header>

      <UtilityPanel kind={panel ?? 'search'} open={panel !== null} onClose={() => setPanel(null)} />
    </>
  )
}
