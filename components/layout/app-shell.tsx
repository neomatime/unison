'use client'

import type React from 'react'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'

import { Sidebar } from '@/components/navigation/sidebar'
import { NavigationLoading } from '@/components/shared/navigation-loading'
import { ShellProvider, type ShellUser } from '@/components/layout/shell-context'
import type { NavigationSection } from '@/config/navigation'
import type { Organization } from '@/types/tenancy'

type AppShellProps = {
  user: ShellUser
  organization: Organization
  organizations: Organization[]
  role: string
  navigationSections: NavigationSection[]
  children: React.ReactNode
}

export function AppShell({ user, organization, organizations, role, navigationSections, children }: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  return (
    <ShellProvider value={{ user, organization, organizations, role, navigationSections }}>
      <div className="flex h-screen overflow-hidden bg-sidebar">
        <NavigationLoading />
        <div className="hidden lg:block"><Sidebar /></div>
        {navigationOpen ? <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close navigation overlay" className="absolute inset-0 bg-foreground/40" onClick={() => setNavigationOpen(false)} /><div className="relative h-full w-64"><Sidebar /><button type="button" onClick={() => setNavigationOpen(false)} aria-label="Close navigation" className="absolute top-4 -right-12 flex size-9 items-center justify-center rounded-full bg-card text-foreground shadow-lg"><X className="size-5" /></button></div></div> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between bg-sidebar px-4 text-sidebar-active-foreground lg:hidden"><span className="font-bold tracking-[0.2em]">UNISON</span><button type="button" onClick={() => setNavigationOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 hover:bg-sidebar-active"><Menu className="size-5" /></button></div>
          <main className="flex-1 overflow-y-auto overscroll-contain rounded-none bg-background px-4 py-5 sm:px-6 lg:rounded-l-2xl lg:px-6 lg:py-6 xl:px-8">{children}</main>
        </div>
      </div>
    </ShellProvider>
  )
}
