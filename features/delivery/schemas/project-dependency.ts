import { z } from 'zod'

import { isValidIsoDate } from './date.ts'

const optionalText = z.string().trim().optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

// Blank-first, same as schemas/project.ts and schemas/delivery-item.ts:
// .optional().or('') and the transform to null run BEFORE the refine, so an
// empty date never reaches isValidIsoDate. The other ordering throws inside
// zod parsing, escapes safeParse, and surfaces as a 500 rather than a field
// error. This repo has shipped that bug once already.
const optionalDate = z.string().optional().or(z.literal(''))
  .transform((v) => v || null)
  .refine((v) => v === null || isValidIsoDate(v), 'Enter a valid date, as yyyy-mm-dd.')

/** Matches project_dependencies_required_status_check. */
export const DEPENDENCY_REQUIRED_STATUSES = ['Active', 'Complete'] as const
/** Matches project_dependencies_criticality_check. */
export const DEPENDENCY_CRITICALITIES = ['Standard', 'Critical'] as const

/**
 * The required state arrives as one field so the form cannot submit both or
 * neither -- the shape project_dependencies_required_state_check enforces.
 * A phase is submitted as `phase:<uuid>`, a status as `status:Complete`.
 */
export const projectDependencyInputSchema = z.object({
  prerequisiteProjectId: z.string().uuid('Choose a prerequisite project.'),
  requiredState: z.string().regex(
    /^(status:(Active|Complete)|phase:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    'Choose a required state.',
  ),
  criticality: z.enum(DEPENDENCY_CRITICALITIES),
  dependencyOwnerId: optionalUuid,
  requiredByDate: optionalDate,
  notes: optionalText,
}).transform((input) => {
  const [kind, value] = splitRequiredState(input.requiredState)
  return {
    ...input,
    requiredStatus: kind === 'status' ? value : null,
    requiredPhaseId: kind === 'phase' ? value : null,
  }
})

function splitRequiredState(value: string): ['status' | 'phase', string] {
  const separator = value.indexOf(':')
  const kind = value.slice(0, separator)
  return [kind === 'phase' ? 'phase' : 'status', value.slice(separator + 1)]
}
