'use client'

import { createContext, useContext } from 'react'
import type React from 'react'
import type { NavigationSection } from '@/config/navigation'

/**
 * Kept separate from ShellContext rather than folded into it because navigation
 * is tenant-only: it comes from `navigationSectionsFor(entitledModuleIds())`,
 * resolved in `app/(unison)/layout.tsx`, and the internal (HIMARK staff) shell
 * has no entitled-module concept at all. Widening ShellContext instead would
 * force `InternalAppShell` to fabricate a value that means nothing there — a
 * fake entry that typechecks but silently misleads anything that later reads it.
 *
 * `AppShell` renders `<Sidebar />` in two places (a mobile overlay and the
 * desktop rail), so this travels by context rather than by prop — passing it
 * twice would mean keeping both call sites in step by hand.
 */
const NavigationContext = createContext<NavigationSection[] | null>(null)

export function NavigationProvider({ sections, children }: { sections: NavigationSection[]; children: React.ReactNode }) {
  return <NavigationContext.Provider value={sections}>{children}</NavigationContext.Provider>
}

export function useNavigationSections() {
  const context = useContext(NavigationContext)
  if (!context) throw new Error('useNavigationSections must be used within a NavigationProvider')
  return context
}
