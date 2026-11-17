
import Link from "next/link";

import { CALENDAR_TIMEZONE } from "@/features/calendar/model";
import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { MetricCard } from "@/features/delivery/components/delivery-primitives";
import { RecordCollectionWorkspace, type CollectionRecord } from "@/features/product-ui/components/record-collection-workspace";
import { OnboardingBoard } from "./onboarding-board";
import { isOnboardingStage, type BoardCard } from "../onboarding-board";
import {
  listCalendarEvents,
  listClientOnboardings,
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

const portableCollectionByKind = {
  onboarding: "client-onboardings",
  vendor: "vendors",
  task: "tasks",
  "calendar-event": "calendar-events",
} as const;

export async function PersistentTeamScreen() {
  const members = await listTeamMembers();
  const active = members.filter((member) => member.status === "Active" && !member.archivedAt);
  const records: CollectionRecord[] = members.map((row) => ({
        id: row.id, name: row.name, context: text(row.jobTitle), owner: text(row.deliveryRole),
        department: text(row.department), team: text(row.teamName), projects: text(row.assignmentCount, "0"),
        capacity: `${text(row.capacityPercent, "0")}%`, availability: text(row.availability), status: row.status,
        updated: date(row.updatedAt), archived: Boolean(row.archivedAt),
      }));
  return <>
    <WorkspaceHeader category="People" title="Team" description="Persistent people, capacity and project accountability for the active organization." action="New Team Member" actionHref="/people/team/new" />
    <div className="grid gap-3 sm:grid-cols-2">
      <MetricCard label="Active members" value={String(active.length)} detail="Available for accountable delivery" />
      <MetricCard label="Capacity allocated" value={`${active.length ? Math.round(active.reduce((sum, item) => sum + Number(item.capacityPercent ?? 0), 0) / active.length) : 0}%`} detail="Average member allocation" />
    </div>
    <div className="mt-5"><RecordCollectionWorkspace config={{
      title: "Team Directory",
      singular: "Team Member",
      description: "People, delivery roles, capacity and availability.",
      primaryAction: "New Team Member",
      records,
      recordHrefBase: "/people/team",
      columns: [{ id: "name", label: "Member" }, { id: "owner", label: "Delivery Role" }, { id: "department", label: "Department" }, { id: "capacity", label: "Capacity" }, { id: "availability", label: "Availability" }, { id: "status", label: "Status" }],
      fields: [], contextualActions: [],
      allowImport: true,
      portableCollection: "team-members",
      emptyDescription: "Add the first team member to the organization directory.",
    }} /></div>
  </>;
}

export async function PhaseFourRegister({ kind, slim, hideHeader, rows: given, view = "list" }: { /** Onboarding only: the list register or the stage board. */ view?: "list" | "board"; kind: Exclude<PhaseFourKind, "team-member" | "assignment">; /** Two summary cards instead of three: the "Updated records" count is dropped. */ slim?: boolean; /** The page already shows the heading (the calendar page does). */ hideHeader?: boolean; /** Rows the page has already loaded, so they are not fetched twice. */ rows?: PhaseFourRecord[] }) {
  const rows = given ?? await loaders[kind]();
  const active = rows.filter((row) => !row.archivedAt);
  const config = registerConfig(kind, active);
  return <>
    {hideHeader ? null : <WorkspaceHeader category={config.category} title={config.heading} description={config.description} action={config.action} actionHref={`${config.base}/new`} hideActionOnPhone={active.length === 0} />}
    <div className={slim ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
      <MetricCard label={`Active ${config.plural.toLowerCase()}`} value={String(active.length)} detail="Persisted tenant records" />
      <MetricCard label="Needs attention" value={String(active.filter((row) => ["At Risk", "Blocked", "Critical", "Paused"].includes(String(row.status)) || row.health === "At Risk" || row.riskLevel === "Critical").length)} detail="Priority operational focus" />
      {slim ? null : <MetricCard label="Updated records" value={String(active.filter((row) => row.updatedAt).length)} detail="Auditable current state" />}
    </div>
    {kind === "onboarding" ? <ViewSwitch view={view} /> : null}
    {kind === "onboarding" && view === "board" ? <div className="mt-4"><OnboardingBoard cards={boardCards(active)} /></div> : <div className="mt-5"><RecordCollectionWorkspace config={{
      title: `${config.singular} Register`, singular: config.singular, description: config.registerDescription,
      primaryAction: config.action, records: config.records, recordHrefBase: config.base,
      columns: config.columns, fields: [], contextualActions: [], emptyDescription: config.empty,
      allowImport: true, portableCollection: portableCollectionByKind[kind],
    }} /></div>}
  </>;
}

/** List or Board, as links so the choice is in the address and survives a reload. */
function ViewSwitch({ view }: { view: "list" | "board" }) {
  const item = (name: "list" | "board", label: string) => (
    <Link
      href={name === "list" ? "/operations/onboarding" : "/operations/onboarding?view=board"}
      aria-current={view === name ? "page" : undefined}
      className={`px-4 py-2 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${view === name ? "bg-brand text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >{label}</Link>
  );
  return <nav aria-label="Onboarding view" className="mt-5 inline-flex border border-border bg-card">{item("list", "List")}{item("board", "Board")}</nav>;
}

/** The cards on the board: onboardings that are not archived, with the stage the database holds. */
function boardCards(rows: PhaseFourRecord[]): BoardCard[] {
  return rows.filter((row) => !row.archivedAt && isOnboardingStage(row.stage)).map((row) => ({
    id: row.id,
    client: text(row.name),
    type: text(row.onboardingType),
    owner: text(row.owner),
    stage: row.stage as BoardCard["stage"],
    progress: Number(row.progressPercent ?? 0),
    health: text(row.health, "On Track"),
    goLive: date(row.targetGoLive),
  }));
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
    records: rows.map((row) => ({ id: row.id, name: row.name, context: text(row.eventType), owner: text(row.owner), date: row.startAt ? new Date(String(row.startAt)).toLocaleDateString("en-ZA", { timeZone: CALENDAR_TIMEZONE }) : "—", time: row.startAt ? new Date(String(row.startAt)).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: CALENDAR_TIMEZONE }) : "—", location: text(row.location), status: row.status, updated: date(row.updatedAt) })),
    columns: [{ id: "name", label: "Event" }, { id: "date", label: "Date" }, { id: "time", label: "Time" }, { id: "owner", label: "Owner" }, { id: "location", label: "Location" }, { id: "status", label: "Status" }],
  };
}
