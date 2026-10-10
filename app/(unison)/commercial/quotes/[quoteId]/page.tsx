import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'

// Loaded inside `after` so PhaseSixDetail has already called notFound() for a missing record:
// getRecordWorkspace returns empty facts for an id that does not exist rather than failing.
async function QuoteWorkspace({ quoteId }: { quoteId: string }) {
  const workspace = await getRecordWorkspace('quote', quoteId)
  return <RecordWorkspaceSections workspace={workspace} sections={['timeline']} />
}

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return <PhaseSixDetail kind="quote" id={quoteId} after={<QuoteWorkspace quoteId={quoteId} />} />
}
