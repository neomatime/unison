import "server-only";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type PhaseSixKind =
  | "lead"
  | "quote"
  | "opportunity"
  | "invoice"
  | "expense"
  | "forecast";

export type SelectOption = { id: string; label: string };
export type PhaseSixOptions = {
  members: SelectOption[];
  clients: SelectOption[];
  projects: SelectOption[];
  vendors: SelectOption[];
  leads: SelectOption[];
  opportunities: SelectOption[];
  quotes: SelectOption[];
};
export type PhaseSixRecord = Record<string, unknown> & {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  archivedAt: string | null;
};

async function context() {
  const { organization } = await getSessionContext();
  return { organization, db: (await createServerSupabase()) as any };
}

const makeMap = (options: SelectOption[]) =>
  new Map(options.map((option) => [option.id, option.label]));

const nameFor = (map: Map<string, string>, id: unknown, fallback = "Unassigned") =>
  typeof id === "string" ? map.get(id) ?? fallback : fallback;

export async function getPhaseSixOptions(): Promise<PhaseSixOptions> {
  const { organization, db } = await context();
  const organizationId = organization.id;
  const [members, clients, projects, vendors, leads, opportunities, quotes] = await Promise.all([
    db.from("team_members").select("id,full_name").eq("organization_id", organizationId).eq("status", "Active").is("archived_at", null).order("full_name"),
    db.from("clients").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("projects").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("vendors").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("leads").select("id,company_name").eq("organization_id", organizationId).is("archived_at", null).order("company_name"),
    db.from("sales_opportunities").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("quotes").select("id,quote_number").eq("organization_id", organizationId).is("archived_at", null).order("quote_number"),
  ]);
  for (const result of [members, clients, projects, vendors, leads, opportunities, quotes]) {
    if (result.error) throw result.error;
  }
  return {
    members: (members.data ?? []).map((row: any) => ({ id: row.id, label: row.full_name })),
    clients: (clients.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    projects: (projects.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    vendors: (vendors.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    leads: (leads.data ?? []).map((row: any) => ({ id: row.id, label: row.company_name })),
    opportunities: (opportunities.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    quotes: (quotes.data ?? []).map((row: any) => ({ id: row.id, label: row.quote_number })),
  };
}

async function records(table: string, orderColumn: string, ascending = true) {
  const { organization, db } = await context();
  const [result, options] = await Promise.all([
    db.from(table).select("*").eq("organization_id", organization.id).order(orderColumn, { ascending }),
    getPhaseSixOptions(),
  ]);
  if (result.error) throw result.error;
  return { rows: result.data ?? [], options };
}

export async function listLeads(): Promise<PhaseSixRecord[]> {
  const { rows, options } = await records("leads", "created_at", false);
  const members = makeMap(options.members);
  return rows.map((row: any) => ({
    id: row.id,
    name: row.company_name,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    source: row.source,
    ownerId: row.owner_id,
    owner: nameFor(members, row.owner_id),
    estimatedValue: row.estimated_value,
    currency: row.currency,
    lastActivityAt: row.last_activity_at,
    notes: row.notes,
    status: row.status,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export async function listQuotes(): Promise<PhaseSixRecord[]> {
  const { rows, options } = await records("quotes", "created_at", false);
  const members = makeMap(options.members);
  const leads = makeMap(options.leads);
  const opportunities = makeMap(options.opportunities);
  return rows.map((row: any) => ({
    id: row.id,
    name: row.quote_number,
    quoteNumber: row.quote_number,
    clientId: row.client_id,
    clientName: row.client_name,
    contactName: row.contact_name,
    leadId: row.lead_id,
    lead: nameFor(leads, row.lead_id, "—"),
    opportunityId: row.opportunity_id,
    opportunity: nameFor(opportunities, row.opportunity_id, "—"),
    ownerId: row.owner_id,
    owner: nameFor(members, row.owner_id),
    validUntil: row.valid_until,
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
  }));
}

export async function listOpportunities(): Promise<PhaseSixRecord[]> {
  const { rows, options } = await records("sales_opportunities", "created_at", false);
  const members = makeMap(options.members);
  const leads = makeMap(options.leads);
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name,
    leadId: row.lead_id,
    lead: nameFor(leads, row.lead_id, "—"),
    ownerId: row.owner_id,
    owner: nameFor(members, row.owner_id),
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
  }));
}

export async function listInvoices(): Promise<PhaseSixRecord[]> {
  const { rows, options } = await records("invoices", "created_at", false);
  const members = makeMap(options.members);
  const projects = makeMap(options.projects);
  const quotes = makeMap(options.quotes);
  const opportunities = makeMap(options.opportunities);
  return rows.map((row: any) => ({
    id: row.id,
    name: row.invoice_number,
    invoiceNumber: row.invoice_number,
    clientId: row.client_id,
    clientName: row.client_name,
    projectId: row.project_id,
    project: nameFor(projects, row.project_id, "—"),
    quoteId: row.quote_id,
    quote: nameFor(quotes, row.quote_id, "—"),
    opportunityId: row.opportunity_id,
    opportunity: nameFor(opportunities, row.opportunity_id, "—"),
    ownerId: row.owner_id,
    owner: nameFor(members, row.owner_id),
    issueDate: row.issue_date,
    dueDate: row.due_date,
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
  }));
}

export async function listExpenses(): Promise<PhaseSixRecord[]> {
  const { rows, options } = await records("expenses", "expense_date", false);
  const members = makeMap(options.members);
  const vendors = makeMap(options.vendors);
  const projects = makeMap(options.projects);
  const clients = makeMap(options.clients);
  return rows.map((row: any) => ({
    id: row.id,
    name: row.description,
    description: row.description,
    category: row.category,
    vendorId: row.vendor_id,
    vendor: nameFor(vendors, row.vendor_id, row.vendor_name ?? "—"),
    vendorName: row.vendor_name,
    projectId: row.project_id,
    project: nameFor(projects, row.project_id, "—"),
    clientId: row.client_id,
    client: nameFor(clients, row.client_id, "—"),
    submittedBy: row.submitted_by,
    submitter: nameFor(members, row.submitted_by),
    approvedBy: row.approved_by,
    approver: nameFor(members, row.approved_by, "—"),
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
  }));
}

export async function listForecasts(): Promise<PhaseSixRecord[]> {
  const { rows, options } = await records("financial_forecasts", "period_start", false);
  const members = makeMap(options.members);
  return rows.map((row: any) => {
    const actual = Number(row.actual_value);
    const projected = Number(row.projected_value);
    return {
      id: row.id,
      name: row.name,
      periodLabel: row.period_label,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      forecastType: row.forecast_type,
      actualValue: actual,
      projectedValue: projected,
      varianceValue: projected - actual,
      confidencePercent: row.confidence_percent,
      currency: row.currency,
      ownerId: row.owner_id,
      owner: nameFor(members, row.owner_id),
      assumptions: row.assumptions,
      status: row.status,
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
    };
  });
}

const loaders: Record<PhaseSixKind, () => Promise<PhaseSixRecord[]>> = {
  lead: listLeads,
  quote: listQuotes,
  opportunity: listOpportunities,
  invoice: listInvoices,
  expense: listExpenses,
  forecast: listForecasts,
};

export async function getPhaseSixRecord(kind: PhaseSixKind, id: string) {
  if (!isUuid(id)) return null;
  return (await loaders[kind]()).find((record) => record.id === id) ?? null;
}
