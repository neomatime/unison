'use client'

import { useEffect } from 'react'

import { THEME_KEY, resolveTheme } from '@/lib/ui/theme'

/**
 * The client half of PublicTheme. Dark mode for the public pages (landing, sign-in, invitation). It follows the choice saved in the signed-in app, or the
 * computer's own light or dark setting when none is saved, and takes the `dark` class off again when the page goes away so the
 * quote page, printed documents and the other sign-in pages are never dark. The boot script sets the class before the first
 * paint, so there is no light flash.
 */
export function PublicThemeEffect() {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      let stored: string | null = null
      try { stored = window.localStorage.getItem(THEME_KEY) } catch { /* a blocked store means the computer's setting decides */ }
      root.classList.toggle('dark', resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches) === 'dark')
    }
    apply()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    window.addEventListener('storage', apply)
    return () => {
      media.removeEventListener('change', apply)
      window.removeEventListener('storage', apply)
      root.classList.remove('dark')
    }
  }, [])
  return null
}
