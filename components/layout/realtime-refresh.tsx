'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createBrowserSupabase } from '@/lib/supabase/client'

export function RealtimeRefresh({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const refreshTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    const channel = supabase.channel(`workspace:${organizationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'record_change_events', filter: `organization_id=eq.${organizationId}` }, () => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
        refreshTimer.current = window.setTimeout(() => {
          router.refresh()
          setUpdated(true)
          if (hideTimer.current) window.clearTimeout(hideTimer.current)
          hideTimer.current = window.setTimeout(() => setUpdated(false), 2500)
        }, 300)
      })
      .subscribe()
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [organizationId, router, supabase])

  return updated ? <div role="status" className="pointer-events-none fixed right-5 bottom-5 z-[55] border border-brand/20 bg-card px-3 py-2 text-xs font-semibold text-brand shadow-lg">Workspace updated</div> : null
}
