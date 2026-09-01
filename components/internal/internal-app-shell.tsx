'use client'

import { Menu, X } from 'lucide-react'
import { useState } from 'react'

import { ShellProvider, type ShellUser } from '@/components/layout/shell-context'
import { InternalSidebar } from '@/components/internal/internal-sidebar'
import { InternalTopbar } from '@/components/internal/internal-topbar'
import { NavigationLoading } from '@/components/shared/navigation-loading'
import type { Organization } from '@/types/tenancy'

export function InternalAppShell({ user, organization, organizations, role, children }: { user: ShellUser; organization: Organization; organizations: Organization[]; role: string; children: React.ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  return <ShellProvider value={{ user, organization, organizations, role, navigationSections: [] }}>
    <div className="flex h-screen overflow-hidden bg-sidebar">
      <NavigationLoading />
      <div className="hidden lg:block"><InternalSidebar /></div>
      {navigationOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close internal navigation overlay" className="absolute inset-0 bg-foreground/40" onClick={() => setNavigationOpen(false)} /><div className="relative h-full w-64"><InternalSidebar /><button type="button" onClick={() => setNavigationOpen(false)} aria-label="Close internal navigation" className="absolute top-4 -right-12 flex size-9 items-center justify-center rounded-full bg-card shadow-lg"><X className="size-5" /></button></div></div> : null}
      <div className="flex min-w-0 flex-1 flex-col bg-background lg:rounded-l-2xl">
        <div className="flex h-14 items-center justify-between bg-sidebar px-4 text-white lg:hidden"><span className="font-bold tracking-[0.2em]">UNISON</span><button type="button" onClick={() => setNavigationOpen(true)} aria-label="Open internal navigation" className="rounded-lg p-2"><Menu className="size-5" /></button></div>
        <InternalTopbar />
        <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-7 lg:py-6 xl:px-8">{children}</main>
      </div>
    </div>
  </ShellProvider>
}
