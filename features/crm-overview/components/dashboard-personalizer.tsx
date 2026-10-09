'use client'

import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

type DashboardSection = { id: string; label: string; content: ReactNode }
const storageKey = 'unison.crm-overview.visible-sections.v1'

export function DashboardPersonalizer({ sections }: { sections: DashboardSection[] }) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((section) => [section.id, true])))
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, boolean>
      setVisible((current) => ({ ...current, ...saved }))
    } catch {
      // A corrupt or unavailable preference is non-critical; the full dashboard remains visible.
    }
  }, [])

  function toggle(id: string) {
    setVisible((current) => {
      const next = { ...current, [id]: !current[id] }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* browser storage can be unavailable */ }
      return next
    })
  }

  return <>
    <div className="mb-3 flex justify-end">
      <details className="relative">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><SlidersHorizontal className="size-3.5" />Customise overview</summary>
        <div className="absolute right-0 z-20 mt-2 w-64 border border-border bg-card p-3 shadow-lg">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">Visible sections</p>
          <div className="mt-2 space-y-2">{sections.map((section) => <label key={section.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible[section.id] !== false} onChange={() => toggle(section.id)} />{section.label}</label>)}</div>
          <p className="mt-3 text-xs text-muted-foreground">This preference stays on this device and does not change organisation reporting.</p>
        </div>
      </details>
    </div>
    <div className="space-y-4">{sections.map((section) => visible[section.id] === false ? null : <div key={section.id}>{section.content}</div>)}</div>
  </>
}
