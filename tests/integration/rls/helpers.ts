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

// Simulates a Microsoft sign-in by giving a fixture user an azure identity.
// The real OAuth handshake cannot run in a test; claim_directory_membership()
// reads this table either way, so the authorisation rules are exercised
// faithfully.
//
// This cannot go through admin.schema('auth').from('identities').insert() --
// PostgREST on this project exposes only the `public` and `graphql_public`
// schemas (confirmed live: that call returns PGRST106, "Invalid schema:
// auth"), and there is no GoTrue Admin API method for writing an identity
// the way createUser()/updateUserById() exist for auth.users. Instead this
// calls public.rls_test_give_azure_identity(), a SECURITY DEFINER bridge
// (migration 20260818171200_rls_test_give_azure_identity.sql, fenced by
// 20260818224500_fence_rls_test_give_azure_identity.sql) restricted to
// service_role, which is the same kind of bridge claim_directory_membership()
// itself uses to reach auth.users/auth.identities from the public schema
// side. The fencing migration additionally refuses any target_user_id whose
// own email doesn't end in `.test` -- every fixture below follows that
// convention, so a wrong id here (this account, HIMARK's real accounts,
// anything not manufactured by this suite) is refused loudly rather than
// silently attaching a fabricated Microsoft identity to a real user.
export async function giveAzureIdentity(userId: string, email: string) {
  const { error } = await admin.rpc('rls_test_give_azure_identity', {
    target_user_id: userId,
    target_email: email,
  })
  if (error) throw error
}

export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

// GUARANTEE: cleanup() must remove every row a fixture caused, in every
// table, with no exceptions -- including audit_events rows that
// delete_organization() deliberately leaves behind. That survival is correct
// production behaviour (an organization's audit trail, especially the record
// of who deleted it, must outlive the organization -- see migration
// 20260816232306_deletable_organizations.sql), but it is wrong for synthetic
// fixture data: applied to test runs on a shared database, it accumulates
// forever, un-owned by any organization and invisible to anything but the
// service role. If you add a fixture path that writes to a new table, extend
// this function (or its caller) to remove those rows too -- "the suite never
// assumes an empty table" cuts both ways: it must not assume it's fine to
// leave one fuller than it found it, either.
//
// auth.identities (rows created by giveAzureIdentity() above) needs no
// separate delete here: identities_user_id_fkey is `on delete cascade` onto
// auth.users(id) -- confirmed live via pg_constraint -- so the userIds
// deletion loop below already removes them as a side effect of deleting the
// user. There is no audit trail on that table either (no triggers on
// auth.identities), so unlike clients and memberships there is no
// audit_events residue to trace for it. This still counts as "covered by
// cleanup", not "nothing to do": if a future migration ever changes that FK
// to `on delete set null` or adds an audit trigger, this table joins
// clients/memberships as something this function must handle explicitly.
//
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
//
// audit_events provenance cannot be captured by querying "what's tied to
// this org right now, before we delete it" -- some specs (e.g.
// deletable-organizations.test.ts) call delete_organization() themselves,
// as the very thing under test, before this `after` hook ever runs. By the
// time cleanup() sees that fixture, the org is already gone and every row
// it touched already has organization_id = null -- there is no "before" left
// to snapshot. And blindly deleting every null-organization_id row is unsafe
// regardless: it would also delete genuine history from any org ever
// legitimately deleted (not a concern today, since nothing but this suite
// calls delete_organization(), but the query itself must not depend on that
// happening to be true).
//
// The fix: identify rows by what they permanently recorded about
// themselves, not by current table state or ordering.
//   - The organization's own deletion event is unambiguous: resource =
//     'organizations', resource_id = this org's id. Only delete_organization()
//     ever writes that combination, and resource_id is a random UUID no
//     unrelated row could coincidentally share.
//   - clients_audit's insert/update/delete events for this org's clients
//     rows are identified by the organization_id *recorded inside the JSONB
//     snapshot* (new_value for insert, old_value for delete, both for
//     update) -- which clients_audit wrote while the row's real
//     organization_id column was still valid, and which the later `on
//     delete set null` on the *column* never touches, because it's just
//     JSON text at that point, not a live foreign key.
// Both queries also filter on organization_id is null, so this can never
// touch a row still legitimately attached to a live organization (HIMARK's
// or anyone else's).
//
// Coverage as of Task 12's fix round 1: this accounts for clients_audit
// (resource = 'clients', via the JSONB-snapshot technique above) and for
// public.accept_invitation()'s own audit write (resource = 'memberships',
// see below). Those are the only two audit-writing paths that can attach a
// row to a fixture organization today. The rule stands: any new
// audit-writing path (a trigger on another child table, another
// SECURITY DEFINER function that inserts into audit_events) needs its
// resource type added here, with a way to trace an orphaned row back to
// this fixture, or its rows leak into the shared database exactly like
// these did.
//
// memberships-resource rows need a different tracing strategy than
// clients_audit's, because their provenance isn't shaped the same way.
// accept_invitation() (20260811131355_accept_invitation_idempotent_active_member.sql)
// writes new_value as jsonb_build_object('via', 'invitation', 'invitation_id',
// ..., 'role_id', ..., 'status', 'active') -- organization_id is never a key
// in that JSONB, so the "read organization_id back out of the snapshot"
// trick clients_audit rows above use does not apply here.
//
// What accept_invitation() does write immutably is actor_id = auth.uid():
// the id of whichever fixture user called it. userIds is already a
// parameter of this function, so that is the traceable link -- PROVIDED it
// runs before the userIds deletion loop below, since audit_events.actor_id
// itself has `on delete set null` on auth.users and would otherwise be
// nulled out from under this query by the very users loop that follows it,
// the same ordering hazard organization_id has for delete_organization()
// above. Because these are fresh, randomly generated (createFixtureUser)
// ids unique to this test run, matching on actor_id can never reach a real
// user's audit history.
export async function cleanup(organizationIds: string[], userIds: string[]) {
  const errors: unknown[] = []
  for (const id of organizationIds) {
    const { error: deleteOrgError } = await admin.rpc('delete_organization', { target_org: id })
    if (deleteOrgError) errors.push(deleteOrgError)

    const { data: orgEvent, error: orgEventError } = await admin
      .from('audit_events')
      .select('id')
      .is('organization_id', null)
      .eq('resource', 'organizations')
      .eq('resource_id', id)
    if (orgEventError) errors.push(orgEventError)

    const { data: clientEvents, error: clientEventsError } = await admin
      .from('audit_events')
      .select('id')
      .is('organization_id', null)
      .eq('resource', 'clients')
      .or(`old_value->>organization_id.eq.${id},new_value->>organization_id.eq.${id}`)
    if (clientEventsError) errors.push(clientEventsError)

    const auditIds = [...(orgEvent ?? []), ...(clientEvents ?? [])].map((row) => row.id as string)
    if (auditIds.length > 0) {
      const { error: auditDeleteError } = await admin.from('audit_events').delete().in('id', auditIds)
      if (auditDeleteError) errors.push(auditDeleteError)
    }
  }

  if (userIds.length > 0) {
    const { data: membershipEvents, error: membershipEventsError } = await admin
      .from('audit_events')
      .select('id')
      .is('organization_id', null)
      .eq('resource', 'memberships')
      .in('actor_id', userIds)
    if (membershipEventsError) errors.push(membershipEventsError)

    const membershipAuditIds = (membershipEvents ?? []).map((row) => row.id as string)
    if (membershipAuditIds.length > 0) {
      const { error: membershipAuditDeleteError } = await admin.from('audit_events').delete().in('id', membershipAuditIds)
      if (membershipAuditDeleteError) errors.push(membershipAuditDeleteError)
    }
  }

  // Deleting the user also removes any auth.identities row giveAzureIdentity()
  // created for them, via identities_user_id_fkey's `on delete cascade` --
  // see the GUARANTEE comment above for why that needs no separate step here.
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) errors.push(error)
  }
  if (errors.length > 0) {
    console.error('cleanup encountered errors:', errors)
    throw new Error(`cleanup failed to fully remove fixtures: ${JSON.stringify(errors)}`)
  }
}
