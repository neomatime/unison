// Reminder choices for an event. Pure: no directive, no imports, so the tests load it directly. The allowed values match the
// check on calendar_events.reminder_minutes.

export const REMINDER_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
]

/** What a new event reminds at unless changed. */
export const DEFAULT_REMINDER_MINUTES = 15

/** A reminder from a form value: one of the allowed minutes, or null for no reminder (also for anything unreadable). */
export function parseReminder(value: unknown): number | null {
  const minutes = Number(String(value ?? '').trim())
  return Number.isInteger(minutes) && REMINDER_OPTIONS.some((option) => option.minutes === minutes) ? minutes : null
}

export const reminderLabel = (minutes: number | null | undefined): string =>
  REMINDER_OPTIONS.find((option) => option.minutes === minutes)?.label ?? 'No reminder'
