"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ArrowLeft, Video } from "lucide-react";

import { isoToLocalInput, safeJoinUrl, teamsLink } from "@/features/calendar/model";
import { AttendeesEditor } from "@/features/calendar/components/attendees-editor";
import { DEFAULT_REMINDER_MINUTES, REMINDER_OPTIONS } from "@/features/calendar/reminders";
import { EventFormTabs } from "@/features/calendar/components/event-form-tabs";
import { ScheduleFields } from "@/features/calendar/components/event-schedule-fields";
import { AgendaEditor, DescriptionEditor } from "@/features/calendar/components/event-text-fields";
import type { CalendarEvent } from "@/features/calendar/model";
import { WorkspaceHeader } from "@/components/shared/workspace-header";
import { savePhaseFourRecordAction } from "../actions/phase-four";
import type { PhaseFourKind, PhaseFourRecord, SelectOption } from "../queries/phase-four";
import { Dropdown } from '@/components/ui/select'
import { AppInput } from '@/components/ui/input'

type Options = {
  members: SelectOption[];
  projects: SelectOption[];
  clients: SelectOption[];
  onboardings: SelectOption[];
};

const meta: Record<PhaseFourKind, { title: string; parent: string; base: string }> = {
  "team-member": { title: "Team Member", parent: "Team", base: "/people/team" },
  assignment: { title: "Project Assignment", parent: "Team", base: "/people/team/assignments" },
  onboarding: { title: "Client Onboarding", parent: "Onboarding", base: "/operations/onboarding" },
  vendor: { title: "Vendor", parent: "Vendors", base: "/delivery/vendors" },
  task: { title: "Task", parent: "Tasks", base: "/operations/tasks" },
  "calendar-event": { title: "Calendar Event", parent: "Calendar", base: "/operations/calendar" },
};

const inputClass = "mt-1.5 h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand";

export function PhaseFourForm({
  kind,
  record,
  options,
  defaults,
  teamsConnected,
  scheduleEvents,
}: {
  kind: PhaseFourKind;
  record?: PhaseFourRecord | null;
  options: Options;
  defaults?: Record<string, string | undefined>;
  /** Calendar events only: whether Microsoft Teams is set up, so the meeting option can be offered or explained. */
  teamsConnected?: boolean;
  /** Calendar events only: the other events, for the day preview and the clash warning. */
  scheduleEvents?: CalendarEvent[];
}) {
  const action = savePhaseFourRecordAction.bind(null, kind, record?.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const info = meta[kind];
  return (
    <>
      <WorkspaceHeader
        category={kind === "team-member" || kind === "assignment" ? "People" : kind === "vendor" ? "Delivery" : "Operations"}
        parent={{ label: info.parent, href: info.base }}
        title={`${record ? "Edit" : "New"} ${info.title}`}
        description={`Capture the governed ${info.title.toLowerCase()} record in the active organization.`}
      />
      <div className="mx-auto mb-3 max-w-5xl">
        <Link href={record ? `${info.base}/${record.id}` : info.base} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40">
          <ArrowLeft aria-hidden="true" className="size-4" />Back to {record ? info.title.toLowerCase() : info.parent.toLowerCase()}
        </Link>
      </div>
      <form action={formAction} className="mx-auto max-w-5xl border border-border bg-card">
        <div className="grid gap-5 p-6 md:grid-cols-2 lg:p-8">
          <Fields kind={kind} record={record} options={options} defaults={defaults} teamsConnected={teamsConnected} scheduleEvents={scheduleEvents} />
        </div>
        {state?.error ? <p role="alert" className="mx-6 mb-4 text-sm text-destructive">{state.error}</p> : null}
        <footer className="flex justify-end gap-2 border-t border-border p-5">
          <Link href={record ? `${info.base}/${record.id}` : info.base} className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link>
          <button type="submit" disabled={pending} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Saving…" : `Save ${info.title}`}
          </button>
        </footer>
      </form>
    </>
  );
}

function Fields({ kind, record, options, defaults, teamsConnected, scheduleEvents }: { kind: PhaseFourKind; record?: PhaseFourRecord | null; options: Options; defaults?: Record<string, string | undefined>; teamsConnected?: boolean; scheduleEvents?: CalendarEvent[] }) {
  const value = (key: string, fallback = "") => String(record?.[key] ?? defaults?.[key] ?? fallback);
  if (kind === "team-member") return <>
    <Field name="fullName" label="Full name" required value={value("name")} />
    <Field name="email" label="Work email" type="email" required value={value("email")} />
    <Field name="jobTitle" label="Job title" value={value("jobTitle")} />
    <Field name="deliveryRole" label="Delivery role" value={value("deliveryRole")} />
    <Field name="department" label="Department" value={value("department")} />
    <Field name="teamName" label="Team" value={value("teamName")} />
    <OptionSelect name="managerId" label="Manager" options={options.members.filter((option) => option.id !== record?.id)} value={value("managerId")} optional />
    <Field name="capacityPercent" label="Capacity allocation (%)" type="number" min={0} max={150} value={value("capacityPercent", "0")} />
    <Select name="availability" label="Availability" options={["Available", "Partial", "Busy", "Unavailable"]} value={value("availability", "Available")} />
    <Select name="status" label="Member status" options={["Active", "Inactive", "Invited"]} value={value("status", "Active")} />
    <Select name="accessRole" label="Access role" options={["Member", "Admin", "Owner"]} value={value("accessRole", "Member")} />
    <Field name="joinedOn" label="Joined on" type="date" value={value("joinedOn")} />
    <TextArea name="availabilityNote" label="Availability note" value={value("availabilityNote")} />
  </>;
  if (kind === "assignment") return <>
    <OptionSelect name="teamMemberId" label="Team member" options={options.members} value={value("teamMemberId", defaults?.teamMemberId)} required />
    <OptionSelect name="projectId" label="Project" options={options.projects} value={value("projectId")} required />
    <Field name="deliveryRole" label="Delivery role" required value={value("deliveryRole")} />
    <Field name="allocationPercent" label="Allocation (%)" type="number" min={0} max={150} value={value("allocationPercent", "25")} />
    <Field name="startDate" label="Start date" type="date" required value={value("startDate")} />
    <Field name="endDate" label="End date" type="date" value={value("endDate")} />
    <Select name="status" label="Status" options={["Planned", "Active", "Complete", "Cancelled"]} value={value("status", "Planned")} />
    <TextArea name="notes" label="Notes" value={value("notes")} />
  </>;
  if (kind === "onboarding") return <>
    <OptionSelect name="clientId" label="Existing client" options={options.clients} value={value("clientId")} optional />
    <Field name="clientName" label="Client name (if not listed)" value={value("clientName")} />
    <OptionSelect name="ownerId" label="Onboarding owner" options={options.members} value={value("ownerId")} optional />
    <Select name="onboardingType" label="Onboarding type" options={["Standard Client", "Growth Partner", "Enterprise Client", "Custom"]} value={value("onboardingType", "Standard Client")} />
    <Select name="stage" label="Current stage" options={["Welcome", "Company Setup", "Information & Documentation", "Agreements", "Review & Approval", "Go Live / Handover"]} value={value("stage", "Welcome")} />
    <Field name="progressPercent" label="Progress (%)" type="number" min={0} max={100} value={value("progressPercent", "0")} />
    <Select name="health" label="Health" options={["On Track", "Watch", "At Risk"]} value={value("health", "On Track")} />
    <Select name="priority" label="Priority" options={["Normal", "High", "Critical"]} value={value("priority", "Normal")} />
    <Field name="startDate" label="Start date" type="date" value={value("startDate")} />
    <Field name="targetGoLive" label="Target go-live" type="date" value={value("targetGoLive")} />
    <Field name="requiredDocuments" label="Required documents" type="number" min={0} value={value("requiredDocuments", "0")} />
    <Select name="status" label="Status" options={["Draft", "Active", "Paused", "Complete"]} value={value("status", "Active")} />
    <TextArea name="notes" label="Notes" value={value("notes")} />
  </>;
  if (kind === "vendor") return <>
    <Field name="name" label="Vendor name" required value={value("name")} />
    <Select name="vendorType" label="Vendor type" options={["Technology", "Integration", "Data", "Infrastructure", "Compliance", "Operations", "Creative", "Other"]} value={value("vendorType", "Other")} />
    <Field name="serviceCategory" label="Service category" value={value("serviceCategory")} />
    <Field name="region" label="Region" value={value("region")} />
    <OptionSelect name="ownerId" label="Account owner" options={options.members} value={value("ownerId")} optional />
    <Field name="primaryContact" label="Primary contact" value={value("primaryContact")} />
    <Field name="contactEmail" label="Contact email" type="email" value={value("contactEmail")} />
    <Field name="phone" label="Phone" type="tel" value={value("phone")} />
    <Field name="contractStart" label="Contract start" type="date" value={value("contractStart")} />
    <Field name="contractEnd" label="Contract end" type="date" value={value("contractEnd")} />
    <Field name="contractValue" label="Contract value" type="number" min={0} value={value("contractValue")} />
    <Field name="renewalNoticeDays" label="Renewal notice (days)" type="number" min={0} value={value("renewalNoticeDays", "30")} />
    <Field name="slaPercent" label="SLA performance (%)" type="number" min={0} max={100} value={value("slaPercent")} />
    <Select name="riskLevel" label="Risk level" options={["Low", "Medium", "High", "Critical"]} value={value("riskLevel", "Low")} />
    <Select name="dataSensitivity" label="Data sensitivity" options={["Low", "Moderate", "High", "Restricted"]} value={value("dataSensitivity", "Low")} />
    <Select name="complianceStatus" label="Compliance" options={["Current", "Review due", "Gap open", "Not assessed"]} value={value("complianceStatus", "Not assessed")} />
    <Select name="status" label="Status" options={["Active", "Under Review", "At Risk", "Suspended"]} value={value("status", "Active")} />
    <TextArea name="notes" label="Notes" value={value("notes")} />
  </>;
  if (kind === "task") return <>
    <Field name="title" label="Task title" required value={value("title", value("name"))} />
    <OptionSelect name="assigneeId" label="Assignee" options={options.members} value={value("assigneeId")} optional />
    <OptionSelect name="projectId" label="Project" options={options.projects} value={value("projectId")} optional />
    <OptionSelect name="clientId" label="Client" options={options.clients} value={value("clientId")} optional />
    <OptionSelect name="onboardingId" label="Onboarding" options={options.onboardings} value={value("onboardingId")} optional />
    <Select name="priority" label="Priority" options={["Low", "Medium", "High", "Critical"]} value={value("priority", "Medium")} />
    <Select name="status" label="Status" options={["Backlog", "Planned", "In Progress", "Blocked", "Complete", "Cancelled"]} value={value("status", "Planned")} />
    <Field name="dueAt" label="Due date and time" type="datetime-local" value={dateTimeValue(value("dueAt"))} />
    <TextArea name="description" label="Description" value={value("description")} />
  </>;
  return <EventFormTabs startValue={isoToLocalInput(value("startAt"))} endValue={isoToLocalInput(value("endAt"))} events={scheduleEvents ?? []} ignoreId={record?.id} details={<>
    <Field name="title" label="Event title" required value={value("title", value("name"))} />
    <Select name="eventType" label="Event type" options={["Internal", "Client Meeting", "Milestone", "Governance", "Delivery"]} value={value("eventType", "Internal")} />
    <ScheduleFields />
    <label className="text-sm font-medium">Reminder<Dropdown name="reminderMinutes" defaultValue={record ? String(record.reminderMinutes ?? "") : String(DEFAULT_REMINDER_MINUTES)} className={inputClass}><option value="">No reminder</option>{REMINDER_OPTIONS.map((option) => <option key={option.minutes} value={String(option.minutes)}>{option.label}</option>)}</Dropdown></label>
    <OnlineMeeting connected={Boolean(teamsConnected)} joinUrl={safeJoinUrl(String(record?.teamsJoinUrl ?? ""))} location={value("location")} />
    <OptionSelect name="ownerId" label="Owner" options={options.members} value={value("ownerId")} optional />
    <OptionSelect name="clientId" label="Client" options={options.clients} value={value("clientId")} optional />
    <Select name="status" label="Status" options={["Tentative", "Confirmed", "Cancelled", "Complete"]} value={value("status", "Confirmed")} />
    <label className="flex items-center gap-2 text-sm font-medium"><input name="allDay" type="checkbox" defaultChecked={Boolean(record?.allDay)} />All-day event</label>
    <AttendeesEditor value={record?.attendees} />
    <DescriptionEditor value={value("description")} />
    <AgendaEditor value={record?.agenda} />
  </>} />;
}

function dateTimeValue(value: string) { return value ? value.slice(0, 16) : ""; }

/** One switch for the place: on, the event gets a Microsoft Teams meeting and its link is the location; off, a plain location. */
function OnlineMeeting({ connected, joinUrl, location }: { connected: boolean; joinUrl: string | null; location: string }) {
  const pasted = teamsLink(location);
  const attached = joinUrl ?? pasted;
  const [online, setOnline] = useState(Boolean(attached));
  // Without a connection a new meeting cannot be made, but an event that already has a link can still keep or drop it.
  const canToggle = connected || Boolean(attached);
  return <div className="flex flex-col gap-3 md:col-span-2">
    <label className="flex items-start gap-3 text-sm font-medium">
      <input type="checkbox" role="switch" name="onlineMeeting" checked={online} disabled={!canToggle} onChange={(event) => setOnline(event.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className="relative mt-0.5 inline-block h-5 w-9 shrink-0 border border-border bg-muted transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:bg-white after:transition-transform peer-checked:border-brand peer-checked:bg-brand peer-checked:after:translate-x-4 peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/40" />
      <span>
        <span className="flex items-center gap-2"><Video aria-hidden="true" className="size-4 text-brand" />Online meeting (Microsoft Teams)</span>
        <span className="block text-xs font-normal text-muted-foreground">
          {!canToggle ? "Teams not connected. An administrator can connect Microsoft Teams to create meeting links." : online ? "A Teams meeting is created when you save, and its link becomes the location." : "Turn on to create a Teams meeting instead of a place."}
        </span>
      </span>
    </label>
    {online
      ? attached
        ? <p className="text-sm"><a href={attached} target="_blank" rel="noopener noreferrer" className="text-brand underline">Teams meeting link</a>{!joinUrl && pasted ? <input type="hidden" name="pastedLink" value={pasted} /> : null}</p>
        : null
      : <Field name="location" label="Location" value={pasted ? "" : location} />}
  </div>;
}

function Field({ name, label, value, type = "text", required, min, max }: { name: string; label: string; value?: string; type?: string; required?: boolean; min?: number; max?: number }) {
  return <label className="text-sm font-medium">{label}<AppInput name={name} type={type} required={required} min={min} max={max} defaultValue={value ?? ""} className={inputClass} /></label>;
}
function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return <label className="text-sm font-medium">{label}<Dropdown name={name} defaultValue={value ?? options[0]} className={inputClass}>{options.map((option) => <option key={option}>{option}</option>)}</Dropdown></label>;
}
function OptionSelect({ name, label, value, options, optional, required }: { name: string; label: string; value?: string; options: SelectOption[]; optional?: boolean; required?: boolean }) {
  return <label className="text-sm font-medium">{label}<Dropdown name={name} defaultValue={value ?? ""} required={required} className={inputClass}>{optional ? <option value="">Unassigned</option> : <option value="">Select…</option>}{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Dropdown></label>;
}
function TextArea({ name, label, value }: { name: string; label: string; value?: string }) {
  return <label className="text-sm font-medium md:col-span-2">{label}<textarea name={name} rows={4} defaultValue={value ?? ""} className={`${inputClass} h-auto py-3`} /></label>;
}
