import type React from 'react'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { NoMembershipError } from '@/lib/auth/errors'

export default async function UnisonLayout({ children }: { children: React.ReactNode }) {
  try {
    const { user, organization, organizations, role } = await getSessionContext()
    return (
      <AppShell user={user} organization={organization} organizations={organizations} role={role}>
        {children}
      </AppShell>
    )
  } catch (error) {
    if (error instanceof NoMembershipError) redirect('/join-organization')
    throw error
  }
}
