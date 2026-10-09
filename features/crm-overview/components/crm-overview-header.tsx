'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Bell, Search } from 'lucide-react'
import { useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { UtilityPanel, type UtilityPanelKind } from '@/components/shared/utility-panel'
import { InitialAvatar } from '@/components/ui/initial-avatar'
import { getInitials } from '@/lib/utils'
import { firstNameOf, greetingFor } from '../metrics'
import { useClockValue } from './use-clock'

const SEARCH_PLACEHOLDER = 'Search clients, leads, quotes, vendors...'

export function CrmOverviewHeader() {
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null)
  const { user, organization } = useShellContext()
  const firstName = firstNameOf(user.displayName)
  // The viewer's own hour, read on the client. Empty until hydrated, so the server
  // HTML never claims "afternoon" for someone it is morning for.
  const greeting = useClockValue(() => greetingFor(new Date().getHours()))
  const today = useClockValue(() => new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))

  return (
    <>
      <header className="mb-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="min-h-5 text-sm font-medium text-[var(--briefing-muted)]">{greeting ? `${greeting}, ${firstName}.` : ''}</p>
          <h1 className="mt-2 text-[1.625rem] leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-[1.875rem]">
            Here&apos;s your CRM overview.
          </h1>
          <p className="mt-1 text-sm leading-6 text-[var(--briefing-muted)] sm:text-[0.9375rem]">
            A clear view of your pipeline, clients, and commercial performance.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPanel('search')}
              className="relative hidden h-10 w-64 items-center rounded-none border border-border bg-card pr-3 pl-9 text-left text-xs text-[var(--briefing-muted)] transition-colors hover:border-brand/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand min-[1360px]:flex 2xl:w-80"
            >
              <Search aria-hidden="true" className="absolute left-3 size-4" />
              {SEARCH_PLACEHOLDER}
            </button>
            <button
              type="button"
              onClick={() => setPanel('search')}
              aria-label={SEARCH_PLACEHOLDER.replace('...', '')}
              className="flex size-10 items-center justify-center rounded-none border border-border bg-card text-[var(--briefing-muted)] transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand min-[1360px]:hidden"
            >
              <Search aria-hidden="true" className="size-4.5" />
            </button>
            <button
              type="button"
              onClick={() => setPanel('notifications')}
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-none border border-transparent text-[var(--briefing-muted)] transition-colors hover:border-border hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Bell aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
            <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
            <Link
              href="/people/team"
              aria-label={`Open the Team workspace for ${user.displayName}`}
              className="flex min-w-0 items-center gap-2.5 rounded-none px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {user.avatarUrl ? (
                <Image src={user.avatarUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover" />
              ) : (
                <InitialAvatar initials={getInitials(user.displayName)} className="size-9 rounded-full" />
              )}
              <span className="hidden min-w-0 2xl:block">
                <span className="block max-w-36 truncate text-xs font-medium text-foreground">{user.displayName}</span>
                <span className="block max-w-36 truncate text-[0.6875rem] text-[var(--briefing-muted)]">{organization.name}</span>
              </span>
            </Link>
          </div>
          <p className="min-h-4 text-xs text-[var(--briefing-muted)]">{today}</p>
        </div>
      </header>

      <UtilityPanel kind={panel ?? 'search'} open={panel !== null} onClose={() => setPanel(null)} />
    </>
  )
}
