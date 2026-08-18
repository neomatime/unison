import { z } from 'zod'

const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required.').max(200),
  industry: optionalText,
  website: optionalText,
  contactName: optionalText,
  contactEmail: z.string().email('Enter a valid email address.').optional().or(z.literal('')).transform((v) => v || null),
  contactPhone: optionalText,
  service: optionalText,
  billingEmail: z.string().email('Enter a valid billing email.').optional().or(z.literal('')).transform((v) => v || null),
  notes: optionalText,
  status: z.enum(['Onboarding', 'Active', 'Archived']).default('Onboarding'),
  health: z.enum(['New', 'Healthy', 'Watch', 'Stable', 'At Risk']).default('New'),
})

export type ClientInput = z.infer<typeof clientInputSchema>
