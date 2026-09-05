# Projects write path

**Date:** 2026-09-05
**Status:** Approved, ready for planning

## Why

`feat/delivery-projects` shipped a **read-only** projects register. Both routes
read real rows, the schema half is complete — composite tenant-scoped foreign
keys, RLS on all three tables, no delete policy, audit and `updated_at`
triggers — and `createProjectAction`, `updateProjectAction` and
`archiveProjectAction` are all written and tested at the database level.

**Nothing calls them.** `/operations/projects/new` renders a four-step wizard
whose submit handler sets local state, whose fields have no `name` attributes,
and which shows a "Project created" panel having written nothing.

Projects is the central object of a project delivery system. Delivery Items hang
off it (`docs/delivery-items.md`), project dependencies are project-to-project
(`docs/project-dependencies.md`), and the buyer demo in
`docs/first-buyer-readiness.md` opens by creating one. All three are blocked
until a project can be created.

## Scope

**In:** the three actions wired to real forms; tenant-scoped project ownership;
the register driven from the URL with true totals; deletion of the fabricated
metrics and panels; route boundaries; four recorded minors.

**Out, deliberately:** Delivery Items; project dependencies; portfolio and
programme as real entities (no tables, and the register currently shows columns
for both); the literal-`*` search limitation, which needs an operator other than
`ilike`; and bulk actions.

## Approach: move projects onto `ModuleWorkspace`

`ModuleWorkspace` already has a `connected` mode, proven by Clients — the one
module wired to Postgres. In that mode it skips in-memory filtering because the
server has already filtered against the URL's `q`, disables local archive and
bulk archive, and links to real routes instead of opening an in-memory panel.
`projects` already has a registry definition. This is reuse, not new machinery.

The alternative considered and rejected: a bespoke register under
`features/delivery`. It buys control this slice does not need and abandons the
only working precedent. Revisit when Delivery Items nest inside a project.

**`RecordCollectionWorkspace` must not be modified.** Ten-plus screens depend on
its `useState(config.records)` behaviour — it is what makes the fixture modules
feel alive. The follow-up entry "stop the register mutating records in local
state" is satisfied for projects by *no longer using that component*, not by
changing it. Changing it would break every fixture module at once.

**`ProjectsScreen` is deleted.** With it go six hard-coded metric cards
("Active Projects 36", "At Risk 7", "On-Time Delivery 84%") sitting above a
register of real rows, and three hard-coded summary panels below it. That
resolves the "connect or hide the metric cards" follow-up by deletion: the
delivery overview already carries real counts, and a register should be a
register.

## Ownership

`projects.owner_id` exists and references `auth.users(id)` with nothing
tenant-scoping it, which is why it was removed from `projectInputSchema` — a
crafted submit could name a user in another organisation, and neither RLS nor a
foreign key would refuse it.

`memberships` already carries `UNIQUE (organization_id, user_id)`, so the
composite key has a target:

```sql
alter table public.projects
  add constraint projects_owner_fkey
  foreign key (organization_id, owner_id)
  references public.memberships (organization_id, user_id)
  on delete set null (owner_id);
```

Column order matters: it must match the unique constraint,
`(organization_id, user_id)`, not the reverse.

**The `(owner_id)` column list on `on delete set null` is required, not
decorative.** Without it Postgres nulls *every* column in the constraint,
including `organization_id`, which is `not null` — the same defect that produced
migration `20260826111259`. `projects_client_fkey` already carries the list for
exactly this reason.

The existing `owner_id → auth.users` foreign key stays. It is redundant with the
composite one, and harmless: deleting an auth user cascades to the membership,
which nulls the owner through the new constraint.

A cross-tenant owner becomes **unrepresentable** rather than merely rejected,
which is what the schema comment asked for.

### A removed member stays the owner, deliberately

Offboarding sets `memberships.status = 'removed'`; it never deletes the row —
`docs/follow-ups.md` explains why deleting lets a departed employee re-grant
themselves through `claim_directory_membership()`. So a removed member remains a
valid foreign-key target and remains the project's owner.

That is the wanted behaviour. Nulling ownership when someone leaves silently
erases who was accountable for the work. **The picker offers only active
members; an existing owner who has since been removed still displays.** Surfacing
that staleness is more useful than hiding it, and a future "owners needing
reassignment" view is a query, not a schema change.

`projectInputSchema` gains `ownerId` as an optional uuid, matching `clientId`.
The comment explaining its absence is replaced by one explaining the constraint
that now makes it safe.

## The form

`ProjectForm`, modelled directly on `ClientForm`: one page, `useActionState`,
`<form action={formAction}>`, and the shared `TextField` / `SelectField` /
`TextAreaField` / `FormSection` / `FormFooter` components. `mode` is `'create'`
or `'edit'`, and the action is passed in, exactly as `ClientForm` does.

`features/delivery/components/project-form.tsx` — the four-step wizard — is
deleted. It has no `name` attributes, so it could never have submitted anything.

Four pickers, all tenant-scoped by the queries behind them:

- **Framework** — required. Excludes archived frameworks; `archived_at` is
  currently never filtered, which is one of the recorded minors.
- **Phase** — optional, and filtered to the selected framework. All phases for
  the tenant load with the form (six frameworks of roughly eight phases each, so
  under fifty rows) and filter client-side on framework change. A round trip
  would cost more than the data.
- **Client** — optional. Null means internal change work.
- **Owner** — optional. Active members of this organisation.

`status` and `health` options come from the zod enums, **not** from the registry
definition, which currently offers `Planning`, `On Track` and `At Risk` — values
`projects_status_check` rejects.

## Register

The page stops discarding `total`, `page` and `pageSize`, so the footer reports
the true count rather than the current slice, and rows beyond the first page
become reachable. `initialQuery` feeds the search box, as Clients does.

The registry's `projects` definition is corrected to what the query returns:
project, client, framework, phase, health, next gate, due date, owner. Portfolio,
programme, team and risk are removed — there are no tables behind them. Its
fabricated select options (`'Neo Morake'`, `'Amara Dlamini'`, `'LGNDRY.CO'`,
`'Growthpoint Properties'`) go too; connected mode does not render them, but
fiction left in source is indistinguishable from intent to the next reader.

The implementer must check whether anything else consumes `moduleById.projects`
before changing its columns.

**Archive** lives on the project detail page as a form posting to
`archiveProjectAction`, because connected mode deliberately disables the row-level
archive control. There is no delete policy on `projects`; archiving sets
`archived_at`, which every list query already filters.

## Boundaries and recorded minors

`app/(unison)/operations/projects/` gains `error.tsx` and `loading.tsx`, which
`operations/clients/` already has. Without them a transient database error
escalates to the root full-page fallback and the route streams with no skeleton.

Four minors from the delivery-projects review, all in files this slice already
touches:

- `projectInputSchema.notes` caps at 500 characters while `projects.notes` is an
  unbounded `text` column. Make them agree.
- `dueDate` is validated only as a non-empty string and passed to a `date`
  column, so a malformed value becomes a Postgres error rather than a
  field-level message. Validate it as a date.
- `updateProjectAction` and `archiveProjectAction` do not call `.select()`, so
  they cannot distinguish "updated one row" from "matched none" — a wrong or
  already-archived id reports success. Add it and return a refusal on zero rows.
- The framework picker must exclude `archived_at is not null`.

## Testing

**RLS specs** (`tests/integration/rls/`):

- a project is created with an active member of the same organisation as owner
- an owner who is a member of a *different* organisation is refused by the
  constraint, not by application code
- deleting a membership nulls `owner_id` and leaves `organization_id` intact —
  this is the assertion that would have caught the missing column list on
  `on delete set null`
- a member whose status is `removed` remains a valid owner

**Unit tests:**

- `projectInputSchema` accepts a valid `ownerId` and rejects a non-uuid
- `dueDate` rejects a malformed date
- the register offers no `status` or `health` option that
  `projects_status_check` would reject — asserted against the zod enums, so the
  two cannot drift
- `ProjectsScreen` and the four-step `project-form.tsx` no longer exist, and no
  fabricated person or client name survives in the registry's projects
  definition

## Success criteria

A signed-in member creates a project through the form and lands on its detail
page. Editing changes the row. Archiving removes it from the register and it
stays gone after a reload. The footer count is the true total and page two is
reachable. Owner is selectable from that organisation's active members and
nobody else. A project cannot be created with a client, framework, phase or
owner from another organisation.

`tsc`, `pnpm test`, `pnpm test:rls` and `pnpm build` green from a clean tree,
verified with `git stash --include-untracked` rather than from the working copy.

## Global constraints

- Migrations are an append-only log; never edit an applied one. Apply through
  the Supabase MCP.
- `on delete set null` on a composite foreign key **must** name its column list.
- Grants do not carry across a signature change, and `revoke ... from public`
  does not strip Supabase's default grant to `anon`.
- `pnpm test:rls` runs against the shared `unison-uat` project. Every fixture
  must be registered for `cleanup()`.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- A field in the UI is a claim that the product supports that capability
  (`docs/product-principles.md`). This slice removes several; it must add none.
