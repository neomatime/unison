# Integrations (Azure DevOps / Jira) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a PM record which external system (Azure DevOps or Jira), reference/ID, and URL tracks a delivery item, entered manually through the existing delivery item form.

**Architecture:** Two of the three needed columns already exist on `delivery_items` (`source_system`, `external_reference`), unused since the table's original build. This adds the third column (`external_url`) and a check constraint, extends the existing zod schema and a new small URL-validation helper, threads three optional fields through the existing create/update actions and read query, and adds three fields plus a display row to the existing delivery item form and panel. No new tables, no new RLS surface, no live API calls.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, Supabase Postgres 17, Zod, Node's built-in test runner.

## Global Constraints

- No OAuth, no API tokens, no live calls to Azure DevOps or Jira in this slice — manual reference only.
- `source_system` is constrained to exactly `('Azure DevOps', 'Jira')` for now; widening it is a future, separate decision.
- The existing `integration_connections` / `features/platform-automation` system is untouched.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Full spec: `docs/superpowers/specs/2026-09-13-integrations-design.md`.

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/20260913120000_delivery_item_external_reference.sql`
- Modify: `types/database.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: `delivery_items.external_url text` (nullable) and constraint `delivery_items_source_system_check`, consumed by Task 3's query and actions.

- [ ] **Step 1: Write the migration**

```sql
-- The other two columns this slice needs already exist, unused since the
-- table's original build (20260906150000_delivery_items.sql): "Plumbing for
-- later external identity mapping. Null throughout the pilot, invisible to
-- users, claims nothing." This is that later. See
-- docs/superpowers/specs/2026-09-13-integrations-design.md.
alter table public.delivery_items
  add column external_url text;

alter table public.delivery_items
  add constraint delivery_items_source_system_check
  check (source_system is null or source_system in ('Azure DevOps', 'Jira'));

comment on column public.delivery_items.source_system is
  'Which external tracker this item maps to, or null. Constrained to (''Azure DevOps'', ''Jira'') -- see delivery_items_source_system_check.';
comment on column public.delivery_items.external_reference is
  'The external tracker''s own id/key for this item (e.g. a work item number or issue key). Free text: no format is enforced.';
comment on column public.delivery_items.external_url is
  'A direct link to the item in its external tracker, or null. All three of source_system/external_reference/external_url are independently optional -- no cross-field requirement.';
```

Apply it with the Supabase MCP tool `apply_migration` against `unison-uat` — this project's only Supabase project, which is production; there is no separate staging database.

- [ ] **Step 2: Regenerate database types**

Run the Supabase MCP tool `generate_typescript_types` against `unison-uat` and overwrite `types/database.ts` with its output verbatim. Do **not** hand-edit this file — a previous task in this codebase did that once for a different table, it silently failed to typecheck on a fresh checkout, and had to be redone this way. Confirm afterward that `types/database.ts`'s `delivery_items` row type includes `external_url`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260913120000_delivery_item_external_reference.sql types/database.ts
git commit -m "feat(delivery-items): add external_url and constrain source_system"
```

---

### Task 2: Validation

**Files:**
- Create: `features/delivery/schemas/url.ts`
- Modify: `features/delivery/schemas/delivery-item.ts`
- Test: `tests/unit/delivery-item-schema.test.ts` (existing file, extended)

**Interfaces:**
- Produces: `isHttpsUrl(value: string): boolean` from `features/delivery/schemas/url.ts`; `SOURCE_SYSTEMS` and three new fields (`sourceSystem`, `externalReference`, `externalUrl`) on `deliveryItemInputSchema`'s output, consumed by Task 3's actions.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/delivery-item-schema.test.ts` (the file already imports `deliveryItemInputSchema` and `dateBase` — reuse both):

```ts
import { SOURCE_SYSTEMS } from '../../features/delivery/schemas/delivery-item.ts'
import { isHttpsUrl } from '../../features/delivery/schemas/url.ts'

test('the two named external systems are Azure DevOps and Jira, nothing else', () => {
  assert.deepEqual([...SOURCE_SYSTEMS], ['Azure DevOps', 'Jira'])
})

test('isHttpsUrl accepts an https url and refuses everything else', () => {
  assert.equal(isHttpsUrl('https://dev.azure.com/org/project/_workitems/edit/123'), true)
  assert.equal(isHttpsUrl('http://dev.azure.com/org/project/_workitems/edit/123'), false)
  assert.equal(isHttpsUrl('not a url'), false)
  assert.equal(isHttpsUrl(''), false)
})

test('a blank source system, reference and url all parse to null', () => {
  const result = deliveryItemInputSchema.safeParse({ ...dateBase, sourceSystem: '', externalReference: '', externalUrl: '' })
  assert.equal(result.success, true)
  assert.equal(result.data!.sourceSystem, null)
  assert.equal(result.data!.externalReference, null)
  assert.equal(result.data!.externalUrl, null)
})

test('a valid source system and reference parse through unchanged', () => {
  const result = deliveryItemInputSchema.safeParse({ ...dateBase, sourceSystem: 'Jira', externalReference: 'PROJ-56' })
  assert.equal(result.success, true)
  assert.equal(result.data!.sourceSystem, 'Jira')
  assert.equal(result.data!.externalReference, 'PROJ-56')
})

test('a source system outside the fixed vocabulary is rejected', () => {
  const result = deliveryItemInputSchema.safeParse({ ...dateBase, sourceSystem: 'Trello' })
  assert.equal(result.success, false)
})

test('a non-https external url is rejected with a field error, not a throw', () => {
  let result
  assert.doesNotThrow(() => {
    result = deliveryItemInputSchema.safeParse({ ...dateBase, externalUrl: 'http://example.com/1' })
  })
  assert.equal(result!.success, false)
})

test('a well-formed https external url parses through unchanged', () => {
  const result = deliveryItemInputSchema.safeParse({ ...dateBase, externalUrl: 'https://example.atlassian.net/browse/PROJ-56' })
  assert.equal(result.success, true)
  assert.equal(result.data!.externalUrl, 'https://example.atlassian.net/browse/PROJ-56')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/unit/delivery-item-schema.test.ts`
Expected: FAIL — `features/delivery/schemas/url.ts` does not exist yet, and `deliveryItemInputSchema` does not yet accept `sourceSystem`/`externalReference`/`externalUrl`.

- [ ] **Step 3: Write the URL helper**

Create `features/delivery/schemas/url.ts`:

```ts
// The exact rule createArtefactAction (features/delivery/actions/project-governance.ts)
// already enforces inline for evidence URLs, extracted so this schema and any
// future one express it once rather than copying the try/catch a third time.
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Extend the delivery item schema**

In `features/delivery/schemas/delivery-item.ts`, add the import and the new export near the top (alongside `DELIVERY_ITEM_STATUSES`/`DELIVERY_ITEM_HEALTHS`):

```ts
import { isHttpsUrl } from './url.ts'

/** The two tracking systems this slice names. Widening this is a future, separate decision. */
export const SOURCE_SYSTEMS = ['Azure DevOps', 'Jira'] as const
```

Add three fields to `deliveryItemInputSchema`'s object (after `targetDate: optionalDate,`):

```ts
  sourceSystem: z.enum(SOURCE_SYSTEMS).optional().or(z.literal('')).transform((value) => value || null),
  externalReference: optionalText,
  externalUrl: z.string().trim().optional().or(z.literal('')).transform((value) => value || null)
    .refine((value) => value === null || isHttpsUrl(value), 'Enter a valid HTTPS URL.'),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types tests/unit/delivery-item-schema.test.ts`
Expected: PASS, all tests including the 7 new ones.

- [ ] **Step 6: Commit**

```bash
git add features/delivery/schemas/url.ts features/delivery/schemas/delivery-item.ts tests/unit/delivery-item-schema.test.ts
git commit -m "feat(delivery-items): validate source system and https external url"
```

---

### Task 3: Wire the fields through and display them

**Files:**
- Modify: `features/delivery/delivery-item-tree.ts`
- Modify: `features/delivery/queries/list-delivery-items.ts`
- Modify: `features/delivery/actions/create-delivery-item.ts`
- Modify: `features/delivery/actions/update-delivery-item.ts`
- Modify: `features/delivery/components/delivery-item-form.tsx`
- Modify: `features/delivery/components/delivery-items-panel.tsx`
- Modify: `app/(unison)/operations/projects/[projectId]/delivery-items/[itemId]/edit/page.tsx`

**Interfaces:**
- Consumes: `SOURCE_SYSTEMS` and the three new `deliveryItemInputSchema` fields from Task 2.
- Produces: `DeliveryItem.sourceSystem`/`externalReference`/`externalUrl` (all `string | null`), read by the panel and the edit page.

- [ ] **Step 1: Extend the `DeliveryItem` type**

In `features/delivery/delivery-item-tree.ts`, add three fields to the `DeliveryItem` type (after `archivedAt: string | null`):

```ts
  /** Which external tracker this item maps to, or null. One of SOURCE_SYSTEMS. */
  sourceSystem: string | null
  /** The external tracker's own id/key for this item, or null. Free text. */
  externalReference: string | null
  /** A direct link to the item in its external tracker, or null. */
  externalUrl: string | null
```

- [ ] **Step 2: Read the new columns**

In `features/delivery/queries/list-delivery-items.ts`, add the three column names to the `.select(...)` string (after `current_phase_id`, before the `framework_phases(...)` embed):

```ts
      .select('id, level, parent_id, name, description, owner_id, status, health, start_date, target_date, archived_at, current_phase_id, source_system, external_reference, external_url, framework_phases(name, archived_at)')
```

Add three fields to the `map` function's returned object (after `archivedAt: row.archived_at,`):

```ts
    sourceSystem: row.source_system,
    externalReference: row.external_reference,
    externalUrl: row.external_url,
```

- [ ] **Step 3: Write the new fields on create**

In `features/delivery/actions/create-delivery-item.ts`, add three fields to the `.insert({...})` object (after `target_date: parsed.data.targetDate,`):

```ts
    source_system: parsed.data.sourceSystem,
    external_reference: parsed.data.externalReference,
    external_url: parsed.data.externalUrl,
```

- [ ] **Step 4: Write the new fields on update**

In `features/delivery/actions/update-delivery-item.ts`, add three fields to the `.update({...})` object (after `target_date: parsed.data.targetDate,`):

```ts
    source_system: parsed.data.sourceSystem,
    external_reference: parsed.data.externalReference,
    external_url: parsed.data.externalUrl,
```

- [ ] **Step 5: Add the form fields**

In `features/delivery/components/delivery-item-form.tsx`:

Add the import (alongside the existing `DELIVERY_ITEM_HEALTHS, DELIVERY_ITEM_STATUSES` import):

```ts
import { DELIVERY_ITEM_HEALTHS, DELIVERY_ITEM_STATUSES, SOURCE_SYSTEMS } from '../schemas/delivery-item'
```

Add three fields to `DeliveryItemFormValues` (after `targetDate: string | null`):

```ts
  sourceSystem: string | null
  externalReference: string | null
  externalUrl: string | null
```

Add a new section after the existing `<div className="grid gap-4 sm:grid-cols-2">...</div>` block, before `<FormError message={state?.error} />`:

```tsx
      <div className="grid gap-4 sm:grid-cols-2">
        {/* EntitySelectField reused for a plain-string choice, not an entity
            picker: SOURCE_SYSTEMS mapped to {id, name} pairs where both are
            the same string. There is exactly one optional plain-string select
            in this codebase so far, so this is a reuse rather than a new
            shared field component -- see the spec's UI section. */}
        <EntitySelectField
          name="sourceSystem"
          label="External system"
          options={SOURCE_SYSTEMS.map((system) => ({ id: system, name: system }))}
          defaultValue={item?.sourceSystem}
          emptyLabel="— None —"
        />
        <TextField name="externalReference" label="Reference / ID" defaultValue={item?.externalReference} placeholder="e.g. PROJ-56" />
        <TextField name="externalUrl" label="URL" type="url" defaultValue={item?.externalUrl} placeholder="https://…" className="sm:col-span-2" />
      </div>
```

- [ ] **Step 6: Wire the edit page**

In `app/(unison)/operations/projects/[projectId]/delivery-items/[itemId]/edit/page.tsx`, add three fields to the `item={{...}}` object passed to `DeliveryItemForm` (after `targetDate: item.targetDate`):

```ts
item={{ name: item.name, description: item.description, ownerId: item.ownerId, status: item.status, health: item.health, currentPhaseId: item.currentPhaseId, startDate: item.startDate, targetDate: item.targetDate, sourceSystem: item.sourceSystem, externalReference: item.externalReference, externalUrl: item.externalUrl }}
```

- [ ] **Step 7: Display the reference on the panel**

In `features/delivery/components/delivery-items-panel.tsx`, add this function above the component that builds `sections` (the one containing `['Owner', item.ownerName]` etc.):

```tsx
// Always included in `sections`, matching how 'Current phase' and 'Target
// date' already render an em dash rather than omitting their row when
// unset -- an absent external reference reads the same way, not as a
// special "not linked" case. Exported so the delivery item's own detail
// page can render the same value with its own empty-state convention.
export function externalReferenceValue(item: DeliveryItem, emptyLabel: ReactNode = '—'): ReactNode {
  const label = [item.sourceSystem, item.externalReference].filter(Boolean).join(' · ')
  if (!label && !item.externalUrl) return emptyLabel
  if (!item.externalUrl) return label
  return (
    <a href={item.externalUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">
      {label || item.externalUrl}
    </a>
  )
}
```

Add one entry to the `sections` array (after `['Target date', item.targetDate ?? '—'],`):

```ts
    ['External reference', externalReferenceValue(item)],
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes (including Task 2's 7 new tests); build clean.

```bash
git add features/delivery/delivery-item-tree.ts features/delivery/queries/list-delivery-items.ts features/delivery/actions/create-delivery-item.ts features/delivery/actions/update-delivery-item.ts features/delivery/components/delivery-item-form.tsx features/delivery/components/delivery-items-panel.tsx "app/(unison)/operations/projects/[projectId]/delivery-items/[itemId]/edit/page.tsx"
git commit -m "feat(delivery-items): record and display an external tracker reference"
```

- [ ] **Step 9: Signed-in verification**

Controller-run, against `unison-uat` (production) — use an existing delivery item on any project, or create one through the UI if needed.

- [ ] Edit a delivery item, pick "Jira" as the external system, enter a reference (e.g. `PROJ-56`) and a `https://` URL, save; confirm the panel shows a clickable link reading "Jira · PROJ-56" that opens the URL in a new tab.
- [ ] Edit a different delivery item leaving all three fields blank; confirm its row shows "—" for External reference, same as an unset Target date.
- [ ] Try saving a non-`https://` URL (e.g. `http://example.com`); confirm the form shows "Enter a valid HTTPS URL." rather than a database error.
- [ ] Edit the first item again and clear all three fields; confirm the row reverts to "—" and nothing crashes.
- [ ] Check `preview_logs` for anything unexpected, then remove any test data you created for this verification.
