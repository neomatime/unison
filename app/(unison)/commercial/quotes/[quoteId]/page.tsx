import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'
import { BillingPlanPanel } from '@/features/documents/components/billing-plan-panel'
import { DocumentActions } from '@/features/documents/components/document-actions'
import { EmailSection } from '@/features/documents/components/email-section'
import { LineEditor } from '@/features/documents/components/line-editor'
import { QuoteInvoices } from '@/features/documents/components/quote-invoices'
import { getDocument } from '@/features/documents/queries/get-document'
import { listHiveOfferings } from '@/features/documents/queries/list-hive-offerings'
import { quoteHasBillingPlan } from '@/features/documents/queries/quote-has-billing-plan'
import { isDraftStatus } from '@/features/documents/vocabulary'
import { HiveFeedStatus } from '@/features/platform-automation/components/hive-feed-status'
import { ClientResponsePanel } from '@/features/quote-portal/components/client-response-panel'
import { DocumentTermsPanel } from '@/features/terms/components/document-terms-panel'

// Loaded inside `actions` and `after` so PhaseSixDetail has already called notFound() for a missing record:
// getRecordWorkspace returns empty facts for an id that does not exist rather than failing.
async function QuoteHeaderActions({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  if (!bundle) return null
  // Only an Accepted quote is offered Create invoice, so only then is its plan looked for. A quote that has a plan is billed through it.
  const hasBillingPlan = String(bundle.record.status) === 'Accepted' && (await quoteHasBillingPlan(quoteId))
  return <DocumentActions kind="quote" id={quoteId} status={String(bundle.record.status)} archived={Boolean(bundle.record.archived_at)} hasBillingPlan={hasBillingPlan} />
}

async function QuoteLines({ quoteId }: { quoteId: string }) {
  const bundle = await getDocument('quote', quoteId)
  if (!bundle) return null
  const locked = !isDraftStatus('quote', bundle.record.status)
  const hiveOfferings = locked ? { offerings: [], error: null } : await listHiveOfferings()
  const { record } = bundle
  return (
    <LineEditor
      kind="quote"
      documentId={quoteId}
      lines={bundle.lines}
      hiveOfferings={hiveOfferings}
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
      <DocumentTermsPanel kind="quote" id={quoteId} />
      <EmailSection kind="quote" id={quoteId} />
      <ClientResponsePanel quoteId={quoteId} />
      <BillingPlanPanel quoteId={quoteId} />
      <HiveFeedStatus quoteId={quoteId} />
      <QuoteInvoices quoteId={quoteId} />
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
