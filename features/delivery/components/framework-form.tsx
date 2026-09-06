'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { FieldLabel, SelectField, TextField } from '@/components/ui/form-fields'
import { FormError, FormFooter, FormSection } from '@/components/ui/form-layout'
import type { FrameworkDetail } from '../queries/get-framework'
// Imported, not redeclared: the same array frameworkInputSchema builds its
// enum from, so the form cannot offer a value the schema would reject.
import { FRAMEWORK_TYPES } from '../schemas/framework'

type ActionState = { error?: string } | undefined
type FrameworkFormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

export function FrameworkForm({
  mode,
  framework,
  action,
}: {
  mode: 'create' | 'edit'
  framework?: FrameworkDetail
  action: FrameworkFormAction
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const backHref = framework ? `/delivery/frameworks/${framework.id}` : '/delivery/frameworks'

  return <>
    <WorkspaceHeader
      category="Delivery"
      parent={{ label: 'Frameworks', href: '/delivery/frameworks' }}
      title={mode === 'create' ? 'New Framework' : `Edit ${framework?.name ?? 'Framework'}`}
      description={mode === 'create' ? 'Register a delivery methodology this organisation governs projects with.' : 'Update this framework’s record.'}
    />
    <Link href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
      Back to {framework ? framework.name : 'Frameworks'}
    </Link>

    <form action={formAction} className="mx-auto max-w-3xl space-y-5">
      <FormSection title="Framework" description="What this methodology is called, and what kind it is.">
        <TextField name="name" label="Framework name" required defaultValue={framework?.name} />
        <SelectField name="type" label="Type" options={FRAMEWORK_TYPES} defaultValue={framework?.type ?? FRAMEWORK_TYPES[0]} />
        {/* Read-only: a free-text version field with no version history behind
            it would be a claim this slice does not keep. On create there is no
            version yet, so the field is absent entirely rather than shown blank. */}
        {mode === 'edit' ? (
          <div className="block">
            <FieldLabel label="Version" />
            <p className="mt-1.5 flex min-h-11 items-center text-sm text-muted-foreground">{framework?.version ?? '—'}</p>
          </div>
        ) : null}
      </FormSection>

      <FormError message={state?.error} />
      <FormFooter
        cancelHref={backHref}
        submitLabel={mode === 'create' ? 'Create framework' : 'Save changes'}
        pending={pending}
      />
    </form>
  </>
}
