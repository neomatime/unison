# Client tenant provisioning

**Date:** 2026-08-26
**Status:** Approved, ready for planning

## Why

UNISON has one organisation, HIMARK, put there by a seed migration. Nothing in
the application creates another: `from('organizations')` appears nowhere in
`features/`, `app/`, `lib/` or `scripts/`. The Internal provisioning wizard at
`/internal/provisioning/new` collects a full tenant setup and, on submit, writes
nothing — it is a UI shell over `features/internal-provisioning/data.ts`.

So a client cannot be added, and therefore cannot sign in. This spec covers the
smallest change that makes a client tenant real: an organisation, its
frameworks, and an invitation its first administrator can accept.

## How client users authenticate

**By invitation and password.** That path already exists and has been proven end
to end: `send-invitation` → `accept-invitation` / `sign-up-from-invitation` →
`signInWithPassword`, with hashed tokens.

"Continue with Microsoft" stays HIMARK-only. The Entra app registration is
single-tenant, so no account outside HIMARK's directory can authenticate through
it, and `claim_directory_membership()` additionally requires an organisation
whose `email_domain` matches the caller's. Client organisations use neither.

Multi-tenant Entra and per-client SSO were both considered and deferred. Neither
is needed for a client to work, and both widen who can authenticate to Supabase
before anyone has asked for it.

## Scope

The wizard collects an organisation, a tier, a primary admin, initial users,
departments, teams, delivery roles, and toggles for guest access, restricted
projects, SSO-required and MFA-required. Several are whole domains, and the last
two describe enforcement that exists nowhere in the codebase.

**In scope:** the organisation, its frameworks, and the primary admin's
invitation.

**Out of scope, deliberately:** initial users beyond the admin, departments,
teams, delivery roles, the access toggles, tier enforcement, and any UI for
editing an organisation after creation. The client's own admin adds their people
once inside.

## Why this cannot be ordinary writes

Two policies decide the architecture.

**`organizations` has no insert policy** — only `select` (`is_member_of(id)`) and
`update` (`has_role(id, ['owner','admin'])`). No authenticated caller can create
one through PostgREST, deliberately, in the same way no table has a delete
policy.

**`invitations_insert` requires `has_role(organization_id, ['owner'])`**, or
admin for a non-owner role. A HIMARK administrator is not a member of the client
organisation being created, so cannot insert its invitation — and the first
admin's invitation carries `role_id = 'owner'`, which only an existing owner of
that organisation may issue.

Provisioning therefore runs as one `security definer` function, the pattern
`delete_organization()` and `claim_directory_membership()` already use.

## The functions

### `provision_organization`

```
provision_organization(
  p_name              text,
  p_slug              text,
  p_admin_email       text,
  p_token_hash        text,
  p_expires_at        timestamptz
) returns uuid                          -- the new organization id

security definer, set search_path = ''
```

In one transaction:

1. Reject unless the caller is an active `owner` or `admin` of the organisation
   whose slug is `himark`. Raise with errcode `42501`.
2. Insert `organizations (name, slug, status 'active', email_domain null)`.
3. Seed the six frameworks and their phases for that organisation — the same set
   and the same 8/8/6/8/8/8 phase distribution as
   `20260826103742_seed_delivery_frameworks.sql`, with Client Onboarding taking
   its own six stages.
4. Insert `invitations (organization_id, email, role_id 'owner', token_hash,
   expires_at)`.
5. Write `audit_events` rows for the organisation and the invitation.

Step 5 is explicit because neither table has an audit trigger — `organizations`
and `invitations` carry only `set_updated_at`. `frameworks` and
`framework_phases` do have `record_audit_event` triggers, so steps 3's rows
audit themselves and must not be recorded twice. `delete_organization()` writes
its own audit row for exactly this reason.

All five together, so a tenant can never exist without frameworks or without a
way in. Step 3 also closes the gap recorded in `docs/follow-ups.md`: because
`projects.framework_id` is `not null`, an organisation with no frameworks meets
a New Project form it cannot submit.

### `reissue_invitation`

```
reissue_invitation(
  p_organization_id   uuid,
  p_email             text,
  p_token_hash        text,
  p_expires_at        timestamptz
) returns void

security definer, set search_path = ''
```

Same authorisation check. Sets any pending invitation for that address to
`status = 'expired'`, then inserts a fresh one. Expiring rather than deleting
keeps the record of what was issued and when.

**It must be `status`, not `expires_at`.** `invitations_one_pending_per_email` is
a partial unique index on `(organization_id, lower(email)) where status =
'pending'`, so backdating `expires_at` would leave the old row still occupying
that slot and the insert would fail with 23505. This is the same sweep
`send-invitation.ts` performs before inserting, for the same reason.

`token_hash` is `text`, not `bytea`, matching the column — `send-invitation.ts`
stores the string `'\x' || <sha256 hex>`, and both functions must produce a hash
in exactly that format or a valid token will fail to match.

This exists because of a specific failure. The transaction commits, then the
email send fails — Graph times out, the address is wrong, the client secret has
expired. The organisation and the invitation both exist, but the raw token lived
only in memory and is gone. Nobody can enter that tenant, and no HIMARK
administrator can issue a replacement, because they hold no owner role there. The
result is a dead tenant needing direct database access to fix. Fifteen lines
prevent it.

## Why `email_domain` stays null

`email_domain` is the column `claim_directory_membership()` matches a Microsoft
identity against. Setting it to a client's domain would mean that if the Entra
registration ever became multi-tenant, every holder of an address at that domain
would silently auto-join the tenant as a member — no invitation, no approval, no
audit of a decision anybody made.

Client organisations authenticate by invitation, so they do not need it. Leaving
it null makes that future mistake impossible rather than merely unlikely.

## Module surface

```
features/internal-provisioning/
  schemas/provisioning.ts             zod: name, slug, adminEmail
  actions/provision-organization.ts   'use server'
  queries/list-organizations.ts       replaces the mocked register
```

The action:

1. Validates input; derives `slug` from `name` when not supplied.
2. Generates the token exactly as `send-invitation.ts:64-67` does —
   `randomBytes(32).toString('base64url')`, hashed
   `'\\x' + createHash('sha256').update(raw).digest('hex')`, expiring on the same
   schedule. The raw token never reaches the database.
3. Calls `provision_organization` through the **caller's own session**, not the
   service key, so the function's authorisation check is the real gate rather
   than decoration.
4. Sends the invitation through the existing Graph path, to
   `${appUrl}/accept-invitation?token=${rawToken}`.
5. On email failure, reports plainly that the organisation was created but not
   notified, and names `reissue_invitation` as the recovery.

The client then follows the path that already works: accept, set a password,
sign in.

## Testing

Unit tests for the schema, including slug derivation.

Integration tests under `tests/integration/rls/`:

- a member of a client organisation calling `provision_organization` is refused
- a HIMARK **member** — not owner or admin — is refused
- a HIMARK owner succeeds, producing exactly one organisation, six frameworks
  with the correct phase counts, and one invitation with `role_id = 'owner'`
- the new organisation is invisible to members of other organisations
- `reissue_invitation` supersedes a pending invitation rather than duplicating it
- `reissue_invitation` from a non-HIMARK caller is refused

## Success criteria

A HIMARK administrator completes the wizard; an organisation exists with its six
frameworks; the named administrator receives an invitation email, accepts it,
sets a password, signs in, and lands in their own workspace seeing none of
HIMARK's data. Creating a project in that tenant works immediately, because its
frameworks exist.
