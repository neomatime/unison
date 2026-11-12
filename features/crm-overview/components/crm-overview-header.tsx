'use client'

import { useShellContext } from '@/components/layout/shell-context'
import { firstNameOf, greetingFor } from '../metrics'
import { useClockValue } from './use-clock'

// Lookup, alerts and the signed-in user live once, in the sidebar, so this
// header carries only the greeting, the title and the date.
export function CrmOverviewHeader() {
  const { user } = useShellContext()
  const firstName = firstNameOf(user.displayName)
  // The viewer's own hour, read on the client. Empty until hydrated, so the server
  // HTML never claims "afternoon" for someone it is morning for.
  const greeting = useClockValue(() => greetingFor(new Date().getHours()))
  const today = useClockValue(() => new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }))

  return (
    <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <h1 className="min-h-9 font-brand text-[1.75rem] leading-tight font-light tracking-tight text-foreground sm:text-[2rem]">
          {greeting ? `${greeting}, ${firstName}.` : ''}
        </h1>
        <p className="mt-2 text-base font-medium text-foreground">Here&apos;s your CRM overview.</p>
        <p className="mt-1 text-sm leading-6 text-[var(--briefing-muted)]">
          A clear view of your pipeline, clients, and commercial performance.
        </p>
      </div>
      <p className="min-h-4 shrink-0 text-xs text-[var(--briefing-muted)]">{today}</p>
    </header>
  )
}
