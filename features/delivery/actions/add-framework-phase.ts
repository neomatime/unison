'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { phaseNameSchema } from '../schemas/framework'

export async function addFrameworkPhaseAction(_prev: { error?: string } | undefined, formData: FormData) {
  const frameworkId = formData.get('frameworkId')?.toString()
  if (!frameworkId) return { error: 'No framework was named.' }

  const parsed = phaseNameSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data: last, error: readError } = await supabase
    .from('framework_phases')
    .select('position')
    .eq('framework_id', frameworkId)
    .eq('organization_id', organization.id)
    .order('position', { ascending: false })
    .limit(1)
  if (readError) return { error: 'The phase could not be added.' }

  const nextPosition = (last?.[0]?.position ?? 0) + 1

  const { error } = await supabase.from('framework_phases').insert({
    organization_id: organization.id,
    framework_id: frameworkId,
    name: parsed.data.name,
    position: nextPosition,
  })

  // framework_phases_name_unique is (framework_id, name). A concurrent add
  // targeting the same next position would instead trip
  // framework_phases_position_unique (framework_id, position); that is not
  // handled specially here -- see the report for why.
  if (error?.code === '23505') return { error: 'A phase with that name already exists in this framework.' }
  if (error) return { error: 'The phase could not be added.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
