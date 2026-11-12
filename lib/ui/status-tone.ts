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
  Active: 'positive',
  Healthy: 'positive',
  'On Track': 'positive',
  Complete: 'positive',
  Completed: 'positive',
  Published: 'positive',
  Configured: 'positive',
  Available: 'positive',
  Current: 'positive',
  Low: 'positive',
  Delivered: 'positive',
  Verified: 'positive',
  Satisfied: 'positive',
  // Waiting on someone
  'Partially Paid': 'attention',
  'Awaiting Approval': 'attention',
  'Internal Review': 'attention',
  Negotiation: 'attention',
  'Under Review': 'attention',
  'At Risk': 'attention',
  Watch: 'attention',
  Paused: 'attention',
  'On Hold': 'attention',
  Pending: 'attention',
  'Waiting on Customer': 'attention',
  Resolved: 'positive',
  Medium: 'attention',
  'In Review': 'attention',
  Open: 'attention',
  // In progress
  Contacted: 'info',
  Sent: 'info',
  Issued: 'info',
  Submitted: 'info',
  Discovery: 'info',
  Proposal: 'info',
  Planned: 'info',
  Scheduled: 'info',
  'In Progress': 'info',
  Invited: 'info',
  Backlog: 'info',
  Mitigating: 'info',
  // Bad outcomes
  Disqualified: 'negative',
  Declined: 'negative',
  Expired: 'negative',
  Overdue: 'negative',
  Rejected: 'negative',
  Lost: 'negative',
  Cancelled: 'negative',
  Blocked: 'negative',
  Critical: 'negative',
  High: 'negative',
}

/** Anything not listed (Draft, New, Superseded, a new status added later) is neutral. */
export function statusTone(status: string | null | undefined): StatusTone {
  return TONES[String(status ?? '').trim()] ?? 'neutral'
}
