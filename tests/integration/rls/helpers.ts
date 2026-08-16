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
// `clients` rows are deleted explicitly, before the organization, rather
// than left to `organizations`' `on delete cascade`. Discovered empirically:
// clients_audit is an AFTER DELETE trigger that INSERTs into audit_events
// (organization_id references organizations, no cascade timing exception).
// When the cascade fires that trigger as a side effect of deleting the
// parent organization row in the same statement, the audit insert's FK
// check finds the organization already gone and raises 23503 -- which
// aborts and rolls back the *entire* delete statement, including the
// cascade, silently leaving the organization (and everything under it)
// behind. Deleting `clients` first, as its own statement while the
// organization row still exists, lets that trigger's insert succeed, so the
// later organization delete has nothing left to cascade through it.
export async function cleanup(organizationIds: string[], userIds: string[]) {
  const errors: unknown[] = []
  for (const id of organizationIds) {
    const { error: clientsError } = await admin.from('clients').delete().eq('organization_id', id)
    if (clientsError) errors.push(clientsError)
    const { error } = await admin.from('organizations').delete().eq('id', id)
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
