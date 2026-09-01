# Closing out the provisioning review

**Date:** 2026-09-01
**Status:** Approved, ready for planning

## Why

The post-merge review of the client-tenant-provisioning work recorded two
Important items and several smaller ones. The first is a platform-wide account
takeover, open today. The rest are surfaces and guards that describe a state the
system is not in.

This spec closes four of them. They are grouped because the first two are one
mechanism applied to two functions, and the last two are a lie and the broken
tripwire that was supposed to catch it.

### 1. `provision_organization` accepts a caller-chosen token hash

`provisionOrganizationAction` generates the invitation token server-side and
returns only `{ organizationId }`, so an operator driving the wizard never sees
it. **The `authenticated` grant is what reopens the hole**, by letting the same
operator skip the action and call the RPC directly with a `p_token_hash` of
their choosing.

The attack is not "an operator can enter a tenant they created" — that is
ordinary operator authority. It is that they can provision with `p_admin_email`
set to an address they do **not** control, then open the invitation signed out:
`lib/invitations/create-invited-account.ts` mints a **pre-confirmed,
platform-wide auth identity** for that address with a password they choose. The
organisation is a decoy; the account is the prize, and the real owner of that
address can never register under it afterwards.

That breaks the invariant `create-invited-account.ts` rests on — that presenting
the token proves control of the address — for *every* address, not just within
one tenant. `send-invitation.ts` never lets an inviter choose a token. Neither
should this.

Not exploitable while HIMARK has a single member. Real the moment a second
HIMARK owner or admin exists.

### 2. `reissue_invitation` writes null attribution

Migration `20260826172947` revoked `authenticated` from `reissue_invitation`,
leaving it service-role only — the correct cut, and the reason it is not part of
the attack above. But it still writes `invited_by` and `audit_events.actor_id`
from `auth.uid()`, which is null under service role. The only supported recovery
path for a failed provisioning email is therefore unattributable: the audit row
records that an owner invitation was minted and not by whom.

### 3. `Edit Internal Metadata` discards input

`OrganisationsScreen` renders real `organizations` rows. Its `Edit Internal
Metadata` row action opens a drawer over a real tenant's fields with the fields
editable and a save control whose only handler closes the drawer. Typed changes
vanish with no signal, and the drawer closing reads as confirmation.

This is worse than the Suspend/Archive theatre removed from the same screen:
that flipped a badge which reverted on refresh, so the lie was visible.

### 4. The tripwire that guards it is already broken

`tests/unit/ui-completeness.test.ts` pins the internal registers' row actions
with `assert.match(registers, new RegExp(action))` over the **whole file** for a
list that includes bare `'Suspend'` and `'Change Tier'`. The same file carries a
comment reading "a local-state Suspend/Archive that flips a badge", so the
assertion matches the prose whether or not the action still exists.

Deleting `TenantsScreen`'s Suspend action today leaves that test green. Item 3
adds a negative pin of exactly this kind; adding one to a mechanism known not to
hold is pointless.

## Scope

**In scope:** the four items above, their migrations, their tests, and the
amendment to the `service-role-boundary` rule that item 1 forces.

**Out of scope, deliberately:**

- Making invited signup require email verification. That repairs the same
  invariant from the other end and defends variants we have not thought of, but
  it adds a verification step to every new tenant admin's onboarding through
  Supabase's unbranded sender. Its own slice, its own decision.
- The other two tier surfaces from the same review — `list-organizations`
  hard-coding `tier: '—'` and "Change Tier" mutating React state. Those belong
  to the tier spec, with the wizard's "will enable all modules included in the
  selected tier" copy.
- `sessionFor` caching rejected promises in the RLS helpers. Real, unrelated
  test-harness flakiness. Stays in `docs/follow-ups.md`.

## Approach: service role with an explicit actor

Three options were considered. Narrowing the service-role surface to a separate
invitation-minting function was rejected as the same boundary decision with an
extra function to maintain. Repairing the invariant at `createInvitedAccount` is
deferred, above.

The chosen cut: **revoke `execute` from `authenticated`, add an explicit actor
parameter, and call the function from the action with the service role.**

`p_token_hash` stays a parameter. Once only `service_role` can call the function,
the token is chosen by trusted code rather than by a caller, so the parameter is
no longer a primitive anyone can reach. Moving generation into Postgres would
mean returning a raw secret in a function result, which is worse if statement
logging is ever enabled.

### The predicate

`public.has_role(org uuid, roles text[])` resolves `auth.uid()` internally.
Under service role that is null, so it returns false for every caller — it
cannot express "is this *named* actor a HIMARK administrator".

Add the actor-parameterised form and define the existing one in terms of it:

```sql
create function public.has_role_for(org uuid, actor uuid, roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = actor
      and organization_id = org
      and status = 'active'
      and role_id = any(roles)
  );
$$;

create or replace function public.has_role(org uuid, roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.has_role_for(org, auth.uid(), roles); $$;
```

One source of truth for the predicate, so the session path and the service-role
path cannot drift. `has_role` keeps its signature, so `create or replace` leaves
every RLS policy that depends on it working and its grants carry.

`has_role_for` needs no grant to `authenticated`: its only callers are
`security definer` functions, which execute as the owner. Lock it —
`revoke all ... from public, anon, authenticated` — and grant nothing.

### `provision_organization`

Adding a parameter makes a new function rather than replacing the old one, so
this is a drop-and-recreate. A required parameter must precede defaulted ones:

```sql
provision_organization(p_name text, p_slug text, p_admin_email text,
                       p_token_hash text, p_expires_at timestamptz,
                       p_actor_id uuid, p_tier text default 'core')
```

Three changes inside the body:

1. Reject a null `p_actor_id` with errcode `22023`, before any other check.
2. Replace the `auth.role() is distinct from 'service_role' and not
   public.has_role(...)` guard with an **unconditional**
   `public.has_role_for(himark_id, p_actor_id, array['owner','admin'])`.
3. Replace all three `auth.uid()` uses — two `audit_events.actor_id`, one
   `invitations.invited_by` — with `p_actor_id`.

Change 2 is the one to state plainly: today `service_role` **skips** the check.
Once service role is the only caller, leaving that branch in place would mean no
authorisation check at all. The bypass must go in the same migration that makes
service role the only caller, not after it.

Grants, restated because they do not carry to a new signature, and because
`revoke ... from public` alone does not strip Supabase's default grant to `anon`:

```sql
revoke all on function public.provision_organization(text, text, text, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.provision_organization(text, text, text, text, timestamptz, uuid, text)
  to service_role;
```

### `reissue_invitation`

The same treatment, and also a drop-and-recreate:

```sql
reissue_invitation(p_organization_id uuid, p_email text, p_token_hash text,
                   p_expires_at timestamptz, p_actor_id uuid)
```

Null check, unconditional `has_role_for(himark_id, p_actor_id, ...)` replacing
the service-role bypass, and `p_actor_id` for `invited_by` and
`audit_events.actor_id`. Grants stay `service_role` only, restated.

It has no application callers — it is invoked by a platform operator through a
service-role script — so the actor is supplied by whoever runs it. That is the
point: the recovery path becomes attributable to a person.

### The action

`features/internal-provisioning/actions/provision-organization.ts`:

- `getSessionContext()` moves **above** the RPC call. It is currently called
  after it, and `user.id` is now needed before.
- `createServerSupabase()` becomes `createAdminSupabase()`.
- `p_actor_id: user.id` — from the session, never from `formData`.
- The action does **not** re-check HIMARK membership. The function is the gate;
  a duplicate check in the action is a second thing to drift.

Everything else in the action is unchanged: the token generation, the 7-day
expiry, the email, the `emailFailed` branch, and the error mapping. Note that
`42501` already maps to "You do not have permission to provision organisations."
and that remains the correct message for a non-HIMARK actor.

### The boundary rule

`tests/unit/service-role-boundary.test.ts` forbids anything under `features/`
from importing `lib/supabase/admin`. Item 1 requires exactly that.

The rule gets an **explicit allowlist of one**, with the reason recorded in the
test itself rather than only in a commit message:

- Provisioning is privileged in a way no RLS policy can express: the operator
  creates an organisation they are not a member of, so there is no membership
  for a policy to check.
- Authorisation is not lost, it moves into the function, which checks
  `has_role_for` against a named actor on every call.

Relocating the call into `lib/` to satisfy the test was rejected, and the reason
is stronger than taste: **the rule is scoped to a directory, not to request
paths, and `lib/` already contains a service-role caller on one.**
`lib/invitations/create-invited-account.ts` imports `createAdminSupabase` and
runs on the signed-out accept-invitation request — the very code whose
pre-confirmed account creation makes item 1 an account takeover rather than a
tenant-access problem.

So moving the provisioning call one directory sideways would satisfy the test
while changing nothing about what the code does, next to a precedent proving the
test would not have caught it either. Amend the rule and record the reasoning.

A consequence worth naming: the allowlist should be understood as "these are the
request paths permitted to hold the service role", and `create-invited-account.ts`
belongs in it too — not because this spec changes that file, but because leaving
it outside the allowlist would preserve the same blind spot under a new name.
Whether the rule keys on directory or on an explicit list of files is the choice
being made here; it should key on the list.

`admin.ts`'s own doc comment currently reads "Never import this from anything
under features/ — a test enforces that". That is already untrue in spirit. It
changes with the rule.

Note the follow-ups entry calling `admin.ts` dead code is **stale** — it has had
this importer. Consolidating `tests/integration/rls/helpers.ts` and
`scripts/grant-owner.ts`, which each build their own service-role client, onto
the factory is still open and still **not** in this spec.

## Items 3 and 4

**Remove the `Edit Internal Metadata` row action** from `OrganisationsScreen` in
`features/internal-provisioning/components/internal-registers.tsx` — the single
`{ id: 'edit', ... }` entry. Its removal makes `open`'s `editable` parameter
unreachable, since it is the only call site passing `true`; remove the parameter
and the editable path in `InternalDrawer` if nothing else uses them.

**Fix the tripwire before adding to it.** In `ui-completeness.test.ts`, the
positive row-action assertions must match the *markup*, not the file. Two
defects to fix together:

- The list at the `internal registers provide non-destructive operational
  actions` assertion matches bare action names against the whole file, so a
  comment satisfies it. Match `label: '<Action>'` instead, which only the row
  action produces.
- `'Change Tier'` is pinned as present. The tier spec removes it. That
  assertion has to move with that change, not this one — this spec only makes
  the pin match markup, so that the tier spec's removal actually turns it red.

Then add the negative pin for item 3: `OrganisationsScreen`'s slice must not
contain `Edit Internal Metadata`, alongside the existing `'Suspend'` and
`'Archive'` assertions, which already scope correctly to that slice.

## Risk: the RLS fixtures may rely on the bypass

Removing the `service_role` bypass changes behaviour for every existing
service-role caller of both functions. If any RLS spec or helper calls
`provision_organization` through the service role and relies on the check being
skipped, it now fails with `42501`.

The resolution is to supply a real actor: the fixtures already create HIMARK
memberships, so a spec passes the id of a fixture HIMARK owner or admin. This is
called out here because it is the most likely way the change breaks something
that has nothing to do with the change, and because discovering it as a
mysterious `42501` mid-implementation costs more than reading it here.

## Testing

RLS specs (`tests/integration/rls/`):

- `authenticated` can no longer execute `provision_organization` — the call is
  refused, and the refusal is the grant, not the function's own check
- an actor who is not a HIMARK owner or admin is refused **even through service
  role**, with `42501`
- a null `p_actor_id` is refused with `22023`
- a successful provision writes `audit_events.actor_id` and
  `invitations.invited_by` equal to `p_actor_id`, not null — one spec per
  function, `provision_organization` and `reissue_invitation`
- `has_role_for` returns true for an active membership with a matching role and
  false for a suspended or removed one, so the redefinition of `has_role` is
  covered directly rather than only through its callers

Unit tests:

- `service-role-boundary` still fails for a file outside the allowlist — assert
  against a synthetic offending path in the test's own fixture rather than
  trusting the allowlist to be the only change
- the allowlist is exactly the two known request-path callers, so adding a third
  is a deliberate edit rather than a silent pass
- `ui-completeness` fails when a pinned row action is deleted from the markup
  while its name survives in a comment. This is the regression the current test
  misses, so it is the one that must be written first and seen to fail.
- `OrganisationsScreen` offers no `Edit Internal Metadata` action

## Success criteria

A HIMARK owner provisions a tenant through the wizard exactly as before, and the
invitation email arrives. A direct PostgREST call to `provision_organization`
from a signed-in HIMARK admin's session is refused. The `audit_events` rows for
a provisioned tenant name the operator who created it. `/internal/organisations`
offers no action that discards what the user typed. Deleting a pinned row action
turns `ui-completeness` red.

`tsc`, `pnpm test`, `pnpm test:rls` and `pnpm build` all green — from a clean
tree, verified with `git stash --include-untracked`, not from the working copy.

## Global constraints

- **Migrations are an append-only log.** Never edit an applied migration; add a
  new one. Each is applied through the Supabase MCP.
- **Grants do not carry across a signature change.** A drop-and-recreate must
  restate them, and must name `anon` explicitly — Supabase re-grants it by
  default on a newly created function.
- `set search_path = ''` on every `security definer` function, with every
  reference schema-qualified.
- Authorisation checks precede parameter validation, so a malformed-parameter
  error can never act as an oracle for a caller not entitled to be there.
- The service-role client must not appear in any request path other than the one
  named in the allowlist.
