import { z } from 'zod'

import { MIN_PASSWORD_LENGTH } from '../../invitations/schemas/signup.ts'

export const accountEmailSchema = z.string().trim().email('Enter a valid work email address.')

export const passwordResetSchema = z
  .object({
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
