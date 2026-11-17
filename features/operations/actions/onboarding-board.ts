"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { isOnboardingStage, progressAfterMove } from "../onboarding-board";

export type MoveOnboardingResult = { ok: true; progress: number } | { ok: false; error: string };

/**
 * Saves a card dropped on a new stage of the Onboarding board. Only the stage changes, plus the progress when the card reaches
 * Go Live / Handover (100%); nothing else on the onboarding is touched. The update is limited to this workspace and to
 * onboardings that are not archived, and the database's own row rules still apply.
 */
export async function moveOnboardingStageAction(id: string, stage: string): Promise<MoveOnboardingResult> {
  if (!isUuid(id) || !isOnboardingStage(stage)) return { ok: false, error: "That move is not valid." };
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const current = await db
    .from("client_onboardings")
    .select("progress_percent")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .is("archived_at", null)
    .maybeSingle();
  if (current.error || !current.data) return { ok: false, error: "This onboarding could not be found. It may have been archived." };
  const progress = progressAfterMove(stage, Number(current.data.progress_percent ?? 0));
  const result = await db
    .from("client_onboardings")
    .update({ stage, progress_percent: progress })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) return { ok: false, error: "The move could not be saved. Try again." };
  revalidatePath("/operations/onboarding");
  revalidatePath(`/operations/onboarding/${id}`);
  return { ok: true, progress };
}
