import "server-only";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { listOrganizationMembers } from "@/features/memberships/queries/list-organization-members";

export type ProjectGovernance = {
  risks: Array<{
    id: string;
    title: string;
    description: string | null;
    probability: string;
    impact: string;
    status: string;
    owner_id: string | null;
    /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
    owner: string;
    mitigation: string | null;
    target_date: string | null;
    created_at: string;
  }>;
  decisions: Array<{ id: string; title: string; decision: string; rationale: string | null; decided_at: string; created_at: string }>;
  approvals: Array<{ id: string; title: string; status: string; priority: string; due_date: string | null; submitted_at: string | null; decided_at: string | null }>;
  artefacts: Array<{ id: string; name: string; external_url: string | null; notes: string | null; created_at: string }>;
};

export async function getProjectGovernance(projectId: string): Promise<ProjectGovernance> {
  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const db = supabase as any;
  const [risks, decisions, approvals, artefacts, members] = await Promise.all([
    db
      .from("project_risks")
      .select(
        "id,title,description,probability,impact,status,owner_id,mitigation,target_date,created_at",
      )
      .eq("organization_id", organization.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    db
      .from("project_decisions")
      .select("id,title,decision,rationale,decided_at,created_at")
      .eq("organization_id", organization.id)
      .eq("project_id", projectId)
      .order("decided_at", { ascending: false }),
    db
      .from("approvals")
      .select("id,title,status,priority,due_date,submitted_at,decided_at")
      .eq("organization_id", organization.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    db
      .from("governance_artefacts")
      .select("id,name,external_url,notes,created_at")
      .eq("organization_id", organization.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    listOrganizationMembers(),
  ]);
  for (const result of [risks, decisions, approvals, artefacts])
    if (result.error) throw result.error;
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  return {
    risks: (risks.data ?? []).map((row: Omit<ProjectGovernance["risks"][number], "owner">) => ({
      ...row,
      // A removed member keeps their place here as "Former member" rather than
      // becoming a blank: nulling ownership when someone leaves would erase who
      // was accountable.
      owner: row.owner_id ? (memberNames.get(row.owner_id) ?? "Former member") : "Unassigned",
    })),
    decisions: decisions.data ?? [],
    approvals: approvals.data ?? [],
    artefacts: artefacts.data ?? [],
  };
}
