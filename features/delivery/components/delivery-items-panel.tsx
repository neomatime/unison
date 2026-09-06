'use client'

import { useActionState, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { setDeliveryItemArchivedAction } from '../actions/set-delivery-item-archived'
import type { DeliveryItem, DeliveryItemNode } from '../queries/list-delivery-items'
import { levelLabel } from '../schemas/framework'
import { SectionCard } from './delivery-primitives'

type FrameworkLabels = { level1Label: string | null; level2Label: string | null }

/**
 * The Delivery tab: a project's two-level delivery-item hierarchy.
 *
 * Deliberately narrower than the full plan's brief for this screen. Add and
 * Edit controls are not rendered -- the create/edit form (Task 6's
 * delivery-item-form.tsx) does not exist yet, and this task's own interface
 * list never names createDeliveryItemAction or updateDeliveryItemAction as
 * something it consumes. A button with no form behind it is exactly the
 * unbacked claim the project's own rule warns against, so it is left out
 * rather than wired to nothing. Archive/Restore is included in full: it is
 * explicitly in this task's interface list and setDeliveryItemArchivedAction
 * already works end to end.
 */
export function DeliveryItemsPanel({ projectId, items, labels }: { projectId: string; items: DeliveryItemNode[]; labels: FrameworkLabels }) {
  const level1Label = levelLabel(1, labels)
  const level2Label = levelLabel(2, labels)

  return (
    <SectionCard title="Delivery items" description={`${level1Label} and ${level2Label} records tracked against this project.`}>
      {items.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
          <h3 className="font-semibold">No delivery items yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">No delivery items are recorded for this project yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id}>
              {/* The top-level array can hold a level-1 parent or a live
                  level-2 item whose parent was archived (see parentArchived
                  below) -- the kicker reads the item's own level rather than
                  assuming every top-level row is level 1. */}
              <DeliveryItemRow item={item} projectId={projectId} kicker={levelLabel(item.level, labels)} />
              {item.children.length > 0 ? (
                <div className="divide-y divide-border border-t border-border bg-muted/20 pl-6">
                  {item.children.map((child) => (
                    <DeliveryItemRow key={child.id} item={child} projectId={projectId} kicker={level2Label} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/**
 * One row, built from the single item object rather than positional cells.
 * The detail below the header is a stack of label/value sections rather than
 * a fixed grid, so a later "why / impact" line is one more entry in the
 * array rather than a layout re-cut.
 */
function DeliveryItemRow({ item, projectId, kicker }: { item: DeliveryItem; projectId: string; kicker: string }) {
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
          <h3 className="mt-0.5 text-sm font-semibold text-foreground">{item.name}</h3>
          {/* Same shape as the phase qualifier above: a muted line beneath the
              row's own primary value (its name here, since there is no parent
              name in the six required fields to attach it to). A recorded
              state, not an error. */}
          {item.parentArchived ? <p className="mt-0.5 text-xs text-muted-foreground">Its parent item is archived</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form ref={formRef} action={action}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
          </form>
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
          description="It will be archived and hidden from the active hierarchy. Any live items beneath it must be archived or moved first."
          confirmLabel="Archive"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); formRef.current?.requestSubmit() }}
        />
      ) : null}
    </article>
  )
}
