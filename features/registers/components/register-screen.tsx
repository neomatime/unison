import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { portableDefinitions, type PortableCollection } from '@/features/data-portability/portable-collections'
import { HealthBadge, MetricCard } from '@/features/delivery/components/delivery-primitives'
import { collectionSlug } from '@/features/product-ui/collection-route-storage'
import { archiveRecordAction, restoreRecordAction } from '../actions/archive'
import { readRegisterParams, registerHref, type RawParams } from '../read-register-params'
import { getRegisterSummary } from '../queries/get-register-summary'
import { listOwners } from '../queries/list-owners'
import { queryRegister } from '../queries/query-register'
import { REGISTER_FRAMES, toRegisterRow } from '../register-view'
import { REGISTERS, type RegisterKind } from '../register-spec'
import { buildCards } from '../summary'
import { RegisterToolbar } from './register-toolbar'

const STATUS_COLUMNS = new Set(['status', 'stage'])
const rowLink = 'unison-action-control text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * One register: the cards, the search and filters, one page of rows and the footer. It reads the page address, asks the
 * database for that one page and for the totals, and renders what comes back. A failed read throws to the route's
 * error boundary (app/error.tsx): it is never shown as an empty register or as zero totals.
 */
export async function RegisterScreen({ kind, searchParams }: { kind: RegisterKind; searchParams: RawParams }) {
  const frame = REGISTER_FRAMES[kind]
  const spec = REGISTERS[kind]
  const params = readRegisterParams(kind, searchParams)
  const [{ records, total, window }, summary, owners] = await Promise.all([queryRegister(kind, params), getRegisterSummary(kind), listOwners()])
  const cards = buildCards(kind, summary)
  const rows = records.map((record) => toRegisterRow(kind, record))
  const filtered = Boolean(params.q || params.status || params.owner || params.archived)
  const importColumns = portableDefinitions[spec.collection as PortableCollection].importColumns
  const importHref = importColumns
    ? `/records/${collectionSlug(frame.base, `${frame.singular} Register`)}/import?${new URLSearchParams({ collection: spec.collection, return: frame.base })}`
    : undefined

  return (
    <>
      <WorkspaceHeader
        category={frame.category}
        title={frame.heading}
        description={frame.description}
        action={frame.action}
        actionHref={`${frame.base}/new`}
        hideActionOnPhone={total === 0 && !filtered}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => <MetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} />)}
      </div>
      <section className="mt-5 overflow-hidden rounded-none border border-border bg-card">
        <RegisterToolbar
          key={params.q}
          base={frame.base}
          q={params.q}
          status={params.status}
          owner={params.owner}
          archived={params.archived}
          sort={params.sort}
          dir={params.dir}
          statuses={spec.statuses}
          owners={owners}
          importHref={importHref}
          exportSlot={null}
        />
        {params.searchTooShort ? <p role="status" className="border-b border-border px-5 py-2 text-xs text-muted-foreground">Enter at least 2 characters to search.</p> : null}
        {rows.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
            {filtered || total > 0 ? (
              <>
                <h2 className="unison-section-title text-sm">Nothing matches these filters.</h2>
                <p className="mt-2 text-sm text-muted-foreground">Try a different search, or clear the filters to see the whole register.</p>
                <Link href={frame.base} className="unison-action-control mt-4 border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Clear filters</Link>
              </>
            ) : (
              <>
                <h2 className="unison-section-title text-sm">Nothing here yet</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">{frame.empty}</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead>
                <tr className="bg-muted/30 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {frame.columns.map((column) => {
                    const sortable = Object.hasOwn(spec.sortable, column.id)
                    const active = sortable && params.sort === column.id
                    const nextDir = active && params.dir === 'asc' ? 'desc' : 'asc'
                    return (
                      <th
                        key={column.id}
                        scope="col"
                        aria-sort={sortable ? (active ? (params.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                        className="px-4 py-3"
                      >
                        {sortable ? (
                          <Link href={registerHref(frame.base, params, { sort: column.id, dir: nextDir })} className="unison-action-control hover:text-foreground">
                            {column.label}
                            {active ? <span aria-hidden="true"> {params.dir === 'asc' ? '↑' : '↓'}</span> : null}
                          </Link>
                        ) : column.label}
                      </th>
                    )
                  })}
                  <th scope="col" className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/25">
                    {frame.columns.map((column, index) => (
                      <td key={column.id} className="max-w-64 px-4 py-3.5 text-xs">
                        {index === 0 ? (
                          <Link href={`${frame.base}/${row.id}`} className="unison-record-name unison-action-control text-left text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{row.cells[column.id] ?? row.name}</Link>
                        ) : STATUS_COLUMNS.has(column.id) ? (
                          <HealthBadge>{row.cells[column.id] ?? '—'}</HealthBadge>
                        ) : (
                          <span className="text-muted-foreground">{row.cells[column.id] ?? '—'}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link href={`${frame.base}/${row.id}`} className={rowLink} aria-label={`View ${row.name}`}>View</Link>
                        <Link href={`${frame.base}/${row.id}/edit`} className={rowLink} aria-label={`Edit ${row.name}`}>Edit</Link>
                        {row.archived ? (
                          <ActionButton action={restoreRecordAction.bind(null, kind, row.id)} label="Restore" ariaLabel={`Restore ${row.name}`} />
                        ) : (
                          <ActionButton action={archiveRecordAction.bind(null, kind, row.id)} label="Archive" ariaLabel={`Archive ${row.name}`} confirmText="Archive this record?" tone="danger" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <p>Showing {window.from}–{window.to} of {total.toLocaleString('en-ZA')}</p>
            <nav aria-label="Pages" className="flex items-center gap-3">
              {window.page > 1 ? (
                <Link href={registerHref(frame.base, params, { page: window.page - 1 })} rel="prev" className="unison-action-control border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted">Previous</Link>
              ) : (
                <span aria-disabled="true" className="border border-border px-3 py-1.5 font-medium opacity-50">Previous</span>
              )}
              <span>Page {window.page} of {window.pageCount}</span>
              {window.page < window.pageCount ? (
                <Link href={registerHref(frame.base, params, { page: window.page + 1 })} rel="next" className="unison-action-control border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted">Next</Link>
              ) : (
                <span aria-disabled="true" className="border border-border px-3 py-1.5 font-medium opacity-50">Next</span>
              )}
            </nav>
          </footer>
        ) : null}
      </section>
    </>
  )
}
