"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseAttendees } from "@/features/calendar/attendees";
import { invitationHtml, parseAgenda } from "@/features/calendar/description";
import { parseReminder } from "@/features/calendar/reminders";
import { localInputToIso, teamsLink } from "@/features/calendar/model";
import { createTeamsMeeting, deleteTeamsMeeting, TeamsGraphError, TeamsNotConnectedError, updateTeamsMeeting } from "@/lib/integrations/microsoft-teams";
import { TEAMS_FAILURE_MESSAGES, withJoinLink } from "@/lib/integrations/teams-meeting";
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
  // A Teams meeting created for this save; removed again if the event itself cannot be saved.
  let createdTeamsEventId: string | null = null;

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
    // The form's clock is Africa/Johannesburg, whatever the server's is.
    const startAt = localInputToIso(optional(form, "startAt"));
    const endAt = localInputToIso(optional(form, "endAt"));
    if (!title || !startAt || !endAt) {
      return { error: "Event title, start and end are required." };
    }
    if (endAt < startAt) return { error: "The event cannot end before it starts." };
    let location = optional(form, "location");
    let description = optional(form, "description");
    const agenda = parseAgenda(form.get("agenda"));
    const attendees = parseAttendees(form.get("attendees"));
    const bodyHtml = invitationHtml(description, agenda);
    const teams: Record<string, unknown> = {};
    const online = form.get("onlineMeeting") === "on";
    const existing = id && isUuid(id)
      ? (await db.from("calendar_events").select("teams_join_url,teams_event_id").eq("id", id).eq("organization_id", organization.id).maybeSingle()).data
      : null;
    if (online) {
      // The link is the location, so the form sends no location text while Online meeting is on.
      const pasted = teamsLink(optional(form, "pastedLink"));
      if (existing?.teams_join_url) {
        // Already has a meeting: keep it and keep its title and time in step.
        location = existing.teams_join_url;
        if (existing.teams_event_id) {
          try { await updateTeamsMeeting(existing.teams_event_id, { subject: title, startIso: startAt, endIso: endAt, bodyHtml, attendees }); } catch (error) { console.error("Teams meeting update failed", error); }
        }
      } else if (pasted) {
        // A Teams link that was typed into the location by hand: keep it, there is nothing to create.
        location = pasted;
      } else {
        try {
          const meeting = await createTeamsMeeting({ subject: title, startIso: startAt, endIso: endAt, bodyHtml, attendees });
          createdTeamsEventId = meeting.eventId;
          teams.teams_join_url = meeting.joinUrl;
          teams.teams_event_id = meeting.eventId;
          location = meeting.joinUrl;
          description = withJoinLink(description, meeting.joinUrl);
        } catch (error) {
          if (error instanceof TeamsNotConnectedError) return { error: "Microsoft Teams is not connected, so an online meeting cannot be created. Turn off Online meeting, or ask an administrator to connect Teams." };
          console.error("Teams meeting creation failed", error);
          return { error: TEAMS_FAILURE_MESSAGES[error instanceof TeamsGraphError ? error.reason : "other"] };
        }
      }
    } else if (existing?.teams_join_url) {
      // Online meeting was turned off: the event goes back to a plain location and the Teams meeting is removed.
      teams.teams_join_url = null;
      teams.teams_event_id = null;
      if (existing.teams_event_id) await deleteTeamsMeeting(existing.teams_event_id).catch((error) => console.error("Teams meeting removal failed", error));
    }
    table = "calendar_events";
    values = {
      organization_id: organization.id,
      title,
      description,
      event_type: text(form, "eventType") || "Internal",
      start_at: startAt,
      end_at: endAt,
      all_day: form.get("allDay") === "on",
      location,
      owner_id: identifier(form, "ownerId"),
      // The form no longer has a project field, so an event keeps whatever project it already has.
      client_id: identifier(form, "clientId"),
      // The form has no onboarding field, so an event keeps the onboarding it already has.
      created_by: user.id,
      status: text(form, "status") || "Confirmed",
      ...teams,
      // Written only when there is an agenda, or there was one to clear, so an event without one saves as it always did.
      reminder_minutes: parseReminder(form.get("reminderMinutes")),
      ...(agenda.length || integer(form, "agendaWas") > 0 ? { agenda } : {}),
      ...(attendees.length || integer(form, "attendeesWas") > 0 ? { attendees } : {}),
    };
  }

  const result = id && isUuid(id)
    ? await db.from(table).update(values).eq("id", id).eq("organization_id", organization.id).select("id").maybeSingle()
    : await db.from(table).insert(values).select("id").single();

  if (result.error || !result.data) {
    if (createdTeamsEventId) await deleteTeamsMeeting(createdTeamsEventId).catch((error) => console.error("Teams meeting cleanup failed", error));
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
