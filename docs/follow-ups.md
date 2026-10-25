# Follow-ups after the Supabase foundation

Carried out of the execution ledger for the phase completed 2026-08-17. Ordered by when they
should be done, not by severity. Nothing here blocks the foundation; several things here block
doing the *next* phase well.

## Before connecting a second module

**Extract the shared client form and detail primitives.** `features/clients/components/client-form.tsx`
and `client-detail.tsx` carry roughly 230 lines of card, field and sticky-footer chrome that
lives nowhere shared. `ModuleForm` and `ModuleRecord` could not be reused — they are fixture-only,
take a `recordId` and look their data up internally, and fifteen modules depend on them, so
widening them was out of scope for a single module. As delivered, Clients is a one-off rather
than a template. Connect module two as-is and the duplication becomes permanent.

**Wrap `getSessionContext` in React `cache()`.** Today the layout and every query each pay a full
`auth.getUser()` round trip plus a memberships query per render. That cost multiplies with every
module connected.

**Wire the workspace search box to the URL.** When a module is `connected`, the footer's `total`
reflects the URL `q` parameter while the visible row count reflects the separate client-side
search input, so the two can describe different filters. Harmless with one module and one page
of rows; misleading at scale.

## Correctness and consistency

- **A failed send leaves a seven-day lockout.** `features/invitations/actions/send-invitation.ts`
  inserts the invitation before sending. If the send throws, the pending row survives, and the
  partial unique index blocks re-inviting that address until it expires. Revoke on send failure.
- **`accept-invitation` surfaces raw error text** from the RPC, where every other action returns
  friendly copy. Map the SQLSTATEs.
- **`lib/supabase/admin.ts` is dead code.** Nothing imports it. `tests/integration/rls/helpers.ts`
  and `scripts/grant-owner.ts` each construct their own service-role client. Consolidate onto the
  factory or delete it — the import-boundary test currently guards an unused module.
- **`proxy.ts` reads `process.env.X!` directly**, bypassing `lib/env.ts`, which exists precisely to
  make missing configuration fail loudly and by name. Justified in `lib/supabase/client.ts` for
  bundle inlining; not here.
- **`proxy.ts` builds its redirect targets from `request.nextUrl.clone()`** — the request's own Host
  header — for both the sign-in bounce and the already-authenticated bounce off `/sign-in`. The
  Microsoft callback route was deliberately pinned to the configured app URL rather than the
  request's origin (`lib/env.ts`'s `readAppUrl`); `proxy.ts` was left alone because changing it
  touches every gated route in the app. Same class of open-redirect exposure as the callback route
  had before that fix, still open here.
- **`claim_directory_membership()` has no branch for the `invited` membership status.** The function
  checks for `active` (idempotent no-op), then `suspended`/`removed` (refused), and anything else —
  including `invited` — falls through to the insert, which would raise a raw unique-constraint
  violation instead of a clean error. Unreachable today because nothing in the codebase creates an
  `invited` row before a user can reach this function; worth a branch the day something does.
- **`rls_test_give_azure_identity` is test scaffolding living in the production schema.** It
  fabricates an `auth.identities` row with provider `azure` so fixtures can simulate a Microsoft
  sign-in without a real OAuth handshake. It is fenced — restricted to `service_role` and refuses
  any target whose email doesn't end in `.test` — but it is still a function, in the production
  database, whose only job is to forge an identity. **Decision taken: keep it.** Dropping it breaks
  all eight directory specs, and the fence already constrains the one thing that mattered — it
  refuses any target that is not a `.test` fixture, so it cannot be pointed at a real account. Its
  caller, `service_role`, can already write `public.memberships` directly, so the function raises no
  privilege ceiling; it only prevents accidents. Revisit if the specs ever stop needing it.
- **The `'Sign-in ready'` title in `CompletionState`** (`features/auth-ui/auth-screen.tsx`) is now
  unreachable. It only rendered when the sign-in form's local `completion` state was set, and that
  path belonged to the old demo Microsoft button; the real `signInWithMicrosoftAction()` redirects
  instead of setting local state, and the email sign-in form posts to `signInFormAction` rather than
  calling `setCompletion`. Dead branch to remove next time this component is touched.
- **A user who belongs to two organizations can reparent a client between them.** The `clients_update`
  policy checks membership of the new `organization_id`, which permits it. Authorized by the letter
  of the policy; worth a product decision.
- **`docs/tenancy.md` points storage-prefix specs at `tests/integration/rls/`**; they live in
  `tests/integration/tenancy/`.

## Test coverage

- **`accept_invitation`'s failure paths are not in the standing suite.** Expired invitations, a
  mismatched email, and a suspended or removed membership were each verified once by hand during
  implementation, but only the happy path and an unknown token run in CI. This is the most
  security-critical function in the schema and has the thinnest standing coverage.
- **The RLS cleanup's ordering is convention, not enforced.** `tests/integration/rls/helpers.ts`
  traces membership audit rows by `actor_id`, which requires running before the fixture users are
  deleted. A future reorder nulls those ids, the query matches nothing, and fixture residue
  returns **silently**. Add a post-cleanup assertion that no matching null-organization rows remain.

## Operational

- **Offboarding is two steps, and only one of them happens today.** Removing someone from the Entra
  directory does not revoke their UNISON membership — the membership outlives the directory account
  that created it, because `claim_directory_membership()` only ever inserts a row, it never checks
  back. Until that revocation is automated, an employee removed from Microsoft keeps whatever UNISON
  access they had, indefinitely, with nothing in either system flagging the mismatch.

  **Offboard by setting `status` to `removed`. Never delete the membership row.** The two look
  equivalent and are not. `claim_directory_membership()` is granted to `authenticated` and callable
  from any session, not only from the OAuth callback — and an `auth.identities` row survives deletion
  of the Entra account that created it. So a departed employee who still holds a password on the same
  Supabase user can call the RPC directly. Revoke the membership and the `suspended`/`removed` branch
  refuses them. Delete the row instead and there is nothing for that branch to find: execution falls
  through to the insert and they re-grant themselves `member` access. The refusal only fires on a row
  that still exists.
- **Scope the Entra app with an ApplicationAccessPolicy.** The `Mail.Send` application permission
  lets the app send as *any* mailbox in the tenant. Restrict it to the sending mailbox:
  `New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId info@himark.co.za
  -AccessRight RestrictAccess`. Needs the ExchangeOnlineManagement module and can take an hour to
  take effect. Until this is done, a leaked client secret is a tenant-wide send capability.
- **Rotate the Graph client secret before it expires.** Whatever expiry was set at registration is
  a hard deadline: mail stops on that date with a token error, not a warning.
- **Supabase Auth mail still comes from Supabase's sender.** Auth's mailer only speaks SMTP, which
  M365 blocks here, so the Graph route cannot serve it. Password-reset and verification email stay
  unbranded until a transactional provider is added — that provider would also give Supabase an
  SMTP endpoint that takes an API key as the password, which basic auth handles fine.
- **A real invitation has been delivered** (2026-08-18, via Graph, inbox not spam), but no one has
  ever *accepted* one from a real emailed link. Acceptance is covered by the RLS suite and was
  exercised against fixtures during implementation; the round trip from inbox to membership has
  not been done end to end.
- **`NEXT_PUBLIC_APP_URL` must point at wherever the app actually runs.** It silently determines
  the accept link inside every invitation. A wrong value produces a perfectly-delivered email
  containing a dead link, with nothing failing anywhere to signal it.
- **Advisors outstanding:** three unindexed foreign keys, one unused index, leaked-password
  protection disabled, `pg_trgm` and `btree_gist` installed in `public`, and a mutable
  `search_path` on `set_updated_at` (adjudicated a non-defect — it is `SECURITY INVOKER` and
  touches only `NEW.updated_at`).
- **Migration history divergence.** Eleven migrations from the superseded booking schema remain
  recorded remotely with no local files. Harmless until someone runs `supabase db pull`.
  `20260811102640_clients.sql` was also edited in place after being applied, so its recorded
  checksum no longer matches the file — relevant only to CLI workflows that verify hashes.

## Not started

Atlas has no model provider, retrieval, or prompt system. Automation has no engine, scheduler or
queue. File storage, realtime subscriptions and notification persistence are all unimplemented.
Fifteen of the sixteen product modules still render mock fixtures.

## New tenants have no delivery frameworks

`projects.framework_id` is `not null`, and the seed migration only covered
organizations that existed when it ran. Provisioning a new tenant must create
that organization's frameworks and phases, or the first thing a new customer
meets at /operations/projects/new is a form they cannot submit.

## Projects shipped read-only; the write path is the next slice

`feat/delivery-projects` delivers a **read-only** projects register. Both routes
read real rows — `/operations/projects` through `listProjects`, and
`/operations/projects/[projectId]` through `getProject`, which 404s when the id
does not resolve inside the caller's organisation. The schema half is complete:
composite tenant-scoped foreign keys, RLS on all three tables, no delete policy,
audit and `updated_at` triggers, the frameworks seed, and RLS tests covering
cross-organisation select, insert and update plus the absence of a delete.

Nothing in the UI writes to `public.projects`. Specifically, still to do:

- **Wire the three server actions.** `createProjectAction`, `updateProjectAction`
  and `archiveProjectAction` are written, and the policies they depend on are
  tested at the database level, but they have no callers.
  `/operations/projects/new` and `/operations/projects/[projectId]/edit` render
  a four-step wizard whose submit handler sets local state, has no `name`
  attributes on its fields, and shows a "Project created" panel having written
  nothing. `features/delivery/components/project-form.tsx` also still populates
  its framework picker from the mock `frameworks` array in
  `features/delivery/data.ts`, not from `public.frameworks`.
- **Stop the register mutating records in local state.**
  `RecordCollectionWorkspace` seeds `useState(config.records)` and its archive,
  duplicate, restore and create/edit panel all call `setRecords`. Pointed at
  real rows, an archive appears to succeed and is gone on the next page load.
  Its Status field also offers `Planning`, `On Track` and `At Risk`, none of
  which the zod enum or `projects_status_check` accepts.
- **Drive the register from the URL.** `listProjects` implements search, filter,
  sort and pagination server-side; the page discards `total`, `page` and
  `pageSize`, and nothing in the app can set `?q=`. The footer count is
  therefore the current slice, not the true total, and rows past the first page
  of the server query are unreachable. Follow the clients precedent
  (`ModuleWorkspace` + `useRouter` + a `<form name="q">`).
- **Reinstate an owner, org-scoped.** `ownerId` was removed from
  `projectInputSchema` and both actions: `projects.owner_id` references
  `auth.users(id)` with nothing tenant-scoping it, so a crafted submit could
  write a live cross-tenant user reference that RLS hides today and the planned
  "my projects" query would read tomorrow. The column remains. Reinstate the
  input alongside a membership check or a composite key through `memberships`.
- **Connect or hide the metric cards.** `/operations/projects` renders six fixed
  figures ("Active Projects 36", "At Risk 7") above a register that reads the
  real table, and three summary panels below it. Leaving them mock was
  deliberate — zeros would state something false — but against a real, empty
  table they contradict the data directly beneath them.
- **Give the route its boundaries.** `app/(unison)/operations/clients/` has both
  `error.tsx` and `loading.tsx`; `app/(unison)/operations/projects/` has
  neither, so a transient database error escalates to the root full-page
  fallback and the route streams with no skeleton.
- **`archived_at` on frameworks is never filtered.** An archived framework's
  name still renders in the register through the embed.
- **`pnpm test:rls` is flaky under parallel execution.** Runs intermittently fail
  with `PGRST303: JWT issued at future` — Supabase-side `iat` skew, not a
  machine clock problem, and unrelated to this branch. Re-running a file on its
  own passes. Both new RLS files now carry the `.filter(Boolean)` cleanup guard
  that the other six have, so a transient failure no longer leaks fixtures.
- **A literal `*` cannot be searched for.** `escapeLikePattern` escapes `\`, `%`,
  `_` and `*`, but PostgREST rewrites `*` to `%` inside a like/ilike value
  *after* the escape, so `\*` reaches Postgres as a literal `%`. The unbounded
  failure is closed (a search for `*` no longer matches every row); matching a
  literal asterisk needs an operator other than `ilike`.

## Projects: three minors the review recorded but the fix wave did not log

Surfaced by the final whole-branch review of `feat/delivery-projects`. Real but
not blocking, and none of them is reachable until the write path is wired.

- `projectInputSchema.notes` caps at 500 characters while `projects.notes` is an
  unbounded `text` column. The schema is stricter than the database for no
  stated reason; pick one and make them agree.
- `dueDate` is validated only as "non-empty string" and passed straight to a
  `date` column, so a malformed value becomes a Postgres error rather than a
  field-level message.
- `updateProjectAction` and `archiveProjectAction` do not call `.select()`, so
  they cannot tell "updated one row" from "matched none". A wrong or
  already-archived id reports success.

Also worth handling when the detail page becomes writable: its duplicate dialog
and document-upload control still resolve to local success states, the same way
the archive control does.

## Provisioning collects more than it persists

The wizard gathers initial users, departments, teams, delivery roles, and
toggles for guest access, restricted projects, SSO-required and MFA-required.
Only the organisation and its primary admin are saved. The toggles in
particular describe enforcement that exists nowhere in the codebase — a tenant
provisioned with "MFA Required" on is not enforcing anything.

Either persist and enforce them, or remove them from the wizard so it stops
implying a guarantee.

**Resolved for the access settings, 2026-09-05: removed, not persisted.** The
whole Access Settings block is gone — Default User Access, Guest Access,
Restricted Project Access, SSO Required and MFA Required — along with its fields
on `AccessConfiguration` and its seeds in `data.ts`. Removal rather than
enforcement was the right half of that choice because none of the five had a
mechanism behind it anywhere in the product, so "persist and enforce" was not a
small fix; it was five unbuilt features. `docs/product-principles.md` §2 makes
this the default answer for half-built forms — challenge the feature, do not
finish it — and `docs/first-buyer-readiness.md` §8 makes it urgent, because a
security control that enforces nothing is what an enterprise buyer's due
diligence finds. `ui-completeness.test.ts` now pins the absence of all five in
the markup **and** of their fields on the type, since reinstating the field is
what makes the control possible again. The pin was verified by reinstating
`mfaRequired` and watching it fail.

**Still open in this section:** initial users, departments, teams and delivery
roles are still collected and still persist nothing. They are not security
claims, so they are less urgent than the toggles were, but the same question
applies — persist them or stop collecting them.

The provisioning register at /internal/provisioning still lists mock drafts.
Its rows carry tier, modules, go-live and a numeric progress bar, none of which
exist now that provisioning creates an organisation directly. Either model a
draft entity or retire that register in favour of /internal/organisations.

## Provisioning: two Important items found after merge

From the post-merge review of the client-tenant-provisioning work. Neither is
exploitable while HIMARK has a single member; both become real the moment a
second HIMARK owner or admin exists.

**1. `provision_organization` still accepts a caller-chosen token hash.**

The intended path already withholds the token: `provisionOrganizationAction`
generates it server-side and returns only `{ organizationId }`, so an operator
driving the wizard never sees it. The `authenticated` grant is what reopens the
hole, by letting the same operator skip the action and call the RPC directly
with a `p_token_hash` of their choosing.

The attack is not "an operator can enter a tenant they created" — that is
ordinary operator authority. It is that they can provision with
`p_admin_email` set to an address they do not control, then open the invitation
signed out: `createInvitedAccount` mints a **pre-confirmed, platform-wide auth
identity** for that address with a password they choose. The organisation is a
decoy; the account is the prize, and the real owner of that address can never
register under it afterwards. That breaks the invariant
`create-invited-account.ts` rests on — that presenting the token proves control
of the address — for every address, not just within one tenant.

`send-invitation.ts` never lets an inviter choose a token. Neither should this.

Bounded fix: revoke `execute` from `authenticated`, add an explicit actor
parameter, and call it from the action with the service role. Note this
collides with the `service-role-boundary` test, which currently forbids
`lib/supabase/admin.ts` in a request path — that rule needs revisiting, or a
different mechanism, and the decision should be deliberate rather than
incidental.

**Resolved 2026-09-01, deliberately.** `provisionOrganizationAction` now calls
`createAdminSupabase()` and the migration above dropped and recreated
`provision_organization` with `execute` revoked from `authenticated` and
granted only to `service_role`. The collision was not avoided, it was decided:
`tests/unit/service-role-boundary.test.ts` no longer forbids the admin client
outright, it allowlists specific request-path files by name in
`SERVICE_ROLE_REQUEST_PATHS`, each with a comment explaining why RLS cannot
express the authorisation and pinned by a test asserting the allowlist is
exactly the known set. `features/internal-provisioning/actions/
provision-organization.ts` is one of the two entries.

**2. `Edit Internal Metadata` in the Organisations register discards input.**

It opens a drawer over a real tenant's fields with a "Save Metadata" button
whose only handler is `onClose`. Typed changes vanish with no signal, and the
drawer closing reads as confirmation. This is worse than the Suspend/Archive
theatre removed in the same wave: that flipped a badge which reverted on
refresh, so the lie was visible.

Remove the action until it has a backing mutation, and pin its absence.

**Update: item 2 removed 2026-09-01.** `Edit Internal Metadata` is gone from
`OrganisationsScreen` and its absence is pinned. The identical defect survives
one screen over: `SubscriptionsScreen`'s `Update Subscription` opens the same
editable drawer with the same close-only Save. It is over demo rows rather than
real ones, which is the only reason it is less severe. The tier spec is already
editing that screen to remove `Change Tier` and should take it.

**Smaller, same review (provisioning):** `ui-completeness.test.ts` now matches `/Suspend/`
against a comment rather than TenantsScreen's markup, so the tripwire would
survive deleting the thing it guards; service-role reissue writes
`invited_by` and `actor_id` as null, leaving the only supported recovery path
unattributable; the review step still promises UNISON "will enable all modules
included in the selected tier" above a checklist ticking "Team configured" over
zero users; and `sessionFor` in the RLS helpers caches rejected promises, so one
rate-limit cascades into every later test for that user.

## Tier is real now: three surfaces still describe it as decorative

From the final whole-branch review of `feat/tier-entitlement` (2026-09-01),
recorded rather than built — each needs its own change, and the fix wave was
scoped to the wizard, the migration comments and the wording constraint.

`feat/tier-entitlement` made `organizations.tier` a real column, written at
provisioning and read per request to decide which modules a tenant's navigation
and routes expose. Before it, tier was a wizard concept that persisted nowhere,
which is why each of the three items below was tolerable when it was written and
is not now.

**1. Settings → Modules shows every withheld module to every tenant, as an
enabled toggle (Important).** `features/product-ui/components/special-workspaces.tsx`
(`ModuleSettings`, around the hard-coded module list) declares
`Clients, Onboarding, Leads, Quotes, Sales, Invoices, Expenses, Forecast` all
`true`, rendered as switched-on toggles labelled "Available to HIMARK members".
`/settings` is reachable from `components/navigation/sidebar.tsx` on every tier —
correctly, since `settings` is not a module in `config/modules.ts` and is not
gated. So a Core tenant whose sidebar correctly shows only Delivery and People
can reach, in two clicks, a screen presenting eight modules they are not billed
for as active parts of their workspace; clicking a toggle updates local state and
changes nothing.

This is not an enforcement hole — nothing there links into a withheld module and
typing the URL still meets the not-available page — but it is a customer-visible
contradiction of the entitlement on the one screen whose whole subject is which
modules the tenant has. **It is the same class of claim the navigation work just
moved away from:** `config/navigation.ts` used to build a module surface from a
static list instead of from the tenant's entitlement, and this branch converted
it to `entitledModuleIds()` without sweeping for the second instance.

Fix: build `ModuleSettings` from `useNavigationSections()` (or from a
server-passed entitled set), or remove the Modules view until per-tenant module
activation exists. Note that `special-workspaces.tsx` is also the file carrying
the uncommitted Atlas/HR cleanup — whoever commits that will be editing
`ModuleSettings` anyway.

**Resolved 2026-10-09 by removal.** `/settings` now renders
`OrganizationProfileScreen`; nothing reached `ModuleSettings` any more, and
`special-workspaces.tsx` (mock calendar, forecast, risk, settings, sales-pipeline,
project-board and task-board views) was unreachable from every route, so the file
was deleted. If a Modules view comes back, build it from the tenant's entitlement
as described above, not from a list.

**2. No surface anywhere shows a tenant's actual tier (Important).**
`features/internal-provisioning/queries/list-organizations.ts` hard-codes
`tier: '—'` and its doc comment still says tier "has no backing column", which
was true before this branch and is false now. `/internal/organisations` is the
only screen that renders real `organizations` rows, so the register and its
detail drawer both show a dash. An operator who suspects a tenant is on the
wrong tier has to query the database directly.

Not a one-line fix: the RPC `list_provisioned_organizations()` returns
`TABLE(id, name, slug, status, created_at, admin_email)`, so surfacing tier needs
a migration adding it to that function (append-only — a new `create or replace`,
and the return type changes, so it must be dropped and recreated with its grants
reapplied: `authenticated` and `service_role`, no `anon`). **Minimum before
anyone relies on that comment:** correct the comment so it names tier as a real
column deliberately not yet surfaced. Surfacing it properly is the fast-follow.

**3. "Change Tier" mutates React state only (Important).**
`features/internal-provisioning/components/internal-registers.tsx` — the
`Change Tier` row action in `TenantsScreen` and `SubscriptionsScreen`, its
`TierChangeDialog`, and the `onConfirm` handlers that call only `setRecords(...)`.
The dialog previews the module impact through `getEntitledModuleIds` and, on
confirm, updates a local array: the badge and module count change and the
database does not. The rows are demo objects from
`features/internal-provisioning/data.ts`, which is why it was tolerable while
tier was decorative.

Failure it now enables: a tenant reports missing modules, an operator uses
Change Tier → UNISON Enterprise on `/internal/subscriptions`, sees the row update
and the impact preview confirm the new module set, and tells the client it is
done. Nothing changed, and the next page load reverts the badge. This is the
pattern `OrganisationsScreen`'s own header comment says was removed from that
screen for being "the same defect class as a fabricated success".

Tier-change-from-the-UI is deliberately out of scope for the entitlement slice —
that is a fine decision. Fix: remove the Change Tier action from both screens
(matching what `OrganisationsScreen` did with Suspend/Archive), or label the
dialog explicitly as a preview that does not apply, until the tier-change slice
lands. Both screens are pinned by `ui-completeness.test.ts`'s "internal registers
provide non-destructive operational actions and tier impact review", which
asserts `Change Tier` is present — that assertion has to move with the change.

**Also noticed, same class, not fixed:** `docs/product-ui.md` still says the
internal workflow "is a complete UI simulation only" and that organisation
creation does "not persist or invoke a provisioning backend". Provisioning
persists; only the parts listed in `docs/internal-provisioning.md`'s persistence
boundary do not.

**Unclosed verification, not a defect:** no signed-in run of a withheld module
has ever happened — HIMARK is `strategic-enterprise`, so it sees everything. The
cheapest close: set one throwaway organisation in `unison-uat` to `tier = 'core'`,
sign in as a member, and check the sidebar and `/finance/invoices`. That one pass
also exercises the wizard's `core` default and the not-available page's label.

## Final review of feat/provisioning-security-cut (2026-09-02)

The branch itself was found sound: it closes the RPC route into
`provision_organization` and correctly narrows a real hole. Two items below are
about what it did *not* close, and were pre-existing before this branch as well.
A third records a boundary-test gap this fix wave closed, plus the gaps that
remain by design.

### Critical, pre-existing — the token-choosing primitive is still open

`authenticated` holds `INSERT` on `public.invitations`. The `invitations_insert`
policy's check is `has_role(organization_id, array['owner']) OR
(has_role(organization_id, array['admin']) AND role_id <> 'owner')`. Nothing in
that check, or anywhere else, constrains `token_hash` or `email`.

The chain: a legitimate owner of *their own* tenant inserts an invitation row
with `email` set to an address they do not control and `token_hash` set to the
sha256 of a token they chose — this exact insert is performed from a signed-in
owner's session in `tests/integration/rls/accept-invitation.test.ts` (around
lines 41-48), asserting no error, as ordinary test setup rather than an
exploit. They sign out and open `/accept-invitation?token=<their token>`.
`invitation_preview` is granted to `anon` and matches on token hash alone.
`signUpFromInvitationAction` calls `lib/invitations/create-invited-account.ts`,
which calls `admin.auth.admin.createUser({ email, password, email_confirm:
true })` — a **pre-confirmed, platform-wide auth identity** for an address the
caller does not control. The real owner of that address can then never
register.

This is pre-existing, and `feat/provisioning-security-cut` does not regress
it — the branch strictly narrows the surface by closing the RPC route (see
"Provisioning: two Important items found after merge" above, item 1). But the
population who can reach this primitive — **every tenant owner, in every
tenant** — is larger than the population that item closed (a second HIMARK
owner or admin), so this branch must not be read as having closed the
primitive itself, only one route to it.

The escalation stops short of HIMARK: `claim_directory_membership()` requires
an `auth.identities` row with `provider = 'azure'` whose email matches, so a
minted identity cannot be walked into the HIMARK tenant that way.

The already-deferred slice — "make invited signup require email verification",
scoped out of this branch's design as repairing the same invariant from the
other end (see `docs/superpowers/specs/2026-09-01-provisioning-security-cut-design.md`,
"Out of scope, deliberately") — should be **re-scoped** to cover the
token-choosing end too: constraining or trigger-guarding
`invitations.token_hash` on the `authenticated` insert path, not only adding
verification inside `createInvitedAccount`. Fixing only the read end
(verification) still lets an owner mint a hostile invitation row; fixing only
the write end still lets a caller-supplied token be trusted without proof of
address control. Both ends of the same invariant need closing.

### Important — `delete_organization` keeps the anti-pattern this branch removed from its siblings

`supabase/migrations/20260816232306_deletable_organizations.sql` guards
`delete_organization` with `if auth.role() is distinct from 'service_role' and
not public.has_role(target_org, array['owner'])` and writes `actor_id =
auth.uid()`. It is granted to `authenticated, service_role`. Now that a
request path (`provisionOrganizationAction`, and any future one) legitimately
holds a service-role client, that path can call `delete_organization` on any
organisation with no actor check and no attribution — `auth.uid()` is null
under `service_role`, so the audit row it writes records that *someone*
deleted the organisation, not who. This is the same class of gap
`provision_organization` had before `20260901150000_provision_organization_actor`
added `p_actor_id`; `delete_organization` needs the same treatment: an explicit
actor parameter, required and checked, the same way provisioning now works.

**Correcting a claim that might otherwise get written here:** it is not true
that a provisioned-but-unaccepted tenant cannot be deleted through any
supported path. It can — the `service_role` bypass
(`auth.role() is distinct from 'service_role'`) means
`admin.rpc('delete_organization', { target_org: id })` succeeds regardless of
membership, and `tests/integration/rls/helpers.ts`'s `cleanup()` already relies
on exactly this, on every RLS run. The real residual is narrower: there is no
operator-facing tool for it (nothing in `/internal/organisations` calls
`delete_organization`), and the deletion it does allow is unattributed.

### Important — boundary test widened to cover the repo root, `config/`, `types/` and `hooks/`

`tests/unit/service-role-boundary.test.ts` scanned `['features', 'lib', 'app',
'components']` and missed `proxy.ts` entirely. `proxy.ts` sits at the
repository root and is Next 16's middleware — it runs on essentially every
request, including unauthenticated ones, making it the highest-value place to
smuggle in a service-role client, and the old scan looked straight past it.
`config/`, `types/` and `hooks/` were also unscanned. Fixed in this fix wave:
the roots list now includes `config`, `types` and `hooks`; a separate
non-recursive `rootFiles()` scan covers files sitting directly in the
repository root (naming `proxy.ts` in a comment) without descending into
`node_modules`, `.next`, `.superpowers`, `supabase`, `scripts`, `tests` or
`docs`; and `walk()` now tolerates a root directory that does not exist,
returning `[]` instead of throwing `ENOENT`, so a removed root makes the test
fail legibly rather than error out.

Two detection gaps remain, by design, and are now called out in a comment in
the test file rather than left implicit: the scan is a static regex over
`import`/`from` text, so it cannot see a dynamic `await
import('@/lib/supabase/admin')`; and it only catches the shared
`lib/supabase/admin.ts` factory, not a file that constructs its own
service-role client directly from `readSupabaseSecretKey` — which
`tests/integration/rls/helpers.ts` and `scripts/grant-owner.ts` both already do
deliberately, outside any application request path. Neither gap is exploited
today; both are worth closing if this test is ever relied on as the sole
guard rather than one layer of it.

### Minor — carried out of the execution ledger rather than fixed

Each was raised by a task review on this branch, judged not worth a fix round,
and triaged by the final review as safe to ship. They are recorded here because
the ledger that held them is deleted with the workspace, and a finding that
survives only in a deleted file was never really recorded.

- **The null-actor guard runs before the authorisation check** in both
  `provision_organization` and `reissue_invitation` (`p_actor_id is null` ->
  `22023`, ahead of `has_role_for`). This literally inverts the branch's own
  stated rule that authorisation precedes parameter validation. It is not an
  oracle: `22023` answers a question about the call's shape and reveals nothing
  about any organisation, and every caller must already hold `service_role` to
  reach either branch. The defect is in the rule's wording, which should say
  authorisation precedes validation *that could reveal state about an
  organisation*. Worth correcting the next time that phrasing is reused.
- **`reissue_invitation`'s audit-row comment** lost its cross-reference to
  `20260826153239`, where the `organization_id`-inside-`new_value` pattern was
  first introduced. Correct as written, but a thinner trail for the next reader
  tracing why the duplication exists.
- **Two UI pins are coupled to exact spelling.** `ui-completeness.test.ts` pins
  row actions as `label: 'X'` and the removed editable drawer as
  `/open\(record, true\)/`. Renaming the local `open` helper, or reordering its
  arguments, defangs the second silently without changing behaviour. This is the
  same fragility class as the `/Suspend/` pin that this branch fixed — the
  mechanism is better than matching bare prose, but it is still text matching,
  not an AST check.
- **The `Edit Internal Metadata` removal note** (above) names the screen and the
  action but not the surviving line. It is `SubscriptionsScreen`'s
  `Update Subscription`, which calls `open(record, true)`.

## Final review of feat/projects-write-path (2026-09-06)

The slice shipped across three PRs — #1 (write path and briefing UI), #2 (the
Critical), #3 (fifteen findings). Carried out of the execution ledger and the
review report before that workspace was deleted, so the undone work survives it.

### Not fixed — a design-token decision, not a defect

- **`delivery-primitives.tsx` uses literal palette classes, not semantic
  tokens.** Ten health styles read `bg-emerald-50 text-emerald-800` where
  `--success-soft` / `--danger-soft` / `--warning-soft` / `--info-soft` exist in
  `tokens.css`, are surfaced in `globals.css` and are consumed by twelve other
  component files. This file is the only opt-out, so the delivery family's
  badges will not follow a token retune or a dark theme (`globals.css` already
  declares `@custom-variant dark`). It was done to hit specific contrast, which
  is a fair goal reached by the wrong lever: move the chosen values into the
  tokens, or add `-strong` steps, then restore the semantic classes.
  `delivery-briefing-ui.test.ts` pins `bg-amber-100` and `bg-red-700` and would
  need updating with it.
- **Two badge components disagree about the same data.** `HealthBadge`
  (delivery) and `StatusBadge` (`ModuleWorkspace`) both render project health
  from the same column, in different vocabularies — At Risk is token amber on
  the register and literal amber elsewhere. #3 fixed the part that was a safety
  problem (Critical rendering grey) by giving `StatusBadge` a `danger` tone;
  unifying the two components is the remaining half.

### Not fixed — real, low reachability

- **An overdue project date appears in no list.** `overdueProjectDates` counts
  `due_date < today`, while `upcomingProjectDates` filters to a window starting
  today. So the briefing states "3 overdue project target dates" in its focus
  list and offers no way to click through to them. The most urgent dates are the
  only ones with no drill-in.
- **Fabricated person names survive in `project-detail-screen.tsx`.** The array
  `['Neo Morake','Amara Dlamini','Thabo Mokoena','Naledi Maseko','Lethabo Nkosi','Mia Daniels']`
  feeds the Owner select of every nested register. The identical names were
  removed from `registry.ts` because "fiction left in source is
  indistinguishable from intent to the next reader", and `ui-completeness.test.ts`
  pins their absence — but the pin slices only `registry.ts`. Those panels have
  `records: []` so nothing renders today; remove the array when the registers get
  real data, and widen the guard's scan to `features/delivery/components/`.
- **An archived framework blocks the edit form.** Same shape as the Critical #2
  fixed for owner and client, but it fails loudly rather than silently:
  `frameworkId` is `required`, so the select matches no option and the form
  refuses to submit rather than writing a null. Deliberately left out of #2 to
  keep that fix tight.
- **`project-owner.test.ts:128`** discards the error from its post-delete re-read
  and shadows the `after` hook imported from `node:test`. The shadow is inert —
  the hook is registered at module load and the shadow is block-scoped — but if
  the re-read fails, the assertion throws a `TypeError` instead of naming the
  query failure.

### Known limits of the guards, recorded rather than fixed

- **The column guard checks resolution and count, not correctness.** It asserts
  every declared column resolves to a key the records carry, and that no module
  declares more columns than its table renders. It cannot check that a column
  resolves to the *right* key — that class of bug (Tasks' 'Project' column
  rendering the task's own name) was found by reading, not by the guard.
- **Badge omission is a literal-string pin.** `Health` is asserted to satisfy
  `Cell()`'s badge condition by name. "Should this value be a badge?" has no
  derivable source of truth the way `record[key]` has, so generalising it would
  mean inventing a registry field for "this column is a status" — a bigger
  change than the bug justifies.
- **The archive pin derives names from the `useActionState` destructure** rather
  than matching a literal, so renaming cannot silently detach the form from the
  action. It still cannot express "no control may flip archive state through
  local state alone"; that needs a renderer and a behavioural test, and is
  better revisited when `restoreProjectAction` exists.

### Ruled acceptable, deliberately

- The edit route has no archived guard, so an archived project is editable via a
  remembered URL. Low reachability, no data loss, and archive is currently
  reversible only outside the UI anyway.
- `isDateWithinDays` being end-exclusive means a date exactly 30 days out falls
  in neither the upcoming window nor the overdue count. That is a correct window
  definition — "the next 30 days" is today plus 29 — not a bug.
- Four `create or replace` migrations for one function is the honest cost of the
  append-only rule, not a defect to collapse.

## Final review of feat/frameworks-write-path (2026-09-06)

The slice made the Frameworks module read and write real rows: register, detail,
framework create/edit, and phase add/rename/reorder/archive. Carried out of the
execution ledger and the review report before that workspace was deleted.

### Fixed before merge, recorded because they are worth remembering

- **Archiving a framework stranded every project governed by it.** This branch
  made `frameworks.archived_at` writable for the first time, which made a
  pre-existing `.is('archived_at', null)` filter in the project form reachable.
  The framework select is controlled and `required`, so no matching option meant
  `selectedIndex = -1` and the browser refused to submit — the project could not
  be edited at all, and the only escape re-filtered the phase list and nulled
  `phase_id`. **The fourth instance of one pattern**: owner (PR #2), client
  (PR #2), phase (Task 3), framework (fix wave). If a fifth optional foreign key
  ever reaches a form, retention is not optional — see
  `features/delivery/form-options.ts`, where all four now live together.
- **The archive dialog claimed per-project version pinning**, which does not
  exist — `version` is one mutable text column with no history, and this slice
  kept it read-only precisely because editing it would be an unkeepable claim.

### Open — behaviour worth a product decision

- **An archived framework is only restorable while you stay on its page.** It is
  excluded from the register with no toggle, so navigating away loses the route
  and the only way back is a remembered URL. The spec chose "no toggle in this
  slice" deliberately; whether restore needs a route of its own is the spec
  owner's call, not an implementation detail.
- **Confirmation drift between the two restores.** Restoring a framework is
  gated behind a confirmation styled for a destructive action; restoring a phase
  is one click with none. Neither is destructive. Cosmetic, but the kind of drift
  that hardens into convention if left.

### Open — fixture debt this slice moved rather than removed

- **`deliveryPhases` survives as `illustrativePhases`** in
  `features/delivery/components/portfolio-screen.tsx`, byte-for-byte, still
  rendered under a heading claiming project counts summing to 36 in tenants that
  hold none. Relocating it kept the build green and was disclosed at the time.
  `ui-completeness.test.ts` now states in its own comment that its assertion
  covers `data.ts` only — a guard that would otherwise be cited later as evidence
  the fixture is gone. Removing it belongs to the portfolio work, which owns that
  fixture world; `PhaseStepper` has no other caller.

### Accepted deliberately, with reasons

- **`reorderFrameworkPhasesAction` does not scope to the active organisation.**
  It is the only write in the branch that does not, and that is correct: the RPC
  it calls checks `is_member_of` in Postgres before touching anything, which is
  the same guarantee the table's own RLS policy gives. Adding a TypeScript check
  would duplicate the authority, not strengthen it.
- **The register omits the Status column the spec listed.** Archived frameworks
  are excluded entirely, so the column would read "Active" on every row —
  omitting a constant is more faithful to the claim rule than rendering it.
- **Phase writes do not revalidate the register**, which shows a phase count.
  The count is stale only until the next register visit, and phase edits happen
  on the detail page.
- **Two migrations where one would have done**, again: the first was applied
  before its comment was found to be wrong, and the log is append-only. The
  correction lives in `20260906130000`. Same precedent as `20260905190000`.

## Final review of feat/delivery-items (2026-09-06)

The slice built the two-level Delivery Item hierarchy, framework-supplied level
terminology, and reduced the project detail page to its three real tabs. Carried
out of the execution ledger and the review report before that workspace was
deleted.

### The lesson worth keeping, not just the fixes

**The picker-retention defect has now been found five times** — owner, client
(PR #2), phase (Frameworks slice), framework (that slice's final review), and
delivery items. The shape never changes: an HTML `select` whose `defaultValue`
matches no option falls back to its first, so saving an unrelated field writes
`null` over a recorded value. All the retention functions live together in
`features/delivery/form-options.ts`, and there is now a source-derived guard on
the delivery-items wiring. **If a sixth optional foreign key reaches a form,
retention is not optional and a guard is not optional either.**

**A validator that throws becomes a 500, not a field error.** The signed-in run
caught `optionalDate` returning a 500 on a blank date, because its refine ran
before the optional branch and used `.toISOString()`, which throws on an Invalid
Date. `project.ts` already had the correct shape — optional first, `Date.UTC`
component comparison that returns false. Every unit test passed while the bug was
live, because none submitted an empty date. When adding a validator, copy the
proven one; when testing one, test the empty case.

### Open — real, low reachability

- **`createDeliveryItemAction` has no archived-parent check**, though
  `setDeliveryItemArchivedAction` refuses the mirror case on restore. Two tabs
  open, archive the parent in one, click Add in the other, and a live level-2
  item is written under an archived parent. Benign in effect — the tree nests it
  and it stays reachable — but the write side is not as closed as it was
  described. Either add the check or correct the description.
- **Edit is offered on archived delivery items**, while the same page hides Edit
  on an archived *project*. Two archive semantics on one screen: the save
  succeeds and changes nothing the user can act on.
- **Delivery rows render raw ISO dates** (`2026-09-30`) where every other surface
  on the same page renders `30 Sep 2026` with `timeZone: 'UTC'` pinned. Reuse the
  existing `dateOnlyFormat`; do not reintroduce an unpinned `toLocaleDateString`,
  which is the bug the project page's own comment documents.
- **`listOrganizationMembers` is called twice per project-detail render** — once
  by the page, once by `listDeliveryItems`, even when a project has no items.
  `getSessionContext` is already `cache()`d; wrapping this the same way fixes it
  everywhere at once.

### Known limit of a new guard

The delivery-items retention guard slices the query source from its match to
end-of-file rather than to the enclosing function's closing brace. It works
because that function is currently last in the file; a function appended after it
could let the regex match an unrelated call and silently weaken the guard.

## From the delivery-items-in-the-briefing slice (2026-09-06)

Raised by the final whole-branch review, deliberately deferred rather than
widened into that slice. None blocks merge.

**The `delivery_items` select is unbounded.** `features/delivery/queries/delivery-overview.ts`
fetches every unarchived item for the organisation with no `.limit()`, and the repo
sets no `max_rows`; hosted PostgREST caps at 1000 rows by default. This is the first
org-wide select in the codebase over a table that can realistically pass 1000 rows.
Past that cap every number in both new briefing surfaces silently under-reports —
the same quiet-wrongness class the slice was written to remove. Fix with
`count: 'exact', head: true` aggregates, or a disclosed cap. Do this before any
tenant records delivery items at scale.

**Items that all lack a phase render an axis of zeroes.** `features/delivery/item-briefing.ts`
gates the empty distribution on `inFramework.length === 0`, not on "nothing was
placed". Five in-framework items all carrying no phase — plausible, since
`currentPhaseId` is optional — produces a chart of zero-height columns and an
aria-label reading "0 delivery items across N phases". The footnote does carry the
truth, so this is not dishonest, but the spec's own words describe the state:
an axis of zeroes states it less clearly than a sentence. Consider gating on
placed items.

**Nothing reconciles the panel's two printed numbers.** `sum(itemPhaseColumns[].total)
+ itemsWithoutPhaseCount` must equal `leadingFrameworkItemCount`, and no assertion
enforces it. It holds today only because the `framework_phases` fetch in
`delivery-overview.ts` is unfiltered. Add an `archived_at is null` filter there — a
natural-looking future change — and items in archived phases vanish from every column
while the footnote still counts them: the footnote says 10, the columns sum to 7, and
nothing explains the 3. `positionNarrative` in `overview-bands.ts` throws on exactly
this class of drift; this module should too.

**Minor test-guard fragility.** The briefing guards in
`tests/unit/delivery-briefing-ui.test.ts` slice component source between `function`
keywords, so each slice captures interstitial code past its target function body.
Harmless today — no asserted token collides — but a known limitation of the approach.

## From the project-dependencies slice (2026-09-07)

**Picker retention is not implemented for dependencies, by decision.** Retention
exists to stop an HTML `select` whose `defaultValue` matches no option falling
back to its first and writing the wrong value over recorded data. That failure
needs an *edit* form with an existing value; this slice ships add-and-remove
only, so every picker starts empty and there is nothing to mismatch. Building
the functions anyway would have been three unused exports.

The display half IS implemented: `list-project-dependencies.ts` resolves a
removed owner to `Former member` rather than a blank or a raw uuid.

**When an edit path is added, it must bring the retention functions with it.**
This defect class has been found five times in this codebase — owner, client,
phase, framework and delivery items — and an edit form is exactly where it
appears. `features/delivery/form-options.ts` holds the pattern.

**The cycle guard's advisory lock is unproven by the test suite.** The trigger
takes `pg_advisory_xact_lock(hashtext(organization_id::text))` before walking
the graph, because two transactions can each insert an individually-acyclic edge
that jointly forms a cycle. A single-threaded suite cannot exercise that. Proving
it needs a harness that opens two overlapping transactions and interleaves their
inserts — worth building if dependency editing ever becomes concurrent in
practice. The lock is present and correctly keyed; only its behaviour under real
concurrency is unverified.

**`project_dependencies_no_self_check` has no automated test, by decision.**
The `BEFORE ROW` cycle trigger fires before CHECK constraints, and a self-edge is
a one-hop cycle, so the trigger always intercepts it and the constraint is never
reached through the normal write path. It remains as a backstop.

It was proved manually against `unison-uat`: with the cycle trigger dropped, an
attempted self-edge was still refused with SQLSTATE `23514` naming
`project_dependencies_no_self_check`; with the constraint also dropped, the same
insert succeeded — confirming the constraint, not the trigger, was doing the
refusing. Both were then restored and verified. A fix round briefly added a
`service_role` RPC to toggle the trigger so a test could reach the constraint;
it was removed because disable and re-enable were two separate calls, leaving a
durable window with cycle protection off for every tenant if a run died between
them. See the comment at `tests/integration/rls/project-dependencies.test.ts`.

**Roughly eleven rows in `supabase_migrations.schema_migrations`** dated
2026-04-19 to 2026-04-27 have no matching files on disk — remnants of the
booking schema that `unison-uat` was reset from on 2026-08-11. Harmless, since
the ledger is not replayed, but they are noise that would make a genuinely stale
row harder to spot later. Worth a one-line cleanup at some point.

**Any dependency naming a project as prerequisite freezes that project's
framework.** `project_dependencies_prerequisite_framework_fkey` is
`ON UPDATE NO ACTION`, so once another project's dependency row names project P
as its prerequisite, P's `framework_id` can no longer be changed —
`update-project.ts` now raises SQLSTATE `23503` on the attempt. The fix landed
in this wave only improves the message so the owner of P can discover the
cause; it does not remove the freeze. The deeper fix is making
`prerequisite_framework_id` nullable and required exactly when
`required_phase_id` is set, which would limit the freeze to phase-based
dependencies — the only ones that actually need the framework pinned, since a
status-based dependency (`Active` / `Complete`) does not care which framework
the prerequisite uses. Both composite foreign keys on this table are MATCH
SIMPLE, so a null `prerequisite_framework_id` would satisfy them trivially and
not block anything.

**The cycle tests prove the recursive CTE, not the advisory lock.** They run
single-threaded, one insert at a time, so a full green suite is evidence the
graph walk is correct, not evidence the concurrency hole noted above is closed.

## Final review of feat/requirements (2026-09-12)

The slice built the Requirements tab: full CRUD, owner picker with retention, and
a status and priority register. Carried out of the execution ledger and the
review report before that workspace was deleted.

- **Governance has no RLS test coverage at all** -- `project_risks`, `project_decisions`, `approvals`, `approval_decisions` and `governance_artefacts` all ship with full CRUD RLS policies and zero tests proving any of the four operations are actually tenant-isolated. This was found while building Requirements, not caused by it.
- **The Overview tab's "what this project tracks" copy is still wrong for risks, decisions and governance** -- it claims those "do not exist as tables yet," which stopped being true when the Governance tab shipped. This slice fixed only the "requirements" clause it made false; the other three are pre-existing and still need a correction.
- **Requirements is now more capable than its four Governance siblings** (full CRUD vs. create-only, an owner picker vs. none) -- a real, visible inconsistency, decided deliberately rather than discovered by accident. Worth a future pass bringing Governance up to the same bar, not worth blocking this slice on.

## From the traceability slice (2026-09-13)

- **Traceability only offers project-scoped evidence as linkable** — `governance_artefacts` rows scoped to a framework or an approval rather than a project have no project to pin the link's composite foreign key to, and are structurally unlinkable here, not merely unoffered by the UI. A future need to trace against framework-level evidence is a separate design question.
- **No coverage rollup or percentage view exists yet** — Traceability shows a per-requirement badge only. An aggregate dashboard is a real, separate feature to build once the per-requirement mechanics here are validated in the pilot.
- **Traceability's RLS cascade test coverage is asymmetric** — deleting a delivery item removing its requirement link, deleting a requirement removing its evidence links, and evidence's cross-project refusal (`requirement_evidence_requirement_fkey`) all lack direct tests, though all three are structurally identical to cases that ARE tested and all six composite foreign keys were confirmed identically shaped in production. Found during final review, not caused by any implementation defect.

## From the integrations slice and the history-trigger fix (2026-09-20)

Carried out of the Integrations execution ledger (deleted with its workspace before these were
copied here) and out of debugging the "framework could not be saved" report.

**Integrations (deferred minors from its final review)**

- **`isHttpsUrl`'s comment overstates what was done** -- `features/delivery/schemas/url.ts` says the rule was
  "extracted", but `createArtefactAction` (`features/delivery/actions/project-governance.ts`) still carries its
  own inline `new URL(...)` / `https:` check, so the rule now lives in two places. Either point that call site
  at `isHttpsUrl` or soften the comment.
- **`external_url` has no database-level guard, unlike `source_system`** -- `source_system` is checked by both Zod
  and `delivery_items_source_system_check`; `external_url`, the column rendered into an `href`, is Zod-only. No
  other write path exists today, so this is defence in depth, not an open hole. A check such as
  `external_url is null or external_url like 'https://%'` would close it.
- **A tampered `sourceSystem` surfaces Zod's default enum message** rather than friendly copy, because both delivery
  item actions return `issues[0].message`. Only reachable by bypassing the select.
- **`externalUrl` re-spells `optionalText`'s transform** instead of chaining `.refine()` onto it. Cosmetic.
- **`types/database.ts` has a UTF-8 BOM** from the regeneration, and the Integrations migration's filename
  timestamp (`20260913120000`) differs from the version `apply_migration` recorded. Both are harmless tooling
  quirks; the BOM disappears on the next regeneration.
- **The Integrations signed-in checklist has not been completed** -- the URL-only item, the blank item showing "Not
  set" on the detail page, and a `http://` URL being refused are still unchecked by a person.

**History triggers (fixed, with what is still open)**

- **Fixed:** `record_framework_version()` and `record_delivery_item_phase()` were `security invoker` but write tables
  signed-in users can only read, so every real framework edit and every delivery-item phase change failed with
  42501 ("The framework could not be saved"); both history tables had never held a row. They now run as
  `security definer` (`20260920160000`, `20260920161000`), pinned by `tests/integration/rls/history-triggers.test.ts`.
  The audit query `pg_proc where prorettype = 'trigger' and not prosecdef and prosrc ilike '%insert into%'` returns
  nothing in the `public` schema afterwards. Other schemas were not checked.
- **Fixed: `anon` held full privileges on five older tables** -- `frameworks`, `framework_phases`, `projects`,
  `delivery_items` and `project_dependencies` predated the revoke-from-anon convention that `requirements` and the
  Traceability tables follow. RLS and the `is_member_of` execute-revoke stopped it being exploitable in practice, so
  it was defence in depth. `20260920170000_revoke_anon_older_tables.sql` revokes it; `anon` now holds no privilege on
  any of the 52 `public` tables, pinned for fourteen tables by `tests/integration/rls/anon-privileges.test.ts`. That
  test asserts "permission denied for table <name>", not just "permission denied": a policy that calls
  `is_member_of()` makes `anon` fail with "permission denied for function", and a looser match passed for
  `project_dependencies` while it still held every privilege.
- **`authenticated` holds `TRUNCATE`, `REFERENCES` and `TRIGGER` on all 52 `public` tables (except `TRUNCATE` on `approval_decisions`, revoked 2026-09-21)** -- Supabase's default
  grant, never narrowed: the revoke-from-anon migrations `grant select, insert, ...` to `authenticated`, which adds
  to the defaults rather than replacing them. PostgREST exposes no `TRUNCATE`, so it is not reachable through the
  API, but `TRUNCATE` ignores RLS. Narrowing it is a schema-wide decision, not a per-table one.
- **Unresolved: an unchanged framework form may not be a true no-op.** The first failed save was on a form nobody had
  edited, yet the trigger only inserts when a tracked field differs. A later pair of saves recorded both frameworks
  changing their level terms from empty to Epic/Feature, which is consistent with typing them but was never
  separated from the form altering them itself. Saving Automation Implementation with no edits and checking that
  `framework_versions` does not gain a row would settle it.
- **No automated check renders server pages.** The Integrations fix round shipped a View page that threw on every
  request (a `'use client'` module's function called from a Server Component); typecheck, unit tests, `next build`
  and four independent reviews all passed because the route is dynamic and only renders on request. A source guard
  now pins that one case, but a signed-in render is the only thing that catches the class. A smoke test that renders
  each route once would.

## From the governance parity slice (2026-09-20)

Risks and Evidence now have full CRUD, Risks has an owner picker with removed-owner retention and a
status that can move, and every Governance table has RLS coverage. What that slice deliberately left,
and what its tests found:

- **Approvals cannot be reassigned or delegated, and the project panel has no approver assignment.** Decisions and
  Approvals now have edit, delete and submit (completion slice); who approves is still set only elsewhere.
- **Gates do not appear in the project Governance tab.** They are managed only on the Framework page
  (`FrameworkGates` in `features/delivery/components/framework-governance.tsx`), where they can now be created, edited
  and removed. No migration seeds any.
- **`risk-severity.ts` keeps its own private copy of the probability and impact vocabularies.** They match the
  check constraints today; `governance-vocabulary.ts` is now the tested statement of them and the two could
  share it.
- **A risk's owner is never shown as "Former member" in practice.** A member whose membership was soft-removed keeps their membership row, so their real name still shows (and the edit picker labels them "(removed)"); a membership row deleted outright has owner_id set to null by the foreign key (`on delete set null (owner_id)`), so the risk shows "Unassigned". The "Former member" branch in `get-project-governance.ts` is only a fallback for a name that cannot be resolved, and its code comment there overstates it. The same is true of Requirements.
- **`isHttpsUrl` validates with `new URL()` but the raw string is stored.** `https://user:pw@host`, embedded newlines, `https:example.com` and `https://localhost` are all accepted. This is parity with the original `createArtefactAction`. Storing `new URL(x).href` and/or rejecting credentials would harden it.
- **The panel-to-register hop that carries the member list is guarded only by a required prop's type.** `ui-completeness.test.ts` pins the detail-screen-to-panel hop and the register's own `selectOwnerOptions` calls, but a `members={members.filter(...)}` between the panel and the register would compile and defeat retention.
- **`approvals.requested_by`, `approval_decisions.actor_id` and `governance_artefacts.uploaded_by` reference `auth.users`, not `memberships`**, so unlike the other person columns on these tables (`owner_id`, `decided_by`, `approver_id`, `assignee_id`) they are not tenant-constrained. Not decided in the governance completion slice either.
- **A failed save reverts the field the user just typed.** React resets an action-bound form's uncontrolled fields after any completed action, including one that returns an error, so a rejected `http://` URL shows the error beside the stored value, and a failed add clears every field. The Risks and Requirements forms behave the same way. Controlled inputs, or preserving submitted values in the action state, would fix it.

## From the governance completion slice (2026-09-21)

Decisions, Approvals and Gates now have edit and delete, approval history is append-only, and a panel submit writes
its history row. What that slice left, and what its reviews found:

**Behaviour**

- **A failed save still resets the form.** React resets an action-bound form's uncontrolled fields after any completed
  action, including one that returns an error, so the fields the user typed are cleared beside the error message. Same
  in Requirements, Risks, Evidence, Decisions, Approvals and Gates. Controlled inputs or returning the submitted values
  in the action state would fix it.
- **Approver assignment and reassign/delegate are not built.**
- **Gates are metadata only.** Nothing enforces a gate on a phase change.
- **A submit whose history insert fails leaves the approval Pending with no history, and it cannot be retried**, because
  `approvals_lock_content` refuses a return to Draft. The action reports the failure; the row stays.
- **`createGovernanceGateAction` keeps the combined "A phase and gate name are required." message** for a malformed
  phase uuid, which is slightly inaccurate.
- **Deleting a gate keeps its approvals but drops their gate link** (`approvals.gate_id` is `on delete set null`); the
  confirmation text does not say so. Evidence attached to the gate is removed with it (`on delete cascade`).

**Database**

- **`approvals_lock_content` locks only `title`, `description`, `priority` and `due_date`**, not `project_id`,
  `approver_id` or `organization_id`. A submitted approval can never return to Draft (a separate check added in
  `20260921110000`).
- **Deleting a project, a framework or an organisation still cascades to non-Draft approvals and their history.**
  That is a referential action (`on delete cascade`), not a policy, so the Draft-only `approvals_delete` policy does
  not stop it.
- **Approval history rows can be forged, and now cannot be removed.** `approval_decisions_insert` checks only
  `is_member_of(organization_id)`, and `actor_id` is not constrained to the caller, so a member can append
  `action: 'Approved'` with any `actor_id` to any approval in their organisation. Only `service_role` can delete it.
  This is not a regression (before, a member could forge and also erase), but it is the weakest link in the
  "durable history" claim. Adding `with check (actor_id = auth.uid())` to the insert policy would close it.
- **`createStandaloneApprovalAction` swallows a failed "Submitted" history insert** (`features/delivery/actions/
  approval-decisions.ts`), while the project panel's create and update actions report it. The Approvals module is the
  weaker of the two.
- **The project tab labelled "Gates & approvals" shows only approvals.** Gates are managed on the Framework page.
- **`project_dependencies` is missing from the audit-event cleanup sweep in `tests/integration/rls/helpers.ts`**, so
  its RLS tests leave orphaned `audit_events` rows in production (about 570 at the time of the final review). Add it
  to the sweep and delete the orphans with a tightly scoped query.
- **`TRUNCATE` is still held by `authenticated` on every other public table.** The slice revoked it only on
  `approval_decisions`; the schema-wide question in the 2026-09-20 section stands.
- **`approvals.requested_by`, `approval_decisions.actor_id` and `governance_artefacts.uploaded_by` still reference
  `auth.users`, not `memberships`**, so they are not tenant-constrained. Not decided in this slice.
- **`isHttpsUrl` still stores the raw string**, not `new URL(x).href` (see the parity section above).

**Deferred test gaps** (from the task reviews)

- A gate checkbox value of `'true'` or `'1'` is not pinned in the reader tests, so a change of `form.has` versus
  `!!` survives.
- Blank-string optional fields (rationale, description) are untested; only absent ones are.
- The approval `dueDate` invalid case uses `2026-13-01`, not a date like 30 February.
- The Draft-only guard test does not cover the second Draft condition on the edit-form branch (defence in depth only).
- The Draft edit-then-submit RLS test asserts only the returned row, not the stored one.
- No test exercises the server action runtime; only a signed-in walk does. The browser behaviour of the new registers
  and gate forms is unverified by a person.
- `updateDecisionAction` has one very long line, and its create and missing-row errors share one message.

## From the CRM dashboard slice (2026-10-09)

The Overview is now a CRM dashboard and the sidebar has no Delivery section. Design and metric definitions:
`docs/superpowers/specs/2026-10-09-crm-dashboard-design.md`. What it left, and what its inspection found:

- **Core and Framework tenants lost menu access to their main modules.** Their tiers are still defined as the "governed
  delivery foundation" (`config/unison-tiers.ts`), and Portfolio, Projects, Frameworks and Approvals are no longer in the
  sidebar for anyone. The routes, tables and entitlements are untouched, so those pages work by URL, but a Core tenant's
  menu is now Overview, Team and Vendors. Either the tiers need redefining or those tiers need menu entries. The
  provisioning wizard and tier descriptions also still use the word Delivery.
- **The old overview code is still in the repo, unused.** `features/overview/` (fixture-backed, hard-coded figures),
  `features/delivery/components/delivery-overview-*.tsx`, `delivery-briefing-header.tsx` (which still carries the old
  "Search projects, clients, vendors..." placeholder) and `features/delivery/queries/delivery-overview.ts`, with their tests.
  Delete once Delivery is confirmed gone for good.
- **There is no organisation currency, timezone or financial-year setting.** Reports use `Africa/Johannesburg`
  (`REPORTING_TIME_ZONE` in `get-crm-overview.ts`) and the calendar year, and money is never summed across currencies. A
  tenant with several currencies sees them side by side, with no total and no comparison.
- **Open Leads and Active Quotes cannot show a month-on-month change.** Neither table keeps status history (and
  `audit_events` is readable by owners and admins only), so what they were a month ago cannot be rebuilt. Total Clients can,
  from `created_at` / `archived_at`.
- **"Lead converted" and "onboarding completed" are not in Recent Activity.** They have no timestamp column of their own.
  `converted_at` / `completed_at` columns would let them be shown without guessing.
- **The same re-stamping defect exists elsewhere.** `savePhaseSixRecordAction` rebuilds the whole row on every save. That
  re-dated `sales_opportunities.won_at` and `quotes.sent_at` / `accepted_at` (now fixed by triggers in
  `20261009100000_crm_overview.sql`), and still does it to `invoices.paid_at` and `expenses.submitted_at` / `approved_at`.
- **A stored opportunity value of 0 cannot be told from "no value entered"**, so the pipeline shows "No value" for it.
- **Revenue is sales booked.** Invoiced and collected amounts are not shown, and the chart does not plot the forecasts in
  Finance. A "Won" opportunity with no `won_at` (possible only for rows that predate the trigger; there are none) is
  disclosed on the card and left out of the figure.
- **Open pipeline is only shown from the current month onward**, because pipeline for past months cannot be reconstructed.
  Pipeline with no close date, a past close date, or a close date next year is counted and disclosed under the chart.
- **Not exercised signed in.** The dashboard was checked with fixture data in a throwaway preview, with SQL tests against
  fixture organisations, and with unit tests, but not in a signed-in session against real records (production holds none).
  The refresh-on-change path (`record_change_events` to `RealtimeRefresh` to `router.refresh()`) exists and every source
  table writes to it, but it was not watched end to end.
- **`pnpm lint` cannot run in this checkout:** `eslint` is not installed, so lint was not run.

## From the daily CRM loop slice (2026-10-10)

What the contacts, timeline, follow-ups, lead conversion and stage-control slice deliberately left out or could not prove.

- **No email or inbox sync.** Emails are logged by hand.
- **No reminder emails or notifications for follow-ups** (roadmap Stage 4). Follow-ups show on the record and in My Tasks.
- **No CRM roles.** Any member can log, convert a lead and change a stage. Only edit and delete of a logged activity is limited
  to its author or an owner or admin.
- **Contacts are not in global search.**
- **Removing the primary contact leaves none primary** until another is chosen; nothing promotes one automatically.
- **A converted lead's own contact fields stay on the lead** as history; the contact lives on the client.
- **`activities` audits updates and deletes only**, not inserts (the log is the record of the insert).
- **The client page's timeline gathers a lead's entries through `converted_client_id`**, so a lead converted before this slice
  would not appear. There are none (production held no leads).
- **The stage control saves with a "Change stage" button, not on select change.** Choosing Lost needs a reason first, and a
  deliberate click avoids accidental stage changes. The spec said "saves on change"; this was accepted as an amendment.
- **Forms clear typed text after a failed save** (React 19 resets a form after its action), except the activity time, the
  Convert client choice and the stage control, which are held in state. The subject, notes and contact fields reset.
- **"Load more" on the timeline starts over from the first page** whenever anything on the page is saved or revalidated.
- **Contact, follow-up and activity controls stay live on an archived client.**
- **A follow-up due today is flagged Overdue from the afternoon** (it is stored at midday UTC). This is the existing
  `DueDate` component; deciding when "today" ends is a product choice.
- **A bad or foreign assignee on a follow-up reports "That record no longer exists."**, which names the wrong problem.
- **Row buttons' accessible names repeat for entries with the same subject**, and keep the old name while a request is pending.
- **`types/database.ts` is stale** (no `contacts`, `activities` or the new `leads` conversion columns), so the new code reads
  them through untyped clients and the website-leads route casts one lookup. Regenerating the types removes the casts.
- **A lead CSV import with a lowercase `converted` status** fails the whole batch like any invalid status; `Converted` itself is
  skipped row by row with a message.
- **Two leads converted into the same client with no primary contact can collide** on the one-primary rule (it rolls back
  cleanly with a generic message), and the chosen client is not locked during conversion (archiving it mid-call is possible).
- **The concurrency tests cannot prove the locks**; they show the outcome, not that two sessions truly overlapped.
- **Not exercised signed in.** The Convert flow, contacts, timeline "Load more", follow-ups and the stage control were checked
  with fixture data in a throwaway preview (no overflow at 375, 768 and desktop widths, every control labelled, hostile text
  shown as text), with unit and source-guard tests, and with SQL tests against fixture organisations for the database rules.
  The server actions were never run end to end in a signed-in session against real records.
- **Follow-ups take a date, not a time of day** (stored at midday UTC). The spec said "date and time"; accepted as an amendment.
  The column is a timestamp, so a time input can be added later.
- **After a stage change the "Stage updated" message disappears at once**, because the control is re-created when the stored
  stage changes (so it never shows a stale stage). The new stage is shown in the select and the header.
- **Three actions rely on the database to scope by organisation** (`makePrimaryContactAction`, `convertLeadAction`,
  `loadMoreTimelineAction`): they call functions that check membership themselves, instead of filtering on the active
  organisation in code.
- **Unused leftovers:** `RecordWorkspace.record.status` is read by nothing, `WorkspaceSection` has an unused `action` prop,
  and `tests/unit/crm-workspace-actions-source.test.ts` repeats some of `crm-workspace-ui.test.ts`.
- **`createFixtureUser` in the RLS helpers leaves an orphaned auth user if the membership insert fails after the user is
  created.** The suite's teardown now tolerates a failed setup, but this one path still needs closing.
- **The RLS suite (`pnpm test:rls`) runs against production.** On 2026-10-10 the only failures were the two known
  `provision-organization` tests; the CRM overview tests had gone stale (they needed a Lost reason, a conversion date, and the
  new project/retainer client counts) and were updated.

## From the quotes and invoices slice (2026-10-11)

What slice A (line items, price list, generated numbers, calculated totals, company details, on-screen document) left out
or could not prove.

- **No PDF file and no email yet.** The document page prints to PDF from the browser (Print or save as PDF); a real PDF
  download and sending by email are slice B.
- **No quote-to-invoice, payments, automatic Overdue or forecast** (slices B and C). An invoice's payment status and
  outstanding balance are still set by hand after it is issued.
- **The CSV import of quotes and invoices is withdrawn** (a document needs lines and a generated number); the export
  still works, and the clients export and import do not carry the new address and VAT number columns.
- **A draft shows as `DRAFT-xxxxxxxx`** in the global search and the dashboard's recent activity.
- **The logo is the wordmark only.** The dark H mark (the design's mark-plus-wordmark lockup) is not in `public/brand`
  as its own file. Image paths are typed in the company details, not uploaded; the paths must be files in `/brand`.
- **Archived price list items cannot be restored.** There is no archived view.
- **The client page does not show the new address and VAT number** (only the client form does).
- **`types/database.ts` is stale:** the new tables and columns are read through untyped clients, and the client create
  and update actions and form use two small casts until the types are regenerated.
- **The guard and freeze apply to signed-in roles, not to the service role.** The service role (the website intake,
  fixtures) can still write any column; only the database owner and the definer functions are meant to.
- **Quote status loops are allowed among Sent, Accepted, Declined and Expired** (for example Accepted to Sent to Accepted
  re-stamps the acceptance and writes another timeline entry). A member can also archive a sent or issued document.
- **Send and issue do not check that the client is still active,** do not require a VAT number on the company when the
  rate is above zero, and read the document prefix twice (a settings edit in that instant could make the snapshot and
  the number disagree).
- **A draft's preview can show a different VAT rate and total than the sent document**, because the rate is set from
  the company details at the moment it goes out; the document page says the date, number and rate are fixed then.
- **Two documents' lines moved in opposite directions at the same instant can deadlock;** one side is aborted with a
  clear error and nothing is corrupted. A draft-to-paid jump by a non-member writer would have its balance forced to the
  total (no such writer exists today).
- **Press Send quote or Issue invoice and the confirmation message is not shown:** the buttons disappear as the page
  refreshes; the new status and the frozen editor are the confirmation.
- **A paid invoice's paid date moves forward on every save** (existing behaviour of the generic save action).
- **The company details and price list forms keep what was typed after a failed save, but the quote and invoice edit
  forms still reset on a failed save.**
- **The A4 sheet reflows (does not scroll) on a phone** and is meant for desktop viewing and printing; it needs a
  current Chromium, Safari or Firefox to print cleanly (the print layout uses `:has()`).
- **Not exercised signed in.** The server actions, the line editor, the company and price list pages and the document
  page were checked with unit and source tests, SQL tests against fixture organisations for every database rule, a
  fixture preview in the browser pane (layout at desktop and phone width, print layout emulated, hostile text), and
  reviews; they were not run in a signed-in session against real records.

## From the delivery slice (PDF, email, quote to invoice; 2026-10-11)

- **Not exercised signed in, and the server-action PDF path has never run.** The PDF was drawn inside Next only from a
  route handler; drawing one inside the email server action (in the page's function) has been checked by unit and source
  tests, a production build and the file trace, but never by a real send. The signed-in walk-through must email at least
  one document (to your own address first).
- **Public brand files must be committed before deploying.** `public/brand/banner.png` and `himark-wordmark.png` are
  untracked. Every frozen document names them in its snapshot, so without them every PDF download and email fails.
- **No delivery receipts.** Graph accepts a message and reports nothing more; the Emails sent list says what was handed to
  the mail server, not that the client's mailbox accepted it. No stored copy of each PDF (the SHA-256 fingerprint is kept).
- **The email record can be written by any member directly** (the function is executable by `authenticated`); it proves a
  member asserted the send. A cancelled invoice is refused by the action and the screen but not by the database function.
- **The PDF differs from the on-screen sheet in three ways:** the closing strip beside "Next steps" is a plain band, the
  table header does not repeat on later pages, and the footer follows the content instead of sitting at the bottom edge
  of the page. The dark H mark is still not in `public/brand` as its own file.
- **The banner is 1.5 MB**, so a PDF with it is about 1.7 MB, under the 2 MB email budget but with little room. A lighter
  header image (about 1000 px wide JPEG) would leave room for long documents.
- **Emails sent shows the latest 50 only** and does not say when more exist. The hourly cap of 50 is checked by the action,
  not enforced by the database, and a simultaneous burst can overshoot slightly.
- **Plain addresses only:** no display names, lists, CC or BCC, internationalised addresses, or local parts over 64
  characters (Graph refuses those; nothing is recorded). A subject of 300 non-ASCII characters can make an over-long
  encoded header; the send fails safely.
- **Create invoice** stays on an Accepted quote after invoices exist (the list below shows them); its confirmation does not
  mention them. Percentage or milestone invoicing and tracking how much of a quote is billed are not built.
- **Test depth:** the new screens are covered by source-text guards, not behavioural tests; the database test does not
  assert that `owner_id` and `opportunity_id` are copied onto the invoice (the SQL copies them); `eslint` is not installed in
  this checkout, so lint has never been run on this slice.
- **The download routes ship all of `public/` (about 14 MB)** because the image loader joins a computed path; the page
  routes ship `public/brand` (9 MB). Both are far below the function size limits; narrowing is an optimisation.

## From the payments, Overdue and forecast slice (2026-10-11)

- **Not exercised signed in.** The payment form, Void, Cancel invoice and the forecast were checked by unit and source
  tests, database tests against fixture organisations for every rule, and a fixture preview in the browser pane (the form's
  error and kept input, the struck-through voided row, the forecast figures); they were not run in a signed-in session
  against real records. The nightly job's schedule has been registered and run once by hand; its first real run is the first
  night after deploy.
- **A zero-total invoice stays Issued with balance 0.** Lines may have a price of 0, and `issue_invoice` does not apply the
  payment rule, so such an invoice never becomes Paid; the form says there is no balance to pay. Applying the rule in
  `issue_invoice` is a later migration.
- **The forecast can count one deal twice:** an open opportunity whose accepted quote has become an invoice appears in
  Pipeline and in Due, because nothing moves an opportunity to Won automatically. Archived invoices are not filtered (no
  archive action exists). Past months show 0.00 for Due and Pipeline, not a dash. Each currency is shown on its own.
- **Payments and voids that make an invoice Overdue write no `invoice.overdue` entry** (only the nightly job does); a part
  payment on an Overdue invoice keeps it Overdue (untested).
- **Payments cascade-delete with their invoice;** only the missing delete policy on invoices stops a member deleting one.
- **No refunds, credit notes, overpayment credits, reminders or receipts.** One payment is capped at 9,999,999.99. A payment
  from the opening-balance step (none exist today) reads "Former member".
- **The record form has no native fallback:** a click before the page has finished loading does a plain GET and loses the
  input. The date field's latest day is set when the page loads, so a page left open past midnight offers yesterday as the
  latest date (the server re-checks).
- **The old typed forecast records, their code and their data-portability export stay in place, unreachable** from the
  Forecast page. Payments are not in the data-portability export.
- **The database tests run `mark_overdue_invoices()` across every organisation** in the production database; harmless while
  there are no invoices, but note it once real invoices exist.
- **Tests:** the new screens are covered by source-text guards, not behavioural tests; `eslint` is not installed in this
  checkout, so lint has never run on this slice.

## From Stage 3, part 1 (registers that scale; 2026-10-11)

- **Not exercised signed in.** The register screen, toolbar, Archive and Restore, the one-record detail reads and the filtered
  export were checked by unit and source tests, database tests for the summary function and a 1,100-row paging proof, query
  timings on 3,000 fixture rows, and a fixture preview of the toolbar; they were not run in a signed-in session against
  real records. The register table itself has not been looked at in a browser with data.
- **Search and the date sorts scan the table.** At 3,000 invoices the main filters ran in 1 to 8 ms (status uses an index);
  the search is a text match and the sorts have no index of their own, so at tens of thousands of rows per organisation a
  text-search index on the searched columns and indexes for the sortable columns should be added. Not measured on real
  data.
- **The New and Edit forms still load every client, project, member, vendor, lead, opportunity and quote for their select
  lists** (`getPhaseSixOptions`); they will be slow and eventually cut off at 1,000 for a large organisation.
- **The other registers (clients, projects, tasks, approvals, vendors and the rest) still use the shared client-side
  register** with its client-only Archive, Restore and Duplicate that do not save; the old typed-forecast code and its
  data-portability export stay unreachable.
- **No date or amount filters, saved views, column choice or page-size choice;** Duplicate and bulk archive are gone from the
  five registers; export of only ticked rows is gone.
- **Cards show one currency** (ZAR when present) and say when others are left out; the note is register-wide, not per card.
- **Smaller notes:** the archive action reads then writes (two simultaneous archivers both succeed; harmless); the archive
  does not revalidate the quote and invoice print pages or client pages; the export download name drops the date; the
  export buttons have no group label; the summary and screen tests are mostly source guards; `eslint` is not installed in
  this checkout.
- **Archived invoices still go Overdue.** The nightly job (`mark_overdue_invoices`) still flips archived invoices to Overdue and
  posts the timeline entry, while the forecast and the cards now ignore them. Add `archived_at is null` to the job in a new
  migration.
- **Expense search and sort use the typed vendor name only.** When an expense has a linked vendor but no typed name, the Vendor
  column shows the linked vendor's name, but search and sort cannot see it.
- **Detail pages do not say a record is archived,** and Restore exists only in the register.
- **Archive and Restore were only tested with the admin client.** Walk-through item: archive and restore a sent quote and an
  issued invoice signed in, to exercise the quote and invoice triggers.
- **A large export is read in several requests, not one snapshot.** If someone adds or removes a record while a multi-thousand-row
  export is paging, the file can repeat or miss one row. The export of selected ids sends up to 5,000 ids in the address
  (about 190 KB) for each request; ids beyond 5,000 are dropped before the cap is checked.

## From the pricing and credit model (2026-10-12)

Not built, on purpose: credit balances and usage tracking, credit expiry and rollover, automatic monthly invoices, proration, the
"Strategic Consulting" service (no price in the workbook). The workbook's open decisions (expiry and rollover, top-up rate
multipliers, minimum purchase and validity, scope and acceptance per project, support start timing, cost per credit, revenue
recognition) are still open; top-up rates are marked "proposed" on the rate card. Nothing here has been walked signed in.

- **Rulings taken while building (reverse any you disagree with):** a retainer is billed for a month if it was in force at any
  time in it, with no proration (a client who leaves on the 10th is billed that month); a retainer chain's first invoice always
  uses the first retainer's tier and is stored against the first retainer, so an upgrade before it is built changes nothing;
  rate card items cannot be archived in the app (only edited, by an owner or admin) because there is no restore; a billing
  draft is rebuilt by discarding it (new Discard draft button); end dates cannot be in the future and a new retainer cannot
  start on or before an earlier retainer's end date.
- **The four retainer prices live in two places:** the rate card (database) and `config/partner-levels.ts` (provisioning
  wizard); a unit test keeps them equal. Consider reading one from the other.
- **The rate card is seeded only for the HIMARK organisation;** a new organisation has no rate card (the builders refuse).
- **A retainer with a scheduled tier change** shows its end date and cannot be changed again; a scheduled change cannot be
  cancelled; End package is shown only when no end date is set.
- **Small screen issues from the final review:** the "active retainer" hint and the Change tier button disagree for a retainer
  ended today; the "tier change scheduled" note also shows for a retainer simply ended today; End package on a scheduled package
  is offered but always refused; forms may clear typed values after a refused submit (check in the walk-through).
- **A new package that starts in the future cannot build its first quote or invoice before its start date** (quotes are often
  sent before); confirm whether that is wanted.
- **A back-dated project end can delete support that already ran** (and was invoiced); only the audit log keeps it.
- **A scheduled upgrade raises the project limit early:** the limit follows the newest retainer as soon as it is recorded.
- **Quote paths skip the ended check:** converting or duplicating an old first quote for an ended project still works.
- **Smaller:** the unique-violation mapping in the builders is broad (any unique violation reads as "already billed"); the top-up
  read is not locked; `getBillingPackage` returns an empty view, not null, for an unknown client id (the client page 404s
  first); the first quote is not listed under "Built from the package"; the RATE_CARD_FIXED message does not mention VAT.

## From the commercial terms foundation (2026-10-12)

Build 1 of 3. The terms tables, the approval functions and the Settings > Commercial terms screens exist; the quote and invoice
forms do not use them yet (build 2), and credit allocations are build 3. The screens have not been walked signed in.

- **(a) The company-wide templates are a copy of the company settings.** The company quote terms and payment terms templates were
  copied from the two default text boxes in company settings. Until build 2 switches documents over, those text boxes remain the
  source for new documents.
- **(b) Strategic Consulting has terms but no rate card row.** Decision for build 2: how it is offered on a quote.
- **(c) Name clash:** the brief's "AI & Automation Operations" is "Operations Improvement Support" on the rate card. Decision needed
  in build 2.
- **(d) "Proposed" prices:** the brief's Project Care, Managed and Content prices equal the rate card's agreed support prices, but the
  brief calls them "proposed". Decision needed before they are shown on a quote.
- **(e) Commercial policies HIMARK has not approved, so nothing is written for them:** late-payment penalty, termination period,
  intellectual-property transfer, credit expiry or rollover, and any quote validity wording beyond the existing company setting.
- **(f) The support-service templates are empty** and need wording before they offer any terms.
- **(g) An organisation other than HIMARK gets no templates** until `seed_commercial_terms` is called for it (same as the rate card).

Deferred from the reviews, none blocking:

- **Triple braces pass the placeholder check.** `{{{monthly_fee}}}` is accepted by the check in both the database and TypeScript,
  and `resolveTerms` prints malformed placeholders untouched. Consider skipping lines where `placeholderProblems` is non-empty.
- **The service role can null `created_by` and `approved_by` on approved versions.** Accepted: the service role is trusted and
  signed-in roles cannot.
- **Discarded draft numbers are reused.** Discarding a draft and saving a new one gives the new draft the same version number.
- **Draft editor resync edge cases:** approving with no draft, with only the date or note typed, leaves them in the inputs; a stale
  success line stays after Discard or Restore; another admin's change resets an unsaved edit that had failed to save.
- **The user-delete database test leaks a temporary user** if an assertion fails before `deleteUser` runs.
- **`selection.ts` assumes date-only effective dates.** A timestamp in `effective_from` would compare wrongly.
- **The settings text boxes stay the source for new documents** until build 2 switches documents over to the company-wide templates
  (see (a)).
- **Two provisioning database tests were stale, now fixed (2026-10-18).** In `tests/integration/rls/provision-organization.test.ts`, "a HIMARK admin lists the tenants their own membership does not include" (renamed) and "a HIMARK admin cannot reissue into a foreign existing organisation" assumed a HIMARK admin cannot select another organisation directly. That premise predated the `organizations_internal_select` policy (`is_himark_admin()`, migration `20260911154613_phase_seven_eight_platform_automation.sql`), which lets them, on purpose, for the Internal Tenants console. The policy was right and the tests were wrong: both now check membership through `memberships` instead. The file passes 28 of 28.

## From terms on quotes and invoices (build 2, 2026-10-13)

Build 2 of 3. A quote or invoice draft has a Terms panel: an offering picker (quotes), Fill terms, "Filled from ... / edited from template", and
the wording, service inclusions and verified template versions are stored on the document and frozen when it is sent. An invoice made from
an accepted quote takes the quote's offerings. Once an approved company-wide template is in force, the two default text boxes in the company
details are replaced by a link to Commercial terms and new documents no longer prefill from them.

- **A parallel schema was already in production.** `20261012221817_offerings_on_documents.sql` (offering tables, `set_document_offerings`,
  `set_document_terms`, `add_proposed_support_line`, the "AI & Automation" rename) was applied on 2026-10-12 with no code in the repo. It is
  now recorded in `supabase/migrations/`, and this build adopts it. Whoever applied it should say whether other code for it exists.
- **Not built: a screen for `add_proposed_support_line`** (a "Proposed starting price" support line). The function exists and works.
- **Verified how:** the RLS test `tests/integration/rls/document-terms.test.ts` is written but has not been run (no credentials in the
  build environment). The same behaviours were checked against production in a transaction that was rolled back: fill, direct-write refusal,
  edited flag, bad sources and offerings, send freezing, invoice offerings, invoice payment terms. Run `pnpm test:rls` where credentials exist.
- **Not walked signed in yet.** Quote for a Growth engagement, Fill terms, edit one line, send, invoice from it, change the template, confirm
  both documents are unchanged.
- **Decisions (b), (c), (d) above are settled by production:** Strategic Consulting is an offering with terms and no rate card row;
  "AI & Automation" is the name; support prices are quoted as "Proposed starting price".
- **Still open from build 1:** (e) unapproved policies, (f) empty support-service wording, (g) other organisations get no templates until seeded.
- A copy of a quote (`duplicate_quote`) does not copy its offerings, sources or inclusions; the copy starts unfilled.
- One unit test fails on this environment (`crm-overview-metrics`, currency formatting by locale), unrelated to this work.

## From the quote portal, slice 1 (2026-10-19)

Slice 1 of 3 is built: a branded quotation email with a secure link, the client page at `/q/<token>` with a PDF download, a per-organisation
switch (Settings > Company details, off by default), a Client portal panel on the quote page, and Revise this quote. Accept and decline are
slice 2; the HIVE feed gate is slice 3. Spec: `docs/superpowers/specs/2026-10-18-quote-portal-design.md`.
**Next step for the owner:** first read "Read before you switch the portal on" under "From the quote portal, slice 2" below, because slice 2 makes the
switch launch electronic acceptance. Then turn the switch on under Settings > Company details, email one real quote to your own address, and open the
link on a phone and a laptop.

### Not verified

- **Outlook and Gmail rendering of the email.** It was rendered once in the browser pane at 600 and 375 px and compared with the reference image;
  no mail client has opened it.
- **A real send.** No quote has been emailed with the switch on. Tests mint real links and build the real email, and a harness proved a minted link
  opens the same quote number and total; nothing was sent.
- **The signed-in staff screens.** The Client portal panel and Revise this quote on the quote page, the charge-kind select on the line editor
  (the five-column grid at 768-1100 px may squeeze the selects), the Company details switch, and the email form changing between plain and branded
  mode have only been tested as code, not seen in a signed-in browser.
- **`app/(portal)/error.tsx`** (the temporary-error card with Try again) has not been exercised in a browser. A failed read inside the page shows
  the same card inline, without the button.
- **Hosted Vercel behaviour.** On a production build on this machine no request goes to `/_vercel/insights` and the response headers are right.
  Re-check both on the deployed address after release.

### Not built

- The HIVE feed gate (slice 3), and a "view needs a code" option (the spec defers it; the link alone still shows the quotation).
- Designed email images: `public/brand/email-wordmark.png` (480x67) and `email-banner.jpg` (1200x446) are derived from the existing
  `himark-wordmark.png` and `banner.png`, as approved on 2026-10-18; the reference email's banner carries overlay words ("Let's build what's next")
  that these do not. Replace them with supplied files if wanted (same names, same sizes).

### Known limitations

- **The switch gates minting only.** Turning `quote_portal_enabled` off stops new links and branded emails; links already issued keep working.
  It is not a kill switch: revoke links from the quote's Client portal panel. Since slice 2 a link that is still out can also accept and decline (see
  "Read before you switch the portal on" under slice 2 below).
- **A send that throws after the mail service accepted the message** (for example the connection drops after the hand-over) revokes its link, so the
  client's emailed link reads "not valid" until staff resend. A resend mints a fresh link. The error message tells staff to check and resend.
- **The nightly job expires Sent quotes past their valid-until date in every organisation,** whether or not the switch is on. The job
  `unison-mark-expired-quotes` has been live since the migrations were applied on 2026-10-18; its first run, at 00:10 SAST, expired nothing. The
  owner's only Sent quote, HMK-Q-2026-00001, is valid until 2026-11-12 and becomes Expired at 00:10 SAST on 13 November if it is still Sent.
  Reopening an expired quote by hand makes it expire again the next night, because its valid-until date is frozen.
- **Old quotes have no charge kind on their lines,** so the portal shows a flat commercial list for them; only quotes whose lines are marked
  once-off or monthly are grouped.
- **The token appears in platform request logs** (the path `/q/<token>` is logged by the host). Our own code never logs it, and the mail log mode
  replaces it with `/q/redacted`. A link is a bearer credential: anyone with it can read the quote until it expires or is revoked.
- **Quote ids are not in the portal payload, but the line ids are.** Nothing accepts a line id without a signed-in membership.
- **A revision's `replaces_number` is hidden** when the original belongs to another client, is still a draft, or the revision has no client (a lead-only
  quote). A revision whose client was changed before sending supersedes nothing: the original stays Sent and its links stay active
  (`20261018103000_quote_portal_supersede_same_client.sql`).
- **Statuses can still be set by hand** (Accepted, Declined, Expired). The portal follows the quote's status, so a hand-set status changes the page the
  client sees, with no decision record behind it. Slice 2 now shows such a quote as "Marked by staff" on the quote page (where the Client portal panel
  is shown). Superseded cannot be set or cleared by hand; it is set when a revision is sent.
- **The Client portal panel reads a link's own state only.** A link on an archived quote or a hand-Expired quote reads Active there, while the portal
  shows "not valid" or "expired".
- **The greeting and the link's recipient name always use the quote's contact name,** even when the email goes to someone else.
- **Links have no `revoked_by` column and no audit record,** so who revoked a link is not recorded.
- **Revise this quote is allowed on an archived quote.**
- **Emails sent stores only the personal note for a branded send,** not the branded email itself.
- **The expired card says "an updated one"** even after a revision has been issued.
- **The portal header loads the 227 KB wordmark** (`public/brand/himark-wordmark.png`).
- **The email sign-off uses the frozen issuer name** from Company details (production quotes say "HIMARK"; the references show "HIMARK Strategic Growth
  Consulting"). Set it in Company details before switching the portal on.
- **The add-line charge kind defaults to Once-off,** so a monthly line added by hand is mis-tagged unless it is changed.
- **A bare `/q` shows the not-found page.**
- **`types/database.ts` is stale.** It predates the portal tables and functions, so the portal code uses untyped (`as any`) database clients, like
  the rest of the document code. Regenerate it (Supabase `generate_typescript_types`) before relying on it.

### Owner decisions

- **Client-facing copy drafted by the implementer, not in the spec appendix** (all in `features/quote-portal/copy.ts`; change the text there):
  the expired, replaced, "link is not valid" and "could not load" cards; the accepted and declined banners; the PDF-failed message; the
  "Try again" label; and `SLICE_ONE_RESPOND_NOTE` ("To accept or decline this quotation, reply to the email you received or contact your HIMARK
  contact."), which slice 2 has now removed because the buttons exist. `TERMS_STRIP` (appendix wording, "before responding") also shows on accepted and
  declined quotes; decide whether decided quotes need a different sentence.
- **Three visual departures in the email from the reference image:** a slim navy bar with the company name above the white logo row (the reference has
  none; `himark-wordmark-white.png` exists and could give a single navy header row); the banner is uncropped at 600x223 (about 2.7:1) where the
  reference strip is about 9:1 (a 4:1 crop, 1200x300, would shorten the header by about 100 px); no icons in the summary card.
- **Contrast of the muted grey** (`#6e7d8c`, about 4.0-4.2:1 on the small labels) is below the 4.5:1 AA level. It is the grey the brief specified.
- **Phone layout without media-query support.** Mail apps that drop the phone style block show the two buttons side by side, 471 px wide at
  375 px. The email is complete and readable there; the buttons overflow. Stacked buttons need the media query or a different button layout.
- **The summary card at the email's 600 px width is tight.** The five columns are 80 to 120 px wide, so a long project name wraps over three lines
  and the valid-until date over three ("18 / November / 2026"); the reference image was captured in a wide Gmail reading pane. Below 620 px the card
  stacks into rows and reads well. A two-row card on desktop would fix it.

### Test debt found and fixed by the final run (2026-10-19, not caused by this slice)

The full `pnpm test:rls` run against production passed 449 of 451. The two failures and one leak it found were older than this slice and are fixed.

- **`tests/integration/rls/documents-foundation.test.ts` wrote to `price_list_items`,** a table dropped by
  `20261013240000_drop_retired_billing_columns.sql`, so two of its 16 tests failed. Fixed in 23978cc.
- **`cleanup()` in `tests/integration/rls/helpers.ts` did not trace `invoice_offerings` audit rows,** so `document-terms.test.ts` left four
  `audit_events` rows with no organisation on every full run. They were deleted by id, and `'invoice_offerings'` was added to the sweep in 641b1a4.

## From the quote portal, slice 2 (2026-10-25)

Slice 2 of 3 is built: Accept and Decline on the client page, with a six-digit code emailed to the address the quote was sent to; an append-only record
of every decision; the quote's status moving to Accepted or Declined; a notice in the app and an email to the quote's owner; an acknowledgement email
to the client; a follow-up task when a client declines; and the recorded response on the staff quote page. Slice 3 (the HIVE feed gate) is not started.
Spec: `docs/superpowers/specs/2026-10-18-quote-portal-design.md`. Plan: `docs/superpowers/plans/2026-10-20-quote-portal-slice-2.md`. The work is on the
branch `claude/gallant-dewdney-af21e8`: 17 commits, `d7f5b96..9005b98` (the plan, its corrections, the build and the final review fixes), plus the docs
commit `docs: record quote portal slice 2`. It is not merged into main and not pushed yet; that happens when the owner asks. The database changes below are
already live, though. **Next step for the owner:** read the next block before anything else.

### Read before you switch the portal on

The switch (Settings > Company details) is off by default. Slice 2 changes what turning it on means.

1. **Turning the switch on now launches electronic acceptance.** Any client who holds an emailed link can accept or decline the quotation, using a
   code sent to the email address the link was made for. Before slice 2 a link could only be read.
2. **Turning the switch off does not stop links that are already sent.** It stops new links only. A link already in a client's inbox keeps working,
   including accepting and declining, until staff revoke it from the quote's Client portal panel. This was a known limit of slice 1; it matters more now.
3. **Legal and privacy review must come first.** The spec requires it before launch: whether click-to-accept with an emailed code satisfies ECTA and
   HIMARK's contracts, and what the evidence record may keep under POPIA and for how long. The code cannot settle either. Nothing is retained or
   deleted automatically.
4. **One real end-to-end send is still owed.** No code, acknowledgement or owner email has gone out through Microsoft Graph. Before launch, email one
   real quote to your own address and walk the whole flow: open the link, ask for a code, accept, and read the three emails.

### Production changes already live

Five migrations were applied to the live database (`unison-uat`, which is production) during this build. The repo files keep their planned timestamps;
the database recorded the versions given here.

- **`quote_portal_decisions_schema` (20261020063353):** two new tables. `quote_access_codes` holds the emailed codes, stored only as a salted hash, and no
  signed-in user can read it. `quote_responses` is the decision record: staff of the organisation can read it, nobody can edit or delete a row (not
  even the server), and rows go only when their quote or organisation is deleted.
- **`quote_portal_timeline` (20261020064429):** `activities` gained the kinds `quote.declined` and `quote.superseded`, and the two functions that write
  the quote timeline were replaced so that they write them.
- **`quote_portal_code_functions` (20261020072714):** the fingerprint of a quote (`private.quote_snapshot_hash`), `portal_issue_code` (makes and stores a
  code), and a new version of `portal_get_quote` that returns two more keys, `snapshot_hash` and `response`.
- **`quote_portal_decide` (20261020105441):** `portal_decide`, which checks the code and the page the client saw and records the decision, and two helper
  functions it uses (who to tell, and the follow-ups, which were empty at this point).
- **`quote_portal_follow_ups` (20261020112451):** fills in the follow-ups (the notices to the owner and the sender, and the decline task or note) and
  changes the "who to tell" helper to ignore archived team members.

- **Everything is additive.** New tables, new functions and two new timeline kinds. The functions that were replaced keep what they did and only gain
  the new lines.
- **Only the server can call the new functions** (the service role). Signed-in staff and the public cannot call them, and the helper functions are
  granted to no one and run only inside `portal_decide`.
- **Timeline entries are now written for every organisation, not only ones using the portal.** The timeline functions are shared, so a hand-set
  Declined and the superseding of an original when a revision is sent now write `quote.declined` and `quote.superseded` entries everywhere.
- **Nothing is exposed today.** At the end of the work production had no client link at all (0 links, 0 codes, 0 responses), so no client can reach the
  new functions. Your quote HMK-Q-2026-00001 was never touched; it is still Sent.

### Verified

- **Typecheck** (`pnpm typecheck`) is clean, before and after the final fix wave.
- **Unit tests.** `pnpm test` (unit and tenancy tests) passed 1116 of 1116 before the final fix wave. After it, the whole unit suite passed 1127 of 1127.
- **Build.** `pnpm build` succeeded (run once, before the final fix wave; the ledger records no build after it). `/q/[token]` and its PDF route are
  dynamic, and the brand images are in the PDF route's file trace.
- **Database tests against production.** `pnpm test:rls` passed 518 of 518 across 49 files (about 32 minutes) on 2026-10-20, before the final fix wave.
  After that wave the three integration files it touched were run again and passed: decide 22 of 22, follow-ups 14 of 14, timeline 6 of 6. The two
  multi-minute stalls seen in `quote-portal-links.test.ts` while the timeline migration was built did not recur in the full run.
- **Browser walk-through, 2026-10-25,** against throwaway fixtures (a test organisation with quotes and links made by the test helpers, addresses at
  `example.test`), with the dev server's mail transport in log mode, so no email was sent.
  - **Accept, end to end:** field errors beside the fields, focus moving to each step's heading, the code email written to the log (link token
    hidden), a wrong code answered with "4 attempts left", then the right code giving the accepted page and banner. In the database: status Accepted,
    accepted time set, a `quote.accepted` timeline entry with no author, a complete response row, and an in-app notice for each of the owner and the
    sender. The acknowledgement and the owner's email were written to the log.
  - **Decline, end to end:** a reason chosen and a multi-line comment containing markup, stored word for word; the declined banner and decline
    message; status Declined; a `quote.declined` entry; and the follow-up task "Follow up: <client> declined quotation <number>", due in three days,
    assigned to the owner and attached to the client.
  - **Phone, 375 px:** no sideways scroll, the summary and fields stack, and focus lands on the step's heading.
- **The fixtures were created and removed in the live database,** because the project has no other database. Production residue was checked after the
  test runs and after the walk-through: audit rows with no organisation stayed at their starting value of 1320, and test organisations, users, links,
  codes, responses, follow-up tasks and notices were all 0. HMK-Q-2026-00001 is still Sent.

### Not verified

- **Outlook and Gmail rendering of the three new emails** (the code, the acknowledgement and the owner's notice). Unit tests check their structure and
  escaping; none has been opened in a mail client.
- **A real send through Microsoft Graph** of any of them. In the walk-through they were written to the log only.
- **The signed-in staff screens** for the new "Response" block, "Marked by staff", "Responded" on a link and "Revised as". They need a signed-in
  session and a quote with a real response; they are covered by unit and source tests and the typecheck only.
- **The tablet layout between 768 and 1100 px.**
- **A real phone.** Only a 375 px browser window was checked.
- **Screen reader behaviour.**
- **The focus change to "Send a new code"** after a code is spent. It was not seen in the walk-through, and the repo's tests cannot check focus, so
  it is covered by source and state-logic tests only.
- **The hosted Vercel behaviour** of the client's address, which is read from the `x-forwarded-for` header.

### Not built / known limits

- **The snapshot the client saw is stored only as a hash,** not the full frozen quotation. The hash cannot be re-derived from the quote after the
  decision, because the frozen copy it was taken from includes the status and the accepted time, which the decision then changes. To re-derive it: take
  the quote as it was while Sent (status Sent, accepted time empty), build its snapshot with `private.quote_snapshot` as defined in migration
  `20261018102500`, and take the SHA-256 of that text. Keeping the snapshot itself next to each response is a "before launch" decision tied to the
  POPIA question (see Owner decisions).
- **Someone who holds only the link can lock it for good** with about 30 wrong guesses. The limit is 10 an hour, so that takes roughly three hours at
  the least, and the client is emailed a code each time one is requested. Staff must then issue a new link, and the staff panel still shows the locked
  link as Active.
- **Only the newest code works.** Asking for a new code makes the older one useless. The code email and the page now say so.
- **A code request whose email fails to send** still uses one of the 5 codes allowed per hour.
- **There is no limit per email address.** The limits are per link.
- **The IP address and browser string of a decision are stored as evidence.** They are not shown to staff, but any member of the organisation can read
  them through the database.
- **A follow-up task or notice that cannot be written** leaves only a database warning in the log. It never undoes the decision.
- **If the answer to a committed decision is lost on its way to the client's browser,** a retry is answered from the record and sends no emails. The
  owner's email and the client's acknowledgement for that decision are then never sent.
- **The owner's email goes to their team-member address even if they have no login;** in-app notices need a login, so in that case only the person
  who sent the link gets an in-app notice.
- **A decline task can sit with someone who cannot open it.** An owner who has a team profile but no login is still the task's assignee, and nobody can
  open it until they have a login. Changing this needs a new migration.
- **"Marked by staff" is not shown everywhere.** The staff Client portal panel is hidden for an organisation with the switch off, no links and no
  response, so a quote accepted by phone and marked Accepted by hand there shows no label. A one-line condition change would show it.
- **After a staff reopen, older responses stay listed under the quote** without a "historical" mark.
- **The declined banner takes its date from the link's own decision.** If staff reopen a declined quote and then mark it Declined by hand, the page
  still shows the date of the earlier decision.
- **The spec's "view needs a code" option is still not built.** The link alone still shows the quotation; the code is needed only to decide.
- **The client's address is evidence only.** It comes from `x-forwarded-for`, which Vercel sets itself; behind any other proxy a client could set it.
- **In local development with the log mail transport (`EMAIL_TRANSPORT=log`) the code email's text, with the code, is printed in the server log,** on
  purpose, so the flow can be tried. The link token is still hidden there.
- **Some of the server-action and component tests are source-text checks pinned to exact formatting,** so they will need touching when those files
  are reformatted.
- **Local development: after a production build the browser pane needs a fresh `.next` before `pnpm dev`.** Delete the gitignored `.next` folder;
  otherwise `/q/<token>` answered 404 during the walk-through.
- **Smaller items the reviews left open:** invisible characters such as a zero-width space are accepted in the name, position and organisation fields;
  going Back from the code step needs a new code, which counts toward the 5 an hour; and when a code request is refused because the link is no longer
  open, already decided or not valid, the page shows the message but does not refresh itself.

### Owner decisions

- **The ten calls the plan made where the spec is silent** (all built as written; confirm or change each):
  1. Failed-code caps: 10 failed attempts per link per hour, and 30 for the life of the link. The spec says "capped per hour" with no number. A locked
     link needs a fresh link from staff.
  2. The decline confirmation wording is drafted: "I confirm that I am authorised to decline this quotation on behalf of the organisation." The spec
     says only that a decline has "its own, shorter, confirmation".
  3. The decline task: priority Medium, status Planned, due in three days, assigned to the quote's owner, else the person who sent the link. The
     reason "Chose another provider" makes a timeline note and no task.
  4. A follow-up that cannot be written never undoes the decision.
  5. A repeat request from a link that has already decided returns the recorded outcome, even if staff have since reopened the quote. A fresh link is
     needed to decide again.
  6. Staff do not see the IP address and browser string.
  7. `quote.declined` is logged for any move to Declined, including a hand-set one; `quote.superseded` is logged when a revision is sent.
  8. The owner's email goes to their team-member address whether or not they have a login; in-app notices need a login.
  9. Emails are sent before the action returns, not afterwards in the background, so nothing is lost if the server instance is frozen. The cost is
     about a second of waiting after a decision.
  10. The new client-facing messages are drafted, and need your approval (next item).
- **New client-facing wording to approve.** All of it is in `features/quote-portal/copy.ts`, in the group marked "DRAFTED for the owner's approval"
  (change the text there). Wording taken word for word from the spec appendix needs no new approval.
  - The decline consent sentence (`CONSENT_DECLINE`) and the step headings (`STEP_LABELS`).
  - The field errors (`FIELD_ERRORS`) and the refusal messages (`REFUSAL_MESSAGES`), including the throttled message, and the wrong-code message
    (`codeWrongMessage`).
  - `ALREADY_RESPONDED_NOTE`, the confirmation and form labels and the buttons (`CONFIRMATION_LABELS`, `FORM_LABELS`, `FLOW_BUTTONS`), and the
    recorded message (`DECISION_RECORDED`).
  - The code-sent message (`codeSentMessage`) and the line "Only the most recent code works." (`CODE_EMAIL_LATEST_NOTE`).
  - The message for a repeated response (`replayedMessage`) and the declined banner with its date (`declinedBanner`).
  - The acknowledgement email's subject "Your response to quotation <number>" and its greeting, the acknowledgement sentence used when a quote has no
    owner, and the code email's "Quote number" and "Client" lines.
- **The masked address.** The confirmation step shows the address the code goes to as, for example, "t***@example.test" under "Verified email". Keep it
  masked (a forwarded link then does not reveal the recipient's address), or show it in full?
- **Should switching the portal off also stop sent links from deciding?** Today it does not (see "Read before you switch the portal on"). A gate is a
  one-migration change: the database would refuse to issue codes and record decisions while the switch is off. Until then, the answer is to revoke the
  links.
- **Should the snapshot itself be stored with each response?** Today only its hash is kept (see Not built). Production has no responses yet, so the
  column can be added later with nothing lost. Decide it together with the POPIA review.

### Settled from the slice 1 notes

- The hash is taken over the database's own text of the snapshot, never a JavaScript re-serialisation (which would turn `100.00` into `100`).
- The full terms sources, with their ids, are stored on each response, taken from the quote itself.
- An archived quote cannot be accepted: it reads "not valid" on the page and a code or a decision for it is refused.
- The "Replaced by" line on the staff panel now reads "Revised as" unless the quote's own status is Superseded.
- Decided quotes stay reachable after their valid-until date, because the quote's status decides the page before any date check. This is slice 1's
  page logic, which slice 2 did not change; the ledger records no separate slice 2 test of a decided quote past its valid-until date.

## From the quote portal, slice 3 (2026-10-25)

Slice 3 of 3 is built, which completes the quote portal: a setting that makes the HIVE client feed (`GET /api/v1/clients`) return only clients with an
accepted quote, off by default; a switch with an impact preview in Settings > Integrations; and a status line on the quote page. UNISON can say only
whether a client would appear in the feed and when HIVE last read it. It cannot see what HIVE did with it, so nothing in the app says "sent", "handed
off" or "completed". Spec: `docs/superpowers/specs/2026-10-18-quote-portal-design.md` ("Slice 3: HIVE feed gate"). Plan:
`docs/superpowers/plans/2026-10-25-quote-portal-slice-3.md`. Boundary spec: `docs/superpowers/specs/2026-10-13-client-focused-boundary-design.md`
("Narrowing the feed" under "The API for HIVE"). The work is built on the branch `claude/gallant-dewdney-af21e8`: 8 commits, `6dfd461..3fce74b` (the
plan, the build and the final review fixes), plus the docs commit `docs: record quote portal slice 3`. It is merged into `main` when the owner asks. The
database changes below are already live, though. **Next step for the owner:** read the next block before anything else.

### Read before you switch the feed gate on

The setting (Settings > Integrations, "HIVE client feed") is off by default. While it is off, HIVE sees exactly what it saw before.

1. **Turning it on narrows a live contract.** HIVE reads `GET /api/v1/clients` with the key named "HIVE"; its last recorded read was 2026-10-25 05:46
   UTC. With the gate on, the feed returns a client only while it has a non-archived Accepted quote.
2. **With today's data, turning it on empties the feed.** On 2026-10-25 production had 2 active clients and none had a non-archived Accepted quote;
   your quote HMK-Q-2026-00001 is Sent. Every pull would return an empty list until a quote is accepted. The Integrations page says so before you
   switch it on: "Today none of your 2 clients have an accepted quote, so turning this on would leave the feed empty."
3. **Tell HIVE's maintainers first.** Tell them:
   - the rule: a client is returned only while it has a non-archived Accepted quote, whether it was accepted on the portal or marked Accepted by staff;
   - the response shape is unchanged, and nothing about quotes is added to it;
   - a client missing from a full pull is not deleted in UNISON. Ask how HIVE treats a client that is absent from the feed before you switch on.
     UNISON cannot take back what HIVE has already read, and what HIVE does with a client that leaves the feed is up to HIVE;
   - `updatedAt` changes meaning while the gate is on: it is the later of the client's own `updated_at` and its latest `accepted_at`, so an acceptance
     reaches an incremental pull. It can also move backwards, if a later acceptance is moved back or archived while an earlier one remains;
   - while the gate is on, edits to clients outside the feed do not reach HIVE;
   - after you switch the gate off, HIVE should read the whole feed once without `updated_since`. The clients that were left out keep their own,
     older `updated_at`, so an incremental pull would skip them.
4. **Who can switch it.** Only an owner or admin. Switching on needs a tick confirming that HIVE's maintainers have been told, and the page's action
   refuses without it. Who changed the setting and when is in the audit log. Switching off needs no tick and applies on the next pull.
5. **The message after switching off is true for a full pull only.** It reads "The HIVE client feed includes every client again." HIVE's incremental
   pulls will not bring back the clients that were left out (see 3). See the first item under Owner decisions.

### Production changes already live

Two migrations were applied to the live database (`unison-uat`, which is production) during this build. The repo files keep their planned timestamps;
the database recorded the versions given here.

- **`hive_feed_gate` (20261025160445; repo file `20261025100000_hive_feed_gate.sql`):** the setting column
  `organization_settings.hive_feed_requires_accepted_quote` (`boolean not null default false`), the private helper `private.client_accepted_quotes`
  (the one definition of "has an accepted quote", granted to no one), and a replaced `get_clients_for_api_key`.
- **`hive_feed_status` (20261025161648; repo file `20261025101000_hive_feed_status.sql`):** `get_hive_feed_status`, which any member of the organisation
  can call for the quote-page line and the last-read time. Only owners and admins also get the client counts.

- **Both are additive.** A new column, a new helper and a new function, plus the replaced feed function.
- **The setting is false for every organisation, so HIVE sees exactly what it saw before.** The replaced feed function was compared section by section
  with the previous one: the same keys, values, order, paging and filtering. A characterisation test of the old behaviour was written and passed
  before the migration, and passed again after it. The function keeps its security settings and its permissions.
- **The real HIVE key was never used by any test.** Every test made its own organisation and its own key. The real key's last-used time was checked
  after every database run and is unchanged by this work (2026-10-25 05:46 UTC).

### Verified

- **Typecheck** (`pnpm typecheck`) is clean, before and after the final review fixes.
- **Unit tests.** `pnpm test` (unit and tenancy tests) passed 1196 of 1196 on 2026-10-25 before the final review fixes. After them, the whole unit suite
  passed 1234 of 1234.
- **Build.** `pnpm build` succeeded with no warnings (run once, before the final review fixes; the ledger records no build after them). The feed route
  (`/api/v1/clients`), the Integrations page and the quote page are dynamic.
- **Database tests against production.** `pnpm test:rls` passed 539 of 539 on 2026-10-25 (about 32 minutes), before the final review fixes, including the
  two new files: `client-feed-gate.test.ts` 11 of 11 and `client-feed-status.test.ts` 10 of 10. The final review fixes changed TypeScript and unit tests
  only.
- **Browser walk-through, 2026-10-25,** on a throwaway organisation with an owner who signs in, two clients (one with an Accepted quote, one without)
  and its own feed key, with the dev server's mail transport in log mode.
  - **Settings > Integrations:** the "HIVE client feed" section sits between the connection register and the key table, with the preview of how many
    clients have an accepted quote and the last-read time. Ticking the switch shows the acknowledgement box, unticked, and the form cannot be submitted
    without it. With it ticked, Save gave "Only clients with an accepted quote are now included in the HIVE client feed."; in the database only the
    throwaway organisation's setting became true. After a reload the page showed the saved-on state with the acknowledgement already ticked.
  - **Quote page:** the client with an Accepted quote read "Included in the HIVE client feed since 23 Oct 2026." with the last-read line; the client
    without one read "Not included in the HIVE client feed (no accepted quote)."; with the setting off, the page read "The HIVE client feed currently
    includes every client." The new section sits between "Email to client" and the timeline.
- **The fixture was created and removed in the live database,** because the project has no other database. Production residue was checked after every
  run and after the walk-through: audit rows with no organisation stayed at their starting value of 1320, test organisations and users were 0, the
  fixtures were removed, the real organisation's setting is still false, the real HIVE key's last-used time is unchanged, and HMK-Q-2026-00001 is
  still Sent.

### Not verified

- **Switching the gate off through the page.** Unit tests cover it, with the exact sentence. In the walk-through the page stopped hydrating in a hidden
  browser pane after a submit made before it had finished loading, so the click was not seen.
- **The final review fixes in a browser.** The walk-through ran before them. The reworded sentence about what HIVE has already read, the plain "would
  leave the feed empty" sentence, and the Integrations page keeping its key table when the status read fails are covered by unit tests and server rendering only.
- **The tablet and phone layout** of the new section and of the quote-page line.
- **HIVE's own behaviour** when a client leaves the feed, and on a pull after the gate is switched off. This repo does not show it.
- **A real HIVE pull with the gate on.** Do not test this on the real organisation: switching on would empty its feed today.

### Known limits

- **The helper that decides eligibility runs once per client on every pull, even while the gate is off.** The results are identical, and at 2 clients
  the cost is negligible. The final review chose not to touch the live feed function again before release. If it ever matters, fix it in this order:
  first an additive `alter function private.client_accepted_quotes(uuid, uuid) rows 1` and a re-run of the characterisation tests; then, if still
  needed, make the feed run the old query verbatim (from `20261014120000_client_feed_primary_contact.sql`) when the gate is off.
- **"Included since" is the earliest current acceptance,** the earliest `accepted_at` among the client's non-archived Accepted quotes. It is not the
  moment the gate was switched on.
- **The counts include archived clients,** because the feed returns them (with `archived: true`). A filter for active clients only would be a one-line
  change in the status function plus its test.
- **The last-read time ignores revoked keys.** It is the latest read over keys that are not revoked, so when the only key has been revoked the page can
  say that HIVE has not read the feed yet.
- **A hand-written `accepted_at` affects the feed time.** The feed's `updatedAt` takes the latest `accepted_at`. A back-dated value can make a newly
  eligible client miss an incremental pull, and a future one makes the client appear in every pull until that time passes. A future feed migration
  should cap it at now (`least(..., now())`).
- **`updatedAt` can move backwards** while the gate is on, when a later acceptance is moved back or archived while an earlier one remains.
- **The acknowledgement tick is a deliberate-click guard in the page's action only.** A stale tab that was loaded while the gate was on can switch it
  back on, after another admin switched it off, without a fresh tick; and an owner or admin calling the database API directly can bypass the tick.
  Both are recorded in the audit log.
- **The quote-page status line appears only when a live feed key exists** and the quote has a client. With no key, nothing reads the feed.
- **Owners and admins pay for an organisation summary the quote page does not use,** on every quote page visit: the status function computes the
  counts for them. An optional skip-summary parameter on the function would fix it.
- **If the status read fails, the gate section is hidden** on the Integrations page, and the key table still shows. One log line with the error code
  only is written. The quote-page line is left out in the same way.
- **A submit before the page has finished loading** does a plain GET with the checkbox values in the address (the walk-through saw
  `?acknowledged=on`). It is harmless and changes nothing; the portal switch from slice 1 does the same.
- **Several slice 3 tests are source-text checks tied to exact formatting,** so they will need touching when those files are reformatted.
- **Smaller items the reviews left open:** with exactly one client, and that client accepted, the preview reads "Today all 1 client has an accepted
  quote ..."; a signed-out session that submits the switch gets the generic save error; and the plan file still carries the superseded wording about
  what HIVE keeps (the plan is a record; the page uses the final sentence).

### Owner decisions

- **The success sentence after switching off.** "The HIVE client feed includes every client again." is true for a full pull only (see "Read before you
  switch the feed gate on"). The final review ruled that the plan-pinned sentence stays and the caveat is recorded in these notes and in the boundary
  spec. Should the sentence also say that HIVE needs one full pull? Until then, someone who switches the gate off may believe HIVE already has every
  client again.
- **Who tells HIVE's maintainers, and when the gate is switched on.** The spec leaves both with you. Until you say, it stays off.
- **The eight calls the plan made where the spec is silent** (all built as written; confirm or change each):
  1. The switch lives in Settings > Integrations, beside the feed keys, and is for owners and admins only. The spec says only "behind its own setting".
  2. Switching on needs a tick confirming that HIVE's maintainers have been told, and the server enforces it. The tick shows whenever the switch is
     ticked and starts ticked only when the saved setting is already on, so saving an already-on gate does not ask again.
  3. The page shows the effect before the switch is turned on (how many clients have an accepted quote today, counted whatever the gate is set to),
     because switching on with today's data would empty the feed.
  4. The quote-page line appears only when a live feed key exists and the quote has a client.
  5. "Included since" means the earliest `accepted_at` among the client's non-archived Accepted quotes.
  6. Any member can read the client line and the last-read time; only owners and admins get the organisation counts.
  7. One private helper defines "has an accepted quote" for both the feed and the status, so they cannot drift.
  8. No route or proxy changes: no new endpoint, and still no `GET /api/v1/clients/{id}`, which the boundary spec mentioned but the repo has never
     had. The boundary spec now says so.
