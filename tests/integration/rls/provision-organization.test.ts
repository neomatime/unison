import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

/** The same shape provision-organization.ts and send-invitation.ts produce. */
function hash(rawToken: string): string {
  return '\\x' + createHash('sha256').update(rawToken).digest('hex')
}

// One sign-in per fixture user, reused across tests. Every test in this file
// used to sign in again; GoTrue's rate limit is per project and shared with
// the rest of the RLS suite, so a file that signs in a dozen times is what
// tips a whole-suite run into 429s. The session is not the thing under test
// here -- what the signed-in role may call is.
const sessions = new Map<string, Promise<SupabaseClient>>()
function sessionFor(user: { email: string; password: string }): Promise<SupabaseClient> {
  const existing = sessions.get(user.email)
  if (existing) return existing
  const client = signedInClient(user.email, user.password)
  sessions.set(user.email, client)
  return client
}

/** No session at all — exactly what someone holding an invitation link has. */
const anonymous = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let himarkId: string
let himarkAdmin: { id: string; email: string; password: string }
let himarkMember: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
const provisioned: string[] = []

before(async () => {
  const { data, error } = await admin
    .from('organizations').select('id').eq('slug', 'himark').single()
  if (error) throw error
  himarkId = data.id

  himarkAdmin = await createFixtureUser(himarkId, 'admin')
  himarkMember = await createFixtureUser(himarkId, 'member')
  outsiderOrg = await createFixtureOrg('provision-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')
})

after(async () => {
  await cleanup(
    [outsiderOrg, ...provisioned].filter(Boolean),
    [himarkAdmin?.id, himarkMember?.id, outsider?.id].filter(Boolean) as string[],
  )
})

function args(name: string) {
  return {
    p_name: name,
    p_slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
    p_admin_email: `admin-${randomUUID()}@client.test`,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    p_actor_id: himarkAdmin.id,
  }
}

test('a signed-in HIMARK admin cannot call provision_organization at all', async () => {
  // The grant pin, and the whole point of this change. Before it, this call
  // succeeded with a caller-chosen p_token_hash and a p_admin_email the caller
  // did not control, which made it a platform-wide account takeover via the
  // pre-confirmed signed-out invited-signup path.
  const client = await sessionFor(himarkAdmin)
  const payload = args('RLS Provision Denied')
  const { data, error } = await client.rpc('provision_organization', payload)
  // If the authenticated grant is ever restored, this call stops failing at
  // the grant and starts *succeeding* -- the assertion below fails, but the
  // fixture it just created must still be swept, or a regression that turns
  // this test red also leaks "RLS Provision Denied" and its frameworks into
  // the shared database on every run until someone notices.
  if (data) provisioned.push(data as string)
  assert.ok(error, 'provisioning must be unreachable from an authenticated session')
  assert.match(error!.message, /permission denied for function provision_organization/i)
})

test('a 6-argument call cannot resurrect the old signature', async () => {
  // Pins the absence of the pre-actor overload. p_token_hash stays a caller
  // choice deliberately (see the migration's own header comment), so the only
  // thing standing between an authenticated caller and the original account-
  // takeover primitive is that the 6-arg signature no longer exists at all --
  // not just that it is unreachable. A resurrected
  // (text,text,text,text,timestamptz,text) overload, even one still granted
  // only to service_role, would make every other spec in this file green
  // while `authenticated` regained a path if that grant were also restored,
  // because PostgREST resolves on argument names, and every other spec here
  // always supplies p_actor_id.
  const client = await sessionFor(himarkAdmin)
  const { p_actor_id, ...sixArgs } = args('RLS Provision Old Signature')
  const { data, error } = await client.rpc('provision_organization', sixArgs)
  if (data) provisioned.push(data as string)
  assert.ok(error, 'the six-argument signature must not resolve to anything')
  assert.equal(error!.code, 'PGRST202')
})

test('a HIMARK admin provisions an organization with frameworks and an owner invitation', async () => {
  const payload = args('RLS Provision Alpha')
  const { data: orgId, error } = await admin.rpc('provision_organization', payload)
  assert.equal(error, null)
  assert.ok(orgId)
  provisioned.push(orgId as string)

  const { data: frameworks } = await admin
    .from('frameworks').select('id, name').eq('organization_id', orgId)
  assert.equal(frameworks?.length, 6, 'every tenant needs frameworks or New Project cannot submit')

  const onboarding = frameworks!.find((f) => f.name === 'Client Onboarding')!
  const { data: onboardingPhases } = await admin
    .from('framework_phases').select('id').eq('framework_id', onboarding.id)
  assert.equal(onboardingPhases?.length, 6)

  const other = frameworks!.find((f) => f.name === 'Product Launch')!
  const { data: otherPhases } = await admin
    .from('framework_phases').select('id').eq('framework_id', other.id)
  assert.equal(otherPhases?.length, 8)

  const { data: invites } = await admin
    .from('invitations')
    .select('email, role_id, status, token_hash, expires_at, invited_by')
    .eq('organization_id', orgId)
  assert.equal(invites?.length, 1)
  assert.equal(invites![0].role_id, 'owner')
  assert.equal(invites![0].status, 'pending')
  assert.equal(invites![0].email, payload.p_admin_email.toLowerCase())
  assert.equal(invites![0].token_hash, payload.p_token_hash)
  assert.equal(
    new Date(invites![0].expires_at as string).getTime(),
    new Date(payload.p_expires_at).getTime(),
  )

  // Attribution is now the parameter, not auth.uid(). Under the service role
  // auth.uid() is null, so without p_actor_id every provisioned tenant would
  // record that an owner invitation was minted and not by whom.
  assert.equal(invites![0].invited_by, himarkAdmin.id)
})

test('the provisioning audit rows name the actor', async () => {
  // Covers all four resources a provision writes audit_events for, not just
  // the two hand-written inserts. frameworks and framework_phases are
  // recorded by record_audit_event() triggers, not by this function's own
  // inserts, and under a bare service-role call auth.uid() -- what that
  // trigger attributes to -- is null. A spec that filtered to only
  // ['organizations', 'invitations'] could not see fifty-two unattributable
  // rows (six frameworks + forty-six phases) per tenant; this one can.
  const { data: events } = await admin
    .from('audit_events').select('resource, actor_id')
    .eq('organization_id', provisioned[0])
    .in('resource', ['organizations', 'invitations', 'frameworks', 'framework_phases'])
  assert.equal(events?.length, 1 + 1 + 6 + 46, 'organisation + invitation + 6 frameworks + 46 phases')
  for (const event of events!) {
    assert.notStrictEqual(event.actor_id, null, `${event.resource} must not be unattributable`)
    assert.equal(event.actor_id, himarkAdmin.id, `${event.resource} must be attributable to the actor who provisioned`)
  }
})

test('the provisioned organization carries no email_domain', async () => {
  // Populating it would let anyone at that domain auto-join through
  // claim_directory_membership if Entra ever went multi-tenant.
  const { data } = await admin
    .from('organizations').select('email_domain').eq('id', provisioned[0]).single()
  assert.equal(data?.email_domain, null)
})

test('a null actor is refused', async () => {
  const payload = { ...args('RLS Provision No Actor'), p_actor_id: null }
  const { data, error } = await admin.rpc('provision_organization', payload)
  assert.ok(error, 'an unattributable provision must not create a tenant')
  assert.equal(error!.code, '22023')
  assert.equal(data, null)

  const { data: orphan } = await admin
    .from('organizations').select('id').eq('slug', payload.p_slug)
  assert.deepEqual(orphan, [], 'the rejection must roll back the organisation too')
})

test('a HIMARK member who is not owner or admin is refused, even through the service role', async () => {
  // Before this change service_role skipped the authorisation check entirely.
  // Once service_role is the ONLY caller, that bypass would have meant no
  // check at all, so it was removed in the same migration.
  const payload = { ...args('RLS Provision Member'), p_actor_id: himarkMember.id }
  const { error } = await admin.rpc('provision_organization', payload)
  assert.ok(error, 'a plain member must not be able to create tenants')
  assert.match(error.message, /HIMARK administrator/i)
})

test('an owner of another organization is refused, even through the service role', async () => {
  const payload = { ...args('RLS Provision Outsider'), p_actor_id: outsider.id }
  const { error } = await admin.rpc('provision_organization', payload)
  assert.ok(error, 'owning some organization must not confer provisioning rights')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('the provisioned organization is invisible to an outsider', async () => {
  const client = await sessionFor(outsider)
  const { data } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(data, [], 'a new tenant must not leak to other organizations')
})

test('a HIMARK admin lists the tenants their own RLS hides from them', async () => {
  const client = await sessionFor(himarkAdmin)

  // The premise: organizations_select is is_member_of(id), and a HIMARK
  // administrator is not a member of the tenants they provision. A plain
  // select must come back empty, or the function has nothing to do.
  const { data: direct } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(direct, [], 'the register cannot be built from a direct select')

  const { data, error } = await client.rpc('list_provisioned_organizations')
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ id: string; status: string; admin_email: string | null }>
  const row = rows.find((organization) => organization.id === provisioned[0])
  assert.ok(row, 'the provisioned tenant must reach the internal register')

  const { data: invitation } = await admin
    .from('invitations').select('email')
    .eq('organization_id', provisioned[0]).eq('role_id', 'owner').single()
  assert.equal(row.admin_email, invitation!.email, 'the Primary Admin column is the owner invitation')
  assert.equal(row.status, 'active')
})

test('a HIMARK member who is not owner or admin cannot list organizations', async () => {
  const client = await sessionFor(himarkMember)
  const { error } = await client.rpc('list_provisioned_organizations')
  assert.ok(error, 'the read counterpart must carry the same authorisation as provisioning')
  assert.match(error.message, /HIMARK administrator/i)
})

test('an owner of another organization cannot list organizations', async () => {
  const client = await sessionFor(outsider)
  const { error } = await client.rpc('list_provisioned_organizations')
  assert.ok(error, 'owning some organization must not confer sight of every tenant')
  assert.match(error!.message, /HIMARK administrator/i)
})

// ---------------------------------------------------------------------------
// reissue_invitation. Migration 20260826172947 revoked execute on it from
// `authenticated`, leaving service_role only, because guard 2 -- "a prior
// owner invitation already exists for this (organization, address)" -- is
// manufactured for every tenant by provision_organization itself at creation
// time, and so blocks nothing the product actually contains. Composed with
// list_provisioned_organizations (which hands any HIMARK owner/admin the
// (id, admin_email) pair for every organization), the caller-chosen
// p_token_hash, and lib/invitations/create-invited-account.ts (which creates a
// PRE-CONFIRMED account for the invited address with a caller-chosen
// password), that let any HIMARK admin take owner access to any tenant whose
// administrator had not yet signed up, without touching their mailbox.
//
// So the behaviour tests below drive the function through the service-role
// client, and the authenticated ones assert the refusal now lands at the grant
// rather than inside the function.
// ---------------------------------------------------------------------------

test('reissue supersedes the pending invitation rather than duplicating it, and the reissued token resolves', async () => {
  const orgId = provisioned[0]

  const { data: before } = await admin
    .from('invitations').select('id, email, status')
    .eq('organization_id', orgId).eq('status', 'pending')
  assert.equal(before?.length, 1)
  const email = before![0].email

  // A real raw token, hashed exactly the way the action hashes it, so the
  // acceptance side can be walked below rather than only the row shape.
  const rawToken = randomBytes(32).toString('base64url')
  const newTokenHash = hash(rawToken)
  const newExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const { error } = await admin.rpc('reissue_invitation', {
    p_organization_id: orgId,
    p_email: email,
    p_token_hash: newTokenHash,
    p_expires_at: newExpiresAt,
  })
  assert.equal(error, null, 'the partial unique index must not reject the new row')

  const { data: pendingAfter } = await admin
    .from('invitations')
    .select('id, token_hash, role_id, invited_by, expires_at')
    .eq('organization_id', orgId).eq('status', 'pending')
  assert.equal(pendingAfter?.length, 1, 'exactly one invitation may be pending per address')

  // Task 3 depends on the reissued token round-tripping byte-for-byte, the
  // same guarantee the provisioning test above pins for the original token.
  assert.equal(pendingAfter![0].token_hash, newTokenHash)
  assert.equal(pendingAfter![0].role_id, 'owner')
  // invited_by is auth.uid(), and a service-role call has none. This is the
  // shape of a genuine operator recovery now: attributable to the script, not
  // to a signed-in HIMARK session.
  assert.equal(pendingAfter![0].invited_by, null)
  assert.equal(
    new Date(pendingAfter![0].expires_at as string).getTime(),
    new Date(newExpiresAt).getTime(),
  )

  const { data: expired } = await admin
    .from('invitations').select('id').eq('organization_id', orgId).eq('status', 'expired')
  assert.equal(expired?.length, 1, 'the old one is expired, not deleted')

  // The acceptance side, which nothing exercised before: the token a reissue
  // mints is a working invitation link. This is why who may call the function
  // matters -- whoever holds this raw token can create the account.
  const { data: preview, error: previewError } = await anonymous.rpc('invitation_preview', {
    raw_token: rawToken,
  })
  assert.equal(previewError, null)
  assert.equal(preview?.length, 1, 'a reissued token must resolve for a signed-out invitee')
  assert.equal(preview![0].email, email)
})

test('a signed-in HIMARK admin cannot call reissue_invitation at all', async () => {
  // The grant pin. If a future `create or replace` restores execute to
  // `authenticated`, this call stops failing at the grant and starts failing
  // (or succeeding) inside the function, and this assertion breaks.
  const client = await sessionFor(himarkAdmin)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: `admin-chosen-${randomUUID()}@client.test`,
    p_token_hash: hash(randomBytes(32).toString('base64url')),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'reissue_invitation must be unreachable from an authenticated session')
  assert.match(error!.message, /permission denied for function reissue_invitation/i)
})

test('a HIMARK admin cannot reissue into a foreign existing organisation', async () => {
  // The escalation walk, end to end. provisioned[0] is a tenant this admin
  // provisioned; outsiderOrg is an organisation they have no relationship with
  // at all. list_provisioned_organizations hands them its id, and before the
  // revoke, a self-chosen token hash plus the signed-out invited-signup path
  // was the whole attack.
  const client = await sessionFor(himarkAdmin)

  // Premise: it really is foreign -- their own RLS cannot see it.
  const { data: visible } = await client.from('organizations').select('id').eq('id', outsiderOrg)
  assert.deepEqual(visible, [], 'the fixture must be an organisation the admin has no role in')

  const rawToken = randomBytes(32).toString('base64url')
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: outsiderOrg,
    p_email: outsider.email,
    p_token_hash: hash(rawToken),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'a HIMARK admin must not be able to mint an invitation into a foreign tenant')
  assert.match(error!.message, /permission denied for function reissue_invitation/i)

  // Second layer, in case the grant is ever restored: guard 2 refuses an
  // organisation with no prior owner invitation.
  const { error: serviceError } = await admin.rpc('reissue_invitation', {
    p_organization_id: outsiderOrg,
    p_email: outsider.email,
    p_token_hash: hash(rawToken),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(serviceError)
  assert.match(serviceError!.message, /no prior owner invitation/i)

  // Nothing was written either way, and no token the attacker chose resolves.
  const { data: invitations } = await admin
    .from('invitations').select('id').eq('organization_id', outsiderOrg)
  assert.deepEqual(invitations, [], 'no invitation may exist in an organisation nobody invited into')
  const { data: preview } = await anonymous.rpc('invitation_preview', { raw_token: rawToken })
  assert.deepEqual(preview, [], 'a token the caller chose must never become a working link')
})

test('an outsider cannot reissue an invitation into a tenant', async () => {
  const client = await sessionFor(outsider)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: 'someone@client.test',
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'reissue must not be reachable from an ordinary tenant session')
  assert.match(error!.message, /permission denied for function reissue_invitation/i)
})

test('a HIMARK member who is not owner or admin cannot reissue an invitation', async () => {
  const client = await sessionFor(himarkMember)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: 'someone-else@client.test',
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'a plain HIMARK member must not be able to reissue invitations')
  assert.match(error!.message, /permission denied for function reissue_invitation/i)
})

test('reissue cannot target HIMARK itself, even through the service role', async () => {
  const { error } = await admin.rpc('reissue_invitation', {
    p_organization_id: himarkId,
    p_email: himarkAdmin.email,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'this recovery path must never mint an owner invitation into HIMARK itself')
  assert.match(error!.message, /HIMARK's own organization/i)
})

test('reissue refuses an address that was never invited', async () => {
  const { error } = await admin.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: `never-invited-${randomUUID()}@client.test`,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'reissue must only replace an invitation provision_organization already created')
  assert.match(error!.message, /no prior owner invitation/i)
})

// ---------------------------------------------------------------------------
// p_expires_at is caller-chosen on both write paths. Unclamped, a year-3000
// value is an owner invitation that never lapses, and a backdated one is a
// tenant whose only invitation is already dead while still occupying the
// invitations_one_pending_per_email slot. Both functions clamp it to
// (now(), now() + 30 days], errcode 22023.
// ---------------------------------------------------------------------------

for (const [label, offsetMs] of [['in the past', -86_400_000], ['more than 30 days ahead', 31 * 86_400_000]] as const) {
  test(`provision_organization refuses an expiry ${label}`, async () => {
    const payload = { ...args('RLS Provision Expiry'), p_expires_at: new Date(Date.now() + offsetMs).toISOString() }
    const { data, error } = await admin.rpc('provision_organization', payload)
    assert.ok(error, 'a malformed expiry must not produce a tenant')
    assert.equal(error!.code, '22023')
    assert.equal(data, null)

    // The whole function is one transaction, so a rejected expiry must leave
    // no organisation behind to be cleaned up.
    const { data: orphan } = await admin
      .from('organizations').select('id').eq('slug', payload.p_slug)
    assert.deepEqual(orphan, [], 'the rejection must roll back the organisation too')
  })

  test(`reissue_invitation refuses an expiry ${label}`, async () => {
    const { data: pending } = await admin
      .from('invitations').select('email').eq('organization_id', provisioned[0]).eq('status', 'pending')
    const { error } = await admin.rpc('reissue_invitation', {
      p_organization_id: provisioned[0],
      p_email: pending![0].email,
      p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
      p_expires_at: new Date(Date.now() + offsetMs).toISOString(),
    })
    assert.ok(error, 'a malformed expiry must not produce an invitation')
    assert.equal(error!.code, '22023')

    // And the invitation that was already pending is untouched -- a rejected
    // reissue must not expire the live link on its way out.
    const { data: after } = await admin
      .from('invitations').select('email').eq('organization_id', provisioned[0]).eq('status', 'pending')
    assert.equal(after?.length, 1)
    assert.equal(after![0].email, pending![0].email)
  })
}

test('an organization provisioned without a tier is core', async () => {
  // The column defaults to the smallest entitlement so a mistake withholds
  // access rather than granting it.
  const { data: orgId, error } = await admin.rpc('provision_organization', args('RLS Tier Default'))
  assert.equal(error, null)
  provisioned.push(orgId as string)

  const { data } = await admin.from('organizations').select('tier').eq('id', orgId).single()
  assert.equal(data?.tier, 'core')
})

test('an explicit tier is stored', async () => {
  const { data: orgId, error } = await admin.rpc('provision_organization', {
    ...args('RLS Tier Enterprise'),
    p_tier: 'enterprise',
  })
  assert.equal(error, null)
  provisioned.push(orgId as string)

  const { data } = await admin.from('organizations').select('tier').eq('id', orgId).single()
  assert.equal(data?.tier, 'enterprise')
})

test('an unknown tier is refused', async () => {
  const payload = { ...args('RLS Tier Bogus'), p_tier: 'platinum' }
  const { data, error } = await admin.rpc('provision_organization', payload)
  // Pinned to the in-function guard's own message, not just any error --
  // the column's check constraint would refuse 'platinum' too, but only the
  // in-function check names p_tier as the fault. If that guard were ever
  // deleted, this assertion (not just "an error occurred") would catch it.
  assert.ok(error, 'an unrecognised tier must not create an organization')
  assert.match(error!.message, /p_tier must be a known UNISON tier/)
  assert.equal(data, null)

  const { data: orphan } = await admin
    .from('organizations').select('id').eq('slug', payload.p_slug)
  assert.deepEqual(orphan, [], 'the rejection must leave no organisation behind')
})
