'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { EntitySelectField, FieldLabel, SelectField, TextAreaField, TextField, fieldClasses } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import { createProjectDependencyAction } from '../actions/create-project-dependency'
import { deleteProjectDependencyAction } from '../actions/delete-project-dependency'
import type { DependencyStatus } from '../dependency-status'
import type { listDependencyFormOptions } from '../queries/list-dependency-form-options'
import type { DependencyRow } from '../queries/list-project-dependencies'
// Imported, not redeclared: this is the same vocabulary
// project_dependencies_required_status_check and
// project_dependencies_criticality_check enforce in the database. Copying it
// here would let the form drift from what the schema and database accept.
import { DEPENDENCY_CRITICALITIES, DEPENDENCY_REQUIRED_STATUSES } from '../schemas/project-dependency'
import { SectionCard } from './delivery-primitives'

type DependencyFormOptions = Awaited<ReturnType<typeof listDependencyFormOptions>>

const dependencyTone: Record<DependencyStatus, string> = {
  Blocked: 'border-destructive/40 bg-destructive/5 text-destructive',
  'At Risk': 'border-amber-500/40 bg-amber-500/5 text-amber-700',
  Pending: 'border-border bg-muted text-muted-foreground',
  Satisfied: 'border-emerald-600/40 bg-emerald-600/5 text-emerald-700',
}

function DependencyStatusBadge({ status }: { status: DependencyStatus }) {
  return <span className={`inline-flex items-center rounded-none border px-2 py-0.5 text-xs font-medium ${dependencyTone[status]}`}>{status}</span>
}

/**
 * The Dependencies tab: both directions of a project's dependency edges.
 *
 * "This project depends on" is the risk this project carries, and is
 * editable from here -- it is this project's own record. "Projects that
 * depend on this" is the risk this project creates for others, and is
 * read-only: a dependency is owned by the project that declares it, so
 * removing it from the far end would be editing another project's record
 * from this page.
 */
export function ProjectDependenciesPanel({
  projectId,
  dependsOn,
  dependedOnBy,
}: {
  projectId: string
  dependsOn: DependencyRow[]
  dependedOnBy: DependencyRow[]
}) {
  return (
    <div className="grid gap-5">
      <SectionCard
        title="This project depends on"
        description="Other projects that must reach a required state before this one can proceed."
        action={
          <Link href={`/operations/projects/${projectId}/dependencies/new`} className="inline-flex h-9 items-center bg-foreground px-3 text-xs font-semibold text-primary-foreground">
            Add prerequisite
          </Link>
        }
      >
        {dependsOn.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">This project has no recorded prerequisites.</p>
          </div>
        ) : (
          <DependsOnTable rows={dependsOn} projectId={projectId} />
        )}
      </SectionCard>

      <SectionCard
        title="Projects that depend on this"
        description="Other projects waiting on this one. Owned by those projects, so shown here read-only."
      >
        {dependedOnBy.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">No other project depends on this one.</p>
          </div>
        ) : (
          <DependedOnByTable rows={dependedOnBy} />
        )}
      </SectionCard>
    </div>
  )
}

function DependsOnTable({ rows, projectId }: { rows: DependencyRow[]; projectId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left">
        <thead><tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {['Prerequisite', 'Required state', 'Status', 'Owner', 'Required by', 'Criticality', ''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <DependsOnRow key={row.id} row={row} projectId={projectId} />)}</tbody>
      </table>
    </div>
  )
}

function DependsOnRow({ row, projectId }: { row: DependencyRow; projectId: string }) {
  const [state, action] = useActionState(deleteProjectDependencyAction, undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <Link href={`/operations/projects/${row.projectId}`} className="text-sm font-semibold text-foreground hover:text-brand">{row.projectName}</Link>
        {/* The note is the user's own words about why the dependency exists.
            Captured on the add form and stored, so it must be readable back --
            a field rendered nowhere is a capability the product only claims. */}
        {row.notes ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.notes}</p> : null}
      </td>
      <td className="px-4 py-3 text-xs">{row.requiredState}</td>
      <td className="px-4 py-3 align-top">
        <DependencyStatusBadge status={row.status} />
        {/* Requirement §3: the reason for a non-satisfied state must be visible.
            A badge alone is what that section explicitly refuses, so this <p> is
            not decoration -- it is the requirement. */}
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.reason}</p>
      </td>
      <td className="px-4 py-3 text-xs">{row.owner}</td>
      <td className="px-4 py-3 text-xs whitespace-nowrap">{row.requiredByDate ?? '—'}</td>
      <td className="px-4 py-3 text-xs">{row.criticality}</td>
      <td className="px-4 py-3">
        <form ref={formRef} action={action}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="projectId" value={projectId} />
        </form>
        <button type="button" onClick={() => setConfirmOpen(true)} className="h-8 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive">Remove</button>
        {state?.error ? <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p> : null}
        <ConfirmationDialog
          open={confirmOpen}
          title="Remove this prerequisite?"
          description={`${row.projectName} will no longer be required before this project can proceed. This cannot be undone.`}
          confirmLabel="Remove"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); formRef.current?.requestSubmit() }}
        />
      </td>
    </tr>
  )
}

function DependedOnByTable({ rows }: { rows: DependencyRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left">
        <thead><tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {['Project', 'Required state', 'Status', 'Owner', 'Required by', 'Criticality'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.id} className="border-t border-border align-top">
            <td className="px-4 py-3">
              <Link href={`/operations/projects/${row.projectId}`} className="text-sm font-semibold text-foreground hover:text-brand">{row.projectName}</Link>
              {/* This is the case that matters most: a PM reading another
                  team's note about why THEIR project is a prerequisite here. */}
              {row.notes ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.notes}</p> : null}
            </td>
            <td className="px-4 py-3 text-xs">{row.requiredState}</td>
            <td className="px-4 py-3 align-top">
              <DependencyStatusBadge status={row.status} />
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.reason}</p>
            </td>
            <td className="px-4 py-3 text-xs">{row.owner}</td>
            <td className="px-4 py-3 text-xs whitespace-nowrap">{row.requiredByDate ?? '—'}</td>
            <td className="px-4 py-3 text-xs">{row.criticality}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

/**
 * The required-state select is one control, because the database enforces
 * exactly-one (project_dependencies_required_state_check) and two controls
 * would let a user express "both" or "neither". Its options are built from
 * the chosen prerequisite's framework, the same way ProjectForm re-filters
 * phases when the framework changes -- the database refuses a phase from
 * another framework anyway (project_dependencies_phase_fkey); this stops the
 * user being offered one in the first place. The selected required state is
 * reset whenever the prerequisite changes, since a phase from the previous
 * prerequisite's framework would otherwise stay selected and be refused on
 * submit with no explanation the user can act on.
 */
export function AddDependencyForm({
  projectId,
  options,
  onCancel,
  onSaved,
  cancelHref,
}: {
  projectId: string
  options: DependencyFormOptions
  onCancel?: () => void
  onSaved?: () => void
  cancelHref?: string
}) {
  const [state, formAction, pending] = useActionState(createProjectDependencyAction.bind(null, projectId), undefined)
  const router = useRouter()
  const [prerequisiteId, setPrerequisiteId] = useState('')
  const [requiredState, setRequiredState] = useState('')

  useEffect(() => {
    if (state && !state.error) {
      if (onSaved) onSaved()
      else if (cancelHref) router.push(cancelHref)
    }
  }, [state, onSaved, cancelHref, router])

  // A single-project organisation has no other project to depend on. An
  // empty select is a dead control, so the form says so instead of offering
  // one.
  if (options.projects.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">There are no other projects in this organisation to depend on.</p>
        <div className="flex justify-end">
          {onCancel ? <button type="button" onClick={onCancel} className="border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Close</button> : cancelHref ? <Link href={cancelHref} className="inline-flex items-center border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Close</Link> : null}
        </div>
      </div>
    )
  }

  const prerequisite = options.projects.find((project) => project.id === prerequisiteId)
  const phaseOptions = prerequisite
    ? options.phases.filter((phase) => phase.frameworkId === prerequisite.frameworkId)
    : []

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <FieldLabel label="Prerequisite project" required />
        <select
          name="prerequisiteProjectId"
          required
          value={prerequisiteId}
          onChange={(event) => { setPrerequisiteId(event.target.value); setRequiredState('') }}
          className={fieldClasses}
        >
          <option value="">Choose a project</option>
          {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <label className="block">
        <FieldLabel label="Required state" required />
        <select
          name="requiredState"
          required
          value={requiredState}
          onChange={(event) => setRequiredState(event.target.value)}
          className={fieldClasses}
        >
          <option value="">Choose a required state</option>
          {DEPENDENCY_REQUIRED_STATUSES.map((status) => (
            <option key={status} value={`status:${status}`}>{status === 'Active' ? 'Has started' : 'Is complete'}</option>
          ))}
          {phaseOptions.map((phase) => (
            <option key={phase.id} value={`phase:${phase.id}`}>{`Has reached ${phase.name}`}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="criticality" label="Criticality" options={DEPENDENCY_CRITICALITIES} defaultValue={DEPENDENCY_CRITICALITIES[0]} />
        <EntitySelectField name="dependencyOwnerId" label="Dependency owner" options={options.members} emptyLabel="Unassigned" />
        <TextField name="requiredByDate" label="Required by" type="date" />
      </div>
      <TextAreaField name="notes" label="Notes" rows={3} />
      <FormError message={state?.error} />
      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? <button type="button" onClick={onCancel} className="border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button> : cancelHref ? <Link href={cancelHref} className="inline-flex items-center border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</Link> : null}
        <button type="submit" disabled={pending} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {pending ? 'Adding…' : 'Add prerequisite'}
        </button>
      </div>
    </form>
  )
}
