import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { engagementLabel } from '@/features/clients/engagement'
import {
  companyKey,
  engagementCount,
  engagementStatus,
  type LinkedRecords,
  type MarketData,
  type MarketOperation,
  type MarketOrganization,
} from '../model'

export type MarketIntelligence =
  | { status: 'ready'; data: MarketData; canImport: boolean }
  | { status: 'error' }

const PAGE = 1000
// The map never shows more than this many sites at once; a dataset larger than this is a sign of a bad import.
const MAX_OPERATIONS = 20000

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the market tables are newer than the generated types
type Db = any

async function readAll(db: Db, table: string, columns: string, organizationId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < MAX_OPERATIONS; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).eq('organization_id', organizationId).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
const ids = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string'))]

/**
 * Everything the Mining Market Intelligence panel shows: the imported organisations and their operations, and for each
 * organisation linked to a lead or client, the CRM records that decide its status. Read with the signed-in user's
 * client, so row level security limits it to their workspace.
 */
export async function getMarketIntelligence(): Promise<MarketIntelligence> {
  try {
    const { organization, membership } = await getSessionContext()
    const db: Db = await createServerSupabase()
    const [organizationRows, operationRows] = await Promise.all([
      readAll(db, 'market_organizations', 'id,registered_name,trading_name,parent_name,registration_number,website,organization_type,commodities,source,verified_on,client_id,lead_id', organization.id),
      readAll(db, 'market_operations', 'id,market_organization_id,name,province,district,latitude,longitude,primary_commodity,other_commodities,operation_type,operating_status,location_accuracy,source,verified_on', organization.id),
    ])

    const linkedLeadIds = ids(organizationRows.map((row) => row.lead_id))
    const linkedClientIdsDirect = ids(organizationRows.map((row) => row.client_id))
    const leads = linkedLeadIds.length
      ? await db.from('leads').select('id,company_name,status,archived_at,owner_id,converted_client_id').eq('organization_id', organization.id).in('id', linkedLeadIds)
      : { data: [], error: null }
    if (leads.error) throw leads.error
    const leadById = new Map<string, Record<string, unknown>>((leads.data ?? []).map((row: Record<string, unknown>) => [String(row.id), row]))
    const clientIds = ids([...linkedClientIdsDirect, ...(leads.data ?? []).map((row: Record<string, unknown>) => row.converted_client_id)])

    const [clients, opportunities, quotes, members, allClients, allLeads] = await Promise.all([
      clientIds.length ? db.from('clients').select('id,name,archived_at,owner_id,engagement_type').eq('organization_id', organization.id).in('id', clientIds) : { data: [], error: null },
      clientIds.length || linkedLeadIds.length
        ? db.from('sales_opportunities').select('id,name,stage,archived_at,client_id,lead_id,created_at').eq('organization_id', organization.id)
          .or([clientIds.length ? `client_id.in.(${clientIds.join(',')})` : '', linkedLeadIds.length ? `lead_id.in.(${linkedLeadIds.join(',')})` : ''].filter(Boolean).join(','))
          .order('created_at', { ascending: false })
        : { data: [], error: null },
      clientIds.length || linkedLeadIds.length
        ? db.from('quotes').select('id,status,archived_at,client_id,lead_id,opportunity_id').eq('organization_id', organization.id)
          .or([clientIds.length ? `client_id.in.(${clientIds.join(',')})` : '', linkedLeadIds.length ? `lead_id.in.(${linkedLeadIds.join(',')})` : ''].filter(Boolean).join(','))
        : { data: [], error: null },
      db.from('team_members').select('id,full_name').eq('organization_id', organization.id),
      // Names only, to spot an organisation that is already in UNISON under the same name but not linked yet.
      db.from('clients').select('id,name').eq('organization_id', organization.id).is('archived_at', null).limit(5000),
      db.from('leads').select('id,company_name').eq('organization_id', organization.id).is('archived_at', null).is('converted_at', null).limit(5000),
    ])
    for (const result of [clients, opportunities, quotes, members, allClients, allLeads]) if (result.error) throw result.error
    const clientByKey = new Map<string, { id: string; name: string }>()
    for (const row of allClients.data ?? []) { const key = companyKey(String(row.name)); if (key && !clientByKey.has(key)) clientByKey.set(key, { id: String(row.id), name: String(row.name) }) }
    const leadByKey = new Map<string, { id: string; name: string }>()
    for (const row of allLeads.data ?? []) { const key = companyKey(String(row.company_name)); if (key && !leadByKey.has(key)) leadByKey.set(key, { id: String(row.id), name: String(row.company_name) }) }
    const matchFor = (...names: Array<string | null>) => {
      for (const name of names) {
        const key = name ? companyKey(name) : ''
        if (!key) continue
        const client = clientByKey.get(key)
        if (client) return { kind: 'client' as const, ...client }
        const lead = leadByKey.get(key)
        if (lead) return { kind: 'lead' as const, ...lead }
      }
      return null
    }
    const clientById = new Map<string, Record<string, unknown>>((clients.data ?? []).map((row: Record<string, unknown>) => [String(row.id), row]))
    const memberName = new Map<string, string>((members.data ?? []).map((row: Record<string, unknown>) => [String(row.id), String(row.full_name)]))
    const ownerName = (id: unknown) => (typeof id === 'string' ? memberName.get(id) ?? null : null)

    const organizations: MarketOrganization[] = organizationRows.map((row) => {
      const lead = typeof row.lead_id === 'string' ? leadById.get(row.lead_id) ?? null : null
      const clientId = text(row.client_id) ?? text(lead?.converted_client_id)
      const client = clientId ? clientById.get(clientId) ?? null : null
      const ownOpportunities = (opportunities.data ?? []).filter((opportunity: Record<string, unknown>) =>
        (clientId && opportunity.client_id === clientId) || (lead && opportunity.lead_id === lead.id))
      const opportunityIds = new Set(ownOpportunities.map((opportunity: Record<string, unknown>) => opportunity.id))
      const ownQuotes = (quotes.data ?? []).filter((quote: Record<string, unknown>) =>
        (clientId && quote.client_id === clientId) || (lead && quote.lead_id === lead.id) || opportunityIds.has(quote.opportunity_id))
      const records: LinkedRecords = {
        client: client ? { id: String(client.id), name: String(client.name), archived: Boolean(client.archived_at), ownerName: ownerName(client.owner_id), engagementType: text(client.engagement_type) } : null,
        lead: lead ? { id: String(lead.id), companyName: String(lead.company_name), status: String(lead.status), archived: Boolean(lead.archived_at), ownerName: ownerName(lead.owner_id), convertedClientId: text(lead.converted_client_id) } : null,
        opportunities: ownOpportunities.map((opportunity: Record<string, unknown>) => ({ id: String(opportunity.id), name: String(opportunity.name), stage: String(opportunity.stage), archived: Boolean(opportunity.archived_at) })),
        quotes: ownQuotes.map((quote: Record<string, unknown>) => ({ id: String(quote.id), status: String(quote.status), archived: Boolean(quote.archived_at) })),
      }
      return {
        id: String(row.id),
        name: String(row.registered_name),
        tradingName: text(row.trading_name),
        parentName: text(row.parent_name),
        registrationNumber: text(row.registration_number),
        website: text(row.website),
        organizationType: text(row.organization_type),
        commodities: Array.isArray(row.commodities) ? row.commodities.map(String) : [],
        source: String(row.source),
        verifiedOn: text(row.verified_on),
        status: engagementStatus(records),
        clientId: records.client && !records.client.archived ? records.client.id : null,
        clientName: records.client && !records.client.archived ? records.client.name : null,
        leadId: records.lead?.id ?? null,
        leadName: records.lead?.companyName ?? null,
        accountOwner: records.client?.ownerName ?? records.lead?.ownerName ?? null,
        engagements: engagementCount(records),
        opportunities: records.opportunities.filter((opportunity) => !opportunity.archived).map(({ id, name, stage }) => ({ id, name, stage })),
        services: records.client && !records.client.archived ? engagementLabel(records.client.engagementType) : null,
        match: records.client || records.lead ? null : matchFor(text(row.registered_name), text(row.trading_name)),
      }
    })

    const operations: MarketOperation[] = operationRows.map((row) => ({
      id: String(row.id),
      organizationId: String(row.market_organization_id),
      name: String(row.name),
      province: row.province as MarketOperation['province'],
      district: text(row.district),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      primaryCommodity: text(row.primary_commodity),
      otherCommodities: Array.isArray(row.other_commodities) ? row.other_commodities.map(String) : [],
      operationType: text(row.operation_type),
      operatingStatus: text(row.operating_status),
      locationAccuracy: (row.location_accuracy as MarketOperation['locationAccuracy']) ?? 'exact',
      source: String(row.source),
      verifiedOn: text(row.verified_on),
    }))

    return { status: 'ready', data: { organizations, operations }, canImport: membership.roleId === 'owner' || membership.roleId === 'admin' }
  } catch {
    return { status: 'error' }
  }
}
