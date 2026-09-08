'use client'

import { useActionState, useEffect, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { fieldClasses, FieldLabel } from '@/components/ui/form-fields'
import { FormError, FormFooter, FormSection } from '@/components/ui/form-layout'
import type { OrganizationProfileActionState } from '@/features/organizations/actions/update-organization-profile'

type UpdateOrganizationAction = (previousState: OrganizationProfileActionState, formData: FormData) => Promise<OrganizationProfileActionState>

export function OrganizationProfileEditForm({ name, action }: { name: string; action: UpdateOrganizationAction }) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty || pending) return
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty, pending])

  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Organisation Profile', href: '/settings' }}
        title="Edit organisation"
        description="Update the organisation information currently supported by UNISON."
      />

      <form action={formAction} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)} className="mx-auto max-w-4xl space-y-5">
        <FormSection
          title="Organisation details"
          description="The organisation name is shown throughout this workspace and in the organisation switcher."
          columns={1}
        >
          <label className="block">
            <FieldLabel label="Organisation name" required />
            <input
              name="name"
              required
              defaultValue={name}
              aria-invalid={Boolean(state?.fieldErrors?.name)}
              aria-describedby={state?.fieldErrors?.name ? 'organisation-name-error' : undefined}
              className={fieldClasses}
            />
            {state?.fieldErrors?.name?.[0] ? (
              <span id="organisation-name-error" role="alert" className="mt-1.5 block text-xs text-destructive">
                {state.fieldErrors.name[0]}
              </span>
            ) : null}
          </label>
        </FormSection>

        <FormError message={state?.error} />
        <FormFooter cancelHref="/settings" submitLabel="Save changes" pending={pending} />
      </form>
    </>
  )
}
