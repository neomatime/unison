'use client'

import { Bell, CircleHelp, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { TenantSwitcher } from './tenant-switcher'
import { UtilityPanel, type UtilityPanelKind } from './utility-panel'

type WorkspaceHeaderProps = {
  category: string
  title: string
  description?: string
  parent?: { label: string; href: string }
  breadcrumbLabel?: string
  action?: string
  actionHref?: string
  actions?: React.ReactNode
}

export function WorkspaceHeader({ category, title, description, parent, breadcrumbLabel, action, actionHref, actions }: WorkspaceHeaderProps) {
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null)
  return <>
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/overview" className="hover:text-foreground">UNISON</Link>
            <span>/</span><span>{category}</span>
            {parent ? <><span>/</span><Link href={parent.href} className="hover:text-foreground">{parent.label}</Link></> : null}
            <span>/</span><span className="text-foreground">{breadcrumbLabel ?? title}</span>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setPanel('search')} className="relative hidden h-11 w-64 items-center rounded-xl border border-border bg-card px-3 pl-9 text-left text-sm text-muted-foreground 2xl:flex"><Search className="absolute left-3 size-4" />Search UNISON...</button>
          <TenantSwitcher />
          <IconButton label="Help" onClick={() => setPanel('help')}><CircleHelp className="size-5" /></IconButton>
          <IconButton label="Notifications" onClick={() => setPanel('notifications')}><Bell className="size-5" /></IconButton>
          {actions}
          {action && actionHref ? <Link href={actionHref} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand/90"><Plus className="size-4" />{action}</Link> : null}
        </div>
      </div>
    </header>
    <UtilityPanel kind={panel ?? 'help'} open={panel !== null} onClose={() => setPanel(null)} />
  </>
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] hover:text-foreground">{children}</button>
}
