// Mining Market Intelligence: the shapes the map works with, how an organisation's engagement status is worked out from
// UNISON's own records, and the filters and counts. Pure: no directive, no imports, so unit tests load it directly.

export const PROVINCES = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape',
] as const
export type Province = (typeof PROVINCES)[number]

/**
 * HIMARK's relationship with a mining organisation, highest first. An organisation that qualifies for several takes the
 * first one in this list, so every organisation (and every one of its operations) is counted exactly once.
 */
export const ENGAGEMENT_STATUSES = ['client', 'proposal', 'active', 'prospect', 'unresearched'] as const
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number]

export const STATUS_LABELS: Record<EngagementStatus, string> = {
  client: 'Existing client',
  proposal: 'Proposal submitted',
  active: 'Active engagement',
  prospect: 'Prospect',
  unresearched: 'Unresearched',
}

/** The CSS colour of each status's marker (tokens in styles/tokens.css). */
export const STATUS_COLORS: Record<EngagementStatus, string> = {
  client: 'var(--market-client)',
  proposal: 'var(--market-proposal)',
  active: 'var(--market-active)',
  prospect: 'var(--market-prospect)',
  unresearched: 'var(--market-unresearched)',
}

/** The UNISON records an organisation is linked to, as read for the map. Owner names are already resolved. */
export type LinkedRecords = {
  client: { id: string; name: string; archived: boolean; ownerName: string | null; engagementType: string | null } | null
  lead: { id: string; companyName: string; status: string; archived: boolean; ownerName: string | null; convertedClientId: string | null } | null
  opportunities: Array<{ id: string; name: string; stage: string; archived: boolean }>
  quotes: Array<{ id: string; status: string; archived: boolean }>
}

const OPEN_STAGES = new Set(['Discovery', 'Qualified', 'Proposal', 'Negotiation'])
const PROPOSAL_STAGES = new Set(['Proposal', 'Negotiation'])
const PROPOSAL_QUOTES = new Set(['Sent', 'Accepted'])
const WORKED_LEAD_STATUSES = new Set(['Contacted', 'Qualified'])

/**
 * The status, from what UNISON holds and nothing else:
 *  - Existing client: linked to a client that is not archived, or to a lead that was converted into a client.
 *  - Proposal submitted: a sent or accepted quote, or an open opportunity at the Proposal or Negotiation stage.
 *  - Active engagement: any other open opportunity, or a lead that is Contacted or Qualified.
 *  - Prospect: linked to a lead (New or Disqualified), with nothing further.
 *  - Unresearched: not linked to anything in UNISON.
 */
export function engagementStatus(records: LinkedRecords): EngagementStatus {
  if ((records.client && !records.client.archived) || records.lead?.convertedClientId) return 'client'
  const quotes = records.quotes.filter((quote) => !quote.archived)
  const openOpportunities = records.opportunities.filter((opportunity) => !opportunity.archived && OPEN_STAGES.has(opportunity.stage))
  if (quotes.some((quote) => PROPOSAL_QUOTES.has(quote.status)) || openOpportunities.some((opportunity) => PROPOSAL_STAGES.has(opportunity.stage))) return 'proposal'
  const lead = records.lead && !records.lead.archived ? records.lead : null
  if (openOpportunities.length || (lead && WORKED_LEAD_STATUSES.has(lead.status))) return 'active'
  if (records.lead) return 'prospect'
  return 'unresearched'
}

/** Engagements counted in the details panel: opportunities that are open or won, not archived. */
export function engagementCount(records: LinkedRecords): number {
  return records.opportunities.filter((opportunity) => !opportunity.archived && (OPEN_STAGES.has(opportunity.stage) || opportunity.stage === 'Won')).length
}

export type MarketOrganization = {
  id: string
  name: string
  tradingName: string | null
  parentName: string | null
  registrationNumber: string | null
  website: string | null
  organizationType: string | null
  commodities: string[]
  source: string
  verifiedOn: string | null
  status: EngagementStatus
  clientId: string | null
  clientName: string | null
  leadId: string | null
  leadName: string | null
  accountOwner: string | null
  engagements: number
  /** Opportunity names and stages, newest first. */
  opportunities: Array<{ id: string; name: string; stage: string }>
  /** The client's primary engagement as UNISON shows it (e.g. "Vesper + Monthly Retainer"), when it is a client. */
  services: string | null
  /** For an organisation not yet linked: a client or lead in UNISON with the same company name, offered as a link. */
  match: { kind: 'client' | 'lead'; id: string; name: string } | null
}

export type MarketOperation = {
  id: string
  organizationId: string
  name: string
  province: Province
  district: string | null
  latitude: number
  longitude: number
  primaryCommodity: string | null
  otherCommodities: string[]
  operationType: string | null
  operatingStatus: string | null
  locationAccuracy: 'exact' | 'approximate' | 'district'
  source: string
  verifiedOn: string | null
}

export type MarketData = { organizations: MarketOrganization[]; operations: MarketOperation[] }

export type MarketFilters = { province: string; commodity: string; company: string; status: string; search: string }
export const NO_FILTERS: MarketFilters = { province: '', commodity: '', company: '', status: '', search: '' }

export const operationCommodities = (operation: MarketOperation) =>
  [operation.primaryCommodity, ...operation.otherCommodities].filter((value): value is string => Boolean(value))

/** The operations that pass every filter. The search matches the operation, its organisation or its parent. */
export function filterOperations(data: MarketData, filters: MarketFilters): MarketOperation[] {
  const byId = new Map(data.organizations.map((organization) => [organization.id, organization]))
  const search = filters.search.trim().toLowerCase()
  return data.operations.filter((operation) => {
    const organization = byId.get(operation.organizationId)
    if (!organization) return false
    if (filters.province && operation.province !== filters.province) return false
    if (filters.commodity && !operationCommodities(operation).includes(filters.commodity)) return false
    if (filters.company && organization.id !== filters.company) return false
    if (filters.status && organization.status !== filters.status) return false
    if (search) {
      const haystack = [operation.name, organization.name, organization.tradingName, organization.parentName].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

export type MarketSnapshot = {
  operations: number
  companies: number
  provinces: number
  /** Distinct organisations that are a client, have a proposal out or are actively engaged. */
  engaged: number
  /** Operations by their organisation's status. They add up to `operations`. */
  byStatus: Record<EngagementStatus, number>
}

export function snapshot(data: MarketData, operations: MarketOperation[]): MarketSnapshot {
  const byId = new Map(data.organizations.map((organization) => [organization.id, organization]))
  const companies = new Set<string>()
  const provinces = new Set<string>()
  const engaged = new Set<string>()
  const byStatus = Object.fromEntries(ENGAGEMENT_STATUSES.map((status) => [status, 0])) as Record<EngagementStatus, number>
  for (const operation of operations) {
    const organization = byId.get(operation.organizationId)
    if (!organization) continue
    companies.add(organization.id)
    provinces.add(operation.province)
    byStatus[organization.status] += 1
    if (organization.status === 'client' || organization.status === 'proposal' || organization.status === 'active') engaged.add(organization.id)
  }
  return { operations: operations.length, companies: companies.size, provinces: provinces.size, engaged: engaged.size, byStatus }
}

/** The options each filter offers, from the data itself. */
export function filterOptions(data: MarketData) {
  const commodities = new Set<string>()
  for (const operation of data.operations) for (const commodity of operationCommodities(operation)) commodities.add(commodity)
  const withOperations = new Set(data.operations.map((operation) => operation.organizationId))
  return {
    provinces: PROVINCES.filter((province) => data.operations.some((operation) => operation.province === province)),
    commodities: [...commodities].sort((a, b) => a.localeCompare(b)),
    companies: data.organizations.filter((organization) => withOperations.has(organization.id)).map((organization) => ({ id: organization.id, name: organization.name })).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** The key two names share when they are the same company: lower case, without punctuation or a company suffix. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\((pty|proprietary)\)/g, ' ')
    .replace(/\b(pty|proprietary|ltd|limited|inc|incorporated|plc|soc|rf|holdings?|group|company|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
