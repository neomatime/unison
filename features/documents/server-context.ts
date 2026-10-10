import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/** The signed-in user, their organisation and role, and a database client. `db` is untyped, as elsewhere in the CRM code. */
export async function documentContext() {
  const { organization, user, role } = await getSessionContext()
  return { organization, user, role, db: (await createServerSupabase()) as any }
}
