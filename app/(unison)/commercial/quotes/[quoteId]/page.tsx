import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'
import { DocumentActions } from '@/features/documents/components/document-actions'
import { LineEditor } from '@/features/documents/components/line-editor'
import { getDocument } from '@/features/documents/queries/get-document'
import { listPriceItems } from '@/features/documents/queries/list-price-items'
import { isDraftStatus } from '@/features/documents/vocabulary'

// Loaded inside `actions` and `after` so PhaseSixDetail has already called notFound() for a missing record:
// getRecordWorkspace returns empty facts for an id that does not exist rather than failing.
async function QuoteHeaderActions({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  return bundle ? <DocumentActions kind="quote" id={quoteId} status={String(bundle.record.status)} /> : null
}

async function QuoteLines({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  if (!bundle) return null
  const locked = !isDraftStatus('quote', bundle.record.status)
  const priceItems = locked ? [] : await listPriceItems()
  const { record } = bundle
  return (
    <LineEditor
      kind="quote"
      documentId={quoteId}
      lines={bundle.lines}
      priceItems={priceItems}
      locked={locked}
      currency={String(record.currency ?? 'ZAR')}
      totals={{ subtotal: record.subtotal, tax: record.tax_amount, total: record.total_amount, vatRate: record.vat_rate }}
    />
  )
}

async function QuoteWorkspace({ quoteId }: { quoteId: string }) {
  const workspace = await getRecordWorkspace('quote', quoteId)
  return (
    <>
      <QuoteLines quoteId={quoteId} />
      <RecordWorkspaceSections workspace={workspace} sections={['timeline']} />
    </>
  )
}

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return (
    <PhaseSixDetail
      kind="quote"
      id={quoteId}
      actions={<QuoteHeaderActions quoteId={quoteId} />}
      after={<QuoteWorkspace quoteId={quoteId} />}
    />
  )
}
