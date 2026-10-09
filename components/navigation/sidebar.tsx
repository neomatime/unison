'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CircleHelp, Menu, ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn, getInitials } from '@/lib/utils'
import { useShellContext } from '@/components/layout/shell-context'
import { useNavigationSections } from '@/components/layout/navigation-context'
import { moduleIcons } from '@/config/navigation'
import { InitialAvatar } from '@/components/ui/initial-avatar'
import { roles } from '@/config/roles'
import { signOutAction } from '@/features/auth-ui/actions/sign-out'
import { UtilityPanel, type UtilityPanelKind } from '@/components/shared/utility-panel'
import { TenantSwitcher } from '@/components/shared/tenant-switcher'

const CLOSED_SECTIONS_KEY = 'unison:sidebar:closed-sections'

type SidebarProps = {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null)
  const [unread, setUnread] = useState(0)
  const [closedSections, setClosedSections] = useState<string[]>([])
  const navRef = useRef<HTMLElement>(null)
  const [scrollShadow, setScrollShadow] = useState<string | undefined>(undefined)
  // An inset edge shadow marks whichever end of the menu has more beyond it, so a
  // short window never makes the list look as if it simply stops. Box-shadow, not a
  // gradient: the theme is deliberately gradient-free.
  function updateScrollEdges() {
    const nav = navRef.current
    if (!nav) return
    const shadow = 'rgb(13 35 64 / 0.16)'
    const edges = [
      nav.scrollTop > 1 ? `inset 0 8px 6px -6px ${shadow}` : '',
      nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1 ? `inset 0 -8px 6px -6px ${shadow}` : '',
    ].filter(Boolean)
    setScrollShadow(edges.length ? edges.join(', ') : undefined)
  }
  useEffect(() => {
    updateScrollEdges()
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateScrollEdges)
    observer.observe(nav)
    if (nav.firstElementChild) observer.observe(nav.firstElementChild)
    return () => observer.disconnect()
  }, [])
  // Opening or closing a section, or the rail, changes how tall the list is.
  useEffect(updateScrollEdges, [closedSections, collapsed])
  const { user, organization, role } = useShellContext()
  const navigationSections = useNavigationSections()
  const displayName = user.displayName
  const avatarUrl = user.avatarUrl
  const roleLabel = roles.find((definition) => definition.id === role)?.label ?? role
  // Read after mount so server and first client render agree; a blocked or empty store just means all open.
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(CLOSED_SECTIONS_KEY) ?? '[]') as unknown
      if (Array.isArray(stored)) setClosedSections(stored.filter((value): value is string => typeof value === 'string'))
    } catch { /* per-viewer convenience only */ }
  }, [])
  function toggleSection(heading: string) {
    setClosedSections((current) => {
      const next = current.includes(heading) ? current.filter((value) => value !== heading) : [...current, heading]
      try { window.localStorage.setItem(CLOSED_SECTIONS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPanel('search')
      } else if (event.key === 'Escape') setPanel(null)
    }
    function handleCount(event: Event) { setUnread(Number((event as CustomEvent<number>).detail) || 0) }
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('unison:notification-count', handleCount)
    void fetch('/api/notifications', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const payload = await response.json() as { notifications?: Array<{ read_at: string | null }> }
      setUnread((payload.notifications ?? []).filter((item) => !item.read_at).length)
    })
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('unison:notification-count', handleCount)
    }
  }, [])
  return (
    <><aside className={cn('flex h-full shrink-0 flex-col border-r border-tenant-sidebar-border bg-tenant-sidebar text-tenant-sidebar-foreground transition-[width] duration-200 ease-out', collapsed ? 'w-20' : 'w-64')}>
      {/* Brand */}
      <div className={cn('flex items-center justify-between py-4', collapsed ? 'px-6' : 'px-6')}>
        <span className={cn('font-brand text-xl font-medium tracking-[0.2em] text-tenant-sidebar-foreground', collapsed && 'hidden')}>
          UNISON
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-tenant-sidebar-muted transition-colors hover:text-tenant-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Organisation: context for every page, so it lives here rather than in each page header. */}
      <div className="px-3 pb-2">
        <TenantSwitcher collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav ref={navRef} onScroll={updateScrollEdges} style={{ boxShadow: scrollShadow }} className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {navigationSections.map((section, sectionIndex) => {
          const isItemActive = (item: (typeof section.items)[number]) => item.route === '/overview'
            ? pathname === '/' || pathname === '/overview'
            : pathname.startsWith(item.route)
          const sectionClosed = Boolean(section.heading && !collapsed && closedSections.includes(section.heading))
          // A closed section keeps showing the page the user is on, so they never lose their place.
          const visibleItems = sectionClosed ? section.items.filter(isItemActive) : section.items
          return <div key={section.heading ?? `section-${sectionIndex}`} className="mb-1">
            {section.heading ? (
              <button
                type="button"
                onClick={() => toggleSection(section.heading!)}
                aria-expanded={!sectionClosed}
                tabIndex={collapsed ? -1 : undefined}
                className={cn('unison-action-control flex w-full items-center justify-between px-3 pt-3 pb-1.5 text-left font-brand text-[0.6875rem] font-medium tracking-[0.14em] text-tenant-sidebar-muted uppercase hover:text-tenant-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', collapsed && 'sr-only')}
              >
                {section.heading}
                <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', sectionClosed && '-rotate-90')} />
              </button>
            ) : (
              <div className="pt-1" />
            )}
            <ul className="flex flex-col gap-0.5">
              {visibleItems.map((item) => {
                // Resolved here rather than carried on the item: the sections
                // come from a Server Component and an icon is a function, which
                // cannot cross the RSC boundary.
                const Icon = moduleIcons[item.id]
                const isActive = isItemActive(item)
                return <li key={item.label}>
                  <Link
                    href={item.enabled ? item.route : '#'}
                    title={collapsed ? item.label : undefined}
                    aria-disabled={!item.enabled || undefined}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(event) => {
                      if (!item.enabled) {
                        event.preventDefault()
                        return
                      }
                      onNavigate?.()
                    }}
                    className={cn(
                      'unison-action-control relative flex items-center gap-3 px-3 py-2 text-sm font-normal lg:py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      isActive
                        ? 'bg-tenant-sidebar-active text-tenant-sidebar-foreground'
                        : 'text-tenant-sidebar-muted hover:bg-tenant-sidebar-hover hover:text-tenant-sidebar-foreground',
                    )}
                  >
                    {isActive ? <span aria-hidden="true" className="absolute inset-y-0 -left-3 w-0.5 bg-brand" /> : null}
                    <Icon className="size-[1.125rem] shrink-0" strokeWidth={1.75} />
                    <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                  </Link>
                </li>
              })}
            </ul>
          </div>
        })}
      </nav>

      <div className="grid grid-cols-3 gap-1 border-t border-tenant-sidebar-border px-3 py-2">
        <UtilityButton label="Search" collapsed={collapsed} onClick={() => setPanel('search')}><Search className="size-4" /></UtilityButton>
        <UtilityButton label="Notifications" collapsed={collapsed} onClick={() => setPanel('notifications')} dot={unread > 0}><Bell className="size-4" /></UtilityButton>
        <UtilityButton label="Help" collapsed={collapsed} onClick={() => setPanel('help')}><CircleHelp className="size-4" /></UtilityButton>
      </div>

      {/* User */}
      <div className="relative border-t border-tenant-sidebar-border px-3 py-3">
        <button
          type="button"
          onClick={() => setProfileOpen((value) => !value)}
          aria-expanded={profileOpen}
          className="unison-action-control flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-tenant-sidebar-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
            <span className="block truncate text-sm font-medium text-tenant-sidebar-foreground">
              {displayName}
            </span>
            <span className="block truncate text-xs text-tenant-sidebar-muted">{roleLabel}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-tenant-sidebar-muted', collapsed && 'hidden')} />
        </button>
        {profileOpen ? <div role="menu" className={cn('absolute bottom-full z-50 mb-2 border border-border bg-card p-1.5 text-foreground shadow-xl', collapsed ? 'left-2 w-52' : 'right-3 left-3')}><p className="px-2 py-2 text-xs font-medium text-muted-foreground">{displayName} · {organization.name}</p><Link href="/people/team" onClick={onNavigate} className="block px-2 py-2 text-sm transition-colors hover:bg-muted">View profile</Link><Link href="/settings" onClick={onNavigate} className="block px-2 py-2 text-sm transition-colors hover:bg-muted">Organization settings</Link><form action={signOutAction} onSubmit={onNavigate}><button type="submit" className="block w-full px-2 py-2 text-left text-sm text-destructive transition-colors hover:bg-muted">Sign out</button></form></div> : null}
      </div>
    </aside><UtilityPanel kind={panel ?? 'help'} open={panel !== null} onClose={() => setPanel(null)} /></>
  )
}

function UtilityButton({ label, collapsed, onClick, dot, children }: { label: string; collapsed: boolean; onClick: () => void; dot?: boolean; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="unison-action-control relative flex flex-col items-center justify-center gap-1 px-1 py-2 text-tenant-sidebar-muted hover:bg-tenant-sidebar-hover hover:text-tenant-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{children}{dot ? <span className="absolute top-1 right-2 size-2 rounded-full bg-warning" /> : null}<span className={cn('text-[0.6rem]', collapsed && 'sr-only')}>{label}</span></button>
}
