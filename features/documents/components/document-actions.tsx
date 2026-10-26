import Link from 'next/link'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { cancelInvoiceAction } from '../../payments/actions/payments'
import { reviseQuoteAction } from '../../quote-portal/actions/links'
import { createInvoiceFromQuoteAction } from '../actions/invoice-from-quote'
import { duplicateQuoteAction, issueInvoiceAction, sendQuoteAction } from '../actions/send'
import { DOCUMENTS, isDraftStatus, type DocumentKind } from '../vocabulary'

const LINK = 'border border-border px-4 py-2 text-sm font-medium text-foreground'

/**
 * The buttons in a quote or invoice page header: view the document, and send, issue, download, email, invoice, duplicate or revise it.
 * A cancelled invoice keeps its PDF but is not offered for emailing; an archived quote is not offered for invoicing.
 * Only a quote that is Sent, Declined or Expired can be revised (the database checks it too); the revision opens as a new draft.
 * An issued invoice can be cancelled only while it has no unvoided payment (the database checks it too).
 * The first invoice of a billing plan (planFirstDraft) has no Issue invoice button: it is approved and sent from its quote page.
 */
export function DocumentActions({ kind, id, status, archived = false, hasPayments = false, planFirstDraft = false }: { kind: DocumentKind; id: string; status: string; archived?: boolean; hasPayments?: boolean; planFirstDraft?: boolean }) {
  const draft = isDraftStatus(kind, status)
  const cancelled = kind === 'invoice' && status === 'Cancelled'
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
          {!cancelled ? (
            <a href="#email-client" className={LINK}>
              Email to client
            </a>
          ) : null}
        </>
      ) : null}
      {kind === 'quote' && draft ? (
        <ActionButton action={sendQuoteAction.bind(null, id)} label="Send quote" confirmText="Send this quote? It gets its number now and can no longer be edited." />
      ) : null}
      {kind === 'quote' && status === 'Accepted' && !archived ? (
        <ActionButton action={createInvoiceFromQuoteAction.bind(null, id)} label="Create invoice" confirmText="Create a draft invoice with the lines of this quote?" />
      ) : null}
      {kind === 'quote' && !draft ? (
        <ActionButton action={duplicateQuoteAction.bind(null, id)} label="Duplicate as new draft" />
      ) : null}
      {kind === 'quote' && (status === 'Sent' || status === 'Declined' || status === 'Expired') ? (
        <ActionButton
          action={reviseQuoteAction.bind(null, id)}
          label="Revise this quote"
          confirmText="Revise this quote? It opens as a new draft. When you send the revision it replaces this quote, if this one is still awaiting a response, and the old client links stop working."
        />
      ) : null}
      {kind === 'invoice' && draft && !planFirstDraft ? (
        <ActionButton action={issueInvoiceAction.bind(null, id)} label="Issue invoice" confirmText="Issue this invoice? It gets its number now and can no longer be edited." />
      ) : null}
      {kind === 'invoice' && !draft && !cancelled && !hasPayments ? (
        <ActionButton action={cancelInvoiceAction.bind(null, id)} label="Cancel invoice" tone="danger" confirmText="Cancel this invoice? It can't be reopened; raise a new invoice instead." />
      ) : null}
    </>
  )
}
