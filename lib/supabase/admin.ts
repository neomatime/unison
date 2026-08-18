import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { readSupabasePublicEnv, readSupabaseSecretKey } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Service-role client. Bypasses RLS entirely.
 * Bootstrap, invitation dispatch, and admin scripts ONLY.
 * Never import this from anything under features/ — a test enforces that.
 */
export function createAdminSupabase() {
  const env = readSupabasePublicEnv(process.env)
  const secretKey = readSupabaseSecretKey(process.env)
  return createClient<Database>(env.SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
