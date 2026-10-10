import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'

// Loaded inside `after` so PhaseSixDetail has already called notFound() for a missing record:
// getRecordWorkspace returns empty facts for an id that does not exist rather than failing.
async function OpportunityWorkspace({ opportunityId }: { opportunityId: string }) {
  const workspace = await getRecordWorkspace('opportunity', opportunityId)
  return <RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />
}

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params
  return <PhaseSixDetail kind="opportunity" id={opportunityId} after={<OpportunityWorkspace opportunityId={opportunityId} />} />
}
