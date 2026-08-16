import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

import { readSupabasePublicEnv, readSupabaseSecretKey } from '../../../lib/env.ts'

const env = readSupabasePublicEnv(process.env)
const secret = readSupabaseSecretKey(process.env)

// service-role client: bypasses RLS entirely, used only to set up and tear
// down fixtures and to establish ground truth. Never used to make the
// assertions themselves -- those go through a signed-in client so the RLS
// policies are actually the thing under test.
export const admin = createClient(env.SUPABASE_URL, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function createFixtureOrg(label: string) {
  const { data, error } = await admin
    .from('organizations')
    .insert({ name: `RLS ${label} ${randomUUID().slice(0, 8)}`, slug: `rls-${randomUUID().slice(0, 8)}` })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function createFixtureUser(organizationId: string | null, roleId: 'owner' | 'admin' | 'member' = 'member') {
  const email = `rls-${randomUUID()}@unison.test`
  const password = randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  if (organizationId) {
    const { error: membershipError } = await admin
      .from('memberships')
      .insert({ organization_id: organizationId, user_id: data.user.id, role_id: roleId, status: 'active' })
    if (membershipError) throw membershipError
  }
  return { id: data.user.id, email, password }
}

export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

// Best-effort and order-independent: a failure partway through one fixture's
// teardown must not stop the others from being attempted, since `after`
// hooks run even when a `before` hook throws partway through setup (e.g. the
// org fixture exists but the user fixture failed), and this is the only
// chance to clean up before the suite exits.
//
// Organizations are removed through public.delete_organization() -- the
// sanctioned deletion path added in migration
// 20260816232306_deletable_organizations.sql -- rather than by hand-ordering
// child deletes here. An earlier version of this helper deleted `clients`
// before `organizations` to work around a schema defect (deleting an
// organization with clients rows raised 23503, because the clients_audit
// trigger's audit_events insert raced the cascading delete's FK check); that
// defect is now fixed at the schema level, and calling delete_organization()
// directly means this helper exercises the exact same path production code
// (and the deletable-organizations.test.ts spec) would use, instead of a
// bespoke workaround that could drift from it. delete_organization() is
// idempotent -- a nonexistent id is a silent no-op -- and permits the
// service role in addition to an organization's owner, so this admin client
// can call it directly.
export async function cleanup(organizationIds: string[], userIds: string[]) {
  const errors: unknown[] = []
  for (const id of organizationIds) {
    const { error } = await admin.rpc('delete_organization', { target_org: id })
    if (error) errors.push(error)
  }
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) errors.push(error)
  }
  if (errors.length > 0) {
    console.error('cleanup encountered errors:', errors)
    throw new Error(`cleanup failed to fully remove fixtures: ${JSON.stringify(errors)}`)
  }
}
