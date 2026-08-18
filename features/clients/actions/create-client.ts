'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { clientInputSchema } from '../schemas/client'

export async function createClientAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = clientInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('clients').insert({
    organization_id: organization.id,
    name: parsed.data.name,
    industry: parsed.data.industry,
    website: parsed.data.website,
    contact_name: parsed.data.contactName,
    contact_email: parsed.data.contactEmail,
    contact_phone: parsed.data.contactPhone,
    service: parsed.data.service,
    billing_email: parsed.data.billingEmail,
    notes: parsed.data.notes,
    status: parsed.data.status,
    health: parsed.data.health,
  }).select('id').single()

  if (error) return { error: 'The client could not be created.' }

  revalidatePath('/operations/clients')
  redirect(`/operations/clients/${data.id}`)
}
