import { z } from 'zod'

import { isValidIsoDate } from './date.ts'

const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

// projects.notes is an unbounded text column. The schema used to cap it at 500
// for no stated reason, so the form refused what the database would accept.
const optionalLongText = z.string().trim().optional().or(z.literal('')).transform((v) => v || null)

// isValidIsoDate (see ./date.ts) is what turns a malformed or impossible date
// into a field-level refusal instead of a Postgres error or a thrown
// exception. The blank-first ordering below matters too: .optional().or('')
// runs before the refine, so an empty string never reaches isValidIsoDate at
// all — it is already `null` by the time the refine sees it.
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
