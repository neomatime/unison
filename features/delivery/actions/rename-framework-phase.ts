'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { phaseNameSchema } from '../schemas/framework'

export async function renameFrameworkPhaseAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const frameworkId = formData.get('frameworkId')?.toString()
  if (!id || !frameworkId) return { error: 'No phase was named.' }

  const parsed = phaseNameSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('framework_phases')
    .update({ name: parsed.data.name })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')

  // This UPDATE only sets `name`, never `position`, so the only unique
  // constraint it can trip is framework_phases_name_unique (framework_id,
  // name) -- framework_phases_position_unique (framework_id, position) is
  // keyed on a column this statement never writes. Unlike add-framework-phase,
  // there is no second 23505 cause to disambiguate here.
  if (error?.code === '23505') return { error: 'A phase with that name already exists in this framework.' }
  if (error) return { error: 'The phase could not be renamed.' }
  if (!data?.length) return { error: 'That phase no longer exists, or is not yours to edit.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
