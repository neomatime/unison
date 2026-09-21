"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { readGateFields } from "../governance-fields";

type GateActionState = { error?: string; success?: string };

export async function createGovernanceGateAction(
  frameworkId: string,
  _previous: GateActionState | undefined,
  form: FormData,
): Promise<GateActionState> {
  const phaseId = String(form.get("phaseId") ?? "");
  if (!isUuid(frameworkId) || !isUuid(phaseId))
    return { error: "A phase and gate name are required." };
  const fields = readGateFields(form);
  if ("error" in fields) return { error: fields.error };
  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const db = supabase as any;
  const { error } = await db
    .from("governance_gates")
    .insert({
      organization_id: organization.id,
      framework_id: frameworkId,
      phase_id: phaseId,
      ...fields,
    });
  if (error?.code === "23505")
    return { error: "That phase already has a gate with this name." };
  if (error) return { error: "The governance gate could not be created." };
  revalidatePath(`/delivery/frameworks/${frameworkId}`);
  return { success: "Governance gate created." };
}

export async function updateGovernanceGateAction(
  gateId: string,
  _previous: GateActionState | undefined,
  form: FormData,
): Promise<GateActionState> {
  if (!isUuid(gateId)) return { error: "That gate is invalid." };
  const fields = readGateFields(form);
  if ("error" in fields) return { error: fields.error };
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  // phase_id is fixed at creation and deliberately absent from this update.
  const { data, error } = await db
    .from("governance_gates")
    .update(fields)
    .eq("id", gateId)
    .eq("organization_id", organization.id)
    .select("framework_id")
    .maybeSingle();
  if (error?.code === "23505")
    return { error: "That phase already has a gate with this name." };
  if (error) return { error: "The governance gate could not be updated." };
  if (!data) return { error: "That gate no longer exists, or is not yours." };
  revalidatePath(`/delivery/frameworks/${data.framework_id}`);
  return { success: "Governance gate updated." };
}

export async function deleteGovernanceGateAction(
  gateId: string,
  _previous: GateActionState | undefined,
  _form: FormData,
): Promise<GateActionState> {
  if (!isUuid(gateId)) return { error: "That gate is invalid." };
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const { data, error } = await db
    .from("governance_gates")
    .delete()
    .eq("id", gateId)
    .eq("organization_id", organization.id)
    .select("id, framework_id");
  if (error) return { error: "The governance gate could not be removed." };
  if (!data || data.length === 0)
    return { error: "That gate no longer exists, or is not yours." };
  revalidatePath(`/delivery/frameworks/${data[0].framework_id}`);
  return { success: "Governance gate removed." };
}
