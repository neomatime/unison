# Registers That Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The five commercial and finance registers (Leads, Quotes, Sales, Invoices, Expenses) search, filter, sort and page in the database at any size with true totals and true summary cards, their detail pages load one record, Archive and Restore really save, and Export downloads everything that matches the current filters.

**Architecture:** One pure definition per register (`register-spec.ts`) drives the page-address reader, the page query, the export and the screen, so what matches can never differ between them. The database serves one page (25 rows) plus the exact total through the ordinary row-security-protected tables; a `register_summary` SQL function gives the cards over all non-archived rows. The row-to-record mapping becomes a pure per-row function with name lookups only for the ids on the page. A new server-rendered register screen sits beside the shared client register component, which is not touched.

**Tech Stack:** Next.js 16 App Router (server components, server actions, route handlers), React 19, Supabase Postgres (RLS, `security invoker` function), `node --test --experimental-strip-types`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-registers-scale-design.md` (the binding authority; where this plan departs from it the departure is listed under "Decisions made while planning" and Task 5 writes it into the spec).

## Global Constraints

Every task's requirements include these. Values are copied from the spec.

- `unison-uat` (Supabase project `nwdzpjzllhhqwawmsxjd`) is **production**. Every test row is deleted, with its audit events; rolled-back probes before applying any migration; **only the controller applies migrations or touches production**. Implementers never run the RLS suite or any SQL against the database.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them. A control in the UI is a claim the product supports it: nothing on these registers pretends to save. No role-based behaviour is invented: every active member can archive and restore.
- 25 rows per page; search at least 2 characters and at most 120; the search text keeps only letters, digits, spaces and `. @ + ' -`; a sort column, status or owner that is not on the register's list is ignored; a page past the end shows the last page. Nothing from the page address reaches the database except through the register rules' allow-lists and the cleaned search.
- Cards are over all non-archived rows (not the page, not the filtered result); money is per currency and never added across currencies; the card shows the main currency (ZAR when present, otherwise the first by name) and says "other currencies not included" when others exist.
- Export is of everything that matches the current filters across all pages, at most 5,000 rows; above that the route answers 413 "More than 5,000 rows match. Narrow the search and try again." and sends no file.
- **Do not touch `public/`, `features/product-ui/components/record-collection-workspace.tsx` or `features/commercial-finance/components/record-collection-workspace.tsx`.** Unit-tested modules use relative imports with the `.ts` extension, carry no `'use server'`/`'use client'` directive and import neither `server-only` nor `@/...`; they use `createElement`, not JSX, if they build elements. `'use server'` modules export only async functions and types.
- No real address, bank, VAT or phone value in code or tests. Secrets live in `.env.local` only. Never `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean`; stage explicit paths. Commit only when the task says to; never push.
- This Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing route, caching or `searchParams` code (AGENTS.md). Use the Edit/Write tools for file edits.
- End every commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Decisions made while planning

Small departures from the spec, each with its reason. Task 5 writes them into the spec as an "Amendments" section.

1. **"Show archived" shows only archived records** (as the shared register does today), not archived and active together.
2. **The page address names a sortable column by its screen column id** (`sort=due`), and the register rules map each id to its database column; the default order (a database column such as `created_at`) is used when `sort` is absent.
3. **The Sales "Weighted forecast" card counts open opportunities only.** Today it multiplies every row, Won and Lost included, which inflates it; the spec's wording ("value times probability" on the open pipeline) is taken literally.
4. **Row actions are inline links and buttons (View, Edit, Archive or Restore), not a menu,** so they work without scripts and need no new client component for the menu.
5. **The Import button links to the existing import page** with the same slug the shared register derives (`collectionSlug(pathname, "<Singular> Register")`), so the existing page keeps working.
6. **The register toolbar is a small client component** (search, status, owner, archived switch change the address); sort headings, pages, View, Edit and Clear filters are plain links, and the table itself is a server component.
7. **The name lookups for the edit forms' select lists (`getPhaseSixOptions`) stay as they are;** only the registers and the detail pages stop using them. Long select lists on the forms are a follow-up.
8. **The old per-register list functions and `registerConfig` branches for these five kinds are removed;** the forecast kind's old code stays unreachable (slice C decision 6).

## Review Focus

Failure modes the spec implies that are most likely to hurt someone. Each has a test in the task named.

1. **A hostile or broken page address** (a search with commas, brackets, `%`, `_`, quotes or 500 characters; `sort=password`; `status=x`; `owner=not-a-uuid`; `page=0`, `-3`, `abc`, `999999999`) is ignored or cleaned and never reaches the database raw. *(Task 1 unit tests.)*
2. **More than 1,000 rows:** the last page and the exact total are reachable; nothing is silently missing. *(Task 1 database test with 1,100 fixture rows.)*
3. **A page past the end, a filter that leaves no rows, the last partial page** show the last page, "Nothing matches these filters" with Clear filters, and the right "Showing 1,101–1,100"-style arithmetic is never produced. *(Task 1 page arithmetic; Task 3 screen guards.)*
4. **Mixed currencies on a card** are never added together and the card says so. *(Task 1 unit tests and database test.)*
5. **Archive or Restore twice, on another organisation's record, or on a malformed id,** and a detail page for a missing or foreign record, give plain messages and change nothing. *(Task 2.)*

---

## File structure

**Create**

- `features/registers/register-spec.ts`, `read-register-params.ts`, `apply-filters.ts`, `page-math.ts`, `summary.ts`, `register-view.ts` (all pure).
- `features/registers/queries/query-register.ts`, `get-register-summary.ts`, `list-owners.ts` (server only).
- `features/registers/actions/archive.ts`.
- `features/registers/components/register-screen.tsx`, `register-toolbar.tsx`, `register-export.tsx`.
- `features/commercial-finance/phase-six-mappers.ts` (pure: the per-row mapping and the name-id collection).
- `supabase/migrations/20261011160000_register_summary.sql`.
- Tests: `tests/unit/registers-spec.test.ts`, `registers-params.test.ts`, `registers-filters.test.ts`, `registers-summary.test.ts`, `registers-ui.test.ts`, `phase-six-mappers.test.ts`; `tests/integration/rls/register-summary.test.ts`.

**Modify**

- `features/commercial-finance/queries/phase-six.ts` (use the mappers, name lookups for ids, single-record read).
- `features/commercial-finance/components/phase-six-register.tsx` (delegate the five kinds to the new screen; keep the forecast branch).
- The five register `page.tsx` files; `app/api/records/export/route.ts`.
- `tests/unit/documents-ui.test.ts`, `tests/unit/phase-six-commercial-finance.test.ts` (guards that read the moved code), `tests/unit/documents-vocabulary.test.ts` (error token list), `features/documents/errors.ts`.

---

### Task 1: The register rules, the address reader, the filters, the summary and the migration

**Files:**
- Create: `features/registers/register-spec.ts`, `read-register-params.ts`, `apply-filters.ts`, `page-math.ts`, `summary.ts`, `register-view.ts`; `supabase/migrations/20261011160000_register_summary.sql`
- Test: `tests/unit/registers-spec.test.ts`, `registers-params.test.ts`, `registers-filters.test.ts`, `registers-summary.test.ts`; `tests/integration/rls/register-summary.test.ts`
- Modify: `features/documents/errors.ts`, `tests/unit/documents-vocabulary.test.ts`

**Interfaces:**
- Consumes: `isUuid` from `lib/utils/index.ts` (relative import).
- Produces (later tasks rely on these exact names):
  - `REGISTER_KINDS`, `type RegisterKind`, `isRegisterKind(value: unknown): value is RegisterKind`, `type SortDir = 'asc' | 'desc'`, `type RegisterSpec`, `REGISTERS: Record<RegisterKind, RegisterSpec>` in `register-spec.ts`.
  - `PAGE_SIZE = 25`, `type RegisterParams = { q: string; status: string | null; owner: string | null; archived: boolean; sort: string | null; dir: SortDir; page: number; searchTooShort: boolean }`, `cleanSearch(raw: string): string`, `readRegisterParams(kind, raw): RegisterParams`, `registerHref(base: string, params: RegisterParams, change?: Partial<RegisterParams>): string` in `read-register-params.ts`.
  - `applyRegisterFilters(query, kind, params, organizationId)`, `applyRegisterOrder(query, kind, params)`, `searchFilter(columns: readonly string[], q: string): string` in `apply-filters.ts`.
  - `pageWindow(page: number, total: number, size?: number): { page: number; pageCount: number; from: number; to: number; rangeFrom: number; rangeTo: number }` in `page-math.ts`.
  - `mainCurrency(maps: Array<Record<string, number>>): string | null`, `buildCards(kind: RegisterKind, summary: unknown): Array<{ label: string; value: string; detail: string }>`, `money(amount: number, currency: string): string` in `summary.ts`.
  - `REGISTER_FRAMES: Record<RegisterKind, RegisterFrame>`, `type RegisterRow = { id: string; name: string; status: string; archived: boolean; cells: Record<string, string> }`, `toRegisterRow(kind, record): RegisterRow` in `register-view.ts`.
  - SQL `public.register_summary(p_org uuid, p_kind text) returns jsonb`; `forecast_months` ignores archived invoices; error token `REGISTER_KIND_UNKNOWN` (mapped).
- **You write and commit the files; you do not apply the migration and you do not run the RLS suite** (production). The controller probes the migration, applies it and runs the RLS file; defects come back as fix rounds. Run only unit tests, `pnpm typecheck` and `pnpm test`.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/registers-spec.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { REGISTERS, REGISTER_KINDS, isRegisterKind } from '../../features/registers/register-spec.ts'

const migrations = () => {
  const directory = join(process.cwd(), 'supabase', 'migrations')
  return readdirSync(directory).filter((name) => name.endsWith('.sql')).sort().map((name) => readFileSync(join(directory, name), 'utf8')).join('\n')
}
const list = (raw: string) => raw.split(',').map((value) => value.trim().replace(/^'|'$/g, ''))

test('the five registers are the ones the spec names', () => {
  assert.deepEqual([...REGISTER_KINDS], ['lead', 'quote', 'opportunity', 'invoice', 'expense'])
  assert.equal(isRegisterKind('invoice'), true)
  assert.equal(isRegisterKind('forecast'), false)
  assert.equal(isRegisterKind(undefined), false)
})

test('every register names a table, search columns, a status column, an owner column, sortable columns and a default order', () => {
  for (const kind of REGISTER_KINDS) {
    const spec = REGISTERS[kind]
    assert.ok(spec.table && spec.collection && spec.searchColumns.length > 0 && spec.statusColumn && spec.ownerColumn, kind)
    assert.ok(Object.keys(spec.sortable).length >= 5, kind)
    assert.match(spec.defaultSort.column, /^[a-z_]+$/)
    assert.ok(['asc', 'desc'].includes(spec.defaultSort.dir))
    for (const column of [...spec.searchColumns, spec.statusColumn, spec.ownerColumn, ...Object.values(spec.sortable), spec.defaultSort.column]) {
      assert.match(column, /^[a-z_]+$/, `${kind}: ${column} is a plain column name`)
    }
  }
})

test('the status lists equal the database checks', () => {
  const sql = migrations()
  const check = (table: string, column: string) => {
    const block = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))
    assert.ok(block, `${table} table definition`)
    const match = block![1].match(new RegExp(`${column} text not null default '[^']*'\\s*check \\(${column} in \\(([^)]*)\\)\\)`))
    assert.ok(match, `${table}.${column} check`)
    return list(match![1])
  }
  assert.deepEqual([...REGISTERS.lead.statuses], check('leads', 'status'))
  assert.deepEqual([...REGISTERS.quote.statuses], check('quotes', 'status'))
  assert.deepEqual([...REGISTERS.opportunity.statuses], check('sales_opportunities', 'stage'))
  assert.deepEqual([...REGISTERS.invoice.statuses], check('invoices', 'status'))
  assert.deepEqual([...REGISTERS.expense.statuses], check('expenses', 'status'))
})
```

(If a table's check is written across lines differently, adjust the regex to the real text in `supabase/migrations/20260910175724_phase_six_commercial_finance.sql`; the assertion that the lists equal the database is what matters.)

Create `tests/unit/registers-params.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { PAGE_SIZE, cleanSearch, readRegisterParams, registerHref } from '../../features/registers/read-register-params.ts'

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962'

test('a page is 25 rows', () => assert.equal(PAGE_SIZE, 25))

test('search text keeps letters, digits, spaces and . @ + \' - and nothing else', () => {
  assert.equal(cleanSearch('  Acme  (Pty), Ltd  '), 'Acme Pty Ltd')
  assert.equal(cleanSearch('o\'neil-smith@example.com'), "o'neil-smith@example.com")
  assert.equal(cleanSearch('50% off_now'), '50 off now')
  assert.equal(cleanSearch('a,b.eq.c)(or=x'), 'a b.eq.c or x')
  assert.equal(cleanSearch('Ñandú Zoë'), 'Ñandú Zoë')
  assert.equal(cleanSearch('"; drop table leads; --'), 'drop table leads --')
  assert.equal(cleanSearch('x'.repeat(500)).length, 120)
  assert.equal(cleanSearch(''), '')
})

test('an empty address gives the defaults', () => {
  assert.deepEqual(readRegisterParams('invoice', {}), { q: '', status: null, owner: null, archived: false, sort: null, dir: 'asc', page: 1, searchTooShort: false })
})

test('valid values are read, and arrays take their first value', () => {
  const params = readRegisterParams('invoice', { q: 'acme', status: 'Overdue', owner: UUID, archived: '1', sort: 'due', dir: 'desc', page: '3' })
  assert.deepEqual(params, { q: 'acme', status: 'Overdue', owner: UUID, archived: true, sort: 'due', dir: 'desc', page: 3, searchTooShort: false })
  assert.equal(readRegisterParams('invoice', { status: ['Paid', 'Overdue'] }).status, 'Paid')
  assert.equal(readRegisterParams('invoice', new URLSearchParams('status=Paid&page=2')).page, 2)
})

test('a sort, status or owner that is not on the list is ignored', () => {
  const params = readRegisterParams('invoice', { sort: 'password', status: 'Pending', owner: 'not-a-uuid', dir: 'sideways' })
  assert.equal(params.sort, null)
  assert.equal(params.status, null)
  assert.equal(params.owner, null)
  assert.equal(params.dir, 'asc')
  assert.equal(readRegisterParams('lead', { sort: 'due' }).sort, null, 'a column of another register is not on this one')
  assert.equal(readRegisterParams('lead', { status: 'Overdue' }).status, null, 'a status of another register is not on this one')
  assert.equal(readRegisterParams('opportunity', { status: 'Won' }).status, 'Won')
})

test('the page is a whole number of at least 1', () => {
  for (const [page, expected] of [['0', 1], ['-3', 1], ['abc', 1], ['2.7', 2], ['', 1], ['999999999', 999999999], ['1e3', 1]] as const) {
    assert.equal(readRegisterParams('invoice', { page }).page, expected, page)
  }
})

test('a one-character search is flagged and not used; two characters search', () => {
  assert.deepEqual(readRegisterParams('invoice', { q: 'a' }), { q: '', status: null, owner: null, archived: false, sort: null, dir: 'asc', page: 1, searchTooShort: true })
  assert.equal(readRegisterParams('invoice', { q: 'ab' }).q, 'ab')
  assert.equal(readRegisterParams('invoice', { q: ' , ' }).searchTooShort, false, 'text that cleans to nothing is no search at all')
})

test('only the exact switch value turns archived on', () => {
  assert.equal(readRegisterParams('invoice', { archived: '1' }).archived, true)
  for (const value of ['0', 'true', 'yes', '']) assert.equal(readRegisterParams('invoice', { archived: value }).archived, false, value)
})

test('registerHref omits defaults, applies a change, and returns to page 1 when a filter changes', () => {
  const base = readRegisterParams('invoice', { q: 'acme', status: 'Overdue', page: '4' })
  assert.equal(registerHref('/finance/invoices', base), '/finance/invoices?q=acme&status=Overdue&page=4')
  assert.equal(registerHref('/finance/invoices', base, { page: 5 }), '/finance/invoices?q=acme&status=Overdue&page=5')
  assert.equal(registerHref('/finance/invoices', base, { status: 'Paid' }), '/finance/invoices?q=acme&status=Paid')
  assert.equal(registerHref('/finance/invoices', base, { q: '' , status: null }), '/finance/invoices')
  assert.equal(registerHref('/finance/invoices', readRegisterParams('invoice', {})), '/finance/invoices')
  assert.equal(registerHref('/finance/invoices', base, { sort: 'due', dir: 'desc' }), '/finance/invoices?q=acme&status=Overdue&sort=due&dir=desc')
})
```

Create `tests/unit/registers-filters.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { applyRegisterFilters, applyRegisterOrder, searchFilter } from '../../features/registers/apply-filters.ts'
import { pageWindow } from '../../features/registers/page-math.ts'
import { readRegisterParams } from '../../features/registers/read-register-params.ts'

const ORG = '11111111-1111-4111-8111-111111111111'
const OWNER = '3b241101-e2bb-4255-8caf-4136c566a962'

/** A query builder that records every call, so the filters can be checked without a database. */
function recorder() {
  const calls: Array<[string, ...unknown[]]> = []
  const query: any = new Proxy({}, { get: (_target, name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return query } })
  return { query, calls }
}

test('the search is a case-insensitive match over the register\'s columns, joined by or', () => {
  assert.equal(searchFilter(['quote_number', 'client_name'], 'acme corp'), 'quote_number.ilike.%acme corp%,client_name.ilike.%acme corp%')
})

test('an invoice register query is limited to the organisation and to active records by default', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'invoice', readRegisterParams('invoice', {}), ORG)
  assert.deepEqual(calls, [['eq', 'organization_id', ORG], ['is', 'archived_at', null]])
})

test('show archived shows only archived records', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'invoice', readRegisterParams('invoice', { archived: '1' }), ORG)
  assert.deepEqual(calls, [['eq', 'organization_id', ORG], ['not', 'archived_at', 'is', null]])
})

test('status, owner and search are applied through the register rules', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'expense', readRegisterParams('expense', { status: 'Approved', owner: OWNER, q: 'flight' }), ORG)
  assert.deepEqual(calls, [
    ['eq', 'organization_id', ORG], ['is', 'archived_at', null],
    ['eq', 'status', 'Approved'], ['eq', 'submitted_by', OWNER],
    ['or', 'description.ilike.%flight%,vendor_name.ilike.%flight%,category.ilike.%flight%'],
  ])
  const sales = recorder()
  applyRegisterFilters(sales.query, 'opportunity', readRegisterParams('opportunity', { status: 'Won' }), ORG)
  assert.deepEqual(sales.calls[2], ['eq', 'stage', 'Won'], 'the Sales status is the stage column')
})

test('hostile address values never become a column or a filter', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'invoice', readRegisterParams('invoice', { status: 'x;drop', owner: "1' or '1'='1", sort: 'password', q: 'a,b)or(c' }), ORG)
  assert.deepEqual(calls.slice(0, 2), [['eq', 'organization_id', ORG], ['is', 'archived_at', null]])
  assert.deepEqual(calls[2], ['or', 'invoice_number.ilike.%a b or c%,client_name.ilike.%a b or c%'], 'only the cleaned search is used')
  assert.equal(calls.length, 3)
})

test('the order uses the chosen column, then the id, and the default when there is none', () => {
  const chosen = recorder()
  applyRegisterOrder(chosen.query, 'invoice', readRegisterParams('invoice', { sort: 'due', dir: 'desc' }))
  assert.deepEqual(chosen.calls, [['order', 'due_date', { ascending: false, nullsFirst: false }], ['order', 'id', { ascending: true }]])
  const fallback = recorder()
  applyRegisterOrder(fallback.query, 'invoice', readRegisterParams('invoice', {}))
  assert.deepEqual(fallback.calls, [['order', 'created_at', { ascending: false, nullsFirst: false }], ['order', 'id', { ascending: true }]])
  const expenses = recorder()
  applyRegisterOrder(expenses.query, 'expense', readRegisterParams('expense', {}))
  assert.deepEqual(expenses.calls[0], ['order', 'expense_date', { ascending: false, nullsFirst: false }])
})

test('page arithmetic: the first page, a middle page, the last partial page and an empty result', () => {
  assert.deepEqual(pageWindow(1, 1243), { page: 1, pageCount: 50, from: 1, to: 25, rangeFrom: 0, rangeTo: 24 })
  assert.deepEqual(pageWindow(2, 1243), { page: 2, pageCount: 50, from: 26, to: 50, rangeFrom: 25, rangeTo: 49 })
  assert.deepEqual(pageWindow(50, 1243), { page: 50, pageCount: 50, from: 1226, to: 1243, rangeFrom: 1225, rangeTo: 1249 })
  assert.deepEqual(pageWindow(1, 0), { page: 1, pageCount: 1, from: 0, to: 0, rangeFrom: 0, rangeTo: 24 })
  assert.deepEqual(pageWindow(1, 25), { page: 1, pageCount: 1, from: 1, to: 25, rangeFrom: 0, rangeTo: 24 })
  assert.deepEqual(pageWindow(2, 26), { page: 2, pageCount: 2, from: 26, to: 26, rangeFrom: 25, rangeTo: 49 })
})

test('a page past the end is clamped to the last page', () => {
  assert.equal(pageWindow(999999, 1243).page, 50)
  assert.equal(pageWindow(5, 0).page, 1)
  assert.equal(pageWindow(0, 100).page, 1)
})
```

Create `tests/unit/registers-summary.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCards, mainCurrency, money } from '../../features/registers/summary.ts'

test('the main currency is ZAR when present, otherwise the first by name, otherwise none', () => {
  assert.equal(mainCurrency([{ USD: 5, ZAR: 1 }]), 'ZAR')
  assert.equal(mainCurrency([{ USD: 5, EUR: 1 }]), 'EUR')
  assert.equal(mainCurrency([{}, {}]), null)
  assert.equal(mainCurrency([{ ZAR: 0 }]), 'ZAR')
})

test('money is a whole-unit amount in the currency, and an unknown currency code does not crash', () => {
  assert.match(money(1234.5, 'ZAR'), /1\s?235/)
  assert.doesNotThrow(() => money(10, 'XXXX'))
  assert.doesNotThrow(() => money(10, ''))
})

test('the invoice cards are the count, the outstanding balance and the overdue count', () => {
  const cards = buildCards('invoice', { count: 1102, outstanding: { ZAR: 460 }, overdue: 1 })
  assert.deepEqual(cards.map((card) => card.label), ['Invoices', 'Outstanding', 'Overdue'])
  assert.equal(cards[0].value, '1102')
  assert.match(cards[1].value, /460/)
  assert.equal(cards[2].value, '1')
  assert.doesNotMatch(cards[1].detail, /other currencies/)
})

test('another currency is never added: the main currency is shown and the card says the rest is left out', () => {
  const [, outstanding] = buildCards('invoice', { count: 3, outstanding: { ZAR: 100, USD: 900 }, overdue: 0 })
  assert.match(outstanding.value, /100/)
  assert.doesNotMatch(outstanding.value, /1\s?000/)
  assert.match(outstanding.detail, /other currencies not included/)
})

test('every register has three cards, and an empty summary shows zeros', () => {
  const empty: Record<string, unknown> = { lead: {}, quote: {}, opportunity: {}, invoice: {}, expense: {} }
  for (const kind of ['lead', 'quote', 'opportunity', 'invoice', 'expense'] as const) {
    const cards = buildCards(kind, empty[kind])
    assert.equal(cards.length, 3, kind)
    for (const card of cards) assert.match(card.value, /^[\D]*0[\D]*$/, `${kind} ${card.label} is zero`)
  }
})

test('the card labels are the ones the registers show today', () => {
  assert.deepEqual(buildCards('lead', { count: 4, qualified: 2, value: { ZAR: 10 } }).map((card) => card.label), ['Active leads', 'Qualified', 'Estimated value'])
  assert.deepEqual(buildCards('quote', {}).map((card) => card.label), ['Active quotes', 'Accepted', 'Quoted value'])
  assert.deepEqual(buildCards('opportunity', {}).map((card) => card.label), ['Open opportunities', 'Pipeline value', 'Weighted forecast'])
  assert.deepEqual(buildCards('expense', {}).map((card) => card.label), ['Recorded expenses', 'Awaiting approval', 'Approved'])
})
```

Run: `node --test --experimental-strip-types tests/unit/registers-spec.test.ts tests/unit/registers-params.test.ts tests/unit/registers-filters.test.ts tests/unit/registers-summary.test.ts` — expected FAIL (modules missing).

- [ ] **Step 2: Write the register rules**

Create `features/registers/register-spec.ts`:

```ts
// One definition per register, used by the screen, the page query and the export, so what matches can never differ
// between them. Plain constants: no directive, no imports (loadable by unit tests).

export const REGISTER_KINDS = ['lead', 'quote', 'opportunity', 'invoice', 'expense'] as const
export type RegisterKind = (typeof REGISTER_KINDS)[number]
export type SortDir = 'asc' | 'desc'

export function isRegisterKind(value: unknown): value is RegisterKind {
  return typeof value === 'string' && (REGISTER_KINDS as readonly string[]).includes(value)
}

export type RegisterSpec = {
  table: string
  /** The id of the export collection (features/data-portability/portable-collections.ts). */
  collection: string
  searchColumns: readonly string[]
  statusColumn: string
  statuses: readonly string[]
  ownerColumn: string
  /** Screen column id -> database column. Only these can be sorted. */
  sortable: Readonly<Record<string, string>>
  defaultSort: { column: string; dir: SortDir }
}

export const REGISTERS: Record<RegisterKind, RegisterSpec> = {
  lead: {
    table: 'leads',
    collection: 'leads',
    searchColumns: ['company_name', 'contact_name', 'contact_email'],
    statusColumn: 'status',
    statuses: ['New', 'Contacted', 'Qualified', 'Disqualified', 'Converted'],
    ownerColumn: 'owner_id',
    sortable: { name: 'company_name', contact: 'contact_name', source: 'source', value: 'estimated_value', status: 'status' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  quote: {
    table: 'quotes',
    collection: 'quotes',
    searchColumns: ['quote_number', 'client_name'],
    statusColumn: 'status',
    statuses: ['Draft', 'Internal Review', 'Sent', 'Accepted', 'Declined', 'Expired'],
    ownerColumn: 'owner_id',
    sortable: { name: 'quote_number', client: 'client_name', total: 'total_amount', expiry: 'valid_until', status: 'status' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  opportunity: {
    table: 'sales_opportunities',
    collection: 'sales-opportunities',
    searchColumns: ['name', 'client_name'],
    statusColumn: 'stage',
    statuses: ['Discovery', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    ownerColumn: 'owner_id',
    sortable: { name: 'name', client: 'client_name', stage: 'stage', value: 'expected_value', probability: 'probability_percent', close: 'expected_close' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  invoice: {
    table: 'invoices',
    collection: 'invoices',
    searchColumns: ['invoice_number', 'client_name'],
    statusColumn: 'status',
    statuses: ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
    ownerColumn: 'owner_id',
    sortable: { name: 'invoice_number', client: 'client_name', issueDate: 'issue_date', due: 'due_date', total: 'total_amount', balance: 'balance_amount', status: 'status' },
    defaultSort: { column: 'created_at', dir: 'desc' },
  },
  expense: {
    table: 'expenses',
    collection: 'expenses',
    searchColumns: ['description', 'vendor_name', 'category'],
    statusColumn: 'status',
    statuses: ['Draft', 'Submitted', 'Awaiting Approval', 'Approved', 'Rejected'],
    ownerColumn: 'submitted_by',
    sortable: { name: 'description', category: 'category', vendor: 'vendor_name', amount: 'amount', date: 'expense_date', status: 'status' },
    defaultSort: { column: 'expense_date', dir: 'desc' },
  },
}
```

- [ ] **Step 3: Write the address reader**

Create `features/registers/read-register-params.ts`:

```ts
// Turns the page address into checked register parameters. Pure: no directive, relative imports only. Nothing here
// returns a value that was not checked against the register's own lists, so nothing from the address can become a
// column name or a filter by itself.
import { isUuid } from '../../lib/utils/index.ts'
import { REGISTERS, type RegisterKind, type SortDir } from './register-spec.ts'

export const PAGE_SIZE = 25
export const SEARCH_MIN = 2
export const SEARCH_MAX = 120

export type RegisterParams = {
  q: string
  status: string | null
  owner: string | null
  archived: boolean
  sort: string | null
  dir: SortDir
  page: number
  /** One character was typed: shown as "Enter at least 2 characters to search." and not used. */
  searchTooShort: boolean
}

export type RawParams = Record<string, string | string[] | undefined> | URLSearchParams

const first = (raw: RawParams, key: string): string => {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? ''
  const value = raw[key]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** Keeps letters, digits, spaces and . @ + ' - ; every other run becomes one space; trimmed and cut to 120 characters. */
export function cleanSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} .@+'-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX).trim()
}

export function readRegisterParams(kind: RegisterKind, raw: RawParams): RegisterParams {
  const spec = REGISTERS[kind]
  const cleaned = cleanSearch(first(raw, 'q'))
  const searchTooShort = cleaned.length > 0 && cleaned.length < SEARCH_MIN
  const status = first(raw, 'status')
  const owner = first(raw, 'owner')
  const sort = first(raw, 'sort')
  const pageText = first(raw, 'page')
  const page = /^\d+(\.\d+)?$/.test(pageText) ? Math.max(1, Math.floor(Number(pageText))) : 1
  return {
    q: searchTooShort ? '' : cleaned,
    status: spec.statuses.includes(status) ? status : null,
    owner: isUuid(owner) ? owner : null,
    archived: first(raw, 'archived') === '1',
    sort: Object.hasOwn(spec.sortable, sort) ? sort : null,
    dir: first(raw, 'dir') === 'desc' ? 'desc' : 'asc',
    page,
    searchTooShort,
  }
}

/**
 * The address of the same register with a change applied. Defaults are left out. Changing the search, the status, the
 * owner, the archived switch or the sort returns to page 1 unless the change names a page.
 */
export function registerHref(base: string, params: RegisterParams, change: Partial<RegisterParams> = {}): string {
  const next: RegisterParams = { ...params, ...change }
  if (change.page === undefined && ('q' in change || 'status' in change || 'owner' in change || 'archived' in change || 'sort' in change || 'dir' in change)) {
    next.page = 1
  }
  const query = new URLSearchParams()
  if (next.q) query.set('q', next.q)
  if (next.status) query.set('status', next.status)
  if (next.owner) query.set('owner', next.owner)
  if (next.archived) query.set('archived', '1')
  if (next.sort) {
    query.set('sort', next.sort)
    query.set('dir', next.dir)
  }
  if (next.page > 1) query.set('page', String(next.page))
  const text = query.toString()
  return text ? `${base}?${text}` : base
}
```

(`isUuid` accepts only well-formed uuids, so `owner=not-a-uuid` is ignored. If `Object.hasOwn` is not available under the project's `lib`, use `Object.prototype.hasOwnProperty.call`. The `registerHref` test for `{ q: '', status: null }` expects `/finance/invoices` and `page` reset to 1: check your result against every line of the test.)

- [ ] **Step 4: Write the filters and the page arithmetic**

Create `features/registers/apply-filters.ts`:

```ts
// Applies the checked register parameters to a Supabase query builder. The same function builds the page query and
// the export query, so the screen and the download always agree. Pure apart from the calls on the builder it is given:
// no directive and no imports of server code (unit tests give it a recording builder).
import type { RegisterParams } from './read-register-params.ts'
import { REGISTERS, type RegisterKind } from './register-spec.ts'

type Chainable = { [method: string]: (...args: any[]) => any }

/** `col1.ilike.%text%,col2.ilike.%text%`: the text has already been cleaned by cleanSearch, so it holds no comma, bracket, quote or wildcard. */
export function searchFilter(columns: readonly string[], q: string): string {
  return columns.map((column) => `${column}.ilike.%${q}%`).join(',')
}

export function applyRegisterFilters<T extends Chainable>(query: T, kind: RegisterKind, params: RegisterParams, organizationId: string): T {
  const spec = REGISTERS[kind]
  let next: Chainable = query.eq('organization_id', organizationId)
  next = params.archived ? next.not('archived_at', 'is', null) : next.is('archived_at', null)
  if (params.status) next = next.eq(spec.statusColumn, params.status)
  if (params.owner) next = next.eq(spec.ownerColumn, params.owner)
  if (params.q) next = next.or(searchFilter(spec.searchColumns, params.q))
  return next as T
}

/** The chosen column (or the register's default), then the id, so paging is stable. */
export function applyRegisterOrder<T extends Chainable>(query: T, kind: RegisterKind, params: RegisterParams): T {
  const spec = REGISTERS[kind]
  const chosen = params.sort ? { column: spec.sortable[params.sort], dir: params.dir } : spec.defaultSort
  return query
    .order(chosen.column, { ascending: chosen.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true }) as T
}
```

Create `features/registers/page-math.ts`:

```ts
// Page arithmetic for the register footer and the database range. Pure: no directive, no imports.
import { PAGE_SIZE } from './read-register-params.ts'

export function pageWindow(requested: number, total: number, size: number = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(total / size))
  const page = Math.min(Math.max(1, Math.floor(requested) || 1), pageCount)
  const rangeFrom = (page - 1) * size
  return {
    page,
    pageCount,
    from: total === 0 ? 0 : rangeFrom + 1,
    to: Math.min(page * size, total),
    rangeFrom,
    rangeTo: rangeFrom + size - 1,
  }
}
```

- [ ] **Step 5: Write the summary cards and the register view**

Create `features/registers/summary.ts`:

```ts
// The summary cards from the register_summary function's JSON. Pure: no directive, no imports.
import type { RegisterKind } from './register-spec.ts'

export type Card = { label: string; value: string; detail: string }
type Money = Record<string, number>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (summary: Record<string, unknown>, key: string) => Number(summary[key] ?? 0) || 0
const moneyOf = (summary: Record<string, unknown>, key: string): Money => {
  const raw = summary[key]
  if (!isObject(raw)) return {}
  return Object.fromEntries(Object.entries(raw).map(([currency, amount]) => [currency, Number(amount) || 0]))
}

/** ZAR when present, otherwise the first by name, otherwise none. */
export function mainCurrency(maps: Array<Record<string, number>>): string | null {
  const currencies = [...new Set(maps.flatMap((map) => Object.keys(map)))].sort()
  if (currencies.length === 0) return null
  return currencies.includes('ZAR') ? 'ZAR' : currencies[0]
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: currency || 'ZAR', maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString('en-ZA')}`
  }
}

export function buildCards(kind: RegisterKind, raw: unknown): Card[] {
  const summary = isObject(raw) ? raw : {}
  const maps: Money[] = []
  const cash = (key: string, detail: string, label: string): Card => {
    const map = moneyOf(summary, key)
    maps.push(map)
    return { label, value: '', detail }
  }
  let cards: Card[]
  switch (kind) {
    case 'lead':
      cards = [
        { label: 'Active leads', value: String(count(summary, 'count')), detail: 'Persistent prospects' },
        { label: 'Qualified', value: String(count(summary, 'qualified')), detail: 'Ready for opportunity conversion' },
        cash('value', 'Recorded pipeline potential', 'Estimated value'),
      ]
      break
    case 'quote':
      cards = [
        { label: 'Active quotes', value: String(count(summary, 'count')), detail: 'Across all current statuses' },
        { label: 'Accepted', value: String(count(summary, 'accepted')), detail: 'Commercially approved' },
        cash('value', 'Total recorded value', 'Quoted value'),
      ]
      break
    case 'opportunity':
      cards = [
        { label: 'Open opportunities', value: String(count(summary, 'open')), detail: 'Active commercial pipeline' },
        cash('pipeline', 'Unweighted opportunity value', 'Pipeline value'),
        cash('weighted', 'Probability-adjusted value', 'Weighted forecast'),
      ]
      break
    case 'invoice':
      cards = [
        { label: 'Invoices', value: String(count(summary, 'count')), detail: 'Current billing records' },
        cash('outstanding', 'Balance still collectible', 'Outstanding'),
        { label: 'Overdue', value: String(count(summary, 'overdue')), detail: 'Invoices requiring attention' },
      ]
      break
    case 'expense':
      cards = [
        cash('spend', 'Current tenant spend', 'Recorded expenses'),
        { label: 'Awaiting approval', value: String(count(summary, 'awaiting')), detail: 'Submitted control items' },
        cash('approved', 'Approved recorded spend', 'Approved'),
      ]
      break
  }
  const main = mainCurrency(maps) ?? 'ZAR'
  const others = new Set(maps.flatMap((map) => Object.keys(map).filter((currency) => currency !== main && map[currency] !== 0)))
  const keys: Record<RegisterKind, Record<string, string>> = {
    lead: { 'Estimated value': 'value' },
    quote: { 'Quoted value': 'value' },
    opportunity: { 'Pipeline value': 'pipeline', 'Weighted forecast': 'weighted' },
    invoice: { Outstanding: 'outstanding' },
    expense: { 'Recorded expenses': 'spend', Approved: 'approved' },
  }
  return cards.map((card) => {
    const key = keys[kind][card.label]
    if (!key) return card
    return {
      ...card,
      value: money(moneyOf(summary, key)[main] ?? 0, main),
      detail: others.size > 0 ? `${card.detail} · other currencies not included` : card.detail,
    }
  })
}
```

(In `cash`, the money map is collected only to pick the main currency; the card's value is filled in by the final `map`. Make sure `maps` is complete before `mainCurrency` runs and that every card ends with a value; the unit tests check the result.)

Create `features/registers/register-view.ts`:

```ts
// What each register shows: its labels, its columns and how a record becomes a row of cells. Pure: no directive and
// no imports of server code. A record here is the mapped record the phase-six mappers produce.
import type { RegisterKind } from './register-spec.ts'

export type RegisterColumn = { id: string; label: string }
export type RegisterFrame = {
  category: string
  heading: string
  singular: string
  action: string
  base: string
  description: string
  empty: string
  columns: RegisterColumn[]
}
export type RegisterRow = { id: string; name: string; status: string; archived: boolean; cells: Record<string, string> }

export const REGISTER_FRAMES: Record<RegisterKind, RegisterFrame> = {
  lead: {
    category: 'Commercial', heading: 'Leads', singular: 'Lead', action: 'Add Lead', base: '/commercial/leads',
    description: 'Qualify persistent prospects, value and commercial ownership.', empty: 'Add the first commercial lead.',
    columns: [{ id: 'name', label: 'Company' }, { id: 'contact', label: 'Contact' }, { id: 'source', label: 'Source' }, { id: 'owner', label: 'Owner' }, { id: 'value', label: 'Estimated Value' }, { id: 'status', label: 'Status' }],
  },
  quote: {
    category: 'Commercial', heading: 'Quotes', singular: 'Quote', action: 'New Quote', base: '/commercial/quotes',
    description: 'Prepare and govern persistent client quotations and commercial terms.', empty: 'Create the first client quote.',
    columns: [{ id: 'name', label: 'Quote' }, { id: 'client', label: 'Client' }, { id: 'owner', label: 'Owner' }, { id: 'total', label: 'Total' }, { id: 'expiry', label: 'Expiry' }, { id: 'status', label: 'Status' }],
  },
  opportunity: {
    category: 'Commercial', heading: 'Sales', singular: 'Opportunity', action: 'New Opportunity', base: '/commercial/sales',
    description: 'Manage a persistent pipeline from discovery through commercial outcome.', empty: 'Create the first sales opportunity.',
    columns: [{ id: 'name', label: 'Opportunity' }, { id: 'client', label: 'Client / Prospect' }, { id: 'owner', label: 'Owner' }, { id: 'stage', label: 'Stage' }, { id: 'value', label: 'Value' }, { id: 'probability', label: 'Probability' }, { id: 'close', label: 'Expected Close' }],
  },
  invoice: {
    category: 'Finance', heading: 'Invoices', singular: 'Invoice', action: 'New Invoice', base: '/finance/invoices',
    description: 'Control persistent client billing, balances and payment status.', empty: 'Create the first client invoice.',
    columns: [{ id: 'name', label: 'Invoice' }, { id: 'client', label: 'Client' }, { id: 'issueDate', label: 'Issue Date' }, { id: 'due', label: 'Due Date' }, { id: 'total', label: 'Total' }, { id: 'balance', label: 'Balance' }, { id: 'status', label: 'Status' }],
  },
  expense: {
    category: 'Finance', heading: 'Expenses', singular: 'Expense', action: 'Add Expense', base: '/finance/expenses',
    description: 'Capture persistent operational spend and approval accountability.', empty: 'Add the first operational expense.',
    columns: [{ id: 'name', label: 'Expense' }, { id: 'category', label: 'Category' }, { id: 'vendor', label: 'Vendor' }, { id: 'project', label: 'Project' }, { id: 'owner', label: 'Submitted By' }, { id: 'amount', label: 'Amount' }, { id: 'date', label: 'Date' }, { id: 'status', label: 'Status' }],
  },
}

type Mapped = Record<string, unknown>
const text = (value: unknown, fallback = '—') => (value === null || value === undefined || value === '' ? fallback : String(value))
const day = (value: unknown) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-ZA') : '—')
const amount = (value: unknown, currency: unknown) => {
  const code = text(currency, 'ZAR')
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(Number(value ?? 0))
  } catch {
    return `${code} ${Math.round(Number(value ?? 0))}`
  }
}

export function toRegisterRow(kind: RegisterKind, record: Mapped): RegisterRow {
  const cells: Record<string, string> = { name: text(record.name) }
  switch (kind) {
    case 'lead':
      Object.assign(cells, { contact: text(record.contactName), source: text(record.source), owner: text(record.owner), value: amount(record.estimatedValue, record.currency), status: text(record.status) })
      break
    case 'quote':
      Object.assign(cells, { client: text(record.clientName), owner: text(record.owner), total: amount(record.totalAmount, record.currency), expiry: day(record.validUntil), status: text(record.status) })
      break
    case 'opportunity':
      Object.assign(cells, { client: text(record.clientName), owner: text(record.owner), stage: text(record.stage), value: amount(record.expectedValue, record.currency), probability: `${text(record.probabilityPercent, '0')}%`, close: day(record.expectedClose) })
      break
    case 'invoice':
      Object.assign(cells, { client: text(record.clientName), issueDate: day(record.issueDate), due: day(record.dueDate), total: amount(record.totalAmount, record.currency), balance: amount(record.balanceAmount, record.currency), status: text(record.status) })
      break
    case 'expense':
      Object.assign(cells, { category: text(record.category), vendor: text(record.vendor), project: text(record.project), owner: text(record.submitter), amount: amount(record.amount, record.currency), date: day(record.expenseDate), status: text(record.status) })
      break
  }
  return { id: String(record.id), name: text(record.name), status: text(record.status), archived: Boolean(record.archivedAt), cells }
}
```

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/20261011160000_register_summary.sql`:

```sql
-- Stage 3, part 1: the register summary cards as a database function, and the forecast ignoring archived invoices.
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. register_summary: counts and money (per currency) over a register's NON-ARCHIVED rows, with the cards the
--    registers show. security invoker, so row level security applies; p_org narrows to one organisation.
--    Money is returned as { "ZAR": 1234.5, "USD": 10 }; amounts in different currencies are never added.
-- ---------------------------------------------------------------------------
create or replace function public.register_summary(p_org uuid, p_kind text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_kind = 'lead' then
    return jsonb_build_object(
      'count', (select count(*) from public.leads where organization_id = p_org and archived_at is null),
      'qualified', (select count(*) from public.leads where organization_id = p_org and archived_at is null and status = 'Qualified'),
      'value', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(estimated_value) as amount from public.leads where organization_id = p_org and archived_at is null group by currency) s));
  elsif p_kind = 'quote' then
    return jsonb_build_object(
      'count', (select count(*) from public.quotes where organization_id = p_org and archived_at is null),
      'accepted', (select count(*) from public.quotes where organization_id = p_org and archived_at is null and status = 'Accepted'),
      'value', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(total_amount) as amount from public.quotes where organization_id = p_org and archived_at is null group by currency) s));
  elsif p_kind = 'opportunity' then
    return jsonb_build_object(
      'open', (select count(*) from public.sales_opportunities where organization_id = p_org and archived_at is null and stage not in ('Won', 'Lost')),
      'pipeline', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(expected_value) as amount from public.sales_opportunities
        where organization_id = p_org and archived_at is null and stage not in ('Won', 'Lost') group by currency) s),
      'weighted', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, round(sum(expected_value * probability_percent / 100.0), 2) as amount from public.sales_opportunities
        where organization_id = p_org and archived_at is null and stage not in ('Won', 'Lost') group by currency) s));
  elsif p_kind = 'invoice' then
    return jsonb_build_object(
      'count', (select count(*) from public.invoices where organization_id = p_org and archived_at is null),
      'outstanding', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(balance_amount) as amount from public.invoices
        where organization_id = p_org and archived_at is null and status in ('Issued', 'Partially Paid', 'Overdue') and balance_amount > 0
        group by currency) s),
      'overdue', (select count(*) from public.invoices where organization_id = p_org and archived_at is null and status = 'Overdue'));
  elsif p_kind = 'expense' then
    return jsonb_build_object(
      'spend', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from public.expenses where organization_id = p_org and archived_at is null group by currency) s),
      'awaiting', (select count(*) from public.expenses where organization_id = p_org and archived_at is null and status in ('Submitted', 'Awaiting Approval')),
      'approved', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from public.expenses where organization_id = p_org and archived_at is null and status = 'Approved' group by currency) s));
  end if;
  raise exception 'REGISTER_KIND_UNKNOWN' using errcode = '22023';
end $$;

revoke all on function public.register_summary(uuid, text) from public, anon;
grant execute on function public.register_summary(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. forecast_months (from 20261011150000) with one change: an archived invoice is no longer counted as money still
--    due. Archiving is real from this part on. Collected money stays: a payment received is a payment received.
-- ---------------------------------------------------------------------------
create or replace function public.forecast_months(p_org uuid)
returns table (bucket text, month date, currency text, collected numeric, invoices_due numeric, pipeline numeric)
language sql stable security invoker set search_path = '' as $$
  with b as (
    select date_trunc('month', now() at time zone 'Africa/Johannesburg')::date as this_month,
           (date_trunc('month', now() at time zone 'Africa/Johannesburg') + interval '6 months')::date as last_month,
           (date_trunc('month', now() at time zone 'Africa/Johannesburg') - interval '3 months')::date as first_month,
           (now() at time zone 'Africa/Johannesburg')::date as today
  ),
  coll as (
    select 'month'::text as bucket, date_trunc('month', p.received_on)::date as month, i.currency, sum(p.amount) as amount
    from public.payments p
    join public.invoices i on i.id = p.invoice_id and i.organization_id = p.organization_id
    cross join b
    where p.organization_id = p_org and p.voided_at is null
      and date_trunc('month', p.received_on)::date >= b.first_month
    group by 1, 2, 3
  ),
  due_src as (
    select greatest(date_trunc('month', coalesce(i.due_date, b.today))::date, b.this_month) as m, i.currency, i.balance_amount as amount
    from public.invoices i cross join b
    where i.organization_id = p_org and i.archived_at is null
      and i.status in ('Issued', 'Partially Paid', 'Overdue') and i.balance_amount > 0
  ),
  due as (
    select case when s.m > b.last_month then 'later' else 'month' end as bucket,
           case when s.m > b.last_month then null else s.m end as month,
           s.currency, sum(s.amount) as amount
    from due_src s cross join b
    group by 1, 2, 3
  ),
  pipe_src as (
    select case when o.expected_close is null then null else greatest(date_trunc('month', o.expected_close)::date, b.this_month) end as m,
           o.currency, o.expected_value * o.probability_percent / 100.0 as amount
    from public.sales_opportunities o cross join b
    where o.organization_id = p_org and o.stage not in ('Won', 'Lost') and o.archived_at is null
  ),
  pipe as (
    select case when s.m is null then 'undated' when s.m > b.last_month then 'later' else 'month' end as bucket,
           case when s.m is null or s.m > b.last_month then null else s.m end as month,
           s.currency, sum(s.amount) as amount
    from pipe_src s cross join b
    group by 1, 2, 3
  )
  select u.bucket, u.month, u.currency, round(sum(u.collected), 2), round(sum(u.invoices_due), 2), round(sum(u.pipeline), 2)
  from (
    select bucket, month, currency, amount as collected, 0::numeric as invoices_due, 0::numeric as pipeline from coll
    union all select bucket, month, currency, 0::numeric, amount, 0::numeric from due
    union all select bucket, month, currency, 0::numeric, 0::numeric, amount from pipe
  ) u
  group by u.bucket, u.month, u.currency
  order by u.currency, u.bucket, u.month
$$;

revoke all on function public.forecast_months(uuid) from public, anon;
grant execute on function public.forecast_months(uuid) to authenticated;
```

- [ ] **Step 7: Map the new error token and write the database test**

In `features/documents/errors.ts` add to `MESSAGES`: `['REGISTER_KIND_UNKNOWN', 'That register was not found.']`. In `tests/unit/documents-vocabulary.test.ts` add `+ migration('20261011160000_register_summary.sql')` to **both** concatenations of earlier migrations (the two token tests; the new token is raised there) and add `assert.match(documentErrorMessage('REGISTER_KIND_UNKNOWN')!, /register/i)` to the messages test.

Create `tests/integration/rls/register-summary.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let orgBig: string
let member: U
let other: U
let bigMember: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let bigClient: SupabaseClient
let clientA: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const summary = async (kind: string, client: SupabaseClient = memberClient, org: string = orgA) => {
  const result = await client.rpc('register_summary', { p_org: org, p_kind: kind })
  assert.equal(result.error, null, `${kind}: ${result.error?.message}`)
  return result.data as Record<string, any>
}
const now = () => new Date().toISOString()
/** Today's South African date: the database checks payment dates against it, never against the UTC date. */
const sast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

before(async () => {
  orgA = await createFixtureOrg('register-a')
  orgB = await createFixtureOrg('register-b')
  orgBig = await createFixtureOrg('register-big')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  bigMember = await createFixtureUser(orgBig, 'member')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  bigClient = await signedInClient(bigMember.email, bigMember.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Reg Client A', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15 }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB, orgBig].filter(Boolean), [member?.id, other?.id, bigMember?.id].filter(Boolean))
})

test('lead cards count active and qualified leads and sum the estimated value per currency; archived leads are left out', async () => {
  must(await admin.from('leads').insert([
    { organization_id: orgA, company_name: 'L1', contact_name: 'c', status: 'New', estimated_value: 100 },
    { organization_id: orgA, company_name: 'L2', contact_name: 'c', status: 'Qualified', estimated_value: 200 },
    { organization_id: orgA, company_name: 'L3', contact_name: 'c', status: 'Qualified', estimated_value: 50, currency: 'USD' },
    { organization_id: orgA, company_name: 'L4', contact_name: 'c', status: 'Qualified', estimated_value: 999, archived_at: now() },
  ]).select('id'))
  assert.deepEqual(await summary('lead'), { count: 3, qualified: 2, value: { ZAR: 300, USD: 50 } })
})

test('quote cards count active and accepted quotes and sum the totals', async () => {
  const quote = must(await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single())
  assert.equal((await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })).error, null)
  must(await admin.from('quotes').insert([
    { organization_id: orgA, quote_number: 'REG-Q-1', client_name: 'x', status: 'Accepted' },
    { organization_id: orgA, quote_number: 'REG-Q-2', client_name: 'x', status: 'Sent', archived_at: now() },
  ]).select('id'))
  const result = await summary('quote')
  assert.equal(result.count, 2)
  assert.equal(result.accepted, 1)
  assert.deepEqual(result.value, { ZAR: 230 })
})

test('sales cards count open opportunities and weight their value by probability; Won and Lost are not open', async () => {
  must(await admin.from('sales_opportunities').insert([
    { organization_id: orgA, name: 'O1', client_name: 'x', stage: 'Proposal', expected_value: 1000, probability_percent: 50 },
    { organization_id: orgA, name: 'O2', client_name: 'x', stage: 'Negotiation', expected_value: 400, probability_percent: 25, currency: 'USD' },
    { organization_id: orgA, name: 'O3', client_name: 'x', stage: 'Won', expected_value: 5000, probability_percent: 100 },
    { organization_id: orgA, name: 'O4', client_name: 'x', stage: 'Lost', expected_value: 7000, probability_percent: 0, lost_reason: 'Went with a competitor' },
    { organization_id: orgA, name: 'O5', client_name: 'x', stage: 'Proposal', expected_value: 900, probability_percent: 90, archived_at: now() },
  ]).select('id'))
  assert.deepEqual(await summary('opportunity'), { open: 2, pipeline: { ZAR: 1000, USD: 400 }, weighted: { ZAR: 500, USD: 100 } })
})

test('invoice cards count the register, the collectible balance and the overdue invoices; drafts, paid and archived are not collectible', async () => {
  const issue = async () => {
    const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single())
    assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })).error, null)
    assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
    return invoice.id as string
  }
  await issue() // Issued, 230 owing
  const overdue = await issue()
  must(await admin.from('invoices').update({ status: 'Overdue' }).eq('id', overdue).select('id'))
  const paid = await issue()
  assert.equal((await memberClient.rpc('record_payment', { p_invoice: paid, p_amount: 230, p_received_on: sast(), p_method: 'Cash', p_reference: null })).error, null)
  const archived = await issue()
  must(await admin.from('invoices').update({ archived_at: now() }).eq('id', archived).select('id'))
  must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single()) // a draft
  const result = await summary('invoice')
  assert.equal(result.count, 4, 'issued, overdue, paid and the draft; the archived one is not counted')
  assert.deepEqual(result.outstanding, { ZAR: 460 })
  assert.equal(result.overdue, 1)
})

test('expense cards sum the spend and the approved spend and count those awaiting approval', async () => {
  const date = new Date().toISOString().slice(0, 10)
  must(await admin.from('expenses').insert([
    { organization_id: orgA, description: 'E1', amount: 100, expense_date: date, status: 'Approved' },
    { organization_id: orgA, description: 'E2', amount: 50, expense_date: date, status: 'Submitted' },
    { organization_id: orgA, description: 'E3', amount: 25, expense_date: date, status: 'Awaiting Approval' },
    { organization_id: orgA, description: 'E4', amount: 10, expense_date: date, status: 'Draft', currency: 'USD' },
    { organization_id: orgA, description: 'E5', amount: 999, expense_date: date, status: 'Approved', archived_at: now() },
  ]).select('id'))
  assert.deepEqual(await summary('expense'), { spend: { ZAR: 175, USD: 10 }, awaiting: 2, approved: { ZAR: 100 } })
})

test('an unknown register is refused, another organisation sees nothing, a non-member gets nothing, and anon cannot call it', async () => {
  const unknown = await memberClient.rpc('register_summary', { p_org: orgA, p_kind: 'expenses; drop table' })
  assert.ok(unknown.error)
  assert.match(unknown.error!.message, /REGISTER_KIND_UNKNOWN/)
  assert.deepEqual(await summary('lead', otherClient, orgA), { count: 0, qualified: 0, value: {} })
  assert.deepEqual(await summary('invoice', memberClient, orgB), { count: 0, outstanding: {}, overdue: 0 })
  assert.ok((await anonymous.rpc('register_summary', { p_org: orgA, p_kind: 'lead' })).error)
})

test('a register with more than 1,000 rows pages to its last row with the exact total', async () => {
  const rows = Array.from({ length: 1100 }, () => ({ organization_id: orgBig, client_name: 'Bulk Client' }))
  for (let start = 0; start < rows.length; start += 500) {
    must(await admin.from('invoices').insert(rows.slice(start, start + 500)).select('id'))
  }
  assert.equal((await summary('invoice', bigClient, orgBig)).count, 1100)
  const pageOne = await bigClient.from('invoices').select('id', { count: 'exact' }).eq('organization_id', orgBig).is('archived_at', null).order('created_at', { ascending: false }).order('id', { ascending: true }).range(0, 24)
  assert.equal(pageOne.error, null)
  assert.equal(pageOne.count, 1100, 'the exact total, not the first 1,000')
  assert.equal(pageOne.data!.length, 25)
  const lastPage = await bigClient.from('invoices').select('id', { count: 'exact' }).eq('organization_id', orgBig).is('archived_at', null).order('created_at', { ascending: false }).order('id', { ascending: true }).range(1075, 1099)
  assert.equal(lastPage.error, null)
  assert.equal(lastPage.data!.length, 25, 'the 1,076th to the 1,100th row are all there')
  const pastEnd = await bigClient.from('invoices').select('id', { count: 'exact' }).eq('organization_id', orgBig).range(1100, 1124)
  // PostgREST answers a range that starts past the last row with PGRST103 (not an empty page); queryRegister handles that code.
  assert.ok(pastEnd.error?.code === 'PGRST103' || (pastEnd.data ?? []).length === 0, 'past the end is an error or an empty page, never more rows')
  const ids = new Set([...pageOne.data!, ...lastPage.data!].map((row) => row.id))
  assert.equal(ids.size, 50, 'no row appears on both pages')
})

test('the forecast no longer counts an archived invoice as money still due', async () => {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 10, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  const due = async () => ((await memberClient.rpc('forecast_months', { p_org: orgA })).data as Array<{ bucket: string; currency: string; invoices_due: number }>)
    .filter((row) => row.currency === 'ZAR').reduce((sum, row) => sum + Number(row.invoices_due), 0)
  const before = await due()
  must(await admin.from('invoices').update({ archived_at: now() }).eq('id', invoice.id).select('id'))
  assert.equal(before - (await due()), 1150, 'the archived invoice (10 x 100 plus VAT) is gone from the forecast')
})
```

- [ ] **Step 8: Run everything**

Run: `node --test --experimental-strip-types tests/unit/registers-spec.test.ts tests/unit/registers-params.test.ts tests/unit/registers-filters.test.ts tests/unit/registers-summary.test.ts tests/unit/documents-vocabulary.test.ts`, then `pnpm typecheck` and `pnpm test`. Expected: green. Fix any mismatch between a test and the code by making the code satisfy the test (the tests state the spec); if a test line is itself wrong (for example a regex that cannot match the real migration text), fix it and list it under "Deviations" in your report. Do not run the RLS file.

- [ ] **Step 9: Commit**

```bash
git add features/registers/register-spec.ts features/registers/read-register-params.ts features/registers/apply-filters.ts features/registers/page-math.ts features/registers/summary.ts features/registers/register-view.ts supabase/migrations/20261011160000_register_summary.sql features/documents/errors.ts tests/unit/documents-vocabulary.test.ts tests/unit/registers-spec.test.ts tests/unit/registers-params.test.ts tests/unit/registers-filters.test.ts tests/unit/registers-summary.test.ts tests/integration/rls/register-summary.test.ts
git commit -m "$(cat <<'EOF'
feat(registers): the register rules, the address reader, the filters, the summary function and the forecast fix (migration not yet applied)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

**Controller gate (not for the implementer):** probe the migration in a rolled-back transaction (call each `register_summary` kind and the unknown one with synthetic rows), apply it as `register_summary`, run `register-summary.test.ts` and `forecast-months.test.ts`, and confirm no fixture rows remain (including the 1,100 invoices and their audit events).

---

### Task 2: The query layer, one-record detail pages and Archive / Restore

**Files:**
- Create: `features/commercial-finance/phase-six-mappers.ts`, `features/registers/queries/query-register.ts`, `get-register-summary.ts`, `list-owners.ts`, `features/registers/actions/archive.ts`
- Modify: `features/commercial-finance/queries/phase-six.ts`, `features/documents/errors.ts` (two tokens' messages if needed), `tests/unit/documents-ui.test.ts`, `tests/unit/phase-six-commercial-finance.test.ts`
- Test: `tests/unit/phase-six-mappers.test.ts`, `tests/unit/registers-ui.test.ts`

**Interfaces:**
- Consumes: Task 1's `REGISTERS`, `RegisterParams`, `readRegisterParams`, `applyRegisterFilters`, `applyRegisterOrder`, `pageWindow`, `PAGE_SIZE`, `toRegisterRow`; the existing `getSessionContext`, `createServerSupabase`, `isUuid`, `documentErrorMessage`, `failureState` (`features/documents/action-failure.ts`).
- Produces (Task 3 relies on these exact names):
  - `mapPhaseSixRow(kind: Exclude<PhaseSixKind, 'forecast'>, row: any, names: NameMaps): PhaseSixRecord`, `type NameMaps`, `emptyNameMaps(): NameMaps`, `collectNameIds(kind, rows): Record<keyof NameMaps, string[]>` in `phase-six-mappers.ts`.
  - `queryRegister(kind: RegisterKind, params: RegisterParams): Promise<{ records: PhaseSixRecord[]; total: number; window: ReturnType<typeof pageWindow> }>`.
  - `getRegisterSummary(kind: RegisterKind): Promise<unknown>`; `listOwners(): Promise<Array<{ id: string; label: string }>>`.
  - `getPhaseSixRecord(kind, id)` reads one row for every kind except `forecast`.
  - `archiveRecordAction(kind: string, id: string, previous: ActionState, form: FormData): Promise<ActionState>` and `restoreRecordAction(...)` (same signature).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/phase-six-mappers.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { collectNameIds, emptyNameMaps, mapPhaseSixRow } from '../../features/commercial-finance/phase-six-mappers.ts'

const ID_A = '3b241101-e2bb-4255-8caf-4136c566a962'
const ID_B = '4c352212-f3cc-4366-9dbf-5247d677b073'

test('a draft quote or invoice is named for its client, not by its generated reference', () => {
  const names = emptyNameMaps()
  assert.equal(mapPhaseSixRow('quote', { id: 'q', quote_number: 'DRAFT-1a2b3c4d', client_name: 'Acme', status: 'Draft', updated_at: 'x', archived_at: null }, names).name, 'Draft quote · Acme')
  assert.equal(mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'TST-I-2026-00001', client_name: 'Acme', status: 'Issued', updated_at: 'x', archived_at: null }, names).name, 'TST-I-2026-00001')
  assert.equal(mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'DRAFT-1a2b3c4d', client_name: null, status: 'Draft', updated_at: 'x', archived_at: null }, names).name, 'Draft invoice')
})

test('names are looked up from the maps, with the old fallbacks', () => {
  const names = emptyNameMaps()
  names.members.set(ID_A, 'Sam Member')
  names.projects.set(ID_B, 'Project X')
  const invoice = mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'N-1', client_name: 'c', owner_id: ID_A, project_id: ID_B, quote_id: null, opportunity_id: null, status: 'Issued', updated_at: 'x', archived_at: null }, names)
  assert.equal(invoice.owner, 'Sam Member')
  assert.equal(invoice.project, 'Project X')
  assert.equal(invoice.quote, '—')
  const unassigned = mapPhaseSixRow('invoice', { id: 'i', invoice_number: 'N-1', client_name: 'c', owner_id: null, status: 'Issued', updated_at: 'x', archived_at: null }, names)
  assert.equal(unassigned.owner, 'Unassigned')
})

test('the Sales status is the stage, and an expense shows its vendor name when the vendor is not in the map', () => {
  const names = emptyNameMaps()
  assert.equal(mapPhaseSixRow('opportunity', { id: 'o', name: 'Deal', stage: 'Proposal', updated_at: 'x', archived_at: null }, names).status, 'Proposal')
  const expense = mapPhaseSixRow('expense', { id: 'e', description: 'Flight', vendor_id: ID_A, vendor_name: 'Typed Air', status: 'Draft', updated_at: 'x', archived_at: null }, names)
  assert.equal(expense.vendor, 'Typed Air')
  assert.equal(expense.name, 'Flight')
})

test('the ids to look up are collected per kind, once each, and only real ids', () => {
  const ids = collectNameIds('invoice', [
    { owner_id: ID_A, project_id: ID_B, quote_id: null, opportunity_id: undefined },
    { owner_id: ID_A, project_id: 'not-a-uuid', quote_id: ID_B, opportunity_id: ID_B },
  ])
  assert.deepEqual(ids.members, [ID_A])
  assert.deepEqual([...ids.projects], [ID_B])
  assert.deepEqual(ids.quotes, [ID_B])
  assert.deepEqual(ids.opportunities, [ID_B])
  assert.deepEqual(ids.leads, [])
  assert.deepEqual(collectNameIds('expense', [{ submitted_by: ID_A, approved_by: ID_B, vendor_id: ID_A, project_id: null, client_id: ID_B }]).members.sort(), [ID_A, ID_B].sort())
  assert.deepEqual(collectNameIds('lead', []).members, [])
})
```

Create `tests/unit/registers-ui.test.ts` (the screen and export guards are added in Tasks 3 and 4; this task adds the query and action guards):

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const registers = (...parts: string[]) => read('features', 'registers', ...parts)

test('the query layer reads one page for one organisation, through the register rules, and fails loudly', () => {
  const source = registers('queries', 'query-register.ts')
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /applyRegisterFilters\(/)
  assert.match(source, /applyRegisterOrder\(/)
  assert.match(source, /count: 'exact'/)
  assert.match(source, /\.range\(/)
  assert.match(source, /pageWindow\(/)
  assert.match(source, /if \(\w+\.error\) throw/)
  assert.doesNotMatch(source, /select\('\*'\)(?!, \{)/, 'no unbounded select')
})

test('the summary and the owner list are server-only and fail loudly', () => {
  for (const name of ['get-register-summary.ts', 'list-owners.ts']) {
    const source = registers('queries', name)
    assert.match(source, /^import 'server-only'/, name)
    assert.match(source, /if \(\w+\.error\) throw/, name)
  }
  assert.match(registers('queries', 'get-register-summary.ts'), /rpc\('register_summary'/)
  assert.match(registers('queries', 'list-owners.ts'), /\.eq\('organization_id', organization\.id\)/)
})

test('the archive actions check the kind and the id first, write only archived_at, and scope by organisation', () => {
  const source = registers('actions', 'archive.ts')
  assert.match(source, /^'use server'/)
  for (const line of source.split('\n')) {
    if (/^export /.test(line)) assert.match(line, /^export (async function|type) /, line)
  }
  const kind = source.indexOf('isRegisterKind(')
  const id = source.indexOf('isUuid(')
  const write = source.indexOf('.update(')
  assert.ok(kind > -1 && id > -1 && write > id && write > kind, 'the kind and id are checked before any write')
  assert.match(source, /\.update\(\{ archived_at:/)
  assert.doesNotMatch(source, /\.update\(\{(?![^}]*archived_at)/, 'nothing but archived_at is written')
  assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(source, /This record is already archived\./)
  assert.match(source, /This record is not archived\./)
})

test('the single-record read no longer loads a whole table', () => {
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  const start = queries.indexOf('export async function getPhaseSixRecord')
  assert.ok(start > -1)
  const body = queries.slice(start)
  assert.match(body, /\.eq\('id', id\)|\.eq\("id", id\)/, 'one row by id')
  assert.match(body, /maybeSingle\(\)/)
  assert.ok(body.split('.find(').length - 1 <= 1, 'no find over a loaded list for the five registers (only the unreachable forecast path may keep one)')
  assert.match(body, /kind === 'forecast'[^\n]*\.find\(/, 'the one remaining find is the forecast path')
  assert.match(registers('queries', 'query-register.ts'), /PGRST103/, 'a page past the end is handled')
})
```

Run: `node --test --experimental-strip-types tests/unit/phase-six-mappers.test.ts tests/unit/registers-ui.test.ts` — expected FAIL.

- [ ] **Step 2: Write the pure mappers**

Create `features/commercial-finance/phase-six-mappers.ts` by **moving** the row-to-record mapping out of `queries/phase-six.ts` (the five `list*` functions' `rows.map(...)` bodies, field for field, unchanged) into one pure function, plus the name-id collection. Relative imports only:

```ts
// The row-to-record mapping for the five registers, one row at a time, and which names a page of rows needs.
// Pure: no directive, no server-only import, relative imports only (unit tests load it).
import { isDraftReference } from '../documents/vocabulary.ts'
import { isUuid } from '../../lib/utils/index.ts'
import type { PhaseSixKind, PhaseSixRecord } from './queries/phase-six.ts'

export type NameMaps = {
  members: Map<string, string>
  leads: Map<string, string>
  opportunities: Map<string, string>
  projects: Map<string, string>
  quotes: Map<string, string>
  vendors: Map<string, string>
  clients: Map<string, string>
}

export const emptyNameMaps = (): NameMaps => ({
  members: new Map(), leads: new Map(), opportunities: new Map(), projects: new Map(), quotes: new Map(), vendors: new Map(), clients: new Map(),
})

const nameFor = (map: Map<string, string>, id: unknown, fallback = 'Unassigned') =>
  typeof id === 'string' ? map.get(id) ?? fallback : fallback

/** A draft carries a generated reference; the registers show it as a draft for the client, not as a code. */
export const documentName = (reference: unknown, clientName: unknown, kind: 'quote' | 'invoice') => {
  if (!isDraftReference(reference)) return String(reference)
  const label = kind === 'quote' ? 'Draft quote' : 'Draft invoice'
  return clientName ? `${label} · ${String(clientName)}` : label
}

type Kind = Exclude<PhaseSixKind, 'forecast'>

/** Which columns of each kind hold ids whose names the screen shows. */
const NAME_COLUMNS: Record<Kind, Array<[keyof NameMaps, string]>> = {
  lead: [['members', 'owner_id']],
  quote: [['members', 'owner_id'], ['leads', 'lead_id'], ['opportunities', 'opportunity_id']],
  opportunity: [['members', 'owner_id'], ['leads', 'lead_id']],
  invoice: [['members', 'owner_id'], ['projects', 'project_id'], ['quotes', 'quote_id'], ['opportunities', 'opportunity_id']],
  expense: [['members', 'submitted_by'], ['members', 'approved_by'], ['vendors', 'vendor_id'], ['projects', 'project_id'], ['clients', 'client_id']],
}

export function collectNameIds(kind: Kind, rows: Array<Record<string, unknown>>): Record<keyof NameMaps, string[]> {
  const found: Record<keyof NameMaps, Set<string>> = {
    members: new Set(), leads: new Set(), opportunities: new Set(), projects: new Set(), quotes: new Set(), vendors: new Set(), clients: new Set(),
  }
  for (const row of rows) {
    for (const [map, column] of NAME_COLUMNS[kind]) {
      const value = row[column]
      if (typeof value === 'string' && isUuid(value)) found[map].add(value)
    }
  }
  return Object.fromEntries(Object.entries(found).map(([map, ids]) => [map, [...ids]])) as Record<keyof NameMaps, string[]>
}

export function mapPhaseSixRow(kind: Kind, row: any, names: NameMaps): PhaseSixRecord {
  switch (kind) {
    case 'lead':
      return { /* MOVE the object literal of listLeads' rows.map here, unchanged, using nameFor(names.members, row.owner_id) */ } as PhaseSixRecord
    case 'quote':
      return { /* MOVE listQuotes' literal here: names.members, names.leads, names.opportunities */ } as PhaseSixRecord
    case 'opportunity':
      return { /* MOVE listOpportunities' literal here: names.members, names.leads */ } as PhaseSixRecord
    case 'invoice':
      return { /* MOVE listInvoices' literal here: names.members, names.projects, names.quotes, names.opportunities */ } as PhaseSixRecord
    case 'expense':
      return { /* MOVE listExpenses' literal here: names.members (owner and approver), names.vendors, names.projects, names.clients */ } as PhaseSixRecord
  }
}
```

The `/* MOVE ... */` markers are instructions to you, not code to leave behind: open `features/commercial-finance/queries/phase-six.ts` (lines 94 to 274), copy each `rows.map((row: any) => ({ ... }))` object literal **exactly** into the matching `case` (replace `members`/`leads`/`projects`/`quotes`/`opportunities`/`vendors`/`clients` with `names.<map>`; keep every key, including the `status: row.stage` for opportunities and the `documentName(...)` calls). Delete the placeholder comments and the `as PhaseSixRecord` cast only if the literal satisfies the type without it. The file must contain no `/* MOVE` text when you commit (a test greps for it).

- [ ] **Step 3: The queries**

In `features/commercial-finance/queries/phase-six.ts`:

1. Import `mapPhaseSixRow`, `collectNameIds`, `emptyNameMaps`, `documentName`, `type NameMaps` from `../phase-six-mappers`, and delete the local `documentName`, `nameFor` copies that the remaining code does not use (`getPhaseSixOptions` still uses `documentName`: import it).
2. Add a loader for the names of one set of rows:

```ts
/** The names a set of rows shows, looked up only for the ids those rows hold (not by loading every member, client and project). */
export async function loadNameMaps(db: any, organizationId: string, kind: Exclude<PhaseSixKind, 'forecast'>, rows: Array<Record<string, unknown>>): Promise<NameMaps> {
  const ids = collectNameIds(kind, rows)
  const names = emptyNameMaps()
  const lookup = async (map: keyof NameMaps, table: string, columns: string, label: (row: any) => string) => {
    if (ids[map].length === 0) return
    const result = await db.from(table).select(columns).eq('organization_id', organizationId).in('id', ids[map])
    if (result.error) throw result.error
    for (const row of result.data ?? []) names[map].set(row.id, label(row))
  }
  await Promise.all([
    lookup('members', 'team_members', 'id,full_name', (row) => row.full_name),
    lookup('leads', 'leads', 'id,company_name', (row) => row.company_name),
    lookup('opportunities', 'sales_opportunities', 'id,name', (row) => row.name),
    lookup('projects', 'projects', 'id,name', (row) => row.name),
    lookup('quotes', 'quotes', 'id,quote_number,client_name', (row) => documentName(row.quote_number, row.client_name, 'quote')),
    lookup('vendors', 'vendors', 'id,name', (row) => row.name),
    lookup('clients', 'clients', 'id,name', (row) => row.name),
  ])
  return names
}

export async function mapRows(kind: Exclude<PhaseSixKind, 'forecast'>, rows: any[]): Promise<PhaseSixRecord[]> {
  const { organization, db } = await context()
  const names = await loadNameMaps(db, organization.id, kind, rows)
  return rows.map((row) => mapPhaseSixRow(kind, row, names))
}
```

3. Replace `getPhaseSixRecord` with a one-row read (and keep the old list-based path only for `forecast`):

```ts
const TABLES = { lead: 'leads', quote: 'quotes', opportunity: 'sales_opportunities', invoice: 'invoices', expense: 'expenses' } as const

export async function getPhaseSixRecord(kind: PhaseSixKind, id: string) {
  if (!isUuid(id)) return null;
  if (kind === 'forecast') return (await listForecasts()).find((record) => record.id === id) ?? null;
  const { organization, db } = await context();
  const found = await db.from(TABLES[kind]).select('*').eq('id', id).eq('organization_id', organization.id).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return null;
  return (await mapRows(kind, [found.data]))[0] ?? null;
}
```

4. Delete `listLeads`, `listQuotes`, `listOpportunities`, `listInvoices`, `listExpenses` and the `loaders` entries for them (the old `records()` helper stays for `listForecasts`); keep `listForecasts` and a `loaders` map with only `forecast`. Remove the exports no longer used. (The register component imports them: Task 3 changes that import; until then keep the five list functions as thin wrappers if you need the tree to compile after this commit: `export const listInvoices = async () => mapRows('invoice', (await allRows('invoices')))` is NOT wanted. Instead leave `phase-six-register.tsx` compiling by doing its import change in this task too: see Step 5.)

- [ ] **Step 4: The register query layer**

Create `features/registers/queries/query-register.ts`:

```ts
import 'server-only'

import { mapRows, type PhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { applyRegisterFilters, applyRegisterOrder } from '../apply-filters'
import { pageWindow } from '../page-math'
import { PAGE_SIZE, type RegisterParams } from '../read-register-params'
import { REGISTERS, type RegisterKind } from '../register-spec'

/**
 * One page of a register, with the exact total. A page past the end is read again as the last page: PostgREST answers
 * a range that starts past the last row with an error (PGRST103, "Requested range not satisfiable"), not with an empty
 * page, so that one code is handled by reading page 1 for the total and then the last page. Any other failed read throws.
 */
export async function queryRegister(kind: RegisterKind, params: RegisterParams): Promise<{ records: PhaseSixRecord[]; total: number; window: ReturnType<typeof pageWindow> }> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const spec = REGISTERS[kind]

  const read = async (page: number) => {
    const window = pageWindow(page, Number.MAX_SAFE_INTEGER)
    let query = db.from(spec.table).select('*', { count: 'exact' })
    query = applyRegisterFilters(query, kind, params, organization.id)
    query = applyRegisterOrder(query, kind, params)
    return query.range(window.rangeFrom, window.rangeTo)
  }

  let result = await read(params.page)
  let pageRead = params.page
  if (result.error?.code === 'PGRST103' && params.page > 1) {
    result = await read(1)
    pageRead = 1
  }
  if (result.error) throw result.error
  const total = Number(result.count ?? 0)
  const window = pageWindow(params.page, total)
  let rows = (result.data ?? []) as any[]
  if (window.page !== pageRead) {
    // The requested page is past the end: show the last page instead.
    const last = await read(window.page)
    if (last.error) throw last.error
    rows = (last.data ?? []) as any[]
  }
  return { records: await mapRows(kind, rows), total, window }
}
```

(`PAGE_SIZE` is the page length used by `pageWindow`; remove the unused import if the compiler flags it. A past-the-end `range` returns no rows with the exact count, which is why the re-read happens.)

Create `features/registers/queries/get-register-summary.ts`:

```ts
import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { RegisterKind } from '../register-spec'

/** The raw summary JSON for the cards; buildCards turns it into cards. A failed read throws: never zero totals. */
export async function getRegisterSummary(kind: RegisterKind): Promise<unknown> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db.rpc('register_summary', { p_org: organization.id, p_kind: kind })
  if (result.error) throw result.error
  return result.data
}
```

Create `features/registers/queries/list-owners.ts`:

```ts
import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/** The organisation's active team members, for the owner filter. */
export async function listOwners(): Promise<Array<{ id: string; label: string }>> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db.from('team_members').select('id,full_name').eq('organization_id', organization.id).eq('status', 'Active').is('archived_at', null).order('full_name')
  if (result.error) throw result.error
  return ((result.data ?? []) as Array<{ id: string; full_name: string }>).map((row) => ({ id: row.id, label: row.full_name }))
}
```

- [ ] **Step 5: Archive and Restore**

Add to `features/documents/errors.ts` nothing new (the action returns its own plain messages). Create `features/registers/actions/archive.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { isUuid } from '@/lib/utils'
import { REGISTER_FRAMES } from '../register-view'
import { REGISTERS, isRegisterKind, type RegisterKind } from '../register-spec'

function refresh(kind: RegisterKind, id: string) {
  const base = REGISTER_FRAMES[kind].base
  revalidatePath(base)
  revalidatePath(`${base}/${id}`)
  revalidatePath('/overview')
  revalidatePath('/finance/forecast')
}

async function setArchived(kind: string, id: string, archive: boolean): Promise<ActionState> {
  if (!isRegisterKind(kind)) return { error: 'That register was not found.' }
  if (!isUuid(id)) return { error: 'That record was not found.' }
  const { organization, db } = await documentContext()
  const table = REGISTERS[kind].table
  const found = await db.from(table).select('id,archived_at').eq('id', id).eq('organization_id', organization.id).maybeSingle()
  if (found.error) return { error: 'The record could not be changed. Please try again.' }
  if (!found.data) return { error: 'That record was not found.' }
  if (archive && found.data.archived_at) return { error: 'This record is already archived.' }
  if (!archive && !found.data.archived_at) return { error: 'This record is not archived.' }
  const result = await db
    .from(table)
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')
  if (result.error || !result.data?.length) return { error: 'The record could not be changed. Please try again.' }
  refresh(kind, id)
  return { success: archive ? 'Archived.' : 'Restored.' }
}

export async function archiveRecordAction(kind: string, id: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  return setArchived(kind, id, true)
}

export async function restoreRecordAction(kind: string, id: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  return setArchived(kind, id, false)
}
```

(The existing generic save action may already treat an archived document specially; a database rule that refuses an `archived_at` change is reported by the plain "could not be changed" message. Check, by reading the slice A migrations, that a member can set and clear `archived_at` on each of the five tables; the `quotes`, `invoices`, `leads`, `sales_opportunities` and `expenses` update policies are member-wide.)

- [ ] **Step 6: Keep the old register compiling and update the guards that read the moved code**

`features/commercial-finance/components/phase-six-register.tsx` imports the five `list*` functions you removed. In this task make the **smallest** change that keeps the app compiling: replace its `loaders` map with `{ forecast: listForecasts }` and make `PhaseSixRegister` render, for the five register kinds, a temporary `<p>` ("This register is being rebuilt")? **No**: that would break production pages between commits. Instead keep this commit compiling by leaving the five `list*` exports in place **as thin wrappers over the new code** until Task 3:

```ts
// Removed in Task 3 when the register screen stops loading whole tables.
export const listLeads = async () => mapRows('lead', await allRows('leads', 'created_at', false))
```

with a private `allRows(table, orderColumn, ascending)` that runs the old `select('*')` query; do this for all five (it is exactly the old behaviour, now through the mapper). Task 3 deletes the wrappers, `allRows` and the old register code in one step. Update the guards that read the moved code so they read the mapper file instead of the query file, keeping their intent:

- `tests/unit/documents-ui.test.ts`, test `'the register and detail queries show a draft as a draft, not as a reference code'`: it slices `queries` between `export async function listQuotes` / `listInvoices` / `listExpenses`. Point those assertions at `features/commercial-finance/phase-six-mappers.ts` (`name: documentName(row.quote_number, row.client_name, 'quote')`, `name: documentName(row.invoice_number, row.client_name, 'invoice')`, the `projectName`/`projectDescription`/`projectRef`/`clientRef`/`vatRate` keys inside the `case 'quote'` and `case 'invoice'` blocks, `issueDate: row.issue_date` in the quote block); keep the `getPhaseSixOptions` assertions on `queries/phase-six.ts` as they are.
- `tests/unit/phase-six-commercial-finance.test.ts`: if a guard fails because it reads text that moved (the mapper keys), point it at the mapper file; do not weaken it.
- Add one test to `tests/unit/phase-six-mappers.test.ts` that reads `phase-six-mappers.ts` and asserts it contains no `/* MOVE` text and no `server-only` import.

- [ ] **Step 7: Run everything**

Run: `node --test --experimental-strip-types tests/unit/phase-six-mappers.test.ts tests/unit/registers-ui.test.ts tests/unit/documents-ui.test.ts tests/unit/phase-six-commercial-finance.test.ts`, then `pnpm typecheck`, `pnpm test` and `pnpm build`. Expected: green.

- [ ] **Step 8: Commit**

```bash
git add features/commercial-finance/phase-six-mappers.ts features/commercial-finance/queries/phase-six.ts features/registers/queries features/registers/actions tests/unit/phase-six-mappers.test.ts tests/unit/registers-ui.test.ts tests/unit/documents-ui.test.ts tests/unit/phase-six-commercial-finance.test.ts features/documents/errors.ts
git commit -m "$(cat <<'EOF'
feat(registers): one-page query layer, one-record detail reads, name lookups by id, and real Archive and Restore

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The register screen

**Files:**
- Create: `features/registers/components/register-screen.tsx`, `register-toolbar.tsx`
- Modify: `features/commercial-finance/components/phase-six-register.tsx`, the five register `page.tsx` files, `features/commercial-finance/queries/phase-six.ts` (delete the Task 2 wrappers), `tests/unit/registers-ui.test.ts`, `tests/unit/documents-ui.test.ts`, `tests/unit/phase-six-commercial-finance.test.ts`, `tests/unit/ui-completeness.test.ts` (only if a guard needs the new page shape)

**Interfaces:**
- Consumes: Task 1's `REGISTERS`, `REGISTER_FRAMES`, `readRegisterParams`, `registerHref`, `buildCards`, `toRegisterRow`, `pageWindow`; Task 2's `queryRegister`, `getRegisterSummary`, `listOwners`, `archiveRecordAction`, `restoreRecordAction`; `WorkspaceHeader` (`@/components/shared/workspace-header`), `MetricCard` (`@/features/delivery/components/delivery-primitives`), `ActionButton` (`@/features/crm-workspace/components/action-button`), `collectionSlug` (`@/features/product-ui/collection-route-storage`).
- Produces: `<RegisterScreen kind searchParams />`; `PhaseSixRegister({ kind, searchParams })` delegating the five kinds; the five pages passing `searchParams`.

- [ ] **Step 1: Write the failing guards**

Append to `tests/unit/registers-ui.test.ts`:

```ts
test('the register screen reads the address, asks for one page and the summary, and shows the three states', () => {
  const source = registers('components', 'register-screen.tsx')
  assert.doesNotMatch(source, /^\s*['"]use (client|server)['"]/, 'a server component')
  assert.match(source, /readRegisterParams\(/)
  assert.match(source, /queryRegister\(/)
  assert.match(source, /getRegisterSummary\(/)
  assert.match(source, /buildCards\(/)
  assert.match(source, /Nothing matches these filters/)
  assert.match(source, /Clear filters/)
  assert.match(source, /Enter at least 2 characters to search\./)
  assert.match(source, /Showing /)
  assert.match(source, /aria-sort/)
  assert.match(source, /Previous/)
  assert.match(source, /Next/)
  assert.match(source, /archiveRecordAction/)
  assert.match(source, /restoreRecordAction/)
  assert.doesNotMatch(source, /Duplicate/, 'Duplicate only pretended to work and is not offered')
})

test('the toolbar is a client component that changes the address and offers the four controls', () => {
  const source = registers('components', 'register-toolbar.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /name="q"/)
  assert.match(source, /name="status"/)
  assert.match(source, /name="owner"/)
  assert.match(source, /name="archived"/)
  assert.match(source, /useRouter\(/)
  assert.doesNotMatch(source, /server-only|queries\//, 'a client component imports no server code')
})

test('the five registers pass the address on, keep PhaseSixRegister, and the old whole-table loading is gone', () => {
  for (const [path, kind] of [
    [['commercial', 'leads'], 'lead'], [['commercial', 'quotes'], 'quote'], [['commercial', 'sales'], 'opportunity'],
    [['finance', 'invoices'], 'invoice'], [['finance', 'expenses'], 'expense'],
  ] as const) {
    const page = read('app', '(unison)', ...path, 'page.tsx')
    assert.match(page, /PhaseSixRegister/)
    assert.match(page, new RegExp(`kind="${kind}"`))
    assert.match(page, /searchParams/)
  }
  const register = read('features', 'commercial-finance', 'components', 'phase-six-register.tsx')
  assert.match(register, /RegisterScreen/)
  assert.doesNotMatch(register, /listLeads|listQuotes|listOpportunities|listInvoices|listExpenses/)
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.doesNotMatch(queries, /export (const|async function) list(Leads|Quotes|Opportunities|Invoices|Expenses)/)
  assert.doesNotMatch(queries, /allRows\(/)
})

test('the register rules are the only place a column name for the page comes from', () => {
  for (const name of ['register-screen.tsx', 'register-toolbar.tsx']) {
    assert.doesNotMatch(registers('components', name), /\.order\(|\.ilike\(|\.range\(/, `${name} does not build queries`)
  }
})
```

Update the guards in `tests/unit/documents-ui.test.ts` and `tests/unit/phase-six-commercial-finance.test.ts` that read the old register or the removed list functions:

- `documents-ui.test.ts` `'the invoices register counts only collectible invoices as outstanding'` read `phase-six-register.tsx` for `COLLECTIBLE_INVOICE_STATUSES` and the `if (kind === "invoice")` block. The rule now lives in the database function: change it to read `supabase/migrations/20261011160000_register_summary.sql` and assert the `outstanding` branch filters `status in ('Issued', 'Partially Paid', 'Overdue')` and `balance_amount > 0` and `archived_at is null`, and the `overdue` branch counts `status = 'Overdue'`.
- `phase-six-commercial-finance.test.ts` `"all six modules use authenticated server queries and actions"`: its `db.from(table)` and table-name assertions must still hold for the files that now read each table (`registers/queries/query-register.ts` takes the table from the rules; assert the five tables appear in `features/registers/register-spec.ts` and `"financial_forecasts"` still appears in the queries file); keep `import "server-only"` and the `getSessionContext()`/`organization_id` assertions on the files they belong to.
- If `ui-completeness.test.ts` or another guard fails because a page now has `async function Page({ searchParams })`, update its expectation to accept the new shape (it must still require `PhaseSixRegister`).

Run: `node --test --experimental-strip-types tests/unit/registers-ui.test.ts` — expected FAIL (screen and toolbar missing).

- [ ] **Step 2: The toolbar (client)**

Create `features/registers/components/register-toolbar.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

/**
 * Search, status, owner and the archived switch. Every change builds a new address (a search or a filter returns to
 * page 1), so a refresh, the back button or a shared link keeps the view. The sort and the page are carried over by
 * the hidden fields. Nothing here reads or writes data.
 */
export function RegisterToolbar({
  base,
  q,
  status,
  owner,
  archived,
  sort,
  dir,
  statuses,
  owners,
  tooShort,
  exportSlot,
  importHref,
}: {
  base: string
  q: string
  status: string | null
  owner: string | null
  archived: boolean
  sort: string | null
  dir: 'asc' | 'desc'
  statuses: readonly string[]
  owners: Array<{ id: string; label: string }>
  tooShort: boolean
  exportSlot?: ReactNode
  importHref?: string
}) {
  const router = useRouter()
  const [text, setText] = useState(q)

  function go(next: { q?: string; status?: string; owner?: string; archived?: boolean }) {
    const query = new URLSearchParams()
    const search = (next.q ?? text).trim()
    const nextStatus = next.status ?? status ?? ''
    const nextOwner = next.owner ?? owner ?? ''
    const nextArchived = next.archived ?? archived
    if (search) query.set('q', search)
    if (nextStatus) query.set('status', nextStatus)
    if (nextOwner) query.set('owner', nextOwner)
    if (nextArchived) query.set('archived', '1')
    if (sort) {
      query.set('sort', sort)
      query.set('dir', dir)
    }
    const text2 = query.toString()
    router.push(text2 ? `${base}?${text2}` : base)
  }

  const field = 'unison-field min-h-10 rounded-none border border-border bg-card px-3 text-sm'
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        go({})
      }}
      className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4"
    >
      <label className="block min-w-48 flex-1">
        <span className="text-xs font-medium text-muted-foreground">Search</span>
        <input name="q" value={text} onChange={(event) => setText(event.target.value)} placeholder="Name, client, number…" className={`${field} mt-1 w-full`} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Status</span>
        <select name="status" value={status ?? ''} onChange={(event) => go({ status: event.target.value })} className={`${field} mt-1 block`}>
          <option value="">All statuses</option>
          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Owner</span>
        <select name="owner" value={owner ?? ''} onChange={(event) => go({ owner: event.target.value })} className={`${field} mt-1 block`}>
          <option value="">Everyone</option>
          {owners.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select>
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="archived" checked={archived} onChange={(event) => go({ archived: event.target.checked })} />
        Show archived
      </label>
      <button type="submit" className="min-h-10 border border-border px-4 text-sm font-medium">Search</button>
      <div className="ml-auto flex items-center gap-2">
        {importHref ? <a href={importHref} className="min-h-10 border border-border px-4 py-2.5 text-sm font-medium">Import</a> : null}
        {exportSlot}
      </div>
      {tooShort ? <p role="status" className="w-full text-xs text-muted-foreground">Enter at least 2 characters to search.</p> : null}
    </form>
  )
}
```

- [ ] **Step 3: The screen (server)**

Create `features/registers/components/register-screen.tsx`. Read `phase-six-register.tsx` first (the header, `WorkspaceHeader`, `MetricCard` usage) and keep the same frame; read `components/shared/state-feedback` for an existing error or empty-state look and reuse it if it fits. Render, in order:

1. `<WorkspaceHeader category title description action actionHref={`${frame.base}/new`} />` from `REGISTER_FRAMES[kind]` (as the old register did).
2. The cards: `buildCards(kind, await getRegisterSummary(kind))` through `MetricCard` (always shown, also when the register is empty).
3. A bordered frame with `<RegisterToolbar ... />` (pass `statuses={REGISTERS[kind].statuses}`, `owners={await listOwners()}`, the current params, `tooShort={params.searchTooShort}`, `importHref` only when `portableDefinitions[REGISTERS[kind].collection].importColumns` exists (as the old register decided `allowImport`; `@/features/data-portability/portable-collections`): `/records/${collectionSlug(frame.base, `${frame.singular} Register`)}/import?${new URLSearchParams({ collection: REGISTERS[kind].collection, return: frame.base })}`, and an `exportSlot` placeholder `null` that Task 4 fills; read `app/(unison)/records/[collection]/import/page.tsx` and `CollectionImportPage` to confirm the import page works from the address alone, without the shared register's browser-stored payload, and tell the controller if it does not).
4. The table (inside `overflow-x-auto`): one `<th scope="col">` per `REGISTER_FRAMES[kind].columns`; a column whose id is in `REGISTERS[kind].sortable` renders its heading as a `<Link href={registerHref(frame.base, params, { sort: column.id, dir: nextDir })}>` where `nextDir` is `'desc'` when this column is currently sorted ascending and `'asc'` otherwise, with `aria-sort="ascending" | "descending" | "none"` on the `<th>` and an arrow glyph (`↑`/`↓`) for the active one; the first column of a row is a `<Link href={`${frame.base}/${row.id}`}>`; a status cell shows the text in a small pill; the last cell holds the row actions: `View` (link), `Edit` (link to `${frame.base}/${row.id}/edit`), and `Archive` (an `ActionButton` bound with `archiveRecordAction.bind(null, kind, row.id)`, `confirmText="Archive this record?"`) or, for an archived row, `Restore` (`restoreRecordAction.bind(null, kind, row.id)`).
5. States: no rows and no filters and not archived-view and `total === 0` → the register's own empty message (`frame.empty`); no rows with any filter set → "Nothing matches these filters." with a "Clear filters" link to `frame.base`.
6. The footer: `Showing {window.from}–{window.to} of {total.toLocaleString('en-ZA')}` and `Page {window.page} of {window.pageCount}` with `Previous` and `Next` as `Link`s built with `registerHref(frame.base, params, { page: window.page - 1 })` / `+ 1`, rendered as disabled text (`aria-disabled`) at the ends.

Wrap the data reads so a failure shows a clear error instead of an empty table: the screen is a server component, so a thrown error reaches the route's `error.tsx` (`app/error.tsx` exists); do **not** catch and swallow it. Add the text "The register could not be loaded." to the project's existing error boundary only if it has no generic message already (check `app/error.tsx`); otherwise rely on it.

- [ ] **Step 4: Wire the five pages and the old register file**

In `features/commercial-finance/components/phase-six-register.tsx`:
- Delete the `loaders` entries and imports for the five `list*` functions, `registerConfig`'s branches for `lead`, `quote`, `opportunity`, `invoice` and `expense`, the helpers only they used (`COLLECTIBLE_INVOICE_STATUSES`, `sum`, `money`, `date`, `text` if unused), and the `RecordCollectionWorkspace` usage for those kinds.
- Keep the `forecast` branch exactly as it is (unreachable since slice C).
- `PhaseSixRegister({ kind, searchParams })`: `if (isRegisterKind(kind)) return <RegisterScreen kind={kind} searchParams={searchParams} />`, otherwise the old forecast rendering.

In `features/commercial-finance/queries/phase-six.ts` delete the five Task 2 wrappers and `allRows`.

Change each of the five page files to:

```tsx
import { PhaseSixRegister } from '@/features/commercial-finance/components/phase-six-register'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PhaseSixRegister kind="lead" searchParams={await searchParams} />
}
```

(with `kind` `lead`, `quote`, `opportunity`, `invoice`, `expense` in `commercial/leads`, `commercial/quotes`, `commercial/sales`, `finance/invoices`, `finance/expenses`; `searchParams` is a Promise in this Next.js: confirm in `node_modules/next/dist/docs/` and adapt if different.)

- [ ] **Step 5: Run everything**

Run: `node --test --experimental-strip-types tests/unit/registers-ui.test.ts tests/unit/documents-ui.test.ts tests/unit/phase-six-commercial-finance.test.ts tests/unit/ui-completeness.test.ts`, then `pnpm typecheck`, `pnpm test` and `pnpm build`. Expected: green. Do not sign in or create records.

- [ ] **Step 6: Commit**

```bash
git add features/registers/components features/commercial-finance/components/phase-six-register.tsx features/commercial-finance/queries/phase-six.ts "app/(unison)/commercial/leads/page.tsx" "app/(unison)/commercial/quotes/page.tsx" "app/(unison)/commercial/sales/page.tsx" "app/(unison)/finance/invoices/page.tsx" "app/(unison)/finance/expenses/page.tsx" tests/unit/registers-ui.test.ts tests/unit/documents-ui.test.ts tests/unit/phase-six-commercial-finance.test.ts tests/unit/ui-completeness.test.ts
git status --short | grep -v public/
git commit -m "$(cat <<'EOF'
feat(registers): server-driven register screen with search, status, owner, archived, sort and paging for Leads, Quotes, Sales, Invoices and Expenses

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

(Stage only paths you changed; if `ui-completeness.test.ts` was not changed, omit it from `git add`.)

---

### Task 4: Export of the filtered result

**Files:**
- Create: `features/registers/components/register-export.tsx`
- Modify: `app/api/records/export/route.ts`, `features/registers/components/register-screen.tsx` (fill the `exportSlot`), `tests/unit/registers-ui.test.ts`
- Test: `tests/unit/registers-export.test.ts`

**Interfaces:**
- Consumes: Task 1's `readRegisterParams`, `applyRegisterFilters`, `applyRegisterOrder`, `REGISTERS`, `isRegisterKind`; the existing export route's `buildCsv`, `buildXlsx`, `buildPdf`, `portableDefinitions`.
- Produces: `GET /api/records/export?collection=<id>&format=csv|xlsx|pdf&kind=<registerKind>&q=&status=&owner=&archived=&sort=&dir=` (the register filters apply only when `kind` is one of the five); `export const EXPORT_LIMIT = 5000` and `exportQuery(...)` in a small pure helper `features/registers/export-query.ts`; `<RegisterExport collection kind params />`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/registers-export.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { EXPORT_LIMIT, EXPORT_TOO_MANY, readExportRequest } from '../../features/registers/export-query.ts'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

test('the cap and the message are the spec\'s', () => {
  assert.equal(EXPORT_LIMIT, 5000)
  assert.equal(EXPORT_TOO_MANY, 'More than 5,000 rows match. Narrow the search and try again.')
})

test('a register export request reads the same checked parameters as the page', () => {
  const request = readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=invoice&q=acme&status=Overdue&sort=due&dir=desc&page=7'))
  assert.equal(request.format, 'xlsx')
  assert.equal(request.kind, 'invoice')
  assert.equal(request.params?.q, 'acme')
  assert.equal(request.params?.status, 'Overdue')
  assert.equal(request.params?.sort, 'due')
  assert.equal(request.params?.dir, 'desc')
})

test('a hostile or mismatched request is ignored rather than trusted', () => {
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=users')).kind, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=invoice&status=bogus&sort=password')).params?.status, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=invoice&sort=password')).params?.sort, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=leads&format=csv&kind=invoice')).kind, null, 'the kind must match the collection')
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=exe&kind=invoice')).format, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=clients&format=csv')).kind, null, 'other collections keep the old behaviour')
})

test('the route applies the register rules for the five registers, caps at 5,001 rows and answers 413 with the message', () => {
  const route = read('app', 'api', 'records', 'export', 'route.ts')
  assert.match(route, /readExportRequest\(/)
  assert.match(route, /applyRegisterFilters\(/)
  assert.match(route, /applyRegisterOrder\(/)
  assert.match(route, /EXPORT_LIMIT \+ 1/)
  assert.match(route, /status: 413/)
  assert.match(route, /EXPORT_TOO_MANY/)
  assert.doesNotMatch(route, /\.limit\(5000\)/, 'the silent cut-off is gone')
})
```

Append to `tests/unit/registers-ui.test.ts`:

```ts
test('the export control posts the current filters, shows the route\'s message, and the screen offers it', () => {
  const source = registers('components', 'register-export.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /\/api\/records\/export/)
  assert.match(source, /message/)
  assert.match(source, /role="alert"/)
  assert.match(source, /CSV/)
  assert.match(source, /XLSX/)
  assert.match(source, /PDF/)
  assert.match(registers('components', 'register-screen.tsx'), /RegisterExport/)
})
```

Run: `node --test --experimental-strip-types tests/unit/registers-export.test.ts tests/unit/registers-ui.test.ts` — expected FAIL.

- [ ] **Step 2: The pure export helper**

Create `features/registers/export-query.ts`:

```ts
// Reads an export request: the format, which register (if any) and the register parameters, all checked with the same
// rules as the page. Pure: no directive, relative imports only.
import { readRegisterParams, type RegisterParams } from './read-register-params.ts'
import { REGISTERS, isRegisterKind, type RegisterKind } from './register-spec.ts'

export const EXPORT_LIMIT = 5000
export const EXPORT_TOO_MANY = 'More than 5,000 rows match. Narrow the search and try again.'

export type ExportRequest = { format: 'csv' | 'xlsx' | 'pdf' | null; kind: RegisterKind | null; params: RegisterParams | null }

export function readExportRequest(search: URLSearchParams): ExportRequest {
  const format = search.get('format')?.toLowerCase() ?? ''
  const rawKind = search.get('kind')
  const kind = isRegisterKind(rawKind) && search.get('collection') === REGISTERS[rawKind].collection ? rawKind : null
  return {
    format: format === 'csv' || format === 'xlsx' || format === 'pdf' ? format : null,
    kind,
    params: kind ? readRegisterParams(kind, search) : null,
  }
}
```

- [ ] **Step 3: The route**

Read `app/api/records/export/route.ts` in full. Modify it so that:

- It calls `readExportRequest(url.searchParams)`; an invalid `format` keeps today's 400 "Choose CSV, XLSX or PDF." answer.
- When `request.kind` is set, it ignores `ids` and builds the query with `applyRegisterFilters(query, request.kind, request.params, organization.id)` and `applyRegisterOrder(...)` (which already scope by organisation) over `definition.columns`; otherwise it keeps today's query (still scoped by `organization_id`, still using `ids` and `orderBy`).
- For **both** paths it reads `EXPORT_LIMIT + 1` rows (`.limit(EXPORT_LIMIT + 1)`, replacing `.limit(5000)`); if more than `EXPORT_LIMIT` rows come back it answers `NextResponse.json({ message: EXPORT_TOO_MANY }, { status: 413 })` and builds no file; otherwise it exports the rows.
- Everything else (headers, `buildCsv`/`buildXlsx`/`buildPdf`, filename, `Cache-Control: private, no-store`) stays as it is. Import `EXPORT_LIMIT`, `EXPORT_TOO_MANY`, `readExportRequest` from `@/features/registers/export-query` and the apply functions from `@/features/registers/apply-filters`.

- [ ] **Step 4: The export control**

Create `features/registers/components/register-export.tsx` (read `components/shared/export-dialog.tsx` for the fetch-and-download pattern and copy its approach, not its scope radio):

```tsx
'use client'

import { Download } from 'lucide-react'
import { useState } from 'react'

type Format = 'CSV' | 'XLSX' | 'PDF'

/**
 * Downloads everything that matches the current filters, across all pages. It asks the export route with the same
 * parameters the page uses and shows the route's message (for example "More than 5,000 rows match…") instead of a file.
 */
export function RegisterExport({ collection, kind, query }: { collection: string; kind: string; query: string }) {
  const [busy, setBusy] = useState<Format | null>(null)
  const [message, setMessage] = useState('')

  async function run(format: Format) {
    setBusy(format)
    setMessage('')
    try {
      const params = new URLSearchParams(query)
      params.delete('page')
      params.set('collection', collection)
      params.set('kind', kind)
      params.set('format', format.toLowerCase())
      const response = await fetch(`/api/records/export?${params}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? 'The export could not be prepared.')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `unison-${collection}.${format.toLowerCase()}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The export could not be prepared.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Download className="size-3.5" />Export</span>
      {(['CSV', 'XLSX', 'PDF'] as Format[]).map((format) => (
        <button key={format} type="button" disabled={busy !== null} onClick={() => run(format)} className="min-h-10 border border-border px-3 text-xs font-semibold disabled:opacity-60">
          {busy === format ? 'Preparing…' : format}
        </button>
      ))}
      {message ? <p role="alert" className="w-full text-xs text-destructive">{message}</p> : null}
    </div>
  )
}
```

In `register-screen.tsx` pass `exportSlot={<RegisterExport collection={REGISTERS[kind].collection} kind={kind} query={queryStringOfThePage} />}` where `queryStringOfThePage` is the page's own address query (the same string `registerHref` would produce for the current params, without the base: `registerHref('', params).replace(/^\?/, '')`).

- [ ] **Step 5: Run everything**

Run: `node --test --experimental-strip-types tests/unit/registers-export.test.ts tests/unit/registers-ui.test.ts`, then `pnpm typecheck`, `pnpm test` and `pnpm build`. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add features/registers/export-query.ts features/registers/components/register-export.tsx features/registers/components/register-screen.tsx app/api/records/export/route.ts tests/unit/registers-export.test.ts tests/unit/registers-ui.test.ts
git commit -m "$(cat <<'EOF'
feat(registers): export everything that matches the current filters, with a clear message above 5,000 rows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Controller: proof, documents and hand-over (not dispatched to an implementer)

Production steps and anything needing judgement or the user.

- [ ] **Step 1: Migration gate (after Task 1):** rolled-back probe of `register_summary` (every kind and an unknown one, with synthetic rows) and `forecast_months`, apply as `register_summary`, run `register-summary.test.ts`, `forecast-months.test.ts` and `payments.test.ts`; confirm no fixture rows or orphan audit rows from this slice remain (the 1,100 bulk invoices especially).
- [ ] **Step 2: Query plans.** With `EXPLAIN` on the main filters (status, owner, search, sort by date and amount) for invoices, quotes and leads on a fixture organisation of about 1,100 rows (created and removed in one rolled-back transaction), note any sequential scan on a large table and record a missing index as a follow-up; do not add an index without the user's say-so.
- [ ] **Step 3: Gates on the branch:** `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:rls` (expect only the two known `provision-organization` failures).
- [ ] **Step 4: Preview check.** With a temporary unauthenticated fixture route (deleted afterwards), render the register table, toolbar, empty state and footer with fixture data at desktop and phone width; check the sort heading arrows, the disabled Previous/Next at the ends and the Clear filters state; remove every temporary file and any stale generated `.next/dev/types/validator.ts`; confirm `git status`.
- [ ] **Step 5: Documents.** Append an "Amendments made while planning and building" section (the eight decisions above plus anything the reviews add) to the spec; add a "From Stage 3 part 1" section to `docs/follow-ups.md` (not exercised signed in; the New and Edit forms still load every client, project and member for their select lists; the other registers still use the shared client-side register; the old typed-forecast code stays unreachable; Duplicate removed and bulk archive gone; export of selected rows gone; no date or amount filters; speed on real data at scale unmeasured beyond the query-plan check); tick the roadmap's Stage 3 items for search/filter/sort/paging, one-record detail pages and export with "built, waiting for the signed-in walk-through" (leave sales targets and the reports page unticked); update the memory file.
- [ ] **Step 6: Hand-over.** Give the user the signed-in checklist (open each register, search, filter by status and owner, sort a column, page forward and back, copy the link into a new tab, archive and restore one record and see it move in and out of "Show archived", open a record, export the filtered result), and note that the deploy must include the migration already applied. Finish the branch only when the user chooses.

---

## Self-review

**Spec coverage.**
- Register rules (columns, statuses, sortable, defaults) and their tie to the database checks: Task 1 (`register-spec.ts`, `registers-spec.test.ts`).
- The address reader and the search cleaning: Task 1 (`read-register-params.ts`, `registers-params.test.ts`).
- The page query (one page, exact total, stable order, clamp past the end, names by id): Tasks 1 (filters, arithmetic) and 2 (`query-register.ts`, `loadNameMaps`).
- `register_summary` and the cards, main currency and "other currencies not included": Task 1 (SQL, `summary.ts`, tests).
- Archive and Restore (real, plain messages): Task 2.
- Forecast ignores archived invoices: Task 1 (migration part 2 and its test).
- Register screen (toolbar, sortable headings, 25 per page, link that remembers, cards, empty and clear-filters states, View/Edit/Archive/Restore, Import link): Task 3.
- Detail pages load one record: Task 2 (`getPhaseSixRecord`).
- Export with filters, across all pages, 5,000 cap with a 413 message: Task 4.
- Testing section: unit (Tasks 1 to 4), database including the 1,100-row paging test (Task 1), preview and query-plan checks (Task 5).
- Out of scope respected: no targets or reports, no date/amount filters, shared component untouched, other registers untouched.

**Placeholder scan.** No TBD or TODO. Task 2 Step 2 contains `/* MOVE ... */` markers that are explicit instructions to copy existing code verbatim (with the exact source lines named) and a test that fails if any remain.

**Type consistency.** `RegisterKind`, `RegisterParams`, `REGISTERS`, `REGISTER_FRAMES`, `toRegisterRow`, `buildCards`, `pageWindow`, `readRegisterParams`, `registerHref`, `applyRegisterFilters(query, kind, params, organizationId)`, `applyRegisterOrder(query, kind, params)` are defined in Task 1 and used with the same signatures in Tasks 2 to 4. `queryRegister` returns `{ records, total, window }`; Task 3 maps `records` through `toRegisterRow`. The summary JSON keys in the SQL (`count`, `qualified`, `value`, `accepted`, `open`, `pipeline`, `weighted`, `outstanding`, `overdue`, `spend`, `awaiting`, `approved`) equal the keys `buildCards` reads and the database test asserts.
