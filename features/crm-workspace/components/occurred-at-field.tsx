'use client'

import { useState } from 'react'

import { input } from './form-parts'

/** A date and time the viewer picks in their own timezone, sent to the server as an exact ISO instant. */
export function OccurredAtField({ defaultValue }: { defaultValue?: string | null }) {
  const [iso, setIso] = useState(defaultValue ?? '')
  const local = defaultValue ? toLocalInput(defaultValue) : ''
  return (
    <>
      <input
        type="datetime-local"
        aria-label="When it happened"
        defaultValue={local}
        onChange={(event) => setIso(event.target.value ? new Date(event.target.value).toISOString() : '')}
        className={input}
      />
      <input type="hidden" name="occurredAt" value={iso} />
    </>
  )
}

function toLocalInput(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
