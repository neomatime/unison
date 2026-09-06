import { z } from 'zod'

/**
 * Exported as a const array so the form's options and the schema cannot drift.
 * There is deliberately no database check constraint on frameworks.type: it is
 * nullable free text today, nothing branches on it, and the seeded values
 * already conform. Add the constraint when something depends on it.
 */
export const FRAMEWORK_TYPES = ['Enterprise', 'Technology', 'Operations', 'Compliance', 'Commercial'] as const

export const frameworkInputSchema = z.object({
  name: z.string().trim().min(1, 'A framework name is required.'),
  type: z.enum(FRAMEWORK_TYPES).optional().or(z.literal('')).transform((value) => value || null),
})

export const phaseNameSchema = z.object({
  name: z.string().trim().min(1, 'A phase name is required.'),
})

export type FrameworkInput = z.infer<typeof frameworkInputSchema>
