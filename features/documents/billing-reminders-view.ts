// What the invoice page says about an invoice's payment reminders (accept to invoice, stage 3, task 5). Pure: relative imports with
// their extensions only, no directive and no server code. The database decides which reminder is due (private.billing_reminder_next);
// this only describes the state for a person: how many have gone, when the next goes out, and whether a person has paused them.
import { formatDocumentDate } from './document-view.ts'

/** The reminders sent for one invoice: the first at 3 days past due, then every 7 days, five in all (spec section 6). */
export const REMINDER_TOTAL = 5
const FIRST_AFTER_DAYS = 3
const EVERY_DAYS = 7

export type ReminderTone = 'muted' | 'waiting' | 'attention' | 'done'

/** A real calendar day written YYYY-MM-DD ("2027-02-30" is not one). */
function isRealDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** The day the next reminder goes out: the due date plus 3 days, plus 7 more for each already sent; null after five or for a date that cannot be read. */
export function nextReminderDate(dueDate: string, sentCount: number): string | null {
  if (!isRealDay(dueDate) || sentCount < 0 || sentCount >= REMINDER_TOTAL) return null
  const date = new Date(`${dueDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + FIRST_AFTER_DAYS + EVERY_DAYS * sentCount)
  return date.toISOString().slice(0, 10)
}

export type ReminderFacts = {
  /** Payment reminders are switched on for the organisation (and billing plans are). */
  enabled: boolean
  paused: { reason: string } | null
  sent: ReadonlyArray<{ sequence: number; sentOn: string }>
  dueDate: string | null
  status: string
  balance: number
  /** The South African day, YYYY-MM-DD. */
  today: string
}

const OWING_STATUSES = new Set(['Issued', 'Partially Paid', 'Overdue'])

export function describeReminders(facts: ReminderFacts): { line: string; tone: ReminderTone } {
  if (!facts.enabled) return { line: 'Reminders are switched off.', tone: 'muted' }
  if (!OWING_STATUSES.has(facts.status) || !(facts.balance > 0)) return { line: 'No reminders: nothing is owing.', tone: 'muted' }
  if (facts.paused) return { line: `Paused: ${facts.paused.reason}`, tone: 'attention' }
  const count = facts.sent.length
  if (count >= REMINDER_TOTAL) return { line: 'All five reminders were sent. Follow up with the client yourself.', tone: 'attention' }

  const next = facts.dueDate ? nextReminderDate(facts.dueDate, count) : null
  const due = next !== null && next <= facts.today
  const ordinal = count === 0 ? 'The first' : 'The next'
  const when = next === null ? '' : due ? ` ${ordinal} is due on the next run.` : ` ${ordinal} goes out on ${formatDocumentDate(next) ?? next}.`
  return { line: count === 0 ? `No reminder sent yet.${when}` : `${count} of ${REMINDER_TOTAL} sent.${when}`, tone: 'waiting' }
}
