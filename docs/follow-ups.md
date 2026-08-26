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

The provisioning register at /internal/provisioning still lists mock drafts.
Its rows carry tier, modules, go-live and a numeric progress bar, none of which
exist now that provisioning creates an organisation directly. Either model a
draft entity or retire that register in favour of /internal/organisations.
