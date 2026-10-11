import Link from 'next/link'

import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatAmount } from '../document-view'
import { listInvoicesFromQuote } from '../queries/list-invoices-from-quote'
import { DOCUMENTS, isDraftReference } from '../vocabulary'

/** The invoices made from an accepted quote. Shown only once there is at least one, so other quotes stay uncluttered. */
export async function QuoteInvoices({ quoteId }: { quoteId: string }) {
  const invoices = await listInvoicesFromQuote(quoteId)
  if (invoices.length === 0) return null
  return (
    <WorkspaceSection title="Invoices made from this quote" description="Each one is its own invoice; the quote itself does not change.">
      <ul className="divide-y divide-border">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <Link href={`${DOCUMENTS.invoice.base}/${invoice.id}`} className="font-semibold text-brand hover:underline">
              {isDraftReference(invoice.number) ? 'Draft invoice' : invoice.number}
            </Link>
            <span className="text-muted-foreground">{invoice.status} · {invoice.currency} {formatAmount(invoice.total)}</span>
          </li>
        ))}
      </ul>
    </WorkspaceSection>
  )
}
