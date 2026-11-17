// The Sales board: a column per stage, a card per open or closed (not archived) opportunity. Pure, no imports beyond the stage list,
// so unit tests load it.
import { OPPORTUNITY_STAGES } from './vocabulary.ts'

export type SalesStage = (typeof OPPORTUNITY_STAGES)[number]

export type SalesCard = {
  id: string
  name: string
  client: string
  owner: string
  stage: SalesStage
  value: number
  currency: string
  probability: number
  close: string
}

export const SALES_STAGES: readonly SalesStage[] = OPPORTUNITY_STAGES
export const LOST_STAGE: SalesStage = 'Lost'

export function isSalesStage(value: unknown): value is SalesStage {
  return typeof value === 'string' && (SALES_STAGES as readonly string[]).includes(value)
}

export type SalesColumn = { stage: SalesStage; cards: SalesCard[]; total: Record<string, number> }

/** Every stage has a column, in pipeline order. Cards keep their order within a column. Totals are per currency. */
export function salesColumns(cards: SalesCard[]): SalesColumn[] {
  return SALES_STAGES.map((stage) => {
    const inStage = cards.filter((card) => card.stage === stage)
    const total: Record<string, number> = {}
    for (const card of inStage) total[card.currency] = (total[card.currency] ?? 0) + card.value
    return { stage, cards: inStage, total }
  })
}

export function canMoveSales(cards: SalesCard[], id: string, stage: SalesStage): boolean {
  const card = cards.find((item) => item.id === id)
  return Boolean(card) && card!.stage !== stage
}

export function moveSalesCard(cards: SalesCard[], id: string, stage: SalesStage, probability?: number): SalesCard[] {
  return cards.map((card) => (card.id === id ? { ...card, stage, probability: probability ?? card.probability } : card))
}

/** A card moved to Lost needs a reason; any other stage does not. */
export function needsLostReason(stage: SalesStage): boolean {
  return stage === LOST_STAGE
}
