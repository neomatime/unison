'use client'

import { Popover } from '@base-ui/react/popover'
import { Archive, Eye, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useState } from 'react'

import type { ActionState } from '@/features/crm-workspace/types'

const item =
  'unison-action-control flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:bg-muted'

/**
 * The one menu at the end of a register row: View, Edit and Archive (or Restore). Replaces three text links
 * per row. Archive keeps its confirmation and its error line, and the menu is portalled so the table's own
 * horizontal scroll never clips it.
 */
export function RegisterRowMenu({
  name,
  viewHref,
  editHref,
  archived,
  action,
}: {
  name: string
  viewHref: string
  editHref: string
  archived: boolean
  action: (previous: ActionState, form: FormData) => Promise<ActionState>
}) {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useActionState(action, undefined)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        className="unison-action-control inline-flex size-10 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} collisionPadding={8} className="z-[80]">
          <Popover.Popup
            role="menu"
            aria-label={`Actions for ${name}`}
            className="w-44 border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
          >
            <Link href={viewHref} role="menuitem" className={item}>
              <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
              View
            </Link>
            <Link href={editHref} role="menuitem" className={item}>
              <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
              Edit
            </Link>
            <form
              action={run}
              onSubmit={(event) => {
                if (!archived && !window.confirm('Archive this record?')) {
                  event.preventDefault()
                }
              }}
            >
              <button
                type="submit"
                role="menuitem"
                disabled={pending}
                className={`${item} ${archived ? '' : 'text-destructive'} disabled:opacity-60`}
              >
                {archived ? <RotateCcw className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                {pending ? 'Working…' : archived ? 'Restore' : 'Archive'}
              </button>
            </form>
            {state?.error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{state.error}</p> : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
