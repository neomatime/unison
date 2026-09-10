import "server-only";

import { getSessionContext } from "@/lib/auth/get-session-context";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

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

export async function listTeamMembers(): Promise<PhaseFourRecord[]> {
  const { organization, db } = await context();
  const { data, error } = await db
    .from("team_members")
    .select("*,project_assignments(count)")
    .eq("organization_id", organization.id)
    .order("full_name");
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
