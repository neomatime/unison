'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useActionState, useRef, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { addFrameworkPhaseAction } from '../actions/add-framework-phase'
import { renameFrameworkPhaseAction } from '../actions/rename-framework-phase'
import { reorderFrameworkPhasesAction } from '../actions/reorder-framework-phases'
import { setPhaseArchivedAction } from '../actions/set-phase-archived'
import type { FrameworkPhase } from '../queries/get-framework'
import { SectionCard } from './delivery-primitives'

/**
 * Renders framework.phases in stored order and offers the four write paths a
 * framework's phase sequence supports: add, rename, archive/restore and
 * reorder. Buttons rather than drag-and-drop: a form post survives without
 * JavaScript, is trivially testable, and drag ordering would need a
 * client-side library for a list of eight rows.
 *
 * Move only ever reorders the active phases against each other -- see
 * reorder-framework-phases.ts's own comment on why the RPC refuses any
 * submission that is not exactly the framework's full phase set (SQLSTATE
 * 22023). An archived phase keeps its own slot in the stored order; only the
 * active phases move around it. The submission is built by walking the
 * phases in their current stored order: an archived slot contributes its own
 * id unchanged, an active slot contributes the next id off the newly
 * reordered active sequence. That way a Move never relocates an archived
 * phase to the tail of the list -- restoring it later drops it back into the
 * same gap it left, not onto the end.
 */
export function FrameworkPhaseEditor({ frameworkId, phases }: { frameworkId: string; phases: FrameworkPhase[] }) {
  const activePhases = phases.filter((phase) => phase.archivedAt === null)

  function idsForSwap(index: number, otherIndex: number): string[] {
    const reorderedActive = [...activePhases]
    ;[reorderedActive[index], reorderedActive[otherIndex]] = [reorderedActive[otherIndex], reorderedActive[index]]
    let cursor = 0
    return phases.map((phase) => (phase.archivedAt !== null ? phase.id : reorderedActive[cursor++].id))
  }

  return (
    <SectionCard title="Phases" description="The phases this framework's projects move through.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {['Phase', 'Projects', 'Order', ''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {phases.map((phase) => {
              const activeIndex = activePhases.findIndex((item) => item.id === phase.id)
              const isActive = activeIndex !== -1
              const moveUpIds = isActive && activeIndex > 0 ? idsForSwap(activeIndex, activeIndex - 1) : null
              const moveDownIds = isActive && activeIndex < activePhases.length - 1 ? idsForSwap(activeIndex, activeIndex + 1) : null
              return (
                <PhaseRow
                  key={phase.id}
                  phase={phase}
                  frameworkId={frameworkId}
                  isActive={isActive}
                  moveUpIds={moveUpIds}
                  moveDownIds={moveDownIds}
                />
              )
            })}
          </tbody>
        </table>
      </div>
      <AddPhaseForm frameworkId={frameworkId} />
    </SectionCard>
  )
}

function PhaseRow({
  phase,
  frameworkId,
  isActive,
  moveUpIds,
  moveDownIds,
}: {
  phase: FrameworkPhase
  frameworkId: string
  isActive: boolean
  moveUpIds: string[] | null
  moveDownIds: string[] | null
}) {
  const archived = phase.archivedAt !== null
  const [renameState, renameAction] = useActionState(renameFrameworkPhaseAction, undefined)
  const [archiveState, archiveAction] = useActionState(setPhaseArchivedAction, undefined)
  const [moveState, moveAction] = useActionState(reorderFrameworkPhasesAction, undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const archiveFormRef = useRef<HTMLFormElement>(null)

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3.5">
        <form action={renameAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={phase.id} />
          <input type="hidden" name="frameworkId" value={frameworkId} />
          <input
            name="name"
            defaultValue={phase.name}
            aria-label={`Rename ${phase.name}`}
            className="h-9 w-48 rounded-lg border border-border bg-card px-2.5 text-sm"
          />
          <button type="submit" className="h-9 shrink-0 rounded-lg border border-border px-2.5 text-xs font-semibold">Save</button>
        </form>
        {archived ? <span className="mt-1 inline-block text-xs font-medium text-muted-foreground">(archived)</span> : null}
        {renameState?.error ? <p role="alert" className="mt-1 text-xs text-destructive">{renameState.error}</p> : null}
      </td>
      <td className="px-4 py-3.5 text-sm">{phase.projectCount}</td>
      <td className="px-4 py-3.5">
        {isActive ? (
          <div className="flex items-center gap-1.5">
            <form action={moveAction}>
              <input type="hidden" name="frameworkId" value={frameworkId} />
              {(moveUpIds ?? []).map((id) => <input key={id} type="hidden" name="phaseIds" value={id} />)}
              <button type="submit" disabled={!moveUpIds} aria-label={`Move ${phase.name} up`} className="inline-flex size-8 items-center justify-center rounded-lg border border-border disabled:opacity-40">
                <ArrowUp className="size-3.5" />
              </button>
            </form>
            <form action={moveAction}>
              <input type="hidden" name="frameworkId" value={frameworkId} />
              {(moveDownIds ?? []).map((id) => <input key={id} type="hidden" name="phaseIds" value={id} />)}
              <button type="submit" disabled={!moveDownIds} aria-label={`Move ${phase.name} down`} className="inline-flex size-8 items-center justify-center rounded-lg border border-border disabled:opacity-40">
                <ArrowDown className="size-3.5" />
              </button>
            </form>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {moveState?.error ? <p role="alert" className="mt-1 text-xs text-destructive">{moveState.error}</p> : null}
      </td>
      <td className="px-4 py-3.5">
        <form ref={archiveFormRef} action={archiveAction}>
          <input type="hidden" name="id" value={phase.id} />
          <input type="hidden" name="frameworkId" value={frameworkId} />
          <input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
        </form>
        {archived ? (
          <button type="button" onClick={() => archiveFormRef.current?.requestSubmit()} className="h-9 rounded-lg border border-border px-3 text-xs font-semibold">Restore</button>
        ) : (
          <button type="button" onClick={() => setConfirmOpen(true)} className="h-9 rounded-lg border border-destructive px-3 text-xs font-semibold text-destructive">Archive</button>
        )}
        {archiveState?.error ? <p role="alert" className="mt-1 text-xs text-destructive">{archiveState.error}</p> : null}
      </td>
      {/* Portaled: this row renders as a <tr>, and a fixed-position dialog is
          not valid table-row content -- the browser would hoist it out of the
          table during parsing and desync it from what React rendered. */}
      {confirmOpen ? createPortal(
        <ConfirmationDialog
          open={confirmOpen}
          title="Archive phase?"
          description={`Projects currently in ${phase.name} will keep it and continue to display it.`}
          confirmLabel="Archive phase"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); archiveFormRef.current?.requestSubmit() }}
        />,
        document.body,
      ) : null}
    </tr>
  )
}

function AddPhaseForm({ frameworkId }: { frameworkId: string }) {
  const [state, formAction] = useActionState(addFrameworkPhaseAction, undefined)
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border px-4 py-4">
      <input type="hidden" name="frameworkId" value={frameworkId} />
      <label className="flex-1">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">New phase name</span>
        <input name="name" required className="h-9 w-full max-w-xs rounded-lg border border-border bg-card px-2.5 text-sm" />
      </label>
      <button type="submit" className="h-9 rounded-lg bg-foreground px-3 text-xs font-semibold text-primary-foreground">Add phase</button>
      {state?.error ? <p role="alert" className="w-full text-xs text-destructive">{state.error}</p> : null}
    </form>
  )
}
