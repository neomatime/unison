import { redirect } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions } from '@/features/commercial-finance/queries/phase-six'
import { MARKET_ORGANIZATION_FIELD, marketLeadPrefill } from '@/features/market-intelligence/lead-link'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export default async function Page({ searchParams }: { searchParams: Promise<{ marketOrganization?: string }> }) {
  const { marketOrganization } = await searchParams
  const [options, market] = await Promise.all([
    getPhaseSixOptions(),
    marketOrganization
      ? getSessionContext().then(async ({ organization }) => marketLeadPrefill(await createServerSupabase(), organization.id, marketOrganization))
      : null,
  ])
  // The organisation is already in UNISON: open that record instead of creating a second one.
  if (market?.clientId) redirect(`/operations/clients/${market.clientId}`)
  if (market?.leadId) redirect(`/commercial/leads/${market.leadId}`)
  return (
    <PhaseSixForm
      kind="lead"
      options={options}
      prefill={market ? { companyName: market.companyName, source: 'Outbound', notes: market.notes } : undefined}
      hidden={market ? { [MARKET_ORGANIZATION_FIELD]: market.id } : undefined}
    />
  )
}
