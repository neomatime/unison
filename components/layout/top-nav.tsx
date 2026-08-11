'use client'

import { Search, Bell, CircleHelp, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { TenantSwitcher } from '@/components/shared/tenant-switcher'
import { UtilityPanel, type UtilityPanelKind } from '@/components/shared/utility-panel'

type TopNavProps = {
  greeting: string
  subtitle: string
}

export function TopNav({ greeting, subtitle }: TopNavProps) {
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null)
  return (
    <><header className="flex items-start justify-between gap-6 pb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <button type="button" onClick={() => setPanel('search')} className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="flex h-11 w-80 items-center rounded-xl border border-border bg-card pr-16 pl-9 text-sm text-muted-foreground shadow-[0_1px_2px_0_rgb(16_32_46_/_0.04)]">Search anything...</span>
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
            ⌘ K
          </kbd>
        </button>

        <TenantSwitcher />

        <IconButton label="Notifications" hasDot onClick={() => setPanel('notifications')}>
          <Bell className="size-5" strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Help" onClick={() => setPanel('help')}>
          <CircleHelp className="size-5" strokeWidth={1.75} />
        </IconButton>
        <Link href="/operations/tasks/new" className="hidden h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-primary-foreground 2xl:inline-flex"><Plus className="size-4" />Quick action</Link>
      </div>
    </header><UtilityPanel kind={panel ?? 'help'} open={panel !== null} onClose={() => setPanel(null)} /></>
  )
}

function IconButton({
  children,
  label,
  hasDot,
  onClick,
}: {
  children: React.ReactNode
  label: string
  hasDot?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-[0_1px_2px_0_rgb(16_32_46_/_0.04)] transition-colors hover:text-foreground"
    >
      {children}
      {hasDot ? (
        <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-warning ring-2 ring-card" />
      ) : null}
    </button>
  )
}
