'use client'

import { Activity, ArrowLeft, BriefcaseBusiness, CalendarCheck2, Gauge, Pencil, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusBadge } from '@/components/ui/status-badge'

import { projectAssignments, teamActivity, teamMembers } from '../data'
import { MemberActionDialog, type MemberAction } from './team-dialogs'
import { AvailabilityBadge, CapacityCell, MemberAvatar } from './team-workspaces'

const profileTabs = ['Overview', 'Role & Organisation', 'Project Assignments', 'Capacity', 'Availability', 'Activity'] as const

export function TeamMemberProfile({ memberId }: { memberId: string }) {
  const member = teamMembers.find((item) => item.id === memberId)
  const [tab, setTab] = useState<(typeof profileTabs)[number]>('Overview')
  const [action, setAction] = useState<MemberAction>(null)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [message, setMessage] = useState('')

  if (!member) return <section className="rounded-xl border border-border bg-card p-10 text-center"><h1 className="text-xl font-bold">Team member not found</h1><p className="mt-2 text-sm text-muted-foreground">This profile is not available in the current organisation workspace.</p><Link href="/people/team" className="mt-5 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Return to Team</Link></section>

  const assignments = projectAssignments.filter((item) => item.memberId === member.id)
  const profileActivity = teamActivity.filter((item) => item.member === member.name || item.module === 'Team').slice(0, 6)

  return <>
    <WorkspaceHeader category="People" title={member.name} description={`${member.title} · ${member.department} · ${member.team}`} parent={{ label: 'Team', href: '/people/team' }} actions={<>
      <Link href="/people/team" aria-label="Back to Team" className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link>
      <Link href={`/people/team/${member.id}/edit`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold"><Pencil className="size-4" />Edit Member</Link>
      <button type="button" onClick={() => setAction('assign-project')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white"><BriefcaseBusiness className="size-4" />Assign Project</button>
    </>} />

    <section className="mb-5 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <MemberAvatar member={member} size="lg" />
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{member.name}</h2><StatusBadge tone={member.status === 'Active' ? 'brand' : 'neutral'}>{member.status}</StatusBadge></div><p className="mt-1 text-sm text-muted-foreground">{member.email}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>{member.role}</span><span>{member.department}</span><span>{member.team}</span><span>Manager: {member.manager}</span></div></div>
      <div className="grid grid-cols-3 gap-3"><ProfileMetric label="Projects" value={String(member.projects)} /><ProfileMetric label="Capacity" value={`${member.capacity}%`} /><div className="rounded-xl bg-muted/45 px-4 py-3"><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase">Availability</p><div className="mt-2"><AvailabilityBadge value={member.availability} /></div></div></div>
    </section>

    <nav aria-label="Team member sections" className="mb-5 overflow-x-auto border-b border-border"><div role="tablist" className="flex min-w-max gap-1">{profileTabs.map((item) => <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === item ? 'border-brand text-brand' : 'border-transparent text-muted-foreground'}`}>{item}</button>)}</div></nav>

    {tab === 'Overview' ? <Overview member={member} assignments={assignments} activity={profileActivity} onAction={setAction} /> : null}
    {tab === 'Role & Organisation' ? <RoleOrganisation member={member} onAction={setAction} /> : null}
    {tab === 'Project Assignments' ? <AssignmentSection assignments={assignments} onAssign={() => setAction('assign-project')} /> : null}
    {tab === 'Capacity' ? <CapacitySection member={member} assignments={assignments} /> : null}
    {tab === 'Availability' ? <AvailabilitySection member={member} onUpdate={() => setAction('availability')} /> : null}
    {tab === 'Activity' ? <ActivitySection rows={profileActivity} /> : null}

    <section className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-5"><button type="button" onClick={() => setAction('change-role')} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Change Role</button><button type="button" onClick={() => setAction('change-team')} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Change Team</button><button type="button" onClick={() => setDeactivateOpen(true)} className="rounded-lg border border-danger/25 px-4 py-2 text-sm font-semibold text-danger">Deactivate</button></section>

    <MemberActionDialog member={member} action={action} onClose={() => setAction(null)} onComplete={(value) => { setAction(null); setMessage(value) }} />
    <ConfirmationDialog open={deactivateOpen} title="Deactivate Member" description={`${member.name} will lose active access. Their assignments and accountability history will remain available.`} confirmLabel="Deactivate Member" onCancel={() => setDeactivateOpen(false)} onConfirm={() => { setDeactivateOpen(false); setMessage(`${member.name} was deactivated.`) }} />
    {message ? <button type="button" role="status" onClick={() => setMessage('')} className="fixed right-6 bottom-6 z-[100] rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-primary-foreground shadow-xl">{message}</button> : null}
  </>
}

function Overview({ member, assignments, activity, onAction }: { member: (typeof teamMembers)[number]; assignments: typeof projectAssignments; activity: typeof teamActivity; onAction: (action: MemberAction) => void }) {
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]"><section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Delivery Overview</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Info icon={UserRound} label="Job title" value={member.title} /><Info icon={ShieldCheck} label="Delivery role" value={member.role} /><Info icon={UsersRound} label="Team" value={member.team} /><Info icon={UserRound} label="Manager" value={member.manager} /><Info icon={Gauge} label="Current capacity" value={`${member.capacity}% allocated`} /><Info icon={CalendarCheck2} label="Availability" value={member.availabilityNote} /></div></section><section className="rounded-xl border border-border bg-card p-5"><div className="flex justify-between"><h2 className="text-sm font-semibold">Active Projects</h2><button type="button" onClick={() => onAction('assign-project')} className="text-xs font-semibold text-brand">Assign project</button></div><div className="mt-4 divide-y divide-border">{assignments.length ? assignments.map((item) => <div key={item.id} className="py-3"><div className="flex justify-between gap-3"><p className="text-sm font-semibold">{item.project}</p><span className="text-xs font-semibold">{item.allocation}%</span></div><p className="mt-1 text-xs text-muted-foreground">{item.role} · through {item.end}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No active project assignments.</p>}</div></section><section className="rounded-xl border border-border bg-card p-5 xl:col-span-2"><h2 className="text-sm font-semibold">Recent Activity</h2><ActivityList rows={activity} /></section></div>
}

function RoleOrganisation({ member, onAction }: { member: (typeof teamMembers)[number]; onAction: (action: MemberAction) => void }) {
  return <section className="grid gap-5 rounded-xl border border-border bg-card p-5 lg:grid-cols-3"><Info icon={ShieldCheck} label="Delivery role" value={member.role} /><Info icon={Building2Icon} label="Department" value={member.department} /><Info icon={UsersRound} label="Delivery team" value={member.team} /><Info icon={UserRound} label="Manager" value={member.manager} /><Info icon={ShieldCheck} label="Access role" value={member.accessRole} /><Info icon={CalendarCheck2} label="Member since" value={member.joined} /><div className="lg:col-span-3 flex gap-2 border-t border-border pt-5"><button type="button" onClick={() => onAction('change-role')} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Change Role</button><button type="button" onClick={() => onAction('change-team')} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">Change Team</button></div></section>
}

const Building2Icon = UsersRound

function AssignmentSection({ assignments, onAssign }: { assignments: typeof projectAssignments; onAssign: () => void }) {
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><header className="flex items-center justify-between border-b border-border p-5"><div><h2 className="text-sm font-semibold">Project Assignments</h2><p className="mt-1 text-xs text-muted-foreground">Current and historical delivery commitments.</p></div><button type="button" onClick={onAssign} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Assign Project</button></header><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="bg-muted/30 text-[0.65rem] font-semibold text-muted-foreground uppercase">{['Project', 'Role', 'Allocation', 'Start Date', 'End Date', 'Status'].map((item) => <th className="px-4 py-3" key={item}>{item}</th>)}</tr></thead><tbody>{assignments.map((item) => <tr key={item.id} className="border-t border-border"><td className="px-4 py-4 text-sm font-semibold">{item.project}</td><td className="px-4 py-4 text-xs text-muted-foreground">{item.role}</td><td className="px-4 py-4"><CapacityCell value={item.allocation} /></td><td className="px-4 py-4 text-xs">{item.start}</td><td className="px-4 py-4 text-xs">{item.end}</td><td className="px-4 py-4"><StatusBadge tone="brand">{item.status}</StatusBadge></td></tr>)}</tbody></table></div></section>
}

function CapacitySection({ member, assignments }: { member: (typeof teamMembers)[number]; assignments: typeof projectAssignments }) {
  return <div className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr]"><section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Capacity Summary</h2><p className="mt-6 text-4xl font-bold">{member.capacity}%</p><p className="mt-1 text-sm text-muted-foreground">allocated delivery capacity</p><ProgressBar value={member.capacity} color={member.capacity >= 95 ? 'var(--danger)' : member.capacity >= 85 ? 'var(--warning)' : 'var(--success)'} className="mt-6" /><p className="mt-4 text-xs text-muted-foreground">{Math.max(0, 100 - member.capacity)}% available for additional assignments.</p></section><section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Allocation Detail</h2><div className="mt-4 space-y-4">{assignments.map((item) => <div key={item.id}><div className="mb-2 flex justify-between text-xs"><span className="font-semibold">{item.project}</span><span>{item.allocation}%</span></div><ProgressBar value={item.allocation} /></div>)}</div></section></div>
}

function AvailabilitySection({ member, onUpdate }: { member: (typeof teamMembers)[number]; onUpdate: () => void }) {
  return <section className="rounded-xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">Delivery Availability</h2><p className="mt-1 text-xs text-muted-foreground">Planning context only—not a leave administration record.</p></div><button type="button" onClick={onUpdate} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Update Availability</button></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><ProfileMetric label="Current status" value={member.availability} /><ProfileMetric label="Date range" value="25–29 Aug 2026" /><ProfileMetric label="Available capacity" value={`${Math.max(0, 100 - member.capacity)}%`} /></div><div className="mt-5 rounded-xl bg-muted/40 p-4"><p className="text-xs font-semibold">Planning note</p><p className="mt-1 text-sm text-muted-foreground">{member.availabilityNote}</p></div></section>
}

function ActivitySection({ rows }: { rows: typeof teamActivity }) { return <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">Member Activity</h2><p className="mt-1 text-xs text-muted-foreground">Accountability history across UNISON modules.</p><ActivityList rows={rows} /></section> }
function ActivityList({ rows }: { rows: typeof teamActivity }) { return <div className="mt-4 divide-y divide-border">{rows.map((item) => <div key={item.id} className="flex items-start gap-3 py-3"><span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand"><Activity className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.action}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.module} · {item.record}</p></div><span className="text-xs text-muted-foreground">{item.date}</span></div>)}</div> }
function ProfileMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/45 px-4 py-3"><p className="text-[0.65rem] font-semibold text-muted-foreground uppercase">{label}</p><p className="mt-1.5 text-base font-bold">{value}</p></div> }
function Info({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) { return <div className="flex items-start gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon className="size-4" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div></div> }
