'use client'

import { BookOpen, Building2, ChevronDown, CircleHelp, CreditCard, Database, LayoutDashboard, Menu, SlidersHorizontal, TicketCheck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { InitialAvatar } from '@/components/ui/initial-avatar'
import { signOutInternalAction as signOutAction } from '@/features/auth-ui/actions/sign-out'
import { cn, getInitials } from '@/lib/utils'

const sections = [
  { heading: 'Platform', items: [{ label: 'Overview', route: '/internal/overview', icon: LayoutDashboard }, { label: 'Organisations', route: '/internal/organisations', icon: Building2 }] },
  { heading: 'Provisioning', items: [{ label: 'Client Provisioning', route: '/internal/provisioning', icon: SlidersHorizontal }, { label: 'Tenants', route: '/internal/tenants', icon: Database }, { label: 'Subscriptions', route: '/internal/subscriptions', icon: CreditCard }] },
  { heading: 'Support', items: [{ label: 'Support Tickets', route: '/internal/support', icon: TicketCheck }, { label: 'Knowledge Base', route: '/internal/knowledge', icon: BookOpen }] },
]

export function InternalSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user, role } = useShellContext()
  return <aside className={cn('flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out', collapsed ? 'w-20' : 'w-64')}>
    <div className="flex h-16 items-center justify-between px-6"><span className={cn('font-brand text-lg font-medium tracking-[0.22em] text-foreground', collapsed && 'hidden')}>UNISON</span><button type="button" onClick={() => setCollapsed((value) => !value)} aria-label="Collapse internal sidebar" className="text-sidebar-muted hover:text-foreground"><Menu className="size-5" /></button></div>
    <nav aria-label="HIMARK internal" className="flex-1 overflow-y-auto px-0 pb-4">{sections.map((section) => <div key={section.heading} className="mb-3"><p className={cn('px-6 pt-4 pb-2 text-[0.625rem] font-medium tracking-[0.16em] text-sidebar-muted uppercase', collapsed && 'sr-only')}>{section.heading}</p><ul className="space-y-px">{section.items.map((item) => { const active = pathname.startsWith(item.route); return <li key={item.route}><Link href={item.route} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined} className={cn('relative flex min-h-10 items-center gap-3 px-6 py-2 text-sm font-normal transition-colors', active ? 'bg-sidebar-active text-sidebar-active-foreground before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand' : 'hover:bg-sidebar-active/55 hover:text-foreground')}><item.icon className="size-[1.0625rem] shrink-0 stroke-[1.65]" /><span className={cn(collapsed && 'sr-only')}>{item.label}</span></Link></li> })}</ul></div>)}</nav>
    <div className="relative border-t border-sidebar-border p-3"><button type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} className="flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-sidebar-active/60">{user.avatarUrl ? <Image src={user.avatarUrl} alt={user.displayName} width={40} height={40} className="size-9 rounded-full object-cover" /> : <InitialAvatar initials={getInitials(user.displayName)} className="size-9 rounded-full" />}<span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}><span className="block truncate text-sm font-medium text-foreground">{user.displayName}</span><span className="block truncate text-xs text-sidebar-muted">{role === 'owner' ? 'HIMARK Administrator' : role}</span></span><ChevronDown className={cn('size-4', collapsed && 'hidden')} /></button>{profileOpen ? <div className={cn('absolute bottom-full z-50 mb-2 border border-border bg-card p-1.5 text-foreground shadow-xl', collapsed ? 'left-2 w-56' : 'right-3 left-3')}><Link href="/overview" className="block px-3 py-2 text-sm hover:bg-muted">Open tenant workspace</Link><Link href="/internal/support" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"><CircleHelp className="size-4" />Internal support</Link><form action={signOutAction}><button type="submit" className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-muted">Sign out</button></form></div> : null}</div>
  </aside>
}
