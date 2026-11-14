'use client'

import { ArrowRight, Maximize2, Mountain, Upload, X } from 'lucide-react'
import { useActionState, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { Dropdown } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { importMarketDataAction } from '../actions'
import {
  ENGAGEMENT_STATUSES,
  NO_FILTERS,
  STATUS_COLORS,
  STATUS_LABELS,
  filterOperations,
  filterOptions,
  snapshot,
  type MarketData,
  type MarketFilters,
  type MarketOperation,
} from '../model'
import { MiningMap } from './mining-map'
import { OrganisationDetails } from './organisation-details'

const number = new Intl.NumberFormat('en-ZA')

/**
 * HIMARK Mining Market Intelligence on the Overview: the filters and map, the market snapshot, and the selected
 * organisation. "View full intelligence" opens the same view full screen, with search, a list of the operations and
 * (for owners and admins) the data import.
 */
export function MarketIntelligence({ data, canImport }: { data: MarketData; canImport: boolean }) {
  const [filters, setFilters] = useState<MarketFilters>(NO_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<false | 'map' | 'import'>(false)
  const deferredFilters = useDeferredValue(filters)

  const organizationById = useMemo(() => new Map(data.organizations.map((organization) => [organization.id, organization])), [data])
  const operations = useMemo(() => filterOperations(data, deferredFilters), [data, deferredFilters])
  const stats = useMemo(() => snapshot(data, operations), [data, operations])
  const options = useMemo(() => filterOptions(data), [data])
  // A selection the filters have hidden is let go, so the details never describe a site the map no longer shows.
  const selected = selectedId ? operations.find((operation) => operation.id === selectedId) ?? null : null
  const selectedOrganization = selected ? organizationById.get(selected.organizationId) ?? null : null
  const filtered = Object.values(deferredFilters).some(Boolean)

  const statusOf = useCallback((operation: MarketOperation) => organizationById.get(operation.organizationId)?.status ?? 'unresearched', [organizationById])
  const organizationName = useCallback((operation: MarketOperation) => organizationById.get(operation.organizationId)?.name ?? '', [organizationById])
  const set = (key: keyof MarketFilters) => (event: { target: { value: string } }) => setFilters((current) => ({ ...current, [key]: event.target.value }))

  const empty = data.operations.length === 0
  const emptyMessage = empty
    ? 'No mining operations have been imported yet. The map shows verified data only.'
    : operations.length === 0
      ? 'No operations match these filters.'
      : undefined

  const view = (full: boolean) => (
    <div className={cn('grid min-h-0', full ? 'h-full lg:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-[minmax(0,1.55fr)_minmax(200px,0.55fr)_minmax(280px,0.8fr)]')}>
      <div className={cn('flex min-w-0 flex-col', full ? 'min-h-0' : 'border-b border-border xl:border-b-0 xl:border-r')}>
        <div className="grid grid-cols-2 gap-2 border-b border-border p-3 md:grid-cols-4">
          <Filter label="Province">
            <Dropdown aria-label="Province" value={filters.province} onChange={set('province')} className="h-9">
              <option value="">All provinces</option>
              {options.provinces.map((province) => <option key={province} value={province}>{province}</option>)}
            </Dropdown>
          </Filter>
          <Filter label="Commodity">
            <Dropdown aria-label="Commodity" value={filters.commodity} onChange={set('commodity')} className="h-9">
              <option value="">All commodities</option>
              {options.commodities.map((commodity) => <option key={commodity} value={commodity}>{commodity}</option>)}
            </Dropdown>
          </Filter>
          <Filter label="Company">
            <Dropdown aria-label="Company" value={filters.company} onChange={set('company')} className="h-9" searchPlaceholder="Search companies…">
              <option value="">All companies</option>
              {options.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </Dropdown>
          </Filter>
          <Filter label="Engagement status">
            <Dropdown aria-label="Engagement status" value={filters.status} onChange={set('status')} className="h-9">
              <option value="">All statuses</option>
              {ENGAGEMENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </Dropdown>
          </Filter>
        </div>
        {full ? (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <input
              type="search"
              value={filters.search}
              onChange={set('search')}
              placeholder="Search operations and organisations…"
              aria-label="Search operations and organisations"
              className="h-9 min-w-0 flex-1 border border-border bg-background px-3 text-sm outline-none focus:border-brand"
            />
            {filtered ? <button type="button" onClick={() => setFilters(NO_FILTERS)} className="h-9 px-2 text-xs font-medium text-brand hover:underline">Reset filters</button> : null}
          </div>
        ) : null}
        <div className={cn('relative', full ? 'min-h-[360px] flex-1' : 'h-[340px] sm:h-[420px]')}>
          <MiningMap
            operations={operations}
            statusOf={statusOf}
            organizationName={organizationName}
            selectedId={selectedId}
            onSelect={(operation) => setSelectedId(operation.id)}
            province={deferredFilters.province}
            frameKey={filtered ? JSON.stringify(deferredFilters) : ''}
            className="absolute inset-0"
            emptyMessage={emptyMessage}
          />
          {!full && filtered ? (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="absolute right-3 top-3 border border-border bg-card px-2.5 py-1 text-xs font-medium text-brand hover:bg-muted">
              Reset filters
            </button>
          ) : null}
        </div>
      </div>

      {full ? (
        <aside className="flex min-h-0 flex-col border-t border-border lg:border-l lg:border-t-0">
          <div className="border-b border-border"><Snapshot stats={stats} filters={filters} onStatus={(status) => setFilters((current) => ({ ...current, status: current.status === status ? '' : status }))} compact /></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <>
                <button type="button" onClick={() => setSelectedId(null)} className="px-4 pt-3 text-xs font-medium text-brand hover:underline">Back to the list</button>
                <OrganisationDetails organization={selectedOrganization} operation={selected} />
              </>
            ) : (
              <OperationList operations={operations} organizationName={organizationName} statusOf={statusOf} onSelect={(operation) => setSelectedId(operation.id)} />
            )}
          </div>
        </aside>
      ) : (
        <>
          <div className="border-b border-border xl:border-b-0 xl:border-r">
            <Snapshot stats={stats} filters={filters} onStatus={(status) => setFilters((current) => ({ ...current, status: current.status === status ? '' : status }))} />
          </div>
          <OrganisationDetails organization={selectedOrganization} operation={selected} />
        </>
      )}
    </div>
  )

  return (
    <section aria-labelledby="market-intelligence-title" className="overflow-hidden rounded-none border border-border bg-card">
      <Header onExpand={() => setExpanded('map')} onImport={canImport && empty ? () => setExpanded('import') : undefined} />
      {view(false)}
      {expanded ? (
        <FullView onClose={() => setExpanded(false)} canImport={canImport} startWithImport={expanded === 'import'}>
          {view(true)}
        </FullView>
      ) : null}
    </section>
  )
}

function Header({ onExpand, onImport, onClose, children }: { onExpand?: () => void; onImport?: () => void; onClose?: () => void; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <Mountain className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={onClose ? 'market-intelligence-full-title' : 'market-intelligence-title'} className="text-base font-semibold text-foreground">HIMARK Mining Market Intelligence</h2>
            <span className="border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">Mining · South Africa</span>
          </div>
          <p className="mt-1 text-xs text-[var(--briefing-muted)]">The mining landscape, commercial opportunities and HIMARK engagement across South Africa.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onImport ? (
          <button type="button" onClick={onImport} className="inline-flex h-9 items-center gap-1.5 border border-border px-3 text-xs font-medium hover:bg-muted">
            <Upload className="size-3.5" aria-hidden="true" />Import data
          </button>
        ) : null}
        {onExpand ? (
          <button type="button" onClick={onExpand} className="inline-flex h-9 items-center gap-1.5 border border-border px-3 text-xs font-medium hover:bg-muted">
            <Maximize2 className="size-3.5" aria-hidden="true" />View full intelligence<ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close full intelligence" data-autofocus className="inline-flex size-9 items-center justify-center border border-border hover:bg-muted">
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-[var(--briefing-muted)]">{label}</span>
      {children}
    </div>
  )
}

function Snapshot({ stats, filters, onStatus, compact }: { stats: ReturnType<typeof snapshot>; filters: MarketFilters; onStatus: (status: string) => void; compact?: boolean }) {
  const figures: Array<[string, number]> = [
    ['Mining operations', stats.operations],
    ['Mining companies', stats.companies],
    ['Provinces', stats.provinces],
    ['HIMARK engaged', stats.engaged],
  ]
  return (
    <div className={cn('space-y-4', compact ? 'p-4' : 'p-4 xl:p-5')}>
      <section aria-labelledby="market-snapshot">
        <h3 id="market-snapshot" className="text-xs font-semibold text-foreground">Market snapshot</h3>
        <dl className={cn('mt-3 grid gap-3', compact ? 'grid-cols-4' : 'grid-cols-2')}>
          {figures.map(([label, value]) => (
            <div key={label}>
              <dd className="text-xl font-light tabular-nums text-foreground">{number.format(value)}</dd>
              <dt className="text-[11px] leading-tight text-[var(--briefing-muted)]">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="engagement-legend" className="border-t border-border pt-3">
        <h3 id="engagement-legend" className="text-xs font-semibold text-foreground">Engagement legend</h3>
        <ul className={cn('mt-2', compact ? 'grid grid-cols-2 gap-x-3' : 'space-y-0.5')}>
          {ENGAGEMENT_STATUSES.map((status) => (
            <li key={status}>
              <button
                type="button"
                aria-pressed={filters.status === status}
                onClick={() => onStatus(status)}
                className={cn('flex w-full items-center gap-2 px-1 py-1 text-left text-xs hover:bg-muted', filters.status === status && 'bg-muted font-semibold')}
              >
                <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: STATUS_COLORS[status] }} />
                <span className="min-w-0 flex-1 truncate">{STATUS_LABELS[status]}</span>
                <span className="tabular-nums text-[var(--briefing-muted)]">{number.format(stats.byStatus[status])}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-snug text-[var(--briefing-muted)]">Operations by their organisation&apos;s status, from UNISON&apos;s leads, opportunities, quotes and clients.</p>
      </section>
    </div>
  )
}

const LIST_LIMIT = 200

function OperationList({ operations, organizationName, statusOf, onSelect }: { operations: MarketOperation[]; organizationName: (operation: MarketOperation) => string; statusOf: (operation: MarketOperation) => keyof typeof STATUS_COLORS; onSelect: (operation: MarketOperation) => void }) {
  if (!operations.length) return <p className="p-4 text-sm text-[var(--briefing-muted)]">No operations to list.</p>
  const sorted = [...operations].sort((a, b) => organizationName(a).localeCompare(organizationName(b)) || a.name.localeCompare(b.name))
  return (
    <div>
      <ul className="divide-y divide-border" aria-label="Mining operations">
        {sorted.slice(0, LIST_LIMIT).map((operation) => (
          <li key={operation.id}>
            <button type="button" onClick={() => onSelect(operation)} className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: STATUS_COLORS[statusOf(operation)] }} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{operation.name}</span>
                <span className="block truncate text-xs text-[var(--briefing-muted)]">{organizationName(operation)} · {operation.province}{operation.primaryCommodity ? ` · ${operation.primaryCommodity}` : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sorted.length > LIST_LIMIT ? <p className="px-4 py-3 text-xs text-[var(--briefing-muted)]">Showing the first {LIST_LIMIT} of {number.format(sorted.length)}. Narrow the list with the filters or search.</p> : null}
    </div>
  )
}

/** The full-screen view: the same map, filters and details, larger, with search and the import. Escape closes it. */
function FullView({ onClose, canImport, startWithImport, children }: { onClose: () => void; canImport: boolean; startWithImport: boolean; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [importing, setImporting] = useState(startWithImport)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose() }
    document.addEventListener('keydown', key)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus() }
  }, [onClose])
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="market-intelligence-full-title" className="fixed inset-0 z-[70] flex flex-col bg-background">
      <Header onClose={onClose}>
        {canImport ? (
          <button type="button" onClick={() => setImporting((value) => !value)} aria-expanded={importing} className="inline-flex h-9 items-center gap-1.5 border border-border px-3 text-xs font-medium hover:bg-muted">
            <Upload className="size-3.5" aria-hidden="true" />Import data
          </button>
        ) : null}
      </Header>
      {importing ? <ImportPanel /> : null}
      <div className="min-h-0 flex-1 bg-card">{children}</div>
    </div>
  )
}

function ImportPanel() {
  const [state, action, pending] = useActionState(importMarketDataAction, undefined)
  return (
    <form action={action} className="border-b border-border bg-card px-5 py-4 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-medium">Verified dataset (CSV or Excel, one row per operation)</span>
          <input name="file" type="file" accept=".csv,.xlsx" required className="mt-1.5 block w-full text-xs file:mr-3 file:h-9 file:border file:border-border file:bg-muted file:px-3 file:text-xs file:font-medium" />
        </label>
        <button type="submit" disabled={pending} className="h-9 bg-brand px-4 text-xs font-semibold text-white disabled:opacity-60">{pending ? 'Importing…' : 'Import'}</button>
      </div>
      <p className="mt-2 text-xs text-[var(--briefing-muted)]">
        Columns: organisation_name and source are required; an operation also needs operation_name, province, latitude and longitude. Rows already imported are updated, not added twice. The full column list is in docs/market-intelligence/README.md.
      </p>
      {state ? (
        <div role="status" className="mt-3 text-xs">
          {state.ok ? (
            <p>Imported {number.format(state.operations)} operations for {number.format(state.organizations)} organisations ({number.format(state.added)} new, {number.format(state.updated)} updated).</p>
          ) : (
            <p className="text-destructive">{state.error}</p>
          )}
          {state.problems?.length ? (
            <ul className="mt-2 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-[var(--briefing-muted)]">
              {state.problems.map((problem) => <li key={`${problem.line}-${problem.message}`}>Row {problem.line}: {problem.message}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
