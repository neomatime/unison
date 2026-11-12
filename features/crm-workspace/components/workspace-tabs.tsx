'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type WorkspaceTab = { id: string; label: string; count?: number; content: ReactNode }

/**
 * One section of a record at a time, instead of every section stacked down a long page. The panels are
 * rendered by the server and stay mounted while hidden, so a half-written note or follow-up survives a
 * switch of tab. Arrow keys, Home and End move between tabs.
 */
export function WorkspaceTabs({ tabs, label = 'Record sections' }: { tabs: readonly WorkspaceTab[]; label?: string }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    setActive(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-6 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node
              }}
              type="button"
              role="tab"
              id={`workspace-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`workspace-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:text-brand',
                selected ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count ? <span className="min-w-5 bg-muted px-1.5 text-center text-xs text-muted-foreground">{tab.count}</span> : null}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`workspace-panel-${tab.id}`}
          aria-labelledby={`workspace-tab-${tab.id}`}
          hidden={tab.id !== active}
          className="mt-5"
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
