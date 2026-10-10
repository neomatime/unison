'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'

import { RelativeTime } from '@/features/crm-overview/components/local-time'
import { deleteActivityAction, loadMoreTimelineAction, logActivityAction, updateActivityAction } from '../actions/activities'
import type { ParentKind, TimelineEntry, TimelinePage } from '../types'
import { ACTIVITY_LABELS, LOGGED_ACTIVITY_KINDS } from '../vocabulary'
import { ActionButton } from './action-button'
import { area, Feedback, input } from './form-parts'
import { OccurredAtField } from './occurred-at-field'
import { WorkspaceSection } from './workspace-section'

type Props = {
  kind: ParentKind
  id: string
  initial: TimelinePage
  currentUserId: string
  canModerate: boolean
}

export function TimelineSection({ kind, id, initial, currentUserId, canModerate }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>(initial.entries)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()

  // A save refreshes the page, which hands down a new first page; show it.
  useEffect(() => {
    setEntries(initial.entries)
    setHasMore(initial.hasMore)
  }, [initial])

  function loadMore() {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadError(null)
    startLoading(async () => {
      const result = await loadMoreTimelineAction(kind, id, last.occurredAt, last.id)
      if ('error' in result) return setLoadError(result.error)
      setEntries((current) => [...current, ...result.entries])
      setHasMore(result.hasMore)
    })
  }

  return (
    <WorkspaceSection title="Timeline" description="Calls, meetings, emails and notes, with the key changes to this record.">
      <LogActivityForm kind={kind} id={id} />
      {entries.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {entries.map((entry) => {
            const canChange = !entry.system && (entry.createdBy === currentUserId || canModerate)
            return (
              <li key={entry.id}>
                {editingId === entry.id ? (
                  <EditEntryForm entry={entry} onDone={() => setEditingId(null)} />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        <span className={entry.system ? 'mr-2 text-xs font-semibold text-[var(--briefing-muted)] uppercase' : 'mr-2 text-xs font-semibold text-brand uppercase'}>
                          {ACTIVITY_LABELS[entry.kind] ?? entry.kind}
                        </span>
                        {entry.subject}
                      </p>
                      {entry.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--briefing-muted)]">{entry.body}</p> : null}
                      <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                        {entry.system ? 'System' : entry.author ?? 'Former member'} · <RelativeTime iso={entry.occurredAt} />
                      </p>
                    </div>
                    {canChange ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditingId(entry.id)} className="border border-border px-3 py-1.5 text-xs font-semibold">Edit</button>
                        <ActionButton action={deleteActivityAction.bind(null, entry.id)} label="Remove" tone="danger" confirmText="Remove this entry? This cannot be undone." />
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="border-t border-border px-5 py-6 text-sm text-[var(--briefing-muted)]">Nothing on the timeline yet.</p>
      )}
      {loadError ? <p role="alert" className="px-5 py-3 text-sm text-destructive">{loadError}</p> : null}
      {hasMore ? (
        <div className="border-t border-border px-5 py-3">
          <button type="button" onClick={loadMore} disabled={loading} className="border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </WorkspaceSection>
  )
}

function KindSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="kind" aria-label="Type of activity" defaultValue={defaultValue ?? 'note'} className={input}>
      {LOGGED_ACTIVITY_KINDS.map((kind) => <option key={kind} value={kind}>{ACTIVITY_LABELS[kind]}</option>)}
    </select>
  )
}

function LogActivityForm({ kind, id }: { kind: ParentKind; id: string }) {
  const [state, action, pending] = useActionState(logActivityAction.bind(null, kind, id), undefined)
  return (
    <form action={action} className="grid gap-3 p-5 md:grid-cols-2">
      <KindSelect />
      <OccurredAtField />
      <input name="subject" required aria-label="Subject" placeholder="What happened?" className={`${input} md:col-span-2`} />
      <textarea name="body" aria-label="Notes" placeholder="Notes" className={`${area} md:col-span-2`} />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <button disabled={pending} className="ml-auto bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Log activity</button>
      </div>
    </form>
  )
}

function EditEntryForm({ entry, onDone }: { entry: TimelineEntry; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateActivityAction.bind(null, entry.id), undefined)
  useEffect(() => {
    if (state?.success) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="grid gap-3 bg-muted/20 p-5 md:grid-cols-2">
      <KindSelect defaultValue={entry.kind} />
      <OccurredAtField defaultValue={entry.occurredAt} />
      <input name="subject" required aria-label="Subject" defaultValue={entry.subject} className={`${input} md:col-span-2`} />
      <textarea name="body" aria-label="Notes" defaultValue={entry.body ?? ''} className={`${area} md:col-span-2`} />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onDone} className="border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
          <button disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save changes</button>
        </div>
      </div>
    </form>
  )
}
