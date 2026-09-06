'use client'

import { Archive, ArrowLeft, Pencil, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { setFrameworkArchivedAction } from '@/features/delivery/actions/set-framework-archived'
import type { FrameworkDetail, FrameworkProject } from '@/features/delivery/queries/get-framework'
import { HealthBadge, SectionCard } from './delivery-primitives'
import { FrameworkPhaseEditor } from './framework-phase-editor'

const tabs = ['Overview', 'Phases', 'Projects'] as const

// Everything on this screen comes from public.frameworks, public.framework_phases
// and public.projects. The route resolves the record and 404s on a miss; nothing
// here falls back to another framework, and nothing the database does not hold is
// rendered as a value. Workstreams, Artefacts, Roles, Controls and Versions had no
// tables behind them and are gone, along with the fabricated framework code,
// invented version history and invented project list that used to live here.
export function FrameworkDetailScreen({ framework }: { framework: FrameworkDetail }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [archiveState, archiveAction] = useActionState(setFrameworkArchivedAction, undefined)

  const archived = framework.archivedAt !== null
  const description = [framework.type, framework.version].filter(Boolean).join(' · ') || undefined

  return <>
    <WorkspaceHeader category="Delivery" parent={{ label: 'Frameworks', href: '/delivery/frameworks' }} title={framework.name} description={description} />
    <div className="-mt-2 mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/delivery/frameworks" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ArrowLeft className="size-4" />Back to Frameworks</Link>
      <div className="flex items-center gap-2">
        {/* Duplicates the Overview tab's Status row on purpose, same as
            project-detail-screen.tsx's header badge next to its own archive
            control: the person reaching for Archive/Restore should see current
            state without switching tabs first. */}
        <HealthBadge>{archived ? 'Archived' : 'Active'}</HealthBadge>
        <Link href={`/delivery/frameworks/${framework.id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold"><Pencil className="size-3.5" />Edit framework</Link>
        <form ref={formRef} action={archiveAction}>
          <input type="hidden" name="id" value={framework.id} />
          <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
        </form>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={archived
            ? 'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold'
            : 'inline-flex h-9 items-center gap-2 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive'}
        >
          {archived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
          {archived ? 'Restore framework' : 'Archive framework'}
        </button>
      </div>
    </div>
    {archiveState?.error ? <p role="alert" className="-mt-2 mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{archiveState.error}</p> : null}
    <nav className="mt-1 flex gap-1 overflow-x-auto border-b border-border" aria-label="Framework workspace tabs">
      {tabs.map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${tab === item ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{item}</button>)}
    </nav>
    <div className="mt-5">
      {tab === 'Overview' ? <Overview framework={framework} /> : tab === 'Phases' ? <FrameworkPhaseEditor frameworkId={framework.id} phases={framework.phases} /> : <ProjectsTab projects={framework.projects} />}
    </div>
    <ConfirmationDialog
      open={confirmOpen}
      title={archived ? 'Restore framework?' : 'Archive framework?'}
      description={archived
        ? `${framework.name} will be available for new projects again.`
        : `${framework.name} will no longer be available for new projects. Existing projects keep this framework and are unaffected.`}
      confirmLabel={archived ? 'Restore framework' : 'Archive framework'}
      onCancel={() => setConfirmOpen(false)}
      onConfirm={() => { setConfirmOpen(false); formRef.current?.requestSubmit() }}
    />
  </>
}

function Overview({ framework }: { framework: FrameworkDetail }) {
  const activePhaseCount = framework.phases.filter((phase) => phase.archivedAt === null).length
  const rows: Array<[string, string]> = [
    ['Name', framework.name],
    ['Type', framework.type ?? '—'],
    ['Version', framework.version ?? '—'],
    ['Phases', String(activePhaseCount)],
    ['Projects', String(framework.projects.length)],
    ['Status', framework.archivedAt ? 'Archived' : 'Active'],
  ]
  return <SectionCard title="Framework details" description="The framework as it is stored.">
    <dl className="divide-y divide-border">
      {rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 px-5 py-3"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}
    </dl>
  </SectionCard>
}

function ProjectsTab({ projects }: { projects: FrameworkProject[] }) {
  return <SectionCard title="Projects" description="Projects currently governed by this framework.">
    {projects.length === 0 ? (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <h3 className="font-semibold">No projects yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">No projects are governed by this framework yet.</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {['Project', 'Status', 'Health', 'Phase'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-t border-border hover:bg-muted/25">
                <td className="px-4 py-3.5"><Link href={`/operations/projects/${project.id}`} className="text-sm font-semibold text-foreground hover:text-brand">{project.name}</Link></td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">{project.status}</td>
                <td className="px-4 py-3.5 text-xs"><HealthBadge>{project.health}</HealthBadge></td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground">{project.phase ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </SectionCard>
}
