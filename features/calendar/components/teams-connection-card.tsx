'use client'

import { Video } from 'lucide-react'
import { useId, useState, useTransition } from 'react'

import { StatusDot } from '@/components/ui/status-dot'
import type { TeamsTestResult } from '@/lib/integrations/teams-meeting'
import { testTeamsConnectionAction } from '../actions'

const VARIABLES = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'TEAMS_ORGANIZER_UPN']

/** Settings > Integrations: whether calendar events can be given a Microsoft Teams meeting. It shows the organiser mailbox
 *  (an address) and, when not connected, which settings are missing. It never shows a secret. */
export function TeamsConnectionCard({ status, organizer, canManage }: { status: { connected: boolean; missing: string[] }; organizer: string | null; canManage: boolean }) {
  const headingId = useId()
  const [result, setResult] = useState<TeamsTestResult | null>(null)
  const [pending, start] = useTransition()

  return (
    <section className="mt-5 overflow-hidden border border-border bg-card" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <Video className="size-5 text-brand" aria-hidden="true" />
          <h2 id={headingId} className="unison-section-title text-sm">Microsoft Teams</h2>
        </div>
        <StatusDot status={status.connected ? 'Connected' : 'Not connected'} tone={status.connected ? 'positive' : 'attention'} />
      </header>

      <div className="space-y-4 p-5 text-sm">
        <p className="max-w-3xl text-muted-foreground">
          Lets a calendar event be created with a Microsoft Teams meeting: the join link is saved on the event, and invited attendees get the invitation from Microsoft.
        </p>

        {status.connected ? (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Organiser mailbox</dt>
              <dd className="mt-1 break-all text-foreground">{organizer}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">Every meeting is created in this mailbox&apos;s calendar and is organised by this account.</dd>
            </div>
          </dl>
        ) : (
          <div className="space-y-3 border border-border bg-muted/40 p-4">
            <p className="font-medium text-foreground">Teams is not connected, so events cannot be given a meeting link yet.</p>
            <div>
              <p className="text-xs text-muted-foreground">These settings are needed on the server (names only; the values are never shown):</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {VARIABLES.map((name) => {
                  const missing = status.missing.includes(name)
                  return (
                    <li key={name} className="flex items-center gap-2 text-xs">
                      <span aria-hidden="true" className={missing ? 'size-2 rounded-full bg-warning' : 'size-2 rounded-full bg-muted-foreground/50'} />
                      <code className="text-foreground">{name}</code>
                      <span className="text-muted-foreground">{missing ? 'missing' : 'set'}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              The app registration also needs the <code className="text-foreground">Calendars.ReadWrite</code> application permission with admin consent, limited to the organiser mailbox. Step by step: <code className="text-foreground">docs/calendar/teams-setup.md</code>.
            </p>
          </div>
        )}

        {canManage && status.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setResult(null)
                start(async () => setResult(await testTeamsConnectionAction()))
              }}
              className="inline-flex h-9 items-center justify-center border border-border bg-card px-4 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            >
              {pending ? 'Testing…' : 'Test connection'}
            </button>
            <span className="text-xs text-muted-foreground">Reads the organiser&apos;s calendar from Microsoft. It does not create a meeting.</span>
          </div>
        ) : null}

        <div role="status" aria-live="polite">
          {result ? (
            <p className="flex max-w-3xl items-start gap-2 text-sm">
              <StatusDot status={result.ok ? 'Connected' : 'Failed'} tone={result.ok ? 'positive' : 'negative'} />
              <span className="text-foreground">{result.message}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
