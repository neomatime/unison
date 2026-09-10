import "server-only";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";

export async function listDeliveryItemPhaseHistory(itemId: string) {
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const { data, error } = await db
    .from("delivery_item_phase_history")
    .select("id,from_phase_id,to_phase_id,changed_at")
    .eq("organization_id", organization.id)
    .eq("delivery_item_id", itemId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  const phaseIds = [
    ...new Set(
      (data ?? [])
        .flatMap((r: any) => [r.from_phase_id, r.to_phase_id])
        .filter(Boolean),
    ),
  ];
  const phases = phaseIds.length
    ? await db
        .from("framework_phases")
        .select("id,name")
        .eq("organization_id", organization.id)
        .in("id", phaseIds)
    : { data: [], error: null };
  if (phases.error) throw phases.error;
  const names = new Map((phases.data ?? []).map((p: any) => [p.id, p.name]));
  return (data ?? []).map((r: any) => ({
    id: r.id,
    from: r.from_phase_id
      ? (names.get(r.from_phase_id) ?? "Removed phase")
      : "Not set",
    to: r.to_phase_id
      ? (names.get(r.to_phase_id) ?? "Removed phase")
      : "Not set",
    changedAt: r.changed_at,
  }));
}
