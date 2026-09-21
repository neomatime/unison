"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import {
  readApprovalFields,
  readArtefactFields,
  readDecisionFields,
  readRiskFields,
} from "../governance-fields";

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
  const fields = readDecisionFields(form);
  if ("error" in fields) return { error: fields.error };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("project_decisions")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      ...fields,
      decided_by: ctx.user.id,
      decided_at: fields.decided_at ?? new Date().toISOString().slice(0, 10),
    });
  if (error) return { error: "The decision could not be recorded." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Decision recorded." };
}

export async function updateDecisionAction(
  decisionId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(decisionId)) return { error: "That decision is invalid." };
  const fields = readDecisionFields(form);
  if ("error" in fields) return { error: fields.error };
  if (fields.decided_at === null)
    return { error: "Enter a valid decision date." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // decided_by is set at creation and deliberately absent from this update.
  const { data, error } = await supabase
    .from("project_decisions")
    .update({
      title: fields.title,
      decision: fields.decision,
      rationale: fields.rationale,
      decided_at: fields.decided_at,
    })
    .eq("id", decisionId)
    .eq("organization_id", organization.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "The decision could not be updated." };
  if (!data) return { error: "That decision no longer exists, or is not yours." };
  revalidatePath(`/operations/projects/${data.project_id}`);
  return { success: "Decision updated." };
}

export async function deleteDecisionAction(
  decisionId: string,
  _previous: GovernanceActionState | undefined,
  _form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(decisionId)) return { error: "That decision is invalid." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  const { data, error } = await supabase
    .from("project_decisions")
    .delete()
    .eq("id", decisionId)
    .eq("organization_id", organization.id)
    .select("id, project_id");
  if (error) return { error: "The decision could not be removed." };
  if (!data || data.length === 0)
    return { error: "That decision no longer exists, or is not yours." };
  revalidatePath(`/operations/projects/${data[0].project_id}`);
  return { success: "Decision removed." };
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
  const fields = readApprovalFields(form);
  if ("error" in fields) return { error: fields.error };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const submit = value(form, "intent") === "submit";
  const { data, error } = await ctx.supabase
    .from("approvals")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      ...fields,
      requested_by: ctx.user.id,
      status: submit ? "Pending" : "Draft",
      submitted_at: submit ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "The approval could not be created." };
  if (submit) {
    const history = await ctx.supabase.from("approval_decisions").insert({
      organization_id: ctx.organization.id,
      approval_id: data.id,
      action: "Submitted",
      actor_id: ctx.user.id,
    });
    if (history.error)
      return {
        error:
          "The approval was created, but its decision history could not be recorded.",
      };
  }
  revalidatePath(`/operations/projects/${projectId}`);
  revalidatePath("/delivery/approvals");
  return { success: submit ? "Approval submitted." : "Draft saved." };
}

export async function updateApprovalAction(
  approvalId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(approvalId)) return { error: "That approval is invalid." };
  const fields = readApprovalFields(form);
  if ("error" in fields) return { error: fields.error };
  const submit = String(form.get("intent") ?? "") === "submit";
  const { organization, user } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // Only a Draft is editable; the database locks a submitted approval as well.
  const { data, error } = await supabase
    .from("approvals")
    .update({
      ...fields,
      ...(submit
        ? { status: "Pending", submitted_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", approvalId)
    .eq("organization_id", organization.id)
    .eq("status", "Draft")
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "The approval could not be updated." };
  if (!data)
    return { error: "That approval is no longer a Draft, or no longer exists." };
  if (submit) {
    const history = await supabase.from("approval_decisions").insert({
      organization_id: organization.id,
      approval_id: approvalId,
      action: "Submitted",
      actor_id: user.id,
    });
    if (history.error)
      return {
        error:
          "The approval changed, but its decision history could not be recorded.",
      };
  }
  if (data.project_id) revalidatePath(`/operations/projects/${data.project_id}`);
  revalidatePath("/delivery/approvals");
  return { success: submit ? "Approval submitted." : "Draft saved." };
}

export async function deleteApprovalAction(
  approvalId: string,
  _previous: GovernanceActionState | undefined,
  _form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(approvalId)) return { error: "That approval is invalid." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  const { data, error } = await supabase
    .from("approvals")
    .delete()
    .eq("id", approvalId)
    .eq("organization_id", organization.id)
    .eq("status", "Draft")
    .select("id, project_id");
  if (error) return { error: "The approval could not be removed." };
  if (!data || data.length === 0)
    return {
      error: "That approval no longer exists, is not a Draft, or is not yours.",
    };
  if (data[0].project_id)
    revalidatePath(`/operations/projects/${data[0].project_id}`);
  revalidatePath("/delivery/approvals");
  return { success: "Draft removed." };
}
