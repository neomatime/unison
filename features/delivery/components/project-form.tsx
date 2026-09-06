'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { EntitySelectField, fieldClasses, FieldLabel, SelectField, TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError, FormFooter, FormSection } from '@/components/ui/form-layout'
import type { ProjectFormOptions } from '../queries/list-project-form-options'
// Imported, not redeclared: these are the same arrays projectInputSchema builds
// its enums from, so the form cannot offer a value the schema or
// projects_status_check would reject. Copying them here would let them drift.
import { PROJECT_HEALTHS, PROJECT_STATUSES } from '../schemas/project'

type ActionState = { error?: string } | undefined
type ProjectFormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

export type ProjectFormValues = {
  id: string
  name: string
  framework_id: string | null
  phase_id: string | null
  client_id: string | null
  owner_id: string | null
  status: string
  health: string
  progress: number
  next_gate: string | null
  due_date: string | null
  notes: string | null
}

export function ProjectForm({
  mode,
  project,
  action,
  options,
}: {
  mode: 'create' | 'edit'
  project?: ProjectFormValues
  action: ProjectFormAction
  options: ProjectFormOptions
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  // The phase list depends on the chosen framework, and the composite key
  // (framework_id, phase_id) means a phase from another framework is refused by
  // the database. Filtering here keeps that impossible to attempt.
  const [frameworkId, setFrameworkId] = useState(project?.framework_id ?? '')
  const phases = options.phases.filter((phase) => phase.frameworkId === frameworkId)
  const backHref = project ? `/operations/projects/${project.id}` : '/operations/projects'

  return <>
    <WorkspaceHeader
      category="Delivery"
      parent={{ label: 'Projects', href: '/operations/projects' }}
      title={mode === 'create' ? 'New Project' : `Edit ${project?.name ?? 'Project'}`}
      description={mode === 'create' ? 'Create a governed delivery project.' : 'Update this project’s record.'}
    />
    <Link href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
      Back to {project ? project.name : 'Projects'}
    </Link>

    <form action={formAction} className="mx-auto max-w-5xl space-y-5">
      <FormSection title="Project" description="What is being delivered, and under which framework.">
        <TextField name="name" label="Project name" required defaultValue={project?.name} />
        {/* Inline rather than an EntitySelectField because this is the one
            controlled select on the form — the phase list filters on it. It now
            borrows FieldLabel and fieldClasses from form-fields rather than
            restating them, so it cannot drift the next time fields are
            restyled. */}
        <label className="block">
          <FieldLabel label="Delivery framework" required />
          <select
            name="frameworkId"
            required
            value={frameworkId}
            onChange={(event) => setFrameworkId(event.target.value)}
            className={fieldClasses}
          >
            <option value="">Select a framework</option>
            {options.frameworks.map((framework) => (
              <option key={framework.id} value={framework.id}>{framework.name}</option>
            ))}
          </select>
        </label>
        <EntitySelectField
          name="phaseId"
          label="Current phase"
          options={phases}
          defaultValue={project?.phase_id}
          emptyLabel={frameworkId ? 'Not started' : 'Choose a framework first'}
        />
      </FormSection>

      <FormSection title="Accountability" description="Who owns delivery, and for whom.">
        <EntitySelectField
          name="ownerId"
          label="Project owner"
          options={options.members}
          defaultValue={project?.owner_id}
          emptyLabel="Unassigned"
        />
        <EntitySelectField
          name="clientId"
          label="Client"
          options={options.clients}
          defaultValue={project?.client_id}
          emptyLabel="Internal change"
        />
      </FormSection>

      <FormSection title="Delivery state" description="Where this project currently stands.">
        <SelectField name="status" label="Status" options={PROJECT_STATUSES} defaultValue={project?.status ?? 'Active'} />
        <SelectField name="health" label="Health" options={PROJECT_HEALTHS} defaultValue={project?.health ?? 'On Track'} />
        <TextField name="progress" label="Progress (%)" type="number" defaultValue={String(project?.progress ?? 0)} />
        <TextField name="nextGate" label="Next gate" defaultValue={project?.next_gate} />
        <TextField name="dueDate" label="Due date" type="date" defaultValue={project?.due_date} />
      </FormSection>

      <FormSection title="Notes" description="Context for the delivery team.">
        <TextAreaField name="notes" label="Notes" defaultValue={project?.notes} className="md:col-span-2" />
      </FormSection>

      <FormError message={state?.error} />
      <FormFooter
        cancelHref={backHref}
        submitLabel={mode === 'create' ? 'Create project' : 'Save changes'}
        pending={pending}
      />
    </form>
  </>
}
