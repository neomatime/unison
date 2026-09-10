'use client'

import type React from 'react'
import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Sidebar } from '@/components/navigation/sidebar'
import { NavigationLoading } from '@/components/shared/navigation-loading'
import { ShellProvider, type ShellUser } from '@/components/layout/shell-context'
import { NavigationProvider } from '@/components/layout/navigation-context'
import type { NavigationSection } from '@/config/navigation'
import type { Organization } from '@/types/tenancy'
import { RealtimeRefresh } from '@/components/layout/realtime-refresh'

type AppShellProps = {
  user: ShellUser
  organization: Organization
  organizations: Organization[]
  role: string
  navigationSections: NavigationSection[]
  children: React.ReactNode
}

export function AppShell({ user, organization, organizations, role, navigationSections, children }: AppShellProps) {
  const pathname = usePathname()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const navigationDialogRef = useRef<HTMLDivElement>(null)
  const navigationCloseRef = useRef<HTMLButtonElement>(null)
  const navigationTriggerRef = useRef<HTMLButtonElement>(null)
  const navigationWasOpenRef = useRef(false)

  useEffect(() => {
    if (!navigationOpen) {
      if (navigationWasOpenRef.current) {
        navigationWasOpenRef.current = false
        navigationTriggerRef.current?.focus()
      }
      return
    }

    navigationWasOpenRef.current = true
    const focusFrame = window.requestAnimationFrame(() => navigationCloseRef.current?.focus())

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setNavigationOpen(false)
        return
      }

      if (event.key !== 'Tab') return

      const dialog = navigationDialogRef.current
      if (!dialog) return

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href]:not([aria-disabled="true"]), button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      ))

      if (focusableElements.length === 0) {
        event.preventDefault()
        navigationCloseRef.current?.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!dialog.contains(activeElement)) {
        event.preventDefault()
        firstElement.focus()
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [navigationOpen])

  return (
    <ShellProvider value={{ user, organization, organizations, role }}>
      <NavigationProvider sections={navigationSections}>
        <div className="unison-tenant flex h-screen h-dvh overflow-hidden bg-tenant-canvas">
          <NavigationLoading />
          <RealtimeRefresh organizationId={organization.id} />
          <div className="hidden lg:block"><Sidebar /></div>
          {navigationOpen ? (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute inset-0 bg-foreground/40"
                onClick={() => setNavigationOpen(false)}
              />
              <div
                ref={navigationDialogRef}
                id="tenant-navigation-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Primary navigation"
                className="relative h-full w-64"
              >
                <Sidebar onNavigate={() => setNavigationOpen(false)} />
                <button
                  ref={navigationCloseRef}
                  type="button"
                  onClick={() => setNavigationOpen(false)}
                  aria-label="Close navigation"
                  className="absolute top-4 -right-12 flex size-9 items-center justify-center border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 items-center justify-between border-b border-tenant-sidebar-border bg-tenant-sidebar px-4 text-tenant-sidebar-foreground lg:hidden">
              <span className="font-brand font-medium tracking-[0.2em]">UNISON</span>
              <button
                ref={navigationTriggerRef}
                type="button"
                onClick={() => setNavigationOpen(true)}
                aria-label="Open navigation"
                aria-expanded={navigationOpen}
                aria-controls="tenant-navigation-dialog"
                className="p-2 transition-colors hover:bg-tenant-sidebar-hover focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Menu className="size-5" />
              </button>
            </div>
            <main className="flex-1 overflow-y-auto overscroll-contain bg-tenant-canvas px-4 py-5 sm:px-6 lg:px-6 lg:py-6 xl:px-8">
              <div key={pathname} className="unison-route-view min-h-full">{children}</div>
            </main>
          </div>
        </div>
      </NavigationProvider>
    </ShellProvider>
  )
}
