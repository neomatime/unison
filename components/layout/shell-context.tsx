'use client'

import { createContext, useContext } from 'react'
import type React from 'react'
import type { Organization } from '@/types/tenancy'

/**
 * A deliberate narrow projection of the Supabase `User` — display name, email and
 * avatar only, the three things the shell actually renders. The full `User` object
 * (app_metadata, identities, factors, timestamps, ...) must never cross to the
 * client: it would be serialised into the RSC payload and shipped as browser
 * JavaScript for no reason. Derive this once, server-side, in
 * `app/(unison)/layout.tsx` from `getSessionContext()`'s user.
 */
export type ShellUser = {
  displayName: string
  email: string | null
  avatarUrl: string | null
}

export type ShellContextValue = {
  user: ShellUser
  organization: Organization
  organizations: Organization[]
  role: string
}

const ShellContext = createContext<ShellContextValue | null>(null)

/**
 * Distributes the signed-in user, active organization and full organization list
 * (from `getSessionContext`, resolved once in `app/(unison)/layout.tsx`) to any
 * client component in the tree — chiefly the sidebar and the tenant switcher, which
 * live at different depths and would otherwise need this threaded through several
 * intermediate "use client" components (TopNav, WorkspaceHeader, every page).
 */
export function ShellProvider({ value, children }: { value: ShellContextValue; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShellContext() {
  const context = useContext(ShellContext)
  if (!context) throw new Error('useShellContext must be used within a ShellProvider')
  return context
}
