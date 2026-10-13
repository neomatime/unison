import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { DocumentActions } from '@/features/documents/components/document-actions'
import { EmailSection } from '@/features/documents/components/email-section'
import { LineEditor } from '@/features/documents/components/line-editor'
import { getDocument } from '@/features/documents/queries/get-document'
import { listHiveOfferings } from '@/features/documents/queries/list-hive-offerings'
import { isDraftStatus } from '@/features/documents/vocabulary'
import { DocumentTermsPanel } from '@/features/terms/components/document-terms-panel'
import { PaymentsSection } from '@/features/payments/components/payments-section'
import { listPayments } from '@/features/payments/queries/list-payments'

// Loaded inside `actions` and `after`, which PhaseSixDetail renders only after it has found the record.
async function InvoiceHeaderActions({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const hasPayments = (await listPayments(invoiceId)).some((payment) => !payment.voided)
  return <DocumentActions kind="invoice" id={invoiceId} status={String(bundle.record.status)} hasPayments={hasPayments} />
}

async function InvoiceLines({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const locked = !isDraftStatus('invoice', bundle.record.status)
  const hiveOfferings = locked ? { offerings: [], error: null } : await listHiveOfferings()
  const { record } = bundle
  return (
    <LineEditor
      kind="invoice"
      documentId={invoiceId}
      lines={bundle.lines}
      hiveOfferings={hiveOfferings}
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
      <DocumentTermsPanel kind="invoice" id={invoiceId} />
      <PaymentsSection invoiceId={invoiceId} />
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
