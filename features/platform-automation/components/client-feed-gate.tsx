'use client'

import { ListFilter, LoaderCircle } from 'lucide-react'
import { useActionState, useId, useState, useTransition } from 'react'

import { setClientFeedGateAction } from '../client-feed-actions'
import type { ClientFeedGateStatus } from '../client-feed-queries'

const ACKNOWLEDGEMENT = "I have told HIVE's maintainers that the feed will include only clients with an accepted quote"

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value))
}

/**
 * The switch that limits the HIVE client feed to clients with an accepted quote (quote portal, slice 3), with what turning
 * it on does shown first. It is a small form of its own, called by hand so that React does not reset the checkboxes after
 * it runs. UNISON can say who would be in the feed and when HIVE last read it, and nothing about what HIVE did with it.
 */
export function ClientFeedGate({ gate }: { gate: ClientFeedGateStatus }) {
  const [state, run, pending] = useActionState(setClientFeedGateAction, undefined)
  const [, startTransition] = useTransition()
  const [wanted, setWanted] = useState(gate.enabled)
  const [dirty, setDirty] = useState(false)
  const headingId = useId()

  return (
    <section className="mt-5 overflow-hidden border border-border bg-card" aria-labelledby={headingId}>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <ListFilter className="mt-0.5 size-5 text-brand" aria-hidden />
        <h2 id={headingId} className="unison-section-title text-sm">HIVE client feed</h2>
      </header>
      <form
        onChange={() => setDirty(true)}
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          setDirty(false)
          startTransition(() => run(data))
        }}
        className="space-y-4 p-5"
      >
        <FeedGateFields gate={gate} wanted={wanted} onWanted={setWanted} />
        <div role="status" aria-live="polite">
          {state?.success && !dirty && !pending ? (
            <p className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p>
          ) : null}
        </div>
        {state?.error && !dirty && !pending ? (
          <p role="alert" className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? 'Saving…' : 'Save feed setting'}
        </button>
      </form>
    </section>
  )
}

/**
 * What the form shows and asks. The acknowledgement appears whenever the first checkbox is ticked and is pre-ticked only
 * when the saved setting is already on (it was acknowledged when it was switched on, so re-saving does not ask again);
 * while the saved setting is off it starts unticked. Turning the setting off needs none, so unticking the first box hides it.
 */
export function FeedGateFields({ gate, wanted, onWanted }: { gate: ClientFeedGateStatus; wanted: boolean; onWanted: (wanted: boolean) => void }) {
  const id = useId()
  const helpId = `${id}-help`
  const effectId = `${id}-effect`
  const counts = `Today ${gate.withAcceptedQuote} of ${gate.totalClients} clients have an accepted quote.`
  const others = gate.totalClients - gate.withAcceptedQuote

  return (
    <>
      <p id={helpId} className="text-sm text-muted-foreground">
        By default HIVE reads every client of this organisation. Turn this on to include only clients with an accepted quote.
      </p>
      <div id={effectId} className="space-y-1 text-sm text-muted-foreground">
        <p>
          {gate.enabled
            ? `${counts} The other ${others} are not in the feed. HIVE keeps anything it has already read.`
            : `${counts} Turning this on removes the other ${others} from the feed. HIVE keeps anything it has already read.`}
        </p>
        {gate.hasLiveKey ? null : <p>No feed key is active yet, so nothing is reading the feed.</p>}
        <p>{gate.lastReadAt ? `HIVE last read the feed ${dateTime(gate.lastReadAt)}` : 'HIVE has not read the feed yet'}</p>
      </div>
      <label className="flex items-start gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" checked={wanted} onChange={(event) => onWanted(event.target.checked)} aria-describedby={`${helpId} ${effectId}`} className="mt-1" />
        <span>Only include clients with an accepted quote</span>
      </label>
      {wanted ? (
        <label className="flex items-start gap-3 text-sm font-medium">
          <input type="checkbox" name="acknowledged" defaultChecked={gate.enabled} required className="mt-1" />
          <span>{ACKNOWLEDGEMENT}</span>
        </label>
      ) : null}
    </>
  )
}
