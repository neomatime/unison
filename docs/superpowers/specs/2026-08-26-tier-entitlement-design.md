# Tier entitlement and enforcement

**Date:** 2026-08-26
**Status:** Approved, ready for planning

## Why

UNISON sells four editions. `config/unison-tiers.ts` already encodes the three
standardised ones correctly — Core is the six Delivery modules plus Team,
Framework adds Clients and Onboarding, Enterprise adds Commercial and Finance —
and `lockedModuleIds` already matches the rule that Delivery and Team are in
every tier. Strategic Enterprise is the client-configured tier; it currently
receives the full Enterprise module set until the Strategic tenant-configuration
layer is implemented.

Nothing outside the internal provisioning screens reads any of it. There is no
tier column on `organizations`, `config/navigation.ts` builds one static sidebar
at import time, and no route checks anything. **A client sold UNISON Core signs
in and sees Finance and Commercial.** That is a billing correctness problem, not
a missing feature.

## Product rules this implements

Stated by the product owner, and already reflected in `unison-tiers.ts`:

- Core, Framework and Enterprise are fixed, standardised editions.
- Strategic Enterprise is the only tier configured per client, and its
  uniqueness comes from configuration — never a code fork or a bespoke build.
- All Delivery modules are in every tier. Team is in every tier and stays locked
  on.
- HR and Atlas are removed from the product.
- UNISON remains one multi-tenant application.

### Strategic Enterprise is not permanently equal to Enterprise

This slice gives Strategic Enterprise the same module set as Enterprise. That is
a **temporary implementation state, not a product rule.**

Strategic Enterprise currently receives the full Enterprise module set until the
Strategic tenant-configuration layer is implemented. Once it exists, a Strategic
tenant's modules — and later its workflows, frameworks, governance rules, roles,
permissions, integrations and organisation structure — come from that tenant's
own configuration rather than from a fixed tier map.

Nothing in this slice may encode "Strategic equals Enterprise" as a permanent
fact. The wording must survive being read a year from now by someone deciding
whether a Strategic client can differ: the answer is yes, and the reason it does
not differ today is that the layer which would let it does not exist yet.

That constraint applies to the spec, to `config/unison-tiers.ts`, and to the
tests, all of which must say *currently* rather than state an equality.

Architecture principle: **tier entitlement → tenant configuration / module
activation → user permissions.** This spec builds the first layer and the
enforcement that makes it real.

## Scope

**In scope:** a tier on every organisation, written at provisioning; navigation
derived per tenant; route guards on every module that a tier can withhold; a
page explaining why a module is unavailable.

**Out of scope, deliberately:** changing a tenant's tier from the UI, per-module
activation toggles for Strategic Enterprise, downgrade flows, and billing. A
tier can be changed by a platform operator directly against the database until
the tier-change slice lands.

### Why there is no `organization_modules` table yet

The original intent was to store both the tier and a per-tenant activated module
set, constrained so only Strategic Enterprise may deviate from its tier's
entitlement. That table's only consumer is Strategic Enterprise, which is out of
scope here — and the constraint is the expensive part: enforcing "the set must
equal the tier's entitlement" in Postgres means encoding the tier→module map in
SQL as well as in `config/unison-tiers.ts`, creating two sources of truth that
can drift without anything noticing.

So the set is derived from the tier by `getEntitledModuleIds`, which already
exists and already matches the product rules. The activation table arrives with
the Strategic slice, alongside the constraint and a real consumer, at the moment
the rule becomes possible to violate. Until then it holds by construction.

## Data model

```sql
alter table public.organizations
  add column tier text not null default 'core'
  check (tier in ('core', 'framework', 'enterprise', 'strategic-enterprise'));
```

One column. `default 'core'` is deliberate: an organisation whose tier was never
set gets the smallest entitlement rather than the largest, so a mistake withholds
access instead of granting it.

HIMARK's own organisation is set to `strategic-enterprise` by the same migration
— it is the platform operator and needs every module.

`provision_organization` gains a `p_tier` parameter, defaulted to `'core'`, and
writes it. That is the only production path that creates an organisation.

**Adding that parameter is a drop-and-recreate, not a replace.** A different
argument list makes a *new* function rather than replacing the existing one, so
`create or replace` would leave both live and let PostgREST resolve to either.
The migration must `drop function public.provision_organization(text, text,
text, text, timestamptz)` and create the six-argument version — and then restate
the grants, because they do not carry across to a new signature:

```sql
revoke all on function public.provision_organization(text, text, text, text, timestamptz, text)
  from public, anon;
grant execute on function public.provision_organization(text, text, text, text, timestamptz, text)
  to authenticated, service_role;
```

`revoke ... from public` alone does not strip Supabase's default grant to
`anon` — migration `20260826153200` exists solely because that was missed once
on this same function.

## Resolving entitlement

`getSessionContext()` already joins `organizations` on every request and is
wrapped in React `cache()`. Adding `tier` to that select means the tenant's tier
arrives with the session at no additional cost:

- `lib/auth/get-session-context.ts` — add `tier` to the `organizations(...)`
  select and to the mapped `Organization`
- `types/tenancy.ts` — `Organization` gains `tier: UnisonTierId`

`getEntitledModuleIds(tier)` then produces the module set. No new query anywhere.

## Navigation

`config/navigation.ts` currently exports `navigationSections` as a module-level
constant built from `modules.filter((m) => m.enabled)` — evaluated once at
import, identical for every tenant. It becomes a function:

```ts
export function navigationSectionsFor(moduleIds: readonly UnisonModuleId[]): NavigationSection[]
```

Sections with no entitled modules are omitted entirely, so a Core tenant sees no
empty "Finance" heading.

`components/navigation/sidebar.tsx` imports `navigationSections` directly at line
8. It takes `sections` as a prop instead; `components/layout/app-shell.tsx`
passes them through; `app/(unison)/layout.tsx` computes them where the session
already resolves.

## Enforcement

A layout per gated module folder:

```tsx
export default async function Layout({ children }: { children: React.ReactNode }) {
  return (await moduleDenial('invoices')) ?? children
}
```

`moduleDenial(moduleId)` returns the not-available page when the tenant's tier
excludes that module, and `null` when it does not. Colocated with the route it
protects, so it cannot be applied to the wrong one, and free — entitlement is
already cached for the request.

**Eight guards, not fifteen.** The six Delivery modules and Team are in
`lockedModuleIds` and no tier can withhold them, so only these need one:
`clients`, `onboarding`, `leads`, `quotes`, `sales`, `invoices`, `expenses`,
`forecast`.

The failure mode is forgetting a guard on a future module, so a test asserts that
every module not in `lockedModuleIds` has a layout calling `moduleDenial` with
its own id — the same source-assertion style `ui-completeness.test.ts` already
uses for retired routes.

### What the guard is, and is not

It is a product boundary, not a data boundary. Next renders layouts and pages in
parallel, so a blocked page's queries may still execute before the denial is
returned. Nothing leaks: every query is RLS-scoped to the caller's organisation,
so the worst case is wasted work rather than disclosure. The security boundary
stays where it already is, in RLS. Entitlement is commercial.

## The not-available page

`components/shared/module-not-available.tsx`, rendered by `moduleDenial`:

> **Invoices isn't part of UNISON Core**
> Available on UNISON Enterprise.
> Ask your UNISON administrator to upgrade.
> [ Back to Overview ]

Every value is derived, none hardcoded: the module's label from `modules`, the
current tier's label from `unisonTiers`, and the upgrade target from
`lowestTierIncluding(moduleId)` — `unisonTiers` is ordered from smallest to
largest, so that is a find rather than a mapping to maintain.

Naming the module means the page confirms it exists. That is acceptable: the tier
list is public product information, and the person who typed the URL usually
wants the module.

## Testing

Unit tests:

- each tier's module set matches the product rules exactly — Core is the six
  Delivery modules plus Team; Framework adds `clients` and `onboarding`;
  Enterprise adds `leads`, `quotes`, `sales`, `invoices`, `expenses`, `forecast`
- Strategic Enterprise **currently receives the full Enterprise module set until
  the Strategic tenant-configuration layer is implemented.** The test is named
  and commented that way rather than asserting the two tiers are equal, because
  the assertion will be deleted when that layer lands — and a test named
  "Strategic Enterprise equals Enterprise" would read as a rule being broken
  rather than a placeholder being retired.
- every module in `lockedModuleIds` is present in all four tiers
- `lowestTierIncluding` returns Framework for `clients` and Enterprise for
  `invoices`, and never returns a tier that excludes the module
- `navigationSectionsFor` omits a section whose modules are all withheld, and
  never omits Delivery or People
- every module not in `lockedModuleIds` has a guard layout naming its own id

Integration test under `tests/integration/rls/`: an organisation created by
`provision_organization` without an explicit tier is `core`, and one created with
`p_tier => 'enterprise'` is `enterprise`.

## Success criteria

A tenant on Core signs in and sees only Delivery and People in the sidebar.
Typing `/finance/invoices` reaches a page saying Invoices is available on UNISON
Enterprise, not the invoices workspace and not a 404. A tenant on Enterprise sees
and reaches everything. HIMARK's own organisation is unaffected. `tsc`, the unit
suite, `pnpm test:rls` and `pnpm build` are all green.
