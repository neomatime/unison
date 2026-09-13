# Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a PM link a requirement to the delivery item(s) that build it and the evidence record(s) that verify it, with a derived per-requirement coverage badge, on a new Traceability tab.

**Architecture:** Two plain join/edge tables (`requirement_delivery_items`, `requirement_evidence`), each pinning both ends to the same project via composite foreign keys. A pure function derives the coverage badge from link counts — nothing is stored. A single query assembles per-requirement link ids; a small client panel resolves names from the delivery-item and evidence lists the page already fetches for other tabs, and renders add/unlink controls as plain server-action forms.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions (`useActionState`), Supabase Postgres 17 with RLS, Node's built-in test runner.

## Global Constraints

- Both ends of every link must belong to the same project, not merely the same organisation — enforced by composite foreign keys, never only by what the UI offers.
- No coverage rollup/dashboard, no bulk linking, no cross-project traceability, no linking to anything other than delivery items and evidence, no external tool sync — see the spec's "Out" list.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Full spec: `docs/superpowers/specs/2026-09-13-traceability-design.md`.

---

### Task 1: Schema, RLS and integration tests

**Files:**
- Create: `supabase/migrations/20260913100000_traceability.sql`
- Modify: `tests/integration/rls/helpers.ts`
- Create: `tests/integration/rls/traceability.test.ts`

**Interfaces:**
- Produces: tables `public.requirement_delivery_items` (`id, organization_id, project_id, requirement_id, delivery_item_id, created_at`) and `public.requirement_evidence` (`id, organization_id, project_id, requirement_id, evidence_id, created_at`), both RLS-enabled with `select`/`insert`/`delete` policies gated on `public.is_member_of(organization_id)`, no `update` policy.

- [ ] **Step 1: Write the migration**

```sql
-- Traceability: links requirements to the delivery items that build them and
-- the evidence that verifies them. See
-- docs/superpowers/specs/2026-09-13-traceability-design.md.
--
-- Both ends of each link must belong to the SAME project, not merely the
-- same organisation -- enforced structurally via composite foreign keys, the
-- same way delivery_items_parent_fkey pins a child to its parent's project.
-- This requires widening three existing tables' uniqueness: every table's id
-- is already globally unique via its primary key, so pairing it with columns
-- already fixed per-row (project_id, organization_id) costs nothing to
-- satisfy -- these constraints exist purely so the foreign keys below can
-- reference them.
alter table public.requirements
  add constraint requirements_id_project_org_unique unique (id, project_id, organization_id);

alter table public.delivery_items
  add constraint delivery_items_id_project_org_unique unique (id, project_id, organization_id);

-- governance_artefacts.project_id is nullable (framework- or approval-scoped
-- evidence has none). This constraint, like requirement_evidence's foreign
-- key below, only ever matches rows where it is set -- exactly the
-- project-scoped subset this feature links to. Framework- or approval-scoped
-- evidence can never satisfy this foreign key, by construction: NULL never
-- equals a NOT NULL column, so it is structurally unlinkable, not merely
-- unoffered by the UI.
alter table public.governance_artefacts
  add constraint governance_artefacts_id_project_org_unique unique (id, project_id, organization_id);

create table public.requirement_delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  requirement_id uuid not null,
  delivery_item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (requirement_id, delivery_item_id),
  constraint requirement_delivery_items_requirement_fkey
    foreign key (requirement_id, project_id, organization_id)
    references public.requirements(id, project_id, organization_id) on delete cascade,
  constraint requirement_delivery_items_delivery_item_fkey
    foreign key (delivery_item_id, project_id, organization_id)
    references public.delivery_items(id, project_id, organization_id) on delete cascade
);

create table public.requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  requirement_id uuid not null,
  evidence_id uuid not null,
  created_at timestamptz not null default now(),
  unique (requirement_id, evidence_id),
  constraint requirement_evidence_requirement_fkey
    foreign key (requirement_id, project_id, organization_id)
    references public.requirements(id, project_id, organization_id) on delete cascade,
  constraint requirement_evidence_evidence_fkey
    foreign key (evidence_id, project_id, organization_id)
    references public.governance_artefacts(id, project_id, organization_id) on delete cascade
);

comment on table public.requirement_delivery_items is
  'Links a requirement to the delivery item(s) that build it. Both ends must share one project -- enforced by the composite foreign keys, not the application. Status is derived, never stored: see features/delivery/traceability-options.ts.';
comment on table public.requirement_evidence is
  'Links a requirement to the evidence (governance_artefacts) that verifies it. Both ends must share one project -- enforced by the composite foreign keys, not the application.';

create index requirement_delivery_items_requirement_idx on public.requirement_delivery_items (requirement_id);
create index requirement_delivery_items_delivery_item_idx on public.requirement_delivery_items (delivery_item_id);
create index requirement_evidence_requirement_idx on public.requirement_evidence (requirement_id);
create index requirement_evidence_evidence_idx on public.requirement_evidence (evidence_id);

alter table public.requirement_delivery_items enable row level security;
alter table public.requirement_evidence enable row level security;

-- No update policy on either table, matching project_dependencies: a link is
-- an edge, it either holds or it does not, and it has no field worth mutating.
create policy requirement_delivery_items_select on public.requirement_delivery_items
  for select using (public.is_member_of(organization_id));
create policy requirement_delivery_items_insert on public.requirement_delivery_items
  for insert with check (public.is_member_of(organization_id));
create policy requirement_delivery_items_delete on public.requirement_delivery_items
  for delete using (public.is_member_of(organization_id));

create policy requirement_evidence_select on public.requirement_evidence
  for select using (public.is_member_of(organization_id));
create policy requirement_evidence_insert on public.requirement_evidence
  for insert with check (public.is_member_of(organization_id));
create policy requirement_evidence_delete on public.requirement_evidence
  for delete using (public.is_member_of(organization_id));

create trigger requirement_delivery_items_audit
  after insert or delete on public.requirement_delivery_items
  for each row execute function public.record_audit_event();
create trigger requirement_evidence_audit
  after insert or delete on public.requirement_evidence
  for each row execute function public.record_audit_event();
```

Apply it with the Supabase MCP tool (`apply_migration`) against `unison-uat` — this project's only Supabase project, which is production; there is no separate staging database.

- [ ] **Step 2: Add the two new tables to the audit-event cleanup sweep**

In `tests/integration/rls/helpers.ts`, find the array of resource names passed to `.in('resource', [...])` in the `deliveryEvents` query (it currently ends with `'requirements',`). Add two more entries so links created during tests do not leak orphaned `audit_events` rows into production, matching how `'requirements'` itself was added for the same reason:

```ts
        'requirements',
        'requirement_delivery_items',
        'requirement_evidence',
      ])
```

- [ ] **Step 3: Write the RLS integration tests**

Create `tests/integration/rls/traceability.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let projectId: string
let siblingProjectId: string
let outsiderProjectId: string
let requirementId: string
let siblingRequirementId: string
let deliveryItemId: string
let siblingDeliveryItemId: string
let outsiderDeliveryItemId: string
let evidenceId: string
let siblingEvidenceId: string
let outsiderEvidenceId: string

before(async () => {
  orgId = await createFixtureOrg('traceability')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('traceability-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'TRC Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  const frameworkId = framework.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'TRC Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const sibling = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'TRC Sibling Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (sibling.error) throw sibling.error
  siblingProjectId = sibling.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'TRC Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'TRC Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id

  const requirement = await admin.from('requirements')
    .insert({ organization_id: orgId, project_id: projectId, title: 'TRC Requirement' })
    .select('id').single()
  if (requirement.error) throw requirement.error
  requirementId = requirement.data.id

  const siblingRequirement = await admin.from('requirements')
    .insert({ organization_id: orgId, project_id: siblingProjectId, title: 'TRC Sibling Requirement' })
    .select('id').single()
  if (siblingRequirement.error) throw siblingRequirement.error
  siblingRequirementId = siblingRequirement.data.id

  const deliveryItem = await admin.from('delivery_items')
    .insert({ organization_id: orgId, project_id: projectId, framework_id: frameworkId, level: 1, name: 'TRC Delivery Item' })
    .select('id').single()
  if (deliveryItem.error) throw deliveryItem.error
  deliveryItemId = deliveryItem.data.id

  const siblingDeliveryItem = await admin.from('delivery_items')
    .insert({ organization_id: orgId, project_id: siblingProjectId, framework_id: frameworkId, level: 1, name: 'TRC Sibling Delivery Item' })
    .select('id').single()
  if (siblingDeliveryItem.error) throw siblingDeliveryItem.error
  siblingDeliveryItemId = siblingDeliveryItem.data.id

  const outsiderDeliveryItem = await admin.from('delivery_items')
    .insert({ organization_id: outsiderOrg, project_id: outsiderProjectId, framework_id: outsiderFramework.data.id, level: 1, name: 'TRC Outsider Delivery Item' })
    .select('id').single()
  if (outsiderDeliveryItem.error) throw outsiderDeliveryItem.error
  outsiderDeliveryItemId = outsiderDeliveryItem.data.id

  const evidence = await admin.from('governance_artefacts')
    .insert({ organization_id: orgId, project_id: projectId, name: 'TRC Evidence', external_url: 'https://example.com/trc-evidence' })
    .select('id').single()
  if (evidence.error) throw evidence.error
  evidenceId = evidence.data.id

  const siblingEvidence = await admin.from('governance_artefacts')
    .insert({ organization_id: orgId, project_id: siblingProjectId, name: 'TRC Sibling Evidence', external_url: 'https://example.com/trc-sibling-evidence' })
    .select('id').single()
  if (siblingEvidence.error) throw siblingEvidence.error
  siblingEvidenceId = siblingEvidence.data.id

  const outsiderEvidence = await admin.from('governance_artefacts')
    .insert({ organization_id: outsiderOrg, project_id: outsiderProjectId, name: 'TRC Outsider Evidence', external_url: 'https://example.com/trc-outsider-evidence' })
    .select('id').single()
  if (outsiderEvidence.error) throw outsiderEvidence.error
  outsiderEvidenceId = outsiderEvidence.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

function deliveryLink(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, requirement_id: requirementId, delivery_item_id: deliveryItemId, ...over }
}
function evidenceLink(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, requirement_id: requirementId, evidence_id: evidenceId, ...over }
}

test('a valid delivery item link is accepted', async () => {
  const { data, error } = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(error, null)
  await admin.from('requirement_delivery_items').delete().eq('id', data!.id)
})

test('a delivery item from a different project is refused', async () => {
  const { error } = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ delivery_item_id: siblingDeliveryItemId })).select('id').single()

  assert.ok(error, "a delivery item outside the link's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_delivery_items_delivery_item_fkey/)
})

test('a requirement from a different project is refused', async () => {
  const { error } = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ requirement_id: siblingRequirementId })).select('id').single()

  assert.ok(error, "a requirement outside the link's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_delivery_items_requirement_fkey/)
})

test('a cross-tenant delivery item is unrepresentable', async () => {
  const { error } = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ delivery_item_id: outsiderDeliveryItemId })).select('id').single()

  assert.ok(error, 'a delivery item from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_delivery_items_delivery_item_fkey/)
})

test('a duplicate delivery item link is refused', async () => {
  const first = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(first.error, null)

  const { error } = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.ok(error, 'a duplicate link must be refused')
  assert.equal(error!.code, '23505')

  await admin.from('requirement_delivery_items').delete().eq('id', first.data!.id)
})

test('deleting the requirement removes its delivery item links', async () => {
  const requirement = await admin.from('requirements')
    .insert({ organization_id: orgId, project_id: projectId, title: 'TRC Disposable Requirement' })
    .select('id').single()
  assert.equal(requirement.error, null)

  const link = await admin.from('requirement_delivery_items')
    .insert(deliveryLink({ requirement_id: requirement.data!.id })).select('id').single()
  assert.equal(link.error, null)

  await admin.from('requirements').delete().eq('id', requirement.data!.id)

  const after = await admin.from('requirement_delivery_items').select('id').eq('id', link.data!.id)
  assert.deepEqual(after.data, [], 'the link must not survive its requirement')
})

test('an outsider can neither read, write nor delete delivery item links', async () => {
  const seeded = await admin.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('requirement_delivery_items').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's links must not be visible")

  const write = await client.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('requirement_delivery_items').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [], "an outsider's delete must match no rows")

  await admin.from('requirement_delivery_items').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can link and unlink a delivery item', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('requirement_delivery_items').insert(deliveryLink()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('requirement_delivery_items').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const removed = await client.from('requirement_delivery_items').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('requirement_delivery_items').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the unlinked row must be gone')
})

test('a valid evidence link is accepted', async () => {
  const { data, error } = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(error, null)
  await admin.from('requirement_evidence').delete().eq('id', data!.id)
})

test('evidence from a different project is refused', async () => {
  const { error } = await admin.from('requirement_evidence')
    .insert(evidenceLink({ evidence_id: siblingEvidenceId })).select('id').single()

  assert.ok(error, "evidence outside the link's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_evidence_evidence_fkey/)
})

test('a cross-tenant evidence link is unrepresentable', async () => {
  const { error } = await admin.from('requirement_evidence')
    .insert(evidenceLink({ evidence_id: outsiderEvidenceId })).select('id').single()

  assert.ok(error, 'evidence from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirement_evidence_evidence_fkey/)
})

test('a duplicate evidence link is refused', async () => {
  const first = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(first.error, null)

  const { error } = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.ok(error, 'a duplicate link must be refused')
  assert.equal(error!.code, '23505')

  await admin.from('requirement_evidence').delete().eq('id', first.data!.id)
})

test('deleting the evidence removes its requirement link', async () => {
  const evidence = await admin.from('governance_artefacts')
    .insert({ organization_id: orgId, project_id: projectId, name: 'TRC Disposable Evidence', external_url: 'https://example.com/trc-disposable' })
    .select('id').single()
  assert.equal(evidence.error, null)

  const link = await admin.from('requirement_evidence')
    .insert(evidenceLink({ evidence_id: evidence.data!.id })).select('id').single()
  assert.equal(link.error, null)

  await admin.from('governance_artefacts').delete().eq('id', evidence.data!.id)

  const after = await admin.from('requirement_evidence').select('id').eq('id', link.data!.id)
  assert.deepEqual(after.data, [], 'the link must not survive its evidence')
})

test('an outsider can neither read, write nor delete evidence links', async () => {
  const seeded = await admin.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('requirement_evidence').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's links must not be visible")

  const write = await client.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('requirement_evidence').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [], "an outsider's delete must match no rows")

  await admin.from('requirement_evidence').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can link and unlink evidence', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('requirement_evidence').insert(evidenceLink()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('requirement_evidence').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const removed = await client.from('requirement_evidence').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('requirement_evidence').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the unlinked row must be gone')
})
```

- [ ] **Step 4: Run the RLS suite**

Run: `pnpm test:rls`
Expected: every test in `traceability.test.ts` passes; the only failures, if any, are the two pre-existing, unrelated `provision-organization.test.ts` failures already tracked separately (not this task's to fix).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260913100000_traceability.sql tests/integration/rls/helpers.ts tests/integration/rls/traceability.test.ts
git commit -m "feat(traceability): link requirements to delivery items and evidence, project-pinned"
```

---

### Task 2: Coverage derivation and option filtering (pure logic)

**Files:**
- Create: `features/delivery/traceability-options.ts`
- Test: `tests/unit/traceability-options.test.ts`

**Interfaces:**
- Produces: `type Coverage = 'Not linked' | 'Built' | 'Verified'`, `deriveCoverage(deliveryItemCount: number, evidenceCount: number): Coverage`, `unlinkedOptions<T extends { id: string }>(all: readonly T[], linkedIds: readonly string[]): T[]` — both consumed by Task 5's panel.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/traceability-options.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveCoverage, unlinkedOptions } from '../../features/delivery/traceability-options.ts'

test('zero delivery items and zero evidence is Not linked', () => {
  assert.equal(deriveCoverage(0, 0), 'Not linked')
})

test('a delivery item with no evidence is Built', () => {
  assert.equal(deriveCoverage(1, 0), 'Built')
  assert.equal(deriveCoverage(3, 0), 'Built')
})

test('any evidence is Verified regardless of delivery item count', () => {
  assert.equal(deriveCoverage(0, 1), 'Verified')
  assert.equal(deriveCoverage(3, 2), 'Verified')
})

test('unlinkedOptions removes already-linked ids and keeps the rest', () => {
  const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(unlinkedOptions(all, ['b']), [{ id: 'a' }, { id: 'c' }])
})

test('unlinkedOptions returns every option when nothing is linked', () => {
  const all = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(unlinkedOptions(all, []), all)
})

test('unlinkedOptions returns nothing when everything is linked', () => {
  const all = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(unlinkedOptions(all, ['a', 'b']), [])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/unit/traceability-options.test.ts`
Expected: FAIL — `features/delivery/traceability-options.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `features/delivery/traceability-options.ts`:

```ts
/**
 * Coverage is derived from link counts, never stored -- the same reasoning
 * dependency-status.ts uses: a stored value would go stale the moment a link
 * is added or removed elsewhere, which is exactly the failure this feature
 * exists to remove.
 */

export type Coverage = 'Not linked' | 'Built' | 'Verified'

export function deriveCoverage(deliveryItemCount: number, evidenceCount: number): Coverage {
  if (evidenceCount > 0) return 'Verified'
  if (deliveryItemCount > 0) return 'Built'
  return 'Not linked'
}

/** Removes options a requirement is already linked to, so an add picker never re-offers a duplicate. */
export function unlinkedOptions<T extends { id: string }>(all: readonly T[], linkedIds: readonly string[]): T[] {
  const linked = new Set(linkedIds)
  return all.filter((option) => !linked.has(option.id))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types tests/unit/traceability-options.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add features/delivery/traceability-options.ts tests/unit/traceability-options.test.ts
git commit -m "feat(traceability): derive coverage status and filter linked options"
```

---

### Task 3: Read query

**Files:**
- Create: `features/delivery/queries/list-traceability.ts`
- Modify: `types/database.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: tables `requirements`, `requirement_delivery_items`, `requirement_evidence` from Task 1.
- Produces: `type TraceabilityRow = { requirementId: string; title: string; deliveryItemIds: string[]; evidenceIds: string[] }` and `listTraceability(projectId: string): Promise<TraceabilityRow[]>`, consumed by Task 5's page wiring.

- [ ] **Step 1: Regenerate database types**

Run the Supabase MCP tool `generate_typescript_types` against `unison-uat` and overwrite `types/database.ts` with its output verbatim. Do **not** hand-edit this file — Task 2 of the Requirements plan did that once, it silently failed to typecheck on a fresh checkout, and it had to be redone this way. Confirm afterward that `types/database.ts` contains `requirement_delivery_items` and `requirement_evidence` table definitions.

- [ ] **Step 2: Write the query**

Create `features/delivery/queries/list-traceability.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type TraceabilityRow = {
  requirementId: string
  title: string
  deliveryItemIds: string[]
  evidenceIds: string[]
}

/**
 * Returns ids only, never names -- the panel resolves names from the
 * project's own delivery-item and evidence lists, which the page already
 * fetches for the Delivery and Governance tabs. Fetching them again here
 * would be a redundant round trip for data already in hand.
 */
export async function listTraceability(projectId: string): Promise<TraceabilityRow[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [
    { data: requirements, error: requirementsError },
    { data: deliveryLinks, error: deliveryLinksError },
    { data: evidenceLinks, error: evidenceLinksError },
  ] = await Promise.all([
    supabase.from('requirements')
      .select('id, title')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase.from('requirement_delivery_items')
      .select('requirement_id, delivery_item_id')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId),
    supabase.from('requirement_evidence')
      .select('requirement_id, evidence_id')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId),
  ])
  if (requirementsError) throw requirementsError
  if (deliveryLinksError) throw deliveryLinksError
  if (evidenceLinksError) throw evidenceLinksError

  return (requirements ?? []).map((requirement) => ({
    requirementId: requirement.id,
    title: requirement.title,
    deliveryItemIds: (deliveryLinks ?? [])
      .filter((link) => link.requirement_id === requirement.id)
      .map((link) => link.delivery_item_id),
    evidenceIds: (evidenceLinks ?? [])
      .filter((link) => link.requirement_id === requirement.id)
      .map((link) => link.evidence_id),
  }))
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add features/delivery/queries/list-traceability.ts types/database.ts
git commit -m "feat(traceability): read requirement-to-delivery-item and requirement-to-evidence links"
```

---

### Task 4: Link and unlink actions

**Files:**
- Create: `features/delivery/actions/traceability.ts`

**Interfaces:**
- Consumes: `isUuid` from `@/lib/utils`, `getSessionContext` from `@/lib/auth/get-session-context`, `createServerSupabase` from `@/lib/supabase/server`.
- Produces: `type TraceabilityActionState = { error?: string; success?: string } | undefined`, `linkDeliveryItemAction`, `unlinkDeliveryItemAction`, `linkEvidenceAction`, `unlinkEvidenceAction` — each `(requirementId: string, previous: TraceabilityActionState, form: FormData) => Promise<TraceabilityActionState>`, consumed by Task 5's panel via `.bind(null, requirementId)`.

- [ ] **Step 1: Write the actions**

Create `features/delivery/actions/traceability.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type TraceabilityActionState = { error?: string; success?: string } | undefined

async function context() {
  const { organization } = await getSessionContext()
  return { organization, supabase: (await createServerSupabase()) as any }
}

/**
 * Reads the requirement's own project_id from the database rather than
 * trusting the form for it -- the same reasoning create-project-dependency.ts
 * uses for the prerequisite's framework_id: a value the caller cannot
 * influence is one fewer to validate, and the composite foreign keys would
 * refuse a mismatch anyway.
 */
async function requirementProject(supabase: any, organizationId: string, requirementId: string) {
  const { data, error } = await supabase.from('requirements')
    .select('project_id').eq('id', requirementId).eq('organization_id', organizationId).maybeSingle()
  if (error || !data) return null
  return data.project_id as string
}

export async function linkDeliveryItemAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const deliveryItemId = String(form.get('deliveryItemId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(deliveryItemId)) return { error: 'Choose a valid delivery item.' }

  const { organization, supabase } = await context()
  const projectId = await requirementProject(supabase, organization.id, requirementId)
  if (!projectId) return { error: 'That requirement no longer exists, or is not yours.' }

  const { error } = await supabase.from('requirement_delivery_items').insert({
    organization_id: organization.id,
    project_id: projectId,
    requirement_id: requirementId,
    delivery_item_id: deliveryItemId,
  })
  if (error?.code === '23505') return { error: 'That delivery item is already linked.' }
  if (error) return { error: 'That delivery item could not be linked.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Delivery item linked.' }
}

export async function unlinkDeliveryItemAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const deliveryItemId = String(form.get('deliveryItemId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(deliveryItemId)) return { error: 'That link could not be removed.' }

  const { organization, supabase } = await context()
  const { data, error } = await supabase.from('requirement_delivery_items')
    .delete()
    .eq('requirement_id', requirementId).eq('delivery_item_id', deliveryItemId).eq('organization_id', organization.id)
    .select('project_id')
  if (error) return { error: 'That link could not be removed.' }
  if (!data || data.length === 0) return { error: 'That link no longer exists, or is not yours.' }

  revalidatePath(`/operations/projects/${data[0].project_id}`)
  return { success: 'Delivery item unlinked.' }
}

export async function linkEvidenceAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const evidenceId = String(form.get('evidenceId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(evidenceId)) return { error: 'Choose a valid evidence record.' }

  const { organization, supabase } = await context()
  const projectId = await requirementProject(supabase, organization.id, requirementId)
  if (!projectId) return { error: 'That requirement no longer exists, or is not yours.' }

  const { error } = await supabase.from('requirement_evidence').insert({
    organization_id: organization.id,
    project_id: projectId,
    requirement_id: requirementId,
    evidence_id: evidenceId,
  })
  if (error?.code === '23505') return { error: 'That evidence is already linked.' }
  if (error) return { error: 'That evidence could not be linked.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Evidence linked.' }
}

export async function unlinkEvidenceAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const evidenceId = String(form.get('evidenceId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(evidenceId)) return { error: 'That link could not be removed.' }

  const { organization, supabase } = await context()
  const { data, error } = await supabase.from('requirement_evidence')
    .delete()
    .eq('requirement_id', requirementId).eq('evidence_id', evidenceId).eq('organization_id', organization.id)
    .select('project_id')
  if (error) return { error: 'That link could not be removed.' }
  if (!data || data.length === 0) return { error: 'That link no longer exists, or is not yours.' }

  revalidatePath(`/operations/projects/${data[0].project_id}`)
  return { success: 'Evidence unlinked.' }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add features/delivery/actions/traceability.ts
git commit -m "feat(traceability): link and unlink actions for delivery items and evidence"
```

---

### Task 5: The Traceability tab

**Files:**
- Create: `features/delivery/components/project-traceability-panel.tsx`
- Modify: `features/delivery/components/project-detail-screen.tsx`, `app/(unison)/operations/projects/[projectId]/page.tsx`, `tests/unit/ui-completeness.test.ts`, `docs/follow-ups.md`

**Interfaces:**
- Consumes: `TraceabilityRow` and `listTraceability` from Task 3; the four actions from Task 4; `deriveCoverage` and `unlinkedOptions` from Task 2; `DeliveryItemNode` from `../queries/list-delivery-items` (already exists); `ProjectGovernance` from `../queries/get-project-governance` (already exists).

- [ ] **Step 1: Read the patterns**

Read `features/delivery/components/project-requirements-panel.tsx` in full — this panel's `useActionState` wiring and error-display pattern follows it closely, including the fix in [features/delivery/components/project-requirements-panel.tsx](../../../features/delivery/components/project-requirements-panel.tsx) where a form must not silently reset a value visible elsewhere. Nothing here toggles an edit mode, so that specific fix does not apply, but the same `Feedback`-style error rendering (a visible `<p role="alert">`, never `sr-only`) does.

- [ ] **Step 2: Build the panel**

Create `features/delivery/components/project-traceability-panel.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  linkDeliveryItemAction,
  linkEvidenceAction,
  unlinkDeliveryItemAction,
  unlinkEvidenceAction,
  type TraceabilityActionState,
} from "../actions/traceability";
import { deriveCoverage, unlinkedOptions, type Coverage } from "../traceability-options";
import type { DeliveryItemNode } from "../queries/list-delivery-items";
import type { TraceabilityRow } from "../queries/list-traceability";
import { SectionCard } from "./delivery-primitives";

type Option = { id: string; name: string };
type FieldName = "deliveryItemId" | "evidenceId";
type LinkAction = (
  requirementId: string,
  previous: TraceabilityActionState,
  form: FormData,
) => Promise<TraceabilityActionState>;

const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand";

// Mirrors the three Coverage values in traceability-options.ts. Restated here
// rather than computed, since a lookup table is clearer than branching CSS.
const badgeClass: Record<Coverage, string> = {
  "Not linked": "bg-muted text-muted-foreground",
  Built: "bg-brand/10 text-brand",
  Verified: "bg-success/10 text-success",
};

export function ProjectTraceabilityPanel({
  traceability,
  deliveryItems,
  evidence,
}: {
  traceability: TraceabilityRow[];
  deliveryItems: DeliveryItemNode[];
  evidence: Option[];
}) {
  const allDeliveryItems: Option[] = deliveryItems.flatMap((item) => [
    { id: item.id, name: item.name },
    ...item.children.map((child) => ({ id: child.id, name: child.name })),
  ]);
  const deliveryItemNames = new Map(allDeliveryItems.map((item) => [item.id, item.name]));
  const evidenceNames = new Map(evidence.map((item) => [item.id, item.name]));

  return (
    <SectionCard
      title="Traceability"
      description="Which delivery items build each requirement, and what evidence verifies it"
    >
      {traceability.length ? (
        <div className="divide-y divide-border">
          {traceability.map((row) => {
            const coverage = deriveCoverage(row.deliveryItemIds.length, row.evidenceIds.length);
            return (
              <div key={row.requirementId} className="grid gap-4 p-5 md:grid-cols-2">
                <div className="flex items-center justify-between md:col-span-2">
                  <h3 className="text-sm font-semibold">{row.title}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass[coverage]}`}>
                    {coverage}
                  </span>
                </div>
                <LinkedItems
                  label="Delivery items"
                  requirementId={row.requirementId}
                  linkedIds={row.deliveryItemIds}
                  names={deliveryItemNames}
                  options={unlinkedOptions(allDeliveryItems, row.deliveryItemIds)}
                  fieldName="deliveryItemId"
                  linkAction={linkDeliveryItemAction}
                  unlinkAction={unlinkDeliveryItemAction}
                  emptyLabel="No delivery items linked"
                  addLabel="Add delivery item"
                />
                <LinkedItems
                  label="Evidence"
                  requirementId={row.requirementId}
                  linkedIds={row.evidenceIds}
                  names={evidenceNames}
                  options={unlinkedOptions(evidence, row.evidenceIds)}
                  fieldName="evidenceId"
                  linkAction={linkEvidenceAction}
                  unlinkAction={unlinkEvidenceAction}
                  emptyLabel="No evidence linked"
                  addLabel="Add evidence"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No requirements recorded</p>
      )}
    </SectionCard>
  );
}

function LinkedItems({
  label,
  requirementId,
  linkedIds,
  names,
  options,
  fieldName,
  linkAction,
  unlinkAction,
  emptyLabel,
  addLabel,
}: {
  label: string;
  requirementId: string;
  linkedIds: string[];
  names: Map<string, string>;
  options: Option[];
  fieldName: FieldName;
  linkAction: LinkAction;
  unlinkAction: LinkAction;
  emptyLabel: string;
  addLabel: string;
}) {
  const [linkState, linkFormAction, linkPending] = useActionState(
    linkAction.bind(null, requirementId),
    undefined,
  );
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{label}</h4>
      <ul className="mt-2 space-y-1">
        {linkedIds.length ? (
          linkedIds.map((id) => (
            <UnlinkRow
              key={id}
              requirementId={requirementId}
              targetId={id}
              name={names.get(id) ?? "Unknown"}
              fieldName={fieldName}
              unlinkAction={unlinkAction}
            />
          ))
        ) : (
          <li className="text-sm text-muted-foreground">{emptyLabel}</li>
        )}
      </ul>
      {options.length ? (
        <form action={linkFormAction} className="mt-2 flex gap-2">
          <select name={fieldName} required defaultValue="" className={input}>
            <option value="" disabled>
              {addLabel}
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <button
            disabled={linkPending}
            className="shrink-0 border border-border px-3 py-1.5 text-xs font-semibold"
          >
            Link
          </button>
        </form>
      ) : null}
      {linkState?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {linkState.error}
        </p>
      ) : null}
    </div>
  );
}

function UnlinkRow({
  requirementId,
  targetId,
  name,
  fieldName,
  unlinkAction,
}: {
  requirementId: string;
  targetId: string;
  name: string;
  fieldName: FieldName;
  unlinkAction: LinkAction;
}) {
  const [state, action, pending] = useActionState(unlinkAction.bind(null, requirementId), undefined);
  return (
    <li className="text-sm">
      <form action={action} className="flex items-center justify-between gap-2">
        <input type="hidden" name={fieldName} value={targetId} />
        <span>{name}</span>
        <button type="submit" disabled={pending} className="text-xs font-semibold text-destructive">
          Unlink
        </button>
      </form>
      {state?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 3: Add the tab**

In `features/delivery/components/project-detail-screen.tsx`:

Change the tabs array:

```tsx
const tabs = ["Overview", "Framework", "Delivery", "Governance", "Dependencies", "Requirements", "Traceability"] as const;
```

Add the import:

```tsx
import { ProjectTraceabilityPanel } from "./project-traceability-panel";
import type { TraceabilityRow } from "../queries/list-traceability";
```

Extend the screen's props — both the destructured parameter list and its type — to take `traceability`:

```tsx
export function ProjectDetailScreen({
  project,
  items,
  labels,
  dependsOn,
  dependedOnBy,
  governance,
  requirements,
  traceability,
  members,
}: {
  project: ProjectDetail;
  items: DeliveryItemNode[];
  labels: { level1Label: string | null; level2Label: string | null };
  dependsOn: DependencyRow[];
  dependedOnBy: DependencyRow[];
  governance: Awaited<ReturnType<typeof getProjectGovernance>>;
  requirements: RequirementRow[];
  traceability: TraceabilityRow[];
  members: OrganizationMember[];
}) {
```

Then change the final `else` branch (currently the unconditional `ProjectRequirementsPanel` fallback) to an explicit `"Requirements"` branch with `"Traceability"` as the new fallback:

```tsx
        ) : activeTab === "Requirements" ? (
          <ProjectRequirementsPanel
            projectId={project.id}
            requirements={requirements}
            members={members}
          />
        ) : (
          <ProjectTraceabilityPanel
            traceability={traceability}
            deliveryItems={items}
            evidence={governance.artefacts}
          />
        )}
```

- [ ] **Step 4: Wire the page**

In `app/(unison)/operations/projects/[projectId]/page.tsx`:

Add the import:

```ts
import { listTraceability } from "@/features/delivery/queries/list-traceability";
```

Add `listTraceability(projectId)` to the existing `Promise.all` alongside the other five independent fetches, and pass the result through:

```ts
  const [items, { dependsOn, dependedOnBy }, governance, members, requirements, traceability] =
    await Promise.all([
      listDeliveryItems(projectId),
      listProjectDependencies(projectId),
      getProjectGovernance(projectId),
      listOrganizationMembers(),
      listRequirements(projectId),
      listTraceability(projectId),
    ]);
```

```tsx
    <ProjectDetailScreen
      items={items}
      labels={labels}
      dependsOn={dependsOn}
      dependedOnBy={dependedOnBy}
      governance={governance}
      requirements={requirements}
      traceability={traceability}
      members={members}
```

- [ ] **Step 5: Write the guard test**

Add to `tests/unit/ui-completeness.test.ts` (read its existing pattern first — it already asserts source-derived facts about other panels the same way):

```ts
test('the traceability panel filters already-linked options rather than offering a raw list', () => {
  const panel = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-traceability-panel.tsx'), 'utf8')
  assert.match(panel, /unlinkedOptions/, 'the add pickers must filter out options already linked to the requirement')
})
```

- [ ] **Step 6: Prove it**

Temporarily replace one `unlinkedOptions(...)` call in `project-traceability-panel.tsx` with its raw first argument (e.g. `options={allDeliveryItems}` instead of `options={unlinkedOptions(allDeliveryItems, row.deliveryItemIds)}`), run the new test, confirm it fails, restore it, confirm it passes again. Paste the real failure and pass output into the task report.

- [ ] **Step 7: Record follow-ups**

Append to `docs/follow-ups.md`, under a new heading for this slice:

- **Traceability only offers project-scoped evidence as linkable** — `governance_artefacts` rows scoped to a framework or an approval rather than a project have no project to pin the link's composite foreign key to, and are structurally unlinkable here, not merely unoffered by the UI. A future need to trace against framework-level evidence is a separate design question.
- **No coverage rollup or percentage view exists yet** — Traceability shows a per-requirement badge only. An aggregate dashboard is a real, separate feature to build once the per-requirement mechanics here are validated in the pilot.

- [ ] **Step 8: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes including the new guard test; build clean.

```bash
git add features/delivery/components/project-traceability-panel.tsx features/delivery/components/project-detail-screen.tsx "app/(unison)/operations/projects/[projectId]/page.tsx" tests/unit/ui-completeness.test.ts docs/follow-ups.md
git commit -m "feat(traceability): a Traceability tab with coverage badges and link/unlink controls"
```

- [ ] **Step 9: Signed-in verification**

Controller-run, against `unison-uat` (production) — reuse an existing project with at least one requirement, one delivery item and one evidence record, or create the minimum needed through the UI. Do not insert fixtures via SQL.

- [ ] Open the Traceability tab; confirm every requirement on the project is listed, each showing "Not linked" if it has no links yet.
- [ ] Link a delivery item to a requirement; confirm it appears under "Delivery items" and the badge changes to "Built".
- [ ] Link evidence to the same requirement; confirm it appears under "Evidence" and the badge changes to "Verified".
- [ ] Unlink the evidence; confirm the badge returns to "Built", not "Not linked" (the delivery item link must still hold).
- [ ] Unlink the delivery item; confirm the badge returns to "Not linked".
- [ ] Confirm a delivery item or evidence record from a different project in the same organisation is never offered in either "Add" picker.
- [ ] Check `preview_logs` for anything unexpected, then remove every link created for this verification (unlink through the UI; do not leave test links in production).
