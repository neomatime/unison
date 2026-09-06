import { z } from 'zod'

import { isValidIsoDate } from './date.ts'

/** Where the work is. */
export const DELIVERY_ITEM_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Complete'] as const

/**
 * What condition the work is in.
 *
 * 'On Track' is deliberately absent. It is a schedule statement, and
 * DELIVERY_ITEM_STATUSES already carries schedule including 'Blocked', so
 * offering both would allow an item to read "Blocked / On Track". Every value
 * here is a member of PROJECT_HEALTHS and is handled by bandFor(), so this is a
 * narrowing of the project vocabulary rather than a second one.
 */
export const DELIVERY_ITEM_HEALTHS = ['Healthy', 'Watch', 'At Risk', 'Critical'] as const

const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((value) => value || null)
const optionalText = z.string().trim().optional().or(z.literal('')).transform((value) => value || null)
// Blank-first, same as features/delivery/schemas/project.ts: .optional().or('')
// and the transform to null run before the refine, so an empty date never
// reaches isValidIsoDate at all. The previous ordering ran the date check on
// the raw string first, and new Date('T00:00:00Z').toISOString() throws
// rather than returning a value — an unhandled throw inside zod parsing
// escapes safeParse and surfaces as a 500 instead of a field error.
const optionalDate = z.string().optional().or(z.literal(''))
  .transform((value) => value || null)
  .refine((value) => value === null || isValidIsoDate(value), 'Enter a valid date, as yyyy-mm-dd.')

export const deliveryItemInputSchema = z.object({
  name: z.string().trim().min(1, 'A name is required.'),
  description: optionalText,
  level: z.enum(['1', '2']).transform((value) => Number(value) as 1 | 2),
  parentId: optionalUuid,
  ownerId: optionalUuid,
  status: z.enum(DELIVERY_ITEM_STATUSES),
  health: z.enum(DELIVERY_ITEM_HEALTHS),
  currentPhaseId: optionalUuid,
  startDate: optionalDate,
  targetDate: optionalDate,
}).refine(
  (value) => (value.level === 1 ? value.parentId === null : value.parentId !== null),
  { message: 'A level 2 item needs a parent, and a level 1 item cannot have one.', path: ['parentId'] },
)

export type DeliveryItemInput = z.infer<typeof deliveryItemInputSchema>
