import { z } from 'zod'

const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

// projects.notes is an unbounded text column. The schema used to cap it at 500
// for no stated reason, so the form refused what the database would accept.
const optionalLongText = z.string().trim().optional().or(z.literal('')).transform((v) => v || null)

// A date column rejects anything it cannot parse, and an unvalidated string
// turned that into a Postgres error surfacing as "the project could not be
// created" rather than a message against the field.
//
// Date.parse cannot do this validation: V8's legacy, non-ISO fallback parser
// accepts strings like "31 September" and silently rolls them over to a
// different date instead of returning NaN (confirmed against this repo's
// Node runtime), so a refine built on it would let the exact defect this
// field exists to catch straight through. Instead the value is required to
// be in the yyyy-mm-dd shape the <input type="date"> the form actually uses
// produces, and the calendar fields are round-tripped through Date.UTC to
// catch a shape that parses but names no real day (2026-02-30).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const roundTripped = new Date(Date.UTC(year, month - 1, day))
  return (
    roundTripped.getUTCFullYear() === year &&
    roundTripped.getUTCMonth() === month - 1 &&
    roundTripped.getUTCDate() === day
  )
}
const optionalDate = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((v) => v || null)
  .refine((v) => v === null || isValidIsoDate(v), { message: 'Enter a valid due date.' })

// Exported so the form renders exactly what the schema accepts and what
// projects_status_check allows. The product-ui registry independently offered
// Planning / On Track / At Risk as statuses, none of which the database takes.
export const PROJECT_STATUSES = ['Active', 'On Hold', 'Complete', 'Cancelled'] as const
export const PROJECT_HEALTHS = ['On Track', 'Healthy', 'Watch', 'At Risk', 'Critical'] as const

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(200),
  frameworkId: z.string().uuid('Choose a delivery framework.'),
  // Null for internal change work.
  clientId: optionalUuid,
  phaseId: optionalUuid,
  // Safe as of migration 20260905180000_project_owner_and_members: projects_owner_fkey is
  // a composite key on (organization_id, owner_id) into memberships, so a value
  // naming a user in another organisation is refused by Postgres rather than by
  // anything here. Before that constraint existed this field was deliberately
  // absent, because nothing would have caught a cross-tenant reference.
  ownerId: optionalUuid,
  status: z.enum(PROJECT_STATUSES).default('Active'),
  health: z.enum(PROJECT_HEALTHS).default('On Track'),
  // FormData delivers everything as a string; coerce before bounding so "140"
  // is rejected by the range check rather than passing as a truthy string.
  progress: z.coerce.number().int().min(0).max(100).default(0),
  nextGate: optionalText,
  dueDate: optionalDate,
  notes: optionalLongText,
})

export type ProjectInput = z.infer<typeof projectInputSchema>
