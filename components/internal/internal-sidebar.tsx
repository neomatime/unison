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
  return <aside className={cn('flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width]', collapsed ? 'w-20' : 'w-64')}>
    <div className="flex items-center justify-between px-6 py-5"><span className={cn('text-xl font-bold tracking-[0.2em] text-white', collapsed && 'hidden')}>UNISON</span><button type="button" onClick={() => setCollapsed((value) => !value)} aria-label="Collapse internal sidebar" className="text-sidebar-muted hover:text-white"><Menu className="size-5" /></button></div>
    <nav aria-label="HIMARK internal" className="flex-1 overflow-y-auto px-3 pb-4">{sections.map((section) => <div key={section.heading} className="mb-2"><p className={cn('px-3 pt-4 pb-2 text-[0.6875rem] font-semibold tracking-[0.12em] text-sidebar-muted uppercase', collapsed && 'sr-only')}>{section.heading}</p><ul className="space-y-0.5">{section.items.map((item) => { const active = pathname.startsWith(item.route); return <li key={item.route}><Link href={item.route} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-sidebar-active text-white' : 'hover:bg-sidebar-active/60 hover:text-white')}><item.icon className="size-[1.125rem] shrink-0" /><span className={cn(collapsed && 'sr-only')}>{item.label}</span></Link></li> })}</ul></div>)}</nav>
    <div className="relative border-t border-sidebar-border p-3"><button type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar-active/60">{user.avatarUrl ? <Image src={user.avatarUrl} alt={user.displayName} width={40} height={40} className="size-10 rounded-full object-cover" /> : <InitialAvatar initials={getInitials(user.displayName)} className="size-10 rounded-full" />}<span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}><span className="block truncate text-sm font-semibold text-white">{user.displayName}</span><span className="block truncate text-xs text-sidebar-muted">{role === 'owner' ? 'HIMARK Administrator' : role}</span></span><ChevronDown className={cn('size-4', collapsed && 'hidden')} /></button>{profileOpen ? <div className={cn('absolute bottom-full z-50 mb-2 rounded-xl border border-border bg-card p-2 text-foreground shadow-xl', collapsed ? 'left-2 w-56' : 'right-3 left-3')}><Link href="/overview" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">Open tenant workspace</Link><Link href="/internal/support" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"><CircleHelp className="size-4" />Internal support</Link><form action={signOutAction}><button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-muted">Sign out</button></form></div> : null}</div>
  </aside>
}
