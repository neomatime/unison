import { z } from 'zod'

export const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  roleId: z.enum(['owner', 'admin', 'member']),
})

export type InviteInput = z.infer<typeof inviteSchema>
