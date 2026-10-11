import "server-only";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import {
  collectNameIds,
  documentName,
  emptyNameMaps,
  mapPhaseSixRow,
  type NameMaps,
} from "../phase-six-mappers";

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
  defaults: { quoteTerms: string | null; paymentTerms: string | null };
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
  const [members, clients, projects, vendors, leads, opportunities, quotes, settings] = await Promise.all([
    db.from("team_members").select("id,full_name").eq("organization_id", organizationId).eq("status", "Active").is("archived_at", null).order("full_name"),
    db.from("clients").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("projects").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("vendors").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("leads").select("id,company_name").eq("organization_id", organizationId).is("archived_at", null).order("company_name"),
    db.from("sales_opportunities").select("id,name").eq("organization_id", organizationId).is("archived_at", null).order("name"),
    db.from("quotes").select("id,quote_number,client_name").eq("organization_id", organizationId).is("archived_at", null).order("quote_number"),
    db.from("organization_settings").select("default_quote_terms,default_payment_terms").eq("organization_id", organizationId).maybeSingle(),
  ]);
  for (const result of [members, clients, projects, vendors, leads, opportunities, quotes, settings]) {
    if (result.error) throw result.error;
  }
  return {
    members: (members.data ?? []).map((row: any) => ({ id: row.id, label: row.full_name })),
    clients: (clients.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    projects: (projects.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    vendors: (vendors.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    leads: (leads.data ?? []).map((row: any) => ({ id: row.id, label: row.company_name })),
    opportunities: (opportunities.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    quotes: (quotes.data ?? []).map((row: any) => ({ id: row.id, label: documentName(row.quote_number, row.client_name, "quote") })),
    defaults: {
      quoteTerms: settings.data?.default_quote_terms ?? null,
      paymentTerms: settings.data?.default_payment_terms ?? null,
    },
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

/** The names a set of rows shows, looked up only for the ids those rows hold (not by loading every member, client and project). */
export async function loadNameMaps(db: any, organizationId: string, kind: Exclude<PhaseSixKind, "forecast">, rows: Array<Record<string, unknown>>): Promise<NameMaps> {
  const ids = collectNameIds(kind, rows);
  const names = emptyNameMaps();
  const lookup = async (map: keyof NameMaps, table: string, columns: string, label: (row: any) => string) => {
    if (ids[map].length === 0) return;
    const result = await db.from(table).select(columns).eq("organization_id", organizationId).in("id", ids[map]);
    if (result.error) throw result.error;
    for (const row of result.data ?? []) names[map].set(row.id, label(row));
  };
  await Promise.all([
    lookup("members", "team_members", "id,full_name", (row) => row.full_name),
    lookup("leads", "leads", "id,company_name", (row) => row.company_name),
    lookup("opportunities", "sales_opportunities", "id,name", (row) => row.name),
    lookup("projects", "projects", "id,name", (row) => row.name),
    lookup("quotes", "quotes", "id,quote_number,client_name", (row) => documentName(row.quote_number, row.client_name, "quote")),
    lookup("vendors", "vendors", "id,name", (row) => row.name),
    lookup("clients", "clients", "id,name", (row) => row.name),
  ]);
  return names;
}

export async function mapRows(kind: Exclude<PhaseSixKind, "forecast">, rows: any[]): Promise<PhaseSixRecord[]> {
  const { organization, db } = await context();
  const names = await loadNameMaps(db, organization.id, kind, rows);
  return rows.map((row) => mapPhaseSixRow(kind, row, names));
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

const TABLES = {
  lead: "leads",
  quote: "quotes",
  opportunity: "sales_opportunities",
  invoice: "invoices",
  expense: "expenses",
} as const;

export async function getPhaseSixRecord(kind: PhaseSixKind, id: string) {
  if (!isUuid(id)) return null;
  if (kind === "forecast") return (await listForecasts()).find((record) => record.id === id) ?? null;
  const { organization, db } = await context();
  const found = await db.from(TABLES[kind]).select("*").eq("id", id).eq("organization_id", organization.id).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return null;
  return (await mapRows(kind, [found.data]))[0] ?? null;
}
