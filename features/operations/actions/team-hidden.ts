"use server";

import { revalidatePath } from "next/cache";

import { roleHasPermission } from "@/config/roles";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { HIDE_DENIED_MESSAGE, normalizeHiddenEmail } from "../team-hidden";

export type HideResult = { ok: true } | { ok: false; error: string };

async function guard() {
  const { organization, role } = await getSessionContext();
  if (!roleHasPermission(String(role), "members.manage")) return null;
  return { organization, db: (await createServerSupabase()) as any };
}

/** Hides an address from the Team page. Owner or Admin only; the database's own row rules apply as well. Nothing is deleted. */
export async function hideTeamAddressAction(formData: FormData): Promise<void> {
  await hide(formData);
}

async function hide(formData: FormData): Promise<HideResult> {
  const ctx = await guard();
  if (!ctx) return { ok: false, error: HIDE_DENIED_MESSAGE };
  const email = normalizeHiddenEmail(formData.get("email"));
  if (!email) return { ok: false, error: "Enter a full email address." };
  const result = await ctx.db.from("team_hidden_addresses").upsert({ organization_id: ctx.organization.id, email }, { onConflict: "organization_id,email", ignoreDuplicates: true });
  if (result.error) return { ok: false, error: "The address could not be hidden. Try again." };
  revalidatePath("/people/team");
  return { ok: true };
}

/** Shows an address on the Team page again. */
export async function unhideTeamAddressAction(formData: FormData): Promise<void> {
  const ctx = await guard();
  const email = normalizeHiddenEmail(formData.get("email"));
  if (!ctx || !email) return;
  await ctx.db.from("team_hidden_addresses").delete().eq("organization_id", ctx.organization.id).eq("email", email);
  revalidatePath("/people/team");
}
