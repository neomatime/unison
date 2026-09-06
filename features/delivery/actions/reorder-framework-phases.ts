'use server'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Delegates to the RPC because the reorder must be one transaction: the unique
 * (framework_id, position) constraint cannot survive a multi-statement swap,
 * and every PostgREST update is its own transaction. Authorisation lives in the
 * function, in Postgres, not here.
 */
export async function reorderFrameworkPhasesAction(_prev: { error?: string } | undefined, formData: FormData) {
  const frameworkId = formData.get('frameworkId')?.toString()
  const phaseIds = formData.getAll('phaseIds').map((value) => value.toString())
  if (!frameworkId || phaseIds.length === 0) return { error: 'No phase order was submitted.' }

  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: phaseIds,
  })

  // 22023 is the function's own "not exactly this framework's phase set", which
  // means the submitted order is stale -- someone added or archived a phase in
  // another tab. 42501 is a non-member. Neither is a server fault.
  if (error?.code === '22023') return { error: 'The phase list changed while you were reordering. Reload and try again.' }
  if (error) return { error: 'The phases could not be reordered.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
