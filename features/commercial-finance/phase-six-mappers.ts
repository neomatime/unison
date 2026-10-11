// The row-to-record mapping for the five registers, one row at a time, and which names a page of rows needs.
// Pure: no directive, no server-only import, relative imports only (unit tests load it).
import { isDraftReference } from '../documents/vocabulary.ts'
import { isUuid } from '../../lib/utils/index.ts'
import type { PhaseSixKind, PhaseSixRecord } from './queries/phase-six.ts'

export type NameMaps = {
  members: Map<string, string>
  leads: Map<string, string>
  opportunities: Map<string, string>
  projects: Map<string, string>
  quotes: Map<string, string>
  vendors: Map<string, string>
  clients: Map<string, string>
}

export const emptyNameMaps = (): NameMaps => ({
  members: new Map(), leads: new Map(), opportunities: new Map(), projects: new Map(), quotes: new Map(), vendors: new Map(), clients: new Map(),
})

const nameFor = (map: Map<string, string>, id: unknown, fallback = 'Unassigned') =>
  typeof id === 'string' ? map.get(id) ?? fallback : fallback

/** A draft carries a generated reference; the registers show it as a draft for the client, not as a code. */
export const documentName = (reference: unknown, clientName: unknown, kind: 'quote' | 'invoice') => {
  if (!isDraftReference(reference)) return String(reference)
  const label = kind === 'quote' ? 'Draft quote' : 'Draft invoice'
  return clientName ? `${label} · ${String(clientName)}` : label
}

type Kind = Exclude<PhaseSixKind, 'forecast'>

/** Which columns of each kind hold ids whose names the screen shows. */
const NAME_COLUMNS: Record<Kind, Array<[keyof NameMaps, string]>> = {
  lead: [['members', 'owner_id']],
  quote: [['members', 'owner_id'], ['leads', 'lead_id'], ['opportunities', 'opportunity_id']],
  opportunity: [['members', 'owner_id'], ['leads', 'lead_id']],
  invoice: [['members', 'owner_id'], ['projects', 'project_id'], ['quotes', 'quote_id'], ['opportunities', 'opportunity_id']],
  expense: [['members', 'submitted_by'], ['members', 'approved_by'], ['vendors', 'vendor_id'], ['projects', 'project_id'], ['clients', 'client_id']],
}

export function collectNameIds(kind: Kind, rows: Array<Record<string, unknown>>): Record<keyof NameMaps, string[]> {
  const found: Record<keyof NameMaps, Set<string>> = {
    members: new Set(), leads: new Set(), opportunities: new Set(), projects: new Set(), quotes: new Set(), vendors: new Set(), clients: new Set(),
  }
  for (const row of rows) {
    for (const [map, column] of NAME_COLUMNS[kind]) {
      const value = row[column]
      if (typeof value === 'string' && isUuid(value)) found[map].add(value)
    }
  }
  return Object.fromEntries(Object.entries(found).map(([map, ids]) => [map, [...ids]])) as Record<keyof NameMaps, string[]>
}

export function mapPhaseSixRow(kind: Kind, row: any, names: NameMaps): PhaseSixRecord {
  switch (kind) {
    case 'lead':
      return {
        id: row.id,
        name: row.company_name,
        companyName: row.company_name,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        contactRole: row.contact_role,
        organizationSize: row.organization_size,
        industry: row.industry,
        areasOfInterest: row.areas_of_interest,
        primaryChallenge: row.primary_challenge,
        businessImpact: row.business_impact,
        impactSeverity: row.impact_severity,
        urgency: row.urgency,
        buyingStage: row.buying_stage,
        engagementType: row.engagement_type,
        qualificationOutcome: row.qualification_outcome,
        qualificationScore: row.qualification_score,
        qualificationSignals: row.qualification_signals,
        manualReviewRequired: row.manual_review_required,
        reviewOverride: row.review_override,
        websiteSubmittedAt: row.website_submitted_at,
        source: row.source,
        ownerId: row.owner_id,
        owner: nameFor(names.members, row.owner_id),
        estimatedValue: row.estimated_value,
        currency: row.currency,
        lastActivityAt: row.last_activity_at,
        notes: row.notes,
        status: row.status,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
      }
    case 'quote':
      return {
        id: row.id,
        name: documentName(row.quote_number, row.client_name, 'quote'),
        quoteNumber: row.quote_number,
        clientId: row.client_id,
        clientName: row.client_name,
        contactName: row.contact_name,
        leadId: row.lead_id,
        lead: nameFor(names.leads, row.lead_id, '—'),
        opportunityId: row.opportunity_id,
        opportunity: nameFor(names.opportunities, row.opportunity_id, '—'),
        ownerId: row.owner_id,
        owner: nameFor(names.members, row.owner_id),
        validUntil: row.valid_until,
        issueDate: row.issue_date,
        projectName: row.project_name,
        projectDescription: row.project_description,
        projectRef: row.project_ref,
        clientRef: row.client_ref,
        vatRate: row.vat_rate,
        subtotal: row.subtotal,
        taxAmount: row.tax_amount,
        totalAmount: row.total_amount,
        currency: row.currency,
        sentAt: row.sent_at,
        acceptedAt: row.accepted_at,
        terms: row.terms,
        notes: row.notes,
        status: row.status,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
      }
    case 'opportunity':
      return {
        id: row.id,
        name: row.name,
        clientId: row.client_id,
        clientName: row.client_name,
        leadId: row.lead_id,
        lead: nameFor(names.leads, row.lead_id, '—'),
        ownerId: row.owner_id,
        owner: nameFor(names.members, row.owner_id),
        stage: row.stage,
        expectedValue: row.expected_value,
        currency: row.currency,
        probabilityPercent: row.probability_percent,
        expectedClose: row.expected_close,
        nextStep: row.next_step,
        lostReason: row.lost_reason,
        wonAt: row.won_at,
        notes: row.notes,
        status: row.stage,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
      }
    case 'invoice':
      return {
        id: row.id,
        name: documentName(row.invoice_number, row.client_name, 'invoice'),
        invoiceNumber: row.invoice_number,
        clientId: row.client_id,
        clientName: row.client_name,
        projectId: row.project_id,
        project: nameFor(names.projects, row.project_id, '—'),
        quoteId: row.quote_id,
        quote: nameFor(names.quotes, row.quote_id, '—'),
        opportunityId: row.opportunity_id,
        opportunity: nameFor(names.opportunities, row.opportunity_id, '—'),
        ownerId: row.owner_id,
        owner: nameFor(names.members, row.owner_id),
        issueDate: row.issue_date,
        dueDate: row.due_date,
        projectName: row.project_name,
        projectDescription: row.project_description,
        projectRef: row.project_ref,
        clientRef: row.client_ref,
        vatRate: row.vat_rate,
        subtotal: row.subtotal,
        taxAmount: row.tax_amount,
        totalAmount: row.total_amount,
        balanceAmount: row.balance_amount,
        currency: row.currency,
        paidAt: row.paid_at,
        paymentTerms: row.payment_terms,
        notes: row.notes,
        status: row.status,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
      }
    case 'expense':
      return {
        id: row.id,
        name: row.description,
        description: row.description,
        category: row.category,
        vendorId: row.vendor_id,
        vendor: nameFor(names.vendors, row.vendor_id, row.vendor_name ?? '—'),
        vendorName: row.vendor_name,
        projectId: row.project_id,
        project: nameFor(names.projects, row.project_id, '—'),
        clientId: row.client_id,
        client: nameFor(names.clients, row.client_id, '—'),
        submittedBy: row.submitted_by,
        submitter: nameFor(names.members, row.submitted_by),
        approvedBy: row.approved_by,
        approver: nameFor(names.members, row.approved_by, '—'),
        amount: row.amount,
        currency: row.currency,
        expenseDate: row.expense_date,
        receiptReference: row.receipt_reference,
        notes: row.notes,
        submittedAt: row.submitted_at,
        approvedAt: row.approved_at,
        status: row.status,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
      }
  }
}
