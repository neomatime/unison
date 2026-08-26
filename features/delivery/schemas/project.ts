import { z } from 'zod'

const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(200),
  frameworkId: z.string().uuid('Choose a delivery framework.'),
  // Null for internal change work.
  clientId: optionalUuid,
  phaseId: optionalUuid,
  ownerId: optionalUuid,
  status: z.enum(['Active', 'On Hold', 'Complete', 'Cancelled']).default('Active'),
  health: z.enum(['On Track', 'Healthy', 'Watch', 'At Risk', 'Critical']).default('On Track'),
  // FormData delivers everything as a string; coerce before bounding so "140"
  // is rejected by the range check rather than passing as a truthy string.
  progress: z.coerce.number().int().min(0).max(100).default(0),
  nextGate: optionalText,
  dueDate: z.string().optional().or(z.literal('')).transform((v) => v || null),
  notes: optionalText,
})

export type ProjectInput = z.infer<typeof projectInputSchema>
