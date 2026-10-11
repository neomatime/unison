'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

/**
 * Search, status, owner and the archived switch. Every change builds a new address (a search or a filter returns to
 * page 1), so a refresh, the back button or a shared link keeps the view. The sort is carried over; the page is not.
 * Nothing here reads or writes data.
 */
export function RegisterToolbar({
  base,
  q,
  status,
  owner,
  archived,
  sort,
  dir,
  statuses,
  owners,
  exportSlot,
  importHref,
}: {
  base: string
  q: string
  status: string | null
  owner: string | null
  archived: boolean
  sort: string | null
  dir: 'asc' | 'desc'
  statuses: readonly string[]
  owners: Array<{ id: string; label: string }>
  exportSlot?: ReactNode
  importHref?: string
}) {
  const router = useRouter()
  const [text, setText] = useState(q)

  function go(next: { q?: string; status?: string; owner?: string; archived?: boolean }) {
    const query = new URLSearchParams()
    const search = (next.q ?? text).trim()
    const nextStatus = next.status ?? status ?? ''
    const nextOwner = next.owner ?? owner ?? ''
    const nextArchived = next.archived ?? archived
    if (search) query.set('q', search)
    if (nextStatus) query.set('status', nextStatus)
    if (nextOwner) query.set('owner', nextOwner)
    if (nextArchived) query.set('archived', '1')
    if (sort) {
      query.set('sort', sort)
      query.set('dir', dir)
    }
    const address = query.toString()
    router.push(address ? `${base}?${address}` : base)
  }

  const field = 'unison-field min-h-10 rounded-none border border-border bg-card px-3 text-sm'
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        go({})
      }}
      className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4"
    >
      <label className="block min-w-48 flex-1">
        <span className="text-xs font-medium text-muted-foreground">Search</span>
        <input name="q" value={text} onChange={(event) => setText(event.target.value)} placeholder="Name, client, number…" className={`${field} mt-1 w-full`} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Status</span>
        <select name="status" value={status ?? ''} onChange={(event) => go({ status: event.target.value })} className={`${field} mt-1 block`}>
          <option value="">All statuses</option>
          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Owner</span>
        <select name="owner" value={owner ?? ''} onChange={(event) => go({ owner: event.target.value })} className={`${field} mt-1 block`}>
          <option value="">Everyone</option>
          {owners.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select>
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="archived" checked={archived} onChange={(event) => go({ archived: event.target.checked })} />
        Show archived
      </label>
      <button type="submit" className="min-h-10 border border-border px-4 text-sm font-medium">Search</button>
      <div className="ml-auto flex items-center gap-2">
        {importHref ? <Link href={importHref} className="inline-flex min-h-10 items-center border border-border px-4 text-sm font-medium">Import</Link> : null}
        {exportSlot}
      </div>
    </form>
  )
}
