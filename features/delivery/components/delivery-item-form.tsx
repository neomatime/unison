'use client'

import { useActionState, useEffect } from 'react'

import { EntitySelectField, SelectField, TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import type { DeliveryItemFormOptions } from '../queries/list-project-form-options'
// Imported, not redeclared: these are the same arrays deliveryItemInputSchema
// builds its enums from, and delivery_items_status_check /
// delivery_items_health_check its database constraints from. Copying them
// here would let the form drift from what the schema and database accept.
import { DELIVERY_ITEM_HEALTHS, DELIVERY_ITEM_STATUSES } from '../schemas/delivery-item'

type ActionState = { error?: string } | undefined
type DeliveryItemFormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

export type DeliveryItemFormValues = {
  name: string
  description: string | null
  ownerId: string | null
  status: string
  health: string
  currentPhaseId: string | null
  startDate: string | null
  targetDate: string | null
}

/**
 * Create and edit fields for one delivery item.
 *
 * `level` and `parentId` are hidden inputs, not controls: the caller supplies
 * both from where the user clicked (the panel head for a level-1 item, a
 * level-1 row's "Add" for a level-2 one, or the item itself when editing).
 * There is no level control and no parent picker anywhere in this form — that
 * is the UI half of the depth cap. The database makes a third level
 * unrepresentable (`delivery_items_parent_fkey`); this form makes it
 * unreachable.
 *
 * On edit, `level` and `parentId` are still submitted, because
 * `deliveryItemInputSchema`'s refinement needs both to validate, but
 * `updateDeliveryItemAction` ignores them — reparenting is not in this slice.
 */
export function DeliveryItemForm({
  mode,
  level,
  parentId,
  item,
  action,
  options,
  onCancel,
  onSaved,
}: {
  mode: 'create' | 'edit'
  level: 1 | 2
  parentId: string | null
  item?: DeliveryItemFormValues
  action: DeliveryItemFormAction
  options: DeliveryItemFormOptions
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, formAction, pending] = useActionState(action, undefined)

  // Closes the dialog on a successful save. `state` starts `undefined` and
  // only becomes an object once the action has returned, so this cannot fire
  // before a real submission — and it does not fire on a failed one, because
  // that response carries `error`.
  useEffect(() => {
    if (state && !state.error) onSaved()
  }, [state, onSaved])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="level" value={String(level)} />
      <input type="hidden" name="parentId" value={parentId ?? ''} />
      <TextField name="name" label="Name" required defaultValue={item?.name} />
      <TextAreaField name="description" label="Description" defaultValue={item?.description} rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <EntitySelectField name="ownerId" label="Owner" options={options.members} defaultValue={item?.ownerId} emptyLabel="Unassigned" />
        <EntitySelectField name="currentPhaseId" label="Current phase" options={options.phases} defaultValue={item?.currentPhaseId} emptyLabel="Not set" />
        <SelectField name="status" label="Status" options={DELIVERY_ITEM_STATUSES} defaultValue={item?.status ?? DELIVERY_ITEM_STATUSES[0]} />
        <SelectField name="health" label="Health" options={DELIVERY_ITEM_HEALTHS} defaultValue={item?.health ?? DELIVERY_ITEM_HEALTHS[0]} />
        <TextField name="startDate" label="Start date" type="date" defaultValue={item?.startDate} />
        <TextField name="targetDate" label="Target date" type="date" defaultValue={item?.targetDate} />
      </div>
      <FormError message={state?.error} />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {pending ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
