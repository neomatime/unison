import { createClient } from '@supabase/supabase-js'
import { readSupabasePublicEnv, readSupabaseSecretKey } from '../lib/env.ts'

const HIMARK_ID = '00000000-0000-4000-8000-000000000001'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: pnpm grant-owner <email>')
    process.exitCode = 1
    return
  }

  const env = readSupabasePublicEnv(process.env)
  const secretKey = readSupabaseSecretKey(process.env)
  const supabase = createClient(env.SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // listUsers() defaults to 50 users per page. Paginate until the address is
  // found or every page has been exhausted, rather than only checking page
  // one — otherwise a legitimate target beyond the first 50 accounts would
  // produce the same "No account found" message as a genuinely nonexistent
  // address, which is misleading for the most powerful role in the system.
  async function findUserByEmail(targetEmail: string) {
    const perPage = 200
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) throw error
      const match = data.users.find((candidate) => candidate.email?.toLowerCase() === targetEmail.toLowerCase())
      if (match) return match
      if (data.users.length < perPage) return null
    }
  }

  const user = await findUserByEmail(email)
  if (!user) {
    console.error(`No account found for ${email}. Create it first, then re-run.`)
    process.exitCode = 1
    return
  }

  // docs/tenancy.md requires the FIRST VERIFIED HIMARK owner membership — and
  // invitation acceptance (migration 20260811115753) already requires
  // email_confirmed_at is not null before turning an invitation into a real
  // membership. Granting the most powerful role in the system on a weaker
  // check than an ordinary invite would be a hole, not a shortcut. No force
  // flag: an unverified address must be verified through the normal flow
  // before it can hold this role.
  if (!user.email_confirmed_at) {
    console.error(`${email} exists but has not verified its email address (email_confirmed_at is null). Verify the account first, then re-run.`)
    process.exitCode = 1
    return
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
    return
  }

  if (existing.role_id === 'owner' && existing.status === 'active') {
    console.log(`${email} is already an active owner of HIMARK. Nothing to change.`)
    return
  }

  console.error(
    `${email} already has a HIMARK membership (role_id=${existing.role_id}, status=${existing.status}) ` +
      'that differs from an active owner. The enforce_membership_role_change trigger only permits ' +
      'role_id changes to callers with an authenticated owner session (auth.uid() + has_role()), which ' +
      'this service-role script does not have and must not attempt to work around. Sign in as an existing ' +
      'owner and change the role there, or resolve this manually with full awareness of the trigger.',
  )
  process.exitCode = 1
}

await main()
