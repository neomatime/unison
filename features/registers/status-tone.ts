// How a register status reads at a glance. Pure: no directive, no imports.

export type StatusTone = 'positive' | 'attention' | 'negative' | 'info' | 'neutral'

const TONES: Readonly<Record<string, StatusTone>> = {
  // Good outcomes
  Qualified: 'positive',
  Converted: 'positive',
  Accepted: 'positive',
  Paid: 'positive',
  Approved: 'positive',
  Won: 'positive',
  // Waiting on someone
  'Partially Paid': 'attention',
  'Awaiting Approval': 'attention',
  'Internal Review': 'attention',
  Negotiation: 'attention',
  // In progress
  Contacted: 'info',
  Sent: 'info',
  Issued: 'info',
  Submitted: 'info',
  Discovery: 'info',
  Proposal: 'info',
  // Bad outcomes
  Disqualified: 'negative',
  Declined: 'negative',
  Expired: 'negative',
  Overdue: 'negative',
  Rejected: 'negative',
  Lost: 'negative',
  Cancelled: 'negative',
}

/** Anything not listed (Draft, New, Superseded, a new status added later) is neutral. */
export function statusTone(status: string | null | undefined): StatusTone {
  return TONES[String(status ?? '').trim()] ?? 'neutral'
}
