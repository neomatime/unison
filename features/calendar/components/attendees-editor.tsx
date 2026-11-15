'use client'

import { Mail, X } from 'lucide-react'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'

import { cleanSearch, isEmail, MAX_ATTENDEES, parseAttendees, type Attendee, type Person } from '../attendees'

/** Who is invited, as in Teams: required attendees, and optional attendees below them. Type to search team members and clients'
 *  contacts (nothing is listed until something is typed, and only a few matches come back), then click one; or type a whole email
 *  address and press Enter. Both lists go in one JSON field, `attendees`, each optional one marked `optional: true`. Someone is in
 *  one list or the other, not both. */
export function AttendeesEditor({ value }: { value: unknown }) {
  const initial = parseAttendees(value)
  const [invited, setInvited] = useState<Attendee[]>(initial)

  const add = (person: Attendee) => setInvited((all) => (all.length >= MAX_ATTENDEES ? all : parseAttendees([...all.filter((one) => one.email !== person.email.toLowerCase()), person])))
  const remove = (email: string) => setInvited((all) => all.filter((one) => one.email !== email))

  return (
    <div className="flex flex-col gap-5 md:col-span-2">
      <input type="hidden" name="attendees" value={JSON.stringify(invited)} />
      <input type="hidden" name="attendeesWas" value={initial.length} />
      <AttendeeList title="Required attendees" hint="Microsoft Teams emails each of them the invitation when you save, if Online meeting is on. Changes you make later update it." optional={false} invited={invited} onAdd={add} onRemove={remove} />
      <AttendeeList title="Optional attendees" hint="Invited too, marked optional in their invitation." optional invited={invited} onAdd={add} onRemove={remove} />
    </div>
  )
}

type Search = { state: 'idle' } | { state: 'loading' } | { state: 'done'; people: Person[] } | { state: 'failed' }

function AttendeeList({ title, hint, optional, invited, onAdd, onRemove }: {
  title: string
  hint: string
  optional: boolean
  invited: Attendee[]
  onAdd: (person: Attendee) => void
  onRemove: (email: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState<Search>({ state: 'idle' })
  const listId = useId()
  const mine = invited.filter((person) => Boolean(person.optional) === optional)
  const term = cleanSearch(query)
  const typedEmail = isEmail(query) && !invited.some((person) => person.email === query.trim().toLowerCase())

  // Search the server a moment after typing stops. Nothing is asked for fewer than two characters, and an answer that arrives after
  // the text has changed again is thrown away.
  useEffect(() => {
    if (!term) {
      setSearch({ state: 'idle' })
      return
    }
    setSearch({ state: 'loading' })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/calendar/people?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('search failed')
        const payload = (await response.json()) as { people?: Person[] }
        setSearch({ state: 'done', people: payload.people ?? [] })
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') setSearch({ state: 'failed' })
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  // Everyone already invited, in either list, is left out of the results.
  const taken = new Set(invited.map((person) => person.email.toLowerCase()))
  const matches = search.state === 'done' ? search.people.filter((person) => !taken.has(person.email.toLowerCase())) : []
  const showPanel = open && term !== ''

  const add = (person: Attendee) => {
    onAdd(optional ? { ...person, optional: true } : person)
    setQuery('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') setOpen(false)
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    if (typedEmail) add({ name: query.trim(), email: query.trim() })
    else if (matches[0] && !isEmail(query)) add({ name: matches[0].name, email: matches[0].email })
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{title}</legend>
      {mine.length ? (
        <ul className="flex flex-wrap gap-2">
          {mine.map((person) => (
            <li key={person.email} className="inline-flex max-w-full items-center gap-2 border border-border bg-muted py-1 pr-1 pl-2.5 text-sm">
              <span className="truncate" title={person.email}>{person.name}</span>
              <button type="button" onClick={() => onRemove(person.email)} aria-label={`Remove ${person.name}`} className="inline-flex size-6 items-center justify-center outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"><X aria-hidden="true" className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-label={`Search ${title.toLowerCase()} by name, client or email`}
          autoComplete="off"
          value={query}
          placeholder="Search by name, client or email"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand"
        />
        {showPanel ? (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto border border-border bg-popover shadow-lg">
            {search.state === 'loading' ? <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">Searching…</li> : null}
            {search.state === 'failed' ? <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">The search is unavailable. You can still type a whole email address.</li> : null}
            {matches.map((person) => (
              <li key={person.email} role="option" aria-selected="false">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add({ name: person.name, email: person.email })} className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                  <span className="min-w-0 truncate">{person.name}<span className="ml-2 text-xs text-muted-foreground">{person.email}</span></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{person.group}</span>
                </button>
              </li>
            ))}
            {search.state === 'done' && !matches.length && !typedEmail ? <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">No one found. Type a whole email address to invite someone new.</li> : null}
            {typedEmail ? (
              <li role="option" aria-selected="false">
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add({ name: query.trim(), email: query.trim() })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand hover:bg-accent">
                  <Mail aria-hidden="true" className="size-4" />Invite {query.trim()}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </fieldset>
  )
}
