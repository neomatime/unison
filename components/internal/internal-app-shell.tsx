'use client'

import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { ShellProvider, type ShellUser } from '@/components/layout/shell-context'
import { InternalSidebar } from '@/components/internal/internal-sidebar'
import { InternalTopbar } from '@/components/internal/internal-topbar'
import { NavigationLoading } from '@/components/shared/navigation-loading'
import type { Organization } from '@/types/tenancy'

import styles from './internal-theme.module.css'

export function InternalAppShell({ user, organization, organizations, role, children }: { user: ShellUser; organization: Organization; organizations: Organization[]; role: string; children: React.ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const pathname = usePathname()
  return <ShellProvider value={{ user, organization, organizations, role }}>
    <div className={`${styles.theme} flex h-screen overflow-hidden bg-background`}>
      <NavigationLoading />
      <div className="hidden lg:block"><InternalSidebar /></div>
      {navigationOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close internal navigation overlay" className="absolute inset-0 bg-foreground/25" onClick={() => setNavigationOpen(false)} /><div className="unison-drawer-enter relative h-full w-64"><InternalSidebar /><button type="button" onClick={() => setNavigationOpen(false)} aria-label="Close internal navigation" className="absolute top-4 -right-12 flex size-9 items-center justify-center border border-border bg-card text-foreground"><X className="size-5" /></button></div></div> : null}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground lg:hidden"><span className="font-medium tracking-[0.22em]">UNISON</span><button type="button" onClick={() => setNavigationOpen(true)} aria-label="Open internal navigation" className="p-2"><Menu className="size-5" /></button></div>
        <InternalTopbar />
        <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-7 lg:py-6 xl:px-8"><div key={pathname} className="unison-route-view">{children}</div></main>
      </div>
    </div>
  </ShellProvider>
}
