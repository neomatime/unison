// Plain-language explanations for terms on the registers. Pure, no imports.

export const SALES_HINTS: Record<string, string> = {
  'Open opportunities': 'Deals still being worked: Discovery, Qualified, Proposal or Negotiation. Won and Lost deals are closed and are not counted here.',
  'Pipeline value': 'The full value of all open deals added together, as if every one of them will close.',
  'Weighted forecast': 'Each open deal’s value multiplied by its probability, then added up. A R100 000 deal at 50% counts as R50 000. It is the more realistic figure to plan around.',
  Probability: 'Your own estimate of how likely the deal is to close, as a percentage. It is entered when the deal is created or edited; it does not change by itself when the stage changes.',
}

export function hintFor(kind: string, term: string): string | undefined {
  return kind === 'opportunity' ? SALES_HINTS[term] : undefined
}
