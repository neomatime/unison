'use client'

import Link from 'next/link'
import { useState, useTransition, type DragEvent } from 'react'

import { Dropdown } from '@/components/ui/select'
import { StatusDot } from '@/components/ui/status-dot'
import { cn } from '@/lib/utils'
import { moveOnboardingStageAction } from '../actions/onboarding-board'
import { ONBOARDING_STAGES, boardColumns, canMove, moveCard, type BoardCard, type OnboardingStage } from '../onboarding-board'

/**
 * The Onboarding board: a column per stage and a card per onboarding. Drag a card to another column (or use "Move to" on the card,
 * which also works with a keyboard and on a phone) and the stage is saved at once. The card moves straight away; if the save fails
 * it goes back and says why. A card dropped on Go Live / Handover is at 100%.
 */
export function OnboardingBoard({ cards: initial }: { cards: BoardCard[] }) {
  const [cards, setCards] = useState(initial)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<OnboardingStage | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function move(id: string, stage: OnboardingStage) {
    if (!canMove(cards, id, stage)) return
    const before = cards
    setCards((current) => moveCard(current, id, stage))
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await moveOnboardingStageAction(id, stage)
        if (!result.ok) {
          setCards(before)
          setMessage(result.error)
        }
      } catch {
        // The session ended or the server could not be reached: put the card back rather than leave it where it was not saved.
        setCards(before)
        setMessage('The move could not be saved. Reload the page and sign in again if it keeps happening.')
      }
    })
  }

  function drop(event: DragEvent, stage: OnboardingStage) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || dragging
    setOver(null)
    setDragging(null)
    if (id) move(id, stage)
  }

  const columns = boardColumns(cards)
  return (
    <div>
      {message ? <p role="alert" className="mb-3 border-l-2 border-destructive bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{message}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Onboarding stages">
        {columns.map((column) => (
          <section
            key={column.stage}
            role="listitem"
            aria-label={`${column.stage}, ${column.cards.length} onboarding${column.cards.length === 1 ? '' : 's'}`}
            onDragOver={(event) => { if (dragging) { event.preventDefault(); setOver(column.stage) } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver((current) => (current === column.stage ? null : current)) }}
            onDrop={(event) => drop(event, column.stage)}
            className={cn('flex w-72 shrink-0 flex-col border border-border bg-muted/30', over === column.stage && dragging && canMove(cards, dragging, column.stage) && 'border-brand bg-brand-soft/40')}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <h3 className="text-xs font-semibold tracking-[0.04em] text-foreground">{column.stage}</h3>
              <span className="min-w-5 border border-border bg-card px-1.5 text-center text-[0.6875rem] tabular-nums text-muted-foreground">{column.cards.length}</span>
            </header>
            <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2">
              {column.cards.length === 0 ? <li className="px-2 py-6 text-center text-xs text-muted-foreground">Drop an onboarding here</li> : null}
              {column.cards.map((card) => (
                <li
                  key={card.id}
                  draggable
                  onDragStart={(event) => { event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; setDragging(card.id) }}
                  onDragEnd={() => { setDragging(null); setOver(null) }}
                  className={cn('cursor-grab border border-border bg-card p-3 text-sm active:cursor-grabbing', dragging === card.id && 'opacity-50')}
                >
                  <Link href={`/operations/onboarding/${card.id}`} draggable={false} className="block font-medium text-foreground hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{card.client}</Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{card.type}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <StatusDot status={card.health} />
                    <span className="text-muted-foreground">{card.owner}</span>
                  </div>
                  <div className="mt-3" aria-label={`Progress ${card.progress}%`}>
                    <div className="h-1 bg-muted"><div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }} /></div>
                    <div className="mt-1 flex justify-between text-[0.6875rem] text-muted-foreground"><span>{card.progress}%</span><span>Go-live {card.goLive}</span></div>
                  </div>
                  <div className="mt-3">
                    <Dropdown aria-label={`Move ${card.client} to another stage`} value={card.stage} onChange={(event) => move(card.id, event.target.value as OnboardingStage)} className="h-8 text-xs">
                      {ONBOARDING_STAGES.map((stage) => <option key={stage} value={stage}>{stage === card.stage ? stage : `Move to ${stage}`}</option>)}
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
