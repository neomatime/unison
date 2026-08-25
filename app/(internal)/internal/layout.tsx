import { redirect } from 'next/navigation'

import { InternalAppShell } from '@/components/internal/internal-app-shell'
import type { ShellUser } from '@/components/layout/shell-context'
import { NoMembershipError } from '@/lib/auth/errors'
import { resolveDisplayName } from '@/lib/auth/display-name'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { resolveInternalAccess } from '@/lib/auth/internal-access'

/**
 * Never prerendered. This layout resolves the caller's session from request
 * cookies, so it has no build-time answer — and `/internal/page.tsx` is a bare
 * redirect with no dynamic API of its own, which makes it look statically
 * exportable and drags this layout into the build.
 *
 * Next normally notices `cookies()` and switches such a route to dynamic, but
 * reading configuration throws first: createServerSupabase() validates its
 * environment before it awaits any cookie. So the bailout never happens and a
 * missing variable fails the whole build instead of one request. Declaring the
 * segment dynamic states the actual requirement rather than relying on an
 * ordering that holds only while nothing throws ahead of it.
 */
export const dynamic = 'force-dynamic'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  try {
    const { user, organizations, memberships } = await getSessionContext()
    const access = resolveInternalAccess({ userId: user.id, organizations, memberships })
    if (!access) redirect('/overview')
    const shellUser: ShellUser = { displayName: resolveDisplayName(user), email: user.email ?? null, avatarUrl: user.user_metadata?.avatar_url ?? null }
    return <InternalAppShell user={shellUser} organization={access.organization} organizations={organizations} role={access.role}>{children}</InternalAppShell>
  } catch (error) {
    if (error instanceof NoMembershipError) redirect('/join-organization')
    throw error
  }
}
