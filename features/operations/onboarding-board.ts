// The Onboarding board: its columns, how cards are grouped and moved, and what a move changes. Pure: no directive, no imports,
// so unit tests load it. The stages are the ones the database allows (client_onboardings_stage_check) in journey order.

export const ONBOARDING_STAGES = ['Welcome', 'Company Setup', 'Information & Documentation', 'Agreements', 'Review & Approval', 'Go Live / Handover'] as const
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number]

/** The stage that finishes the journey: a card dropped here is at 100%. */
export const FINAL_STAGE: OnboardingStage = 'Go Live / Handover'

export type BoardCard = {
  id: string
  client: string
  type: string
  owner: string
  stage: OnboardingStage
  progress: number
  health: string
  /** Target go-live, already formatted for the page, or an em dash. */
  goLive: string
}

export const isOnboardingStage = (value: unknown): value is OnboardingStage => ONBOARDING_STAGES.includes(value as OnboardingStage)

/** One column per stage, in journey order, with the cards in the order they were given. A card in an unknown stage goes in the first column. */
export function boardColumns(cards: readonly BoardCard[]): Array<{ stage: OnboardingStage; cards: BoardCard[] }> {
  const columns = ONBOARDING_STAGES.map((stage) => ({ stage, cards: [] as BoardCard[] }))
  for (const card of cards) (columns.find((column) => column.stage === card.stage) ?? columns[0]).cards.push(card)
  return columns
}

/** The progress a card has after a move: 100% when it reaches Go Live / Handover, otherwise what it already had. */
export function progressAfterMove(stage: OnboardingStage, current: number): number {
  return stage === FINAL_STAGE ? 100 : current
}

/** The cards after one is moved to another stage, as the page shows it straight away (before the save is confirmed). */
export function moveCard(cards: readonly BoardCard[], id: string, stage: OnboardingStage): BoardCard[] {
  return cards.map((card) => (card.id === id ? { ...card, stage, progress: progressAfterMove(stage, card.progress) } : card))
}

/** True when dropping this card on that stage would change something. */
export const canMove = (cards: readonly BoardCard[], id: string, stage: OnboardingStage) => cards.some((card) => card.id === id && card.stage !== stage)
