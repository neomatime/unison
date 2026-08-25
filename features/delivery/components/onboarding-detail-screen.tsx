'use client'

import { Archive, ArrowLeft, Check, CirclePause, CirclePlay, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { RecordCollectionWorkspace, type CollectionConfig } from '@/features/product-ui/components/record-collection-workspace'
import { onboardingStages, onboardings } from '../data'
import { HealthBadge, MetricCard, SectionCard } from './delivery-primitives'
import { ProjectDocumentsWorkspace } from './project-documents-workspace'

const tabs = ['Overview', 'Tasks', 'Documents', 'Information', 'Stakeholders', 'Milestones', 'Approvals', 'Timeline', 'Activity'] as const
type OnboardingTab = (typeof tabs)[number]

export function OnboardingDetailScreen({ onboardingId }: { onboardingId: string }) {
  const record = onboardings.find((item) => item.id === onboardingId) ?? onboardings[0]
  const initialStage = Math.max(0, onboardingStages.indexOf(record.stage))
  const [stage, setStage] = useState(initialStage)
  const [tab, setTab] = useState<OnboardingTab>('Overview')
  const [paused, setPaused] = useState(false)
  const [archived, setArchived] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'complete' | 'transition' | null>(null)
  const [message, setMessage] = useState('')

  function confirmAction() {
    if (confirm === 'transition') setStage((current) => Math.min(onboardingStages.length - 1, current + 1))
    if (confirm === 'archive') setArchived(true)
    if (confirm === 'complete') {
      setStage(onboardingStages.length - 1)
      setMessage('Onboarding completed and prepared for operational handover.')
    }
    setConfirm(null)
  }

  return <>
    <WorkspaceHeader category="Operations" parent={{ label: 'Onboarding', href: '/operations/onboarding' }} title={record.client} description="Internal client onboarding workspace" />
    <div className="-mt-2 mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/operations/onboarding" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Back to Onboarding</Link>
      <div className="flex flex-wrap gap-2">
        <HealthBadge>{archived ? 'Archived' : paused ? 'Paused' : record.health}</HealthBadge>
        {!archived ? <>
          <Link href={`/operations/onboarding/${record.id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Pencil className="size-3.5" />Edit</Link>
          <button type="button" onClick={() => { setPaused((value) => !value); setMessage(paused ? 'Onboarding resumed.' : 'Onboarding paused.') }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold">{paused ? <CirclePlay className="size-3.5" /> : <CirclePause className="size-3.5" />}{paused ? 'Resume' : 'Pause'}</button>
          <button type="button" onClick={() => setConfirm('archive')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-destructive"><Archive className="size-3.5" />Archive</button>
        </> : <button type="button" onClick={() => { setArchived(false); setMessage('Onboarding restored to active records.') }} className="h-9 rounded-lg border border-brand/30 bg-brand-soft px-3 text-xs font-semibold text-brand">Restore</button>}
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Current Stage" value={`${stage + 1} of ${onboardingStages.length}`} detail={onboardingStages[stage]} />
      <MetricCard label="Progress" value={`${Math.round(((stage + 1) / onboardingStages.length) * 100)}%`} detail="Overall readiness" />
      <MetricCard label="Open Tasks" value={String(record.tasks)} detail="3 due this week" />
      <MetricCard label="Target Go-Live" value={record.goLive.split(' ').slice(0, 2).join(' ')} detail="2026" />
    </div>

    <SectionCard title="Onboarding journey" description="Governed progress from welcome to operational handover." className="mt-5">
      <div className="grid gap-2 p-5 md:grid-cols-6">{onboardingStages.map((item, index) => <button type="button" key={item} disabled={index > stage + 1 || archived} onClick={() => index === stage + 1 && setConfirm('transition')} className={`rounded-xl border p-3 text-left disabled:cursor-not-allowed ${index === stage ? 'border-brand bg-brand-soft' : index < stage ? 'border-success/30 bg-success-soft' : 'border-border'}`}><span className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${index < stage ? 'bg-success text-white' : index === stage ? 'bg-brand text-white' : 'bg-muted'}`}>{index < stage ? <Check className="size-4" /> : index + 1}</span><p className="mt-3 text-xs font-semibold">{item}</p><p className="mt-1 text-[0.65rem] text-muted-foreground">{index < stage ? 'Complete' : index === stage ? 'In progress' : 'Not started'}</p></button>)}</div>
    </SectionCard>

    <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Onboarding record sections">{tabs.map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${tab === item ? 'border-brand text-brand' : 'border-transparent text-muted-foreground'}`}>{item}</button>)}</nav>
    <div className="mt-5">{tab === 'Overview' ? <OnboardingOverview record={record} stage={stage} paused={paused} onAdvance={() => setConfirm('transition')} onComplete={() => setConfirm('complete')} /> : tab === 'Documents' ? <ProjectDocumentsWorkspace /> : <OnboardingCollection tab={tab} />}</div>

    <ConfirmationDialog open={confirm !== null} title={confirm === 'archive' ? 'Archive onboarding?' : confirm === 'complete' ? 'Complete onboarding and handover?' : `Move to ${onboardingStages[Math.min(onboardingStages.length - 1, stage + 1)]}?`} description={confirm === 'archive' ? `${record.client} will leave active onboarding views and can be restored later.` : confirm === 'complete' ? 'Confirm required tasks, documents, approvals, ownership and project or service handover are complete.' : 'The stage checklist, required documents and approvals will be reviewed before transition.'} confirmLabel={confirm === 'archive' ? 'Archive onboarding' : confirm === 'complete' ? 'Complete Onboarding' : 'Confirm transition'} onCancel={() => setConfirm(null)} onConfirm={confirmAction} />
    {message ? <button type="button" role="status" onClick={() => setMessage('')} className="fixed right-6 bottom-6 z-50 rounded-xl bg-foreground px-4 py-3 text-sm text-white shadow-xl">{message}</button> : null}
  </>
}

function OnboardingOverview({ record, stage, paused, onAdvance, onComplete }: { record: (typeof onboardings)[number]; stage: number; paused: boolean; onAdvance: () => void; onComplete: () => void }) {
  const blockers = ['Company registration document requires review', 'Billing stakeholder still unconfirmed']
  return <div className="grid gap-5 xl:grid-cols-3">
    <SectionCard title="Onboarding summary" className="xl:col-span-2"><div className="grid gap-4 p-5 sm:grid-cols-2">{[['Owner', record.owner], ['Current stage', onboardingStages[stage]], ['Target go-live', record.goLive], ['Health', paused ? 'Paused' : record.health], ['Open tasks', String(record.tasks)], ['Documents required', String(record.documents)]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div></SectionCard>
    <SectionCard title="Stage actions"><div className="space-y-3 p-5"><button type="button" disabled={paused || stage === onboardingStages.length - 1} onClick={onAdvance} className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Advance to next stage</button><button type="button" disabled={paused || stage < onboardingStages.length - 2} onClick={onComplete} className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Complete & Handover</button></div></SectionCard>
    <SectionCard title="Readiness blockers" description="Items that must be resolved before the next transition." className="xl:col-span-2"><div className="divide-y divide-border">{blockers.map((blocker) => <div key={blocker} className="flex items-center gap-3 px-5 py-4"><span className="size-2 rounded-full bg-warning" /><span className="text-sm font-medium">{blocker}</span><button type="button" className="ml-auto text-xs font-semibold text-brand">Review</button></div>)}</div></SectionCard>
    <SectionCard title="Handover readiness"><div className="space-y-3 p-5">{['Required tasks complete', 'Documents complete', 'Approvals complete', 'Owner confirmed', 'Project / service handover'].map((item, index) => <label key={item} className="flex items-center gap-3 text-sm"><input type="checkbox" defaultChecked={index < 2} />{item}</label>)}</div></SectionCard>
  </div>
}

function OnboardingCollection({ tab }: { tab: Exclude<OnboardingTab, 'Overview' | 'Documents'> }) {
  const names: Record<string, string[]> = {
    Tasks: ['Verify company registration', 'Configure workspace access', 'Complete service setup', 'Confirm go-live support'],
    Information: ['Company profile', 'Billing information', 'Service requirements'],
    Stakeholders: ['Primary contact', 'Decision maker', 'Billing stakeholder', 'Project lead'],
    Milestones: ['Kickoff complete', 'Information approved', 'Agreements signed', 'Go-live readiness'],
    Approvals: ['Compliance approval', 'Go-live approval'],
    Timeline: ['Welcome stage started', 'Company details received', 'Document review completed'],
    Activity: ['Owner assigned', 'Document uploaded', 'Task completed'],
  }
  return <RecordCollectionWorkspace config={onboardingConfig(tab, names[tab])} />
}

function onboardingConfig(tab: string, names: string[]): CollectionConfig {
  const singular = tab === 'Tasks' ? 'Task' : tab === 'Stakeholders' ? 'Stakeholder' : tab === 'Approvals' ? 'Approval' : tab.replace(/s$/, '')
  return {
    title: `Onboarding ${tab}`,
    singular,
    description: `${tab} required for onboarding readiness and governed handover.`,
    primaryAction: tab === 'Tasks' ? 'Create Task' : tab === 'Approvals' ? 'Request Approval' : `Add ${singular}`,
    records: names.map((name, index) => ({ id: `${tab.toLowerCase()}-${index}`, name, context: onboardingStages[Math.min(index, onboardingStages.length - 1)], owner: index % 2 ? 'Amara Dlamini' : 'Neo Morake', status: index < 2 ? 'Complete' : 'Open', updated: index ? 'Yesterday' : 'Today' })),
    fields: [{ id: 'name', label: `${singular} name`, required: true }, { id: 'context', label: 'Description / stage', type: 'textarea' }, { id: 'owner', label: 'Owner' }, { id: 'status', label: 'Status', type: 'select', options: ['Open', 'In Progress', 'Blocked', 'Complete'] }],
    contextualActions: tab === 'Tasks' ? ['Complete', 'Reassign'] : tab === 'Approvals' ? ['Request Approval'] : undefined,
  }
}
