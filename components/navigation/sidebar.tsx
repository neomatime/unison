'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn, getInitials } from '@/lib/utils'
import { useShellContext } from '@/components/layout/shell-context'
import { useNavigationSections } from '@/components/layout/navigation-context'
import { moduleIcons } from '@/config/navigation'
import { InitialAvatar } from '@/components/ui/initial-avatar'
import { roles } from '@/config/roles'
import { signOutAction } from '@/features/auth-ui/actions/sign-out'

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user, organization, role } = useShellContext()
  const navigationSections = useNavigationSections()
  const displayName = user.displayName
  const avatarUrl = user.avatarUrl
  const roleLabel = roles.find((definition) => definition.id === role)?.label ?? role
  return (
    <aside className={cn('flex h-full shrink-0 flex-col bg-tenant-sidebar text-tenant-sidebar-foreground transition-[width]', collapsed ? 'w-20' : 'w-64')}>
      {/* Brand */}
      <div className={cn('flex items-center justify-between py-5', collapsed ? 'px-6' : 'px-6')}>
        <span className={cn('text-xl font-bold tracking-[0.2em] text-tenant-sidebar-foreground', collapsed && 'hidden')}>
          UNISON
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label="Collapse sidebar"
          className="text-tenant-sidebar-muted transition-colors hover:text-tenant-sidebar-foreground"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {navigationSections.map((section, sectionIndex) => (
          <div key={section.heading ?? `section-${sectionIndex}`} className="mb-2">
            {section.heading ? (
              <p className={cn('px-3 pt-4 pb-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-tenant-sidebar-muted uppercase', collapsed && 'sr-only')}>
                {section.heading}
              </p>
            ) : (
              <div className="pt-1" />
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                // Resolved here rather than carried on the item: the sections
                // come from a Server Component and an icon is a function, which
                // cannot cross the RSC boundary.
                const Icon = moduleIcons[item.id]
                const isActive = item.route === '/overview'
                  ? pathname === '/' || pathname === '/overview'
                  : pathname.startsWith(item.route)
                return <li key={item.label}>
                  <Link
                    href={item.enabled ? item.route : '#'}
                    title={collapsed ? item.label : undefined}
                    aria-disabled={!item.enabled || undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-tenant-sidebar-active text-tenant-sidebar-foreground'
                        : 'text-tenant-sidebar-foreground hover:bg-tenant-sidebar-hover hover:text-tenant-sidebar-foreground',
                    )}
                  >
                    <Icon className="size-[1.125rem] shrink-0" strokeWidth={1.75} />
                    <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                  </Link>
                </li>
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="relative border-t border-tenant-sidebar-border px-3 py-3">
        <button
          type="button"
          onClick={() => setProfileOpen((value) => !value)}
          aria-expanded={profileOpen}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-tenant-sidebar-hover"
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <InitialAvatar initials={getInitials(displayName)} className="size-10 rounded-full" />
          )}
          <span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
            <span className="block truncate text-sm font-semibold text-tenant-sidebar-foreground">
              {displayName}
            </span>
            <span className="block truncate text-xs text-tenant-sidebar-muted">{roleLabel}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-tenant-sidebar-muted', collapsed && 'hidden')} />
        </button>
        {profileOpen ? <div className={cn('absolute bottom-full z-50 mb-2 rounded-xl border border-border bg-card p-2 text-foreground shadow-xl', collapsed ? 'left-2 w-52' : 'right-3 left-3')}><p className="px-2 py-2 text-xs font-semibold text-muted-foreground">{displayName} · {organization.name}</p><Link href="/people/team" className="block rounded-lg px-2 py-2 text-sm hover:bg-muted">View profile</Link><Link href="/settings" className="block rounded-lg px-2 py-2 text-sm hover:bg-muted">Organization settings</Link><form action={signOutAction}><button type="submit" className="block w-full rounded-lg px-2 py-2 text-left text-sm text-destructive hover:bg-muted">Sign out</button></form></div> : null}
      </div>
    </aside>
  )
}
