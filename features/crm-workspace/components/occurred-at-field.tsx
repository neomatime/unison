'use client'

import { useState } from 'react'

import { input } from './form-parts'

/**
 * A date and time the viewer picks in their own timezone, sent to the server as an exact ISO instant.
 * The only state is the picker's local value; the hidden field is derived from it at render, so the two
 * can never disagree (not even after React resets the form, which leaves a controlled input as it was).
 */
export function OccurredAtField({ defaultValue }: { defaultValue?: string | null }) {
  const initial = defaultValue ? toLocalInput(defaultValue) : ''
  const [local, setLocal] = useState(initial)
  // Untouched, keep the stored instant exactly (the picker only holds whole minutes).
  const iso = initial && local === initial && defaultValue ? defaultValue : toIso(local)
  return (
    <>
      <input
        type="datetime-local"
        aria-label="When it happened"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        className={input}
      />
      <input type="hidden" name="occurredAt" value={iso} />
    </>
  )
}

function toIso(local: string) {
  if (!local) return ''
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function toLocalInput(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
