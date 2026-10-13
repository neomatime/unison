'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'

import { formatCurrency } from '@/lib/utils/format-money'
import { addHiveOfferingLineAction } from '../actions/hive-offering-line'
import { groupHiveOfferings } from '../hive-offerings'
import type { HiveOfferingsResult } from '../types'
import type { DocumentKind } from '../vocabulary'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'

/** Adds one HIVE offering at HIVE's rand price. Projects carry only an approved credit range, so they are listed but cannot be added as a priced line. */
export function HiveOfferingPicker({ kind, documentId, result, currency }: { kind: DocumentKind; documentId: string; result: HiveOfferingsResult; currency: string }) {
  const [state, run, pending] = useActionState(addHiveOfferingLineAction.bind(null, kind, documentId), undefined)
  const [, startTransition] = useTransition()
  const [offeringKey, setOfferingKey] = useState('')
  const chosen = result.offerings.find((item) => item.key === offeringKey)
  useEffect(() => {
    if (state?.success) setOfferingKey('')
  }, [state])
  const groups = groupHiveOfferings(result.offerings)
  const unpriced = result.offerings.filter((item) => item.price === null)
  if (result.error) {
    return <p role="status" className="border-t border-border px-5 py-4 text-xs text-[var(--briefing-muted)]">{result.error}</p>
  }
  if (result.offerings.length === 0) return null
  if (currency !== 'ZAR') {
    return <p className="border-t border-border px-5 py-4 text-xs text-[var(--briefing-muted)]">HIVE prices are in rand. Set this document's currency to ZAR to add HIVE offerings.</p>
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData()
        data.set('offeringKey', offeringKey)
        startTransition(() => run(data))
      }}
      className="grid gap-3 border-t border-border p-5"
    >
      <label>
        <span className="text-xs font-semibold text-[var(--briefing-muted)]">Add from HIVE offerings (prices set in HIVE Origin, excluding VAT)</span>
        <select aria-label="Add from HIVE offerings" value={offeringKey} onChange={(event) => setOfferingKey(event.target.value)} className={`mt-1 ${field}`}>
          <option value="">Choose a retainer, project, support service or top-up…</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}: {formatCurrency(Number(item.price), currency)}{item.billingPeriod === 'month' ? ' per month' : ''}
                </option>
              ))}
            </optgroup>
          ))}
          {unpriced.length ? (
            <optgroup label="No approved rand price in HIVE (add as a one-off line)">
              {unpriced.map((item) => <option key={item.key} value={item.key} disabled>{item.name}{item.credits ? `: ${item.credits}` : ''}</option>)}
            </optgroup>
          ) : null}
        </select>
      </label>
      {chosen?.description ? <p className="text-xs text-[var(--briefing-muted)]">{chosen.description}</p> : null}
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-success">{state.success}</p> : null}
      <div>
        <button type="submit" disabled={pending || !chosen || chosen.price === null} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Adding…' : 'Add from HIVE'}</button>
      </div>
    </form>
  )
}
