'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const minimumVisibleTime = 420

export function NavigationLoading() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
  const startedAt = useRef(0)
  const previousPathname = useRef(pathname)

  function begin() {
    startedAt.current = Date.now()
    activeRef.current = true
    setActive(true)
  }

  function finish() {
    activeRef.current = false
    setActive(false)
  }

  useEffect(() => {
    function handleNavigationClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank' || anchor.getAttribute('aria-disabled') === 'true') return

      const nextUrl = new URL(anchor.href, window.location.href)
      const currentUrl = new URL(window.location.href)
      if (nextUrl.origin !== currentUrl.origin) return
      if (`${nextUrl.pathname}${nextUrl.search}` === `${currentUrl.pathname}${currentUrl.search}`) return
      begin()
    }

    document.addEventListener('click', handleNavigationClick, true)
    window.addEventListener('popstate', begin)
    window.addEventListener('unison:navigation-start', begin)
    return () => {
      document.removeEventListener('click', handleNavigationClick, true)
      window.removeEventListener('popstate', begin)
      window.removeEventListener('unison:navigation-start', begin)
    }
  }, [])

  useEffect(() => {
    if (pathname === previousPathname.current) return
    previousPathname.current = pathname
    if (!activeRef.current) return
    const remaining = Math.max(0, minimumVisibleTime - (Date.now() - startedAt.current))
    const timer = window.setTimeout(finish, remaining)
    return () => window.clearTimeout(timer)
  }, [pathname])

  useEffect(() => {
    if (!active) return
    const safetyTimer = window.setTimeout(finish, 8000)
    return () => window.clearTimeout(safetyTimer)
  }, [active])

  if (!active) return null

  return <div role="status" aria-live="polite" aria-label="Loading next screen" className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
    <span className="sr-only">Loading next screen</span>
    <div className="relative h-0.5 overflow-hidden bg-brand/10">
      <div className="absolute inset-y-0 w-2/5 bg-brand/85 [animation:unison-navigation-progress_1.15s_var(--ease-unison)_infinite]" />
    </div>
    <div className="mx-auto mt-2 flex w-fit items-center gap-2 border border-border/80 bg-card/95 px-3 py-1.5 text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase shadow-sm">
      <span className="unison-loading-dot size-1.5 bg-brand" />
      Preparing view
    </div>
  </div>
}
