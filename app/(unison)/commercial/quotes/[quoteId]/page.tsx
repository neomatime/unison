import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'
import { DocumentActions } from '@/features/documents/components/document-actions'
import { EmailSection } from '@/features/documents/components/email-section'
import { LineEditor } from '@/features/documents/components/line-editor'
import { QuoteInvoices } from '@/features/documents/components/quote-invoices'
import { getDocument } from '@/features/documents/queries/get-document'
import { listPriceItems, listRateCardItems } from '@/features/documents/queries/list-price-items'
import { isDraftStatus } from '@/features/documents/vocabulary'

// Loaded inside `actions` and `after` so PhaseSixDetail has already called notFound() for a missing record:
// getRecordWorkspace returns empty facts for an id that does not exist rather than failing.
async function QuoteHeaderActions({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  return bundle ? <DocumentActions kind="quote" id={quoteId} status={String(bundle.record.status)} archived={Boolean(bundle.record.archived_at)} /> : null
}

async function QuoteLines({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  if (!bundle) return null
  const locked = !isDraftStatus('quote', bundle.record.status)
  const priceItems = locked ? [] : await listPriceItems()
  const rateItems = locked ? [] : await listRateCardItems()
  const { record } = bundle
  return (
    <LineEditor
      kind="quote"
      documentId={quoteId}
      lines={bundle.lines}
      priceItems={priceItems}
      rateItems={rateItems}
      locked={locked}
      currency={String(record.currency ?? 'ZAR')}
      totals={{ subtotal: record.subtotal, tax: record.tax_amount, total: record.total_amount, vatRate: record.vat_rate }}
    />
  )
}

async function QuoteWorkspace({ quoteId, notice }: { quoteId: string; notice?: string | string[] }) {
  const workspace = await getRecordWorkspace('quote', quoteId)
  return (
    <>
      {notice === 'package_failed' ? (
        <p role="alert" className="mb-4 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          The quote was saved without its package lines. Use "Add from the rate card" below to add them.
        </p>
      ) : null}
      <QuoteLines quoteId={quoteId} />
      <EmailSection kind="quote" id={quoteId} />
      <QuoteInvoices quoteId={quoteId} />
      <RecordWorkspaceSections workspace={workspace} sections={['timeline']} />
    </>
  )
}

export default async function Page({ params, searchParams }: { params: Promise<{ quoteId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { quoteId } = await params
  const { notice } = await searchParams
  return (
    <PhaseSixDetail
      kind="quote"
      id={quoteId}
      actions={<QuoteHeaderActions quoteId={quoteId} />}
      after={<QuoteWorkspace quoteId={quoteId} notice={notice} />}
    />
  )
}
