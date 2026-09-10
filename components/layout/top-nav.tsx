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
        <h1 className="unison-page-title text-2xl text-foreground text-balance">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <button type="button" onClick={() => setPanel('search')} className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="flex h-10 w-80 items-center border border-border bg-card pr-16 pl-9 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/45">Search anything...</span>
          <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
            ⌘ K
          </kbd>
        </button>

        <TenantSwitcher />

        <IconButton label="Notifications" onClick={() => setPanel('notifications')}>
          <Bell className="size-5" strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Help" onClick={() => setPanel('help')}>
          <CircleHelp className="size-5" strokeWidth={1.75} />
        </IconButton>
        <Link href="/operations/projects/new" className="hidden h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand/90 2xl:inline-flex"><Plus className="size-4" />New project</Link>
      </div>
    </header><UtilityPanel kind={panel ?? 'help'} open={panel !== null} onClose={() => setPanel(null)} /></>
  )
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex size-10 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-muted-foreground/45 hover:text-foreground"
    >
      {children}
    </button>
  )
}
