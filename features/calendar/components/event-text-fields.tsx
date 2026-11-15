'use client'

import { Bold, Link2, List, ListOrdered, Plus, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'

import { AppInput } from '@/components/ui/input'
import { agendaMinutes, formatMinutes, MAX_AGENDA_ITEMS, parseAgenda } from '../description'

const tool = 'inline-flex size-8 items-center justify-center border border-border bg-card text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40'

/** The description box with a small toolbar: bold, bullets, numbered lines and a link. It writes the plain-text marks the
 *  description understands, so what is saved is still readable text. */
export function DescriptionEditor({ value }: { value: string }) {
  const [text, setText] = useState(value)
  const box = useRef<HTMLTextAreaElement>(null)

  function apply(change: (selected: string) => { text: string; select?: [number, number] }) {
    const el = box.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const result = change(text.slice(start, end))
    const next = text.slice(0, start) + result.text + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      const [from, to] = result.select ?? [start + result.text.length, start + result.text.length]
      el.setSelectionRange(start + from, start + to)
    })
  }

  const bold = () => apply((selected) => ({ text: `**${selected || 'bold text'}**`, select: [2, 2 + (selected || 'bold text').length] }))
  const lines = (mark: (index: number) => string) => () =>
    apply((selected) => {
      const body = (selected || 'item').split('\n').map((line, index) => mark(index) + line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')).join('\n')
      return { text: body, select: [0, body.length] }
    })
  const link = () =>
    apply((selected) => {
      const label = selected || 'link text'
      return { text: `[${label}](https://)`, select: [label.length + 3, label.length + 11] }
    })

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      bold()
    }
  }

  return (
    <div className="flex flex-col gap-1.5 md:col-span-2">
      <label htmlFor="event-description" className="text-sm font-medium">Description</label>
      <div role="toolbar" aria-label="Description formatting" className="flex gap-1">
        <button type="button" onClick={bold} aria-label="Bold" title="Bold (Ctrl+B)" className={tool}><Bold aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={lines(() => '- ')} aria-label="Bulleted list" title="Bulleted list" className={tool}><List aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={lines((index) => `${index + 1}. `)} aria-label="Numbered list" title="Numbered list" className={tool}><ListOrdered aria-hidden="true" className="size-4" /></button>
        <button type="button" onClick={link} aria-label="Link" title="Link" className={tool}><Link2 aria-hidden="true" className="size-4" /></button>
      </div>
      <textarea
        id="event-description"
        ref={box}
        name="description"
        rows={5}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full border border-border bg-background px-3 py-3 text-sm outline-none focus:border-brand"
      />
      <p className="text-xs text-muted-foreground">Bold, bulleted and numbered lists and links are supported. They also appear in the Teams invitation.</p>
    </div>
  )
}

type Row = { key: number; title: string; minutes: string }

/** The agenda as rows of a title and an optional length. The rows are sent as one JSON field, `agenda`. */
export function AgendaEditor({ value }: { value: unknown }) {
  const initial = parseAgenda(value)
  const next = useRef(initial.length + 1)
  const [rows, setRows] = useState<Row[]>(initial.map((item, index) => ({ key: index, title: item.title, minutes: item.minutes ? String(item.minutes) : '' })))
  const items = parseAgenda(rows.map((row) => ({ title: row.title, minutes: row.minutes })))
  const total = agendaMinutes(items)

  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  return (
    <fieldset className="flex flex-col gap-2 md:col-span-2">
      <legend className="mb-1.5 text-sm font-medium">Agenda</legend>
      <input type="hidden" name="agenda" value={JSON.stringify(items)} />
      <input type="hidden" name="agendaWas" value={initial.length} />
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 shrink-0 text-right text-sm text-muted-foreground">{index + 1}.</span>
          <AppInput aria-label={`Agenda item ${index + 1}`} value={row.title} onChange={(event) => update(row.key, { title: event.target.value })} placeholder="Topic" maxLength={200} className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
          <AppInput aria-label={`Minutes for item ${index + 1}`} type="number" min={1} max={600} value={row.minutes} onChange={(event) => update(row.key, { minutes: event.target.value })} placeholder="Min" className="h-10 w-20 border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
          <button type="button" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))} aria-label={`Remove agenda item ${index + 1}`} className={tool}><X aria-hidden="true" className="size-4" /></button>
        </div>
      ))}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={rows.length >= MAX_AGENDA_ITEMS}
          onClick={() => setRows((all) => [...all, { key: next.current++, title: '', minutes: '' }])}
          className="inline-flex h-9 items-center gap-2 border border-border bg-card px-3 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="size-4" />Add agenda item
        </button>
        {total ? <span className="text-xs text-muted-foreground">{formatMinutes(total)} planned</span> : null}
      </div>
    </fieldset>
  )
}
