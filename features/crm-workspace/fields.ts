// Pure readers for the CRM workspace forms, so the validation the server actions
// depend on is unit testable. Relative imports only: Node's test runner cannot
// resolve '@/', and 'use server' modules cannot be imported by a test.
import { isUuid } from '../../lib/utils/index.ts'
import { isValidIsoDate } from '../delivery/schemas/date.ts'
import { FOLLOW_UP_PRIORITIES, LOGGED_ACTIVITY_KINDS, OPPORTUNITY_STAGES } from './vocabulary.ts'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null
const isOneOf = (options: readonly string[], candidate: string) => options.includes(candidate)

export type ContactFields = {
  full_name: string
  email: string | null
  phone: string | null
  job_title: string | null
  notes: string | null
}

export function readContactFields(form: FormData): ContactFields | { error: string } {
  const fullName = value(form, 'fullName')
  if (!fullName) return { error: 'A contact name is required.' }
  const email = optional(form, 'email')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' }
  return { full_name: fullName, email, phone: optional(form, 'phone'), job_title: optional(form, 'jobTitle'), notes: optional(form, 'notes') }
}

export type ActivityFields = { kind: string; subject: string; body: string | null; occurred_at: string | null }

/** How far ahead of now a logged time may be, to allow for clocks that differ a little. */
const FUTURE_SLACK_MS = 5 * 60 * 1000

export function readActivityFields(form: FormData, now: Date = new Date()): ActivityFields | { error: string } {
  const kind = value(form, 'kind')
  if (!isOneOf(LOGGED_ACTIVITY_KINDS, kind)) return { error: 'Choose a call, meeting, email or note.' }
  const subject = value(form, 'subject')
  if (!subject) return { error: 'A subject is required.' }

  let occurredAt: string | null = null
  const raw = optional(form, 'occurredAt')
  if (raw) {
    const parsed = new Date(raw)
    // Round-trip: Date accepts some malformed input and rolls it over silently
    // (a month 13 becomes January of the next year), so require the same text back.
    if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(raw) || parsed.toISOString().slice(0, 10) !== raw.slice(0, 10)) {
      return { error: 'Enter a valid date and time.' }
    }
    if (parsed.getTime() > now.getTime() + FUTURE_SLACK_MS) return { error: 'An activity cannot be in the future.' }
    occurredAt = parsed.toISOString()
  }
  return { kind, subject, body: optional(form, 'body'), occurred_at: occurredAt }
}

export type FollowUpFields = {
  title: string
  priority: string
  due_at: string | null
  /** undefined: the form had no assignee field at all. null: Unassigned was chosen. */
  assignee_id: string | null | undefined
}

export function readFollowUpFields(form: FormData): FollowUpFields | { error: string } {
  const title = value(form, 'title')
  if (!title) return { error: 'A follow-up title is required.' }
  const priority = value(form, 'priority')
  if (!isOneOf(FOLLOW_UP_PRIORITIES, priority)) return { error: 'Choose a valid priority.' }
  const dueDate = optional(form, 'dueDate')
  if (dueDate && !isValidIsoDate(dueDate)) return { error: 'Enter a valid due date.' }
  // An empty value is a choice (Unassigned); only a missing field leaves the choice to the server.
  const assigneeId = form.has('assigneeId') ? optional(form, 'assigneeId') : undefined
  if (assigneeId && !isUuid(assigneeId)) return { error: 'Choose a valid assignee.' }
  // Noon UTC, so the date reads the same in every timezone from UTC-11 to UTC+11.
  return { title, priority, due_at: dueDate ? `${dueDate}T12:00:00.000Z` : null, assignee_id: assigneeId }
}

export function readStageChange(form: FormData): { stage: string; lost_reason: string | null } | { error: string } {
  const stage = value(form, 'stage')
  if (!isOneOf(OPPORTUNITY_STAGES, stage)) return { error: 'Choose a valid stage.' }
  if (stage !== 'Lost') return { stage, lost_reason: null }
  const reason = value(form, 'lostReason')
  if (!reason) return { error: 'Say why this opportunity was lost.' }
  return { stage, lost_reason: reason }
}

/** '' or 'new' means "create a separate client". */
export function readConvertTarget(form: FormData): { clientId: string | null } | { error: string } {
  const raw = value(form, 'clientId')
  if (!raw || raw === 'new') return { clientId: null }
  if (!isUuid(raw)) return { error: 'Choose a valid client.' }
  return { clientId: raw }
}

/** Company names that differ only by capitals and spacing are the same company. */
export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The person asked for; nobody when Unassigned was chosen (null); the signed-in user's own
 * team profile, else nobody, only when no choice was submitted at all (undefined).
 */
export function resolveFollowUpAssignee(requested: string | null | undefined, ownProfileIds: readonly string[]): string | null {
  if (requested === undefined) return ownProfileIds[0] ?? null
  return requested
}
