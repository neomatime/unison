import Link from 'next/link'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { createInvoiceFromQuoteAction } from '../actions/invoice-from-quote'
import { duplicateQuoteAction, issueInvoiceAction, sendQuoteAction } from '../actions/send'
import { DOCUMENTS, isDraftStatus, type DocumentKind } from '../vocabulary'

const LINK = 'border border-border px-4 py-2 text-sm font-medium text-foreground'

/** The buttons in a quote or invoice page header: view the document, and send, issue, download, email, invoice or duplicate it. */
export function DocumentActions({ kind, id, status }: { kind: DocumentKind; id: string; status: string }) {
  const draft = isDraftStatus(kind, status)
  return (
    <>
      <Link href={`${DOCUMENTS[kind].base}/${id}/document`} className={LINK}>
        View document
      </Link>
      {!draft ? (
        <>
          {/* A file, not a page: a plain anchor so the router does not try to render it. */}
          <a href={`${DOCUMENTS[kind].base}/${id}/document/pdf`} className={LINK}>
            Download PDF
          </a>
          <a href="#email-client" className={LINK}>
            Email to client
          </a>
        </>
      ) : null}
      {kind === 'quote' && draft ? (
        <ActionButton action={sendQuoteAction.bind(null, id)} label="Send quote" confirmText="Send this quote? It gets its number now and can no longer be edited." />
      ) : null}
      {kind === 'quote' && status === 'Accepted' ? (
        <ActionButton action={createInvoiceFromQuoteAction.bind(null, id)} label="Create invoice" confirmText="Create a draft invoice with the lines of this quote?" />
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
