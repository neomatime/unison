'use client'

import { useActionState, useEffect, useState, useTransition, type ChangeEvent } from 'react'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatCurrency } from '@/lib/utils/format-money'
import { addLineAction, moveLineAction, removeLineAction, updateLineAction } from '../actions/lines'
import { HiveOfferingPicker } from './hive-offering-picker'
import { formatQuantity } from '../document-view'
import type { DocumentLine, HiveOfferingsResult } from '../types'
import { CHARGE_KIND_LABELS, CHARGE_KINDS, VAT_CODES, VAT_LABELS, type ChargeKind, type DocumentKind, type VatCode } from '../vocabulary'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'

// A quote line also carries a charge kind (an invoice line has no such column), so a quote's form has one more column.
const FORM_LAYOUT: Record<DocumentKind, { grid: string; span: string }> = {
  quote: { grid: 'md:grid-cols-[2fr_1fr_1fr_1fr_1fr]', span: 'md:col-span-5' },
  invoice: { grid: 'md:grid-cols-[2fr_1fr_1fr_1fr]', span: 'md:col-span-4' },
}

const LOCKED_NOTE: Record<DocumentKind, string> = {
  quote: 'This document has been sent or issued, so its lines are frozen. Use Revise this quote if it is Sent, Declined or Expired (the revision replaces it once sent); an accepted quote cannot be revised, so use Duplicate as new draft.',
  invoice: 'This document has been sent or issued, so its lines are frozen. To correct it, cancel it and raise a new one.',
}

type Totals = { subtotal: number | string; tax: number | string; total: number | string; vatRate: number | string }

export function LineEditor({
  kind, documentId, lines, hiveOfferings, locked, currency, totals,
}: {
  kind: DocumentKind
  documentId: string
  lines: DocumentLine[]
  hiveOfferings: HiveOfferingsResult
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
      {locked ? null : <HiveOfferingPicker kind={kind} documentId={documentId} result={hiveOfferings} currency={currency} />}
      {locked ? null : <AddLineForm kind={kind} documentId={documentId} />}
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
  if (editing && !locked) {
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
        <p className="mt-1 text-xs text-[var(--briefing-muted)]">
          {formatQuantity(line.quantity)} × {money(line.unit_price)} · {VAT_LABELS[line.vat_code as VatCode] ?? line.vat_code}
          {line.charge_kind ? ` · ${CHARGE_KIND_LABELS[line.charge_kind as ChargeKind] ?? line.charge_kind}` : ''} ={' '}
          <span className="font-semibold text-foreground">{money(line.line_amount)}</span>
        </p>
      </div>
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit line: ${line.title}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
            Edit
          </button>
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

/** The same shape as VatSelect: controlled when given a value (the add form), otherwise it starts at defaultValue. `notSet` adds the blank option a line from before charge kinds needs. */
function ChargeKindSelect({
  value, onChange, defaultValue, notSet,
}: { value?: string; onChange?: (next: string) => void; defaultValue?: string; notSet?: boolean }) {
  return (
    <select
      name="chargeKind"
      aria-label="Charge kind"
      {...(value !== undefined ? { value, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange?.(event.target.value) } : { defaultValue })}
      className={field}
    >
      {notSet ? <option value="">Not set</option> : null}
      {CHARGE_KINDS.map((chargeKind) => <option key={chargeKind} value={chargeKind}>{CHARGE_KIND_LABELS[chargeKind]}</option>)}
    </select>
  )
}

function EditLineForm({ kind, line, onDone }: { kind: DocumentKind; line: DocumentLine; onDone: () => void }) {
  const [state, run, pending] = useActionState(updateLineAction.bind(null, kind, line.id), undefined)
  const [, startTransition] = useTransition()
  const layout = FORM_LAYOUT[kind]
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
      className={`grid gap-3 ${layout.grid}`}
    >
      <input name="title" required aria-label="Title" defaultValue={line.title} className={field} />
      <input name="quantity" required inputMode="decimal" aria-label="Quantity" defaultValue={String(line.quantity)} className={field} />
      <input name="unitPrice" required inputMode="decimal" aria-label="Unit price" defaultValue={String(line.unit_price)} className={field} />
      <VatSelect defaultValue={line.vat_code} />
      {kind === 'quote' ? <ChargeKindSelect defaultValue={line.charge_kind ?? ''} notSet /> : null}
      <textarea name="description" rows={2} aria-label="Description" defaultValue={line.description ?? ''} className={`w-full rounded-none border border-border bg-background px-3 py-2 text-sm ${layout.span}`} />
      {state?.error ? <p role="alert" className={`text-sm text-destructive ${layout.span}`}>{state.error}</p> : null}
      <div className={`flex gap-2 ${layout.span}`}>
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : 'Save line'}</button>
        <button type="button" onClick={onDone} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button>
      </div>
    </form>
  )
}

const EMPTY = { title: '', description: '', quantity: '1', unitPrice: '', vatCode: 'standard', chargeKind: 'once_off' }

function AddLineForm({ kind, documentId }: { kind: DocumentKind; documentId: string }) {
  const [state, run, pending] = useActionState(addLineAction.bind(null, kind, documentId), undefined)
  const [, startTransition] = useTransition()
  const [fields, setFields] = useState(EMPTY)
  const layout = FORM_LAYOUT[kind]
  const set = (key: keyof typeof EMPTY, next: string) => setFields((current) => ({ ...current, [key]: next }))

  // A saved line starts a fresh form; a failed one keeps what was typed.
  useEffect(() => {
    if (state?.success) setFields(EMPTY)
  }, [state])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData()
        for (const [key, value] of Object.entries(fields)) {
          if (key === 'chargeKind' && kind !== 'quote') continue
          data.set(key, value)
        }
        startTransition(() => run(data))
      }}
      className={`grid gap-3 border-t border-border p-5 ${layout.grid}`}
    >
      <input aria-label="Title" placeholder="Title" required value={fields.title} onChange={(event) => set('title', event.target.value)} className={field} />
      <input aria-label="Quantity" placeholder="Quantity" required inputMode="decimal" value={fields.quantity} onChange={(event) => set('quantity', event.target.value)} className={field} />
      <input aria-label="Unit price" placeholder="Unit price" required inputMode="decimal" value={fields.unitPrice} onChange={(event) => set('unitPrice', event.target.value)} className={field} />
      <VatSelect value={fields.vatCode} onChange={(next) => set('vatCode', next)} />
      {kind === 'quote' ? <ChargeKindSelect value={fields.chargeKind} onChange={(next) => set('chargeKind', next)} /> : null}
      <textarea aria-label="Description" placeholder="Description (optional)" rows={2} value={fields.description} onChange={(event) => set('description', event.target.value)} className={`w-full rounded-none border border-border bg-background px-3 py-2 text-sm ${layout.span}`} />
      {state?.error ? <p role="alert" className={`text-sm text-destructive ${layout.span}`}>{state.error}</p> : null}
      {state?.success ? <p role="status" className={`text-sm text-success ${layout.span}`}>{state.success}</p> : null}
      <div className={layout.span}>
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Adding…' : 'Add line'}</button>
      </div>
    </form>
  )
}
