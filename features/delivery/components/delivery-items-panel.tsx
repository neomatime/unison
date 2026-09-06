'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { cn } from '@/lib/utils'
import { createDeliveryItemAction } from '../actions/create-delivery-item'
import { getDeliveryItemFormOptionsAction } from '../actions/get-delivery-item-form-options'
import { setDeliveryItemArchivedAction } from '../actions/set-delivery-item-archived'
import { updateDeliveryItemAction } from '../actions/update-delivery-item'
import { DeliveryItemForm } from './delivery-item-form'
import type { DeliveryItemFormOptions } from '../queries/list-project-form-options'
import type { DeliveryItem, DeliveryItemNode } from '../queries/list-delivery-items'
import { levelLabel } from '../schemas/framework'
import { SectionCard } from './delivery-primitives'

type FrameworkLabels = { level1Label: string | null; level2Label: string | null }

/**
 * What is open: which level and parent a create targets, or which item an
 * edit targets, plus the picker options fetched for that specific case.
 * `options` is fetched at the moment the dialog opens rather than once for
 * the whole panel, because retention is per item — see
 * getDeliveryItemFormOptionsAction.
 */
type DialogState =
  | { mode: 'create'; level: 1 | 2; parentId: string | null; title: string; options: DeliveryItemFormOptions }
  | { mode: 'edit'; level: 1 | 2; parentId: string | null; item: DeliveryItem; title: string; options: DeliveryItemFormOptions }

/**
 * The Delivery tab: a project's two-level delivery-item hierarchy.
 *
 * Add and Edit are real controls now: each opens DeliveryItemForm in a
 * dialog, bound to createDeliveryItemAction or updateDeliveryItemAction.
 * "Add {level-2 label}" lives on a level-1 row rather than beside a parent
 * picker -- the parent is implicit in which row's button was clicked, which
 * is the other half (with the hidden level/parentId inputs on the form
 * itself) of never offering a third level. Archive/Restore is unchanged from
 * the previous task. Archived items are rendered, muted, alongside live ones
 * (see assembleDeliveryItemTree), so Restore has a real row to act on rather
 * than being dead code behind an item the tree never returns.
 */
export function DeliveryItemsPanel({ projectId, items, labels }: { projectId: string; items: DeliveryItemNode[]; labels: FrameworkLabels }) {
  const level1Label = levelLabel(1, labels)
  const level2Label = levelLabel(2, labels)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate(level: 1 | 2, parentId: string | null, title: string) {
    setOptionsError(null)
    startTransition(async () => {
      try {
        const options = await getDeliveryItemFormOptionsAction(projectId)
        setDialog({ mode: 'create', level, parentId, title, options })
      } catch {
        setOptionsError('The form could not be opened. Try again.')
      }
    })
  }

  function openEdit(item: DeliveryItem, level: 1 | 2, parentId: string | null) {
    setOptionsError(null)
    startTransition(async () => {
      try {
        const options = await getDeliveryItemFormOptionsAction(projectId, { ownerId: item.ownerId, phaseId: item.currentPhaseId })
        setDialog({ mode: 'edit', level, parentId, item, title: `Edit ${item.name}`, options })
      } catch {
        setOptionsError('The form could not be opened. Try again.')
      }
    })
  }

  return (
    <SectionCard
      title="Delivery items"
      description={`${level1Label} and ${level2Label} records tracked against this project.`}
      action={
        <button
          type="button"
          disabled={isPending}
          onClick={() => openCreate(1, null, `Add ${level1Label}`)}
          className="h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          Add {level1Label}
        </button>
      }
    >
      {optionsError ? <p role="alert" className="mx-5 mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{optionsError}</p> : null}
      {items.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
          <h3 className="font-semibold">No delivery items yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">No delivery items are recorded for this project yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id}>
              {/* Every top-level entry is a level-1 item, archived or not --
                  an archived parent is rendered with its children beneath it
                  like any other parent, rather than being dropped in favour
                  of promoting the children to the top level. */}
              <DeliveryItemRow
                item={item}
                projectId={projectId}
                kicker={level1Label}
                addChildLabel={!item.archivedAt ? `Add ${level2Label}` : undefined}
                onAddChild={() => openCreate(2, item.id, `Add ${level2Label}`)}
                onEdit={() => openEdit(item, 1, null)}
                editDisabled={isPending}
              />
              {item.children.length > 0 ? (
                <div className="divide-y divide-border border-t border-border bg-muted/20 pl-6">
                  {item.children.map((child) => (
                    <DeliveryItemRow
                      key={child.id}
                      item={child}
                      projectId={projectId}
                      kicker={level2Label}
                      onEdit={() => openEdit(child, 2, item.id)}
                      editDisabled={isPending}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {dialog ? createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/30 p-4 py-10" role="presentation" onMouseDown={() => setDialog(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-item-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <h2 id="delivery-item-dialog-title" className="text-lg font-semibold text-foreground">{dialog.title}</h2>
            <div className="mt-4">
              <DeliveryItemForm
                mode={dialog.mode}
                level={dialog.level}
                parentId={dialog.parentId}
                item={dialog.mode === 'edit' ? {
                  name: dialog.item.name,
                  description: dialog.item.description,
                  ownerId: dialog.item.ownerId,
                  status: dialog.item.status,
                  health: dialog.item.health,
                  currentPhaseId: dialog.item.currentPhaseId,
                  startDate: dialog.item.startDate,
                  targetDate: dialog.item.targetDate,
                } : undefined}
                options={dialog.options}
                action={dialog.mode === 'create'
                  ? createDeliveryItemAction.bind(null, projectId)
                  : updateDeliveryItemAction.bind(null, dialog.item.id, projectId)}
                onCancel={() => setDialog(null)}
                onSaved={() => setDialog(null)}
              />
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </SectionCard>
  )
}

/**
 * One row, built from the single item object rather than positional cells.
 * The detail below the header is a stack of label/value sections rather than
 * a fixed grid, so a later "why / impact" line is one more entry in the
 * array rather than a layout re-cut.
 */
function DeliveryItemRow({
  item,
  projectId,
  kicker,
  addChildLabel,
  onAddChild,
  onEdit,
  editDisabled,
}: {
  item: DeliveryItem
  projectId: string
  kicker: string
  /** Present only on a level-1 row -- a level-2 item cannot itself be a parent. */
  addChildLabel?: string
  onAddChild?: () => void
  onEdit: () => void
  editDisabled?: boolean
}) {
  const archived = item.archivedAt !== null
  const [state, action] = useActionState(setDeliveryItemArchivedAction, undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const sections: Array<[string, ReactNode]> = [
    ['Owner', item.ownerName],
    ['Status', item.status],
    ['Health', item.health],
    [
      'Current phase',
      <>
        {item.phaseName ?? '—'}
        {/* A legitimate recorded state, not an error -- muted secondary text
            beneath the primary value, never a badge or warning colour. */}
        {item.phaseArchived ? <span className="mt-0.5 block text-xs text-muted-foreground">Archived in framework</span> : null}
      </>,
    ],
    ['Target date', item.targetDate ?? '—'],
  ]

  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{kicker}</p>
          <h3 className={cn('mt-0.5 text-sm font-semibold', archived ? 'text-muted-foreground' : 'text-foreground')}>{item.name}</h3>
          {/* Same "primary value, muted qualifier beneath" shape as the phase
              qualifier below: a recorded state, not an error, so no badge and
              no warning colour -- just the name itself in muted text with a
              muted second line naming the state. */}
          {archived ? <p className="mt-0.5 text-xs text-muted-foreground">Archived</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form ref={formRef} action={action}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
          </form>
          {!archived && addChildLabel && onAddChild ? (
            <button type="button" onClick={onAddChild} disabled={editDisabled} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-60">
              {addChildLabel}
            </button>
          ) : null}
          <button type="button" onClick={onEdit} disabled={editDisabled} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-60">Edit</button>
          {archived ? (
            <button type="button" onClick={() => formRef.current?.requestSubmit()} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold">Restore</button>
          ) : (
            <button type="button" onClick={() => setConfirmOpen(true)} className="h-8 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive">Archive</button>
          )}
        </div>
      </div>
      {state?.error ? <p role="alert" className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{state.error}</p> : null}
      <dl className="mt-3 divide-y divide-border border-t border-border">
        {sections.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {!archived ? (
        <ConfirmationDialog
          open={confirmOpen}
          title={`Archive ${item.name}?`}
          description="It will be shown as archived, muted, with the rest of the hierarchy, and can be restored later. Any live items beneath it must be archived first."
          confirmLabel="Archive"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); formRef.current?.requestSubmit() }}
        />
      ) : null}
    </article>
  )
}
