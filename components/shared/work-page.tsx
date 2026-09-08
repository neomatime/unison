import Link from 'next/link'
import type { ReactNode } from 'react'
import { WorkspaceHeader } from './workspace-header'

/** A route-owned workspace. Context sits in the document flow, never over it. */
export function WorkPage({ category, title, description, parent, children, guidance }: {
  category?: string; title: string; description?: string; parent: { label: string; href: string }
  children: ReactNode; guidance?: ReactNode
}) {
  return <>
    <WorkspaceHeader category={category ?? parent.label} title={title} description={description} parent={parent} />
    <Link href={parent.href} className="mb-5 inline-flex text-sm text-muted-foreground hover:text-brand">← Back to {parent.label}</Link>
    <div className={guidance ? 'grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]' : 'w-full space-y-5'}>
      <div className="min-w-0 space-y-5">{children}</div>
      {guidance ? <aside className="border border-border bg-card p-6 text-sm leading-6 text-muted-foreground">{guidance}</aside> : null}
    </div>
  </>
}
