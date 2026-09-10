import "server-only";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { listOrganizationMembers } from "@/features/memberships/queries/list-organization-members";
import { isUuid } from "@/lib/utils";

export type PortfolioRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  businessUnit: string | null;
  objective: string | null;
  status: string;
  startDate: string | null;
  targetEndDate: string | null;
  archivedAt: string | null;
  owner: string;
  sponsor: string;
  programmeCount: number;
  projectCount: number;
};
export type ProgrammeRecord = {
  id: string;
  portfolioId: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  health: string;
  startDate: string | null;
  targetEndDate: string | null;
  archivedAt: string | null;
  owner: string;
  sponsor: string;
  projectCount: number;
};

export async function listPortfolios(): Promise<PortfolioRecord[]> {
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const [result, members] = await Promise.all([
    db
      .from("portfolios")
      .select(
        "id,name,code,description,business_unit,strategic_objective,status,start_date,target_end_date,archived_at,owner_id,sponsor_id,programmes(count),projects(count)",
      )
      .eq("organization_id", organization.id)
      .order("name"),
    listOrganizationMembers(),
  ]);
  if (result.error) throw result.error;
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  return (result.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    businessUnit: r.business_unit,
    objective: r.strategic_objective,
    status: r.status,
    startDate: r.start_date,
    targetEndDate: r.target_end_date,
    archivedAt: r.archived_at,
    owner: r.owner_id
      ? (names.get(r.owner_id) ?? "Former member")
      : "Unassigned",
    sponsor: r.sponsor_id
      ? (names.get(r.sponsor_id) ?? "Former member")
      : "Unassigned",
    programmeCount: r.programmes?.[0]?.count ?? 0,
    projectCount: r.projects?.[0]?.count ?? 0,
  }));
}
export async function getPortfolio(id: string) {
  if (!isUuid(id)) return null;
  return (await listPortfolios()).find((p) => p.id === id) ?? null;
}
export async function listProgrammes(
  portfolioId: string,
): Promise<ProgrammeRecord[]> {
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const [result, members] = await Promise.all([
    db
      .from("programmes")
      .select(
        "id,portfolio_id,name,code,description,status,health,start_date,target_end_date,archived_at,owner_id,sponsor_id,projects(count)",
      )
      .eq("organization_id", organization.id)
      .eq("portfolio_id", portfolioId)
      .order("name"),
    listOrganizationMembers(),
  ]);
  if (result.error) throw result.error;
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  return (result.data ?? []).map((r: any) => ({
    id: r.id,
    portfolioId: r.portfolio_id,
    name: r.name,
    code: r.code,
    description: r.description,
    status: r.status,
    health: r.health,
    startDate: r.start_date,
    targetEndDate: r.target_end_date,
    archivedAt: r.archived_at,
    owner: r.owner_id
      ? (names.get(r.owner_id) ?? "Former member")
      : "Unassigned",
    sponsor: r.sponsor_id
      ? (names.get(r.sponsor_id) ?? "Former member")
      : "Unassigned",
    projectCount: r.projects?.[0]?.count ?? 0,
  }));
}
export async function getProgramme(portfolioId: string, id: string) {
  if (!isUuid(id)) return null;
  return (await listProgrammes(portfolioId)).find((p) => p.id === id) ?? null;
}

export async function listPortfolioProjectOptions(portfolioId: string) {
  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const db = supabase as any;
  const { data, error } = await db
    .from("projects")
    .select("id,name,status,health,portfolio_id,programme_id")
    .eq("organization_id", organization.id)
    .is("archived_at", null)
    .or(`portfolio_id.is.null,portfolio_id.eq.${portfolioId}`)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    health: row.health,
    assigned: row.portfolio_id === portfolioId,
    programmeId: row.programme_id,
  }));
}

export async function getExecutiveVisibility() {
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const [approvals, gates, evidence, risks, decisions, dependencies] =
    await Promise.all([
      db
        .from("approvals")
        .select(
          "id,status,due_date,project_id,projects(name,portfolio_id,programme_id)",
        )
        .eq("organization_id", organization.id),
      db
        .from("governance_gates")
        .select("id,name,approval_required,evidence_required,framework_id")
        .eq("organization_id", organization.id),
      db
        .from("governance_artefacts")
        .select("id,gate_id,approval_id,project_id")
        .eq("organization_id", organization.id),
      db
        .from("project_risks")
        .select(
          "id,title,probability,impact,status,project_id,projects(name,portfolio_id,programme_id)",
        )
        .eq("organization_id", organization.id)
        .neq("status", "Closed"),
      db
        .from("project_decisions")
        .select(
          "id,title,decided_at,project_id,projects(name,portfolio_id,programme_id)",
        )
        .eq("organization_id", organization.id)
        .order("decided_at", { ascending: false }),
      db
        .from("project_dependencies")
        .select(
          "id,criticality,dependent_project_id,prerequisite_project_id,dependent:projects!project_dependencies_dependent_fkey(name,health,portfolio_id,programme_id),prerequisite:projects!project_dependencies_prerequisite_fkey(name,status,health,archived_at)",
        )
        .eq("organization_id", organization.id),
    ]);
  for (const r of [approvals, gates, evidence, risks, decisions, dependencies])
    if (r.error) throw r.error;
  return {
    approvals: approvals.data ?? [],
    gates: gates.data ?? [],
    evidence: evidence.data ?? [],
    risks: risks.data ?? [],
    decisions: decisions.data ?? [],
    dependencies: dependencies.data ?? [],
  };
}
