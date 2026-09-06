'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { frameworkInputSchema } from '../schemas/framework'

export async function updateFrameworkAction(id: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = frameworkInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('frameworks').update({
    name: parsed.data.name,
    type: parsed.data.type,
  }).eq('id', id).eq('organization_id', organization.id).select('id')

  if (error?.code === '23505') return { error: 'A framework with that name already exists.' }
  if (error) return { error: 'The framework could not be saved.' }
  // Without .select() an update matching no rows is indistinguishable from one
  // that saved: RLS and the organisation filter both express "not yours" as
  // zero rows, not as an error, so a wrong id would report success.
  if (!data?.length) return { error: 'That framework no longer exists, or is not yours to edit.' }

  revalidatePath('/delivery/frameworks')
  revalidatePath(`/delivery/frameworks/${id}`)
  redirect(`/delivery/frameworks/${id}`)
}
