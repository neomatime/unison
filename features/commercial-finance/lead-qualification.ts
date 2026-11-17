// How a website lead's qualification is shown. Pure, no imports, so unit tests load it.
//
// The website assesses each enquiry and sends five yes/no signals, a score (the number of "yes" signals, 0 to 5), an outcome and a
// manual-review flag. UNISON stores them as received. The exact questions behind each signal live in the website's code, so the
// plain-language labels below are worded from the signal names and say what a "yes" means in general terms.

export const QUALIFICATION_SCORE_MAX = 5

export const SIGNAL_ORDER = ['impact', 'timing', 'readiness', 'organisation', 'engagement'] as const
export type SignalKey = (typeof SIGNAL_ORDER)[number]

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  impact: 'Clear business impact',
  timing: 'Urgent timeline',
  readiness: 'Ready to move forward',
  organisation: 'Suitable organisation',
  engagement: 'Engaged with the enquiry',
}

export const SIGNAL_HINTS: Record<SignalKey, string> = {
  impact: 'Yes: the enquiry describes a real business impact from the problem. Signal name: impact.',
  timing: 'Yes: there is urgency, so the need is not open-ended. Signal name: timing.',
  readiness: 'Yes: they look ready to act, not just exploring. Signal name: readiness.',
  organisation: 'Yes: the organisation looks like a good fit for HIMARK. Signal name: organisation.',
  engagement: 'Yes: they engaged properly with the form and gave real detail. Signal name: engagement.',
}

export type SignalRow = { key: string; label: string; hint: string | null; met: boolean }

/** The five signals in a fixed order, then any others the website may add later (shown by their own name). */
export function signalRows(value: unknown): SignalRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const record = value as Record<string, unknown>
  const known = SIGNAL_ORDER.filter((key) => key in record).map((key) => ({ key, label: SIGNAL_LABELS[key], hint: SIGNAL_HINTS[key], met: record[key] === true }))
  const others = Object.keys(record)
    .filter((key) => !(SIGNAL_ORDER as readonly string[]).includes(key))
    .sort()
    .map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), hint: null, met: record[key] === true }))
  return [...known, ...others]
}

export function scoreLabel(value: unknown): string {
  const score = Number(value)
  return Number.isFinite(score) ? `${score} / ${QUALIFICATION_SCORE_MAX}` : '—'
}

const OUTCOMES: Record<string, string> = { qualified: 'Qualified', nurture: 'Nurture', not_a_fit: 'Not a fit' }
export function outcomeLabel(value: unknown): string {
  const key = String(value ?? '')
  return OUTCOMES[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ') : '—')
}

/** Explanations shown from the small "i" beside a lead field, by the field's label. */
export const LEAD_FIELD_HINTS: Record<string, string> = {
  'Qualification outcome': 'The website’s verdict on this enquiry. Qualified: a good fit, so the status becomes Qualified. Nurture: not ready or not a clear fit yet, keep in touch. Not a fit: not worth pursuing.',
  'Qualification score': 'How many of the five signals below are met, from 0 to 5. It is advice to help you decide, not a rule.',
  Signals: 'Five yes/no checks the website made on the enquiry. A tick means the signal is met. The score is the number of ticks.',
  'Manual review': 'Required means the website flagged this enquiry for a person to check before acting on it. The assessment is advisory only.',
}
