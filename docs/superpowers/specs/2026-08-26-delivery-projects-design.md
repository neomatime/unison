# Delivery: Projects

**Date:** 2026-08-26
**Status:** Approved, ready for planning

## Why

Three pages in UNISON read from Postgres, all of them Clients. Ten read from
mock files. The delivery surface Codex added — `/operations/projects`,
`/delivery/portfolio`, frameworks, vendors, approvals, onboarding — renders
entirely from `features/delivery/data.ts` and `features/delivery/portfolio-data.ts`.

This spec covers the first slice of that domain: **Projects**, taken end to end
the way Clients was, so the second module confirms the foundation generalises
before another nine are built on it.

## Scope

The delivery domain is roughly ten tables. Building it in one pass would repeat
the mistake the Clients-first decision was made to avoid, so it is decomposed
and this spec takes one slice.

**In scope:** `projects`, and the `frameworks` / `framework_phases` tables that
Projects cannot exist without.

**Out of scope, deliberately:** programmes, portfolios, gates, blockers,
dependencies, vendors, approvals, onboarding, and the Frameworks CRUD screen.
Each is additive later.

`/operations/projects` and `/delivery/portfolio` both render from
`features/delivery/`, so they are one domain rather than two competing models.

## Decisions

**A project is anchored to an optional client.** `client_id` is a nullable FK.
The mock projects are internal change work with no client; a delivery business
also runs work *for* clients. A nullable column serves both. Making it `not
null` would contradict the current data and block internal initiatives; omitting
it would mean a migration plus revisiting every query when client work appears.

**Each framework defines its own phases.** The mocks already require this:
`deliveryPhases` lists 8 stages (Initiate → Measure) while `onboardingStages`
lists 6 different ones (Welcome → Go Live). A single global phase set cannot
represent both, and per-tenant configurable lifecycles are the governed-delivery
proposition. Frameworks are first-class governed artefacts — they carry a
version (`v3.2`) and a review state — not descriptive labels.

**The owner is a UNISON user.** `owner_id` is a nullable FK to `auth.users`,
matching the existing `clients.owner_id`. This enables "my projects", and
reassignment when someone is offboarded. The cost is accepted: an owner must be
someone invited to the workspace. Free text was rejected because typos become
permanent data, which is what `clients` already avoided.

> **Corrected 2026-08-26.** "An owner must be someone invited to the workspace"
> is not enforced anywhere — no composite key, no membership check, no RLS
> predicate, no trigger. `owner_id` is the one foreign key on `projects` that is
> not tenant-scoped. The column stays; accepting a value for it from user input
> does not, until an org-scoped owner reference exists. See the withdrawal note
> under Success criteria.

**`status`, `health` and `progress` are stored and manually set**, matching the
`clients` precedent rather than deriving them. Derivation can come later without
changing the column.

## Schema

```sql
frameworks
  id                uuid pk
  organization_id   uuid not null → organizations
  name              text not null
  type              text
  version           text
  archived_at       timestamptz
  created_at        timestamptz not null
  updated_at        timestamptz not null
  unique (organization_id, name)
  unique (id, organization_id)          -- supports the composite FKs below

framework_phases
  id                uuid pk
  framework_id      uuid not null
  organization_id   uuid not null
  name              text not null
  position          integer not null
  unique (framework_id, position)
  unique (framework_id, name)
  unique (framework_id, id)             -- supports the phase FK below
  foreign key (framework_id, organization_id) → frameworks (id, organization_id)

projects
  id                uuid pk
  organization_id   uuid not null → organizations
  client_id         uuid                       -- null for internal work
  name              text not null
  framework_id      uuid not null
  phase_id          uuid
  owner_id          uuid → auth.users
  status            text not null default 'Active'
                      check in (Active, On Hold, Complete, Cancelled)
  health            text not null default 'On Track'
                      check in (On Track, Healthy, Watch, At Risk, Critical)
  progress          smallint not null default 0 check (progress between 0 and 100)
  next_gate         text
  due_date          date
  notes             text
  archived_at       timestamptz
  created_at        timestamptz not null
  updated_at        timestamptz not null
  foreign key (framework_id, phase_id)       → framework_phases (framework_id, id)
  foreign key (client_id, organization_id)   → clients (id, organization_id)
  foreign key (framework_id, organization_id)→ frameworks (id, organization_id)
```

`clients` gains `unique (id, organization_id)` to support that FK. It is
additive and changes no existing behaviour.

### Why the composite foreign keys

**`(framework_id, phase_id)`** — a plain `phase_id` FK would let a project on
*Client Onboarding* sit in the *Build* phase, since both are valid phase rows.
The composite key makes a cross-framework phase unrepresentable, so no
application code has to remember to check.

**`(client_id, organization_id)` and `(framework_id, organization_id)`** — this
one is tenant isolation, not tidiness. The RLS insert check validates only
`projects.organization_id`; it does not verify that `client_id` belongs to that
same organisation. Without the composite FK a crafted insert can attach another
tenant's client id. RLS on `clients` hides it from ordinary joins, but the row
still holds a live cross-tenant reference, which leaks as soon as anything reads
it through the service key or a `security definer` function.

### Indexes

- `projects (organization_id, archived_at)` — the list query's shape
- `projects (organization_id, client_id)` — projects for a client
- `projects` trigram index on `name` — search, as `clients` does (pg_trgm is installed)

### Triggers

Each table gets `set_updated_at` and `record_audit_event`, matching
`clients_set_updated_at` and `clients_audit`.

## Access control

Each table gets three policies for `authenticated`, gated on
`is_member_of(organization_id)`:

- `select` — `using (is_member_of(organization_id))`
- `insert` — `with check (is_member_of(organization_id))`
- `update` — both `using` and `with check`

**No delete policy**, matching `clients`. Deletion is impossible because no
policy permits it; archiving via `archived_at` is the only removal path. This is
enforced by absence, not by convention.

`framework_phases` carries `organization_id` rather than reaching through its
parent, so its policy is a direct column test like every other table. The
composite FK to `frameworks` keeps the two from diverging.

## Module surface

Mirrors `features/clients/` exactly:

```
features/delivery/
  schemas/project.ts          zod schema, shared by actions and form
  queries/list-projects.ts    filter, sort, paginate, search
  queries/get-project.ts
  actions/create-project.ts
  actions/update-project.ts
  actions/archive-project.ts
```

The screens already exist from Codex's work. They change from importing
`features/delivery/data.ts` to receiving props, the way `ModuleWorkspace` takes
`records` and `connected`.

## Seeding

`framework_id` is `not null`, so an organisation with no frameworks cannot
create a project at all. The migration seeds the six existing frameworks and
their phases for every current organisation.

Provisioning a new tenant must do the same. That is out of scope here, but it is
a real gap: without it, the first thing a new customer meets is a form they
cannot submit. Recorded in `docs/follow-ups.md`.

## Testing

Unit tests for the zod schema and the list query's filter/sort/paginate logic.

Integration tests under `tests/integration/rls/`, following the existing ones:

- a member of org A cannot select, insert or update org B's projects
- inserting a project whose `client_id` belongs to another organisation is
  rejected by the composite FK
- assigning a phase from a different framework is rejected
- no delete is possible even for an owner

## Success criteria

> **Corrected 2026-08-26, after the whole-branch review.** As written, this
> paragraph describes a slice with a working write path. What shipped is a
> read-only register. The original text is kept below, struck through, rather
> than edited away, so the claim and the outcome can be compared.

~~`/operations/projects` reads from Postgres with search, filter, sort and
pagination agreeing with the record count; a project can be created, edited and
archived; the delivery mocks are no longer imported by any project route; RLS
tests pass; `tsc` and the full suite are green.~~

**As delivered.** `/operations/projects` reads real rows from Postgres through
`listProjects`, and `/operations/projects/[projectId]` renders the record it
names through `getProject`, 404ing when the id does not resolve inside the
caller's organisation. Every field the database does not hold renders as `—`.
The schema — composite tenant-scoped foreign keys, RLS on all three tables, no
delete policy, audit and `updated_at` triggers, the frameworks seed — is
complete and covered by `tests/integration/rls/`. `tsc`, `pnpm test`,
`pnpm build` and `pnpm test:rls` are green.

**Not delivered, and deferred to the next slice.** No project can be created,
edited or archived through the UI. `createProjectAction`, `updateProjectAction`
and `archiveProjectAction` are written, and the policies they depend on
(`projects_insert`, `projects_update`, and the absence of a delete policy) are
asserted in `tests/integration/rls/delivery-projects.test.ts` — but no form
calls them. The create and edit routes still render a local-state wizard, and
the register's own create/edit/archive controls still mutate a `useState` array.
Server-side search, filter, sort and pagination exist in `listProjects` but are
unreachable: nothing in the UI sets the query string, so the register's own
controls operate on the first page of results only, and its footer count is
that slice rather than the true total.

Two consequences worth stating plainly, because they are the shape of a
read-only slice and not defects to be fixed piecemeal: the "New Project"
wizard reports success and writes nothing, and the metric cards above the
register are still fixed mock figures that will contradict an empty or small
register until they are connected.

**The `owner_id` claim is withdrawn for now.** This document asserted that "an
owner must be someone invited to the workspace". Nothing enforced it —
`projects.owner_id` references `auth.users(id)` with no tenant-scoped composite
key, no membership check and no RLS predicate behind it. Rather than ship a
user-controlled write to an un-tenant-scoped foreign key that nothing reads
back, `ownerId` was removed from `projectInputSchema` and from both actions.
The column stays in the schema. Reinstate the input only together with an
org-scoped owner reference — a membership check, or a composite key through
`memberships` — which is what would make the original claim true.
