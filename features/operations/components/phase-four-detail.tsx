import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkPage } from "@/components/shared/work-page";
import { getPhaseFourRecord, type PhaseFourKind } from "../queries/phase-four";

const meta: Record<PhaseFourKind, { category: string; parent: string; base: string; description: string }> = {
  "team-member": { category: "People", parent: "Team", base: "/people/team", description: "Persistent team profile, role and capacity." },
  assignment: { category: "People", parent: "Team Assignments", base: "/people/team/assignments", description: "Persistent project accountability and allocation." },
  onboarding: { category: "Operations", parent: "Onboarding", base: "/operations/onboarding", description: "Persistent client readiness and handover journey." },
  vendor: { category: "Delivery", parent: "Vendors", base: "/delivery/vendors", description: "Persistent vendor ownership, contract and risk profile." },
  task: { category: "Operations", parent: "Tasks", base: "/operations/tasks", description: "Persistent operational task and accountability." },
  "calendar-event": { category: "Operations", parent: "Calendar", base: "/operations/calendar", description: "Persistent operational calendar event." },
};

const fields: Record<PhaseFourKind, Array<[string, string]>> = {
  "team-member": [["Email", "email"], ["Job title", "jobTitle"], ["Delivery role", "deliveryRole"], ["Department", "department"], ["Team", "teamName"], ["Capacity", "capacityPercent"], ["Availability", "availability"], ["Availability note", "availabilityNote"], ["Access role", "accessRole"], ["Joined on", "joinedOn"], ["Status", "status"]],
  assignment: [["Member", "member"], ["Project", "project"], ["Delivery role", "deliveryRole"], ["Allocation", "allocationPercent"], ["Start date", "startDate"], ["End date", "endDate"], ["Status", "status"], ["Notes", "notes"]],
  onboarding: [["Client", "clientName"], ["Owner", "owner"], ["Type", "onboardingType"], ["Stage", "stage"], ["Progress", "progressPercent"], ["Health", "health"], ["Priority", "priority"], ["Start date", "startDate"], ["Target go-live", "targetGoLive"], ["Required documents", "requiredDocuments"], ["Open tasks", "taskCount"], ["Status", "status"], ["Notes", "notes"]],
  vendor: [["Type", "vendorType"], ["Service category", "serviceCategory"], ["Region", "region"], ["Owner", "owner"], ["Primary contact", "primaryContact"], ["Contact email", "contactEmail"], ["Phone", "phone"], ["Contract start", "contractStart"], ["Contract end", "contractEnd"], ["Contract value", "contractValue"], ["Renewal notice", "renewalNoticeDays"], ["SLA", "slaPercent"], ["Data sensitivity", "dataSensitivity"], ["Risk", "riskLevel"], ["Compliance", "complianceStatus"], ["Status", "status"], ["Notes", "notes"]],
  task: [["Description", "description"], ["Assignee", "assignee"], ["Project", "project"], ["Client", "client"], ["Onboarding", "onboarding"], ["Priority", "priority"], ["Due", "dueAt"], ["Completed", "completedAt"], ["Status", "status"]],
  "calendar-event": [["Type", "eventType"], ["Starts", "startAt"], ["Ends", "endAt"], ["All day", "allDay"], ["Location", "location"], ["Owner", "owner"], ["Project", "project"], ["Client", "client"], ["Onboarding", "onboarding"], ["Status", "status"], ["Description", "description"]],
};

export async function PhaseFourDetail({ kind, id }: { kind: PhaseFourKind; id: string }) {
  const record = await getPhaseFourRecord(kind, id);
  if (!record) notFound();
  const info = meta[kind];
  return <WorkPage category={info.category} title={record.name} description={info.description} parent={{ label: info.parent, href: info.base }}>
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border p-6">
        <p className="text-xs tracking-[0.16em] text-brand uppercase">Governed record</p>
        <Link href={`${info.base}/${record.id}/edit`} className="bg-brand px-4 py-2 text-sm font-semibold text-white">Edit record</Link>
      </header>
      <dl className="grid sm:grid-cols-2">
        {fields[kind].map(([label, key]) => <div key={key} className="border-b border-border p-6 sm:odd:border-r"><dt className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</dt><dd className="mt-2 whitespace-pre-wrap text-sm font-semibold">{formatValue(key, record[key])}</dd></div>)}
      </dl>
    </section>
  </WorkPage>;
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "capacityPercent" || key === "allocationPercent" || key === "progressPercent" || key === "slaPercent") return `${value}%`;
  if (key === "renewalNoticeDays") return `${value} days`;
  if (key === "contractValue") return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value));
  if (key.endsWith("At")) return new Date(String(value)).toLocaleString("en-ZA");
  if (key.endsWith("Date") || key === "joinedOn" || key === "targetGoLive" || key === "contractStart" || key === "contractEnd") return new Date(`${value}T00:00:00`).toLocaleDateString("en-ZA");
  return String(value);
}
