# Pricing and Credit Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every retainer and project price in UNISON comes from a fixed rate card (the HIMARK pricing workbook), and quotes and invoices for retainers, projects, support services and top-ups are built from a client's recorded package by database functions that enforce "charged once", locked prices and per-tier initiative limits.

**Architecture:** The rate card is 28 rows in the existing `price_list_items` (new columns mark them). A client's package lives in two new tables (`client_engagements`, `engagement_support`) written only by security-definer functions, like `create_invoice_from_quote`. Three more functions build draft invoices or quotes from the rate card with locked lines; unique indexes and guard triggers enforce once-only billing and locked prices. The UI is one new section on the client page plus small changes to the price list and the line editor.

**Tech Stack:** Next.js 16 App Router (server components and actions; `searchParams` is a Promise), React 19, Supabase Postgres (RLS, security-definer functions, partial unique indexes), `node --test --experimental-strip-types` (relative `.ts` imports; no JSX, no `@/`, no `server-only` in unit-tested modules), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-pricing-credit-model-design.md` (read it first; the plan argues from it). Source workbook: `C:\Users\Neo\Downloads\HIMARK_Pricing_2026_Unified_Billing_Model.xlsx`.

## Global Constraints

- `AGENTS.md` says this Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing route or action code.
- The `unison-uat` Supabase project (id `nwdzpjzllhhqwawmsxjd`) is **PRODUCTION**. Implementers never touch it: no `execute_sql`, no `apply_migration`, no RLS test runs. The controller probes, applies and tests (steps marked "Controller").
- Migrations are append-only and named `2026101212xxxx_*.sql` in the order below. Never edit an applied migration; fix with a new one.
- All money is rand, excluding VAT unless a line says otherwise; VAT 15% comes from `organization_settings.vat_rate` (default 15.00 on a document) and is never hard-coded in SQL or UI.
- Exact rate card values are in Task 1's `features/billing/rate-card.ts`; the migration seed must match it (a unit test enforces this).
- Error tokens raised by the database are listed in Task 5's table; each is mapped to a plain sentence in `features/documents/errors.ts`.
- Do not touch `public/`. Do not edit any `record-collection-workspace.tsx`. Never `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean`; stage only the files you changed.
- Test rows created in production by RLS tests, including their audit rows, are removed by the test cleanup; the controller verifies.
- A control in the UI is a claim that the product supports it: no buttons for things not built (no credit balances, no automatic invoicing).
- Code reads like its surroundings: comment density, naming, idiom. UI copy is plain South African English, "Rand" amounts shown with `formatCurrency`/`formatAmount` helpers already in the repo.
- Branch: `feat/pricing-credit-model` (already created, off `main`).

## Review Focus

The inputs and failure modes the spec implies but a task's happy path would not exercise; each has a test in the named task.

1. **Two people press "Create first invoice" at the same moment** (or the same person double-clicks): exactly one draft exists, the other gets `FIRST_INVOICE_EXISTS`. (Task 4, parallel RPC test.)
2. **A rate card item is archived** (an admin retires a price) and someone presses a build button: a plain `RATE_ITEM_UNAVAILABLE` message, not a crash and not a zero-priced line. (Task 4.)
3. **A support service that starts or ends mid-month** is billed for the whole month it is active in (no proration), and a service that ended before the month is not billed. (Task 4, monthly invoice test with explicit months.)
4. **A tier change after that month's invoice already exists:** the old tier stays billed for that month (the invoice is not rewritten) and the new tier applies next month; a downgrade below the active project count is refused. (Task 3 and Task 4.)
5. **Editing around the lock:** a member cannot change a locked line's price or quantity, cannot create a locked line by hand, cannot set the engagement or billing columns on a quote or invoice, cannot create a rate card row; duplicating a locked quote keeps the lock and carries the link. (Task 2 and Task 4.)

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `features/billing/rate-card.ts` | The 28 rate card items, the tier initiative limits, package keys and names. Pure data. | 1 |
| `features/billing/billing-math.ts` | Rounding and VAT arithmetic for the expected first-invoice and monthly amounts. Pure. | 1 |
| `tests/unit/billing-rate-card.test.ts` | Pins every price, credit count and the eight VAT-inclusive amounts to the workbook; checks the migration seed against the data; checks `config/partner-levels.ts` agrees. | 1, 2 |
| `supabase/migrations/20261012100000_rate_card.sql` | Rate card columns, guard triggers, locked lines, `private.seed_rate_card`, the HIMARK seed. | 2 |
| `tests/integration/rls/rate-card-fixture.ts` | Test helper `seedRateCard(orgId)` that inserts the data file's items into a fixture organisation. | 2 |
| `tests/integration/rls/rate-card.test.ts` | Rate card and lock rules through signed-in clients. | 2 |
| `supabase/migrations/20261012110000_client_engagements.sql` | `client_engagements`, `engagement_support`, the activity kinds, the package functions and the initiative limit. | 3 |
| `tests/integration/rls/client-engagements.test.ts` | Package, limit, tier-change and support rules. | 3 |
| `supabase/migrations/20261012120000_billing_documents.sql` | Billing columns and guards, the document builders, re-created `create_invoice_from_quote` and `duplicate_quote`. | 4 |
| `tests/integration/rls/billing-documents.test.ts` | First, monthly and top-up documents, once-only rules, locks, link carrying. | 4 |
| `features/documents/errors.ts` (modify), `features/crm-workspace/vocabulary.ts` (modify) | New tokens and activity kinds with plain messages and labels. | 5 |
| `features/billing/billing-package-model.ts` | Pure view model for the client's Billing package section. | 5 |
| `features/billing/queries/get-billing-package.ts` | Reads engagements, support, rate items and billing documents for one client. | 5 |
| `features/billing/actions/billing.ts` | Server actions: set package, change tier, end, support, first document, monthly invoice, top-up. | 5 |
| `features/billing/components/billing-package-section.tsx`, `billing-forms.tsx` | The section and its small client forms. | 6 |
| `features/clients/components/client-detail.tsx` (modify) | Mounts the section. | 6 |
| `features/documents/queries/list-price-items.ts`, `types.ts`, `components/price-list-screen.tsx`, `line-editor.tsx` (modify) | Rate card tags, admin-only editing, locked lines, picker lists custom items only. | 6 |
| `features/clients/components/client-setup-workflow.tsx` (delete) | Dead file with the old prices. | 6 |
| `docs/crm-roadmap.md`, `docs/follow-ups.md` (modify) | Roadmap line and follow-ups. | 7 |

---

### Task 1: The rate card data and the money arithmetic

**Files:**
- Create: `features/billing/rate-card.ts`
- Create: `features/billing/billing-math.ts`
- Create: `tests/unit/billing-rate-card.test.ts`

**Interfaces:**
- Produces (used by every later task): from `features/billing/rate-card.ts`:
  - `export type RateKind = 'retainer_monthly' | 'retainer_implementation' | 'retainer_top_up' | 'project' | 'project_top_up' | 'support'`
  - `export type RateStatus = 'agreed' | 'proposed'`
  - `export type RateItem = { key: string; kind: RateKind; packageKey: string | null; title: string; description: string; price: number; credits: number | null; status: RateStatus; initiativeLimit: number | null }`
  - `export const TIERS: readonly { key: 'signature' | 'growth' | 'private' | 'reserve'; name: string }[]`
  - `export const PROJECTS: readonly { key: string; name: string }[]`
  - `export const RATE_CARD: readonly RateItem[]` (exactly 28)
  - `export function rateItem(key: string): RateItem | undefined`
  - `export function packageName(packageKey: string): string` (tier or project display name; the key itself if unknown)
- Produces: from `features/billing/billing-math.ts`:
  - `export function roundCents(value: number): number`
  - `export function withVat(amountExVat: number, vatRatePercent?: number): number` (default 15)
  - `export function firstInvoiceIncVat(tierKey: string): number | null`
  - `export function monthlyIncVat(tierKey: string): number | null`

- [ ] **Step 1: Write the failing test** `tests/unit/billing-rate-card.test.ts`

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { partnerLevels } from '../../config/partner-levels.ts'
import { firstInvoiceIncVat, monthlyIncVat, roundCents, withVat } from '../../features/billing/billing-math.ts'
import { PROJECTS, RATE_CARD, TIERS, packageName, rateItem } from '../../features/billing/rate-card.ts'

test('the rate card has the 28 items the workbook defines, with unique keys', () => {
  assert.equal(RATE_CARD.length, 28)
  assert.equal(new Set(RATE_CARD.map((item) => item.key)).size, 28)
  const count = (kind: string) => RATE_CARD.filter((item) => item.kind === kind).length
  assert.deepEqual(
    [count('retainer_monthly'), count('retainer_implementation'), count('retainer_top_up'), count('project'), count('project_top_up'), count('support')],
    [4, 4, 4, 5, 1, 10],
  )
})

test('retainer prices, credits, implementation fees, top-up rates and initiative limits match the workbook', () => {
  const expected: Record<string, [monthly: number, credits: number, top: number, limit: number | null]> = {
    signature: [100000, 40, 2500, 2],
    growth: [150000, 75, 2000, 4],
    private: [200000, 120, 1666.67, 6],
    reserve: [300000, 220, 1363.64, null],
  }
  for (const tier of TIERS) {
    const [monthly, credits, top, limit] = expected[tier.key]
    const m = rateItem(`retainer.${tier.key}.monthly`)!
    const i = rateItem(`retainer.${tier.key}.implementation`)!
    const t = rateItem(`retainer.${tier.key}.top_up`)!
    assert.equal(m.price, monthly, `${tier.key} monthly`)
    assert.equal(m.credits, credits, `${tier.key} credits`)
    assert.equal(m.initiativeLimit, limit, `${tier.key} limit`)
    assert.equal(i.price, monthly, `${tier.key} implementation equals one monthly fee`)
    assert.equal(i.credits, credits, `${tier.key} implementation credits equal the monthly credits`)
    assert.equal(t.price, top, `${tier.key} top-up`)
    assert.equal(t.status, 'proposed')
    assert.equal(m.status, 'agreed')
  }
})

test('project fees, credits and the project top-up rate match the workbook', () => {
  const expected: Record<string, [number, number]> = {
    operating_model: [120000, 40],
    intelligence_ai: [150000, 50],
    digital_experience: [65000, 22],
    digital_presence: [45000, 15],
    visual_communication: [35000, 12],
  }
  assert.deepEqual(PROJECTS.map((p) => p.key), Object.keys(expected))
  for (const [key, [price, credits]] of Object.entries(expected)) {
    const item = rateItem(`project.${key}`)!
    assert.equal(item.price, price, key)
    assert.equal(item.credits, credits, key)
  }
  const top = rateItem('project.top_up')!
  assert.equal(top.price, 3000)
  assert.equal(top.status, 'proposed')
  assert.equal(top.packageKey, null)
})

test('support services: price, credits and the project each belongs to', () => {
  const expected: Record<string, [price: number, credits: number, project: string]> = {
    'support.operations_improvement': [35000, 12, 'operating_model'],
    'support.ai_automation_care': [15000, 5, 'intelligence_ai'],
    'support.digital_experience_management': [30000, 10, 'digital_experience'],
    'support.application_interface_care': [10000, 3, 'digital_experience'],
    'support.digital_presence_management': [20000, 7, 'digital_presence'],
    'support.website_care': [5000, 2, 'digital_presence'],
    'support.communication_asset_care': [5000, 2, 'visual_communication'],
    'support.podcast_content': [25000, 8, 'visual_communication'],
    'support.integrated_podcast_social': [40000, 13, 'visual_communication'],
    'support.social_media_content': [20000, 7, 'visual_communication'],
  }
  for (const [key, [price, credits, project]] of Object.entries(expected)) {
    const item = rateItem(key)!
    assert.equal(item.price, price, key)
    assert.equal(item.credits, credits, key)
    assert.equal(item.packageKey, project, key)
    assert.equal(item.kind, 'support')
  }
})

test('first invoice and month-2-onwards amounts including VAT match the workbook to the cent', () => {
  assert.deepEqual(
    TIERS.map((tier) => [tier.key, firstInvoiceIncVat(tier.key), monthlyIncVat(tier.key)]),
    [
      ['signature', 230000, 115000],
      ['growth', 345000, 172500],
      ['private', 460000, 230000],
      ['reserve', 690000, 345000],
    ],
  )
  assert.equal(firstInvoiceIncVat('nonsense'), null)
  assert.equal(monthlyIncVat('nonsense'), null)
})

test('VAT arithmetic rounds to the cent', () => {
  assert.equal(withVat(100000), 115000)
  assert.equal(withVat(1666.67), 1916.67)
  assert.equal(roundCents(459999.9999999999), 460000)
})

test('the four retainer prices agree with the partner levels the provisioning wizard uses', () => {
  for (const level of partnerLevels) assert.equal(rateItem(`retainer.${level.id}.monthly`)!.price, level.price, level.id)
})

test('package names resolve for tiers and projects and fall back to the key', () => {
  assert.equal(packageName('growth'), 'Growth Partner')
  assert.equal(packageName('reserve'), 'HIMARK Reserve')
  assert.equal(packageName('operating_model'), 'Operating Model & Operations Transformation')
  assert.equal(packageName('x'), 'x')
})

test('every item states its credits in the line text where it has any', () => {
  for (const item of RATE_CARD) {
    if (item.credits !== null && item.kind !== 'retainer_top_up') assert.match(item.description, new RegExp(`\\b${item.credits}\\b`), `${item.key} description names its credits`)
    if (item.status === 'proposed') assert.match(item.description, /Proposed rate, not yet agreed\./, `${item.key} says it is proposed`)
  }
})

test('the migration seed rows equal the data file', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261012100000_rate_card.sql'), 'utf8')
  const rows = [...sql.matchAll(/^\s*\(('retainer\.[^\n]*|'project\.[^\n]*|'support\.[^\n]*)\),?\s*$/gm)].map((m) => m[1])
  assert.equal(rows.length, 28, 'the seed lists 28 rows')
  const tokens = (row: string) => [...row.matchAll(/'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?)|\b(null)\b/g)].map((m) => (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] !== undefined ? Number(m[2]) : null))
  for (const row of rows) {
    const [key, kind, packageKey, title, description, price, credits, status, limit] = tokens(row)
    const item = rateItem(String(key))
    assert.ok(item, `${key} is in the data file`)
    assert.deepEqual(
      [kind, packageKey, title, description, price, credits, status, limit],
      [item!.kind, item!.packageKey, item!.title, item!.description, item!.price, item!.credits, item!.status, item!.initiativeLimit],
      `${key} seed row matches`,
    )
  }
  assert.deepEqual(new Set(rows.map((r) => tokens(r)[0])), new Set(RATE_CARD.map((i) => i.key)))
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test --experimental-strip-types tests/unit/billing-rate-card.test.ts`
Expected: FAIL (`Cannot find module '../../features/billing/billing-math.ts'`).

- [ ] **Step 3: Write `features/billing/billing-math.ts`**

```ts
// Rand arithmetic for the expected amounts on a rate card document. Pure: no imports of server code.
import { rateItem } from './rate-card.ts'

const VAT_PERCENT = 15

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function withVat(amountExVat: number, vatRatePercent: number = VAT_PERCENT): number {
  return roundCents(amountExVat * (1 + vatRatePercent / 100))
}

/** A retainer's first invoice: the monthly fee plus the one-time implementation fee, with VAT. Null for an unknown tier. */
export function firstInvoiceIncVat(tierKey: string): number | null {
  const monthly = rateItem(`retainer.${tierKey}.monthly`)
  const implementation = rateItem(`retainer.${tierKey}.implementation`)
  if (!monthly || !implementation) return null
  return withVat(monthly.price + implementation.price)
}

/** A retainer's invoice from month 2 onwards: the monthly fee with VAT. Null for an unknown tier. */
export function monthlyIncVat(tierKey: string): number | null {
  const monthly = rateItem(`retainer.${tierKey}.monthly`)
  return monthly ? withVat(monthly.price) : null
}
```

- [ ] **Step 4: Write `features/billing/rate-card.ts`**

```ts
// The HIMARK rate card (HIMARK_Pricing_2026_Unified_Billing_Model.xlsx). All prices are rand excluding VAT.
// The migration 20261012100000_rate_card.sql seeds exactly these rows; tests/unit/billing-rate-card.test.ts checks it.
// No imports: unit tests and server code both use it.

export type RateKind = 'retainer_monthly' | 'retainer_implementation' | 'retainer_top_up' | 'project' | 'project_top_up' | 'support'
export type RateStatus = 'agreed' | 'proposed'
export type RateItem = {
  key: string
  kind: RateKind
  packageKey: string | null
  title: string
  description: string
  price: number
  credits: number | null
  status: RateStatus
  initiativeLimit: number | null
}

export const TIERS = [
  { key: 'signature', name: 'Signature Partner' },
  { key: 'growth', name: 'Growth Partner' },
  { key: 'private', name: 'Private Partner' },
  { key: 'reserve', name: 'HIMARK Reserve' },
] as const

export const PROJECTS = [
  { key: 'operating_model', name: 'Operating Model & Operations Transformation' },
  { key: 'intelligence_ai', name: 'Intelligence & AI Transformation' },
  { key: 'digital_experience', name: 'Digital Experience' },
  { key: 'digital_presence', name: 'Digital Presence' },
  { key: 'visual_communication', name: 'Visual Communication & Operations' },
] as const

const PROPOSED = 'Proposed rate, not yet agreed.'

// [tier key, monthly fee, credits per month, top-up rate per credit, active projects allowed]
const TIER_ROWS = [
  ['signature', 100000, 40, 2500, 2],
  ['growth', 150000, 75, 2000, 4],
  ['private', 200000, 120, 1666.67, 6],
  ['reserve', 300000, 220, 1363.64, null],
] as const

// [project key, fee, implementation credits]
const PROJECT_ROWS = [
  ['operating_model', 120000, 40],
  ['intelligence_ai', 150000, 50],
  ['digital_experience', 65000, 22],
  ['digital_presence', 45000, 15],
  ['visual_communication', 35000, 12],
] as const

// [service key, title, project key, monthly fee, credits per month, note]
const SUPPORT_ROWS = [
  ['operations_improvement', 'Operations Improvement Support', 'operating_model', 35000, 12, 'Core monthly support.'],
  ['ai_automation_care', 'AI & Automation Care', 'intelligence_ai', 15000, 5, 'Core monthly support.'],
  ['digital_experience_management', 'Digital Experience Management', 'digital_experience', 30000, 10, 'Core monthly support.'],
  ['application_interface_care', 'Application & Interface Care', 'digital_experience', 10000, 3, 'Optional monthly care.'],
  ['digital_presence_management', 'Digital Presence Management', 'digital_presence', 20000, 7, 'Core monthly support.'],
  ['website_care', 'Website Care', 'digital_presence', 5000, 2, 'Optional monthly care.'],
  ['communication_asset_care', 'Communication & Asset Care', 'visual_communication', 5000, 2, 'Core monthly support.'],
  ['podcast_content', 'Podcast Content', 'visual_communication', 25000, 8, 'Optional monthly content.'],
  ['integrated_podcast_social', 'Integrated Podcast & Social Media Content', 'visual_communication', 40000, 13, 'An alternative to Podcast Content and Social Media Content.'],
  ['social_media_content', 'Social Media Content', 'visual_communication', 20000, 7, 'Optional monthly content.'],
] as const

const tierName = (key: string) => TIERS.find((tier) => tier.key === key)!.name
const projectName = (key: string) => PROJECTS.find((project) => project.key === key)!.name

function build(): RateItem[] {
  const items: RateItem[] = []
  for (const [tier, monthly, credits, topUp, limit] of TIER_ROWS) {
    items.push({
      key: `retainer.${tier}.monthly`, kind: 'retainer_monthly', packageKey: tier,
      title: `${tierName(tier)}: monthly retainer`, description: `Includes ${credits} credits a month.`,
      price: monthly, credits, status: 'agreed', initiativeLimit: limit,
    })
    items.push({
      key: `retainer.${tier}.implementation`, kind: 'retainer_implementation', packageKey: tier,
      title: `${tierName(tier)}: one-time implementation`, description: `Charged once at activation. Includes ${credits} one-time implementation credits.`,
      price: monthly, credits, status: 'agreed', initiativeLimit: null,
    })
    items.push({
      key: `retainer.${tier}.top_up`, kind: 'retainer_top_up', packageKey: tier,
      title: `${tierName(tier)}: top-up credits`, description: `Extra credits, charged per credit. ${PROPOSED}`,
      price: topUp, credits: null, status: 'proposed', initiativeLimit: null,
    })
  }
  for (const [project, fee, credits] of PROJECT_ROWS) {
    items.push({
      key: `project.${project}`, kind: 'project', packageKey: project,
      title: `${projectName(project)}: project`, description: `Fixed-scope project fee. Includes ${credits} implementation credits.`,
      price: fee, credits, status: 'agreed', initiativeLimit: null,
    })
  }
  items.push({
    key: 'project.top_up', kind: 'project_top_up', packageKey: null,
    title: 'Project top-up credits', description: `Extra credits for an approved scope increase, charged per credit. ${PROPOSED}`,
    price: 3000, credits: null, status: 'proposed', initiativeLimit: null,
  })
  for (const [service, title, project, fee, credits, note] of SUPPORT_ROWS) {
    items.push({
      key: `support.${service}`, kind: 'support', packageKey: project,
      title: `${title}: monthly`, description: `Includes ${credits} credits a month. ${note}`,
      price: fee, credits, status: 'agreed', initiativeLimit: null,
    })
  }
  return items
}

export const RATE_CARD: readonly RateItem[] = build()

export function rateItem(key: string): RateItem | undefined {
  return RATE_CARD.find((item) => item.key === key)
}

/** A tier's or project's display name, or the key itself when it is neither. */
export function packageName(packageKey: string): string {
  return TIERS.find((tier) => tier.key === packageKey)?.name ?? PROJECTS.find((project) => project.key === packageKey)?.name ?? packageKey
}
```

- [ ] **Step 5: Run the test**

Run: `node --test --experimental-strip-types tests/unit/billing-rate-card.test.ts`
Expected: all pass except `the migration seed rows equal the data file` (the migration does not exist yet: it fails with ENOENT). That one is finished in Task 2. Confirm the others pass.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add features/billing/rate-card.ts features/billing/billing-math.ts tests/unit/billing-rate-card.test.ts
git commit -m "feat(billing): the rate card data and the first-invoice and monthly arithmetic, pinned to the pricing workbook"
```

---

### Task 2: The rate card in the database, and locked lines

**Files:**
- Create: `supabase/migrations/20261012100000_rate_card.sql`
- Create: `tests/integration/rls/rate-card-fixture.ts`
- Create: `tests/integration/rls/rate-card.test.ts`
- Modify: none

**Interfaces:**
- Consumes: `RATE_CARD`, `RateItem` from Task 1.
- Produces: columns `price_list_items.rate_key, item_kind, package_key, credits, rate_status, initiative_limit`; columns `quote_lines.rate_locked`, `invoice_lines.rate_locked` (boolean, default false); `private.seed_rate_card(p_org uuid)`; error tokens `RATE_CARD_FIXED`, `RATE_CARD_ADMIN_ONLY`, `RATE_LINE_LOCKED`; test helper `seedRateCard(orgId: string): Promise<void>` in `tests/integration/rls/rate-card-fixture.ts`.

- [ ] **Step 1: Write the migration** `supabase/migrations/20261012100000_rate_card.sql`

Start the file with this header and structure; the seed rows are generated in Step 2.

```sql
-- Pricing and credit model, part 1: the rate card and locked lines.
-- The rate card is rows in price_list_items marked with a rate_key. Only an owner or admin changes one, and never its identity;
-- a signed-in user cannot create one. Lines built from the rate card are locked (rate_locked): price, quantity, title and
-- description cannot be changed by a signed-in role, and a signed-in role cannot create a locked line (the builders in the
-- next migrations are definer functions). Append-only: earlier migrations are not edited.

-- ---------------------------------------------------------------------------
-- 1. Columns on the price list.
-- ---------------------------------------------------------------------------
alter table public.price_list_items
  add column rate_key text,
  add column item_kind text,
  add column package_key text,
  add column credits numeric(8,2),
  add column rate_status text,
  add column initiative_limit integer;

alter table public.price_list_items
  add constraint price_list_items_item_kind_check
    check (item_kind in ('retainer_monthly', 'retainer_implementation', 'retainer_top_up', 'project', 'project_top_up', 'support')),
  add constraint price_list_items_credits_check check (credits is null or credits > 0),
  add constraint price_list_items_rate_status_check check (rate_status in ('agreed', 'proposed')),
  add constraint price_list_items_limit_check check (initiative_limit is null or initiative_limit > 0),
  add constraint price_list_items_rate_shape check (
    (rate_key is null and item_kind is null and package_key is null and credits is null and rate_status is null and initiative_limit is null)
    or (rate_key is not null and item_kind is not null and rate_status is not null)
  ),
  add constraint price_list_items_limit_retainer_only check (initiative_limit is null or item_kind = 'retainer_monthly');

create unique index price_list_items_rate_key_unique on public.price_list_items(organization_id, rate_key) where rate_key is not null;
create index price_list_items_package_idx on public.price_list_items(organization_id, package_key, item_kind) where rate_key is not null;

-- ---------------------------------------------------------------------------
-- 2. Who may change a rate card item. Applies to the signed-in roles only; the migration, the definer functions and the
--    service role (fixtures) are not held to it.
-- ---------------------------------------------------------------------------
create or replace function public.price_list_items_rate_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_key is not null or new.item_kind is not null or new.package_key is not null or new.credits is not null
         or new.rate_status is not null or new.initiative_limit is not null then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    else
      if new.rate_key is distinct from old.rate_key or new.item_kind is distinct from old.item_kind
         or new.package_key is distinct from old.package_key or new.credits is distinct from old.credits
         or new.rate_status is distinct from old.rate_status then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
      if old.rate_key is not null then
        if not public.has_role(old.organization_id, array['owner', 'admin']) then
          raise exception 'RATE_CARD_ADMIN_ONLY' using errcode = '23514';
        end if;
      elsif new.initiative_limit is distinct from old.initiative_limit then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger price_list_items_rate_guard before insert or update on public.price_list_items
  for each row execute function public.price_list_items_rate_guard();
revoke all on function public.price_list_items_rate_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Locked lines.
-- ---------------------------------------------------------------------------
alter table public.quote_lines add column rate_locked boolean not null default false;
alter table public.invoice_lines add column rate_locked boolean not null default false;

create or replace function public.document_lines_rate_lock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_locked then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.rate_locked is distinct from old.rate_locked then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
      -- Position (moving a line) is free; the content of a locked line is not.
      if old.rate_locked and (
        new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.quantity is distinct from old.quantity
        or new.unit_price is distinct from old.unit_price
        or new.vat_code is distinct from old.vat_code
        or new.price_list_item_id is distinct from old.price_list_item_id
      ) then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger quote_lines_rate_lock before insert or update on public.quote_lines
  for each row execute function public.document_lines_rate_lock();
create trigger invoice_lines_rate_lock before insert or update on public.invoice_lines
  for each row execute function public.document_lines_rate_lock();
revoke all on function public.document_lines_rate_lock() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The seed. 28 rows, loaded for the HIMARK organisation only (other organisations and test fixtures get no rate card).
--    Rows are generated from features/billing/rate-card.ts; tests/unit/billing-rate-card.test.ts keeps the two equal.
-- ---------------------------------------------------------------------------
create or replace function private.seed_rate_card(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.price_list_items
    (organization_id, rate_key, item_kind, package_key, title, description, unit_price, credits, rate_status, initiative_limit, vat_code)
  select p_org, v.rate_key, v.item_kind, v.package_key, v.title, v.description, v.unit_price, v.credits, v.rate_status, v.initiative_limit, 'standard'
  from (values
-- SEED_ROWS
  ) as v(rate_key, item_kind, package_key, title, description, unit_price, credits, rate_status, initiative_limit)
  on conflict (organization_id, rate_key) where rate_key is not null do nothing
$$;
revoke all on function private.seed_rate_card(uuid) from public, anon, authenticated;

select private.seed_rate_card(o.id) from public.organizations o where o.id = '00000000-0000-4000-8000-000000000001';
```

- [ ] **Step 2: Generate the 28 seed rows from the data file and paste them over the `-- SEED_ROWS` line**

Save this throwaway script as `.superpowers/seed-rows.ts` (that folder is git-ignored; do not commit it) and run it; it prints the rows in the exact single-line format the unit test parses.

```ts
import { RATE_CARD } from '../features/billing/rate-card.ts'

const q = (value: string | null) => (value === null ? 'null' : `'${value.replace(/'/g, "''")}'`)
const n = (value: number | null) => (value === null ? 'null' : String(value))
const rows = RATE_CARD.map((i) => `    (${[q(i.key), q(i.kind), q(i.packageKey), q(i.title), q(i.description), n(i.price), n(i.credits), q(i.status), n(i.initiativeLimit)].join(',')})`)
console.log(rows.join(',\n'))
```

```bash
node --experimental-strip-types .superpowers/seed-rows.ts
```

Replace the single line `-- SEED_ROWS` with the printed 28 lines (each row on its own line; every row but the last ends with a comma). Check: `grep -c "^    ('" supabase/migrations/20261012100000_rate_card.sql` prints 28.

- [ ] **Step 3: The unit test now covers the seed**

Run: `node --test --experimental-strip-types tests/unit/billing-rate-card.test.ts`
Expected: all pass, including `the migration seed rows equal the data file`.

- [ ] **Step 4: Write the fixture helper** `tests/integration/rls/rate-card-fixture.ts`

```ts
import { RATE_CARD } from '../../../features/billing/rate-card.ts'
import { admin } from './helpers.ts'

/** Gives a fixture organisation the full rate card (the migration only seeds HIMARK). Uses the service role, which the guards do not hold. */
export async function seedRateCard(organizationId: string): Promise<void> {
  const rows = RATE_CARD.map((item) => ({
    organization_id: organizationId,
    rate_key: item.key,
    item_kind: item.kind,
    package_key: item.packageKey,
    title: item.title,
    description: item.description,
    unit_price: item.price,
    credits: item.credits,
    rate_status: item.status,
    initiative_limit: item.initiativeLimit,
    vat_code: 'standard',
  }))
  const { error } = await admin.from('price_list_items').insert(rows)
  if (error) throw error
}
```

(Every row has every key explicitly: a bulk insert with missing keys sends null for them.)

- [ ] **Step 5: Write the RLS test** `tests/integration/rls/rate-card.test.ts`

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { seedRateCard } from './rate-card-fixture.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const rateItem = async (key: string) => must(await admin.from('price_list_items').select('*').eq('organization_id', orgA).eq('rate_key', key).single()) as Record<string, any>

before(async () => {
  orgA = await createFixtureOrg('rate-a')
  orgB = await createFixtureOrg('rate-b')
  owner = await createFixtureUser(orgA, 'owner')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, member?.id, outsider?.id].filter(Boolean))
})

test('the rate card is readable by members of the organisation and nobody else', async () => {
  const mine = must(await memberClient.from('price_list_items').select('rate_key').eq('organization_id', orgA).not('rate_key', 'is', null))
  assert.equal(mine.length, 28)
  const theirs = must(await outsiderClient.from('price_list_items').select('id').eq('organization_id', orgA))
  assert.equal(theirs.length, 0)
})

test('a signed-in user cannot create a rate card row, and a custom item stays free for members', async () => {
  const hand = await memberClient.from('price_list_items').insert({ organization_id: orgA, title: 'Fake', unit_price: 1, rate_key: 'retainer.fake.monthly', item_kind: 'project', rate_status: 'agreed' })
  refused(hand.error, 'RATE_CARD_FIXED')
  const credit = await ownerClient.from('price_list_items').insert({ organization_id: orgA, title: 'Fake', unit_price: 1, credits: 5 })
  refused(credit.error, 'RATE_CARD_FIXED')
  const custom = await memberClient.from('price_list_items').insert({ organization_id: orgA, title: 'Custom workshop', unit_price: 1234.5 }).select('id').single()
  assert.equal(custom.error, null)
  const edited = await memberClient.from('price_list_items').update({ unit_price: 2000 }).eq('id', custom.data!.id).select('unit_price').single()
  assert.equal(edited.error, null)
  assert.equal(Number(edited.data!.unit_price), 2000)
})

test('only an owner or admin can change a rate card price, and not the item\'s identity', async () => {
  const growth = await rateItem('retainer.growth.monthly')
  const byMember = await memberClient.from('price_list_items').update({ unit_price: 1 }).eq('id', growth.id).select('id')
  refused(byMember.error, 'RATE_CARD_ADMIN_ONLY')
  const archiveByMember = await memberClient.from('price_list_items').update({ archived_at: new Date().toISOString() }).eq('id', growth.id).select('id')
  refused(archiveByMember.error, 'RATE_CARD_ADMIN_ONLY')
  const byOwner = await ownerClient.from('price_list_items').update({ unit_price: 150001 }).eq('id', growth.id).select('unit_price').single()
  assert.equal(byOwner.error, null)
  assert.equal(Number(byOwner.data!.unit_price), 150001)
  assert.equal((await ownerClient.from('price_list_items').update({ unit_price: 150000 }).eq('id', growth.id)).error, null)
  for (const change of [{ rate_key: 'x' }, { item_kind: 'support' }, { package_key: 'signature' }, { credits: 1 }, { rate_status: 'agreed' }]) {
    const identity = await ownerClient.from('price_list_items').update(change).eq('id', growth.id).select('id')
    refused(identity.error, 'RATE_CARD_FIXED')
  }
})

test('the initiative limit can be changed by an owner or admin, only on a retainer monthly item, and never by a member', async () => {
  const reserve = await rateItem('retainer.reserve.monthly')
  assert.equal(reserve.initiative_limit, null)
  refused((await memberClient.from('price_list_items').update({ initiative_limit: 3 }).eq('id', reserve.id).select('id')).error, 'RATE_CARD_ADMIN_ONLY')
  const set = await ownerClient.from('price_list_items').update({ initiative_limit: 8 }).eq('id', reserve.id).select('initiative_limit').single()
  assert.equal(set.error, null)
  assert.equal(set.data!.initiative_limit, 8)
  const cleared = await ownerClient.from('price_list_items').update({ initiative_limit: null }).eq('id', reserve.id).select('initiative_limit').single()
  assert.equal(cleared.error, null)
  const onProject = await rateItem('project.digital_presence')
  assert.ok((await ownerClient.from('price_list_items').update({ initiative_limit: 2 }).eq('id', onProject.id)).error, 'a limit only belongs on a retainer monthly item')
  assert.ok((await ownerClient.from('price_list_items').update({ initiative_limit: 0 }).eq('id', reserve.id)).error, 'a limit is positive')
  const custom = must(await admin.from('price_list_items').insert({ organization_id: orgA, title: 'Custom 2', unit_price: 1 }).select('id').single())
  refused((await ownerClient.from('price_list_items').update({ initiative_limit: 2 }).eq('id', custom.id).select('id')).error, 'RATE_CARD_FIXED')
})

test('a locked line cannot be edited, hand-made or unlocked by a signed-in user, but can be moved and removed while the document is a draft', async () => {
  const item = await rateItem('retainer.signature.monthly')
  const invoice = must(await admin.from('invoices').insert({ organization_id: orgA, client_name: 'Lock Client', status: 'Draft' }).select('id').single())
  const lock = must(await admin.from('invoice_lines').insert({
    organization_id: orgA, invoice_id: invoice.id, position: 1, title: item.title, description: item.description,
    quantity: 1, unit_price: 100000, vat_code: 'standard', price_list_item_id: item.id, rate_locked: true,
  }).select('id').single())
  const second = must(await admin.from('invoice_lines').insert({
    organization_id: orgA, invoice_id: invoice.id, position: 2, title: 'Extra', quantity: 1, unit_price: 5, vat_code: 'standard',
  }).select('id').single())

  for (const change of [{ unit_price: 1 }, { quantity: 2 }, { title: 'Cheaper' }, { description: 'x' }, { vat_code: 'zero' }, { price_list_item_id: null }]) {
    refused((await memberClient.from('invoice_lines').update(change).eq('id', lock.id).select('id')).error, 'RATE_LINE_LOCKED')
  }
  refused((await memberClient.from('invoice_lines').update({ rate_locked: false }).eq('id', lock.id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('invoice_lines').update({ rate_locked: true }).eq('id', second.id).select('id')).error, 'RATE_LINE_LOCKED')
  const byHand = await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 3, title: 'Hand made', quantity: 1, unit_price: 1, rate_locked: true })
  refused(byHand.error, 'RATE_LINE_LOCKED')

  const moved = await memberClient.from('invoice_lines').update({ position: 5 }).eq('id', lock.id).select('position').single()
  assert.equal(moved.error, null)
  assert.equal(moved.data!.position, 5)
  const plain = await memberClient.from('invoice_lines').update({ unit_price: 6 }).eq('id', second.id).select('unit_price').single()
  assert.equal(plain.error, null)
  const removed = await memberClient.from('invoice_lines').delete().eq('id', lock.id).select('id')
  assert.equal(removed.error, null)
  assert.equal(removed.data!.length, 1)
})

test('the same lock holds on quote lines', async () => {
  const item = await rateItem('project.digital_presence')
  const quote = must(await admin.from('quotes').insert({ organization_id: orgA, client_name: 'Lock Client', status: 'Draft' }).select('id').single())
  const lock = must(await admin.from('quote_lines').insert({
    organization_id: orgA, quote_id: quote.id, position: 1, title: item.title, quantity: 1, unit_price: 45000, vat_code: 'standard', price_list_item_id: item.id, rate_locked: true,
  }).select('id').single())
  refused((await memberClient.from('quote_lines').update({ unit_price: 1 }).eq('id', lock.id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 2, title: 'x', quantity: 1, unit_price: 1, rate_locked: true })).error, 'RATE_LINE_LOCKED')
})
```

- [ ] **Step 6: Typecheck and the unit tests**

Run: `pnpm typecheck && pnpm test`
Expected: green. (The RLS test cannot run until the migration is applied; the controller does that next.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261012100000_rate_card.sql tests/integration/rls/rate-card-fixture.ts tests/integration/rls/rate-card.test.ts
git commit -m "feat(billing): the rate card in the price list, admin-only changes and locked lines"
```

- [ ] **Step 8: Controller (not the implementer):** probe the migration in a rolled-back transaction through `execute_sql`: `begin; <the migration>; do $probe$ begin raise exception 'PROBE_OK rows=%', (select count(*) from public.price_list_items where rate_key is not null); end $probe$; rollback;`. The HIMARK organisation (`00000000-0000-4000-8000-000000000001`) exists in production, so expect `PROBE_OK rows=28`. Verify nothing persisted (no `rate_key` column), `apply_migration`, confirm 28 rows for the HIMARK org, then run `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/rate-card.test.ts` and confirm production has no fixture rows left.

---

### Task 3: Packages: engagements, support services, the initiative limit and tier changes

**Files:**
- Create: `supabase/migrations/20261012110000_client_engagements.sql`
- Create: `tests/integration/rls/client-engagements.test.ts`
- Modify: `features/crm-workspace/vocabulary.ts` (new system activity kinds and labels)

**Interfaces:**
- Consumes: `price_list_items` rate columns (Task 2); `seedRateCard` (Task 2).
- Produces (SQL): tables `client_engagements(id, organization_id, client_id, kind 'retainer'|'project', package_key, start_date, ended_on, replaces_id, root_id, created_by, created_at, updated_at)` and `engagement_support(id, organization_id, engagement_id, service_key, start_date, ended_on, created_at, updated_at)`; functions (all `security definer`, member-checked, granted to `authenticated`):
  - `public.set_client_package(p_client uuid, p_package_key text, p_start_date date default null) returns uuid`
  - `public.change_retainer_tier(p_engagement uuid, p_new_package_key text, p_start_date date) returns uuid`
  - `public.end_engagement(p_engagement uuid, p_ended_on date default null) returns void`
  - `public.add_support_service(p_engagement uuid, p_service_key text, p_start_date date default null) returns uuid`
  - `public.end_support_service(p_support uuid, p_ended_on date default null) returns void`
  - private helpers `private.sa_today() returns date`, `private.month_start(d date) returns date`, `private.rate_item(p_org uuid, p_key text) returns public.price_list_items`
  - tokens: `CLIENT_NOT_FOUND`, `ENGAGEMENT_NOT_FOUND`, `ENGAGEMENT_ENDED`, `PACKAGE_UNKNOWN`, `PACKAGE_UNCHANGED`, `PACKAGE_START_INVALID`, `CLIENT_HAS_RETAINER`, `INITIATIVE_LIMIT_REACHED`, `SUPPORT_NOT_FOR_PROJECT`, `SUPPORT_ALREADY_ACTIVE`, `SUPPORT_NOT_FOUND`, `RATE_ITEM_UNAVAILABLE`
  - activity kinds `billing.package_set`, `billing.tier_changed`, `billing.support_added`, `billing.document_built` (the last is written in Task 4)
- Produces (TS): `SYSTEM_ACTIVITY_KINDS` and `ACTIVITY_LABELS` extended.

- [ ] **Step 1: Write the migration** `supabase/migrations/20261012110000_client_engagements.sql`

```sql
-- Pricing and credit model, part 2: the client's package.
-- A client has engagements (one active retainer at most, any number of projects) and support services attached to a project.
-- Written only by the definer functions below (members can read). A retainer tier allows only so many active projects
-- (price_list_items.initiative_limit on its monthly item); the limit is enforced by a trigger as well as by the functions.
-- Append-only: earlier migrations are not edited.

-- ---------------------------------------------------------------------------
-- 1. Helpers.
-- ---------------------------------------------------------------------------
create or replace function private.sa_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Johannesburg')::date
$$;

-- The first day of the month of a date, by plain date arithmetic (no time zone involved).
create or replace function private.month_start(d date) returns date
language sql immutable set search_path = '' as $$
  select d - (extract(day from d)::integer - 1)
$$;

create or replace function private.rate_item(p_org uuid, p_key text) returns public.price_list_items
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.price_list_items;
begin
  select * into r from public.price_list_items where organization_id = p_org and rate_key = p_key and archived_at is null;
  if not found then
    raise exception 'RATE_ITEM_UNAVAILABLE' using errcode = '23514';
  end if;
  return r;
end $$;

revoke all on function private.sa_today() from public, anon, authenticated;
revoke all on function private.month_start(date) from public, anon, authenticated;
revoke all on function private.rate_item(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------
create table public.client_engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  kind text not null check (kind in ('retainer', 'project')),
  package_key text not null check (length(trim(package_key)) > 0),
  start_date date not null,
  ended_on date,
  replaces_id uuid,
  root_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (ended_on is null or ended_on >= start_date),
  check (replaces_id is null or kind = 'retainer'),
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete cascade,
  foreign key (replaces_id, organization_id) references public.client_engagements(id, organization_id)
);

create unique index client_engagements_one_active_retainer on public.client_engagements(client_id) where kind = 'retainer' and ended_on is null;
create index client_engagements_client_idx on public.client_engagements(client_id, kind, ended_on);

create table public.engagement_support (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  engagement_id uuid not null,
  service_key text not null check (length(trim(service_key)) > 0),
  start_date date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= start_date),
  foreign key (engagement_id, organization_id) references public.client_engagements(id, organization_id) on delete cascade
);

create unique index engagement_support_one_active on public.engagement_support(engagement_id, service_key) where ended_on is null;
create index engagement_support_engagement_idx on public.engagement_support(engagement_id, ended_on);

create trigger client_engagements_set_updated_at before update on public.client_engagements
  for each row execute function public.set_updated_at();
create trigger engagement_support_set_updated_at before update on public.engagement_support
  for each row execute function public.set_updated_at();
create trigger client_engagements_audit after insert or update or delete on public.client_engagements
  for each row execute function public.record_audit_event();
create trigger engagement_support_audit after insert or update or delete on public.engagement_support
  for each row execute function public.record_audit_event();

alter table public.client_engagements enable row level security;
alter table public.engagement_support enable row level security;
create policy client_engagements_select on public.client_engagements
  for select to authenticated using (public.is_member_of(organization_id));
create policy engagement_support_select on public.engagement_support
  for select to authenticated using (public.is_member_of(organization_id));
revoke all on public.client_engagements, public.engagement_support from anon, authenticated;
grant select on public.client_engagements, public.engagement_support to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The initiative limit. A client with an active retainer may have only as many active projects as the tier allows;
--    an empty limit means no limit. Also enforced inside the functions that lock the client row first.
-- ---------------------------------------------------------------------------
create or replace function private.client_engagements_initiative_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_active integer;
begin
  if new.kind = 'project' then
    select r.initiative_limit into v_limit
    from public.client_engagements e
    join public.price_list_items r
      on r.organization_id = e.organization_id and r.item_kind = 'retainer_monthly' and r.package_key = e.package_key
    where e.client_id = new.client_id and e.kind = 'retainer' and e.ended_on is null;
    if v_limit is not null then
      select count(*) into v_active
      from public.client_engagements p
      where p.client_id = new.client_id and p.kind = 'project' and p.ended_on is null;
      if v_active >= v_limit then
        raise exception 'INITIATIVE_LIMIT_REACHED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger client_engagements_initiative_limit before insert on public.client_engagements
  for each row execute function private.client_engagements_initiative_limit();
revoke all on function private.client_engagements_initiative_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Timeline entries for the package. The definer functions write them; members never insert a system kind.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'lead.converted', 'client.created_from_lead', 'opportunity.created_from_lead', 'opportunity.stage_changed', 'quote.sent', 'quote.accepted', 'quote.emailed', 'invoice.emailed', 'quote.invoiced', 'payment.recorded', 'payment.voided', 'invoice.overdue', 'billing.package_set', 'billing.tier_changed', 'billing.support_added', 'billing.document_built'));

-- ---------------------------------------------------------------------------
-- 5. Record a package for a client (a retainer or a project).
-- ---------------------------------------------------------------------------
create or replace function public.set_client_package(p_client uuid, p_package_key text, p_start_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients%rowtype;
  v_item public.price_list_items%rowtype;
  v_start date := coalesce(p_start_date, private.sa_today());
  v_id uuid := gen_random_uuid();
  v_active integer;
begin
  select * into v_client from public.clients where id = p_client;
  if not found or not public.is_member_of(v_client.organization_id) or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  -- One package change at a time per client, so the limit and the one-active-retainer rule cannot race.
  perform 1 from public.clients where id = p_client for update;

  select * into v_item from public.price_list_items
  where organization_id = v_client.organization_id and package_key = p_package_key
    and item_kind in ('retainer_monthly', 'project') and archived_at is null;
  if not found then
    raise exception 'PACKAGE_UNKNOWN' using errcode = '23514';
  end if;
  if v_start < private.sa_today() - 366 or v_start > private.sa_today() + 366 then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;

  if v_item.item_kind = 'retainer_monthly' then
    if exists (select 1 from public.client_engagements e where e.client_id = p_client and e.kind = 'retainer' and e.ended_on is null) then
      raise exception 'CLIENT_HAS_RETAINER' using errcode = '23514';
    end if;
    if v_item.initiative_limit is not null then
      select count(*) into v_active from public.client_engagements e where e.client_id = p_client and e.kind = 'project' and e.ended_on is null;
      if v_active > v_item.initiative_limit then
        raise exception 'INITIATIVE_LIMIT_REACHED' using errcode = '23514';
      end if;
    end if;
    insert into public.client_engagements (id, organization_id, client_id, kind, package_key, start_date, root_id, created_by)
    values (v_id, v_client.organization_id, p_client, 'retainer', p_package_key, v_start, v_id, (select auth.uid()));
    update public.clients set engagement_type = 'Retainer' where id = p_client and engagement_type is distinct from 'Retainer';
  else
    insert into public.client_engagements (id, organization_id, client_id, kind, package_key, start_date, root_id, created_by)
    values (v_id, v_client.organization_id, p_client, 'project', p_package_key, v_start, v_id, (select auth.uid()));
    update public.clients set engagement_type = 'Project' where id = p_client and engagement_type is null;
  end if;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_client.organization_id, 'billing.package_set', 'Package recorded: ' || v_item.title,
          jsonb_build_object('engagement_id', v_id, 'package_key', p_package_key, 'start_date', v_start),
          public.activity_actor(v_client.organization_id), p_client);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Change a retainer's tier. The new tier carries on from the old one: no new implementation fee is ever billed for it.
-- ---------------------------------------------------------------------------
create or replace function public.change_retainer_tier(p_engagement uuid, p_new_package_key text, p_start_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.client_engagements%rowtype;
  v_item public.price_list_items%rowtype;
  v_id uuid := gen_random_uuid();
  v_active integer;
begin
  select * into v_old from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_old.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  perform 1 from public.clients where id = v_old.client_id for update;
  select * into v_old from public.client_engagements where id = p_engagement for update;
  if v_old.kind <> 'retainer' or v_old.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;

  select * into v_item from public.price_list_items
  where organization_id = v_old.organization_id and package_key = p_new_package_key
    and item_kind = 'retainer_monthly' and archived_at is null;
  if not found then
    raise exception 'PACKAGE_UNKNOWN' using errcode = '23514';
  end if;
  if v_item.package_key = v_old.package_key then
    raise exception 'PACKAGE_UNCHANGED' using errcode = '23514';
  end if;
  if p_start_date is null or p_start_date <= v_old.start_date or p_start_date > private.sa_today() + 366 then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  if v_item.initiative_limit is not null then
    select count(*) into v_active from public.client_engagements e where e.client_id = v_old.client_id and e.kind = 'project' and e.ended_on is null;
    if v_active > v_item.initiative_limit then
      raise exception 'INITIATIVE_LIMIT_REACHED' using errcode = '23514';
    end if;
  end if;

  update public.client_engagements set ended_on = p_start_date - 1 where id = v_old.id;
  insert into public.client_engagements (id, organization_id, client_id, kind, package_key, start_date, replaces_id, root_id, created_by)
  values (v_id, v_old.organization_id, v_old.client_id, 'retainer', p_new_package_key, p_start_date, v_old.id, v_old.root_id, (select auth.uid()));

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_old.organization_id, 'billing.tier_changed', 'Retainer changed to ' || v_item.title,
          jsonb_build_object('engagement_id', v_id, 'replaces_id', v_old.id, 'from', v_old.package_key, 'to', p_new_package_key, 'start_date', p_start_date),
          public.activity_actor(v_old.organization_id), v_old.client_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 7. End an engagement (and any support services still running on it).
-- ---------------------------------------------------------------------------
create or replace function public.end_engagement(p_engagement uuid, p_ended_on date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_end date := coalesce(p_ended_on, private.sa_today());
begin
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement for update;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  if v_end < v_e.start_date then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  update public.client_engagements set ended_on = v_end where id = p_engagement;
  update public.engagement_support set ended_on = greatest(start_date, v_end) where engagement_id = p_engagement and ended_on is null;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Support services on a project.
-- ---------------------------------------------------------------------------
create or replace function public.add_support_service(p_engagement uuid, p_service_key text, p_start_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_item public.price_list_items%rowtype;
  v_start date := coalesce(p_start_date, private.sa_today());
  v_id uuid;
begin
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_e.kind <> 'project' or v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  v_item := private.rate_item(v_e.organization_id, p_service_key);
  if v_item.item_kind <> 'support' or v_item.package_key is distinct from v_e.package_key then
    raise exception 'SUPPORT_NOT_FOR_PROJECT' using errcode = '23514';
  end if;
  if v_start < v_e.start_date or v_start > private.sa_today() + 366 then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  begin
    insert into public.engagement_support (organization_id, engagement_id, service_key, start_date)
    values (v_e.organization_id, p_engagement, p_service_key, v_start)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SUPPORT_ALREADY_ACTIVE' using errcode = '23514';
  end;
  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.support_added', 'Support service recorded: ' || v_item.title,
          jsonb_build_object('engagement_id', p_engagement, 'support_id', v_id, 'service_key', p_service_key, 'start_date', v_start),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_id;
end $$;

create or replace function public.end_support_service(p_support uuid, p_ended_on date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.engagement_support%rowtype;
  v_end date := coalesce(p_ended_on, private.sa_today());
begin
  select * into v_s from public.engagement_support where id = p_support;
  if not found or not public.is_member_of(v_s.organization_id) then
    raise exception 'SUPPORT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_s.ended_on is not null or v_end < v_s.start_date then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  update public.engagement_support set ended_on = v_end where id = p_support;
end $$;

revoke all on function public.set_client_package(uuid, text, date) from public, anon;
revoke all on function public.change_retainer_tier(uuid, text, date) from public, anon;
revoke all on function public.end_engagement(uuid, date) from public, anon;
revoke all on function public.add_support_service(uuid, text, date) from public, anon;
revoke all on function public.end_support_service(uuid, date) from public, anon;
grant execute on function public.set_client_package(uuid, text, date) to authenticated;
grant execute on function public.change_retainer_tier(uuid, text, date) to authenticated;
grant execute on function public.end_engagement(uuid, date) to authenticated;
grant execute on function public.add_support_service(uuid, text, date) to authenticated;
grant execute on function public.end_support_service(uuid, date) to authenticated;
```

- [ ] **Step 2: Extend the activity vocabulary** in `features/crm-workspace/vocabulary.ts`

Append four kinds to `SYSTEM_ACTIVITY_KINDS` after `'invoice.overdue'` (the order must match the constraint above):

```ts
  'invoice.overdue',
  'billing.package_set',
  'billing.tier_changed',
  'billing.support_added',
  'billing.document_built',
] as const
```

and four labels at the end of `ACTIVITY_LABELS`:

```ts
  'invoice.overdue': 'Invoice overdue',
  'billing.package_set': 'Package recorded',
  'billing.tier_changed': 'Tier changed',
  'billing.support_added': 'Support service recorded',
  'billing.document_built': 'Billing document built',
```

- [ ] **Step 3: Write the RLS test** `tests/integration/rls/client-engagements.test.ts`

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { seedRateCard } from './rate-card-fixture.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

let counter = 0
async function newClient(org = orgA): Promise<string> {
  counter += 1
  return must(await admin.from('clients').insert({ organization_id: org, name: `Eng Client ${counter}`, status: 'Active' }).select('id').single()).id
}
const setPackage = (client: string, key: string, start: string | null = null, db: SupabaseClient = memberClient) =>
  db.rpc('set_client_package', { p_client: client, p_package_key: key, p_start_date: start })
const engagement = async (id: string) => must(await admin.from('client_engagements').select('*').eq('id', id).single()) as Record<string, any>

before(async () => {
  orgA = await createFixtureOrg('eng-a')
  orgB = await createFixtureOrg('eng-b')
  owner = await createFixtureUser(orgA, 'owner')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
  await seedRateCard(orgB)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, member?.id, outsider?.id].filter(Boolean))
})

test('recording a retainer creates the engagement, sets the client type and writes a timeline entry', async () => {
  const client = await newClient()
  const result = await setPackage(client, 'growth', day())
  assert.equal(result.error, null)
  const row = await engagement(result.data as string)
  assert.equal(row.kind, 'retainer')
  assert.equal(row.package_key, 'growth')
  assert.equal(row.root_id, row.id)
  assert.equal(row.replaces_id, null)
  assert.equal(must(await admin.from('clients').select('engagement_type').eq('id', client).single()).engagement_type, 'Retainer')
  const timeline = must(await admin.from('activities').select('kind, subject').eq('client_id', client).eq('kind', 'billing.package_set'))
  assert.equal(timeline.length, 1)
  assert.match(timeline[0].subject, /Growth Partner/)
})

test('a second active retainer is refused, and an unknown package, a bad date and another organisation\'s client are refused', async () => {
  const client = await newClient()
  assert.equal((await setPackage(client, 'signature')).error, null)
  refused((await setPackage(client, 'growth')).error, 'CLIENT_HAS_RETAINER')
  refused((await setPackage(client, 'platinum')).error, 'PACKAGE_UNKNOWN')
  refused((await setPackage(client, 'support.website_care')).error, 'PACKAGE_UNKNOWN')
  refused((await setPackage(await newClient(), 'growth', day(-4000))).error, 'PACKAGE_START_INVALID')
  const foreign = await newClient(orgB)
  refused((await setPackage(foreign, 'growth')).error, 'CLIENT_NOT_FOUND')
  refused((await setPackage(client, 'growth', null, outsiderClient)).error, 'CLIENT_NOT_FOUND')
  assert.equal(must(await admin.from('client_engagements').select('id').eq('client_id', foreign)).length, 0)
})

test('members cannot write engagements or support rows directly and cannot see another organisation\'s', async () => {
  const client = await newClient()
  const id = (await setPackage(client, 'growth')).data as string
  assert.ok((await memberClient.from('client_engagements').insert({ organization_id: orgA, client_id: client, kind: 'project', package_key: 'digital_presence', start_date: day(), root_id: id })).error)
  assert.ok((await memberClient.from('client_engagements').update({ ended_on: day() }).eq('id', id).select('id')).error)
  assert.equal(must(await memberClient.from('client_engagements').select('id').eq('id', id)).length, 1)
  assert.equal(must(await outsiderClient.from('client_engagements').select('id').eq('id', id)).length, 0)
  assert.ok((await memberClient.from('engagement_support').insert({ organization_id: orgA, engagement_id: id, service_key: 'support.website_care', start_date: day() })).error)
})

test('the initiative limit: Signature 2, Growth 4, Private 6; the next project is refused; ending one frees a place', async () => {
  for (const [tier, limit] of [['signature', 2], ['growth', 4], ['private', 6]] as const) {
    const client = await newClient()
    assert.equal((await setPackage(client, tier)).error, null)
    const ids: string[] = []
    for (let i = 0; i < limit; i += 1) {
      const added = await setPackage(client, 'digital_presence')
      assert.equal(added.error, null, `${tier} project ${i + 1}`)
      ids.push(added.data as string)
    }
    refused((await setPackage(client, 'digital_presence')).error, 'INITIATIVE_LIMIT_REACHED')
    assert.equal((await memberClient.rpc('end_engagement', { p_engagement: ids[0], p_ended_on: null })).error, null)
    assert.equal((await setPackage(client, 'operating_model')).error, null, `${tier}: a place was freed`)
    refused((await setPackage(client, 'operating_model')).error, 'INITIATIVE_LIMIT_REACHED')
  }
})

test('HIMARK Reserve has no limit until an owner or admin sets one; a client with no retainer has none', async () => {
  const reserve = await newClient()
  assert.equal((await setPackage(reserve, 'reserve')).error, null)
  for (let i = 0; i < 7; i += 1) assert.equal((await setPackage(reserve, 'digital_presence')).error, null)
  const standalone = await newClient()
  for (let i = 0; i < 7; i += 1) assert.equal((await setPackage(standalone, 'digital_experience')).error, null)

  const item = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'retainer.reserve.monthly').single())
  assert.equal((await ownerClient.from('price_list_items').update({ initiative_limit: 8 }).eq('id', item.id)).error, null)
  refused((await setPackage(reserve, 'digital_presence')).error, 'INITIATIVE_LIMIT_REACHED')
  assert.equal((await ownerClient.from('price_list_items').update({ initiative_limit: 9 }).eq('id', item.id)).error, null)
  assert.equal((await setPackage(reserve, 'digital_presence')).error, null)
  assert.equal((await ownerClient.from('price_list_items').update({ initiative_limit: null }).eq('id', item.id)).error, null)
})

test('recording a retainer for a client who already has more projects than its tier allows is refused', async () => {
  const client = await newClient()
  for (let i = 0; i < 3; i += 1) assert.equal((await setPackage(client, 'digital_presence')).error, null)
  refused((await setPackage(client, 'signature')).error, 'INITIATIVE_LIMIT_REACHED')
  assert.equal((await setPackage(client, 'growth')).error, null)
})

test('changing tier ends the old retainer the day before, links the new one back and keeps the chain\'s root', async () => {
  const client = await newClient()
  const first = (await setPackage(client, 'growth', day(-30))).data as string
  const result = await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day(-5) })
  assert.equal(result.error, null)
  const old = await engagement(first)
  const next = await engagement(result.data as string)
  assert.equal(old.ended_on, day(-6))
  assert.equal(next.package_key, 'private')
  assert.equal(next.replaces_id, first)
  assert.equal(next.root_id, first)
  assert.equal(next.start_date, day(-5))
  assert.equal(next.ended_on, null)
  assert.equal(must(await admin.from('activities').select('id').eq('client_id', client).eq('kind', 'billing.tier_changed')).length, 1)
})

test('changing tier: refusals (same tier, ended retainer, bad date, a project, over the new limit, another organisation)', async () => {
  const client = await newClient()
  const first = (await setPackage(client, 'growth', day(-10))).data as string
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'growth', p_start_date: day() })).error, 'PACKAGE_UNCHANGED')
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day(-10) })).error, 'PACKAGE_START_INVALID')
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: null })).error, 'PACKAGE_START_INVALID')
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'unknown', p_start_date: day() })).error, 'PACKAGE_UNKNOWN')
  refused((await outsiderClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day() })).error, 'ENGAGEMENT_NOT_FOUND')
  for (let i = 0; i < 3; i += 1) assert.equal((await setPackage(client, 'digital_presence')).error, null)
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'signature', p_start_date: day() })).error, 'INITIATIVE_LIMIT_REACHED')
  const project = (await setPackage(await newClient(), 'digital_presence')).data as string
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: project, p_new_package_key: 'private', p_start_date: day() })).error, 'ENGAGEMENT_ENDED')
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: first, p_ended_on: day() })).error, null)
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day(1) })).error, 'ENGAGEMENT_ENDED')
})

test('support services: only a service of that project, once at a time, only on an active project; ending the engagement ends them', async () => {
  const client = await newClient()
  const project = (await setPackage(client, 'visual_communication', day(-20))).data as string
  const added = await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-10) })
  assert.equal(added.error, null)
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day() })).error, 'SUPPORT_ALREADY_ACTIVE')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.website_care', p_start_date: day() })).error, 'SUPPORT_NOT_FOR_PROJECT')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'retainer.growth.monthly', p_start_date: day() })).error, 'SUPPORT_NOT_FOR_PROJECT')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.nonsense', p_start_date: day() })).error, 'RATE_ITEM_UNAVAILABLE')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.social_media_content', p_start_date: day(-30) })).error, 'PACKAGE_START_INVALID')
  const retainer = (await setPackage(client, 'growth')).data as string
  refused((await memberClient.rpc('add_support_service', { p_engagement: retainer, p_service_key: 'support.social_media_content', p_start_date: day() })).error, 'ENGAGEMENT_ENDED')

  assert.equal((await memberClient.rpc('end_support_service', { p_support: added.data as string, p_ended_on: day(-2) })).error, null)
  assert.equal((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-1) })).error, null)
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: day() })).error, null)
  const open = must(await admin.from('engagement_support').select('id').eq('engagement_id', project).is('ended_on', null))
  assert.equal(open.length, 0)
  refused((await memberClient.rpc('end_support_service', { p_support: added.data as string, p_ended_on: day() })).error, 'PACKAGE_START_INVALID')
  refused((await outsiderClient.rpc('end_support_service', { p_support: added.data as string, p_ended_on: day() })).error, 'SUPPORT_NOT_FOUND')
})

test('two people recording a retainer for the same client at once: exactly one succeeds', async () => {
  const client = await newClient()
  const results = await Promise.all([setPackage(client, 'signature'), setPackage(client, 'growth', null, ownerClient)])
  assert.equal(results.filter((r) => r.error === null).length, 1)
  assert.equal(results.filter((r) => r.error !== null).length, 1)
  assert.equal(must(await admin.from('client_engagements').select('id').eq('client_id', client).eq('kind', 'retainer').is('ended_on', null)).length, 1)
})
```

- [ ] **Step 4: Run the unit tests and the typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: green (the vocabulary test `the activity kinds in the code are exactly the ones the database allows` now reads the newest `activities_kind_check`, which is this migration, and it must match the new `SYSTEM_ACTIVITY_KINDS`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261012110000_client_engagements.sql tests/integration/rls/client-engagements.test.ts features/crm-workspace/vocabulary.ts
git commit -m "feat(billing): client packages, support services, per-tier initiative limits and tier changes"
```

- [ ] **Step 6: Controller (not the implementer):** rolled-back probe of the migration (expect the function and trigger counts: 5 public functions, tables exist), verify nothing persisted, `apply_migration`, run `tests/integration/rls/client-engagements.test.ts` and `rate-card.test.ts` again, verify production has no fixture rows (organisations 1, no test users, no engagement rows).

---

### Task 4: Building the documents: first invoice or quote, monthly invoice, top-up, and the billing guards

**Files:**
- Create: `supabase/migrations/20261012120000_billing_documents.sql`
- Create: `tests/integration/rls/billing-documents.test.ts`
- Modify: none

**Interfaces:**
- Consumes: Task 2 columns/guards/`seedRateCard`; Task 3 tables and helpers `private.sa_today()`, `private.month_start(date)`, `private.rate_item(uuid, text)`, the engagement functions, and the four activity kinds (incl. `billing.document_built`).
- Produces (SQL), all `security definer`, member-checked, granted to `authenticated`:
  - `public.create_first_document(p_engagement uuid, p_kind text default 'invoice') returns uuid` (`p_kind` is `'invoice'` or `'quote'`)
  - `public.create_monthly_invoice(p_client uuid, p_month date default null) returns uuid`
  - `public.create_top_up_invoice(p_engagement uuid, p_credits numeric) returns uuid`
  - re-created `public.create_invoice_from_quote(uuid)` and `public.duplicate_quote(uuid)` (the latter becomes security definer)
  - columns `invoices.engagement_id, billing_kind ('first'|'monthly'|'top_up'), billing_month`; `quotes.engagement_id, billing_kind ('first')`
  - tokens: `FIRST_INVOICE_EXISTS`, `FIRST_INVOICE_MISSING`, `IMPLEMENTATION_ALREADY_BILLED`, `NOTHING_TO_BILL`, `MONTH_ALREADY_BILLED`, `BILLING_MONTH_INVALID`, `TOP_UP_CREDITS_INVALID`, `BILLING_COLUMNS_GENERATED` (plus `DOCUMENT_KIND_UNKNOWN`, a programming error, never shown)

- [ ] **Step 1: Write the migration** `supabase/migrations/20261012120000_billing_documents.sql`

```sql
-- Pricing and credit model, part 3: building the documents from a client's package.
-- Quotes and invoices built here carry locked lines copied from the rate card. A retainer or project gets one first invoice
-- (unique index, a cancelled invoice frees the slot); a client gets one monthly invoice per month (same rule); top-ups can be
-- bought any number of times. The link columns are set only by these functions. Append-only.

-- ---------------------------------------------------------------------------
-- 1. Link columns on the documents.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column engagement_id uuid,
  add column billing_kind text,
  add column billing_month date;
alter table public.quotes
  add column engagement_id uuid,
  add column billing_kind text;

alter table public.invoices
  add constraint invoices_billing_kind_check check (billing_kind in ('first', 'monthly', 'top_up')),
  add constraint invoices_billing_shape check (
    (billing_kind is null and engagement_id is null and billing_month is null)
    or (billing_kind in ('first', 'top_up') and engagement_id is not null and billing_month is null)
    or (billing_kind = 'monthly' and engagement_id is null and billing_month is not null and extract(day from billing_month) = 1)
  ),
  add foreign key (engagement_id, organization_id) references public.client_engagements(id, organization_id);
alter table public.quotes
  add constraint quotes_billing_kind_check check (billing_kind = 'first'),
  add constraint quotes_billing_shape check ((billing_kind is null) = (engagement_id is null)),
  add foreign key (engagement_id, organization_id) references public.client_engagements(id, organization_id);

create unique index invoices_one_first_per_engagement on public.invoices(engagement_id)
  where billing_kind = 'first' and status <> 'Cancelled';
create unique index invoices_one_monthly_per_client_month on public.invoices(client_id, billing_month)
  where billing_kind = 'monthly' and status <> 'Cancelled';
create index invoices_engagement_idx on public.invoices(engagement_id) where engagement_id is not null;
create index quotes_engagement_idx on public.quotes(engagement_id) where engagement_id is not null;

-- A signed-in role never sets or changes the link; only the functions below (and the quote functions) do.
create or replace function public.document_billing_columns_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if v_new ->> 'engagement_id' is not null or v_new ->> 'billing_kind' is not null or v_new ->> 'billing_month' is not null then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
    else
      v_old := to_jsonb(old);
      if (v_new ->> 'engagement_id') is distinct from (v_old ->> 'engagement_id')
         or (v_new ->> 'billing_kind') is distinct from (v_old ->> 'billing_kind')
         or (v_new ->> 'billing_month') is distinct from (v_old ->> 'billing_month') then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger invoices_billing_columns_guard before insert or update on public.invoices
  for each row execute function public.document_billing_columns_guard();
create trigger quotes_billing_columns_guard before insert or update on public.quotes
  for each row execute function public.document_billing_columns_guard();
revoke all on function public.document_billing_columns_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers: a new draft header, and a locked line copied from a rate card item.
-- ---------------------------------------------------------------------------
create or replace function private.new_document(
  p_kind text, p_client public.clients, p_engagement uuid, p_billing_kind text, p_month date, p_project_name text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_kind = 'invoice' then
    insert into public.invoices (organization_id, client_id, client_name, currency, status, engagement_id, billing_kind, billing_month, project_name)
    values (p_client.organization_id, p_client.id, p_client.name, 'ZAR', 'Draft', p_engagement, p_billing_kind, p_month, p_project_name)
    returning id into v_id;
  else
    insert into public.quotes (organization_id, client_id, client_name, currency, status, engagement_id, billing_kind, project_name)
    values (p_client.organization_id, p_client.id, p_client.name, 'ZAR', 'Draft', p_engagement, p_billing_kind, p_project_name)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function private.add_rate_line(
  p_kind text, p_doc uuid, p_org uuid, p_position integer, p_item public.price_list_items, p_quantity numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_description text := nullif(concat_ws(' ', nullif(p_item.description, ''), p_note), '');
begin
  if p_kind = 'invoice' then
    insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
    values (p_org, p_doc, p_position, p_item.title, v_description, p_quantity, p_item.unit_price, p_item.vat_code, p_item.id, true);
  else
    insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
    values (p_org, p_doc, p_position, p_item.title, v_description, p_quantity, p_item.unit_price, p_item.vat_code, p_item.id, true);
  end if;
end $$;

revoke all on function private.new_document(text, public.clients, uuid, text, date, text) from public, anon, authenticated;
revoke all on function private.add_rate_line(text, uuid, uuid, integer, public.price_list_items, numeric, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The first invoice (or quote) of a retainer or project.
--    Retainer: the monthly fee and the one-time implementation fee. Project: the project fee. A retainer that replaced an
--    earlier tier never gets an implementation fee: the first retainer's first invoice stands for the whole chain.
-- ---------------------------------------------------------------------------
create or replace function public.create_first_document(p_engagement uuid, p_kind text default 'invoice') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_main public.price_list_items%rowtype;
  v_impl public.price_list_items%rowtype;
  v_doc uuid;
begin
  if p_kind not in ('invoice', 'quote') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  if v_e.kind = 'retainer' and v_e.replaces_id is not null then
    raise exception 'IMPLEMENTATION_ALREADY_BILLED' using errcode = '23514';
  end if;
  select * into v_client from public.clients where id = v_e.client_id for update;
  if p_kind = 'invoice' and exists (
    select 1 from public.invoices i where i.engagement_id = p_engagement and i.billing_kind = 'first' and i.status <> 'Cancelled'
  ) then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end if;

  begin
    if v_e.kind = 'retainer' then
      v_main := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.monthly');
      v_impl := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.implementation');
      v_doc := private.new_document(p_kind, v_client, p_engagement, 'first', null, v_main.title);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 1, v_main, 1);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 2, v_impl, 1);
    else
      v_main := private.rate_item(v_e.organization_id, 'project.' || v_e.package_key);
      v_doc := private.new_document(p_kind, v_client, p_engagement, 'first', null, v_main.title);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 1, v_main, 1);
    end if;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.document_built', 'Draft ' || p_kind || ' built: first ' || p_kind || ' for ' || v_main.title,
          jsonb_build_object('document_id', v_doc, 'document_kind', p_kind, 'billing_kind', 'first', 'engagement_id', p_engagement),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A client's monthly invoice: the retainer's monthly fee (the tier in force on the last day of the month, from the month
--    after the retainer chain started, once its first invoice exists) and every support service running at any time in the
--    month. No proration. One per client per month; a cancelled one frees the month.
-- ---------------------------------------------------------------------------
create or replace function public.create_monthly_invoice(p_client uuid, p_month date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients%rowtype;
  v_month date := private.month_start(coalesce(p_month, private.sa_today()));
  v_end date;
  v_ret public.client_engagements%rowtype;
  v_root_start date;
  v_has_ret boolean := false;
  v_support integer;
  v_item public.price_list_items%rowtype;
  v_doc uuid;
  v_pos integer := 0;
  v_svc record;
begin
  select * into v_client from public.clients where id = p_client;
  if not found or not public.is_member_of(v_client.organization_id) or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_month > private.month_start(private.sa_today()) or v_month < date '2020-01-01' then
    raise exception 'BILLING_MONTH_INVALID' using errcode = '23514';
  end if;
  v_end := (v_month + interval '1 month' - interval '1 day')::date;
  perform 1 from public.clients where id = p_client for update;

  if exists (
    select 1 from public.invoices i where i.client_id = p_client and i.billing_kind = 'monthly' and i.billing_month = v_month and i.status <> 'Cancelled'
  ) then
    raise exception 'MONTH_ALREADY_BILLED' using errcode = '23514';
  end if;

  select * into v_ret from public.client_engagements e
  where e.client_id = p_client and e.kind = 'retainer' and e.start_date <= v_end and (e.ended_on is null or e.ended_on >= v_end)
  order by e.start_date desc limit 1;
  if found then
    select r.start_date into v_root_start from public.client_engagements r where r.id = v_ret.root_id;
    if v_month > private.month_start(v_root_start) then
      if not exists (
        select 1 from public.invoices i where i.engagement_id = v_ret.root_id and i.billing_kind = 'first' and i.status <> 'Cancelled'
      ) then
        raise exception 'FIRST_INVOICE_MISSING' using errcode = '23514';
      end if;
      v_has_ret := true;
    end if;
  end if;

  select count(*) into v_support
  from public.engagement_support s join public.client_engagements e on e.id = s.engagement_id
  where e.client_id = p_client and s.start_date <= v_end and (s.ended_on is null or s.ended_on >= v_month);
  if not v_has_ret and v_support = 0 then
    raise exception 'NOTHING_TO_BILL' using errcode = '23514';
  end if;

  begin
    v_doc := private.new_document('invoice', v_client, null, 'monthly', v_month, null);
    if v_has_ret then
      v_item := private.rate_item(v_client.organization_id, 'retainer.' || v_ret.package_key || '.monthly');
      v_pos := v_pos + 1;
      perform private.add_rate_line('invoice', v_doc, v_client.organization_id, v_pos, v_item, 1);
    end if;
    for v_svc in
      select s.service_key
      from public.engagement_support s join public.client_engagements e on e.id = s.engagement_id
      where e.client_id = p_client and s.start_date <= v_end and (s.ended_on is null or s.ended_on >= v_month)
      order by s.start_date, s.service_key
    loop
      v_item := private.rate_item(v_client.organization_id, v_svc.service_key);
      v_pos := v_pos + 1;
      perform private.add_rate_line('invoice', v_doc, v_client.organization_id, v_pos, v_item, 1);
    end loop;
  exception when unique_violation then
    raise exception 'MONTH_ALREADY_BILLED' using errcode = '23514';
  end;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_client.organization_id, 'billing.document_built', 'Draft invoice built: monthly invoice for ' || to_char(v_month, 'FMMonth YYYY'),
          jsonb_build_object('document_id', v_doc, 'document_kind', 'invoice', 'billing_kind', 'monthly', 'billing_month', v_month),
          public.activity_actor(v_client.organization_id), p_client);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 5. A top-up: extra credits at the rate of the engagement's tier (retainer) or the project rate. Any number of times.
-- ---------------------------------------------------------------------------
create or replace function public.create_top_up_invoice(p_engagement uuid, p_credits numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_item public.price_list_items%rowtype;
  v_doc uuid;
begin
  if p_credits is null or p_credits < 1 or p_credits > 10000 or p_credits <> trunc(p_credits) then
    raise exception 'TOP_UP_CREDITS_INVALID' using errcode = '23514';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  select * into v_client from public.clients where id = v_e.client_id;
  if v_e.kind = 'retainer' then
    v_item := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.top_up');
  else
    v_item := private.rate_item(v_e.organization_id, 'project.top_up');
  end if;
  v_doc := private.new_document('invoice', v_client, p_engagement, 'top_up', null, v_item.title);
  perform private.add_rate_line('invoice', v_doc, v_e.organization_id, 1, v_item, p_credits);
  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.document_built', 'Draft invoice built: top-up of ' || p_credits::text || ' credits',
          jsonb_build_object('document_id', v_doc, 'document_kind', 'invoice', 'billing_kind', 'top_up', 'engagement_id', p_engagement, 'credits', p_credits),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quote to invoice and duplicate keep the lock and the link. create_invoice_from_quote is the version from
--    20261011130000_documents_delivery.sql plus rate_locked and the link; a quote's first-invoice link is refused when the
--    engagement already has a first invoice. duplicate_quote becomes a definer function (a signed-in role cannot create a
--    locked line itself) with the same membership check.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous calls on the same quote and stops a status change in between.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED' using errcode = '23514';
  end if;
  if v_quote.status <> 'Accepted' then
    raise exception 'QUOTE_NOT_ACCEPTED' using errcode = '23514';
  end if;

  begin
    insert into public.invoices (
      organization_id, client_id, client_name, owner_id, opportunity_id, quote_id, currency, status,
      project_name, project_description, project_ref, client_ref, engagement_id, billing_kind)
    values (
      v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
      v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref, v_quote.engagement_id, v_quote.billing_kind)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id, l.rate_locked
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $$;

create or replace function public.duplicate_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.quotes%rowtype;
  v_new uuid;
begin
  select * into v_src from public.quotes where id = p_id;
  if not found or not public.is_member_of(v_src.organization_id) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  insert into public.quotes (
    organization_id, client_id, client_name, contact_name, lead_id, opportunity_id, owner_id, currency, status,
    terms, notes, project_name, project_description, project_ref, client_ref, engagement_id, billing_kind)
  values (
    v_src.organization_id, v_src.client_id, v_src.client_name, v_src.contact_name, v_src.lead_id, v_src.opportunity_id,
    v_src.owner_id, v_src.currency, 'Draft', v_src.terms, v_src.notes, v_src.project_name, v_src.project_description,
    v_src.project_ref, v_src.client_ref, v_src.engagement_id, v_src.billing_kind)
  returning id into v_new;
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id, l.rate_locked
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $$;

revoke all on function public.create_first_document(uuid, text) from public, anon;
revoke all on function public.create_monthly_invoice(uuid, date) from public, anon;
revoke all on function public.create_top_up_invoice(uuid, numeric) from public, anon;
revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.create_first_document(uuid, text) to authenticated;
grant execute on function public.create_monthly_invoice(uuid, date) to authenticated;
grant execute on function public.create_top_up_invoice(uuid, numeric) to authenticated;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
grant execute on function public.duplicate_quote(uuid) to authenticated;
```

Before writing the file, check two facts with the repo (read-only) and adjust if they differ: (a) that `create_invoice_from_quote` in `20261011130000_documents_delivery.sql` lines 141-186 still has exactly the columns copied above, and (b) the `duplicate_quote` insert column list in `20261011110000_documents_send_issue.sql` lines 390-415. The new functions must keep every column the old ones carried and only add `engagement_id`, `billing_kind` and `rate_locked`.

- [ ] **Step 2: Write the RLS test** `tests/integration/rls/billing-documents.test.ts`

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { seedRateCard } from './rate-card-fixture.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const iso = (date: Date) => date.toISOString().slice(0, 10)
const day = (offset = 0) => iso(new Date(Date.now() + offset * 86_400_000))
const monthStart = (date: string) => `${date.slice(0, 8)}01`
/** The first day of the month `offset` months from this one (UTC; the tests use explicit months so the clock does not matter). */
const monthOffset = (offset: number) => {
  const now = new Date()
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)))
}
const monthEnd = (start: string) => iso(new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)))

let counter = 0
async function newClient(org = orgA): Promise<string> {
  counter += 1
  return must(await admin.from('clients').insert({ organization_id: org, name: `Bill Client ${counter}`, status: 'Active' }).select('id').single()).id
}
async function packageFor(client: string, key: string, start: string = day()): Promise<string> {
  const result = await memberClient.rpc('set_client_package', { p_client: client, p_package_key: key, p_start_date: start })
  assert.equal(result.error, null, `package ${key}`)
  return result.data as string
}
const firstDoc = (engagement: string, kind: 'invoice' | 'quote' = 'invoice', db: SupabaseClient = memberClient) => db.rpc('create_first_document', { p_engagement: engagement, p_kind: kind })
const monthly = (client: string, month: string | null, db: SupabaseClient = memberClient) => db.rpc('create_monthly_invoice', { p_client: client, p_month: month })
const topUp = (engagement: string, credits: unknown, db: SupabaseClient = memberClient) => db.rpc('create_top_up_invoice', { p_engagement: engagement, p_credits: credits })
const invoice = async (id: string) => must(await admin.from('invoices').select('*').eq('id', id).single()) as Record<string, any>
const quote = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
const lines = async (table: 'invoice_lines' | 'quote_lines', column: 'invoice_id' | 'quote_id', id: string) =>
  must(await admin.from(table).select('*').eq(column, id).order('position')) as Record<string, any>[]
const invoiceLines = (id: string) => lines('invoice_lines', 'invoice_id', id)
let numberSeed = 0
/** Marks a draft as cancelled the way the issue flow would: a real number first, because a draft reference may only live on a draft. */
async function cancel(id: string) {
  numberSeed += 1
  const { error } = await admin.from('invoices').update({ invoice_number: `T-I-${Date.now()}-${numberSeed}`, status: 'Cancelled' }).eq('id', id)
  assert.equal(error, null)
}

before(async () => {
  orgA = await createFixtureOrg('bill-a')
  orgB = await createFixtureOrg('bill-b')
  owner = await createFixtureUser(orgA, 'owner')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
  await seedRateCard(orgB)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, member?.id, outsider?.id].filter(Boolean))
})

test('a retainer\'s first invoice has the monthly fee and the implementation fee, locked, and adds up to the workbook amount', async () => {
  for (const [tier, total] of [['signature', 230000], ['growth', 345000], ['private', 460000], ['reserve', 690000]] as const) {
    const client = await newClient()
    const engagementId = await packageFor(client, tier)
    const built = await firstDoc(engagementId)
    assert.equal(built.error, null, tier)
    const row = await invoice(built.data as string)
    assert.equal(row.status, 'Draft')
    assert.equal(row.billing_kind, 'first')
    assert.equal(row.engagement_id, engagementId)
    assert.equal(row.client_id, client)
    assert.equal(Number(row.total_amount), total, `${tier} first invoice including VAT`)
    assert.equal(Number(row.balance_amount), total)
    const built_lines = await invoiceLines(row.id)
    assert.equal(built_lines.length, 2)
    assert.deepEqual(built_lines.map((l) => l.rate_locked), [true, true])
    assert.match(built_lines[0].title, /monthly retainer/)
    assert.match(built_lines[1].title, /one-time implementation/)
    assert.ok(built_lines.every((l) => Number(l.quantity) === 1 && l.price_list_item_id))
    const timeline = must(await admin.from('activities').select('subject').eq('client_id', client).eq('kind', 'billing.document_built'))
    assert.equal(timeline.length, 1)
  }
})

test('a project\'s first invoice is its fee only, with its credits in the line text', async () => {
  const client = await newClient()
  const built = await firstDoc(await packageFor(client, 'operating_model'))
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(Number(row.total_amount), 138000)
  const l = await invoiceLines(row.id)
  assert.equal(l.length, 1)
  assert.match(l[0].description, /40 implementation credits/)
})

test('a second first invoice is refused, a cancelled one frees the slot, and two simultaneous presses leave exactly one', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth')
  const first = await firstDoc(engagementId)
  assert.equal(first.error, null)
  refused((await firstDoc(engagementId)).error, 'FIRST_INVOICE_EXISTS')
  await cancel(first.data as string)
  const again = await firstDoc(engagementId)
  assert.equal(again.error, null)

  const other = await newClient()
  const otherEngagement = await packageFor(other, 'signature')
  const results = await Promise.all([firstDoc(otherEngagement), firstDoc(otherEngagement, 'invoice', ownerClient)])
  assert.equal(results.filter((r) => r.error === null).length, 1)
  refused(results.find((r) => r.error)!.error, 'FIRST_INVOICE_EXISTS')
  assert.equal(must(await admin.from('invoices').select('id').eq('engagement_id', otherEngagement).eq('billing_kind', 'first')).length, 1)
})

test('a first quote can be built any number of times; converting an accepted one carries the lock and the link and takes the slot', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'private')
  const q1 = await firstDoc(engagementId, 'quote')
  const q2 = await firstDoc(engagementId, 'quote')
  assert.equal(q1.error, null)
  assert.equal(q2.error, null)
  const qrow = await quote(q1.data as string)
  assert.equal(qrow.billing_kind, 'first')
  assert.equal(qrow.engagement_id, engagementId)
  assert.equal(Number(qrow.total_amount), 460000)
  const ql = await lines('quote_lines', 'quote_id', qrow.id)
  assert.deepEqual(ql.map((l) => l.rate_locked), [true, true])

  numberSeed += 1
  assert.equal((await admin.from('quotes').update({ quote_number: `T-Q-${Date.now()}-${numberSeed}`, status: 'Accepted' }).eq('id', q1.data as string)).error, null)
  numberSeed += 1
  assert.equal((await admin.from('quotes').update({ quote_number: `T-Q-${Date.now()}-${numberSeed}`, status: 'Accepted' }).eq('id', q2.data as string)).error, null)
  const converted = await memberClient.rpc('create_invoice_from_quote', { p_quote_id: q1.data as string })
  assert.equal(converted.error, null)
  const inv = await invoice(converted.data as string)
  assert.equal(inv.engagement_id, engagementId)
  assert.equal(inv.billing_kind, 'first')
  assert.deepEqual((await invoiceLines(inv.id)).map((l) => l.rate_locked), [true, true])
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: q2.data as string })).error, 'FIRST_INVOICE_EXISTS')
  refused((await firstDoc(engagementId)).error, 'FIRST_INVOICE_EXISTS')
})

test('duplicating a locked quote keeps the lock and the link', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth')
  const q = await firstDoc(engagementId, 'quote')
  const copy = await memberClient.rpc('duplicate_quote', { p_id: q.data as string })
  assert.equal(copy.error, null)
  const row = await quote(copy.data as string)
  assert.equal(row.engagement_id, engagementId)
  assert.equal(row.billing_kind, 'first')
  assert.deepEqual((await lines('quote_lines', 'quote_id', row.id)).map((l) => l.rate_locked), [true, true])
  refused((await outsiderClient.rpc('duplicate_quote', { p_id: q.data as string })).error, 'QUOTE_NOT_FOUND')
})

test('a retainer that replaced an earlier tier is never billed an implementation fee, but the chain can be billed monthly', async () => {
  const client = await newClient()
  const original = await packageFor(client, 'growth', day(-100))
  assert.equal((await firstDoc(original)).error, null)
  const changed = await memberClient.rpc('change_retainer_tier', { p_engagement: original, p_new_package_key: 'private', p_start_date: day(-5) })
  assert.equal(changed.error, null)
  refused((await firstDoc(changed.data as string)).error, 'IMPLEMENTATION_ALREADY_BILLED')
  const month = monthOffset(0)
  const built = await monthly(client, month)
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(Number(row.total_amount), 230000, 'the tier in force at the end of the month (Private) is billed for the whole month')
  assert.match((await invoiceLines(row.id))[0].title, /Private Partner/)
})

test('the monthly invoice: needs the first invoice, one per month, no future months, and nothing to bill in the first month', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth', day(-100))
  refused((await monthly(client, monthOffset(0))).error, 'FIRST_INVOICE_MISSING')
  assert.equal((await firstDoc(engagementId)).error, null)
  const built = await monthly(client, monthOffset(0))
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(row.billing_kind, 'monthly')
  assert.equal(row.engagement_id, null)
  assert.equal(row.billing_month, monthOffset(0))
  assert.equal(Number(row.total_amount), 172500)
  assert.equal((await invoiceLines(row.id)).length, 1)
  refused((await monthly(client, monthOffset(0))).error, 'MONTH_ALREADY_BILLED')
  refused((await monthly(client, monthOffset(1))).error, 'BILLING_MONTH_INVALID')
  refused((await monthly(client, '2019-05-01')).error, 'BILLING_MONTH_INVALID')
  await cancel(built.data as string)
  assert.equal((await monthly(client, monthOffset(0))).error, null, 'a cancelled monthly invoice frees the month')

  const fresh = await newClient()
  const start = day()
  const freshEngagement = await packageFor(fresh, 'signature', start)
  assert.equal((await firstDoc(freshEngagement)).error, null)
  refused((await monthly(fresh, monthStart(start))).error, 'NOTHING_TO_BILL')
  refused((await monthly(await newClient(), monthOffset(0))).error, 'NOTHING_TO_BILL')
  refused((await monthly(client, monthOffset(0), outsiderClient)).error, 'CLIENT_NOT_FOUND')
})

test('support services are billed for every month they run in, whole, and not for months they did not run in', async () => {
  const client = await newClient()
  const retainer = await packageFor(client, 'growth', day(-200))
  assert.equal((await firstDoc(retainer)).error, null)
  const project = await packageFor(client, 'digital_presence', day(-200))
  const careStart = day(-40)
  const mgmtStart = day(-150)
  const mgmtEnd = day(-45)
  assert.equal((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.website_care', p_start_date: careStart })).error, null)
  const mgmt = await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.digital_presence_management', p_start_date: mgmtStart })
  assert.equal(mgmt.error, null)
  assert.equal((await memberClient.rpc('end_support_service', { p_support: mgmt.data as string, p_ended_on: mgmtEnd })).error, null)

  const services = [
    { title: /Website Care/, start: careStart, end: null as string | null, price: 5000 },
    { title: /Digital Presence Management/, start: mgmtStart, end: mgmtEnd, price: 20000 },
  ]
  for (const month of [monthOffset(0), monthStart(mgmtEnd), monthStart(day(-120))]) {
    const built = await monthly(client, month)
    assert.equal(built.error, null, month)
    const l = await invoiceLines(built.data as string)
    let expected = 150000
    assert.match(l[0].title, /Growth Partner/)
    for (const service of services) {
      const active = service.start <= monthEnd(month) && (service.end === null || service.end >= month)
      assert.equal(l.some((line) => service.title.test(line.title)), active, `${service.title} in ${month}`)
      if (active) expected += service.price
    }
    assert.equal(Number((await invoice(built.data as string)).subtotal), expected, `subtotal for ${month}`)
  }
})

test('a client with only support, and no retainer, is billed just the support', async () => {
  const client = await newClient()
  const project = await packageFor(client, 'visual_communication', day(-60))
  assert.equal((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-50) })).error, null)
  const built = await monthly(client, monthOffset(0))
  assert.equal(built.error, null)
  assert.equal(Number((await invoice(built.data as string)).total_amount), 5750)
  const noSupport = await newClient()
  await packageFor(noSupport, 'digital_presence')
  refused((await monthly(noSupport, monthOffset(0))).error, 'NOTHING_TO_BILL')
})

test('a top-up is credits times the tier rate, or the project rate, locked, and any number of times', async () => {
  const client = await newClient()
  const retainer = await packageFor(client, 'signature')
  const built = await topUp(retainer, 15)
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(row.billing_kind, 'top_up')
  assert.equal(row.engagement_id, retainer)
  assert.equal(Number(row.total_amount), 43125)
  const l = await invoiceLines(row.id)
  assert.equal(l.length, 1)
  assert.equal(Number(l[0].quantity), 15)
  assert.equal(Number(l[0].unit_price), 2500)
  assert.equal(l[0].rate_locked, true)
  assert.match(l[0].description, /Proposed rate, not yet agreed\./)
  assert.equal((await topUp(retainer, 1)).error, null)
  assert.equal((await topUp(retainer, 10000)).error, null)

  const project = await packageFor(client, 'digital_experience')
  const projectBuilt = await topUp(project, 2)
  assert.equal(projectBuilt.error, null)
  assert.equal(Number((await invoice(projectBuilt.data as string)).total_amount), 6900)

  for (const bad of [0, -1, 1.5, 10001, null, 'x']) refused((await topUp(retainer, bad)).error, bad === 'x' ? 'invalid input syntax|TOP_UP_CREDITS_INVALID' : 'TOP_UP_CREDITS_INVALID')
  refused((await topUp(retainer, 3, outsiderClient)).error, 'ENGAGEMENT_NOT_FOUND')
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: null })).error, null)
  refused((await topUp(project, 2)).error, 'ENGAGEMENT_ENDED')
})

test('an archived rate card item stops the build with a clear refusal and leaves no draft behind', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'digital_experience')
  const item = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'project.digital_experience').single())
  assert.equal((await ownerClient.from('price_list_items').update({ archived_at: new Date().toISOString() }).eq('id', item.id)).error, null)
  try {
    refused((await firstDoc(engagementId)).error, 'RATE_ITEM_UNAVAILABLE')
    assert.equal(must(await admin.from('invoices').select('id').eq('client_id', client)).length, 0)
  } finally {
    await admin.from('price_list_items').update({ archived_at: null }).eq('id', item.id)
  }
  assert.equal((await firstDoc(engagementId)).error, null)
})

test('built lines cannot be edited by a member, a later rate card change leaves the draft alone, and the link columns are not settable', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'signature')
  const built = await firstDoc(engagementId)
  const id = built.data as string
  const l = await invoiceLines(id)
  refused((await memberClient.from('invoice_lines').update({ unit_price: 1 }).eq('id', l[0].id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('invoice_lines').update({ quantity: 3 }).eq('id', l[0].id).select('id')).error, 'RATE_LINE_LOCKED')
  assert.equal((await memberClient.from('invoice_lines').update({ position: 9 }).eq('id', l[0].id)).error, null)

  const item = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'retainer.signature.monthly').single())
  assert.equal((await ownerClient.from('price_list_items').update({ unit_price: 111111 }).eq('id', item.id)).error, null)
  try {
    assert.equal(Number((await invoiceLines(id)).find((x) => x.id === l[0].id)!.unit_price), 100000)
  } finally {
    await admin.from('price_list_items').update({ unit_price: 100000 }).eq('id', item.id)
  }

  refused((await memberClient.from('invoices').update({ billing_kind: 'monthly', engagement_id: null }).eq('id', id).select('id')).error, 'BILLING_COLUMNS_GENERATED')
  refused((await memberClient.from('invoices').update({ engagement_id: null }).eq('id', id).select('id')).error, 'BILLING_COLUMNS_GENERATED|invoices_billing_shape')
  const hand = await memberClient.from('invoices').insert({ organization_id: orgA, client_id: client, client_name: 'x', engagement_id: engagementId, billing_kind: 'first' })
  refused(hand.error, 'BILLING_COLUMNS_GENERATED')
  const handQuote = await memberClient.from('quotes').insert({ organization_id: orgA, client_id: client, client_name: 'x', engagement_id: engagementId, billing_kind: 'first' })
  refused(handQuote.error, 'BILLING_COLUMNS_GENERATED')

  const removed = await memberClient.from('invoice_lines').delete().eq('id', l[1].id).select('id')
  assert.equal(removed.error, null)
  assert.equal(removed.data!.length, 1)
})

test('nothing crosses organisations', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth')
  const built = await firstDoc(engagementId)
  assert.equal(must(await outsiderClient.from('invoices').select('id').eq('id', built.data as string)).length, 0)
  refused((await firstDoc(engagementId, 'invoice', outsiderClient)).error, 'ENGAGEMENT_NOT_FOUND')
  refused((await outsiderClient.rpc('create_invoice_from_quote', { p_quote_id: (await firstDoc(engagementId, 'quote')).data as string })).error, 'QUOTE_NOT_FOUND')
})
```

- [ ] **Step 3: Unit tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: green. (The RLS test cannot run until the migration is applied; the controller does that.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261012120000_billing_documents.sql tests/integration/rls/billing-documents.test.ts
git commit -m "feat(billing): first invoice or quote, monthly invoice and top-up built from the rate card, with once-only rules and locked lines"
```

- [ ] **Step 5: Controller (not the implementer):** rolled-back probe, verify nothing persisted, `apply_migration`, run `billing-documents.test.ts`, then `client-engagements.test.ts`, `rate-card.test.ts`, `documents-delivery.test.ts`, `documents-send-issue.test.ts` and `payments.test.ts` (the re-created quote functions and the new triggers must not break them). If a test fails because of a database rule, fix it with a NEW migration `20261012121000_*.sql`; never edit the applied file. Verify production is clean.

---

### Task 5: The application layer: messages, view model, query and actions

**Files:**
- Modify: `features/documents/errors.ts`
- Modify: `tests/unit/documents-vocabulary.test.ts`
- Create: `features/billing/billing-package-model.ts`
- Create: `features/billing/queries/get-billing-package.ts`
- Create: `features/billing/actions/billing.ts`
- Create: `features/billing/revalidate.ts`
- Create: `tests/unit/billing-package-model.test.ts`
- Create: `tests/unit/billing-actions-source.test.ts`

**Interfaces:**
- Consumes: Task 1 (`packageName`, `TIERS`, `PROJECTS` for names only; money and limits come from the database rows); the SQL functions and tokens from Tasks 3 and 4; existing `documentContext()` (`features/documents/server-context.ts`), `failureState()` (`features/documents/action-failure.ts`), `isUuid` (`@/lib/utils`), `isValidIsoDate` (`features/delivery/schemas/date.ts`), `DOCUMENTS` (`features/documents/vocabulary.ts`), `ActionState` (`features/documents/types.ts`).
- Produces:
  - `documentErrorMessage` now maps the 23 new tokens (list in Step 1).
  - `buildBillingPackageView(input: BillingPackageInput): BillingPackageView` and its types (below), pure.
  - `getBillingPackage(clientId: string): Promise<BillingPackageView | null>` (server).
  - Server actions, each `(…ids, _previous: ActionState, form: FormData) => Promise<ActionState>`:
    `setPackageAction(clientId)`, `changeTierAction(engagementId)`, `endEngagementAction(engagementId)`, `addSupportAction(engagementId)`, `endSupportAction(supportId)`, `createFirstDocumentAction(engagementId, kind: 'invoice' | 'quote')`, `createMonthlyInvoiceAction(clientId)`, `createTopUpAction(engagementId)`. The three that build a document redirect to it (`/finance/invoices/<id>` or `/commercial/quotes/<id>`); the others return `{ success }`.

- [ ] **Step 1: Map the new tokens** in `features/documents/errors.ts`

Add these entries to the end of the `MESSAGES` array (before the closing `]`). Order matters only in that a token must not be a substring of an earlier one; none is.

```ts
  ['CLIENT_NOT_FOUND', 'That client was not found.'],
  ['ENGAGEMENT_NOT_FOUND', 'That package was not found.'],
  ['ENGAGEMENT_ENDED', 'That package has already ended, or is not the right kind for this.'],
  ['PACKAGE_UNKNOWN', 'That package is not on the rate card.'],
  ['PACKAGE_UNCHANGED', 'The client is already on that tier.'],
  ['PACKAGE_START_INVALID', 'Check the date. It must be after the current package started and within a year of today.'],
  ['CLIENT_HAS_RETAINER', 'This client already has an active retainer. Use Change tier to move them to another tier.'],
  ['INITIATIVE_LIMIT_REACHED', 'This client has reached the number of active projects their retainer tier allows. End a project, or move the client to a higher tier.'],
  ['SUPPORT_NOT_FOR_PROJECT', 'That support service does not belong to this project.'],
  ['SUPPORT_ALREADY_ACTIVE', 'That support service is already running for this project.'],
  ['SUPPORT_NOT_FOUND', 'That support service was not found, or has already ended.'],
  ['RATE_ITEM_UNAVAILABLE', 'That price is not on the rate card any more. Ask an owner or admin to check Settings, Price list.'],
  ['RATE_CARD_FIXED', 'A rate card item cannot be created by hand, and its kind, package and credits cannot be changed.'],
  ['RATE_CARD_ADMIN_ONLY', 'Only an owner or admin can change a rate card price.'],
  ['RATE_LINE_LOCKED', 'This line comes from the rate card, so its price, quantity and wording cannot be changed. Remove it and build the document again, or add a custom line.'],
  ['BILLING_COLUMNS_GENERATED', 'The billing link on a document is set automatically.'],
  ['FIRST_INVOICE_EXISTS', 'A first invoice already exists for this package. Cancel it first if you need to build it again.'],
  ['FIRST_INVOICE_MISSING', "Build and issue the retainer's first invoice before the monthly ones."],
  ['IMPLEMENTATION_ALREADY_BILLED', 'This retainer continues an earlier one, so its implementation fee has already been billed.'],
  ['NOTHING_TO_BILL', 'There is nothing to bill for that month: no retainer month after the first, and no support service running.'],
  ['MONTH_ALREADY_BILLED', 'That month has already been invoiced for this client. Cancel that invoice first if you need to build it again.'],
  ['BILLING_MONTH_INVALID', 'Choose this month or an earlier one.'],
  ['TOP_UP_CREDITS_INVALID', 'Enter a whole number of credits from 1 to 10,000.'],
```


- [ ] **Step 2: Extend the vocabulary test** `tests/unit/documents-vocabulary.test.ts`

In `every database error token the app maps is raised by the send and issue migration` and in `every token the send and issue migrations raise is either mapped or knowingly left unmapped`, add the three new migrations to the `sendIssue` concatenation:

```ts
  const sendIssue = migration('20261011110000_documents_send_issue.sql') + migration('20261011120000_documents_hardening.sql') + migration('20261011130000_documents_delivery.sql') + migration('20261011140000_payments_overdue.sql') + migration('20261011160000_register_summary.sql')
    + migration('20261012100000_rate_card.sql') + migration('20261012110000_client_engagements.sql') + migration('20261012120000_billing_documents.sql')
```

(Do it in both places.) Add one assertion to `database tokens become plain messages…`:

```ts
  assert.match(documentErrorMessage('INITIATIVE_LIMIT_REACHED')!, /higher tier/i)
  assert.match(documentErrorMessage('new row violates RATE_LINE_LOCKED')!, /rate card/i)
  assert.match(documentErrorMessage('FIRST_INVOICE_EXISTS')!, /first invoice/i)
```

Run `node --test --experimental-strip-types tests/unit/documents-vocabulary.test.ts`; it must pass (every mapped token is raised in a migration; every raised token is mapped or `DOCUMENT_KIND_UNKNOWN`).

- [ ] **Step 3: Write the failing view-model test** `tests/unit/billing-package-model.test.ts`

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBillingPackageView, type BillingPackageInput } from '../../features/billing/billing-package-model.ts'

const rate = (over: Record<string, unknown>) => ({
  rate_key: 'x', item_kind: 'project', package_key: null, title: 'Item', unit_price: 1000, credits: null, initiative_limit: null, rate_status: 'agreed', ...over,
}) as BillingPackageInput['rateRows'][number]

const RATES: BillingPackageInput['rateRows'] = [
  rate({ rate_key: 'retainer.growth.monthly', item_kind: 'retainer_monthly', package_key: 'growth', title: 'Growth Partner: monthly retainer', unit_price: 150000, credits: 75, initiative_limit: 4 }),
  rate({ rate_key: 'retainer.private.monthly', item_kind: 'retainer_monthly', package_key: 'private', title: 'Private Partner: monthly retainer', unit_price: 200000, credits: 120, initiative_limit: 6 }),
  rate({ rate_key: 'retainer.reserve.monthly', item_kind: 'retainer_monthly', package_key: 'reserve', title: 'HIMARK Reserve: monthly retainer', unit_price: 300000, credits: 220, initiative_limit: null }),
  rate({ rate_key: 'project.digital_presence', item_kind: 'project', package_key: 'digital_presence', title: 'Digital Presence: project', unit_price: 45000, credits: 15 }),
  rate({ rate_key: 'support.website_care', item_kind: 'support', package_key: 'digital_presence', title: 'Website Care: monthly', unit_price: 5000, credits: 2 }),
  rate({ rate_key: 'support.digital_presence_management', item_kind: 'support', package_key: 'digital_presence', title: 'Digital Presence Management: monthly', unit_price: 20000, credits: 7 }),
]

const engagement = (over: Record<string, unknown>) => ({
  id: 'e1', kind: 'retainer', package_key: 'growth', start_date: '2026-07-01', ended_on: null, replaces_id: null, root_id: 'e1', ...over,
}) as BillingPackageInput['engagements'][number]

test('a client with nothing recorded offers every retainer tier and project to choose from', () => {
  const view = buildBillingPackageView({ engagements: [], support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [] })
  assert.deepEqual(view.active, [])
  assert.deepEqual(view.packageOptions.retainers.map((o) => o.key), ['growth', 'private', 'reserve'])
  assert.deepEqual(view.packageOptions.projects.map((o) => o.key), ['digital_presence'])
  assert.equal(view.canBuildMonthly, false)
})

test('an active retainer shows its fee, credits, limit, usage, other tiers and whether the first invoice can still be built', () => {
  const view = buildBillingPackageView({
    engagements: [engagement({}), engagement({ id: 'p1', kind: 'project', package_key: 'digital_presence', root_id: 'p1' })],
    support: [], rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  const retainer = view.active.find((p) => p.kind === 'retainer')!
  assert.equal(retainer.name, 'Growth Partner')
  assert.equal(retainer.fee, 150000)
  assert.equal(retainer.credits, 75)
  assert.equal(retainer.initiativeLimit, 4)
  assert.equal(retainer.activeProjects, 1)
  assert.equal(retainer.canBuildFirst, true)
  assert.deepEqual(retainer.otherTiers.map((t) => t.key), ['private', 'reserve'])
  assert.equal(view.canBuildMonthly, true)
})

test('once the first invoice exists it can no longer be built, and a retainer that replaced another never can', () => {
  const view = buildBillingPackageView({
    engagements: [
      engagement({ id: 'e1', ended_on: '2026-09-30' }),
      engagement({ id: 'e2', package_key: 'private', replaces_id: 'e1', root_id: 'e1', start_date: '2026-10-01' }),
    ],
    support: [], rateRows: RATES, firstInvoiceEngagementIds: ['e1'], documents: [],
  })
  assert.equal(view.active.length, 1)
  assert.equal(view.active[0].canBuildFirst, false)
  assert.equal(view.active[0].firstBuilt, true, 'the chain\'s first invoice stands for the replacement')
  assert.equal(view.past.length, 1)
  assert.equal(view.past[0].active, false)
})

test('a project lists its running support and the services it can still add, and the Reserve tier shows no limit', () => {
  const view = buildBillingPackageView({
    engagements: [
      engagement({ id: 'r', package_key: 'reserve', root_id: 'r' }),
      engagement({ id: 'p1', kind: 'project', package_key: 'digital_presence', root_id: 'p1' }),
    ],
    support: [
      { id: 's1', engagement_id: 'p1', service_key: 'support.website_care', start_date: '2026-08-01', ended_on: null },
      { id: 's2', engagement_id: 'p1', service_key: 'support.digital_presence_management', start_date: '2026-07-01', ended_on: '2026-07-31' },
    ],
    rateRows: RATES, firstInvoiceEngagementIds: [], documents: [],
  })
  const project = view.active.find((p) => p.kind === 'project')!
  assert.deepEqual(project.support.filter((s) => s.active).map((s) => s.title), ['Website Care: monthly'])
  assert.deepEqual(project.availableSupport.map((s) => s.key), ['support.digital_presence_management'])
  assert.equal(view.active.find((p) => p.kind === 'retainer')!.initiativeLimit, null)
  assert.equal(view.canBuildMonthly, true)
})

test('the billing history lists documents newest first with a plain label', () => {
  const view = buildBillingPackageView({
    engagements: [], support: [], rateRows: RATES, firstInvoiceEngagementIds: [],
    documents: [
      { id: 'd1', invoice_number: 'DRAFT-1', status: 'Draft', billing_kind: 'monthly', billing_month: '2026-10-01', total_amount: 172500, currency: 'ZAR', created_at: '2026-10-05T10:00:00Z' },
      { id: 'd2', invoice_number: 'TST-I-2026-00001', status: 'Issued', billing_kind: 'first', billing_month: null, total_amount: 345000, currency: 'ZAR', created_at: '2026-09-01T10:00:00Z' },
    ],
  })
  assert.deepEqual(view.documents.map((d) => d.id), ['d1', 'd2'])
  assert.equal(view.documents[0].label, 'Monthly invoice, October 2026')
  assert.equal(view.documents[1].label, 'First invoice')
  assert.equal(view.documents[0].isDraft, true)
})
```

- [ ] **Step 4: Run it to see it fail**

Run: `node --test --experimental-strip-types tests/unit/billing-package-model.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Write `features/billing/billing-package-model.ts`**

```ts
// The view model of a client's Billing package section. Pure: no imports of server code. Prices, credits and limits come from
// the rate card rows in the database (an owner or admin may change them), never from the code data file.
import { packageName } from './rate-card.ts'

export type RateRow = {
  rate_key: string
  item_kind: string
  package_key: string | null
  title: string
  unit_price: number | string
  credits: number | string | null
  initiative_limit: number | null
  rate_status: string
}
export type EngagementRow = { id: string; kind: 'retainer' | 'project'; package_key: string; start_date: string; ended_on: string | null; replaces_id: string | null; root_id: string }
export type SupportRow = { id: string; engagement_id: string; service_key: string; start_date: string; ended_on: string | null }
export type BillingDocumentRow = {
  id: string; invoice_number: string; status: string; billing_kind: 'first' | 'monthly' | 'top_up'; billing_month: string | null
  total_amount: number | string; currency: string; created_at: string
}
export type BillingPackageInput = {
  engagements: EngagementRow[]
  support: SupportRow[]
  rateRows: RateRow[]
  firstInvoiceEngagementIds: string[]
  documents: BillingDocumentRow[]
}

export type SupportView = { id: string; key: string; title: string; price: number; credits: number | null; startDate: string; endedOn: string | null; active: boolean }
export type PackageView = {
  id: string
  kind: 'retainer' | 'project'
  packageKey: string
  name: string
  startDate: string
  endedOn: string | null
  active: boolean
  fee: number | null
  credits: number | null
  /** Built and not cancelled: true for the whole chain of a replaced retainer. */
  firstBuilt: boolean
  canBuildFirst: boolean
  /** Retainer only: how many active projects the tier allows (null = no limit) and how many the client has. */
  initiativeLimit: number | null
  activeProjects: number
  otherTiers: { key: string; name: string; fee: number }[]
  support: SupportView[]
  availableSupport: { key: string; title: string; price: number; credits: number | null }[]
}
export type PackageOption = { key: string; name: string; fee: number; credits: number | null }
export type BillingDocumentView = { id: string; number: string; isDraft: boolean; status: string; label: string; total: number; currency: string }
export type BillingPackageView = {
  active: PackageView[]
  past: PackageView[]
  packageOptions: { retainers: PackageOption[]; projects: PackageOption[] }
  canBuildMonthly: boolean
  documents: BillingDocumentView[]
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const num = (raw: number | string | null): number | null => (raw === null || raw === undefined ? null : Number(raw))

function documentLabel(row: BillingDocumentRow): string {
  if (row.billing_kind === 'first') return 'First invoice'
  if (row.billing_kind === 'top_up') return 'Top-up invoice'
  return row.billing_month ? `Monthly invoice, ${MONTH.format(new Date(`${row.billing_month}T00:00:00Z`))}` : 'Monthly invoice'
}

export function buildBillingPackageView(input: BillingPackageInput): BillingPackageView {
  const monthlyRows = input.rateRows.filter((row) => row.item_kind === 'retainer_monthly')
  const projectRows = input.rateRows.filter((row) => row.item_kind === 'project')
  const supportRows = input.rateRows.filter((row) => row.item_kind === 'support')
  const firstBuilt = new Set(input.firstInvoiceEngagementIds)
  const activeProjects = input.engagements.filter((e) => e.kind === 'project' && e.ended_on === null).length

  const toOption = (row: RateRow): PackageOption => ({ key: String(row.package_key), name: packageName(String(row.package_key)), fee: Number(row.unit_price), credits: num(row.credits) })
  const packageOptions = { retainers: monthlyRows.map(toOption), projects: projectRows.map(toOption) }

  const views: PackageView[] = input.engagements.map((e) => {
    const active = e.ended_on === null
    const row = (e.kind === 'retainer' ? monthlyRows : projectRows).find((r) => r.package_key === e.package_key)
    const support = input.support
      .filter((s) => s.engagement_id === e.id)
      .map((s): SupportView => {
        const item = supportRows.find((r) => r.rate_key === s.service_key)
        return { id: s.id, key: s.service_key, title: item?.title ?? s.service_key, price: Number(item?.unit_price ?? 0), credits: num(item?.credits ?? null), startDate: s.start_date, endedOn: s.ended_on, active: s.ended_on === null }
      })
    const runningKeys = new Set(support.filter((s) => s.active).map((s) => s.key))
    const built = firstBuilt.has(e.root_id)
    return {
      id: e.id,
      kind: e.kind,
      packageKey: e.package_key,
      name: packageName(e.package_key),
      startDate: e.start_date,
      endedOn: e.ended_on,
      active,
      fee: row ? Number(row.unit_price) : null,
      credits: row ? num(row.credits) : null,
      firstBuilt: built,
      canBuildFirst: active && !built && e.replaces_id === null,
      initiativeLimit: e.kind === 'retainer' ? (row?.initiative_limit ?? null) : null,
      activeProjects: e.kind === 'retainer' ? activeProjects : 0,
      otherTiers: e.kind === 'retainer' ? packageOptions.retainers.filter((o) => o.key !== e.package_key).map((o) => ({ key: o.key, name: o.name, fee: o.fee })) : [],
      support,
      availableSupport: e.kind === 'project' && active
        ? supportRows.filter((r) => r.package_key === e.package_key && !runningKeys.has(r.rate_key)).map((r) => ({ key: r.rate_key, title: r.title, price: Number(r.unit_price), credits: num(r.credits) }))
        : [],
    }
  })

  const active = views.filter((v) => v.active)
  const documents = [...input.documents]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((d): BillingDocumentView => ({
      id: d.id, number: d.invoice_number, isDraft: d.status === 'Draft', status: d.status, label: documentLabel(d), total: Number(d.total_amount), currency: d.currency,
    }))
  return {
    active,
    past: views.filter((v) => !v.active),
    packageOptions,
    canBuildMonthly: active.some((v) => v.kind === 'retainer') || active.some((v) => v.support.some((s) => s.active)),
    documents,
  }
}
```

- [ ] **Step 6: Run the test**

Run: `node --test --experimental-strip-types tests/unit/billing-package-model.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the revalidate helper** `features/billing/revalidate.ts`

```ts
import 'server-only'

import { revalidatePath } from 'next/cache'

import { revalidateDocumentPages } from '../documents/revalidate'

/** The client page (its Billing package section and timeline), plus every page that shows a quote or an invoice. */
export function revalidateBillingPages() {
  revalidatePath('/(unison)/operations/clients/[clientId]', 'page')
  revalidateDocumentPages()
}
```

- [ ] **Step 8: Write the query** `features/billing/queries/get-billing-package.ts`

```ts
import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import { isUuid } from '@/lib/utils'
import { buildBillingPackageView, type BillingPackageView } from '../billing-package-model'

const RATE_COLUMNS = 'rate_key,item_kind,package_key,title,unit_price,credits,initiative_limit,rate_status'

/** Everything the client page's Billing package section shows, or null when the id is not a client of this organisation. */
export async function getBillingPackage(clientId: string): Promise<BillingPackageView | null> {
  if (!isUuid(clientId)) return null
  const { organization, db } = await documentContext()
  const engagements = await db
    .from('client_engagements')
    .select('id,kind,package_key,start_date,ended_on,replaces_id,root_id')
    .eq('organization_id', organization.id)
    .eq('client_id', clientId)
    .order('start_date')
  if (engagements.error) throw engagements.error
  const engagementRows = engagements.data ?? []
  const ids: string[] = engagementRows.map((row: { id: string }) => row.id)
  const rootIds: string[] = [...new Set<string>(engagementRows.map((row: { root_id: string }) => row.root_id))]

  const [rates, support, firsts, documents] = await Promise.all([
    db.from('price_list_items').select(RATE_COLUMNS).eq('organization_id', organization.id).not('rate_key', 'is', null).is('archived_at', null),
    ids.length
      ? db.from('engagement_support').select('id,engagement_id,service_key,start_date,ended_on').eq('organization_id', organization.id).in('engagement_id', ids).order('start_date')
      : Promise.resolve({ data: [], error: null }),
    rootIds.length
      ? db.from('invoices').select('engagement_id').eq('organization_id', organization.id).eq('billing_kind', 'first').neq('status', 'Cancelled').in('engagement_id', rootIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('invoices')
      .select('id,invoice_number,status,billing_kind,billing_month,total_amount,currency,created_at')
      .eq('organization_id', organization.id).eq('client_id', clientId).not('billing_kind', 'is', null)
      .order('created_at', { ascending: false }).limit(15),
  ])
  for (const result of [rates, support, firsts, documents]) if (result.error) throw result.error
  return buildBillingPackageView({
    engagements: engagementRows,
    support: support.data ?? [],
    rateRows: rates.data ?? [],
    firstInvoiceEngagementIds: (firsts.data ?? []).map((row: { engagement_id: string }) => row.engagement_id),
    documents: documents.data ?? [],
  })
}
```

- [ ] **Step 9: Write the actions** `features/billing/actions/billing.ts`

```ts
'use server'

import { redirect } from 'next/navigation'

import { failureState } from '@/features/documents/action-failure'
import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { DOCUMENTS } from '@/features/documents/vocabulary'
import { isValidIsoDate } from '@/features/delivery/schemas/date'
import { isUuid } from '@/lib/utils'
import { revalidateBillingPages } from '../revalidate'

const NOT_FOUND_CLIENT = 'That client was not found.'
const NOT_FOUND_PACKAGE = 'That package was not found.'

/** An empty date field means "today" (null); a typed one must be a real calendar date. */
function readDate(form: FormData, name: string): { value: string | null } | { error: string } {
  const raw = String(form.get(name) ?? '').trim()
  if (raw === '') return { value: null }
  return isValidIsoDate(raw) ? { value: raw } : { error: 'Enter a valid date.' }
}

export async function setPackageAction(clientId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { error: NOT_FOUND_CLIENT }
  const date = readDate(form, 'startDate')
  if ('error' in date) return { error: date.error }
  const packageKey = String(form.get('packageKey') ?? '').trim()
  if (!packageKey) return { error: 'Choose a package.' }
  const { db } = await documentContext()
  const result = await db.rpc('set_client_package', { p_client: clientId, p_package_key: packageKey, p_start_date: date.value })
  if (result.error) return failureState(result.error, 'The package could not be recorded. Please try again.')
  revalidateBillingPages()
  return { success: 'Package recorded.' }
}

export async function changeTierAction(engagementId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const date = readDate(form, 'startDate')
  if ('error' in date) return { error: date.error }
  if (date.value === null) return { error: 'Enter the date the new tier starts.' }
  const packageKey = String(form.get('packageKey') ?? '').trim()
  if (!packageKey) return { error: 'Choose the new tier.' }
  const { db } = await documentContext()
  const result = await db.rpc('change_retainer_tier', { p_engagement: engagementId, p_new_package_key: packageKey, p_start_date: date.value })
  if (result.error) return failureState(result.error, 'The tier could not be changed. Please try again.')
  revalidateBillingPages()
  return { success: 'Tier changed. No new implementation fee is billed.' }
}

export async function endEngagementAction(engagementId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const { db } = await documentContext()
  const result = await db.rpc('end_engagement', { p_engagement: engagementId, p_ended_on: null })
  if (result.error) return failureState(result.error, 'The package could not be ended. Please try again.')
  revalidateBillingPages()
  return { success: 'Package ended.' }
}

export async function addSupportAction(engagementId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const date = readDate(form, 'startDate')
  if ('error' in date) return { error: date.error }
  const serviceKey = String(form.get('serviceKey') ?? '').trim()
  if (!serviceKey) return { error: 'Choose a support service.' }
  const { db } = await documentContext()
  const result = await db.rpc('add_support_service', { p_engagement: engagementId, p_service_key: serviceKey, p_start_date: date.value })
  if (result.error) return failureState(result.error, 'The support service could not be recorded. Please try again.')
  revalidateBillingPages()
  return { success: 'Support service recorded.' }
}

export async function endSupportAction(supportId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(supportId)) return { error: 'That support service was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('end_support_service', { p_support: supportId, p_ended_on: null })
  if (result.error) return failureState(result.error, 'The support service could not be ended. Please try again.')
  revalidateBillingPages()
  return { success: 'Support service ended.' }
}

function openBuilt(kind: 'invoice' | 'quote', id: unknown): never | ActionState {
  if (typeof id !== 'string' || !isUuid(id)) return { error: 'The document was built but could not be opened. Find it in the list.' }
  revalidateBillingPages()
  redirect(`${DOCUMENTS[kind].base}/${id}`)
}

export async function createFirstDocumentAction(engagementId: string, kind: 'invoice' | 'quote', _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  if (kind !== 'invoice' && kind !== 'quote') return { error: 'Choose an invoice or a quote.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_first_document', { p_engagement: engagementId, p_kind: kind })
  if (result.error) return failureState(result.error, 'The document could not be built. Please try again.')
  return openBuilt(kind, result.data)
}

export async function createMonthlyInvoiceAction(clientId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { error: NOT_FOUND_CLIENT }
  const { db } = await documentContext()
  const result = await db.rpc('create_monthly_invoice', { p_client: clientId, p_month: null })
  if (result.error) return failureState(result.error, 'The invoice could not be built. Please try again.')
  return openBuilt('invoice', result.data)
}

export async function createTopUpAction(engagementId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(engagementId)) return { error: NOT_FOUND_PACKAGE }
  const raw = String(form.get('credits') ?? '').trim()
  if (!/^\d{1,5}$/.test(raw)) return { error: 'Enter a whole number of credits from 1 to 10,000.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_top_up_invoice', { p_engagement: engagementId, p_credits: Number(raw) })
  if (result.error) return failureState(result.error, 'The top-up invoice could not be built. Please try again.')
  return openBuilt('invoice', result.data)
}
```

(`openBuilt` returns the error state, or redirects, which throws; the actions `return openBuilt(...)`.)

- [ ] **Step 10: Write the source guard** `tests/unit/billing-actions-source.test.ts`

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source = readFileSync(join(process.cwd(), 'features', 'billing', 'actions', 'billing.ts'), 'utf8')

test('the billing actions are a use-server file that exports only async actions', () => {
  assert.match(source, /^'use server'/)
  const exported = [...source.matchAll(/^export (async )?function (\w+)/gm)]
  assert.ok(exported.length >= 8)
  for (const match of exported) assert.ok(match[1], `${match[2]} must be async`)
  assert.equal([...source.matchAll(/^export (?!async function)/gm)].length, 0, 'no non-function exports in a use-server file')
})

test('every action validates its ids and calls exactly its database function', () => {
  const calls: Record<string, string> = {
    setPackageAction: 'set_client_package', changeTierAction: 'change_retainer_tier', endEngagementAction: 'end_engagement',
    addSupportAction: 'add_support_service', endSupportAction: 'end_support_service', createFirstDocumentAction: 'create_first_document',
    createMonthlyInvoiceAction: 'create_monthly_invoice', createTopUpAction: 'create_top_up_invoice',
  }
  for (const [action, rpc] of Object.entries(calls)) {
    const body = source.slice(source.indexOf(`function ${action}`))
    const end = body.indexOf('\nexport ', 10)
    const fn = end === -1 ? body : body.slice(0, end)
    assert.match(fn, /isUuid\(/, `${action} checks its id`)
    assert.ok(fn.includes(`rpc('${rpc}'`), `${action} calls ${rpc}`)
  }
})

test('the document builders never take a price or an amount from the browser', () => {
  assert.doesNotMatch(source, /unit_price|unitPrice|amount/i)
  assert.match(source, /p_credits: Number\(raw\)/)
  assert.match(source, /\/\^\\d\{1,5\}\$\//)
})

test('a built document is opened by redirecting to its page', () => {
  assert.match(source, /redirect\(`\$\{DOCUMENTS\[kind\]\.base\}\/\$\{id\}`\)/)
})
```

- [ ] **Step 11: Run all tests, typecheck, commit**

Run: `pnpm test && pnpm typecheck`
Expected: green.

```bash
git add features/documents/errors.ts tests/unit/documents-vocabulary.test.ts features/billing tests/unit/billing-package-model.test.ts tests/unit/billing-actions-source.test.ts
git commit -m "feat(billing): messages for the new rules, the package view model, its query and the billing actions"
```

---

### Task 6: The screens: Billing package section, price list, line editor, and removing the dead file

**Files:**
- Create: `features/billing/components/billing-package-section.tsx`
- Create: `features/billing/components/billing-forms.tsx`
- Modify: `features/clients/components/client-detail.tsx`
- Modify: `features/documents/types.ts` (`PriceItem`, `DocumentLine`)
- Modify: `features/documents/queries/list-price-items.ts`
- Modify: `features/documents/components/price-list-screen.tsx`
- Modify: `features/documents/components/line-editor.tsx`
- Modify: the page(s) that pass `priceItems` to the line editor (find with `grep -rn "listPriceItems" app features`)
- Delete: `features/clients/components/client-setup-workflow.tsx`
- Create: `tests/unit/billing-ui.test.ts`

**Interfaces:**
- Consumes: Task 5 (`getBillingPackage`, the actions, `BillingPackageView` types); existing `WorkspaceSection` (`@/features/crm-workspace/components/workspace-section`), `ActionButton` (`@/features/crm-workspace/components/action-button`), `formatAmount` (`@/features/documents/document-view`), `documentContext` (gives `role`).
- Produces: `<BillingPackageSection clientId={string} />` (async server component); `listPriceItems(options?: { includeRateCard?: boolean })` where the default now excludes rate card items (so the line editor picker lists custom items only) and the price list screen passes `{ includeRateCard: true }`; `PriceItem` gains `rate_key: string | null`, `item_kind: string | null`, `credits: number | string | null`, `initiative_limit: number | null`, `rate_status: string | null`; `DocumentLine` gains `rate_locked: boolean`.

- [ ] **Step 1: Write the failing source test** `tests/unit/billing-ui.test.ts`

```ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8')

test('the dead client setup file with the old prices is gone', () => {
  assert.equal(existsSync(join(process.cwd(), 'features', 'clients', 'components', 'client-setup-workflow.tsx')), false)
  assert.doesNotMatch(read('config', 'partner-levels.ts'), /185,?000|75,?000/, 'the old prices are not used anywhere')
})

test('the client page mounts the Billing package section for an active client', () => {
  const detail = read('features', 'clients', 'components', 'client-detail.tsx')
  assert.match(detail, /import \{ BillingPackageSection \} from '@\/features\/billing\/components\/billing-package-section'/)
  assert.match(detail, /<BillingPackageSection clientId=\{client\.id\} \/>/)
  assert.match(detail, /!archived/)
})

test('the section offers exactly the built things: package, first invoice or quote, monthly invoice, top-up, change tier, support, end', () => {
  const section = read('features', 'billing', 'components', 'billing-package-section.tsx')
  const forms = read('features', 'billing', 'components', 'billing-forms.tsx')
  for (const action of ['setPackageAction', 'changeTierAction', 'endEngagementAction', 'addSupportAction', 'endSupportAction', 'createFirstDocumentAction', 'createMonthlyInvoiceAction', 'createTopUpAction']) {
    assert.ok(section.includes(action) || forms.includes(action), `${action} is wired`)
  }
  assert.doesNotMatch(section + forms, /credit balance|remaining credits|expires/i, 'no control for credit balances, which are not built')
  assert.match(section, /Active projects/)
  assert.match(section, /no limit/i)
})

test('the price list marks rate card items, hides Edit and Archive from members, and the picker lists custom items only', () => {
  const screen = read('features', 'documents', 'components', 'price-list-screen.tsx')
  assert.match(screen, /Rate card/)
  assert.match(screen, /Proposed rate/)
  assert.match(screen, /canManageRates/)
  const query = read('features', 'documents', 'queries', 'list-price-items.ts')
  assert.match(query, /includeRateCard/)
  assert.match(query, /\.is\('rate_key', null\)/)
})

test('a locked line shows no edit control and says it is a rate card price', () => {
  const editor = read('features', 'documents', 'components', 'line-editor.tsx')
  assert.match(editor, /line\.rate_locked/)
  assert.match(editor, /Rate card price/)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test --experimental-strip-types tests/unit/billing-ui.test.ts`
Expected: FAIL (the file still exists, imports are missing).

- [ ] **Step 3: Delete the dead file**

```bash
git rm features/clients/components/client-setup-workflow.tsx
```

Then `grep -rn "client-setup-workflow" tests features app config lib` (it must only appear in the old foundation plan under `docs/`); if a test file asserts on that file, update the test to stop reading it (do not weaken any other assertion).

- [ ] **Step 4: Extend the types and the price list query**

In `features/documents/types.ts`:

```ts
export type PriceItem = {
  id: string
  title: string
  description: string | null
  unit_price: number | string
  vat_code: string
  archived_at: string | null
  rate_key: string | null
  item_kind: string | null
  credits: number | string | null
  initiative_limit: number | null
  rate_status: string | null
}
```

and add `rate_locked: boolean` to `DocumentLine` (after `price_list_item_id`).

In `features/documents/queries/list-price-items.ts` replace the file body with:

```ts
import 'server-only'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'
import type { PriceItem } from '../types'

const COLUMNS = 'id,title,description,unit_price,vat_code,archived_at,rate_key,item_kind,credits,initiative_limit,rate_status'

/** The price list. By default only custom items: the rate card is not offered in a document's picker, because its lines
 *  come from the billing buttons and are locked. The price list screen asks for everything. */
export async function listPriceItems(options: { includeRateCard?: boolean } = {}): Promise<PriceItem[]> {
  const { organization, db } = await documentContext()
  let query = db.from('price_list_items').select(COLUMNS).eq('organization_id', organization.id).is('archived_at', null)
  if (!options.includeRateCard) query = query.is('rate_key', null)
  const result = await query.order('title')
  if (result.error) throw result.error
  return (result.data ?? []) as PriceItem[]
}

export async function getPriceItem(id: string): Promise<PriceItem | null> {
  if (!isUuid(id)) return null
  const { organization, db } = await documentContext()
  const result = await db.from('price_list_items').select(COLUMNS).eq('id', id).eq('organization_id', organization.id).is('archived_at', null).maybeSingle()
  if (result.error) throw result.error
  return (result.data as PriceItem | null) ?? null
}
```

`grep -rn "listPriceItems" app features` and keep every existing caller as is (they get custom items), except `price-list-screen.tsx`.

- [ ] **Step 5: Update the price list screen** `features/documents/components/price-list-screen.tsx`

Change the first lines of the component to read the role and include the rate card, and render rate card items with a tag and no controls for members:

```tsx
export async function PriceListScreen({ editId, saved }: { editId?: string; saved?: string }) {
  const [{ role }, items, editing] = await Promise.all([
    documentContext(),
    listPriceItems({ includeRateCard: true }),
    editId ? getPriceItem(editId) : Promise.resolve(null),
  ])
  const canManageRates = role === 'owner' || role === 'admin'
```

(import `documentContext` from `../server-context`.) In the item row, after the title paragraph add the tag and the credits/limit/proposed notes, and gate the buttons:

```tsx
                    <p className="break-words text-sm font-medium text-foreground">
                      {item.title}
                      {item.rate_key ? <span className="ml-2 border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--briefing-muted)]">Rate card</span> : null}
                      {item.rate_status === 'proposed' ? <span className="ml-2 border border-amber-300 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-800">Proposed rate</span> : null}
                    </p>
```

and below the existing price line:

```tsx
                    {item.rate_key ? (
                      <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                        {item.credits !== null ? `${Number(item.credits)} credits` : null}
                        {item.item_kind === 'retainer_monthly' ? `${item.credits !== null ? ' · ' : ''}${item.initiative_limit ? `${item.initiative_limit} active projects allowed` : 'no limit on active projects'}` : null}
                      </p>
                    ) : null}
```

Wrap the Edit link and the Archive button so they render only when `!item.rate_key || canManageRates`. Add a note under the header description when `!canManageRates`: `<p className="mb-4 text-sm text-[var(--briefing-muted)]">Rate card items can only be changed by an owner or admin.</p>`.

Check the existing `PriceItemForm` still shows an edit form for a rate card item for an admin: it edits title, description, price and VAT only (the rate columns are not in the form), which the guard allows for admins. The form must not offer to change the initiative limit unless you add that field: add a number input `initiativeLimit` in `price-item-form.tsx` shown only when `item?.item_kind === 'retainer_monthly'`, and read/validate it in `readPriceItemFields` (`features/documents/fields.ts`): empty means null, otherwise a whole number from 1 to 50; send it as `initiative_limit` only for that item kind. Add a unit test for the parsing in `tests/unit/documents-fields.test.ts` (empty to null; `0`, `-1`, `1.5`, `x`, `51` refused).

- [ ] **Step 6: Update the line editor** `features/documents/components/line-editor.tsx`

In `LineRow`, replace the `locked ? null : (...)` buttons block so a rate card line keeps Up, Down and Remove but loses Edit:

```tsx
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          {line.rate_locked ? null : (
            <button type="button" onClick={() => setEditing(true)} aria-label={`Edit line: ${line.title}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
              Edit
            </button>
          )}
          {/* Up, Down and Remove as before */}
        </div>
      )}
```

(keep the existing Up, Down and Remove elements exactly as they are, inside this div). Under the line's description paragraph add, when `line.rate_locked`: `<p className="mt-1 text-xs font-medium text-[var(--briefing-muted)]">Rate card price. It cannot be changed here.</p>`. Also make the early `if (editing && !locked)` branch require `!line.rate_locked`. The document queries select `*` from the lines table, so `rate_locked` arrives with no query change; confirm by reading `features/documents/queries/get-document.ts`.

- [ ] **Step 7: Write the client forms** `features/billing/components/billing-forms.tsx`

```tsx
'use client'

import { useActionState } from 'react'

import type { ActionState } from '@/features/documents/types'
import {
  addSupportAction, changeTierAction, createTopUpAction, setPackageAction,
} from '../actions/billing'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'
const button = 'bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60'

function Feedback({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm text-success">{state.success}</p>
  return null
}

type Option = { key: string; label: string }

export function SetPackageForm({ clientId, retainers, projects, hasActiveRetainer }: { clientId: string; retainers: Option[]; projects: Option[]; hasActiveRetainer: boolean }) {
  const [state, action, pending] = useActionState(setPackageAction.bind(null, clientId), undefined)
  return (
    <form action={action} className="grid gap-3 border-t border-border p-5 md:grid-cols-[2fr_1fr_auto]">
      <select name="packageKey" aria-label="Package" required defaultValue="" className={field}>
        <option value="" disabled>Choose a package</option>
        <optgroup label="Retainer">
          {retainers.map((o) => <option key={o.key} value={o.key} disabled={hasActiveRetainer}>{o.label}</option>)}
        </optgroup>
        <optgroup label="Project">
          {projects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </optgroup>
      </select>
      <input name="startDate" type="date" aria-label="Start date (leave empty for today)" className={field} />
      <button disabled={pending} className={button}>{pending ? 'Saving…' : 'Record package'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}

export function ChangeTierForm({ engagementId, tiers }: { engagementId: string; tiers: Option[] }) {
  const [state, action, pending] = useActionState(changeTierAction.bind(null, engagementId), undefined)
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
      <select name="packageKey" aria-label="New tier" required defaultValue="" className={field}>
        <option value="" disabled>Change tier to…</option>
        {tiers.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <input name="startDate" type="date" required aria-label="New tier starts on" className={field} />
      <button disabled={pending} className={button}>{pending ? 'Saving…' : 'Change tier'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}

export function AddSupportForm({ engagementId, services }: { engagementId: string; services: Option[] }) {
  const [state, action, pending] = useActionState(addSupportAction.bind(null, engagementId), undefined)
  if (services.length === 0) return null
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
      <select name="serviceKey" aria-label="Support service" required defaultValue="" className={field}>
        <option value="" disabled>Add a signed support service…</option>
        {services.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <input name="startDate" type="date" aria-label="Starts on (leave empty for today)" className={field} />
      <button disabled={pending} className={button}>{pending ? 'Saving…' : 'Add service'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}

export function TopUpForm({ engagementId, rateLabel }: { engagementId: string; rateLabel: string }) {
  const [state, action, pending] = useActionState(createTopUpAction.bind(null, engagementId), undefined)
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
      <input name="credits" inputMode="numeric" pattern="[0-9]*" required aria-label="Extra credits" placeholder="Extra credits" className={field} />
      <p className="self-center text-xs text-[var(--briefing-muted)]">{rateLabel}</p>
      <button disabled={pending} className={button}>{pending ? 'Building…' : 'Build top-up invoice'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}
```

- [ ] **Step 8: Write the section** `features/billing/components/billing-package-section.tsx`

```tsx
import Link from 'next/link'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatAmount } from '@/features/documents/document-view'
import { formatCurrency } from '@/lib/utils/format-money'
import {
  createFirstDocumentAction, createMonthlyInvoiceAction, endEngagementAction, endSupportAction,
} from '../actions/billing'
import type { PackageView } from '../billing-package-model'
import { getBillingPackage } from '../queries/get-billing-package'
import { AddSupportForm, ChangeTierForm, SetPackageForm, TopUpForm } from './billing-forms'

const money = (amount: number) => formatCurrency(amount, 'ZAR')

function PackageCard({ pkg, topUpRate }: { pkg: PackageView; topUpRate: string }) {
  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{pkg.name} <span className="font-normal text-[var(--briefing-muted)]">· {pkg.kind === 'retainer' ? 'Retainer' : 'Project'}</span></p>
          <p className="text-xs text-[var(--briefing-muted)]">
            Started {pkg.startDate}
            {pkg.fee !== null ? ` · ${money(pkg.fee)}${pkg.kind === 'retainer' ? ' a month' : ''} excluding VAT` : ''}
            {pkg.credits !== null ? ` · ${pkg.credits} credits included` : ''}
          </p>
          {pkg.kind === 'retainer' ? (
            <p className="text-xs text-[var(--briefing-muted)]">
              Active projects: {pkg.activeProjects}{pkg.initiativeLimit ? ` of ${pkg.initiativeLimit} allowed` : ' (no limit set for this tier)'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {pkg.canBuildFirst ? (
            <>
              <ActionButton action={createFirstDocumentAction.bind(null, pkg.id, 'invoice')} label="Create first invoice" ariaLabel={`Create first invoice: ${pkg.name}`} />
              <ActionButton action={createFirstDocumentAction.bind(null, pkg.id, 'quote')} label="Create first quote" ariaLabel={`Create first quote: ${pkg.name}`} />
            </>
          ) : null}
          <ActionButton action={endEngagementAction.bind(null, pkg.id)} label="End package" ariaLabel={`End package: ${pkg.name}`} confirmText="End this package? Any support services on it end too. Documents already built are not changed." tone="danger" />
        </div>
      </div>
      {pkg.firstBuilt ? <p className="text-xs text-[var(--briefing-muted)]">The first invoice has been built{pkg.kind === 'retainer' ? '; the implementation fee is billed once' : ''}.</p> : null}

      {pkg.kind === 'project' ? (
        <div className="space-y-2">
          {pkg.support.filter((s) => s.active).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{s.title} <span className="text-xs text-[var(--briefing-muted)]">· {money(s.price)} a month{s.credits !== null ? ` · ${s.credits} credits` : ''} · since {s.startDate}</span></span>
              <ActionButton action={endSupportAction.bind(null, s.id)} label="End service" ariaLabel={`End service: ${s.title}`} confirmText="End this support service?" tone="danger" />
            </div>
          ))}
          <AddSupportForm engagementId={pkg.id} services={pkg.availableSupport.map((s) => ({ key: s.key, label: `${s.title} (${money(s.price)} a month)` }))} />
        </div>
      ) : (
        <ChangeTierForm engagementId={pkg.id} tiers={pkg.otherTiers.map((t) => ({ key: t.key, label: `${t.name} (${money(t.fee)} a month)` }))} />
      )}
      <TopUpForm engagementId={pkg.id} rateLabel={topUpRate} />
    </li>
  )
}

/** The client's package and the buttons that build its invoices from the rate card. Nothing here issues or sends anything. */
export async function BillingPackageSection({ clientId }: { clientId: string }) {
  const view = await getBillingPackage(clientId)
  if (!view) return null
  const hasRetainer = view.active.some((p) => p.kind === 'retainer')
  return (
    <WorkspaceSection
      title="Billing package"
      description="The client's retainer and projects. Invoices and quotes are built from the rate card as drafts for you to review and issue; prices come from the rate card and cannot be changed on them."
    >
      {view.active.length ? (
        <ul className="divide-y divide-border">
          {view.active.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} topUpRate="Top-up credits are charged at the rate card rate (a proposed rate) plus VAT." />)}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No package recorded for this client yet.</p>
      )}

      {view.canBuildMonthly ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-sm text-[var(--briefing-muted)]">The retainer's monthly fee (from the month after it started) and the support services running this month.</p>
          <ActionButton action={createMonthlyInvoiceAction.bind(null, clientId)} label="Create this month's invoice" />
        </div>
      ) : null}

      <SetPackageForm
        clientId={clientId}
        hasActiveRetainer={hasRetainer}
        retainers={view.packageOptions.retainers.map((o) => ({ key: o.key, label: `${o.name} (${money(o.fee)} a month${o.credits ? `, ${o.credits} credits` : ''})` }))}
        projects={view.packageOptions.projects.map((o) => ({ key: o.key, label: `${o.name} (${money(o.fee)}${o.credits ? `, ${o.credits} credits` : ''})` }))}
      />

      {view.documents.length ? (
        <div className="border-t border-border">
          <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-[var(--briefing-muted)]">Built from the package</p>
          <ul className="divide-y divide-border">
            {view.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/finance/invoices/${d.id}`} className="font-semibold text-brand hover:underline">{d.label}</Link>
                <span className="text-muted-foreground">{d.isDraft ? 'Draft' : d.number} · {d.status} · {d.currency} {formatAmount(d.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.past.length ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-[var(--briefing-muted)]">{view.past.length} earlier package{view.past.length === 1 ? '' : 's'}</summary>
          <ul className="divide-y divide-border">
            {view.past.map((p) => (
              <li key={p.id} className="px-5 py-3 text-sm text-[var(--briefing-muted)]">{p.name} · {p.kind === 'retainer' ? 'Retainer' : 'Project'} · {p.startDate} to {p.endedOn}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </WorkspaceSection>
  )
}
```

The top-up label text above is the same for every package; the amount is not shown because the rate card is the single source of truth and the invoice carries it. Check `WorkspaceSection`'s props (`title`, `description`, children) in `features/crm-workspace/components/workspace-section.tsx` and adjust if different.

- [ ] **Step 9: Mount the section** in `features/clients/components/client-detail.tsx`

Add the import `import { BillingPackageSection } from '@/features/billing/components/billing-package-section'` and render it for a client that is not archived, between the record workspace sections and the documents:

```tsx
    <RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />
    {!archived ? <BillingPackageSection clientId={client.id} /> : null}
    {!archived ? <ClientDocuments /> : null}
```

`ClientDetail` is a synchronous server component; rendering an async server component child is fine.

- [ ] **Step 10: Run the tests**

Run: `pnpm test && pnpm typecheck`
Expected: green. Fix any existing source test that asserted on a changed line editor or price list string only by updating it to the new text (keep its intent).

- [ ] **Step 11: Check the UI in the preview** (implementer, with a fixture; do not use production data)

Do not start a server against production data to click through; the controller does the signed-in preview in Task 7. The implementer only confirms `pnpm build` compiles: `pnpm build` (expect success).

- [ ] **Step 12: Commit**

```bash
git add features/billing/components features/clients/components/client-detail.tsx features/documents tests/unit/billing-ui.test.ts tests/unit/documents-fields.test.ts
git commit -m "feat(billing): the Billing package section, rate card tags and locked lines in the screens, and remove the dead client setup file"
```

---

### Task 7: Controller: apply, verify, document

**Files:**
- Modify: `docs/crm-roadmap.md`, `docs/follow-ups.md`
- Modify: memory notes

This task is done by the controller, not an implementer.

- [ ] **Step 1: Confirm all three migrations are applied and the HIMARK rate card is in production**

Run through `execute_sql`: `select count(*), count(*) filter (where rate_status = 'proposed'), min(unit_price), max(unit_price) from public.price_list_items where organization_id = '00000000-0000-4000-8000-000000000001' and rate_key is not null;` expect `28, 5, 1363.64, 300000.00`; and `select rate_key, initiative_limit from public.price_list_items where item_kind = 'retainer_monthly' and organization_id = '00000000-0000-4000-8000-000000000001' order by unit_price;` expect limits `2, 4, 6, null`.

- [ ] **Step 2: Full gates**

Run: `pnpm test`, `pnpm typecheck`, `pnpm build`, then `pnpm test:rls` (expect only the 2 known provision-organization failures; 100% of the new suites pass). Delete `.next/dev/types/validator.ts` if it blocks typecheck. After the RLS run, check production has no fixture rows (organisations 1, users 2, no engagements or invoices) and delete this run's `project_dependencies` null-org audit rows by id as before.

- [ ] **Step 3: Signed-in preview of the client page with the user** (the user's own walk-through; the controller starts `preview_start unison-dev`). Checklist for the user: record Growth on a TEST client, build the first invoice (R345,000 including VAT, two lines, locked), try to edit a line price (refused), add a fifth project (refused with the limit message), change tier to Private (no implementation fee), build this month's invoice, add a top-up. Archive the TEST invoices and clients afterwards.

- [ ] **Step 4: Docs.** In `docs/crm-roadmap.md` add under Stage 2 a line: `- [x] Pricing and credit model: the HIMARK rate card, packages on the client, first, monthly and top-up invoices built from it, per-tier project limits (built 2026-10-12, waiting for the signed-in walk-through)`. In `docs/follow-ups.md` add a "From the pricing and credit model" section listing: credit balances, expiry and rollover not built (workbook decisions 1 to 7 open); top-up rates are proposed; the four retainer prices now live in `config/partner-levels.ts` and the rate card (a unit test keeps them equal); monthly invoices are built by a button, not automatically, and there is no proration; the integrated podcast bundle is not stopped from overlapping the stand-alone ones; tier change grants no extra implementation credits; the rate card is seeded only for HIMARK; a mid-month tier change bills the whole month at the tier in force on the last day.

- [ ] **Step 5: Commit the docs, update memory, then offer the finishing menu** (merge locally, push and open a PR, keep as is) and wait for the user's choice.

---

## Self-Review (run against the spec; fixes already applied above)

**Spec coverage:**
- Section 2 rate card (28 items, values, credits in text, proposed note): Task 1 data and test, Task 2 seed and its equality test.
- Section 3 rules (admin-only, immutable identity, locked lines, copied prices): Task 2 guards and tests; "copies" tested in Task 4 (later rate card change leaves a draft).
- Section 4 package, initiative limit (2/4/6/none, refusal, admin-adjustable, projects billed own fee, support, engagement_type, tier change without new fee): Task 3 (functions, trigger, tests) and Task 4 (first documents, IMPLEMENTATION_ALREADY_BILLED).
- Section 5 buttons (first invoice/quote, monthly, top-up, change tier): Tasks 3 and 4 (database), Tasks 5 and 6 (actions, screens).
- Section 6 data changes: Tasks 2 to 4.
- Section 7 screens, removal of the dead file, picker custom-only: Task 6.
- Section 8 checks: unit (Task 1), database (Tasks 2 to 4), source (Tasks 5, 6), rollout and walk-through (Task 7).
- Sections 9 to 11 (not built, open decisions, assumptions): follow-ups in Task 7.

**Placeholder scan:** none intended. Step 2 of Task 2 generates the 28 SQL rows with a script (the rows are derived data, verified by the unit test).

**Type consistency:** `RateItem` keys and the SQL `rate_key` values (`retainer.<tier>.monthly|implementation|top_up`, `project.<key>`, `project.top_up`, `support.<key>`) are identical in Task 1, the seed, the functions (`'retainer.' || package_key || '.monthly'`, `'project.' || package_key`, `'project.top_up'`, service keys passed whole) and the UI (`support.…` keys from `availableSupport`). `RateRow.rate_key` in the view model is the same string. Action names match the `Produces` list and the source test.

