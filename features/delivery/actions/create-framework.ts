'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { frameworkInputSchema } from '../schemas/framework'

export async function createFrameworkAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = frameworkInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('frameworks').insert({
    organization_id: organization.id,
    name: parsed.data.name,
    type: parsed.data.type,
  }).select('id').single()

  // frameworks_name_unique is (organization_id, name), and two frameworks
  // named the same thing is an ordinary mistake rather than a server fault, so
  // it must read as a field-level refusal instead of a 500.
  if (error?.code === '23505') return { error: 'A framework with that name already exists.' }
  if (error) return { error: 'The framework could not be created.' }

  revalidatePath('/delivery/frameworks')
  redirect(`/delivery/frameworks/${data.id}`)
}
