import type React from 'react'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import type { ShellUser } from '@/components/layout/shell-context'
import { navigationSectionsFor } from '@/config/navigation'
import { NAV_MODULES } from '@/features/rights/modules'
import { myRight } from '@/features/rights/server'
import { entitledModuleIds } from '@/lib/auth/entitlement'
import { resolveDisplayName } from '@/lib/auth/display-name'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { NoMembershipError } from '@/lib/auth/errors'
import { THEME_BOOT_SCRIPT } from '@/lib/ui/theme'

// Never prerendered, for the same reason as the internal layout: this resolves
// the caller's session from request cookies. Most pages beneath it read
// searchParams and so are dynamic anyway, but that is a property of each page
// rather than of this layout, and it stops being true the moment someone adds
// a page that takes no parameters.
export const dynamic = 'force-dynamic'

export default async function UnisonLayout({ children }: { children: React.ReactNode }) {
  try {
    const { user, organization, organizations, role } = await getSessionContext()

    // Project the Supabase user down to what the shell renders before it crosses
    // to the client — the full user object (app_metadata, identities, factors, ...)
    // has no business in browser JavaScript.
    const shellUser: ShellUser = {
      displayName: resolveDisplayName(user),
      email: user.email ?? null,
      avatarUrl: user.user_metadata?.avatar_url ?? null,
    }

    // Areas the person may not view are left out of the menu (the pages refuse them as well).
    const allowed = await Promise.all(Object.entries(NAV_MODULES).map(async ([id, area]) => [id, await myRight(area, 'view')] as const))
    const hidden = new Set(allowed.filter(([, ok]) => !ok).map(([id]) => id))
    const navigationSections = navigationSectionsFor(await entitledModuleIds())
      .map((section) => ({ ...section, items: section.items.filter((item) => !hidden.has(item.id)) }))
      .filter((section) => section.items.length > 0)

    return (
      <>
        {/* Sets a saved dark choice before the first paint, so there is no light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <AppShell user={shellUser} organization={organization} organizations={organizations} role={role} navigationSections={navigationSections}>
          {children}
        </AppShell>
      </>
    )
  } catch (error) {
    if (error instanceof NoMembershipError) redirect('/join-organization')
    throw error
  }
}
