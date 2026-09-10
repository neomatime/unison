"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const nullable = (f: FormData, k: string) => text(f, k) || null;
export async function savePortfolioAction(
  id: string | undefined,
  _previous: { error?: string } | undefined,
  form: FormData,
) {
  const name = text(form, "name"),
    code = text(form, "code");
  if (!name || !code) return { error: "Portfolio name and code are required." };
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const values = {
    organization_id: organization.id,
    name,
    code,
    description: nullable(form, "description"),
    business_unit: nullable(form, "businessUnit"),
    strategic_objective: nullable(form, "objective"),
    status: text(form, "status") || "Planning",
    start_date: nullable(form, "startDate"),
    target_end_date: nullable(form, "targetEndDate"),
  };
  const result =
    id && isUuid(id)
      ? await db
          .from("portfolios")
          .update(values)
          .eq("id", id)
          .eq("organization_id", organization.id)
          .select("id")
          .single()
      : await db.from("portfolios").insert(values).select("id").single();
  if (result.error)
    return {
      error:
        result.error.code === "23505"
          ? "That portfolio code is already in use."
          : "The portfolio could not be saved.",
    };
  revalidatePath("/delivery/portfolio");
  redirect(`/delivery/portfolio/${result.data.id}`);
}
export async function saveProgrammeAction(
  portfolioId: string,
  id: string | undefined,
  _previous: { error?: string } | undefined,
  form: FormData,
) {
  const name = text(form, "name"),
    code = text(form, "code");
  if (!isUuid(portfolioId) || !name || !code)
    return { error: "Programme name and code are required." };
  const { organization } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const values = {
    organization_id: organization.id,
    portfolio_id: portfolioId,
    name,
    code,
    description: nullable(form, "description"),
    status: text(form, "status") || "Planning",
    health: text(form, "health") || "Healthy",
    start_date: nullable(form, "startDate"),
    target_end_date: nullable(form, "targetEndDate"),
  };
  const result =
    id && isUuid(id)
      ? await db
          .from("programmes")
          .update(values)
          .eq("id", id)
          .eq("portfolio_id", portfolioId)
          .eq("organization_id", organization.id)
          .select("id")
          .single()
      : await db.from("programmes").insert(values).select("id").single();
  if (result.error)
    return {
      error:
        result.error.code === "23505"
          ? "That programme code is already in use."
          : "The programme could not be saved.",
    };
  revalidatePath(`/delivery/portfolio/${portfolioId}`);
  redirect(`/delivery/portfolio/${portfolioId}/programmes/${result.data.id}`);
}

export async function assignPortfolioProjectAction(
  portfolioId: string,
  _previous: { error?: string; success?: string } | undefined,
  form: FormData,
) {
  const projectId = text(form, "projectId"),
    programmeId = nullable(form, "programmeId");
  if (
    !isUuid(portfolioId) ||
    !isUuid(projectId) ||
    (programmeId && !isUuid(programmeId))
  )
    return { error: "Choose a valid project and programme." };
  const { organization } = await getSessionContext();
  const supabase = await createServerSupabase();
  const db = supabase as any;
  const { data, error } = await db
    .from("projects")
    .update({ portfolio_id: portfolioId, programme_id: programmeId })
    .eq("id", projectId)
    .eq("organization_id", organization.id)
    .select("id");
  if (error || !data?.length)
    return { error: "The project could not be assigned." };
  revalidatePath(`/delivery/portfolio/${portfolioId}`);
  return { success: "Project assignment updated." };
}
