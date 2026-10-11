import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { RegisterKind } from '../register-spec'

/** The raw summary JSON for the cards; buildCards turns it into cards. A failed read throws: never zero totals. */
export async function getRegisterSummary(kind: RegisterKind): Promise<unknown> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db.rpc('register_summary', { p_org: organization.id, p_kind: kind })
  if (result.error) throw result.error
  return result.data
}
