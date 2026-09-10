'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type SupportActionState = { error?: string } | undefined

const schema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters.').max(160),
  category: z.enum(['General', 'Access', 'Data', 'Delivery', 'Billing', 'Technical']),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  description: z.string().trim().min(10, 'Please provide at least 10 characters of detail.').max(5000),
})

export async function createSupportTicketAction(_previous: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the support request.' }
  const { organization, user } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await (supabase as any).from('support_tickets').insert({
    organization_id: organization.id,
    submitted_by: user.id,
    ...parsed.data,
  }).select('id,ticket_number').single()
  if (error || !data) return { error: 'The support request could not be created. Please try again.' }
  await (supabase as any).from('notifications').insert({
    organization_id: organization.id,
    user_id: user.id,
    category: 'Support',
    title: `Support request SUP-${String(data.ticket_number).padStart(6, '0')} opened`,
    body: parsed.data.subject,
    href: `/support/${data.id}`,
  })
  revalidatePath('/support')
  redirect(`/support/${data.id}`)
}
