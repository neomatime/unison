import { z } from 'zod'

export const organizationProfileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Organisation name must contain at least 2 characters.')
    .max(120, 'Organisation name must contain 120 characters or fewer.'),
})

export type OrganizationProfileInput = z.infer<typeof organizationProfileInputSchema>
