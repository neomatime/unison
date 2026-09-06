'use client'

import { ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { archiveProjectAction } from '@/features/delivery/actions/archive-project'
import type { DeliveryItemNode } from '@/features/delivery/queries/list-delivery-items'
import { DeliveryItemsPanel } from './delivery-items-panel'
import { HealthBadge, MetricCard, SectionCard, TableProgress } from './delivery-primitives'

const tabs = ['Overview','Framework','Delivery'] as const

// Everything on this screen comes from public.projects. The page resolves the
// record and 404s on a miss; nothing here falls back to another project, and
// nothing the database does not hold is rendered as a value -- an absent field
// arrives as '—'.
//
// Three tabs, all real: Overview and Framework read the project record itself,
// Delivery reads and writes the project's delivery-item hierarchy. Nothing
// here claims a register that has no table behind it.
export type ProjectDetail = {
  id: string
  name: string
  framework: string
  phase: string
  client: string
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  owner: string
  status: string
  health: string
  progress: number
  nextGate: string
  dueDate: string
  notes: string
  updated: string
  archived: boolean
}

export function ProjectDetailScreen({ project, items, labels }: { project: ProjectDetail; items: DeliveryItemNode[]; labels: { level1Label: string | null; level2Label: string | null } }) {
  const [activeTab,setActiveTab]=useState<(typeof tabs)[number]>('Overview')
  const [confirmArchive,setConfirmArchive]=useState(false)
  const archiveFormRef=useRef<HTMLFormElement>(null)
  // The archive action refuses on a wrong, foreign or already-archived id. That
  // refusal used to return silently, leaving the user on this page with no
  // message and no state change after they had confirmed an irreversible
  // action. useActionState gives it a return channel, as create and update have.
  const [archiveState,archiveAction]=useActionState(archiveProjectAction,undefined)
  const description=project.client==='—'?`${project.framework} framework`:`${project.framework} framework · ${project.client}`
  return <><WorkspaceHeader category="Delivery" parent={{label:'Projects',href:'/operations/projects'}} title={project.name} description={description}/><div className="-mt-2 mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/operations/projects" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ArrowLeft className="size-4"/>Back to Projects</Link><div className="flex items-center gap-2"><HealthBadge>{project.archived?'Archived':project.health}</HealthBadge>{!project.archived?<><Link href={`/operations/projects/${project.id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold"><Pencil className="size-3.5"/>Edit project</Link><form ref={archiveFormRef} action={archiveAction}><input type="hidden" name="id" value={project.id}/></form><button type="button" onClick={()=>setConfirmArchive(true)} className="h-9 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive">Archive project</button></>:null}</div></div>{archiveState?.error?<p role="alert" className="-mt-2 mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{archiveState.error}</p>:null}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8"><MetricCard label="Current Phase" value={project.phase} detail="Applied framework phase"/><MetricCard label="Health" value={project.health} detail="Recorded on the project"/><MetricCard label="Status" value={project.status} detail="Lifecycle status"/><MetricCard label="Progress" value={`${project.progress}%`} detail="Recorded progress"/><MetricCard label="Next Gate" value={project.nextGate} detail="Recorded on the project"/><MetricCard label="Due Date" value={project.dueDate} detail="Recorded on the project"/><MetricCard label="Client" value={project.client} detail={project.client==='—'?'Internal change work':'Delivered for'}/><MetricCard label="Owner" value={project.owner} detail="Accountable for delivery"/></div><nav className="mt-5 flex gap-8 border-b border-border" aria-label="Project workspace tabs">{tabs.map((tab)=><button type="button" key={tab} onClick={()=>setActiveTab(tab)} className={`border-b-2 px-1 py-3 text-sm font-semibold ${activeTab===tab?'border-brand text-brand':'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab}</button>)}</nav><div className="mt-5">{activeTab==='Overview'?<ProjectOverview project={project}/>:activeTab==='Framework'?<FrameworkWorkspace project={project}/>:<DeliveryItemsPanel projectId={project.id} items={items} labels={labels}/>}</div><ConfirmationDialog open={confirmArchive} title="Archive project?" description={`${project.name} will be archived and removed from the active projects register. There is no way to restore it from this screen once confirmed.`} confirmLabel="Archive project" onCancel={()=>setConfirmArchive(false)} onConfirm={()=>{setConfirmArchive(false);archiveFormRef.current?.requestSubmit()}}/></>
}

function ProjectOverview({project}:{project:ProjectDetail}){return <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><SectionCard title="Project record" description="The governed project as it is stored."><dl className="divide-y divide-border">{[
  ['Owner',project.owner],['Client',project.client],['Framework',project.framework],['Current phase',project.phase],['Lifecycle status',project.status],['Next gate',project.nextGate],['Due date',project.dueDate],['Last updated',project.updated],
].map(([label,value])=><div key={label} className="flex items-start justify-between gap-4 px-5 py-3"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}<div className="flex items-center justify-between gap-4 px-5 py-3"><dt className="text-xs font-medium text-muted-foreground">Progress</dt><dd><TableProgress value={project.progress}/></dd></div><div className="px-5 py-3"><dt className="text-xs font-medium text-muted-foreground">Notes</dt><dd className="mt-1 text-sm whitespace-pre-line">{project.notes}</dd></div></dl></SectionCard><SectionCard title="What this project tracks" description="The whole surface, not a preview of it."><div className="p-5 text-sm leading-6 text-muted-foreground"><p>This project record, its applied framework, and its delivery items are what UNISON tracks here today. There is no separate register for workstreams, requirements, risks, decisions, governance or benefits — those do not exist as tables yet, so they are not offered as tabs.</p><p className="mt-3">Health, progress, gate and date figures shown here are the values held on the project record itself — nothing on this page is estimated or derived.</p></div></SectionCard></div>}

// The Framework tab used to carry Phases / Gates / Required artefacts tiles
// and a Framework alignment card. Phases, Gates and Required artefacts were
// all '—' -- no gates or artefacts table exists at all, and phase count was
// never wired up -- and alignment was a permanent '—' with a disclaimer. That
// is the "disabled tab is the same unbacked claim in a duller colour" shape
// the spec calls out by name, so all four were removed rather than dressed up.
// What survives is the two fields the project record actually holds: the
// framework's name and the project's current phase.
function FrameworkWorkspace({project}:{project:ProjectDetail}){return <SectionCard title="Applied framework" description="The delivery framework this project is governed by."><div className="p-5"><h3 className="font-semibold">{project.framework}</h3><p className="mt-1 text-sm text-muted-foreground">Current phase · {project.phase}</p></div></SectionCard>}
