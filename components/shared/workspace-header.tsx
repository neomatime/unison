'use client'

import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'

import { TenantSwitcher } from './tenant-switcher'

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
  return <>
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/overview" className="unison-action-control hover:text-foreground">UNISON</Link>
            <ChevronRight aria-hidden="true" className="size-3" /><span>{category}</span>
            {parent ? <><ChevronRight aria-hidden="true" className="size-3" /><Link href={parent.href} className="unison-action-control hover:text-foreground">{parent.label}</Link></> : null}
            <ChevronRight aria-hidden="true" className="size-3" /><span className="text-foreground">{breadcrumbLabel ?? title}</span>
          </nav>
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-[-0.035em] text-foreground sm:text-[1.875rem]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Search, notifications and help live once, in the sidebar (and on Ctrl/Cmd+K). */}
          <TenantSwitcher />
          {actions}
          {action && actionHref ? <Link href={actionHref} className="unison-action-control inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"><Plus className="size-4" />{action}</Link> : null}
        </div>
      </div>
    </header>
  </>
}
