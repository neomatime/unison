"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

const statuses: Record<string, { status: string; event: string }> = {
  approve: { status: "Approved", event: "Approved" },
  changes: { status: "Changes Requested", event: "Changes Requested" },
  reject: { status: "Rejected", event: "Rejected" },
  withdraw: { status: "Withdrawn", event: "Withdrawn" },
};

export async function createStandaloneApprovalAction(
  _previous: { error?: string } | undefined,
  form: FormData,
) {
  const projectId = String(form.get("projectId") ?? ""),
    title = String(form.get("title") ?? "").trim(),
    intent = String(form.get("intent") ?? "submit");
  if (!isUuid(projectId) || !title)
    return { error: "Choose a project and enter an approval title." };
  const { organization, user } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const submitted = intent === "submit";
  const { data, error } = await db
    .from("approvals")
    .insert({
      organization_id: organization.id,
      project_id: projectId,
      title,
      description: String(form.get("description") ?? "").trim() || null,
      priority: String(form.get("priority") ?? "Medium"),
      due_date: String(form.get("dueDate") ?? "") || null,
      requested_by: user.id,
      status: submitted ? "Pending" : "Draft",
      submitted_at: submitted ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return { error: "The approval could not be created." };
  if (submitted)
    await db
      .from("approval_decisions")
      .insert({
        organization_id: organization.id,
        approval_id: data.id,
        action: "Submitted",
        actor_id: user.id,
      });
  revalidatePath("/delivery/approvals");
  redirect(`/delivery/approvals/${data.id}`);
}

export async function recordApprovalDecisionAction(
  approvalId: string,
  action: string,
  _previous: { error?: string } | undefined,
  form: FormData,
) {
  if (!isUuid(approvalId) || !statuses[action])
    return { error: "That approval action is invalid." };
  const comment = String(form.get("comment") ?? "").trim();
  if (action !== "approve" && !comment)
    return { error: "A reason is required." };
  const { organization, user } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const decision = statuses[action];
  const { data, error } = await db
    .from("approvals")
    .update({
      status: decision.status,
      decided_at: ["Approved", "Rejected"].includes(decision.status)
        ? new Date().toISOString()
        : null,
    })
    .eq("id", approvalId)
    .eq("organization_id", organization.id)
    .select("id");
  if (error || !data?.length)
    return { error: "The decision could not be recorded." };
  const history = await db
    .from("approval_decisions")
    .insert({
      organization_id: organization.id,
      approval_id: approvalId,
      action: decision.event,
      actor_id: user.id,
      comment: comment || null,
    });
  if (history.error)
    return {
      error:
        "The approval changed, but its decision history could not be recorded.",
    };
  revalidatePath("/delivery/approvals");
  revalidatePath(`/delivery/approvals/${approvalId}`);
  redirect(`/delivery/approvals/${approvalId}`);
}
