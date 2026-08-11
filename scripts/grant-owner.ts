import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from '../lib/env.ts'

const HIMARK_ID = '00000000-0000-4000-8000-000000000001'

const email = process.argv[2]
if (!email) {
  console.error('Usage: pnpm grant-owner <email>')
  process.exit(1)
}

const env = readSupabaseEnv(process.env)
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase.auth.admin.listUsers()
if (error) throw error

const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`No account found for ${email}. Create it first, then re-run.`)
  process.exit(1)
}

// Task 9b added a BEFORE UPDATE trigger (enforce_membership_role_change) that
// blocks any change to memberships.role_id unless the caller holds the owner
// role. Triggers are not row level security, so the service role does not
// bypass it, and a script has no auth.uid(), so the trigger's has_role()
// check always evaluates false here. A plain upsert therefore works only the
// first time (an insert); on any re-run where a differing row already exists
// it would attempt an UPDATE of role_id and fail with 42501. Read the
// existing row first and branch explicitly instead of upserting blind.
const { data: existing, error: selectError } = await supabase
  .from('memberships')
  .select('role_id, status')
  .eq('organization_id', HIMARK_ID)
  .eq('user_id', user.id)
  .maybeSingle()
if (selectError) throw selectError

if (!existing) {
  const { error: insertError } = await supabase
    .from('memberships')
    .insert({ organization_id: HIMARK_ID, user_id: user.id, role_id: 'owner', status: 'active' })
  if (insertError) throw insertError
  console.log(`Granted owner of HIMARK to ${email}.`)
  process.exit(0)
}

if (existing.role_id === 'owner' && existing.status === 'active') {
  console.log(`${email} is already an active owner of HIMARK. Nothing to change.`)
  process.exit(0)
}

console.error(
  `${email} already has a HIMARK membership (role_id=${existing.role_id}, status=${existing.status}) ` +
    'that differs from an active owner. The enforce_membership_role_change trigger only permits ' +
    'role_id changes to callers with an authenticated owner session (auth.uid() + has_role()), which ' +
    'this service-role script does not have and must not attempt to work around. Sign in as an existing ' +
    'owner and change the role there, or resolve this manually with full awareness of the trigger.',
)
process.exit(1)
