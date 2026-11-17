'use client'

import { Moon, Sun } from 'lucide-react'

import { THEME_KEY } from '@/lib/ui/theme'
import { cn } from '@/lib/utils'

/**
 * Light or dark for a public page. It flips the `dark` class on <html> and keeps the choice in this browser under the same key the
 * signed-in app uses, so the sign-in page and the workspace open in the mode that was just chosen. Both icons are always in the
 * page and CSS shows the one that matches, so there is nothing to wait for and nothing that differs from the server's HTML.
 */
export function PublicThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement
    const dark = !root.classList.contains('dark')
    root.classList.toggle('dark', dark)
    try { window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light') } catch { /* the page still changes; it just is not remembered */ }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Light or dark mode"
      className={cn('inline-flex size-11 items-center justify-center outline-none transition-colors duration-300 ease-out hover:text-[color:var(--pub-text-1769aa)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769aa] motion-reduce:transition-none', className)}
    >
      <Moon className="size-[1.125rem] dark:hidden" strokeWidth={1.75} aria-hidden="true" />
      <Sun className="hidden size-[1.125rem] dark:block" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
