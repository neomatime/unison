import Link from 'next/link'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { duplicateQuoteAction, issueInvoiceAction, sendQuoteAction } from '../actions/send'
import { DOCUMENTS, isDraftStatus, type DocumentKind } from '../vocabulary'

/** The buttons in a quote or invoice page header: view the document, and send, issue or duplicate it. */
export function DocumentActions({ kind, id, status }: { kind: DocumentKind; id: string; status: string }) {
  const draft = isDraftStatus(kind, status)
  return (
    <>
      <Link href={`${DOCUMENTS[kind].base}/${id}/document`} className="border border-border px-4 py-2 text-sm font-medium text-foreground">
        View document
      </Link>
      {kind === 'quote' && draft ? (
        <ActionButton action={sendQuoteAction.bind(null, id)} label="Send quote" confirmText="Send this quote? It gets its number now and can no longer be edited." />
      ) : null}
      {kind === 'quote' && !draft ? (
        <ActionButton action={duplicateQuoteAction.bind(null, id)} label="Duplicate as new draft" />
      ) : null}
      {kind === 'invoice' && draft ? (
        <ActionButton action={issueInvoiceAction.bind(null, id)} label="Issue invoice" confirmText="Issue this invoice? It gets its number now and can no longer be edited." />
      ) : null}
    </>
  )
}
