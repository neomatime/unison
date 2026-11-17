import { PublicThemeEffect } from '@/components/layout/public-theme-effect'
import { THEME_BOOT_SCRIPT } from '@/lib/ui/theme'

/**
 * Sets a saved dark choice on <html> before the first paint, so a public page never flashes light. A server component on purpose:
 * React does not run a script that a client component renders. Pages whose screen is a client component (sign-in, invitations)
 * render this themselves and the screen renders PublicThemeEffect.
 */
export function PublicThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
}

/** For a server-rendered public page (the landing page): the script plus the effect that keeps the theme in step. */
export function PublicTheme() {
  return (
    <>
      <PublicThemeScript />
      <PublicThemeEffect />
    </>
  )
}
