"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { readArtefactFields, readRiskFields } from "../governance-fields";

export type GovernanceActionState = { error?: string; success?: string };

const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => value(form, key) || null;

async function context(projectId: string) {
  if (!isUuid(projectId)) return null;
  const { organization, user } = await getSessionContext();
  return { organization, user, supabase: (await createServerSupabase()) as any };
}

export async function createRiskAction(
  projectId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  const fields = readRiskFields(form);
  if ("error" in fields) return { error: fields.error };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("project_risks")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      ...fields,
    });
  if (error) return { error: "The risk could not be recorded." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Risk recorded." };
}

export async function updateRiskAction(
  riskId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(riskId)) return { error: "That risk is invalid." };
  const fields = readRiskFields(form);
  if ("error" in fields) return { error: fields.error };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // organization_id is redundant with RLS and stated anyway. .select() is what
  // distinguishes "saved" from "matched nothing": RLS and the organisation
  // filter both express "not yours" as zero rows, not as an error.
  const { data, error } = await supabase
    .from("project_risks")
    .update(fields)
    .eq("id", riskId)
    .eq("organization_id", organization.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "The risk could not be updated." };
  if (!data) return { error: "That risk no longer exists, or is not yours." };
  revalidatePath(`/operations/projects/${data.project_id}`);
  return { success: "Risk updated." };
}

export async function deleteRiskAction(
  riskId: string,
  _previous: GovernanceActionState | undefined,
  _form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(riskId)) return { error: "That risk is invalid." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  const { data, error } = await supabase
    .from("project_risks")
    .delete()
    .eq("id", riskId)
    .eq("organization_id", organization.id)
    .select("id, project_id");
  if (error) return { error: "The risk could not be removed." };
  if (!data || data.length === 0)
    return { error: "That risk no longer exists, or is not yours." };
  revalidatePath(`/operations/projects/${data[0].project_id}`);
  return { success: "Risk removed." };
}

export async function createDecisionAction(
  projectId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  const title = value(form, "title"),
    decision = value(form, "decision");
  if (!title || !decision)
    return { error: "A title and decision are required." };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("project_decisions")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      title,
      decision,
      rationale: optional(form, "rationale"),
      decided_by: ctx.user.id,
      decided_at:
        value(form, "decidedAt") || new Date().toISOString().slice(0, 10),
    });
  if (error) return { error: "The decision could not be recorded." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Decision recorded." };
}

export async function createArtefactAction(
  projectId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  const fields = readArtefactFields(form);
  if ("error" in fields) return { error: fields.error };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("governance_artefacts")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      ...fields,
      uploaded_by: ctx.user.id,
    });
  if (error) return { error: "The evidence could not be attached." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Evidence attached." };
}

export async function updateArtefactAction(
  artefactId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(artefactId)) return { error: "That evidence is invalid." };
  const fields = readArtefactFields(form);
  if ("error" in fields) return { error: fields.error };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // uploaded_by is set at creation and deliberately absent from this update.
  const { data, error } = await supabase
    .from("governance_artefacts")
    .update(fields)
    .eq("id", artefactId)
    .eq("organization_id", organization.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "The evidence could not be updated." };
  if (!data) return { error: "That evidence no longer exists, or is not yours." };
  if (data.project_id) revalidatePath(`/operations/projects/${data.project_id}`);
  return { success: "Evidence updated." };
}

export async function deleteArtefactAction(
  artefactId: string,
  _previous: GovernanceActionState | undefined,
  _form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(artefactId)) return { error: "That evidence is invalid." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // Any requirement links to this evidence are removed with it: requirement_evidence
  // cascades from governance_artefacts.
  const { data, error } = await supabase
    .from("governance_artefacts")
    .delete()
    .eq("id", artefactId)
    .eq("organization_id", organization.id)
    .select("id, project_id");
  if (error) return { error: "The evidence could not be removed." };
  if (!data || data.length === 0)
    return { error: "That evidence no longer exists, or is not yours." };
  if (data[0].project_id) revalidatePath(`/operations/projects/${data[0].project_id}`);
  return { success: "Evidence removed." };
}

export async function createApprovalAction(
  projectId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  const title = value(form, "title");
  if (!title) return { error: "Approval title is required." };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const submit = value(form, "intent") === "submit";
  const { error } = await ctx.supabase
    .from("approvals")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      title,
      description: optional(form, "description"),
      priority: value(form, "priority") || "Medium",
      due_date: optional(form, "dueDate"),
      requested_by: ctx.user.id,
      status: submit ? "Pending" : "Draft",
      submitted_at: submit ? new Date().toISOString() : null,
    });
  if (error) return { error: "The approval could not be created." };
  revalidatePath(`/operations/projects/${projectId}`);
  revalidatePath("/delivery/approvals");
  return { success: submit ? "Approval submitted." : "Draft saved." };
}
