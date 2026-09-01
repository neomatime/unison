import { z } from 'zod'

/**
 * A slug reaches a URL and a unique index, so it is derived rather than
 * accepted: lowercase, non-alphanumerics collapsed to single hyphens, ends
 * trimmed. An explicit slug is normalised the same way rather than trusted.
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const provisioningInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Organisation name is required.').max(200),
    adminEmail: z.string().trim().email('Enter a valid administrator email address.'),
    slug: z.string().optional(),
    tier: z.enum(['core', 'framework', 'enterprise', 'strategic-enterprise']).default('core'),
  })
  .transform((value) => ({
    ...value,
    slug: deriveSlug(value.slug?.trim() || value.name),
  }))
  .refine((value) => value.slug.length > 0, {
    message: 'Organisation name must contain letters or numbers.',
    path: ['name'],
  })

export type ProvisioningInput = z.infer<typeof provisioningInputSchema>
