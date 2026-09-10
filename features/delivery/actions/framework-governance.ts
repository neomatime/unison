"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export async function createGovernanceGateAction(
  frameworkId: string,
  _previous: { error?: string; success?: string } | undefined,
  form: FormData,
) {
  const phaseId = String(form.get("phaseId") ?? ""),
    name = String(form.get("name") ?? "").trim();
  if (!isUuid(frameworkId) || !isUuid(phaseId) || !name)
    return { error: "A phase and gate name are required." };
  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const db = supabase as any;
  const { error } = await db
    .from("governance_gates")
    .insert({
      organization_id: organization.id,
      framework_id: frameworkId,
      phase_id: phaseId,
      name,
      description: String(form.get("description") ?? "").trim() || null,
      approval_required: form.get("approvalRequired") === "on",
      evidence_required: form.get("evidenceRequired") === "on",
    });
  if (error?.code === "23505")
    return { error: "That phase already has a gate with this name." };
  if (error) return { error: "The governance gate could not be created." };
  revalidatePath(`/delivery/frameworks/${frameworkId}`);
  return { success: "Governance gate created." };
}
