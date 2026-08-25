'use client'

import {
  Activity,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  ChevronDown,
  Download,
  Gauge,
  MoreHorizontal,
  Plus,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { ExportDialog } from '@/components/shared/export-dialog'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { DonutChart } from '@/components/ui/donut-chart'

import { departments, teamActivity, teamMembers as initialMembers, type TeamMember } from '../data'
import { InviteMemberDialog, MemberActionDialog, type MemberAction } from './team-dialogs'
import { AvailabilityBadge, TeamWorkspace, teamTabs, type TeamTab } from './team-workspaces'

type Toast = { message: string; tone?: 'success' | 'neutral' } | null

export function TeamScreen() {
  const [activeTab, setActiveTab] = useState<TeamTab>('directory')
  const [members, setMembers] = useState(initialMembers)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [memberAction, setMemberAction] = useState<{ member: TeamMember; action: MemberAction } | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(null)
  const [toast, setToast] = useState<Toast>(null)

  const activeMembers = members.filter((member) => member.status === 'Active')
  const available = activeMembers.filter((member) => member.availability === 'Available').length
  const averageCapacity = Math.round(activeMembers.reduce((sum, member) => sum + member.capacity, 0) / Math.max(1, activeMembers.length))

  function showToast(message: string) {
    setToast({ message, tone: 'success' })
    window.setTimeout(() => setToast(null), 3200)
  }

  function openMemberAction(member: TeamMember, action: MemberAction) {
    if (action === null) return
    setMemberAction({ member, action })
  }

  function toggleMember(member: TeamMember) {
    if (member.status === 'Inactive') {
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, status: 'Active' } : item))
      showToast(`${member.name} was reactivated.`)
      return
    }
    setDeactivateTarget(member)
  }

  const headerActions = <>
    <div className="relative">
      <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-sm hover:bg-muted">
        More Actions <ChevronDown className="size-4" />
      </button>
      {moreOpen ? <div className="absolute top-full right-0 z-40 mt-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl">
        <button type="button" onClick={() => { setExportOpen(true); setMoreOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"><Download className="size-4" />Export directory</button>
        <button type="button" onClick={() => { setActiveTab('capacity'); setMoreOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"><Gauge className="size-4" />Review capacity</button>
        <button type="button" onClick={() => { setActiveTab('activity'); setMoreOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted"><Activity className="size-4" />View activity</button>
      </div> : null}
    </div>
    <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand/90"><Plus className="size-4" />Invite Member</button>
  </>

  return <>
    <WorkspaceHeader category="People" title="Team" description="Manage delivery people, assignments, roles, capacity and activity across the organisation." actions={headerActions} />

    <nav aria-label="Team sections" className="mb-5 overflow-x-auto border-b border-border">
      <div role="tablist" className="flex min-w-max gap-1">
        {teamTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>)}
      </div>
    </nav>

    <section aria-label="Team summary" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <SummaryCard icon={Users} label="Total Members" value="48" detail="↑ 3 vs last month" tone="brand" />
      <SummaryCard icon={BriefcaseBusiness} label="Active on Projects" value="39" detail="81% of total" />
      <SummaryCard icon={Building2} label="Departments" value="6" detail="No change" />
      <SummaryCard icon={UsersRound} label="Teams" value="11" detail="↑ 1 vs last month" tone="brand" />
      <SummaryCard icon={Gauge} label="Capacity Utilisation" value={`${averageCapacity}%`} detail="↑ 5% vs last month" tone="brand" />
      <SummaryCard icon={CalendarCheck2} label="Available This Week" value={String(Math.max(12, available))} detail="25% of total" />
    </section>

    <TeamWorkspace tab={activeTab} members={members} onMemberAction={openMemberAction} onDeactivate={toggleMember} onReactivate={toggleMember} />

    {activeTab === 'directory' ? <DirectoryPanels onNavigate={setActiveTab} /> : null}

    <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={(member) => { setMembers((current) => [member, ...current]); showToast(`${member.name} was invited.`) }} />
    <MemberActionDialog member={memberAction?.member ?? null} action={memberAction?.action ?? null} onClose={() => setMemberAction(null)} onComplete={(message) => { setMemberAction(null); showToast(message) }} />
    <ConfirmationDialog open={deactivateTarget !== null} title="Deactivate Member" description={`${deactivateTarget?.name ?? 'This member'} will lose active access and will no longer be available for new delivery assignments. Their history remains intact.`} confirmLabel="Deactivate Member" onCancel={() => setDeactivateTarget(null)} onConfirm={() => {
      if (!deactivateTarget) return
      const name = deactivateTarget.name
      setMembers((current) => current.map((member) => member.id === deactivateTarget.id ? { ...member, status: 'Inactive', availability: 'Unavailable' } : member))
      setDeactivateTarget(null)
      showToast(`${name} was deactivated.`)
    }} />
    <ExportDialog open={exportOpen} title="Team Directory" selectedCount={0} onClose={() => setExportOpen(false)} />
    {toast ? <button type="button" role="status" onClick={() => setToast(null)} className="fixed right-6 bottom-6 z-[100] inline-flex max-w-sm items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-left text-sm font-medium text-primary-foreground shadow-xl">{toast.message}<X className="size-3.5 opacity-60" /></button> : null}
  </>
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Users; label: string; value: string; detail: string; tone?: 'brand' }) {
  return <article className="min-h-36 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
    <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon className="size-4.5" /></span><p className="text-xs font-semibold text-muted-foreground">{label}</p></div>
    <p className="mt-4 text-2xl font-bold tracking-tight">{value}</p>
    <p className={`mt-2 text-xs ${tone === 'brand' ? 'font-medium text-success' : 'text-muted-foreground'}`}>{detail}</p>
  </article>
}

function DirectoryPanels({ onNavigate }: { onNavigate: (tab: TeamTab) => void }) {
  return <section aria-label="Team insights" className="mt-5 grid gap-4 xl:grid-cols-4">
    <InsightPanel icon={Building2} title="Department Snapshot" action="View all departments" onAction={() => onNavigate('departments')}>
      <div className="divide-y divide-border text-xs">{departments.slice(0, 5).map((department) => <div key={department.id} className="flex items-center justify-between py-2.5"><span>{department.name}</span><span className="font-semibold">{department.members}</span></div>)}</div>
    </InsightPanel>
    <InsightPanel icon={Gauge} title="Capacity Overview" action="View capacity details" onAction={() => onNavigate('capacity')}>
      <div className="flex items-center gap-5 py-2"><DonutChart size={104} thickness={11} rounded={false} segments={[{ value: 24, color: 'var(--success)' }, { value: 15, color: 'var(--warning)' }, { value: 9, color: 'var(--danger)' }]}><span className="text-lg font-bold">48</span><span className="text-[0.6rem] text-muted-foreground">members</span></DonutChart><div className="space-y-3 text-xs"><Legend color="bg-success" label="On Track" value="24" /><Legend color="bg-warning" label="Near Capacity" value="15" /><Legend color="bg-danger" label="Overallocated" value="9" /></div></div>
    </InsightPanel>
    <InsightPanel icon={CalendarCheck2} title="Availability This Week" action="View availability" onAction={() => onNavigate('availability')}>
      <div className="divide-y divide-border">{initialMembers.slice(2, 6).map((member) => <div key={member.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-semibold">{member.name}</p><p className="truncate text-[0.65rem] text-muted-foreground">{member.availabilityNote}</p></div><AvailabilityBadge value={member.availability} /></div>)}</div>
    </InsightPanel>
    <InsightPanel icon={Activity} title="Recent Team Activity" action="View all activity" onAction={() => onNavigate('activity')}>
      <div className="divide-y divide-border">{teamActivity.slice(0, 4).map((item) => <div key={item.id} className="py-2.5"><div className="flex justify-between gap-3"><p className="truncate text-xs font-semibold">{item.member}</p><span className="shrink-0 text-[0.62rem] text-muted-foreground">{item.date.split(',')[0]}</span></div><p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{item.action} · {item.record}</p></div>)}</div>
    </InsightPanel>
  </section>
}

function InsightPanel({ icon: Icon, title, action, onAction, children }: { icon: typeof Users; title: string; action: string; onAction: () => void; children: React.ReactNode }) {
  return <article className="flex min-h-72 flex-col rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><header className="flex items-center gap-2"><Icon className="size-4 text-brand" /><h2 className="text-sm font-semibold">{title}</h2></header><div className="mt-4 flex-1">{children}</div><button type="button" onClick={onAction} className="mt-4 flex w-full items-center justify-between border-t border-border pt-3 text-left text-xs font-semibold text-brand">{action}<span aria-hidden>→</span></button></article>
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${color}`} /><span className="text-muted-foreground">{label}</span><strong className="ml-auto">{value}</strong></div>
}
