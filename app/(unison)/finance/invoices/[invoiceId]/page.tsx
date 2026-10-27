import Link from 'next/link'

import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { firstInvoiceBannerParts, isFirstPlanDraft } from '@/features/documents/billing-plan-view'
import { DocumentActions } from '@/features/documents/components/document-actions'
import { EmailSection } from '@/features/documents/components/email-section'
import { LineEditor } from '@/features/documents/components/line-editor'
import { getDocument } from '@/features/documents/queries/get-document'
import { getPlanLink } from '@/features/documents/queries/get-plan-link'
import { listHiveOfferings } from '@/features/documents/queries/list-hive-offerings'
import { DOCUMENTS, isDraftStatus } from '@/features/documents/vocabulary'
import { DocumentTermsPanel } from '@/features/terms/components/document-terms-panel'
import { PaymentsSection } from '@/features/payments/components/payments-section'
import { listPayments } from '@/features/payments/queries/list-payments'

// Loaded inside `actions` and `after`, which PhaseSixDetail renders only after it has found the record.
async function InvoiceHeaderActions({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const hasPayments = (await listPayments(invoiceId)).some((payment) => !payment.voided)
  // The first invoice of a billing plan is approved and sent from its quote page, so it has no Issue invoice button.
  const planLink = await getPlanLink(invoiceId)
  const planFirstDraft = isFirstPlanDraft(planLink?.kind, String(bundle.record.status))
  return <DocumentActions kind="invoice" id={invoiceId} status={String(bundle.record.status)} hasPayments={hasPayments} planFirstDraft={planFirstDraft} />
}

// Above the lines of the first invoice of a billing plan, while it is a Draft: where to review and approve it, or, when the plan is
// paused or ended, that it cannot be approved and where to see why.
async function PlanBanner({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  const planLink = await getPlanLink(invoiceId)
  if (!bundle || !planLink || !isFirstPlanDraft(planLink.kind, String(bundle.record.status))) return null
  const banner = firstInvoiceBannerParts(planLink.planStatus)
  return (
    <p role="note" className="border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
      {banner.before}
      <Link href={`${DOCUMENTS.quote.base}/${planLink.quoteId}`} className="font-semibold text-brand hover:underline">
        {planLink.quoteNumber}
      </Link>
      {banner.after}
    </p>
  )
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
      <PlanBanner invoiceId={invoiceId} />
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
