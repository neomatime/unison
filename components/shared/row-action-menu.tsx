'use client'

import { Popover } from '@base-ui/react/popover'
import { Archive, Copy, Eye, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export type RowAction = { id: string; label: string; tone?: 'default' | 'danger'; onSelect: () => void }

const icons = { view: Eye, edit: Pencil, duplicate: Copy, archive: Archive, restore: RotateCcw }

/**
 * A compact, fully keyboard-operable action menu for an individual record.
 *
 * The menu is portalled to the page, not drawn inside the table: a table sits in a scrolling, clipping container, and a menu drawn
 * inside it is cut off (or hidden behind the row) when the list is short. Portalled, it opens on top of everything and flips
 * above the button when there is no room below. tests/unit/menus-not-clipped.test.ts keeps menus from going back inside tables.
 */
export function RowActionMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const popup = useRef<HTMLDivElement>(null)

  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        className="unison-action-control inline-flex rounded-none p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={4} collisionPadding={8} className="z-[80]">
          <Popover.Popup
            ref={popup}
            role="menu"
            aria-label={`Actions for ${label}`}
            initialFocus={() => popup.current?.querySelector<HTMLElement>('[role="menuitem"]') ?? true}
            onKeyDown={moveFocus}
            className="unison-menu-enter w-44 rounded-none border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
          >
            {actions.map((action) => {
              const Icon = icons[action.id as keyof typeof icons]
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpen(false); action.onSelect() }}
                  className={`unison-action-control flex w-full items-center gap-2 rounded-none px-3 py-2 text-left text-xs font-medium hover:bg-muted focus:bg-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${action.tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}
                >
                  {Icon ? <Icon className="size-3.5" /> : <span className="size-3.5" />}{action.label}
                </button>
              )
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
