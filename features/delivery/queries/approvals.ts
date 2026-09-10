import "server-only";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type ApprovalRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string;
  requestedBy: string;
  approver: string;
  createdAt: string;
  decisions: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
  }>;
  artefacts: Array<{ id: string; name: string; url: string | null }>;
};

export async function listApprovals(): Promise<ApprovalRecord[]> {
  return loadApprovals();
}
export async function getApproval(id: string): Promise<ApprovalRecord | null> {
  if (!isUuid(id)) return null;
  return (await loadApprovals(id))[0] ?? null;
}

async function loadApprovals(id?: string): Promise<ApprovalRecord[]> {
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  let query = db
    .from("approvals")
    .select(
      "id,title,description,status,priority,due_date,project_id,requested_by,approver_id,created_at,projects(name)",
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });
  if (id) query = query.eq("id", id);
  const { data, error } = await query;
  if (error) throw error;
  const ids = (data ?? []).map((row: { id: string }) => row.id);
  const [history, artefacts] = ids.length
    ? await Promise.all([
        db
          .from("approval_decisions")
          .select("id,approval_id,action,comment,created_at")
          .eq("organization_id", organization.id)
          .in("approval_id", ids)
          .order("created_at", { ascending: false }),
        db
          .from("governance_artefacts")
          .select("id,approval_id,name,external_url")
          .eq("organization_id", organization.id)
          .in("approval_id", ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (history.error) throw history.error;
  if (artefacts.error) throw artefacts.error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    projectId: row.project_id,
    projectName: row.projects?.name ?? "Framework governance",
    requestedBy: row.requested_by ? "Organisation member" : "System",
    approver: row.approver_id ? "Assigned" : "Unassigned",
    createdAt: row.created_at,
    decisions: (history.data ?? [])
      .filter((item: any) => item.approval_id === row.id)
      .map((item: any) => ({
        id: item.id,
        action: item.action,
        comment: item.comment,
        createdAt: item.created_at,
      })),
    artefacts: (artefacts.data ?? [])
      .filter((item: any) => item.approval_id === row.id)
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        url: item.external_url,
      })),
  }));
}

export async function listApprovalProjects() {
  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id,name")
    .eq("organization_id", organization.id)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
