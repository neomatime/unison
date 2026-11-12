'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type React from 'react'

import { THEME_KEY, otherTheme, resolveTheme, type Theme } from '@/lib/ui/theme'

type ThemeContextValue = { theme: Theme; toggle: () => void }

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Light or dark for the signed-in workspace only. It puts the `dark` class on <html> (so menus and
 * dialogs, which render outside the page, are dark too) and takes it off again when the workspace
 * unmounts, so sign-in and the public pages are never dark. The choice is kept in this browser.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    let stored: string | null = null
    try { stored = window.localStorage.getItem(THEME_KEY) } catch { /* a blocked store just means no saved choice */ }
    setTheme(resolveTheme(stored, window.matchMedia('(prefers-color-scheme: dark)').matches))
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    return () => root.classList.remove('dark')
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = otherTheme(current)
      try { window.localStorage.setItem(THEME_KEY, next) } catch { /* ignore */ }
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
