import { redirect } from 'next/navigation'

import { InternalAppShell } from '@/components/internal/internal-app-shell'
import type { ShellUser } from '@/components/layout/shell-context'
import { NoMembershipError } from '@/lib/auth/errors'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { resolveInternalAccess } from '@/lib/auth/internal-access'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  try {
    const { user, organizations, memberships } = await getSessionContext()
    const access = resolveInternalAccess({ userId: user.id, organizations, memberships })
    if (!access) redirect('/overview')
    const shellUser: ShellUser = { displayName: user.user_metadata?.full_name ?? user.email ?? 'HIMARK User', email: user.email ?? null, avatarUrl: user.user_metadata?.avatar_url ?? null }
    return <InternalAppShell user={shellUser} organization={access.organization} organizations={organizations} role={access.role}>{children}</InternalAppShell>
  } catch (error) {
    if (error instanceof NoMembershipError) redirect('/join-organization')
    throw error
  }
}
