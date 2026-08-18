import { z } from 'zod'

// Length over composition rules: a 12-character passphrase resists guessing
// far better than an 8-character one forced to contain a symbol, and does not
// push people toward predictable substitutions. Supabase's own floor is lower,
// so this is the effective minimum.
export const MIN_PASSWORD_LENGTH = 12

export const invitationSignUpSchema = z
  .object({
    token: z.string().min(1, 'This invitation link is incomplete.'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(200, 'That password is too long.'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  })

export type InvitationSignUpInput = z.infer<typeof invitationSignUpSchema>
