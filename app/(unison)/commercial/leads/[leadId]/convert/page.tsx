import { notFound, redirect } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'
import { ConvertLeadForm } from '@/features/crm-workspace/components/convert-lead-form'
import { findMatchingClients } from '@/features/crm-workspace/queries/find-matching-clients'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const lead = await getPhaseSixRecord('lead', leadId)
  if (!lead) notFound()
  // Already converted or archived: nothing to do here, so go back to the lead.
  if (lead.status === 'Converted' || lead.archivedAt) redirect(`/commercial/leads/${leadId}`)
  const companyName = String(lead.companyName ?? lead.name)
  const matches = await findMatchingClients(companyName)
  return (
    <WorkPage
      category="Commercial"
      title={`Convert ${companyName}`}
      description="Turn this lead into a client, a contact and an opportunity in one step."
      parent={{ label: companyName, href: `/commercial/leads/${leadId}` }}
    >
      <ConvertLeadForm leadId={leadId} companyName={companyName} matches={matches} />
    </WorkPage>
  )
}
