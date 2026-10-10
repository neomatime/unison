import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'

// Loaded inside `after` so PhaseSixDetail has already called notFound() for a missing record:
// getRecordWorkspace returns empty facts for an id that does not exist rather than failing.
async function LeadWorkspace({ leadId }: { leadId: string }) {
  const workspace = await getRecordWorkspace('lead', leadId)
  return <RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />
}

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  return <PhaseSixDetail kind="lead" id={leadId} after={<LeadWorkspace leadId={leadId} />} />
}
