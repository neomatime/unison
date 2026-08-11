'use client'

import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

const organizations = [
  { id: 'himark', name: 'HIMARK', initials: 'HI' },
  { id: 'acme', name: 'Acme Group', initials: 'AG' },
  { id: 'meridian', name: 'Meridian Holdings', initials: 'MH' },
  { id: 'northstar', name: 'Northstar Advisory', initials: 'NA' },
]

export function TenantSwitcher() {
  const [selected, setSelected] = useState(organizations[0])
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-11 min-w-48 items-center gap-2.5 rounded-xl border border-border bg-card px-3 text-left shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors hover:bg-muted/50"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[0.65rem] font-bold text-primary-foreground">
          {selected.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">Organization</span>
          <span className="block truncate text-sm font-semibold text-foreground">{selected.name}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-xl" role="listbox" aria-label="Organizations">
          <div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Building2 className="size-3.5" /> Switch organization
          </div>
          {organizations.map((organization) => (
            <button
              type="button"
              role="option"
              aria-selected={selected.id === organization.id}
              key={organization.id}
              onClick={() => { setSelected(organization); setOpen(false) }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground">{organization.initials}</span>
              <span className="flex-1 font-medium">{organization.name}</span>
              {selected.id === organization.id ? <Check className="size-4 text-brand" /> : null}
            </button>
          ))}
          <p className="border-t border-border px-2 pt-2 text-[0.6875rem] text-muted-foreground">Demo context only — data resets on refresh.</p>
        </div>
      ) : null}
    </div>
  )
}

