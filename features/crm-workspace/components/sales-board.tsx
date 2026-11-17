'use client'

import Link from 'next/link'
import { useState, useTransition, type DragEvent } from 'react'

import { InfoHint } from '@/components/ui/info-hint'
import { Dropdown } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { SALES_HINTS } from '@/features/registers/hints'
import { moveOpportunityStageBoardAction } from '../actions/sales-board'
import { SALES_STAGES, canMoveSales, moveSalesCard, needsLostReason, salesColumns, type SalesCard, type SalesStage } from '../sales-board'

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-ZA')}`
  }
}

/**
 * The Sales board: a column per stage and a card per opportunity. Drag a card to another column (or use "Move to" on the card, which
 * also works with a keyboard and on a phone) and the stage is saved at once. The card moves straight away; if the save fails it
 * goes back and says why. Moving a card to Lost asks for the reason first, the same as the Change stage control.
 */
export function SalesBoard({ cards: initial }: { cards: SalesCard[] }) {
  const [cards, setCards] = useState(initial)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<SalesStage | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lost, setLost] = useState<{ id: string; reason: string } | null>(null)
  const [, startTransition] = useTransition()

  function save(id: string, stage: SalesStage, reason?: string) {
    const before = cards
    setCards((current) => moveSalesCard(current, id, stage))
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await moveOpportunityStageBoardAction(id, stage, reason)
        if (result.ok) setCards((current) => moveSalesCard(current, id, stage, result.probability))
        else { setCards(before); setMessage(result.error) }
      } catch {
        setCards(before)
        setMessage('The move could not be saved. Reload the page and sign in again if it keeps happening.')
      }
    })
  }

  function move(id: string, stage: SalesStage) {
    if (!canMoveSales(cards, id, stage)) return
    if (needsLostReason(stage)) { setLost({ id, reason: '' }); return }
    save(id, stage)
  }

  function drop(event: DragEvent, stage: SalesStage) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || dragging
    setOver(null)
    setDragging(null)
    if (id) move(id, stage)
  }

  const columns = salesColumns(cards)
  const lostCard = lost ? cards.find((card) => card.id === lost.id) : null
  return (
    <div>
      {message ? <p role="alert" className="mb-3 border-l-2 border-destructive bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{message}</p> : null}
      {lost && lostCard ? (
        <form
          className="mb-3 grid gap-2 border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault()
            const reason = lost.reason.trim()
            if (!reason) { setMessage('Say why this opportunity was lost.'); return }
            setLost(null)
            save(lost.id, 'Lost', reason)
          }}
        >
          <label htmlFor="lost-reason" className="text-sm font-medium">Why was {lostCard.name} lost?</label>
          <input id="lost-reason" autoFocus value={lost.reason} onChange={(event) => setLost({ ...lost, reason: event.target.value })} className="h-10 border border-border bg-background px-3 text-sm" placeholder="For example: chose another supplier" />
          <div className="flex gap-2">
            <button type="submit" className="h-9 bg-brand px-4 text-xs font-semibold text-white hover:bg-brand/90">Mark as lost</button>
            <button type="button" onClick={() => { setLost(null); setMessage(null) }} className="h-9 border border-border px-4 text-xs font-medium hover:bg-muted">Cancel</button>
          </div>
        </form>
      ) : null}
      <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Sales stages">
        {columns.map((column) => (
          <section
            key={column.stage}
            role="listitem"
            aria-label={`${column.stage}, ${column.cards.length} opportunit${column.cards.length === 1 ? 'y' : 'ies'}`}
            onDragOver={(event) => { if (dragging) { event.preventDefault(); setOver(column.stage) } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === column.stage ? null : current)) }}
            onDrop={(event) => drop(event, column.stage)}
            className={cn('flex w-72 shrink-0 flex-col border border-border bg-muted/30', over === column.stage && dragging && canMoveSales(cards, dragging, column.stage) && 'border-brand bg-brand-soft/40')}
          >
            <header className="border-b border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-[0.04em] text-foreground">{column.stage}</h3>
                <span className="min-w-5 border border-border bg-card px-1.5 text-center text-[0.6875rem] tabular-nums text-muted-foreground">{column.cards.length}</span>
              </div>
              <p className="mt-1 min-h-4 text-[0.6875rem] text-muted-foreground">
                {Object.entries(column.total).map(([currency, amount]) => money(amount, currency)).join(' · ') || '—'}
              </p>
            </header>
            <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {column.cards.length === 0 ? <li className="px-2 py-6 text-center text-xs text-muted-foreground">Drop an opportunity here</li> : null}
              {column.cards.map((card) => (
                <li
                  key={card.id}
                  draggable
                  onDragStart={(event) => { event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; setDragging(card.id) }}
                  onDragEnd={() => { setDragging(null); setOver(null) }}
                  className={cn('cursor-grab border border-border bg-card p-3 text-sm active:cursor-grabbing', dragging === card.id && 'opacity-50')}
                >
                  <Link href={`/commercial/sales/${card.id}`} draggable={false} className="block font-medium text-foreground hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{card.name}</Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.client}</p>
                  <p className="mt-3 text-base font-medium tabular-nums">{money(card.value, card.currency)}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">{card.probability}% likely <InfoHint label="probability" text={SALES_HINTS.Probability} /></span>
                    <span>Close {card.close}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{card.owner}</p>
                  <div className="mt-3">
                    <Dropdown aria-label={`Move ${card.name} to another stage`} value={card.stage} onChange={(event) => move(card.id, event.target.value as SalesStage)} className="h-8 text-xs">
                      {SALES_STAGES.map((stage) => <option key={stage} value={stage}>{stage === card.stage ? stage : `Move to ${stage}`}</option>)}
                    </Dropdown>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
