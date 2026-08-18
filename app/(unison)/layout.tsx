import type React from 'react'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import type { ShellUser } from '@/components/layout/shell-context'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { NoMembershipError } from '@/lib/auth/errors'

export default async function UnisonLayout({ children }: { children: React.ReactNode }) {
  try {
    const { user, organization, organizations, role } = await getSessionContext()

    // Project the Supabase user down to what the shell renders before it crosses
    // to the client — the full user object (app_metadata, identities, factors, ...)
    // has no business in browser JavaScript.
    const shellUser: ShellUser = {
      displayName: user.user_metadata?.full_name ?? user.email ?? 'Unknown user',
      email: user.email ?? null,
      avatarUrl: user.user_metadata?.avatar_url ?? null,
    }

    return (
      <AppShell user={shellUser} organization={organization} organizations={organizations} role={role}>
        {children}
      </AppShell>
    )
  } catch (error) {
    if (error instanceof NoMembershipError) redirect('/join-organization')
    throw error
  }
}
