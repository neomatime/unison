import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { DocumentActions } from '@/features/documents/components/document-actions'
import { EmailSection } from '@/features/documents/components/email-section'
import { LineEditor } from '@/features/documents/components/line-editor'
import { getDocument } from '@/features/documents/queries/get-document'
import { listPriceItems } from '@/features/documents/queries/list-price-items'
import { isDraftStatus } from '@/features/documents/vocabulary'

// Loaded inside `actions` and `after`, which PhaseSixDetail renders only after it has found the record.
async function InvoiceHeaderActions({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  return bundle ? <DocumentActions kind="invoice" id={invoiceId} status={String(bundle.record.status)} /> : null
}

async function InvoiceLines({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const locked = !isDraftStatus('invoice', bundle.record.status)
  const priceItems = locked ? [] : await listPriceItems()
  const { record } = bundle
  return (
    <LineEditor
      kind="invoice"
      documentId={invoiceId}
      lines={bundle.lines}
      priceItems={priceItems}
      locked={locked}
      currency={String(record.currency ?? 'ZAR')}
      totals={{ subtotal: record.subtotal, tax: record.tax_amount, total: record.total_amount, vatRate: record.vat_rate }}
    />
  )
}

async function InvoiceWorkspace({ invoiceId }: { invoiceId: string }) {
  return (
    <>
      <InvoiceLines invoiceId={invoiceId} />
      <EmailSection kind="invoice" id={invoiceId} />
    </>
  )
}

export default async function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return (
    <PhaseSixDetail
      kind="invoice"
      id={invoiceId}
      actions={<InvoiceHeaderActions invoiceId={invoiceId} />}
      after={<InvoiceWorkspace invoiceId={invoiceId} />}
    />
  )
}
