'use client'

import { Archive, Copy, Eye, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export type RowAction = { id: string; label: string; tone?: 'default' | 'danger'; onSelect: () => void }

const icons = { view: Eye, edit: Pencil, duplicate: Copy, archive: Archive, restore: RotateCcw }

/** A compact, fully keyboard-operable action menu for an individual record. */
export function RowActionMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return <div ref={root} className="relative inline-flex">
    <button ref={trigger} type="button" aria-label={`Actions for ${label}`} aria-haspopup="menu" aria-controls={open ? menuId : undefined} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="unison-action-control rounded-none p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"><MoreHorizontal className="size-4" /></button>
    {open ? <div id={menuId} role="menu" aria-label={`Actions for ${label}`} onKeyDown={moveFocus} className="unison-menu-enter absolute top-full right-0 z-40 mt-1 w-44 rounded-none border border-border bg-card p-1.5 shadow-xl">
      {actions.map((action) => {
        const Icon = icons[action.id as keyof typeof icons]
        return <button key={action.id} type="button" role="menuitem" onClick={() => { setOpen(false); action.onSelect() }} className={`unison-action-control flex w-full items-center gap-2 rounded-none px-3 py-2 text-left text-xs font-medium hover:bg-muted focus:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 ${action.tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}>
          {Icon ? <Icon className="size-3.5" /> : <span className="size-3.5" />}{action.label}
        </button>
      })}
    </div> : null}
  </div>
}
