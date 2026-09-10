"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

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
  const title = value(form, "title");
  if (!title) return { error: "Risk title is required." };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("project_risks")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      title,
      description: optional(form, "description"),
      probability: value(form, "probability") || "Possible",
      impact: value(form, "impact") || "Moderate",
      status: "Open",
      mitigation: optional(form, "mitigation"),
      target_date: optional(form, "targetDate"),
    });
  if (error) return { error: "The risk could not be recorded." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Risk recorded." };
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
  const name = value(form, "name"),
    externalUrl = value(form, "externalUrl");
  if (!name || !externalUrl)
    return { error: "An artefact name and secure URL are required." };
  try {
    const url = new URL(externalUrl);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    return { error: "Use a valid HTTPS evidence URL." };
  }
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("governance_artefacts")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      name,
      external_url: externalUrl,
      notes: optional(form, "notes"),
      uploaded_by: ctx.user.id,
    });
  if (error) return { error: "The evidence could not be attached." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Evidence attached." };
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
