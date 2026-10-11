'use client'

import Link from 'next/link'
import { useActionState, useTransition } from 'react'

import { savePriceItemAction } from '../actions/price-list'
import type { PriceItem } from '../types'
import { VAT_CODES, VAT_LABELS } from '../vocabulary'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'

export function PriceItemForm({ item }: { item: PriceItem | null }) {
  const [state, run, pending] = useActionState(savePriceItemAction.bind(null, item?.id), undefined)
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="grid gap-3 border border-border bg-card p-5 md:grid-cols-2"
    >
      <h2 className="unison-section-title text-xs text-foreground md:col-span-2">{item ? `Edit “${item.title}”` : 'Add an item'}</h2>
      <label className="text-sm font-medium">
        Title
        <input name="title" required aria-label="Title" defaultValue={item?.title ?? ''} className={`${field} mt-1.5`} />
      </label>
      <label className="text-sm font-medium">
        Unit price
        <input name="unitPrice" required inputMode="decimal" aria-label="Unit price" defaultValue={item ? String(item.unit_price) : ''} className={`${field} mt-1.5`} />
      </label>
      <label className="text-sm font-medium">
        VAT
        <select name="vatCode" aria-label="VAT" defaultValue={item?.vat_code ?? 'standard'} className={`${field} mt-1.5`}>
          {VAT_CODES.map((code) => <option key={code} value={code}>{VAT_LABELS[code]}</option>)}
        </select>
      </label>
      {item?.item_kind === 'retainer_monthly' ? (
        <label className="text-sm font-medium">
          Active projects allowed (leave empty for no limit)
          <input name="initiativeLimit" inputMode="numeric" aria-label="Active projects allowed" defaultValue={item.initiative_limit ?? ''} className={`${field} mt-1.5`} />
        </label>
      ) : null}
      <label className="text-sm font-medium md:col-span-2">
        Description (shown under the title on a quote or invoice)
        <textarea name="description" rows={3} aria-label="Description" defaultValue={item?.description ?? ''} className="mt-1.5 w-full rounded-none border border-border bg-background px-3 py-2 text-sm" />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{state.error}</p> : null}
      <div className="flex gap-2 md:col-span-2">
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? 'Saving…' : item ? 'Save item' : 'Add item'}
        </button>
        {item ? <Link href="/settings/price-list" className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link> : null}
      </div>
    </form>
  )
}
