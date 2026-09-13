# Integrations (Azure DevOps / Jira)

**Date:** 2026-09-13
**Status:** Approved, ready for planning
**Build order:** `docs/product-definition.md` §18, item 6 — the last item, after
Traceability.

## Why

`docs/product-principles.md` §5: *"Do not require duplication of what Azure
DevOps, Jira... already hold. Consume through integration rather than making
users maintain it twice."* Today nothing in UNISON connects a delivery item
to the real work item that tracks it elsewhere — a PM working in Azure DevOps
or Jira has no way to say "this is the same thing" without falling back to a
note in the description field.

`delivery_items` already anticipated this: its original migration
(`20260906150000_delivery_items.sql`) added `source_system text` and
`external_reference text` with the comment "Plumbing for later external
identity mapping. Null throughout the pilot, invisible to users, claims
nothing." Both columns are completely unused today — no query, action, or UI
anywhere in the codebase reads or writes either. This slice is what "later"
was waiting for.

## Naming disambiguation

A settings page already exists at `/settings/integrations`
(`features/platform-automation`), backed by `public.integration_connections`
— a generic organisation-level webhook/connection framework (a provider
name, an `event_key`, a hashed secret, an event log). It is unrelated to this
slice: different purpose (outbound automation triggers vs. inbound reference
data), different scope (organisation-wide vs. per-delivery-item), and it is
not touched by anything here.

## Scope

**In:** a delivery item can optionally record a reference to the external
work item that tracks it — which system, a reference/ID, and a URL to open
it directly. Entered and edited manually by the PM through the existing
delivery item form. Displayed on the delivery items panel as a small link
(or plain text, if no URL is set).

**Out:**

- **No OAuth, no API tokens, no live API calls to Azure DevOps or Jira.**
  Neither has scaffolding in this codebase today (confirmed: no env var, no
  client library reference, no existing connection anywhere), and building
  real API infrastructure before there is a real account to connect to would
  be exactly the "speculative sophistication" §18 warns against.
- **No sync, no polling, no webhooks receiving updates from either system.**
  The reference is a manually-maintained pointer, not a live mirror. If the
  external item's status changes, nothing in UNISON knows until a PM updates
  it — that gap is accepted for this slice, not solved by it.
- **No format validation of the reference itself** (e.g. checking a Jira key
  looks like `ABC-123`, or an Azure DevOps id is numeric). `external_reference`
  stays free text; the two systems' id formats are not this slice's business
  to encode.
- **No reference on requirements or projects.** Delivery items only, matching
  the product's own stated example (`Feature: Document Upload` — a delivery
  item — mapping to one external work item, §8).
- **Nothing added to or changed in `integration_connections` /
  `features/platform-automation`.** See disambiguation above.

## Schema

One additive migration. Two of the three columns already exist and are
already nullable; this slice adds the third and one check constraint:

```sql
alter table public.delivery_items
  add column external_url text;

alter table public.delivery_items
  add constraint delivery_items_source_system_check
  check (source_system is null or source_system in ('Azure DevOps', 'Jira'));
```

`source_system`, `external_reference`, and `external_url` are all
independently nullable — no cross-field requirement. A PM can fill in just a
system and reference with no link, just a URL with no system named, all
three, or none. Forcing "all or nothing" would reject real partial states
(a PM who has the ticket number but hasn't found the link yet) for no stated
benefit.

`source_system`'s vocabulary is constrained to exactly the two named systems
this build item scopes to. Widening it (a third tracker, or free-text
"Other") is a real, separate decision for whenever a pilot org actually asks
for it — not pre-empted here, matching how Requirements' priority/status
vocabularies were kept to only what was already established.

No RLS change: these are plain columns on an existing RLS-covered table, and
column content is not a tenancy concern the existing `delivery_items` policies
don't already handle.

## UI

Extends the existing shared `DeliveryItemForm`
(`features/delivery/components/delivery-item-form.tsx`, used for both create
and edit) with three new fields in a new "External reference" section:

- **System** — a `SelectField` offering "Azure DevOps", "Jira", and an empty
  "— None —" option, matching `SOURCE_SYSTEMS` (a new constant beside
  `DELIVERY_ITEM_STATUSES`/`DELIVERY_ITEM_HEALTHS` in
  `features/delivery/schemas/delivery-item.ts`).
- **Reference** — a plain `TextField` (e.g. a work item number or issue key).
- **URL** — a `TextField`, validated as a well-formed HTTPS URL when
  non-empty, following the exact convention `createArtefactAction`
  (`features/delivery/actions/project-governance.ts`) already uses for
  evidence URLs: parse with `new URL(...)`, reject a non-`https:` protocol,
  return a friendly error rather than a raw parse exception.

On `delivery-items-panel.tsx`, a row with a reference shows it as a small
clickable link when `external_url` is set (e.g. "Jira · PROJ-56 ↗", opening
in a new tab, mirroring how evidence links render in
`project-governance-panel.tsx`), or as plain text ("Jira · PROJ-56") when
only the system and reference are filled in with no URL. A row with no
reference shows nothing extra — no placeholder, no "not linked" badge; an
absent field stays absent, matching this codebase's convention everywhere
else on this screen.

## Data flow

`deliveryItemInputSchema` (`features/delivery/schemas/delivery-item.ts`)
gains three new optional fields:

```ts
export const SOURCE_SYSTEMS = ['Azure DevOps', 'Jira'] as const

// in deliveryItemInputSchema:
sourceSystem: z.enum(SOURCE_SYSTEMS).optional().or(z.literal('')).transform((value) => value || null),
externalReference: optionalText,
externalUrl: z.string().trim().optional().or(z.literal('')).transform((value) => value || null)
  .refine((value) => value === null || isHttpsUrl(value), 'Enter a valid HTTPS URL.'),
```

`isHttpsUrl` does not exist yet — it is a new, small helper alongside
`isValidIsoDate` in `features/delivery/schemas/date.ts`'s sibling pattern
(a new `features/delivery/schemas/url.ts`), wrapping the exact
`new URL(...)` / non-`https:` check `createArtefactAction` already performs
inline, so the same rule is expressed once and reused, not copied a third
time.

feeding straight into `create-delivery-item.ts`'s insert payload and
`update-delivery-item.ts`'s update payload alongside the fields already
there — no new action, no new query file. `list-delivery-items.ts` already
selects `select('id, level, parent_id, name, ...')` as an explicit column
list (not `select('*')`), so it needs the three new column names added to
that list and to the row mapper, or the panel will never see them.

## Testing

Extend `tests/unit/delivery-item-schema.test.ts` with cases for the three
new fields: a valid system is accepted, an invalid system string is
rejected, a non-HTTPS URL is rejected with the friendly message (not a raw
exception), and leaving all three blank is valid (matches the "claims
nothing" default every other optional field on this schema already has).

No new RLS test: no new table, no new policy, and column content is outside
what `tests/integration/rls/delivery-items.test.ts` exists to prove.

## Success criteria

A PM can open a delivery item's edit form, pick "Jira" as the system, enter
an issue key and a link, save, and see a clickable reference on the delivery
items panel. Leaving all three fields blank changes nothing about how the
item displays today. A non-HTTPS URL is refused with a message a PM can act
on, not a database error. `pnpm typecheck`, `pnpm test` and `pnpm build`
green from a clean tree; no `pnpm test:rls` change needed since no RLS
surface changed.

## Global constraints

- No live API integration with Azure DevOps or Jira in this slice — manual
  reference only.
- `source_system`'s vocabulary is fixed to exactly `('Azure DevOps', 'Jira')`
  for now; widening it is a future, separate decision.
- The existing `integration_connections` / `features/platform-automation`
  system is untouched by this slice.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not
  be modified.
