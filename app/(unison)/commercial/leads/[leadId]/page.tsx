import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'
import { isUuid } from '@/lib/utils'

// The page (for the Convert button) and the sections below read the same workspace, so it is
// loaded once per request.
const loadWorkspace = cache(async (leadId: string) => getRecordWorkspace('lead', leadId))

// getRecordWorkspace throws on a malformed id (Postgres rejects it as a uuid) and returns empty
// facts for an id that does not exist; the page therefore rejects a malformed id before loading
// it, and PhaseSixDetail calls notFound() for a well-formed id with no record.
async function LeadWorkspace({ leadId }: { leadId: string }) {
  const workspace = await loadWorkspace(leadId)
  return <RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />
}

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  if (!isUuid(leadId)) notFound()
  const workspace = await loadWorkspace(leadId)
  return (
    <PhaseSixDetail
      kind="lead"
      id={leadId}
      actions={
        !workspace.conversion && !workspace.record.archived ? (
          <Link href={`/commercial/leads/${leadId}/convert`} className="border border-brand px-4 py-2 text-sm font-semibold text-brand">
            Convert lead
          </Link>
        ) : null
      }
      after={<LeadWorkspace leadId={leadId} />}
    />
  )
}
