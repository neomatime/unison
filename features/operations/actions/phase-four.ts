"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import type { PhaseFourKind } from "../queries/phase-four";

export type PhaseFourActionState = { error?: string } | undefined;

const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || null;
const identifier = (form: FormData, key: string) => {
  const value = optional(form, key);
  return value && isUuid(value) ? value : null;
};
const integer = (form: FormData, key: string, fallback = 0) => {
  const parsed = Number.parseInt(text(form, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const decimal = (form: FormData, key: string) => {
  const value = optional(form, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const dateTime = (form: FormData, key: string) => {
  const value = optional(form, key);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const routes: Record<PhaseFourKind, string> = {
  "team-member": "/people/team",
  assignment: "/people/team/assignments",
  onboarding: "/operations/onboarding",
  vendor: "/delivery/vendors",
  task: "/operations/tasks",
  "calendar-event": "/operations/calendar",
};

export async function savePhaseFourRecordAction(
  kind: PhaseFourKind,
  id: string | undefined,
  _previous: PhaseFourActionState,
  form: FormData,
): Promise<PhaseFourActionState> {
  const { organization, user } = await getSessionContext();
  const db = (await createServerSupabase()) as any;

  let table: string;
  let values: Record<string, unknown>;

  if (kind === "team-member") {
    const fullName = text(form, "fullName");
    const email = text(form, "email").toLowerCase();
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) {
      return { error: "A member name and valid work email are required." };
    }
    table = "team_members";
    values = {
      organization_id: organization.id,
      full_name: fullName,
      email,
      job_title: optional(form, "jobTitle"),
      delivery_role: optional(form, "deliveryRole"),
      department: optional(form, "department"),
      team_name: optional(form, "teamName"),
      manager_id: identifier(form, "managerId"),
      capacity_percent: Math.min(150, Math.max(0, integer(form, "capacityPercent"))),
      availability: text(form, "availability") || "Available",
      availability_note: optional(form, "availabilityNote"),
      status: text(form, "status") || "Active",
      access_role: text(form, "accessRole") || "Member",
      joined_on: optional(form, "joinedOn"),
    };
  } else if (kind === "assignment") {
    const projectId = identifier(form, "projectId");
    const teamMemberId = identifier(form, "teamMemberId");
    const role = text(form, "deliveryRole");
    const startDate = text(form, "startDate");
    if (!projectId || !teamMemberId || !role || !startDate) {
      return { error: "Member, project, delivery role and start date are required." };
    }
    table = "project_assignments";
    values = {
      organization_id: organization.id,
      project_id: projectId,
      team_member_id: teamMemberId,
      delivery_role: role,
      allocation_percent: Math.min(150, Math.max(0, integer(form, "allocationPercent"))),
      start_date: startDate,
      end_date: optional(form, "endDate"),
      status: text(form, "status") || "Planned",
      notes: optional(form, "notes"),
    };
  } else if (kind === "onboarding") {
    const clientId = identifier(form, "clientId");
    let clientName = text(form, "clientName");
    if (clientId) {
      const client = await db.from("clients").select("name").eq("id", clientId).eq("organization_id", organization.id).maybeSingle();
      if (client.error) return { error: "The selected client could not be verified." };
      clientName = client.data?.name ?? clientName;
    }
    if (!clientName) return { error: "Select a client or enter a client name." };
    table = "client_onboardings";
    values = {
      organization_id: organization.id,
      client_id: clientId,
      client_name: clientName,
      owner_id: identifier(form, "ownerId"),
      onboarding_type: text(form, "onboardingType") || "Standard Client",
      stage: text(form, "stage") || "Welcome",
      progress_percent: Math.min(100, Math.max(0, integer(form, "progressPercent"))),
      health: text(form, "health") || "On Track",
      priority: text(form, "priority") || "Normal",
      start_date: optional(form, "startDate"),
      target_go_live: optional(form, "targetGoLive"),
      required_documents: Math.max(0, integer(form, "requiredDocuments")),
      notes: optional(form, "notes"),
      status: text(form, "status") || "Active",
    };
  } else if (kind === "vendor") {
    const name = text(form, "name");
    if (!name) return { error: "Vendor name is required." };
    table = "vendors";
    values = {
      organization_id: organization.id,
      name,
      vendor_type: text(form, "vendorType") || "Other",
      service_category: optional(form, "serviceCategory"),
      region: optional(form, "region"),
      owner_id: identifier(form, "ownerId"),
      primary_contact: optional(form, "primaryContact"),
      contact_email: optional(form, "contactEmail"),
      phone: optional(form, "phone"),
      contract_start: optional(form, "contractStart"),
      contract_end: optional(form, "contractEnd"),
      contract_value: decimal(form, "contractValue"),
      renewal_notice_days: integer(form, "renewalNoticeDays", 30),
      sla_percent: decimal(form, "slaPercent"),
      data_sensitivity: text(form, "dataSensitivity") || "Low",
      risk_level: text(form, "riskLevel") || "Low",
      compliance_status: text(form, "complianceStatus") || "Not assessed",
      status: text(form, "status") || "Active",
      notes: optional(form, "notes"),
    };
  } else if (kind === "task") {
    const title = text(form, "title");
    if (!title) return { error: "Task title is required." };
    const status = text(form, "status") || "Planned";
    table = "tasks";
    values = {
      organization_id: organization.id,
      title,
      description: optional(form, "description"),
      project_id: identifier(form, "projectId"),
      client_id: identifier(form, "clientId"),
      onboarding_id: identifier(form, "onboardingId"),
      assignee_id: identifier(form, "assigneeId"),
      created_by: user.id,
      priority: text(form, "priority") || "Medium",
      status,
      due_at: dateTime(form, "dueAt"),
      completed_at: status === "Complete" ? new Date().toISOString() : null,
    };
  } else {
    const title = text(form, "title");
    const startAt = dateTime(form, "startAt");
    const endAt = dateTime(form, "endAt");
    if (!title || !startAt || !endAt) {
      return { error: "Event title, start and end are required." };
    }
    table = "calendar_events";
    values = {
      organization_id: organization.id,
      title,
      description: optional(form, "description"),
      event_type: text(form, "eventType") || "Internal",
      start_at: startAt,
      end_at: endAt,
      all_day: form.get("allDay") === "on",
      location: optional(form, "location"),
      owner_id: identifier(form, "ownerId"),
      project_id: identifier(form, "projectId"),
      client_id: identifier(form, "clientId"),
      onboarding_id: identifier(form, "onboardingId"),
      created_by: user.id,
      status: text(form, "status") || "Confirmed",
    };
  }

  const result = id && isUuid(id)
    ? await db.from(table).update(values).eq("id", id).eq("organization_id", organization.id).select("id").maybeSingle()
    : await db.from(table).insert(values).select("id").single();

  if (result.error || !result.data) {
    return {
      error: result.error?.code === "23505"
        ? "A record with that unique name or email already exists."
        : "The record could not be saved. Check the dates and required fields.",
    };
  }

  const base = routes[kind];
  revalidatePath(base);
  revalidatePath("/people/team");
  redirect(`${base}/${result.data.id}`);
}
