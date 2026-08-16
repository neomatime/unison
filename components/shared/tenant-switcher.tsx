'use client'

import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { getInitials } from '@/lib/utils'
import { useShellContext } from '@/components/layout/shell-context'
import { switchOrganizationAction } from '@/features/organizations/actions/switch-organization'

export function TenantSwitcher() {
  const { organization: active, organizations } = useShellContext()
  const [open, setOpen] = useState(false)
  const hasMultipleOrganizations = organizations.length > 1

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => hasMultipleOrganizations && setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={!hasMultipleOrganizations || undefined}
        className="flex h-11 min-w-48 items-center gap-2.5 rounded-xl border border-border bg-card px-3 text-left shadow-[0_1px_2px_rgb(16_32_46_/_0.04)] transition-colors hover:bg-muted/50"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[0.65rem] font-bold text-primary-foreground">
          {getInitials(active.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">Organization</span>
          <span className="block truncate text-sm font-semibold text-foreground">{active.name}</span>
        </span>
        {hasMultipleOrganizations ? <ChevronsUpDown className="size-4 text-muted-foreground" /> : null}
      </button>

      {open && hasMultipleOrganizations ? (
        <div className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-xl" role="listbox" aria-label="Organizations">
          <div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Building2 className="size-3.5" /> Switch organization
          </div>
          {organizations.map((organization) => (
            <form action={switchOrganizationAction} key={organization.id}>
              <input type="hidden" name="organizationId" value={organization.id} />
              <button
                type="submit"
                role="option"
                aria-selected={active.id === organization.id}
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground">{getInitials(organization.name)}</span>
                <span className="flex-1 font-medium">{organization.name}</span>
                {active.id === organization.id ? <Check className="size-4 text-brand" /> : null}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  )
}

