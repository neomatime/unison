'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type React from 'react'

import { UtilityPanel, type UtilityPanelKind } from '@/components/shared/utility-panel'

type UtilityContextValue = {
  open: (kind: UtilityPanelKind) => void
  unread: number
}

const UtilityContext = createContext<UtilityContextValue | null>(null)

/**
 * Search, notifications and help: one panel, opened from the top bar (or the mobile header) or with
 * Ctrl/Cmd+K. It also keeps the unread count the bell shows, so the number lives in one place.
 */
export function UtilityProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<UtilityPanelKind | null>(null)
  const [unread, setUnread] = useState(0)
  const close = useCallback(() => setPanel(null), [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPanel('search')
      }
    }
    function handleCount(event: Event) {
      setUnread(Number((event as CustomEvent<number>).detail) || 0)
    }
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('unison:notification-count', handleCount)
    void fetch('/api/notifications', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const payload = (await response.json()) as { notifications?: Array<{ read_at: string | null }> }
      setUnread((payload.notifications ?? []).filter((item) => !item.read_at).length)
    })
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('unison:notification-count', handleCount)
    }
  }, [])

  const value = useMemo(() => ({ open: setPanel, unread }), [unread])
  return (
    <UtilityContext.Provider value={value}>
      {children}
      <UtilityPanel kind={panel ?? 'help'} open={panel !== null} onClose={close} />
    </UtilityContext.Provider>
  )
}

export function useUtilities() {
  const context = useContext(UtilityContext)
  if (!context) throw new Error('useUtilities must be used within a UtilityProvider')
  return context
}
