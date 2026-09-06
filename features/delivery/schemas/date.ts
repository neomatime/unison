// A date column rejects anything it cannot parse, and an unvalidated string
// turns that into a Postgres error surfacing as a raw failure rather than a
// message against the field.
//
// Date.parse cannot do this validation: V8's legacy, non-ISO fallback parser
// accepts strings like "31 September" and silently rolls them over to a
// different date instead of returning NaN, so a refine built on it would let
// exactly the defect this function exists to catch straight through. Instead
// the value is required to be in the yyyy-mm-dd shape the <input type="date">
// the forms use produces, and the calendar fields are round-tripped through
// Date.UTC to catch a shape that parses but names no real day (2026-02-30).
//
// Shared by features/delivery/schemas/project.ts and delivery-item.ts: both
// need the identical check, and there is no reason the two would ever need to
// diverge on what counts as a real calendar date.
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const roundTripped = new Date(Date.UTC(year, month - 1, day))
  return (
    roundTripped.getUTCFullYear() === year &&
    roundTripped.getUTCMonth() === month - 1 &&
    roundTripped.getUTCDate() === day
  )
}
