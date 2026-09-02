import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { readSupabasePublicEnv, readSupabaseSecretKey } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Service-role client. Bypasses RLS entirely.
 * Bootstrap, invitation dispatch, and admin scripts ONLY.
 * Only the request paths in SERVICE_ROLE_REQUEST_PATHS
 * (tests/unit/service-role-boundary.test.ts) may import this. Adding one is a
 * deliberate edit to that list, with a reason.
 */
export function createAdminSupabase() {
  const env = readSupabasePublicEnv(process.env)
  const secretKey = readSupabaseSecretKey(process.env)
  return createClient<Database>(env.SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
