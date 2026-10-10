'use client'

import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { cn, getInitials } from '@/lib/utils'
import { useShellContext } from '@/components/layout/shell-context'
import { getPartnerLevel } from '@/config/partner-levels'
import { switchOrganizationAction } from '@/features/organizations/actions/switch-organization'

/**
 * Lives at the top of the sidebar: the organisation is context for the whole
 * app, not for one page, so it sits in the one element every page shares.
 * `collapsed` is the icon rail, where only the initials fit and the list opens
 * beside the rail instead of beneath the button.
 */
export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
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
        aria-label={collapsed ? `Organization: ${active.name}` : undefined}
        title={collapsed ? active.name : undefined}
        className={cn(
          'unison-action-control flex w-full items-center border border-tenant-sidebar-border bg-card text-left transition-colors hover:bg-tenant-sidebar-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          collapsed ? 'justify-center p-1.5' : 'h-12 gap-2.5 px-2.5',
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center bg-foreground text-[0.65rem] font-medium text-primary-foreground">
          {getInitials(active.name)}
        </span>
        {collapsed ? null : <>
          <span className="min-w-0 flex-1">
            <span className="block font-brand text-[0.625rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">{getPartnerLevel(active.partnerLevel)?.label ?? 'Organization'}</span>
            <span className="block truncate text-sm font-medium text-foreground">{active.name}</span>
          </span>
          {hasMultipleOrganizations ? <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" /> : null}
        </>}
      </button>

      {open && hasMultipleOrganizations ? (
        <div
          className={cn(
            'absolute z-50 border border-border bg-card p-1.5 text-foreground shadow-xl',
            collapsed ? 'top-0 left-full ml-2 w-64' : 'top-full right-0 left-0 mt-1',
          )}
          role="listbox"
          aria-label="Organizations"
        >
          <div className="flex items-center gap-2 px-2 py-2 font-brand text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
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
                className="flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span className="flex size-8 items-center justify-center bg-muted text-xs font-medium text-foreground">{getInitials(organization.name)}</span>
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
