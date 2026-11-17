import "server-only";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { cleanSearch, type Person } from "@/features/calendar/attendees";
import { isUuid } from "@/lib/utils";
import { listDirectoryPeople } from "@/lib/integrations/microsoft-directory";

export type PhaseFourKind =
  | "team-member"
  | "assignment"
  | "onboarding"
  | "vendor"
  | "task"
  | "calendar-event";

export type SelectOption = { id: string; label: string };
export type PhaseFourRecord = Record<string, unknown> & {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  archivedAt: string | null;
};

const memberName = (value: unknown) => {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "full_name" in relation
    ? String(relation.full_name)
    : "Unassigned";
};

const relatedName = (value: unknown, fallback = "—") => {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "name" in relation
    ? String(relation.name)
    : fallback;
};

async function context() {
  const { organization } = await getSessionContext();
  return {
    organization,
    db: (await createServerSupabase()) as any,
  };
}

export type TeamListing = { members: PhaseFourRecord[]; source: "directory" | "sign-ins"; notice: string | null };

/**
 * The Team page lists the people in the organisation's Microsoft 365 directory (HIMARK work accounts), whether or not they have
 * signed in to UNISON. A person in the directory with no profile yet gets one here. If the directory cannot be read (the
 * User.Read.All permission is not granted), it falls back to the people who have signed in with Microsoft and says so.
 * Profiles added by hand stay in the table but are not listed unless they are in the directory.
 */
export async function listMicrosoftTeamMembers(): Promise<TeamListing> {
  const { organization, db } = await context();
  const org = await db.from("organizations").select("email_domain").eq("id", organization.id).maybeSingle();
  const directory = await listDirectoryPeople(org.data?.email_domain);
  if (directory.ok) {
    const emails = new Set(directory.people.map((person) => person.email));
    const existing = await db.from("team_members").select("email").eq("organization_id", organization.id);
    const have = new Set(((existing.data ?? []) as { email: string }[]).map((row) => String(row.email).toLowerCase()));
    const missing = directory.people.filter((person) => !have.has(person.email));
    if (missing.length) {
      const added = await db.from("team_members").insert(
        missing.map((person) => ({ organization_id: organization.id, full_name: person.name, email: person.email, job_title: person.jobTitle, department: person.department, status: "Active" })),
      );
      if (added.error) console.error("Team: could not add directory people", added.error.message);
    }
    const all = await listTeamMembers();
    return { members: all.filter((row) => emails.has(String(row.email ?? "").toLowerCase())), source: "directory", notice: null };
  }
  const ids = await db.rpc("team_microsoft_user_ids", { p_organization_id: organization.id });
  if (ids.error) throw ids.error;
  const userIds = (ids.data ?? []) as string[];
  const notice = directory.reason === "permission"
    ? "Showing people who have signed in with Microsoft. To list everyone in the HIMARK directory, an administrator must grant UNISON the User.Read.All permission."
    : "Showing people who have signed in with Microsoft. The Microsoft directory could not be read just now.";
  return { members: userIds.length ? await listTeamMembers(userIds) : [], source: "sign-ins", notice };
}

export async function listTeamMembers(onlyUserIds?: string[]): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  let query = db
    .from("team_members")
    .select("*,project_assignments(count)")
    .eq("organization_id", organization.id);
  if (onlyUserIds) query = query.in("user_id", onlyUserIds);
  const { data, error } = await query.order("full_name");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.full_name,
    email: row.email,
    jobTitle: row.job_title,
    deliveryRole: row.delivery_role,
    department: row.department,
    teamName: row.team_name,
    managerId: row.manager_id,
    capacityPercent: row.capacity_percent,
    availability: row.availability,
    availabilityNote: row.availability_note,
    accessRole: row.access_role,
    joinedOn: row.joined_on,
    assignmentCount: row.project_assignments?.[0]?.count ?? 0,
    status: row.status,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export async function listProjectAssignments(): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  const { data, error } = await db
    .from("project_assignments")
    .select("*,projects(name),team_members(full_name,team_name)")
    .eq("organization_id", organization.id)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: `${memberName(row.team_members)} · ${relatedName(row.projects)}`,
    teamMemberId: row.team_member_id,
    member: memberName(row.team_members),
    projectId: row.project_id,
    project: relatedName(row.projects),
    teamName: Array.isArray(row.team_members)
      ? row.team_members[0]?.team_name
      : row.team_members?.team_name,
    deliveryRole: row.delivery_role,
    allocationPercent: row.allocation_percent,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    status: row.status,
    archivedAt: null,
    updatedAt: row.updated_at,
  }));
}

export async function listClientOnboardings(): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  const { data, error } = await db
    .from("client_onboardings")
    .select("*,team_members(full_name),tasks(count)")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.client_name,
    clientId: row.client_id,
    clientName: row.client_name,
    ownerId: row.owner_id,
    owner: memberName(row.team_members),
    onboardingType: row.onboarding_type,
    stage: row.stage,
    progressPercent: row.progress_percent,
    health: row.health,
    priority: row.priority,
    startDate: row.start_date,
    targetGoLive: row.target_go_live,
    requiredDocuments: row.required_documents,
    taskCount: row.tasks?.[0]?.count ?? 0,
    notes: row.notes,
    status: row.status,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export async function listVendors(): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  const { data, error } = await db
    .from("vendors")
    .select("*,team_members(full_name)")
    .eq("organization_id", organization.id)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    vendorType: row.vendor_type,
    serviceCategory: row.service_category,
    region: row.region,
    ownerId: row.owner_id,
    owner: memberName(row.team_members),
    primaryContact: row.primary_contact,
    contactEmail: row.contact_email,
    phone: row.phone,
    contractStart: row.contract_start,
    contractEnd: row.contract_end,
    contractValue: row.contract_value,
    renewalNoticeDays: row.renewal_notice_days,
    slaPercent: row.sla_percent,
    dataSensitivity: row.data_sensitivity,
    riskLevel: row.risk_level,
    complianceStatus: row.compliance_status,
    notes: row.notes,
    status: row.status,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export async function listTasks(): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  const { data, error } = await db
    .from("tasks")
    .select("*,projects(name),clients(name),team_members(full_name),client_onboardings(client_name)")
    .eq("organization_id", organization.id)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.title,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    project: relatedName(row.projects),
    clientId: row.client_id,
    client: relatedName(row.clients),
    onboardingId: row.onboarding_id,
    onboarding: Array.isArray(row.client_onboardings)
      ? row.client_onboardings[0]?.client_name
      : row.client_onboardings?.client_name,
    assigneeId: row.assignee_id,
    assignee: memberName(row.team_members),
    priority: row.priority,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    status: row.status,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export async function listCalendarEvents(): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  const { data, error } = await db
    .from("calendar_events")
    .select("*,projects(name),clients(name),team_members(full_name),client_onboardings(client_name)")
    .eq("organization_id", organization.id)
    .order("start_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.title,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    location: row.location,
    ownerId: row.owner_id,
    owner: memberName(row.team_members),
    projectId: row.project_id,
    project: relatedName(row.projects),
    clientId: row.client_id,
    client: relatedName(row.clients),
    onboardingId: row.onboarding_id,
    onboarding: Array.isArray(row.client_onboardings)
      ? row.client_onboardings[0]?.client_name
      : row.client_onboardings?.client_name,
    agenda: Array.isArray(row.agenda) ? row.agenda : [],
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    reminderMinutes: row.reminder_minutes ?? null,
    teamsJoinUrl: row.teams_join_url ?? null,
    teamsEventId: row.teams_event_id ?? null,
    status: row.status,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

const loaders: Record<PhaseFourKind, () => Promise<PhaseFourRecord[]>> = {
  "team-member": listTeamMembers,
  assignment: listProjectAssignments,
  onboarding: listClientOnboardings,
  vendor: listVendors,
  task: listTasks,
  "calendar-event": listCalendarEvents,
};

export async function getPhaseFourRecord(kind: PhaseFourKind, id: string) {
  if (!isUuid(id)) return null;
  return (await loaders[kind]()).find((record) => record.id === id) ?? null;
}

export async function getPhaseFourOptions() {
  const { organization, db } = await context();
  const [members, projects, clients, onboardings] = await Promise.all([
    db.from("team_members").select("id,full_name").eq("organization_id", organization.id).eq("status", "Active").is("archived_at", null).order("full_name"),
    db.from("projects").select("id,name").eq("organization_id", organization.id).is("archived_at", null).order("name"),
    db.from("clients").select("id,name").eq("organization_id", organization.id).is("archived_at", null).order("name"),
    db.from("client_onboardings").select("id,client_name").eq("organization_id", organization.id).is("archived_at", null).order("client_name"),
  ]);
  for (const result of [members, projects, clients, onboardings]) {
    if (result.error) throw result.error;
  }
  return {
    members: (members.data ?? []).map((row: any) => ({ id: row.id, label: row.full_name })),
    projects: (projects.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    clients: (clients.data ?? []).map((row: any) => ({ id: row.id, label: row.name })),
    onboardings: (onboardings.data ?? []).map((row: any) => ({ id: row.id, label: row.client_name })),
  } satisfies Record<string, SelectOption[]>;
}

/** People an event can invite, found by what was typed: active team members and the contacts of clients and leads that have an email,
 *  matched on name, email or the client's name. At most `limit` come back, so the list stays short however many clients there are.
 *  The search text is cleaned first (cleanSearch), so it can only match as plain text. */
export async function searchInvitablePeople(query: string, limit = 8): Promise<Person[]> {
  const text = cleanSearch(query);
  if (!text) return [];
  const { organization, db } = await context();
  const like = `%${text}%`;
  const members = db.from("team_members").select("full_name,email").eq("organization_id", organization.id).eq("status", "Active").is("archived_at", null)
    .or(`full_name.ilike.${like},email.ilike.${like}`).order("full_name").limit(limit);
  const byPerson = db.from("contacts").select("full_name,email,clients(name),leads(company_name)").eq("organization_id", organization.id).is("archived_at", null).not("email", "is", null)
    .or(`full_name.ilike.${like},email.ilike.${like}`).order("full_name").limit(limit);
  // A client's name finds its contacts: first the clients, then the contacts that belong to them.
  const clientMatches = await db.from("clients").select("id").eq("organization_id", organization.id).is("archived_at", null).ilike("name", like).limit(10);
  const clientIds = (clientMatches.data ?? []).map((row: any) => row.id);
  const byClient = clientIds.length
    ? db.from("contacts").select("full_name,email,clients(name),leads(company_name)").eq("organization_id", organization.id).is("archived_at", null).not("email", "is", null).in("client_id", clientIds).order("full_name").limit(limit)
    : Promise.resolve({ data: [], error: null });
  const [memberRows, personRows, clientRows] = await Promise.all([members, byPerson, byClient]);
  if (memberRows.error) throw memberRows.error;
  // A contact search that fails must not stop team members being found: people can still be typed in by email.
  const one = (value: any) => (Array.isArray(value) ? value[0] : value);
  const found: Person[] = [
    ...(memberRows.data ?? []).map((row: any) => ({ name: row.full_name, email: row.email, group: "Team" })),
    ...[...(personRows.error ? [] : personRows.data ?? []), ...(clientRows.error ? [] : clientRows.data ?? [])].map((row: any) => ({ name: row.full_name, email: row.email, group: one(row.clients)?.name ?? one(row.leads)?.company_name ?? "Contact" })),
  ].filter((person: Person) => person.email);
  const seen = new Set<string>();
  return found.filter((person) => (seen.has(person.email.toLowerCase()) ? false : (seen.add(person.email.toLowerCase()), true))).slice(0, limit);
}

/** The active team member that is the signed-in person: the one linked to their user, or else the one with their email address.
 *  Null when there is none, and the event's owner is then left unassigned. */
export async function getCurrentTeamMemberId(): Promise<string | null> {
  const { organization, user } = await getSessionContext();
  const db = (await createServerSupabase()) as any;
  const active = () => db.from("team_members").select("id").eq("organization_id", organization.id).eq("status", "Active").is("archived_at", null);
  const byUser = await active().eq("user_id", user.id).limit(1);
  if (!byUser.error && byUser.data?.[0]?.id) return byUser.data[0].id;
  const email = String(user.email ?? "").trim();
  if (!email) return null;
  const byEmail = await active().ilike("email", email.replace(/[\\%_]/g, (character) => `\\${character}`)).limit(1);
  return !byEmail.error && byEmail.data?.[0]?.id ? byEmail.data[0].id : null;
}
