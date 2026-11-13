'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Dropdown } from '@/components/ui/select'
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES, type SupportFilters } from '../support-filter'

const field = 'unison-field min-h-10 rounded-none border border-border bg-card px-3 text-sm'

/** Search, status and priority for the support list. Every change builds a new address, so a refresh or a shared link keeps the view. */
export function SupportToolbar({ filters }: { filters: SupportFilters }) {
  const router = useRouter()
  const [text, setText] = useState(filters.q)

  function go(next: Partial<SupportFilters>) {
    const merged = { ...filters, q: text.trim(), ...next }
    const query = new URLSearchParams()
    if (merged.q) query.set('q', merged.q)
    if (merged.status) query.set('status', merged.status)
    if (merged.priority) query.set('priority', merged.priority)
    const address = query.toString()
    router.push(address ? `/support?${address}` : '/support')
  }

  const filtered = Boolean(filters.q || filters.status || filters.priority)
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        go({})
      }}
      className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4"
    >
      <label className="relative block min-w-48 flex-1">
        <span className="sr-only">Search support requests</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" value={text} onChange={(event) => setText(event.target.value)} placeholder="Search requests…" className={`${field} w-full pl-9`} />
      </label>
      <label className="block">
        <span className="sr-only">Status</span>
        <Dropdown name="status" value={filters.status} onChange={(event) => go({ status: event.target.value })} className={`${field} w-48`}>
          <option value="">All statuses</option>
          {SUPPORT_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </Dropdown>
      </label>
      <label className="block">
        <span className="sr-only">Priority</span>
        <Dropdown name="priority" value={filters.priority} onChange={(event) => go({ priority: event.target.value })} className={`${field} w-40`}>
          <option value="">All priorities</option>
          {SUPPORT_PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </Dropdown>
      </label>
      {filtered ? <Link href="/support" className="inline-flex min-h-10 items-center px-2 text-sm font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Clear filters</Link> : null}
    </form>
  )
}
