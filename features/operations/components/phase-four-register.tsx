import Link from "next/link";

import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { MetricCard } from "@/features/delivery/components/delivery-primitives";
import { RecordCollectionWorkspace, type CollectionRecord } from "@/features/product-ui/components/record-collection-workspace";
import {
  listCalendarEvents,
  listClientOnboardings,
  listProjectAssignments,
  listTasks,
  listTeamMembers,
  listVendors,
  type PhaseFourKind,
  type PhaseFourRecord,
} from "../queries/phase-four";

const text = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("en-ZA") : "—";

const loaders: Record<Exclude<PhaseFourKind, "team-member" | "assignment">, () => Promise<PhaseFourRecord[]>> = {
  onboarding: listClientOnboardings,
  vendor: listVendors,
  task: listTasks,
  "calendar-event": listCalendarEvents,
};

export async function PersistentTeamScreen({ initialTab }: { initialTab?: string }) {
  const [members, assignments] = await Promise.all([listTeamMembers(), listProjectAssignments()]);
  const assignmentView = initialTab === "assignments";
  const active = members.filter((member) => member.status === "Active" && !member.archivedAt);
  const records: CollectionRecord[] = assignmentView
    ? assignments.map((row) => ({
        id: row.id, name: row.name, context: text(row.deliveryRole), owner: text(row.member),
        project: text(row.project), allocation: `${text(row.allocationPercent, "0")}%`,
        start: date(row.startDate), end: date(row.endDate), status: row.status, updated: date(row.updatedAt),
      }))
    : members.map((row) => ({
        id: row.id, name: row.name, context: text(row.jobTitle), owner: text(row.deliveryRole),
        department: text(row.department), team: text(row.teamName), projects: text(row.assignmentCount, "0"),
        capacity: `${text(row.capacityPercent, "0")}%`, availability: text(row.availability), status: row.status,
        updated: date(row.updatedAt), archived: Boolean(row.archivedAt),
      }));
  return <>
    <WorkspaceHeader category="People" title="Team" description="Persistent people, capacity and project accountability for the active organization." action={assignmentView ? "New Assignment" : "New Team Member"} actionHref={assignmentView ? "/people/team/assignments/new" : "/people/team/new"} />
    <nav className="mb-5 flex gap-1 border-b border-border">
      <Link href="/people/team" className={`border-b-2 px-4 py-3 text-sm font-semibold ${assignmentView ? "border-transparent text-muted-foreground" : "border-brand text-brand"}`}>Directory</Link>
      <Link href="/people/team?tab=assignments" className={`border-b-2 px-4 py-3 text-sm font-semibold ${assignmentView ? "border-brand text-brand" : "border-transparent text-muted-foreground"}`}>Project Assignments</Link>
    </nav>
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="Active members" value={String(active.length)} detail="Available for accountable delivery" />
      <MetricCard label="Active assignments" value={String(assignments.filter((item) => item.status === "Active").length)} detail="Persistent project commitments" />
      <MetricCard label="Capacity allocated" value={`${active.length ? Math.round(active.reduce((sum, item) => sum + Number(item.capacityPercent ?? 0), 0) / active.length) : 0}%`} detail="Average member allocation" />
    </div>
    <div className="mt-5"><RecordCollectionWorkspace config={{
      title: assignmentView ? "Project Assignment Register" : "Team Directory",
      singular: assignmentView ? "Assignment" : "Team Member",
      description: assignmentView ? "Project roles, dates and allocation commitments." : "People, delivery roles, capacity and availability.",
      primaryAction: assignmentView ? "New Assignment" : "New Team Member",
      records,
      recordHrefBase: assignmentView ? "/people/team/assignments" : "/people/team",
      columns: assignmentView
        ? [{ id: "name", label: "Assignment" }, { id: "project", label: "Project" }, { id: "owner", label: "Member" }, { id: "allocation", label: "Allocation" }, { id: "start", label: "Start" }, { id: "end", label: "End" }, { id: "status", label: "Status" }]
        : [{ id: "name", label: "Member" }, { id: "owner", label: "Delivery Role" }, { id: "department", label: "Department" }, { id: "team", label: "Team" }, { id: "projects", label: "Projects" }, { id: "capacity", label: "Capacity" }, { id: "availability", label: "Availability" }, { id: "status", label: "Status" }],
      fields: [], contextualActions: [],
      emptyDescription: assignmentView ? "Create the first project assignment." : "Add the first team member to the organization directory.",
    }} /></div>
  </>;
}

export async function PhaseFourRegister({ kind }: { kind: Exclude<PhaseFourKind, "team-member" | "assignment"> }) {
  const rows = await loaders[kind]();
  const active = rows.filter((row) => !row.archivedAt);
  const config = registerConfig(kind, active);
  return <>
    <WorkspaceHeader category={config.category} title={config.heading} description={config.description} action={config.action} actionHref={`${config.base}/new`} />
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label={`Active ${config.plural.toLowerCase()}`} value={String(active.length)} detail="Persisted tenant records" />
      <MetricCard label="Needs attention" value={String(active.filter((row) => ["At Risk", "Blocked", "Critical", "Paused"].includes(String(row.status)) || row.health === "At Risk" || row.riskLevel === "Critical").length)} detail="Priority operational focus" />
      <MetricCard label="Updated records" value={String(active.filter((row) => row.updatedAt).length)} detail="Auditable current state" />
    </div>
    <div className="mt-5"><RecordCollectionWorkspace config={{
      title: `${config.singular} Register`, singular: config.singular, description: config.registerDescription,
      primaryAction: config.action, records: config.records, recordHrefBase: config.base,
      columns: config.columns, fields: [], contextualActions: [], emptyDescription: config.empty,
    }} /></div>
  </>;
}

function registerConfig(kind: Exclude<PhaseFourKind, "team-member" | "assignment">, rows: PhaseFourRecord[]) {
  if (kind === "onboarding") return {
    category: "Operations", heading: "Client Onboarding", plural: "Onboardings", singular: "Onboarding", action: "Start Onboarding", base: "/operations/onboarding",
    description: "Coordinate persistent client readiness, ownership and go-live delivery.", registerDescription: "Tenant-scoped onboarding journeys and current readiness.", empty: "Start the first client onboarding journey.",
    records: rows.map((row) => ({ id: row.id, name: row.name, context: text(row.onboardingType), owner: text(row.owner), stage: text(row.stage), progress: `${text(row.progressPercent, "0")}%`, tasks: text(row.taskCount, "0"), goLive: date(row.targetGoLive), status: text(row.health), updated: date(row.updatedAt) })),
    columns: [{ id: "name", label: "Client" }, { id: "owner", label: "Owner" }, { id: "stage", label: "Stage" }, { id: "progress", label: "Progress" }, { id: "tasks", label: "Tasks" }, { id: "goLive", label: "Go-Live" }, { id: "status", label: "Health" }],
  };
  if (kind === "vendor") return {
    category: "Delivery", heading: "Vendors", plural: "Vendors", singular: "Vendor", action: "New Vendor", base: "/delivery/vendors",
    description: "Track persistent third-party ownership, contracts, SLA and risk.", registerDescription: "Tenant-scoped vendor relationships and governance position.", empty: "Add the first vendor relationship.",
    records: rows.map((row) => ({ id: row.id, name: row.name, context: text(row.serviceCategory), type: text(row.vendorType), owner: text(row.owner), risk: text(row.riskLevel), sla: row.slaPercent == null ? "—" : `${row.slaPercent}%`, contractEnd: date(row.contractEnd), compliance: text(row.complianceStatus), status: row.status, updated: date(row.updatedAt) })),
    columns: [{ id: "name", label: "Vendor" }, { id: "type", label: "Type" }, { id: "owner", label: "Owner" }, { id: "risk", label: "Risk" }, { id: "sla", label: "SLA" }, { id: "contractEnd", label: "Contract End" }, { id: "compliance", label: "Compliance" }, { id: "status", label: "Status" }],
  };
  if (kind === "task") return {
    category: "Operations", heading: "Tasks", plural: "Tasks", singular: "Task", action: "New Task", base: "/operations/tasks",
    description: "Manage persistent operational work, ownership, dates and linked records.", registerDescription: "Tenant-scoped tasks across projects, clients and onboarding.", empty: "Create the first operational task.",
    records: rows.map((row) => ({ id: row.id, name: row.name, context: text(row.description), owner: text(row.assignee), project: text(row.project), client: text(row.client), priority: text(row.priority), due: row.dueAt ? new Date(String(row.dueAt)).toLocaleString("en-ZA") : "—", status: row.status, updated: date(row.updatedAt) })),
    columns: [{ id: "name", label: "Task" }, { id: "owner", label: "Assignee" }, { id: "project", label: "Project" }, { id: "client", label: "Client" }, { id: "priority", label: "Priority" }, { id: "due", label: "Due" }, { id: "status", label: "Status" }],
  };
  return {
    category: "Operations", heading: "Calendar", plural: "Events", singular: "Event", action: "New Event", base: "/operations/calendar",
    description: "Coordinate persistent delivery, client and governance events.", registerDescription: "Tenant-scoped meetings, milestones and operational dates.", empty: "Schedule the first calendar event.",
    records: rows.map((row) => ({ id: row.id, name: row.name, context: text(row.eventType), owner: text(row.owner), date: row.startAt ? new Date(String(row.startAt)).toLocaleDateString("en-ZA") : "—", time: row.startAt ? new Date(String(row.startAt)).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—", location: text(row.location), project: text(row.project), status: row.status, updated: date(row.updatedAt) })),
    columns: [{ id: "name", label: "Event" }, { id: "date", label: "Date" }, { id: "time", label: "Time" }, { id: "owner", label: "Owner" }, { id: "location", label: "Location" }, { id: "project", label: "Project" }, { id: "status", label: "Status" }],
  };
}
