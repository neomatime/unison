'use client'

import { Archive, Copy, Eye, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type RowAction = {
  id: string
  label: string
  tone?: 'default' | 'danger'
  onSelect: () => void
}

const icons = {
  view: Eye,
  edit: Pencil,
  duplicate: Copy,
  archive: Archive,
  restore: RotateCcw,
}

export function RowActionMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return <div ref={root} className="relative inline-flex">
    <button
      type="button"
      aria-label={`Actions for ${label}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
    >
      <MoreHorizontal className="size-4" />
    </button>
    {open ? <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-44 rounded-xl border border-border bg-card p-1.5 shadow-xl">
      {actions.map((action) => {
        const Icon = icons[action.id as keyof typeof icons]
        return <button
          key={action.id}
          type="button"
          role="menuitem"
          onClick={() => { setOpen(false); action.onSelect() }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium hover:bg-muted focus:bg-muted focus:outline-none ${action.tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}
        >
          {Icon ? <Icon className="size-3.5" /> : <span className="size-3.5" />}{action.label}
        </button>
      })}
    </div> : null}
  </div>
}
