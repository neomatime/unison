'use client'

import { Search } from 'lucide-react'

import { useUtilities } from '@/components/layout/utility-context'
import { UtilityIcons } from '@/components/layout/utility-actions'

/**
 * The slim bar across the top of the workspace on a wide screen: search in the middle, notifications and
 * help on the right. On a phone these live in the header beside the menu button instead.
 */
export function TopBar() {
  const { open } = useUtilities()
  return (
    <div className="hidden h-16 shrink-0 grid-cols-[1fr_minmax(0,30rem)_1fr] items-center gap-4 bg-tenant-canvas px-6 lg:grid xl:px-8">
      <div />
      <button
        type="button"
        onClick={() => open('search')}
        aria-label="Search anything"
        className="unison-action-control flex h-10 w-full items-center gap-3 border border-transparent bg-muted px-3 text-left text-sm text-muted-foreground outline-none hover:border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">Search anything…</span>
        <kbd className="border border-border bg-card px-1.5 py-0.5 font-mono text-[0.6875rem]">⌘ K</kbd>
      </button>
      <UtilityIcons className="justify-end" />
    </div>
  )
}
