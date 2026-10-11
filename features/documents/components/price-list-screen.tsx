import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { archivePriceItemAction } from '../actions/price-list'
import { formatAmount } from '../document-view'
import { getPriceItem, listPriceItems } from '../queries/list-price-items'
import { documentContext } from '../server-context'
import { VAT_LABELS, type VatCode } from '../vocabulary'
import { PriceItemForm } from './price-item-form'

export async function PriceListScreen({ editId, saved }: { editId?: string; saved?: string }) {
  const [{ role }, items, requested] = await Promise.all([
    documentContext(),
    listPriceItems({ includeRateCard: true }),
    editId ? getPriceItem(editId) : Promise.resolve(null),
  ])
  const canManageRates = role === 'owner' || role === 'admin'
  // A member who opens a rate card item's edit link by hand gets the empty form, not a form the database would refuse.
  const editing = requested && requested.rate_key && !canManageRates ? null : requested
  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Organisation Profile', href: '/settings' }}
        title="Price list"
        description="The products and services you pick from when building a quote or invoice. Changing an item never changes a document that already used it, and prices are in the currency of the document they are added to."
      />
      {saved ? <p role="status" className="mb-4 border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">Saved.</p> : null}
      {!canManageRates ? <p className="mb-4 text-sm text-[var(--briefing-muted)]">Rate card items can only be changed by an owner or admin.</p> : null}
      <div className="space-y-5">
        <WorkspaceSection title="Items">
          {items.length ? (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">
                      {item.title}
                      {item.rate_key ? <span className="ml-2 border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--briefing-muted)]">Rate card</span> : null}
                      {item.rate_status === 'proposed' ? <span className="ml-2 border border-amber-300 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-800">Proposed rate</span> : null}
                    </p>
                    {item.description ? <p className="whitespace-pre-line break-words text-xs text-[var(--briefing-muted)]">{item.description}</p> : null}
                    <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                      {formatAmount(item.unit_price)} · {VAT_LABELS[item.vat_code as VatCode] ?? item.vat_code}
                    </p>
                    {item.rate_key ? (
                      <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                        {item.credits !== null ? `${Number(item.credits)} credits` : null}
                        {item.item_kind === 'retainer_monthly' ? `${item.credits !== null ? ' · ' : ''}${item.initiative_limit ? `${item.initiative_limit} active projects allowed` : 'no limit on active projects'}` : null}
                      </p>
                    ) : null}
                  </div>
                  {!item.rate_key || canManageRates ? (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/settings/price-list?edit=${item.id}`} aria-label={`Edit: ${item.title}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">Edit</Link>
                      <ActionButton
                        action={archivePriceItemAction.bind(null, item.id)}
                        label="Archive"
                        ariaLabel={`Archive: ${item.title}`}
                        confirmText="Archive this item? It stops appearing in the picker; documents that used it keep their lines."
                        tone="danger"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No items yet. Add the first one below.</p>
          )}
        </WorkspaceSection>
        <PriceItemForm key={`${editing?.id ?? 'new'}-${saved ?? ''}`} item={editing} />
      </div>
    </>
  )
}
