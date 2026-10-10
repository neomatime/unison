import { notFound } from 'next/navigation'
import { cache } from 'react'

import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { StageControl } from '@/features/crm-workspace/components/stage-control'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'
import { isUuid } from '@/lib/utils'

// The page (for the stage control) and the sections below read the same workspace, so it is
// loaded once per request.
const loadWorkspace = cache(async (opportunityId: string) => getRecordWorkspace('opportunity', opportunityId))

// getRecordWorkspace throws on a malformed id (Postgres rejects it as a uuid) and returns empty
// facts for an id that does not exist; the page therefore rejects a malformed id before loading
// it, and PhaseSixDetail calls notFound() for a well-formed id with no record.
async function OpportunityWorkspace({ opportunityId }: { opportunityId: string }) {
  const workspace = await loadWorkspace(opportunityId)
  return <RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />
}

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params
  if (!isUuid(opportunityId)) notFound()
  const workspace = await loadWorkspace(opportunityId)
  return (
    <PhaseSixDetail
      kind="opportunity"
      id={opportunityId}
      actions={
        workspace.record.stage && !workspace.record.archived ? (
          <StageControl opportunityId={opportunityId} stage={workspace.record.stage} lostReason={workspace.record.lostReason} />
        ) : null
      }
      after={<OpportunityWorkspace opportunityId={opportunityId} />}
    />
  )
}
