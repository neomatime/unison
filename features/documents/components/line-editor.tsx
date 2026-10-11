'use client'

import { useActionState, useEffect, useState, useTransition, type ChangeEvent } from 'react'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatCurrency } from '@/lib/utils/format-money'
import { addLineAction, addRateCardLineAction, moveLineAction, removeLineAction, updateLineAction } from '../actions/lines'
import { formatQuantity } from '../document-view'
import type { DocumentLine, PriceItem, RateCardItem } from '../types'
import { VAT_CODES, VAT_LABELS, type DocumentKind, type VatCode } from '../vocabulary'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'

const LOCKED_NOTE: Record<DocumentKind, string> = {
  quote: 'This document has been sent or issued, so its lines are frozen. To revise it, duplicate it as a new draft.',
  invoice: 'This document has been sent or issued, so its lines are frozen. To correct it, cancel it and raise a new one.',
}

type Totals = { subtotal: number | string; tax: number | string; total: number | string; vatRate: number | string }

export function LineEditor({
  kind, documentId, lines, priceItems, rateItems, locked, currency, totals,
}: {
  kind: DocumentKind
  documentId: string
  lines: DocumentLine[]
  priceItems: PriceItem[]
  rateItems: RateCardItem[]
  locked: boolean
  currency: string
  totals: Totals
}) {
  const money = (amount: number | string) => formatCurrency(Number(amount), currency)
  return (
    <WorkspaceSection
      title="Lines"
      description={locked ? LOCKED_NOTE[kind] : 'What is being sold. The VAT and the total are calculated for you.'}
    >
      {lines.length ? (
        <ul className="divide-y divide-border">
          {lines.map((line, index) => (
            <LineRow key={line.id} kind={kind} documentId={documentId} line={line} index={index} count={lines.length} locked={locked} money={money} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No lines yet.{locked ? '' : ' Add the first one below.'}</p>
      )}
      <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-border px-5 py-4 text-sm">
        <dt className="text-[var(--briefing-muted)]">Subtotal</dt>
        <dd className="text-right">{money(totals.subtotal)}</dd>
        <dt className="text-[var(--briefing-muted)]">VAT ({Number(totals.vatRate)}%)</dt>
        <dd className="text-right">{money(totals.tax)}</dd>
        <dt className="font-semibold text-foreground">Total</dt>
        <dd className="text-right font-semibold text-foreground">{money(totals.total)}</dd>
      </dl>
      {locked ? null : <RateCardPicker kind={kind} documentId={documentId} rateItems={rateItems} currency={currency} />}
      {locked ? null : <AddLineForm kind={kind} documentId={documentId} priceItems={priceItems} />}
    </WorkspaceSection>
  )
}

function LineRow({
  kind, documentId, line, index, count, locked, money,
}: {
  kind: DocumentKind
  documentId: string
  line: DocumentLine
  index: number
  count: number
  locked: boolean
  money: (amount: number | string) => string
}) {
  const [editing, setEditing] = useState(false)
  if (editing && !locked && !line.rate_locked) {
    return (
      <li className="px-5 py-4">
        <EditLineForm kind={kind} line={line} onDone={() => setEditing(false)} />
      </li>
    )
  }
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-foreground">{line.title}</p>
        {line.description ? <p className="whitespace-pre-line break-words text-xs text-[var(--briefing-muted)]">{line.description}</p> : null}
        {line.rate_locked ? <p className="mt-1 text-xs font-medium text-[var(--briefing-muted)]">Rate card price. It cannot be changed here.</p> : null}
        <p className="mt-1 text-xs text-[var(--briefing-muted)]">
          {formatQuantity(line.quantity)} × {money(line.unit_price)} · {VAT_LABELS[line.vat_code as VatCode] ?? line.vat_code} ={' '}
          <span className="font-semibold text-foreground">{money(line.line_amount)}</span>
        </p>
      </div>
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          {line.rate_locked ? null : (
            <button type="button" onClick={() => setEditing(true)} aria-label={`Edit line: ${line.title}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
              Edit
            </button>
          )}
          {index > 0 ? <ActionButton action={moveLineAction.bind(null, kind, documentId, line.id, 'up')} label="Up" ariaLabel={`Up: ${line.title}`} /> : null}
          {index < count - 1 ? <ActionButton action={moveLineAction.bind(null, kind, documentId, line.id, 'down')} label="Down" ariaLabel={`Down: ${line.title}`} /> : null}
          <ActionButton action={removeLineAction.bind(null, kind, line.id)} label="Remove" ariaLabel={`Remove: ${line.title}`} confirmText="Remove this line?" tone="danger" />
        </div>
      )}
    </li>
  )
}

function VatSelect({ value, onChange, defaultValue }: { value?: string; onChange?: (next: string) => void; defaultValue?: string }) {
  return (
    <select
      name="vatCode"
      aria-label="VAT"
      {...(value !== undefined ? { value, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange?.(event.target.value) } : { defaultValue })}
      className={field}
    >
      {VAT_CODES.map((code) => <option key={code} value={code}>{VAT_LABELS[code]}</option>)}
    </select>
  )
}

function EditLineForm({ kind, line, onDone }: { kind: DocumentKind; line: DocumentLine; onDone: () => void }) {
  const [state, run, pending] = useActionState(updateLineAction.bind(null, kind, line.id), undefined)
  const [, startTransition] = useTransition()
  useEffect(() => {
    if (state?.success) onDone()
  }, [state, onDone])
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]"
    >
      <input type="hidden" name="priceListItemId" value={line.price_list_item_id ?? ''} />
      <input name="title" required aria-label="Title" defaultValue={line.title} className={field} />
      <input name="quantity" required inputMode="decimal" aria-label="Quantity" defaultValue={String(line.quantity)} className={field} />
      <input name="unitPrice" required inputMode="decimal" aria-label="Unit price" defaultValue={String(line.unit_price)} className={field} />
      <VatSelect defaultValue={line.vat_code} />
      <textarea name="description" rows={2} aria-label="Description" defaultValue={line.description ?? ''} className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm md:col-span-4" />
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-4">{state.error}</p> : null}
      <div className="flex gap-2 md:col-span-4">
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : 'Save line'}</button>
        <button type="button" onClick={onDone} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button>
      </div>
    </form>
  )
}

const EMPTY = { title: '', description: '', quantity: '1', unitPrice: '', vatCode: 'standard', priceListItemId: '' }

function AddLineForm({ kind, documentId, priceItems }: { kind: DocumentKind; documentId: string; priceItems: PriceItem[] }) {
  const [state, run, pending] = useActionState(addLineAction.bind(null, kind, documentId), undefined)
  const [, startTransition] = useTransition()
  const [fields, setFields] = useState(EMPTY)
  const set = (key: keyof typeof EMPTY, next: string) => setFields((current) => ({ ...current, [key]: next }))

  // A saved line starts a fresh form; a failed one keeps what was typed.
  useEffect(() => {
    if (state?.success) setFields(EMPTY)
  }, [state])

  function pick(id: string) {
    const item = priceItems.find((candidate) => candidate.id === id)
    if (!item) {
      set('priceListItemId', '')
      return
    }
    setFields((current) => ({
      ...current,
      priceListItemId: item.id,
      title: item.title,
      description: item.description ?? '',
      unitPrice: String(item.unit_price),
      vatCode: item.vat_code,
    }))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData()
        for (const [key, value] of Object.entries(fields)) data.set(key, value)
        startTransition(() => run(data))
      }}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-[2fr_1fr_1fr_1fr]"
    >
      <label className="md:col-span-4">
        <span className="sr-only">Fill from the price list</span>
        <select aria-label="Fill from the price list" value={fields.priceListItemId} onChange={(event) => pick(event.target.value)} className={field}>
          <option value="">One-off line (type it below)</option>
          {priceItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <input aria-label="Title" placeholder="Title" required value={fields.title} onChange={(event) => set('title', event.target.value)} className={field} />
      <input aria-label="Quantity" placeholder="Quantity" required inputMode="decimal" value={fields.quantity} onChange={(event) => set('quantity', event.target.value)} className={field} />
      <input aria-label="Unit price" placeholder="Unit price" required inputMode="decimal" value={fields.unitPrice} onChange={(event) => set('unitPrice', event.target.value)} className={field} />
      <VatSelect value={fields.vatCode} onChange={(next) => set('vatCode', next)} />
      <textarea aria-label="Description" placeholder="Description (optional)" rows={2} value={fields.description} onChange={(event) => set('description', event.target.value)} className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm md:col-span-4" />
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-4">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-success md:col-span-4">{state.success}</p> : null}
      <div className="md:col-span-4">
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Adding…' : 'Add line'}</button>
      </div>
    </form>
  )
}

const RATE_GROUPS: ReadonlyArray<readonly [kinds: readonly string[], label: string]> = [
  [['retainer_monthly'], 'Retainers (monthly fee)'],
  [['retainer_implementation'], 'Retainer implementation fees (one-time)'],
  [['project'], 'Projects (fixed fee)'],
  [['support'], 'Support services (monthly)'],
  [['retainer_top_up', 'project_top_up'], 'Top-up credits (per credit)'],
]
const TOP_UP_KINDS = ['retainer_top_up', 'project_top_up']

/** Adds one rate card item at its fixed price. The line is locked: its price and quantity cannot be changed on the document. */
function RateCardPicker({ kind, documentId, rateItems, currency }: { kind: DocumentKind; documentId: string; rateItems: RateCardItem[]; currency: string }) {
  const [state, run, pending] = useActionState(addRateCardLineAction.bind(null, kind, documentId), undefined)
  const [, startTransition] = useTransition()
  const [rateKey, setRateKey] = useState('')
  const [quantity, setQuantity] = useState('1')
  const chosen = rateItems.find((item) => item.rate_key === rateKey)
  const isTopUp = chosen ? TOP_UP_KINDS.includes(chosen.item_kind) : false
  useEffect(() => {
    if (state?.success) {
      setRateKey('')
      setQuantity('1')
    }
  }, [state])
  if (rateItems.length === 0) return null
  if (currency !== 'ZAR') {
    return <p className="border-t border-border px-5 py-4 text-xs text-[var(--briefing-muted)]">The rate card is in rand. Set this document's currency to ZAR to add rate card items.</p>
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData()
        data.set('rateKey', rateKey)
        data.set('quantity', isTopUp ? quantity : '1')
        startTransition(() => run(data))
      }}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-[3fr_1fr_auto]"
    >
      <label className="md:col-span-3">
        <span className="text-xs font-semibold text-[var(--briefing-muted)]">Add from the rate card (fixed prices, excluding VAT)</span>
        <select aria-label="Add from the rate card" value={rateKey} onChange={(event) => setRateKey(event.target.value)} className={`mt-1 ${field}`}>
          <option value="">Choose a retainer, project, support service or top-up…</option>
          {RATE_GROUPS.map(([kinds, label]) => {
            const items = rateItems.filter((item) => kinds.includes(item.item_kind))
            if (items.length === 0) return null
            return (
              <optgroup key={label} label={label}>
                {items.map((item) => (
                  <option key={item.rate_key} value={item.rate_key}>
                    {item.title}: {formatCurrency(Number(item.unit_price), currency)}{item.rate_status === 'proposed' ? ' (proposed rate)' : ''}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </label>
      <p className="text-xs text-[var(--briefing-muted)] md:col-span-3">This adds a priced line only. Credits are described in the line text; no client package or credit balance is set up.</p>
      {chosen?.description ? <p className="text-xs text-[var(--briefing-muted)] md:col-span-3">{chosen.description}</p> : null}
      {isTopUp ? (
        <input aria-label="Credits" inputMode="numeric" pattern="[0-9]*" required placeholder="Credits" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={field} />
      ) : null}
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-3">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-success md:col-span-3">{state.success}</p> : null}
      <div className="md:col-span-3">
        <button type="submit" disabled={pending || !rateKey} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Adding…' : 'Add from rate card'}</button>
      </div>
    </form>
  )
}
