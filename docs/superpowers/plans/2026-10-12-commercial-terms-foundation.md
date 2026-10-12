# Commercial Terms Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give UNISON one governed place for quote and invoice terms: versioned, approved templates layered from company-wide terms down to a specific offering, with fee and credit placeholders filled from the rate card, an admin screen under Settings, and a rendered preview.

**Architecture:** Two new tables (`terms_templates`, `terms_template_versions`) written only through security-definer functions; approved versions are immutable. A pure TypeScript resolver combines the layers, removes repeated lines and fills placeholders; a thin server layer loads the current approved versions and rate card values. Admin pages under `/settings/terms` follow the price-list screen's patterns. Quote and invoice forms are NOT touched (Build 2).

**Tech Stack:** Next.js 16 App Router (server components and actions; `searchParams` and `params` are Promises), React 19 (`useActionState`), Supabase Postgres with RLS and security-definer functions, `node --test --experimental-strip-types`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-12-commercial-terms-foundation-design.md`

## Global Constraints

- Production database: the Supabase project `unison-uat` (id `nwdzpjzllhhqwawmsxjd`) IS production. Applying a migration, running the RLS suite and cleaning up are **controller-only** steps; an implementer subagent writes the files and runs only the unit tests.
- Tests that touch the database create fixture organisations and users and delete them, **including their audit rows** (extend the cleanup sweep, Task 4). After any database run the controller verifies no fixture rows remain.
- Migrations are append-only: never edit an applied migration; later fixes go in a new file. Latest existing migration: `20261012150000_document_contact.sql`. This plan uses `20261012160000` and `20261012161000`.
- Git: never `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean`. Add explicit paths. Do not touch `public/` or any `record-collection-workspace.tsx`. Commit only on the branch `feat/terms-foundation`. Repo files use CRLF; the Write tool writes LF, which is fine (git normalises).
- Unit tests run with `node --test --experimental-strip-types tests/unit/<file>.test.ts`; imports inside tested modules must be relative and end in `.ts` (no `@/` alias, no `server-only`) for the pure modules. Whole unit suite: `node --test --experimental-strip-types tests/unit/*.test.ts`. Typecheck: `npx tsc --noEmit -p .`.
- Placeholder names are exactly: `monthly_fee`, `monthly_credits`, `initiative_limit`, `valid_days`, `payment_days`, written `{{name}}` with no spaces.
- Roles: owners and admins write, approve, archive and restore; members read approved and archived versions only (never drafts).
- Seeded wording (retainer tiers and project categories) is loaded as **approved, version 1, effective 2026-10-12**. Support services get empty templates with no version. Nothing is invented for late-payment penalty, termination period, IP transfer or credit expiry.
- A control in the UI is a claim the product supports it: do not add a control that does nothing.
- Quote and invoice forms, tables, PDF and print are not changed in this build.

## Rulings made while planning (the spec is the authority; these resolve what it left open)

1. `terms_templates.archived_at` is **omitted**: the spec lists no function that sets it and no screen that uses it.
2. `create_terms_template` takes `p_org uuid` as its first parameter (the spec's signature omitted it; the function must know the organisation). A new token `TERMS_TARGET_INVALID` covers a bad kind/key/applies-to/title combination.
3. Saving a draft does **not** validate placeholders (a draft may be work in progress); **approval** does, as the spec says. The editor shows a live warning.
4. A line containing a placeholder with no value is **left out** of `lines` and returned in a new `skipped` list (and its placeholder in `missing`); braces are never printed. The spec's result shape gains `skipped: string[]`.
5. Deleting an approved or archived version is prevented for signed-in roles by revoked privileges, not by a row trigger, because a row trigger would also block the cascade when an organisation is deleted. The update trigger applies to every role.
6. A restored draft starts with no effective date; the admin chooses one before approving.

## Review Focus

Failure modes the spec implies that no obvious task test would otherwise exercise. Each is pinned by a test named in the owning task.

1. **Pasted Windows line endings and blank lines** in a body must give clean lines (Task 1 resolver test, Task 4 database test).
2. **A future-dated or just-after-midnight approved version** must not be picked early, and the South African "today" boundary must hold (Task 2).
3. **The same clause in two layers with different spacing or case** appears once (Task 1).
4. **Archiving the current version** must fall back to an older approved version, not to nothing and not to a draft (Task 2).
5. **A placeholder typed with spaces (`{{ monthly_fee }}`) or a lone `{{`** must block approval with a clear message, never reach a client (Task 1, Task 4).
6. **HIMARK Reserve has no initiative limit**: its seeded wording must not use `{{initiative_limit}}`, and any line whose value is missing is skipped, never printed with braces (Task 1, Task 3).
7. **A member or an outsider calling the write functions directly** (not through the screen) is refused (Task 4).

---

## File map

Create:
- `features/terms/placeholders.ts` — placeholder names, validation, filling (pure)
- `features/terms/resolve-terms.ts` — layering, dedupe, filling (pure)
- `features/terms/selection.ts` — current/upcoming version, South Africa today, which templates apply (pure)
- `features/terms/values.ts` — placeholder values from rate card and settings numbers (pure)
- `features/terms/seed-wording.ts` — the seeded templates (pure data)
- `features/terms/grouping.ts` — list grouping and status (pure)
- `features/terms/queries/list-terms-templates.ts`, `get-terms-template.ts`, `load-preview.ts` — server
- `features/terms/actions/terms.ts` — server actions
- `features/terms/components/terms-list-screen.tsx`, `new-template-form.tsx`, `terms-template-screen.tsx`, `draft-editor.tsx`, `terms-preview.tsx`
- `app/(unison)/settings/terms/page.tsx`, `app/(unison)/settings/terms/[templateId]/page.tsx`
- `supabase/migrations/20261012160000_commercial_terms.sql`, `supabase/migrations/20261012161000_commercial_terms_seed.sql`
- Tests: `tests/unit/terms-resolver.test.ts`, `terms-selection.test.ts`, `terms-seed.test.ts`, `terms-grouping.test.ts`, `terms-ui.test.ts`, `tests/integration/rls/terms-templates.test.ts`, `terms-seed.test.ts`

Modify:
- `features/documents/errors.ts` (new tokens), `features/organizations/components/organization-profile-screen.tsx` (link), `tests/integration/rls/helpers.ts` (cleanup sweep), `docs/crm-roadmap.md`, `docs/follow-ups.md`, spec (rulings)

---

### Task 1: Placeholders and the resolver (pure)

**Files:**
- Create: `features/terms/placeholders.ts`, `features/terms/resolve-terms.ts`
- Test: `tests/unit/terms-resolver.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 3, 6, 7):
  - `TERMS_PLACEHOLDERS: readonly ['monthly_fee','monthly_credits','initiative_limit','valid_days','payment_days']`
  - `type TermsPlaceholder`, `type PlaceholderValues = Partial<Record<TermsPlaceholder, string | null>>`
  - `placeholdersIn(text: string): TermsPlaceholder[]`
  - `placeholderProblems(text: string): string[]` (empty when valid)
  - `fillPlaceholders(text, values): { text: string; missing: TermsPlaceholder[] }`
  - `type TermsLayer = 'company' | 'offering' | 'category'`
  - `type ResolvedLayer = { layer: TermsLayer; templateId: string; versionId: string; version: number; body: string; inclusions: string }`
  - `type TermsSource = { layer; templateId; versionId; version }`
  - `type ResolvedTerms = { lines: string[]; inclusions: string[]; sources: TermsSource[]; missing: TermsPlaceholder[]; skipped: string[] }`
  - `splitTermsLines(text: string): string[]`
  - `resolveTerms(input: { layers: ResolvedLayer[]; values: PlaceholderValues }): ResolvedTerms`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/terms-resolver.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { TERMS_PLACEHOLDERS, fillPlaceholders, placeholderProblems, placeholdersIn } from '../../features/terms/placeholders.ts'
import { resolveTerms, splitTermsLines, type ResolvedLayer } from '../../features/terms/resolve-terms.ts'

const layer = (over: Partial<ResolvedLayer> & Pick<ResolvedLayer, 'layer' | 'body'>): ResolvedLayer => ({
  templateId: `t-${over.layer}`, versionId: `v-${over.layer}`, version: 1, inclusions: '', ...over,
})

test('the placeholder names are exactly the five the spec allows', () => {
  assert.deepEqual([...TERMS_PLACEHOLDERS], ['monthly_fee', 'monthly_credits', 'initiative_limit', 'valid_days', 'payment_days'])
})

test('placeholdersIn lists each placeholder once, in order of first use', () => {
  assert.deepEqual(placeholdersIn('{{monthly_credits}} and {{monthly_fee}} and {{monthly_credits}}'), ['monthly_credits', 'monthly_fee'])
  assert.deepEqual(placeholdersIn('no placeholders here'), [])
})

test('placeholderProblems accepts the exact names and rejects everything else in braces', () => {
  assert.deepEqual(placeholderProblems('The {{monthly_fee}} fee and {{payment_days}} days'), [])
  assert.deepEqual(placeholderProblems('{{unknown_name}}'), ['{{unknown_name}}'])
  assert.deepEqual(placeholderProblems('{{ monthly_fee }}'), ['{{ monthly_fee }}'], 'spaces inside the braces are not accepted')
  assert.deepEqual(placeholderProblems('{{Monthly_Fee}}'), ['{{Monthly_Fee}}'], 'names are lower case')
  assert.deepEqual(placeholderProblems('half open {{ here'), ['{{'])
  assert.deepEqual(placeholderProblems('stray }} here'), ['}}'])
  assert.deepEqual(placeholderProblems('{{ and half closed }}'), ['{{ and half closed }}'], 'braces around other text are one bad placeholder')
  assert.deepEqual(placeholderProblems(''), [])
})

test('fillPlaceholders fills known values and reports a missing one without printing braces', () => {
  assert.deepEqual(fillPlaceholders('{{monthly_credits}} credits', { monthly_credits: '40' }), { text: '40 credits', missing: [] })
  assert.deepEqual(fillPlaceholders('up to {{initiative_limit}}', { initiative_limit: null }), { text: 'up to {{initiative_limit}}', missing: ['initiative_limit'] })
  assert.deepEqual(fillPlaceholders('up to {{initiative_limit}}', {}).missing, ['initiative_limit'])
  assert.deepEqual(fillPlaceholders('{{valid_days}}', { valid_days: '' }).missing, ['valid_days'], 'an empty value counts as missing')
})

test('splitTermsLines trims, drops blank lines and copes with Windows and old Mac line endings', () => {
  assert.deepEqual(splitTermsLines('  one  \r\n\r\ntwo\rthree\n\n   \n'), ['one', 'two', 'three'])
  assert.deepEqual(splitTermsLines(''), [])
})

test('layers are combined in the given order and a clause repeated in a later layer appears once', () => {
  const result = resolveTerms({
    values: {},
    layers: [
      layer({ layer: 'company', body: 'All prices exclude VAT.\nQuotes are valid for a limited time.' }),
      layer({ layer: 'offering', body: 'all   prices EXCLUDE vat.\nSpecific to the offering.' }),
    ],
  })
  assert.deepEqual(result.lines, ['All prices exclude VAT.', 'Quotes are valid for a limited time.', 'Specific to the offering.'])
  assert.deepEqual(result.sources.map((source) => [source.layer, source.templateId, source.versionId, source.version]), [
    ['company', 't-company', 'v-company', 1], ['offering', 't-offering', 'v-offering', 1],
  ])
})

test('inclusions are kept apart from the terms and de-duplicated the same way', () => {
  const result = resolveTerms({
    values: {},
    layers: [
      layer({ layer: 'company', body: 'Term A.', inclusions: '' }),
      layer({ layer: 'offering', body: 'Term B.', inclusions: 'Dedicated lead\nRoadmap\ndedicated  LEAD' }),
    ],
  })
  assert.deepEqual(result.lines, ['Term A.', 'Term B.'])
  assert.deepEqual(result.inclusions, ['Dedicated lead', 'Roadmap'])
})

test('placeholders are filled from the values, and a line whose value is missing is skipped, never printed with braces', () => {
  const result = resolveTerms({
    values: { monthly_fee: 'R100 000,00', monthly_credits: '40', initiative_limit: null },
    layers: [layer({ layer: 'offering', body: 'The {{monthly_fee}} retainer includes {{monthly_credits}} credits.\nUp to {{initiative_limit}} initiatives.\nPlain line.' })],
  })
  assert.deepEqual(result.lines, ['The R100 000,00 retainer includes 40 credits.', 'Plain line.'])
  assert.deepEqual(result.missing, ['initiative_limit'])
  assert.deepEqual(result.skipped, ['Up to {{initiative_limit}} initiatives.'])
  assert.ok(result.lines.every((line) => !line.includes('{{')), 'no braces reach the output')
})

test('missing placeholders are listed once, in the order of the allowed list', () => {
  const result = resolveTerms({
    values: {},
    layers: [layer({ layer: 'offering', body: '{{payment_days}} days.\n{{monthly_fee}}.\n{{payment_days}} again.' })],
  })
  assert.deepEqual(result.missing, ['monthly_fee', 'payment_days'])
  assert.equal(result.skipped.length, 3)
})

test('no layers, or empty layers, give an empty result', () => {
  assert.deepEqual(resolveTerms({ layers: [], values: {} }), { lines: [], inclusions: [], sources: [], missing: [], skipped: [] })
  const empty = resolveTerms({ layers: [layer({ layer: 'company', body: '  \r\n ' })], values: {} })
  assert.deepEqual(empty.lines, [])
  assert.equal(empty.sources.length, 1, 'the layer is still a source even when it contributes no lines')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/terms-resolver.test.ts`
Expected: FAIL (cannot find module `../../features/terms/placeholders.ts`).

- [ ] **Step 3: Write `features/terms/placeholders.ts`**

```ts
// The fixed set of placeholders a terms template may use. No imports: unit tests, server code and the editor all use it.
// private.terms_text_valid in supabase/migrations/20261012160000_commercial_terms.sql holds the same list;
// tests/unit/terms-seed.test.ts keeps the two equal.

export const TERMS_PLACEHOLDERS = ['monthly_fee', 'monthly_credits', 'initiative_limit', 'valid_days', 'payment_days'] as const
export type TermsPlaceholder = (typeof TERMS_PLACEHOLDERS)[number]
export type PlaceholderValues = Partial<Record<TermsPlaceholder, string | null>>

const VALID = new RegExp(`\\{\\{(${TERMS_PLACEHOLDERS.join('|')})\\}\\}`, 'g')

/** The placeholders used in a text, each once, in order of first use. */
export function placeholdersIn(text: string): TermsPlaceholder[] {
  const found: TermsPlaceholder[] = []
  for (const match of text.matchAll(VALID)) {
    const name = match[1] as TermsPlaceholder
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/**
 * Anything in braces that is not exactly a known placeholder: an unknown name, spaces inside the braces, capitals,
 * or a lone "{{" or "}}". Empty when the text is valid.
 */
export function placeholderProblems(text: string): string[] {
  const rest = text.replace(VALID, '')
  const found = rest.match(/\{\{[^{}]*\}\}|\{\{|\}\}/g) ?? []
  return [...new Set(found)]
}

const hasValue = (value: string | null | undefined): value is string => typeof value === 'string' && value !== ''

/** The text with every placeholder replaced, or the text unchanged and the names that have no value. */
export function fillPlaceholders(text: string, values: PlaceholderValues): { text: string; missing: TermsPlaceholder[] } {
  const missing = placeholdersIn(text).filter((name) => !hasValue(values[name]))
  if (missing.length > 0) return { text, missing }
  return { text: text.replace(VALID, (_token, name: TermsPlaceholder) => values[name] as string), missing: [] }
}
```

- [ ] **Step 4: Write `features/terms/resolve-terms.ts`**

```ts
// Combines the layers of terms for one document into the lines a client would read. Pure: no imports from the framework.
import { TERMS_PLACEHOLDERS, fillPlaceholders, type PlaceholderValues, type TermsPlaceholder } from './placeholders.ts'

export type TermsLayer = 'company' | 'offering' | 'category'

export type ResolvedLayer = {
  layer: TermsLayer
  templateId: string
  versionId: string
  version: number
  body: string
  inclusions: string
}

export type TermsSource = { layer: TermsLayer; templateId: string; versionId: string; version: number }

export type ResolvedTerms = {
  lines: string[]
  inclusions: string[]
  sources: TermsSource[]
  /** Placeholders that had no value, in the order of the allowed list. */
  missing: TermsPlaceholder[]
  /** Lines left out because a placeholder in them had no value (shown as written, with the braces, so an admin can see what was dropped). */
  skipped: string[]
}

/** Non-empty trimmed lines, whatever line endings the text was pasted with. */
export function splitTermsLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

const clauseKey = (line: string) => line.replace(/\s+/g, ' ').trim().toLowerCase()

export function resolveTerms(input: { layers: ResolvedLayer[]; values: PlaceholderValues }): ResolvedTerms {
  const lines: string[] = []
  const inclusions: string[] = []
  const sources: TermsSource[] = []
  const skipped: string[] = []
  const missing = new Set<TermsPlaceholder>()
  const seenLines = new Set<string>()
  const seenInclusions = new Set<string>()

  const take = (text: string, out: string[], seen: Set<string>) => {
    for (const raw of splitTermsLines(text)) {
      const filled = fillPlaceholders(raw, input.values)
      if (filled.missing.length > 0) {
        filled.missing.forEach((name) => missing.add(name))
        if (!skipped.includes(raw)) skipped.push(raw)
        continue
      }
      const key = clauseKey(filled.text)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(filled.text)
    }
  }

  for (const layer of input.layers) {
    sources.push({ layer: layer.layer, templateId: layer.templateId, versionId: layer.versionId, version: layer.version })
    take(layer.body, lines, seenLines)
    take(layer.inclusions, inclusions, seenInclusions)
  }

  return { lines, inclusions, sources, missing: TERMS_PLACEHOLDERS.filter((name) => missing.has(name)), skipped }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/terms-resolver.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit -p .
git add features/terms/placeholders.ts features/terms/resolve-terms.ts tests/unit/terms-resolver.test.ts
git commit -m "feat(terms): placeholders and the layered terms resolver"
```
(End the commit message with the attribution line from the session's system reminder.)

---

### Task 2: Version selection and which templates apply (pure)

**Files:**
- Create: `features/terms/selection.ts`
- Test: `tests/unit/terms-selection.test.ts`

**Interfaces:**
- Consumes: `TermsLayer` from `./resolve-terms.ts`.
- Produces:
  - `type VersionStatus = 'draft' | 'approved' | 'archived'`
  - `type SelectableVersion = { version: number; status: VersionStatus; effectiveFrom: string | null }`
  - `currentVersion<T extends SelectableVersion>(versions: T[], today: string): T | null`
  - `upcomingVersion<T extends SelectableVersion>(versions: T[], today: string): T | null`
  - `saToday(now?: Date): string` (ISO date in Africa/Johannesburg)
  - `type TermsTarget = { layer: TermsLayer; targetKind: 'company' | 'retainer' | 'project' | 'support'; targetKey: string | null }`
  - `termsTargetsFor(offering: { kind: 'retainer' | 'project' | 'support'; key: string; categoryKey?: string | null } | null): TermsTarget[]`
  - `appliesToKind(appliesTo: 'quote' | 'invoice' | 'both', kind: 'quote' | 'invoice'): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/terms-selection.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { appliesToKind, currentVersion, saToday, termsTargetsFor, upcomingVersion, type SelectableVersion } from '../../features/terms/selection.ts'

const v = (version: number, status: SelectableVersion['status'], effectiveFrom: string | null): SelectableVersion => ({ version, status, effectiveFrom })

test('the current version is the approved one with the latest effective date that has arrived', () => {
  const versions = [v(1, 'approved', '2026-01-01'), v(2, 'approved', '2026-06-01'), v(3, 'draft', null)]
  assert.equal(currentVersion(versions, '2026-10-12')?.version, 2)
})

test('a future-dated approved version is skipped until its date, and is the upcoming one meanwhile', () => {
  const versions = [v(1, 'approved', '2026-01-01'), v(2, 'approved', '2026-11-01')]
  assert.equal(currentVersion(versions, '2026-10-31')?.version, 1)
  assert.equal(upcomingVersion(versions, '2026-10-31')?.version, 2)
  assert.equal(currentVersion(versions, '2026-11-01')?.version, 2, 'it becomes current on its effective date')
  assert.equal(upcomingVersion(versions, '2026-11-01'), null)
})

test('drafts and archived versions are never current', () => {
  assert.equal(currentVersion([v(1, 'draft', '2026-01-01'), v(2, 'archived', '2026-01-01')], '2026-10-12'), null)
})

test('archiving the newest version falls back to an older approved one', () => {
  const versions = [v(1, 'approved', '2026-01-01'), v(2, 'archived', '2026-06-01')]
  assert.equal(currentVersion(versions, '2026-10-12')?.version, 1)
})

test('on the same effective date the higher version number wins', () => {
  assert.equal(currentVersion([v(1, 'approved', '2026-05-01'), v(2, 'approved', '2026-05-01')], '2026-10-12')?.version, 2)
})

test('an approved version without an effective date is ignored rather than guessed', () => {
  assert.equal(currentVersion([v(1, 'approved', null)], '2026-10-12'), null)
})

test('with several upcoming versions the earliest is the upcoming one', () => {
  assert.equal(upcomingVersion([v(1, 'approved', '2026-12-01'), v(2, 'approved', '2026-11-01')], '2026-10-12')?.version, 2)
})

test('saToday uses the South African date, not the UTC date', () => {
  assert.equal(saToday(new Date('2026-12-31T23:30:00Z')), '2027-01-01', '01:30 on 1 January in South Africa')
  assert.equal(saToday(new Date('2026-06-15T10:00:00Z')), '2026-06-15')
  assert.equal(saToday(new Date('2026-06-15T21:59:00Z')), '2026-06-15')
  assert.equal(saToday(new Date('2026-06-15T22:00:00Z')), '2026-06-16', '00:00 SAST is 22:00 UTC the day before')
})

test('the company terms always come first, then the offering, then the category when one is given', () => {
  assert.deepEqual(termsTargetsFor(null), [{ layer: 'company', targetKind: 'company', targetKey: null }])
  assert.deepEqual(termsTargetsFor({ kind: 'retainer', key: 'growth' }), [
    { layer: 'company', targetKind: 'company', targetKey: null },
    { layer: 'offering', targetKind: 'retainer', targetKey: 'growth' },
  ])
  assert.deepEqual(termsTargetsFor({ kind: 'support', key: 'website_care', categoryKey: 'digital_presence' }), [
    { layer: 'company', targetKind: 'company', targetKey: null },
    { layer: 'offering', targetKind: 'support', targetKey: 'website_care' },
    { layer: 'category', targetKind: 'project', targetKey: 'digital_presence' },
  ])
})

test('a template applies to a document kind when it is for that kind or for both', () => {
  assert.equal(appliesToKind('quote', 'quote'), true)
  assert.equal(appliesToKind('both', 'invoice'), true)
  assert.equal(appliesToKind('invoice', 'quote'), false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/terms-selection.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `features/terms/selection.ts`**

```ts
// Which version of a template is in force, and which templates apply to an offering. Pure.
import type { TermsLayer } from './resolve-terms.ts'

export type VersionStatus = 'draft' | 'approved' | 'archived'
export type SelectableVersion = { version: number; status: VersionStatus; effectiveFrom: string | null }

/** ISO dates compare correctly as strings. */
const approvedWithDate = <T extends SelectableVersion>(versions: T[]) =>
  versions.filter((item): item is T & { effectiveFrom: string } => item.status === 'approved' && item.effectiveFrom !== null)

/** The approved version with the latest effective date that is not in the future; the higher version wins a tie. */
export function currentVersion<T extends SelectableVersion>(versions: T[], today: string): T | null {
  const ready = approvedWithDate(versions).filter((item) => item.effectiveFrom <= today)
  ready.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? b.version - a.version : a.effectiveFrom < b.effectiveFrom ? 1 : -1))
  return ready[0] ?? null
}

/** The approved version that starts soonest after today, or null. */
export function upcomingVersion<T extends SelectableVersion>(versions: T[], today: string): T | null {
  const later = approvedWithDate(versions).filter((item) => item.effectiveFrom > today)
  later.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? a.version - b.version : a.effectiveFrom < b.effectiveFrom ? -1 : 1))
  return later[0] ?? null
}

/** Today's date in South Africa, as YYYY-MM-DD. */
export function saToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export type TermsTarget = { layer: TermsLayer; targetKind: 'company' | 'retainer' | 'project' | 'support'; targetKey: string | null }

/**
 * The templates whose current version feeds a document, in layer order: the company terms, the offering's own terms
 * and, when the caller names one, its project category. Build 2 calls this from the quote form.
 */
export function termsTargetsFor(offering: { kind: 'retainer' | 'project' | 'support'; key: string; categoryKey?: string | null } | null): TermsTarget[] {
  const targets: TermsTarget[] = [{ layer: 'company', targetKind: 'company', targetKey: null }]
  if (!offering) return targets
  targets.push({ layer: 'offering', targetKind: offering.kind, targetKey: offering.key })
  if (offering.categoryKey) targets.push({ layer: 'category', targetKind: 'project', targetKey: offering.categoryKey })
  return targets
}

export function appliesToKind(appliesTo: 'quote' | 'invoice' | 'both', kind: 'quote' | 'invoice'): boolean {
  return appliesTo === 'both' || appliesTo === kind
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/terms-selection.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit -p .
git add features/terms/selection.ts tests/unit/terms-selection.test.ts
git commit -m "feat(terms): which version is in force and which templates apply"
```

---

### Task 3: Placeholder values and the seed wording (pure)

**Files:**
- Create: `features/terms/values.ts`, `features/terms/seed-wording.ts`
- Test: `tests/unit/terms-seed.test.ts` (this task adds the wording tests; Task 5 appends the migration-match tests to the same file)

**Interfaces:**
- Consumes: `PlaceholderValues`, `placeholderProblems` (Task 1); `resolveTerms` (Task 1); `RATE_CARD`, `PROJECTS`, `TIERS`, `packageName` from `features/billing/rate-card.ts` (existing: `RATE_CARD: readonly RateItem[]` with `key`, `kind`, `packageKey`, `title`, `price`, `credits`, `initiativeLimit`).
- Produces:
  - `type RetainerRate = { monthlyFee: number; credits: number | null; initiativeLimit: number | null }`
  - `buildPlaceholderValues(input: { retainer?: RetainerRate | null; validDays: number | null; paymentDays: number | null; formatMoney: (amount: number) => string }): PlaceholderValues`
  - `type SeedTemplate = { targetKind: 'retainer' | 'project' | 'support'; targetKey: string; appliesTo: 'quote'; title: string; body: string; inclusions: string }`
  - `SEED_TEMPLATES: readonly SeedTemplate[]` (4 retainers, 6 projects, 10 support services)
  - `SEED_EFFECTIVE_FROM = '2026-10-12'`, `COMPANY_SEED = [{ appliesTo: 'quote', title: 'Company terms: quotes' }, { appliesTo: 'invoice', title: 'Company terms: invoices' }]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/terms-seed.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { RATE_CARD } from '../../features/billing/rate-card.ts'
import { placeholderProblems, placeholdersIn } from '../../features/terms/placeholders.ts'
import { resolveTerms } from '../../features/terms/resolve-terms.ts'
import { COMPANY_SEED, SEED_EFFECTIVE_FROM, SEED_TEMPLATES } from '../../features/terms/seed-wording.ts'
import { buildPlaceholderValues } from '../../features/terms/values.ts'

const money = (amount: number) => `R${amount}`

test('buildPlaceholderValues turns numbers into text and leaves what is unknown as null', () => {
  assert.deepEqual(
    buildPlaceholderValues({ retainer: { monthlyFee: 100000, credits: 40, initiativeLimit: 2 }, validDays: 30, paymentDays: 14, formatMoney: money }),
    { monthly_fee: 'R100000', monthly_credits: '40', initiative_limit: '2', valid_days: '30', payment_days: '14' },
  )
  assert.deepEqual(
    buildPlaceholderValues({ retainer: { monthlyFee: 300000, credits: 220, initiativeLimit: null }, validDays: null, paymentDays: null, formatMoney: money }),
    { monthly_fee: 'R300000', monthly_credits: '220', initiative_limit: null, valid_days: null, payment_days: null },
  )
  assert.deepEqual(buildPlaceholderValues({ validDays: 30, paymentDays: 30, formatMoney: money }), {
    monthly_fee: null, monthly_credits: null, initiative_limit: null, valid_days: '30', payment_days: '30',
  })
  assert.equal(buildPlaceholderValues({ retainer: { monthlyFee: 1, credits: 12.5, initiativeLimit: null }, validDays: 1, paymentDays: 1, formatMoney: money }).monthly_credits, '12.5', 'a fractional credit count is not truncated')
})

test('the seed holds 4 retainer tiers, 6 project categories and the 10 rate card support services, each once', () => {
  const count = (kind: string) => SEED_TEMPLATES.filter((item) => item.targetKind === kind).length
  assert.equal(count('retainer'), 4)
  assert.equal(count('project'), 6)
  assert.equal(count('support'), 10)
  assert.equal(new Set(SEED_TEMPLATES.map((item) => `${item.targetKind}:${item.targetKey}`)).size, SEED_TEMPLATES.length)
  assert.deepEqual(SEED_TEMPLATES.filter((item) => item.targetKind === 'retainer').map((item) => item.targetKey), ['signature', 'growth', 'private', 'reserve'])
  assert.ok(SEED_TEMPLATES.some((item) => item.targetKind === 'project' && item.targetKey === 'strategic_consulting'), 'Strategic Consulting is terms-only: it has no rate card row')
  const supportKeys = RATE_CARD.filter((item) => item.kind === 'support').map((item) => item.key.replace('support.', ''))
  assert.deepEqual(SEED_TEMPLATES.filter((item) => item.targetKind === 'support').map((item) => item.targetKey).sort(), [...supportKeys].sort())
  assert.equal(SEED_EFFECTIVE_FROM, '2026-10-12')
  assert.deepEqual(COMPANY_SEED.map((item) => item.appliesTo), ['quote', 'invoice'])
})

test('every seeded text uses only allowed placeholders', () => {
  for (const item of SEED_TEMPLATES) {
    assert.deepEqual(placeholderProblems(item.body), [], `${item.title} body`)
    assert.deepEqual(placeholderProblems(item.inclusions), [], `${item.title} inclusions`)
  }
})

test('support services are seeded empty: the brief gives no wording for them', () => {
  for (const item of SEED_TEMPLATES.filter((entry) => entry.targetKind === 'support')) {
    assert.equal(item.body, '', item.title)
    assert.equal(item.inclusions, '', item.title)
  }
})

test('each retainer resolves against the rate card with nothing missing and nothing skipped', () => {
  for (const tier of SEED_TEMPLATES.filter((entry) => entry.targetKind === 'retainer')) {
    const monthly = RATE_CARD.find((item) => item.key === `retainer.${tier.targetKey}.monthly`)!
    const values = buildPlaceholderValues({
      retainer: { monthlyFee: monthly.price, credits: monthly.credits, initiativeLimit: monthly.initiativeLimit },
      validDays: 30, paymentDays: 30, formatMoney: money,
    })
    const result = resolveTerms({ layers: [{ layer: 'offering', templateId: 't', versionId: 'v', version: 1, body: tier.body, inclusions: tier.inclusions }], values })
    assert.deepEqual(result.missing, [], tier.title)
    assert.deepEqual(result.skipped, [], tier.title)
    assert.ok(result.lines.length >= 7, `${tier.title} has its terms`)
    assert.ok(result.inclusions.length >= 5, `${tier.title} lists its service inclusions`)
    assert.ok(result.lines.some((line) => line.includes(`R${monthly.price} monthly retainer includes ${monthly.credits} monthly credits`)), `${tier.title} shows its own fee and credits`)
  }
})

test('the initiative limit comes from the rate card, so Signature, Growth and Private say 2, 4 and 6', () => {
  const lineFor = (key: string) => {
    const tier = SEED_TEMPLATES.find((entry) => entry.targetKey === key)!
    const monthly = RATE_CARD.find((item) => item.key === `retainer.${key}.monthly`)!
    const values = buildPlaceholderValues({ retainer: { monthlyFee: monthly.price, credits: monthly.credits, initiativeLimit: monthly.initiativeLimit }, validDays: 30, paymentDays: 30, formatMoney: money })
    return resolveTerms({ layers: [{ layer: 'offering', templateId: 't', versionId: 'v', version: 1, body: tier.body, inclusions: '' }], values }).lines[0]
  }
  assert.match(lineFor('signature'), /up to 2 agreed active business priorities/)
  assert.match(lineFor('growth'), /up to 4 agreed active initiatives/)
  assert.match(lineFor('private'), /up to 6 agreed active initiatives/)
})

test('HIMARK Reserve has no initiative limit, so its wording must not use that placeholder', () => {
  const reserve = SEED_TEMPLATES.find((entry) => entry.targetKey === 'reserve')!
  assert.deepEqual(placeholdersIn(reserve.body).filter((name) => name === 'initiative_limit'), [])
})

test('every project category has its own terms and none of them adds a monthly maintenance fee', () => {
  for (const item of SEED_TEMPLATES.filter((entry) => entry.targetKind === 'project')) {
    assert.ok(item.body.split('\n').length >= 4, `${item.title} has its clauses`)
    assert.doesNotMatch(item.body, /Do not automatically add/i, 'the builder instruction is not client wording')
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/terms-seed.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write `features/terms/values.ts`**

```ts
// The numbers behind the placeholders, turned into text. Pure: the caller supplies the money formatter.
import type { PlaceholderValues } from './placeholders.ts'

export type RetainerRate = { monthlyFee: number; credits: number | null; initiativeLimit: number | null }

const text = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? null : String(value))

export function buildPlaceholderValues(input: {
  retainer?: RetainerRate | null
  validDays: number | null
  paymentDays: number | null
  formatMoney: (amount: number) => string
}): PlaceholderValues {
  return {
    monthly_fee: input.retainer ? input.formatMoney(input.retainer.monthlyFee) : null,
    monthly_credits: text(input.retainer?.credits),
    initiative_limit: text(input.retainer?.initiativeLimit),
    valid_days: text(input.validDays),
    payment_days: text(input.paymentDays),
  }
}
```

- [ ] **Step 4: Write `features/terms/seed-wording.ts`**

```ts
// The terms loaded for the HIMARK organisation by supabase/migrations/20261012161000_commercial_terms_seed.sql, as
// approved version 1 effective 2026-10-12. The wording is HIMARK's (from the terms brief). Fees, credits and the number
// of active initiatives are placeholders filled from the rate card, so they cannot drift from it.
// No imports from the framework: unit tests use it directly.
import { RATE_CARD, PROJECTS, packageName } from '../billing/rate-card.ts'

export const SEED_EFFECTIVE_FROM = '2026-10-12'

/** The two company-wide templates. Their wording is copied from the organisation's existing default terms when the seed runs. */
export const COMPANY_SEED = [
  { appliesTo: 'quote', title: 'Company terms: quotes' },
  { appliesTo: 'invoice', title: 'Company terms: invoices' },
] as const

export type SeedTemplate = {
  targetKind: 'retainer' | 'project' | 'support'
  targetKey: string
  appliesTo: 'quote'
  title: string
  body: string
  inclusions: string
}

const lines = (...items: string[]) => items.join('\n')

const RETAINERS: Array<{ key: string; body: string; inclusions: string }> = [
  {
    key: 'signature',
    body: lines(
      'Signature Partner provides focused strategic advisory and transformation support for up to {{initiative_limit}} agreed active business priorities.',
      'The partnership includes a dedicated HIMARK Engagement Lead, an agreed improvement roadmap, applicable TRACE assessments, fortnightly working sessions and monthly executive progress reviews.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'The included monthly credits are not separately invoiced.',
      'One-time onboarding or implementation work is scoped, approved and priced separately where applicable.',
      'Additional credits or work beyond the agreed scope require prior client approval and separate billing.',
      'Specialist access, delivery capacity and priorities remain subject to the agreement.',
      'Unused-credit treatment, contract duration and termination conditions follow the signed agreement.',
    ),
    inclusions: lines('Dedicated HIMARK Engagement Lead', 'Agreed improvement roadmap', 'Applicable TRACE assessments', 'Fortnightly working sessions', 'Monthly executive progress reviews'),
  },
  {
    key: 'growth',
    body: lines(
      'Growth Partner provides strategic coordination and transformation support for up to {{initiative_limit}} agreed active initiatives.',
      'HIMARK provides a dedicated Engagement Lead, a coordinated transformation roadmap, relevant TRACE monitoring, priority specialist access, implementation coordination, weekly working sessions and monthly executive governance.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'Included monthly credits must not be invoiced again.',
      'Substantial implementation and onboarding work is scoped and charged separately where applicable.',
      'Additional credits and approved scope changes are billed separately.',
      'Delivery commitments, credit treatment, contract duration and termination follow the signed agreement.',
    ),
    inclusions: lines('Dedicated Engagement Lead', 'Coordinated transformation roadmap', 'Relevant TRACE monitoring', 'Priority specialist access', 'Implementation coordination', 'Weekly working sessions', 'Monthly executive governance'),
  },
  {
    key: 'private',
    body: lines(
      "Private Partner provides embedded strategic transformation support alongside the client's leadership team for up to {{initiative_limit}} agreed active initiatives.",
      'The partnership includes a dedicated Account Director, a 12-month transformation agenda, multi-function TRACE assessments, executive reporting, vendor coordination and priority or reserved specialist access as agreed.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'Included monthly credits are not charged separately.',
      'Major implementation, onboarding and specialist projects outside the agreed scope require separate approval and pricing.',
      'Reserved access does not constitute unlimited delivery capacity.',
      'Credit rules, agreement duration, confidentiality obligations and termination conditions follow the executed agreement.',
    ),
    inclusions: lines('Dedicated Account Director', '12-month transformation agenda', 'Multi-function TRACE assessments', 'Executive reporting', 'Vendor coordination', 'Priority or reserved specialist access as agreed'),
  },
  {
    key: 'reserve',
    body: lines(
      'HIMARK Reserve provides enterprise-wide strategic transformation support and access to reserved HIMARK capability.',
      'The engagement includes an Account Director, HIMARK Executive Sponsor, enterprise transformation oversight, reserved specialist capacity, relevant TRACE assessments and executive or board-level reporting as agreed.',
      'The {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.',
      'Included credits must not be billed a second time.',
      'Additional enterprise initiatives, major implementation and work outside approved capacity require separate scope and commercial approval.',
      'Reserved-priority mobilisation is governed by the agreed capacity and delivery commitments.',
      'Confidentiality, credit availability, contract duration, service limitations and termination follow the executed agreement.',
    ),
    inclusions: lines('Account Director', 'HIMARK Executive Sponsor', 'Enterprise transformation oversight', 'Reserved specialist capacity', 'Relevant TRACE assessments', 'Executive or board-level reporting as agreed'),
  },
]

const PROJECT_TERMS: Array<{ key: string; title: string; body: string }> = [
  {
    key: 'strategic_consulting',
    title: 'Strategic Consulting',
    body: lines(
      'The engagement covers the specific strategic advisory deliverables described in the approved scope of work.',
      'Discovery, research, recommendations and agreed strategy documents are delivered according to the approved project plan.',
      'Client input, access to relevant stakeholders and timely feedback may be required.',
      'Additional strategic initiatives or ongoing advisory support are excluded unless contracted separately.',
    ),
  },
  {
    key: 'operating_model',
    title: packageName('operating_model'),
    body: lines(
      'Delivery is limited to the approved operational processes, business functions and improvement objectives.',
      'The client provides necessary operational information, system access and stakeholder participation.',
      'Changes affecting additional departments, systems or agreed requirements are subject to change approval.',
      'Ongoing operational management or improvement support is contracted separately where required.',
    ),
  },
  {
    key: 'intelligence_ai',
    title: packageName('intelligence_ai'),
    body: lines(
      'The engagement covers the agreed AI, automation or intelligence solution and its documented scope.',
      'Deployment, integrations, data access, testing and acceptance requirements must be agreed before implementation.',
      'Third-party AI usage, hosting, API access and subscription fees are separately identified unless included in the quotation.',
      'Performance monitoring, future model changes, maintenance and additional functionality are governed by the applicable support or change agreement.',
      'Client data handling, security and access requirements must be established in the approved project documentation.',
    ),
  },
  {
    key: 'digital_experience',
    title: packageName('digital_experience'),
    body: lines(
      'Delivery includes only the agreed digital experience, UX/UI, product design or application deliverables.',
      'Design approvals, revision allowances, device coverage and acceptance requirements are defined by the approved scope.',
      'New features, additional screens or additional development require separate approval.',
      'Post-delivery application or interface care is not included unless expressly contracted.',
    ),
  },
  {
    key: 'digital_presence',
    title: packageName('digital_presence'),
    body: lines(
      'Delivery covers the agreed website, branding or digital presence deliverables.',
      'The approved sitemap, pages, features, integrations and content responsibilities define the scope.',
      'Hosting, domain registration, licences and external subscriptions are included only where expressly itemised.',
      'New functionality, additional pages and post-launch maintenance require an approved scope or separate care agreement.',
      'Launch and handover follow the agreed client acceptance requirements.',
    ),
  },
  {
    key: 'visual_communication',
    title: packageName('visual_communication'),
    body: lines(
      'Delivery covers the approved visual communication, podcast, social media or executive communication deliverables.',
      'The quotation must identify quantities, formats, platforms, production responsibilities and revision limits.',
      'Studio hire, travel, recording equipment, external talent, paid media and other production expenses are included only where expressly stated.',
      'Additional episodes, content assets, revisions or campaigns require separate approval.',
      'Intellectual-property usage, publishing permissions and third-party materials are governed by the applicable agreed terms.',
    ),
  },
]

// Guards against a project category being added to the rate card without terms (or the reverse).
const PROJECT_KEYS_WITH_RATE = PROJECTS.map((project) => project.key)

export const SEED_TEMPLATES: readonly SeedTemplate[] = [
  ...RETAINERS.map((item): SeedTemplate => ({
    targetKind: 'retainer', targetKey: item.key, appliesTo: 'quote', title: packageName(item.key), body: item.body, inclusions: item.inclusions,
  })),
  ...PROJECT_TERMS.map((item): SeedTemplate => ({
    targetKind: 'project', targetKey: item.key, appliesTo: 'quote', title: item.title, body: item.body, inclusions: '',
  })),
  ...RATE_CARD.filter((item) => item.kind === 'support').map((item): SeedTemplate => ({
    targetKind: 'support', targetKey: item.key.replace('support.', ''), appliesTo: 'quote', title: item.title.replace(/: monthly$/, ''), body: '', inclusions: '',
  })),
]

if (!PROJECT_KEYS_WITH_RATE.every((key) => PROJECT_TERMS.some((item) => item.key === key))) {
  throw new Error('Every rate card project needs seed terms.')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/terms-seed.test.ts`
Expected: all 8 tests PASS. If the retainer test fails on `R100000 monthly retainer`, check the placeholder text in the seed wording matches the test's expectation exactly.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit -p .
git add features/terms/values.ts features/terms/seed-wording.ts tests/unit/terms-seed.test.ts
git commit -m "feat(terms): placeholder values and the seeded wording"
```

---

### Task 4: Tables, rules and functions (migration, applied by the controller) with database tests

**Files:**
- Create: `supabase/migrations/20261012160000_commercial_terms.sql`
- Create: `tests/integration/rls/terms-templates.test.ts`
- Modify: `tests/integration/rls/helpers.ts` (cleanup sweep: add `'terms_templates'` and `'terms_template_versions'` to the `.in('resource', [...])` list, after `'project_dependencies'`)
- Modify: `features/documents/errors.ts` (new tokens, see Task 6 step 1 — the unit-level wording lives there; this task only needs the tokens to exist in the migration)

**Interfaces:**
- Consumes: existing `public.is_member_of(uuid)`, `public.has_role(uuid, text[])`, `public.record_audit_event()`, `public.set_updated_at()`, `private.sa_today()` (exists, `20261012110000_client_engagements.sql`), `private` schema.
- Produces (database): tables `public.terms_templates`, `public.terms_template_versions`; functions `public.create_terms_template(p_org uuid, p_target_kind text, p_target_key text, p_applies_to text, p_title text) returns uuid`, `public.save_terms_draft(p_template uuid, p_body text, p_inclusions text, p_effective_from date, p_change_note text) returns uuid`, `public.discard_terms_draft(p_template uuid) returns void`, `public.approve_terms_version(p_version uuid) returns void`, `public.archive_terms_version(p_version uuid) returns void`, `public.restore_terms_version(p_version uuid) returns uuid`. Error tokens: `TERMS_TEMPLATE_EXISTS`, `TERMS_TARGET_INVALID`, `TERMS_NOT_FOUND`, `TERMS_NOT_DRAFT`, `TERMS_NOT_APPROVED`, `TERMS_DRAFT_EXISTS`, `TERMS_EMPTY`, `TERMS_EFFECTIVE_REQUIRED`, `TERMS_PLACEHOLDER_UNKNOWN`, `TERMS_TOO_LONG`, `TERMS_FORBIDDEN`, `TERMS_VERSION_IMMUTABLE`.

- [ ] **Step 1: Write the migration `supabase/migrations/20261012160000_commercial_terms.sql`**

```sql
-- Commercial terms foundation (build 1 of the terms engine). Append-only.
-- Terms templates are written only through the functions below. An approved version can never be edited: Build 2 points a
-- document at a version and relies on the wording behind it not moving. Owners and admins write, approve, archive and
-- restore; members read approved and archived versions only (never drafts).

-- ---------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------
create table public.terms_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_kind text not null check (target_kind in ('company', 'retainer', 'project', 'support')),
  target_key text check (target_key is null or target_key ~ '^[a-z0-9_]{1,60}$'),
  applies_to text not null check (applies_to in ('quote', 'invoice', 'both')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint terms_templates_key_matches_kind check ((target_kind = 'company') = (target_key is null))
);

create unique index terms_templates_target_unique
  on public.terms_templates (organization_id, target_kind, coalesce(target_key, ''), applies_to);

create table public.terms_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid not null,
  version integer not null check (version >= 1),
  status text not null check (status in ('draft', 'approved', 'archived')),
  body text not null default '' check (char_length(body) <= 20000),
  inclusions text not null default '' check (char_length(inclusions) <= 10000),
  effective_from date,
  change_note text check (change_note is null or char_length(change_note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  unique (template_id, version),
  constraint terms_versions_template_fkey foreign key (template_id, organization_id)
    references public.terms_templates(id, organization_id) on delete cascade,
  constraint terms_versions_approved_complete check (status = 'draft' or (effective_from is not null and approved_at is not null)),
  constraint terms_versions_archived_time check ((status = 'archived') = (archived_at is not null))
);

-- One draft per template: saving a draft updates it in place.
create unique index terms_versions_one_draft on public.terms_template_versions (template_id) where status = 'draft';
create index terms_versions_org_idx on public.terms_template_versions (organization_id, template_id, status);

create trigger terms_templates_set_updated_at before update on public.terms_templates
  for each row execute function public.set_updated_at();
create trigger terms_templates_audit after insert or update or delete on public.terms_templates
  for each row execute function public.record_audit_event();
create trigger terms_template_versions_audit after insert or update or delete on public.terms_template_versions
  for each row execute function public.record_audit_event();

-- ---------------------------------------------------------------------------
-- 2. Row-level security: members read; nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.terms_templates enable row level security;
alter table public.terms_template_versions enable row level security;

create policy terms_templates_select on public.terms_templates
  for select to authenticated using (public.is_member_of(organization_id));
create policy terms_versions_select on public.terms_template_versions
  for select to authenticated
  using (public.is_member_of(organization_id) and (status <> 'draft' or public.has_role(organization_id, array['owner', 'admin'])));

revoke all on public.terms_templates, public.terms_template_versions from anon, authenticated;
grant select on public.terms_templates, public.terms_template_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. An approved or archived version cannot change (every role, including the functions below). The only permitted
--    changes are approved to archived, and a user reference being set to null when that user is deleted.
-- ---------------------------------------------------------------------------
create or replace function public.terms_versions_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.status = 'draft' then
    if new.status = 'archived' then
      raise exception 'TERMS_VERSION_IMMUTABLE' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.template_id is distinct from old.template_id
     or new.version is distinct from old.version
     or new.body is distinct from old.body
     or new.inclusions is distinct from old.inclusions
     or new.effective_from is distinct from old.effective_from
     or new.change_note is distinct from old.change_note
     or new.created_at is distinct from old.created_at
     or new.approved_at is distinct from old.approved_at
     or (new.created_by is distinct from old.created_by and new.created_by is not null)
     or (new.approved_by is distinct from old.approved_by and new.approved_by is not null) then
    raise exception 'TERMS_VERSION_IMMUTABLE' using errcode = '23514';
  end if;
  if new.status is distinct from old.status or new.archived_at is distinct from old.archived_at then
    if not (old.status = 'approved' and new.status = 'archived') then
      raise exception 'TERMS_VERSION_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger terms_versions_guard before update on public.terms_template_versions
  for each row execute function public.terms_versions_guard();

-- ---------------------------------------------------------------------------
-- 4. Helpers (private schema, not callable by signed-in roles).
-- ---------------------------------------------------------------------------
-- True when every {{...}} in the text is exactly one of the five placeholders. Keep the list equal to
-- features/terms/placeholders.ts (tests/unit/terms-seed.test.ts checks it).
create or replace function private.terms_text_valid(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select position('{{' in rest) = 0 and position('}}' in rest) = 0
  from (
    select regexp_replace(coalesce(p_text, ''), '\{\{(monthly_fee|monthly_credits|initiative_limit|valid_days|payment_days)\}\}', '', 'g') as rest
  ) as s
$$;

-- A member of the organisation, and an owner or admin of it; otherwise the caller learns nothing about the organisation.
create or replace function private.terms_admin(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_org is null or not public.is_member_of(p_org) then
    raise exception 'TERMS_NOT_FOUND' using errcode = '42501';
  end if;
  if not public.has_role(p_org, array['owner', 'admin']) then
    raise exception 'TERMS_FORBIDDEN' using errcode = '42501';
  end if;
end $$;

revoke all on function private.terms_text_valid(text) from public, anon, authenticated;
revoke all on function private.terms_admin(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The functions the app calls.
-- ---------------------------------------------------------------------------
create or replace function public.create_terms_template(p_org uuid, p_target_kind text, p_target_key text, p_applies_to text, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_target_key, '')), '');
  v_title text := btrim(coalesce(p_title, ''));
begin
  perform private.terms_admin(p_org);
  if coalesce(p_target_kind, '') not in ('company', 'retainer', 'project', 'support')
     or coalesce(p_applies_to, '') not in ('quote', 'invoice', 'both')
     or (p_target_kind = 'company') <> (v_key is null)
     or (v_key is not null and v_key !~ '^[a-z0-9_]{1,60}$')
     or char_length(v_title) not between 1 and 200 then
    raise exception 'TERMS_TARGET_INVALID' using errcode = '22023';
  end if;
  insert into public.terms_templates (organization_id, target_kind, target_key, applies_to, title)
  values (p_org, p_target_kind, v_key, p_applies_to, v_title)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'TERMS_TEMPLATE_EXISTS' using errcode = '23505';
end $$;

create or replace function public.save_terms_draft(p_template uuid, p_body text, p_inclusions text, p_effective_from date, p_change_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
  v_next integer;
  v_body text := replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_inc text := replace(replace(coalesce(p_inclusions, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_note text := nullif(btrim(coalesce(p_change_note, '')), '');
begin
  select t.organization_id into v_org from public.terms_templates t where t.id = p_template;
  perform private.terms_admin(v_org);
  if char_length(v_body) > 20000 or char_length(v_inc) > 10000 or char_length(coalesce(v_note, '')) > 500 then
    raise exception 'TERMS_TOO_LONG' using errcode = '22001';
  end if;
  -- Serialise version numbering for this template.
  perform 1 from public.terms_templates t where t.id = p_template for update;
  select v.id into v_id from public.terms_template_versions v where v.template_id = p_template and v.status = 'draft';
  if v_id is not null then
    update public.terms_template_versions
       set body = v_body, inclusions = v_inc, effective_from = p_effective_from, change_note = v_note
     where id = v_id;
  else
    select coalesce(max(v.version), 0) + 1 into v_next from public.terms_template_versions v where v.template_id = p_template;
    insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, created_by)
    values (v_org, p_template, v_next, 'draft', v_body, v_inc, p_effective_from, v_note, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.discard_terms_draft(p_template uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_deleted integer;
begin
  select t.organization_id into v_org from public.terms_templates t where t.id = p_template;
  perform private.terms_admin(v_org);
  delete from public.terms_template_versions v where v.template_id = p_template and v.status = 'draft';
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'TERMS_NOT_DRAFT' using errcode = '23514';
  end if;
end $$;

create or replace function public.approve_terms_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.terms_template_versions%rowtype;
begin
  select * into v_row from public.terms_template_versions v where v.id = p_version;
  perform private.terms_admin(v_row.organization_id);
  select * into v_row from public.terms_template_versions v where v.id = p_version for update;
  if v_row.status <> 'draft' then
    raise exception 'TERMS_NOT_DRAFT' using errcode = '23514';
  end if;
  if btrim(v_row.body) = '' then
    raise exception 'TERMS_EMPTY' using errcode = '23514';
  end if;
  if v_row.effective_from is null then
    raise exception 'TERMS_EFFECTIVE_REQUIRED' using errcode = '23514';
  end if;
  if not private.terms_text_valid(v_row.body) or not private.terms_text_valid(v_row.inclusions) then
    raise exception 'TERMS_PLACEHOLDER_UNKNOWN' using errcode = '23514';
  end if;
  update public.terms_template_versions
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_version;
end $$;

create or replace function public.archive_terms_version(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.terms_template_versions%rowtype;
begin
  select * into v_row from public.terms_template_versions v where v.id = p_version;
  perform private.terms_admin(v_row.organization_id);
  select * into v_row from public.terms_template_versions v where v.id = p_version for update;
  if v_row.status <> 'approved' then
    raise exception 'TERMS_NOT_APPROVED' using errcode = '23514';
  end if;
  update public.terms_template_versions set status = 'archived', archived_at = now() where id = p_version;
end $$;

create or replace function public.restore_terms_version(p_version uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.terms_template_versions%rowtype;
  v_next integer;
  v_id uuid;
begin
  select * into v_row from public.terms_template_versions v where v.id = p_version;
  perform private.terms_admin(v_row.organization_id);
  if v_row.status not in ('approved', 'archived') then
    raise exception 'TERMS_NOT_APPROVED' using errcode = '23514';
  end if;
  perform 1 from public.terms_templates t where t.id = v_row.template_id for update;
  if exists (select 1 from public.terms_template_versions v where v.template_id = v_row.template_id and v.status = 'draft') then
    raise exception 'TERMS_DRAFT_EXISTS' using errcode = '23514';
  end if;
  select coalesce(max(v.version), 0) + 1 into v_next from public.terms_template_versions v where v.template_id = v_row.template_id;
  insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, created_by)
  values (v_row.organization_id, v_row.template_id, v_next, 'draft', v_row.body, v_row.inclusions, null, 'Restored from version ' || v_row.version, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_terms_template(uuid, text, text, text, text) from public, anon;
revoke all on function public.save_terms_draft(uuid, text, text, date, text) from public, anon;
revoke all on function public.discard_terms_draft(uuid) from public, anon;
revoke all on function public.approve_terms_version(uuid) from public, anon;
revoke all on function public.archive_terms_version(uuid) from public, anon;
revoke all on function public.restore_terms_version(uuid) from public, anon;
grant execute on function public.create_terms_template(uuid, text, text, text, text) to authenticated;
grant execute on function public.save_terms_draft(uuid, text, text, date, text) to authenticated;
grant execute on function public.discard_terms_draft(uuid) to authenticated;
grant execute on function public.approve_terms_version(uuid) to authenticated;
grant execute on function public.archive_terms_version(uuid) to authenticated;
grant execute on function public.restore_terms_version(uuid) to authenticated;
```

Notes for the implementer: in `approve_terms_version`, `archive_terms_version` and `restore_terms_version`, when the version id does not exist `v_row.organization_id` is null and `private.terms_admin(null)` raises `TERMS_NOT_FOUND`; keep that order (look the row up first, then check the caller).

- [ ] **Step 2: Extend the cleanup sweep in `tests/integration/rls/helpers.ts`**

In the `.in('resource', [...])` list inside `cleanup`, add after `'project_dependencies',`:

```ts
        'terms_templates',
        'terms_template_versions',
```

- [ ] **Step 3: Write the database test `tests/integration/rls/terms-templates.test.ts`**

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let adminUser: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
let adminClient: SupabaseClient
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

let counter = 0
/** A fresh support template in orgA, created by an admin. */
async function newTemplate(client: SupabaseClient = adminClient, org: string = orgA): Promise<string> {
  counter += 1
  return must(await client.rpc('create_terms_template', { p_org: org, p_target_kind: 'support', p_target_key: `terms_test_${counter}`, p_applies_to: 'quote', p_title: `Terms test ${counter}` })) as string
}
const save = (template: string, body: string, effective: string | null = '2026-10-12', client: SupabaseClient = adminClient, inclusions = '') =>
  client.rpc('save_terms_draft', { p_template: template, p_body: body, p_inclusions: inclusions, p_effective_from: effective, p_change_note: null })
async function approved(template: string, body = 'Clause one.\nClause two.'): Promise<string> {
  const id = must(await save(template, body)) as string
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: id })).error, null)
  return id
}
const versionsOf = async (template: string, client: SupabaseClient = admin) =>
  must(await client.from('terms_template_versions').select('*').eq('template_id', template).order('version')) as Record<string, any>[]

before(async () => {
  orgA = await createFixtureOrg('terms-a')
  orgB = await createFixtureOrg('terms-b')
  owner = await createFixtureUser(orgA, 'owner')
  adminUser = await createFixtureUser(orgA, 'admin')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, adminUser?.id, member?.id, outsider?.id].filter(Boolean))
})

test('an owner and an admin can create a template; a member and an outsider cannot', async () => {
  await newTemplate(ownerClient)
  await newTemplate(adminClient)
  const asMember = await memberClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'member_try', p_applies_to: 'quote', p_title: 'No' })
  refused(asMember.error, 'TERMS_FORBIDDEN')
  const asOutsider = await outsiderClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'outsider_try', p_applies_to: 'quote', p_title: 'No' })
  refused(asOutsider.error, 'TERMS_NOT_FOUND')
})

test('a template is unique per target and document type, and its target must be well formed', async () => {
  const key = `dup_${Date.now()}`
  assert.equal((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'retainer', p_target_key: key, p_applies_to: 'quote', p_title: 'First' })).error, null)
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'retainer', p_target_key: key, p_applies_to: 'quote', p_title: 'Again' })).error, 'TERMS_TEMPLATE_EXISTS')
  assert.equal((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'retainer', p_target_key: key, p_applies_to: 'invoice', p_title: 'Other type' })).error, null, 'the same target for another document type is a different template')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'company', p_target_key: 'x', p_applies_to: 'quote', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: null, p_applies_to: 'quote', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'Has Spaces', p_applies_to: 'quote', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'ok_key', p_applies_to: 'nope', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'ok_key2', p_applies_to: 'quote', p_title: '   ' })).error, 'TERMS_TARGET_INVALID')
})

test('saving a draft creates version 1, then updates the same draft; Windows line endings become plain ones', async () => {
  const template = await newTemplate()
  const first = must(await save(template, 'One\r\nTwo\r\n')) as string
  const second = must(await save(template, 'One\r\nTwo\r\nThree', '2026-11-01', adminClient, 'Lead\r\nRoadmap')) as string
  assert.equal(second, first, 'the draft is updated in place')
  const rows = await versionsOf(template)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].version, 1)
  assert.equal(rows[0].status, 'draft')
  assert.equal(rows[0].body, 'One\nTwo\nThree')
  assert.equal(rows[0].inclusions, 'Lead\nRoadmap')
  assert.equal(rows[0].effective_from, '2026-11-01')
  assert.equal(rows[0].created_by, adminUser.id)
})

test('a member cannot read a draft but an admin can; a member cannot write one', async () => {
  const template = await newTemplate()
  must(await save(template, 'Draft text'))
  assert.equal((await versionsOf(template, memberClient)).length, 0, 'drafts are hidden from members')
  assert.equal((await versionsOf(template, adminClient)).length, 1)
  refused((await save(template, 'Member edit', '2026-10-12', memberClient)).error, 'TERMS_FORBIDDEN')
  const templates = must(await memberClient.from('terms_templates').select('id').eq('id', template)) as unknown[]
  assert.equal(templates.length, 1, 'members can see that the template exists')
})

test('approval needs wording, an effective date and valid placeholders, and records who approved and when', async () => {
  const template = await newTemplate()
  const id = must(await save(template, '', null)) as string
  refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_EMPTY')
  must(await save(template, 'Some terms', null))
  refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_EFFECTIVE_REQUIRED')
  for (const bad of ['{{unknown_name}}', '{{ monthly_fee }}', '{{Monthly_Fee}}', 'half open {{ here']) {
    must(await save(template, bad, '2026-10-12'))
    refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_PLACEHOLDER_UNKNOWN')
  }
  must(await save(template, 'Good {{monthly_fee}} and {{payment_days}}', '2026-10-12', adminClient, 'Fine {{valid_days}}'))
  refused((await memberClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_FORBIDDEN')
  refused((await outsiderClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_NOT_FOUND')
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: id })).error, null)
  const row = (await versionsOf(template))[0]
  assert.equal(row.status, 'approved')
  assert.equal(row.approved_by, adminUser.id)
  assert.ok(row.approved_at)
  refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_NOT_DRAFT')
  assert.equal((await versionsOf(template, memberClient)).length, 1, 'members see the approved version')
})

test('an approved version cannot be edited or deleted by a signed-in role, and the service role can only archive it', async () => {
  const template = await newTemplate()
  const id = await approved(template)
  for (const client of [adminClient, ownerClient, memberClient]) {
    const edit = await client.from('terms_template_versions').update({ body: 'changed' }).eq('id', id)
    assert.ok(edit.error, 'no direct update privilege')
    const del = await client.from('terms_template_versions').delete().eq('id', id)
    assert.ok(del.error, 'no direct delete privilege')
  }
  refused((await admin.from('terms_template_versions').update({ body: 'changed' }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  refused((await admin.from('terms_template_versions').update({ effective_from: '2030-01-01' }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  refused((await admin.from('terms_template_versions').update({ approved_by: adminUser.id }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  assert.equal((await admin.from('terms_template_versions').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id)).error, null)
  refused((await admin.from('terms_template_versions').update({ status: 'approved', archived_at: null }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  refused((await admin.from('terms_template_versions').update({ body: 'changed again' }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  assert.equal((await versionsOf(template))[0].body, 'Clause one.\nClause two.')
})

test('version numbers rise, a new draft sits beside the approved version, and a draft can be discarded', async () => {
  const template = await newTemplate()
  await approved(template)
  const draft = must(await save(template, 'Second wording')) as string
  const rows = await versionsOf(template)
  assert.deepEqual(rows.map((row) => [row.version, row.status]), [[1, 'approved'], [2, 'draft']])
  assert.equal((await adminClient.rpc('discard_terms_draft', { p_template: template })).error, null)
  assert.equal((await versionsOf(template)).length, 1)
  refused((await adminClient.rpc('discard_terms_draft', { p_template: template })).error, 'TERMS_NOT_DRAFT')
  refused((await memberClient.rpc('discard_terms_draft', { p_template: template })).error, 'TERMS_FORBIDDEN')
  assert.ok(draft)
})

test('restore copies an approved or archived version into a new draft with no effective date, and refuses when a draft exists', async () => {
  const template = await newTemplate()
  const first = await approved(template, 'Original wording')
  const second = must(await save(template, 'Newer wording')) as string
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: second })).error, null)
  must(await save(template, 'A draft in progress'))
  refused((await adminClient.rpc('restore_terms_version', { p_version: first })).error, 'TERMS_DRAFT_EXISTS')
  assert.equal((await adminClient.rpc('discard_terms_draft', { p_template: template })).error, null)
  const restored = must(await adminClient.rpc('restore_terms_version', { p_version: first })) as string
  const rows = await versionsOf(template)
  const draft = rows.find((row) => row.id === restored)!
  assert.equal(draft.version, 3)
  assert.equal(draft.status, 'draft')
  assert.equal(draft.body, 'Original wording')
  assert.equal(draft.effective_from, null)
  assert.equal(draft.change_note, 'Restored from version 1')
  assert.equal(rows.find((row) => row.id === first)!.status, 'approved', 'the original is untouched')
  refused((await memberClient.rpc('restore_terms_version', { p_version: first })).error, 'TERMS_FORBIDDEN')
  refused((await adminClient.rpc('restore_terms_version', { p_version: restored })).error, 'TERMS_NOT_APPROVED')
})

test('archive needs an approved version and an owner or admin; members still see an archived version', async () => {
  const template = await newTemplate()
  const id = await approved(template)
  refused((await memberClient.rpc('archive_terms_version', { p_version: id })).error, 'TERMS_FORBIDDEN')
  assert.equal((await ownerClient.rpc('archive_terms_version', { p_version: id })).error, null)
  refused((await adminClient.rpc('archive_terms_version', { p_version: id })).error, 'TERMS_NOT_APPROVED')
  const seen = await versionsOf(template, memberClient)
  assert.deepEqual(seen.map((row) => row.status), ['archived'])
  assert.ok(seen[0].archived_at)
  const draft = must(await save(template, 'Draft again')) as string
  refused((await adminClient.rpc('archive_terms_version', { p_version: draft })).error, 'TERMS_NOT_APPROVED')
})

test('a template in another organisation is invisible and its functions refuse', async () => {
  const template = await newTemplate()
  const id = await approved(template)
  assert.equal((must(await outsiderClient.from('terms_templates').select('id').eq('id', template)) as unknown[]).length, 0)
  assert.equal((must(await outsiderClient.from('terms_template_versions').select('id').eq('id', id)) as unknown[]).length, 0)
  refused((await save(template, 'Hack', '2026-10-12', outsiderClient)).error, 'TERMS_NOT_FOUND')
  refused((await outsiderClient.rpc('archive_terms_version', { p_version: id })).error, 'TERMS_NOT_FOUND')
  refused((await outsiderClient.rpc('restore_terms_version', { p_version: id })).error, 'TERMS_NOT_FOUND')
  refused((await outsiderClient.rpc('discard_terms_draft', { p_template: template })).error, 'TERMS_NOT_FOUND')
  refused((await adminClient.rpc('approve_terms_version', { p_version: '00000000-0000-4000-8000-0000000000aa' })).error, 'TERMS_NOT_FOUND')
})

test('the size limits are enforced', async () => {
  const template = await newTemplate()
  refused((await save(template, 'x'.repeat(20001))).error, 'TERMS_TOO_LONG')
  refused((await save(template, 'ok', '2026-10-12', adminClient, 'y'.repeat(10001))).error, 'TERMS_TOO_LONG')
  const note = await adminClient.rpc('save_terms_draft', { p_template: template, p_body: 'ok', p_inclusions: '', p_effective_from: '2026-10-12', p_change_note: 'n'.repeat(501) })
  refused(note.error, 'TERMS_TOO_LONG')
  assert.equal((await save(template, 'x'.repeat(20000))).error, null, '20,000 characters is allowed')
})
```

- [ ] **Step 4: Unit sanity (implementer)** — typecheck only: `npx tsc --noEmit -p .` (the database test cannot run until the controller applies the migration).

- [ ] **Step 5: Commit the files**

```bash
git add supabase/migrations/20261012160000_commercial_terms.sql tests/integration/rls/terms-templates.test.ts tests/integration/rls/helpers.ts
git commit -m "feat(terms): templates and versions tables, immutability rule and the write functions"
```

- [ ] **Step 6: CONTROLLER ONLY: apply and test**

1. Apply `20261012160000_commercial_terms.sql` to project `nwdzpjzllhhqwawmsxjd` with `apply_migration` (name `commercial_terms`).
2. Run: `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/terms-templates.test.ts` — expected: all tests pass.
3. Verify production is clean: no organisation named `RLS terms-%`, no `auth.users` with `rls-%@unison.test`, and no new `audit_events` with `organization_id is null` created since the run started (the existing platform rows are older). Delete any orphaned audit rows by hand.

---

### Task 5: Seed function and the HIMARK seed (migration, applied by the controller) with tests

**Files:**
- Create: `supabase/migrations/20261012161000_commercial_terms_seed.sql` (generated, see step 2)
- Create: `tests/integration/rls/terms-seed.test.ts`
- Modify: `tests/unit/terms-seed.test.ts` (append the migration-match tests)

**Interfaces:**
- Consumes: Task 4 tables; `SEED_TEMPLATES`, `SEED_EFFECTIVE_FROM`, `COMPANY_SEED` (Task 3); `TERMS_PLACEHOLDERS` (Task 1).
- Produces: `public.seed_commercial_terms(p_org uuid) returns void` (service role only). For an organisation it creates the 2 company templates and the 20 offering templates, and approved version 1 (effective 2026-10-12) for the 10 offering templates that have wording and for each company template whose existing default text in `organization_settings` is not empty. Idempotent.

- [ ] **Step 1: Append the failing migration-match tests to `tests/unit/terms-seed.test.ts`**

Add at the top of the file with the other imports:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TERMS_PLACEHOLDERS } from '../../features/terms/placeholders.ts'
```

and append:

```ts
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

test('the placeholder list in the database function equals the one in TypeScript', () => {
  const sql = read('supabase', 'migrations', '20261012160000_commercial_terms.sql')
  assert.ok(sql.includes(`(${TERMS_PLACEHOLDERS.join('|')})`))
})

test('the seed migration carries exactly the wording in features/terms/seed-wording.ts', () => {
  const sql = read('supabase', 'migrations', '20261012161000_commercial_terms_seed.sql')
  const match = sql.match(/\$terms_seed\$(\[[\s\S]*?\])\$terms_seed\$/)
  assert.ok(match, 'the seed JSON is present')
  const seeded = JSON.parse(match[1]) as Array<Record<string, string>>
  assert.deepEqual(
    seeded,
    SEED_TEMPLATES.map((item) => ({ target_kind: item.targetKind, target_key: item.targetKey, applies_to: item.appliesTo, title: item.title, body: item.body, inclusions: item.inclusions })),
  )
  assert.ok(sql.includes(`date '${SEED_EFFECTIVE_FROM}'`))
  for (const company of COMPANY_SEED) assert.ok(sql.includes(company.title))
  assert.match(sql, /grant execute on function public\.seed_commercial_terms\(uuid\) to service_role/)
  assert.match(sql, /revoke all on function public\.seed_commercial_terms\(uuid\) from public, anon, authenticated/)
  assert.match(sql, /00000000-0000-4000-8000-000000000001/, 'the HIMARK organisation is seeded')
})
```

Run: `node --test --experimental-strip-types tests/unit/terms-seed.test.ts` — the two new tests FAIL (the seed migration does not exist yet); the first part of the file still passes.

- [ ] **Step 2: Generate and write the seed migration**

Write a throwaway script in the scratchpad (not in the repo) `gen-terms-seed.mjs`:

```js
import { SEED_TEMPLATES, SEED_EFFECTIVE_FROM, COMPANY_SEED } from 'file:///C:/Users/Neo/OneDrive/Documents/HIMARK%20SGC/projects/apps/unison/features/terms/seed-wording.ts'

const json = JSON.stringify(
  SEED_TEMPLATES.map((item) => ({ target_kind: item.targetKind, target_key: item.targetKey, applies_to: item.appliesTo, title: item.title, body: item.body, inclusions: item.inclusions })),
  null, 2,
)
if (json.includes('$terms_seed$')) throw new Error('the seed text contains the dollar-quote tag')
process.stdout.write(json)
```

Run it with `node --experimental-strip-types <script>` and paste the output between `$terms_seed$` and `$terms_seed$` in the migration below (the unit test compares the parsed JSON to `SEED_TEMPLATES`, so it must be pasted exactly, with no edits):

```sql
-- Commercial terms: the seed (build 1 of the terms engine). Append-only.
-- public.seed_commercial_terms(org) loads, for one organisation:
--   * the two company templates (quotes, invoices). Their approved version 1 is copied from the organisation's existing
--     default terms (organization_settings.default_quote_terms / default_payment_terms) when those are not empty;
--   * a template for each retainer tier, project category and support service, with approved version 1 for the ones the
--     user's wording covers (effective 2026-10-12). Support services get a template and no version.
-- Idempotent: it never touches a template that already has a version. Service role only.
-- The JSON below is generated from features/terms/seed-wording.ts; tests/unit/terms-seed.test.ts keeps the two equal.

create or replace function public.seed_commercial_terms(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_seed constant jsonb := $terms_seed$<PASTE THE GENERATED JSON HERE>$terms_seed$::jsonb;
begin
  insert into public.terms_templates (organization_id, target_kind, target_key, applies_to, title)
  values
    (p_org, 'company', null, 'quote', 'Company terms: quotes'),
    (p_org, 'company', null, 'invoice', 'Company terms: invoices')
  on conflict do nothing;

  insert into public.terms_templates (organization_id, target_kind, target_key, applies_to, title)
  select p_org, s.target_kind, s.target_key, s.applies_to, s.title
  from jsonb_to_recordset(v_seed) as s(target_kind text, target_key text, applies_to text, title text, body text, inclusions text)
  on conflict do nothing;

  -- Approved version 1 for the offering templates that have wording and no version yet.
  insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, approved_at)
  select p_org, t.id, 1, 'approved', s.body, s.inclusions, date '2026-10-12', 'Loaded from the approved HIMARK wording.', now()
  from jsonb_to_recordset(v_seed) as s(target_kind text, target_key text, applies_to text, title text, body text, inclusions text)
  join public.terms_templates t
    on t.organization_id = p_org and t.target_kind = s.target_kind and t.target_key = s.target_key and t.applies_to = s.applies_to
  where btrim(s.body) <> ''
    and not exists (select 1 from public.terms_template_versions v where v.template_id = t.id);

  -- Approved version 1 for each company template from the organisation's existing default terms, when there are any.
  insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, approved_at)
  select p_org, t.id, 1, 'approved',
         replace(replace(case t.applies_to when 'quote' then s.default_quote_terms else s.default_payment_terms end, E'\r\n', E'\n'), E'\r', E'\n'),
         '', date '2026-10-12', 'Copied from the default terms in the company settings.', now()
  from public.terms_templates t
  join public.organization_settings s on s.organization_id = t.organization_id
  where t.organization_id = p_org and t.target_kind = 'company' and t.applies_to in ('quote', 'invoice')
    and btrim(coalesce(case t.applies_to when 'quote' then s.default_quote_terms else s.default_payment_terms end, '')) <> ''
    and not exists (select 1 from public.terms_template_versions v where v.template_id = t.id);
end $$;

revoke all on function public.seed_commercial_terms(uuid) from public, anon, authenticated;
grant execute on function public.seed_commercial_terms(uuid) to service_role;

-- HIMARK only: other organisations and test fixtures are seeded by calling the function with the service role.
select public.seed_commercial_terms(o.id) from public.organizations o where o.id = '00000000-0000-4000-8000-000000000001';
```

Check before finishing: the unit test in step 1 passes, and the company default text, if it contains `{{`, is not a concern for the seed (company templates are not placeholder-checked by the seed; an admin sees it in the editor and approval would flag it on the next version).

- [ ] **Step 3: Run the unit tests**

Run: `node --test --experimental-strip-types tests/unit/terms-seed.test.ts` — expect all 10 tests PASS.

- [ ] **Step 4: Write the database test `tests/integration/rls/terms-seed.test.ts`**

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { SEED_TEMPLATES } from '../../../features/terms/seed-wording.ts'
import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let org: string
let adminUser: U
let member: U
let adminClient: SupabaseClient
let memberClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}

before(async () => {
  org = await createFixtureOrg('terms-seed')
  adminUser = await createFixtureUser(org, 'admin')
  member = await createFixtureUser(org, 'member')
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  memberClient = await signedInClient(member.email, member.password)
  must(await admin.from('organization_settings').insert({
    organization_id: org, default_quote_terms: 'Quote clause A.\r\nQuote clause B.', default_payment_terms: '   ',
  }).select('id').single())
})

after(async () => {
  await cleanup([org].filter(Boolean), [adminUser?.id, member?.id].filter(Boolean))
})

const templates = async () => must(await admin.from('terms_templates').select('*').eq('organization_id', org)) as Record<string, any>[]
const versions = async () => must(await admin.from('terms_template_versions').select('*').eq('organization_id', org)) as Record<string, any>[]

test('only the service role can run the seed', async () => {
  for (const client of [adminClient, memberClient]) {
    const result = await client.rpc('seed_commercial_terms', { p_org: org })
    assert.ok(result.error, 'a signed-in role cannot call it')
  }
  assert.equal((await templates()).length, 0, 'nothing was created')
})

test('the seed loads the company templates, the offering templates and approved wording, and is safe to run twice', async () => {
  assert.equal((await admin.rpc('seed_commercial_terms', { p_org: org })).error, null)
  assert.equal((await admin.rpc('seed_commercial_terms', { p_org: org })).error, null, 'running it again changes nothing')

  const rows = await templates()
  assert.equal(rows.length, 2 + SEED_TEMPLATES.length)
  assert.equal(rows.filter((row) => row.target_kind === 'company').length, 2)
  assert.equal(rows.filter((row) => row.target_kind === 'retainer').length, 4)
  assert.equal(rows.filter((row) => row.target_kind === 'project').length, 6)
  assert.equal(rows.filter((row) => row.target_kind === 'support').length, 10)

  const all = await versions()
  // 4 retainers + 6 projects + the company quote terms (the payment terms were blank, so no invoice version).
  assert.equal(all.length, 11)
  assert.ok(all.every((row) => row.status === 'approved' && row.version === 1 && row.effective_from === '2026-10-12' && row.approved_at))

  const byId = new Map(rows.map((row) => [row.id, row]))
  const companyQuote = all.find((row) => byId.get(row.template_id)?.target_kind === 'company')!
  assert.equal(byId.get(companyQuote.template_id)!.applies_to, 'quote')
  assert.equal(companyQuote.body, 'Quote clause A.\nQuote clause B.', 'copied from the settings with plain line endings')

  const signature = all.find((row) => byId.get(row.template_id)?.target_key === 'signature')!
  assert.match(signature.body, /\{\{monthly_fee\}\}/, 'the wording keeps its placeholders')
  assert.match(signature.inclusions, /Dedicated HIMARK Engagement Lead/)
  const support = rows.filter((row) => row.target_kind === 'support')
  assert.ok(support.every((row) => !all.some((version) => version.template_id === row.id)), 'support services have no version yet')
})

test('after the seed, a member reads the approved wording and an admin sees the empty support templates', async () => {
  const seen = must(await memberClient.from('terms_template_versions').select('id,status').eq('organization_id', org)) as Array<{ status: string }>
  assert.equal(seen.length, 11)
  assert.ok(seen.every((row) => row.status === 'approved'))
  const adminSees = must(await adminClient.from('terms_templates').select('id').eq('organization_id', org)) as unknown[]
  assert.equal(adminSees.length, 2 + SEED_TEMPLATES.length)
})
```

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit -p .
git add supabase/migrations/20261012161000_commercial_terms_seed.sql tests/integration/rls/terms-seed.test.ts tests/unit/terms-seed.test.ts
git commit -m "feat(terms): the seed function and the HIMARK wording"
```

- [ ] **Step 6: CONTROLLER ONLY: apply and test**

1. Apply `20261012161000_commercial_terms_seed.sql` with `apply_migration` (name `commercial_terms_seed`).
2. Run `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/terms-seed.test.ts` and `tests/integration/rls/terms-templates.test.ts` again; both must pass.
3. Verify in production: the HIMARK organisation has 22 templates and 10 approved versions plus company versions only where its default terms were not empty. Run `select target_kind, count(*) from public.terms_templates where organization_id = '00000000-0000-4000-8000-000000000001' group by 1` and `select status, count(*) from public.terms_template_versions where organization_id = '00000000-0000-4000-8000-000000000001' group by 1`.
4. Verify cleanup as in Task 4 step 6.

---

### Task 6: Server layer: messages, queries and actions

**Files:**
- Modify: `features/documents/errors.ts` (append the 12 messages, step 1)
- Create: `features/terms/grouping.ts`, `features/terms/queries/list-terms-templates.ts`, `features/terms/queries/get-terms-template.ts`, `features/terms/queries/load-preview.ts`, `features/terms/actions/terms.ts`
- Test: `tests/unit/terms-grouping.test.ts`, `tests/unit/terms-ui.test.ts` (this task adds the server-layer source checks; Task 7 appends the UI checks)

**Interfaces:**
- Consumes: `documentContext()` (`features/documents/server-context.ts`: `{ organization, user, role, db }`), `failureState`, `ActionState`, `isUuid` from `@/lib/utils`, `isValidIsoDate` from `@/features/delivery/schemas/date`, `formatCurrency` from `@/lib/utils/format-money`; Tasks 1–3 modules.
- Produces:
  - `grouping.ts`: `type TemplateSummary`, `groupTemplates(rows: TemplateSummary[]): Array<{ label: string; rows: TemplateSummary[] }>`, `templateStatus(row: TemplateSummary): { kind: 'current' | 'upcoming' | 'none'; version?: number; effectiveFrom?: string }`
  - `listTermsTemplates(): Promise<TemplateSummary[]>`
  - `getTermsTemplate(templateId: string, requestedVersionId?: string): Promise<TermsTemplateDetail | null>` where `TermsTemplateDetail = { template: TemplateInfo; versions: VersionDetail[]; current: VersionDetail | null; draft: VersionDetail | null; selected: VersionDetail | null; preview: ResolvedTerms | null; names: Record<string, string> }`
  - `loadTermsPreview(template: TemplateInfo, version: { id: string; version: number; body: string; inclusions: string }): Promise<ResolvedTerms>`
  - Actions (all `'use server'`, in `features/terms/actions/terms.ts`): `createTermsTemplateAction(_previous, form)`, `saveTermsDraftAction(templateId, _previous, form)` (form field `intent` is `save` or `approve`), `discardTermsDraftAction(templateId, _previous, _form)`, `archiveTermsVersionAction(versionId, _previous, _form)`, `restoreTermsVersionAction(versionId, _previous, _form)`.

- [ ] **Step 1: Add the plain messages to `features/documents/errors.ts`**

Append these rows to the `MESSAGES` array, after the `BILLING_DRAFT_ONLY` row:

```ts
  ['TERMS_TEMPLATE_EXISTS', 'There is already a template for that target and document type.'],
  ['TERMS_TARGET_INVALID', 'Choose what the template is for. A key uses lowercase letters, numbers and underscores only, and the title cannot be empty.'],
  ['TERMS_NOT_FOUND', 'That terms template was not found.'],
  ['TERMS_NOT_DRAFT', 'Only a draft can be approved or discarded, and there is no draft here.'],
  ['TERMS_NOT_APPROVED', 'That version cannot be archived or restored in its current state.'],
  ['TERMS_DRAFT_EXISTS', 'This template already has a draft. Approve or discard it first.'],
  ['TERMS_EMPTY', 'Write the terms before approving them.'],
  ['TERMS_EFFECTIVE_REQUIRED', 'Choose the date the terms take effect before approving.'],
  ['TERMS_PLACEHOLDER_UNKNOWN', 'The text contains a placeholder UNISON does not know. Use only {{monthly_fee}}, {{monthly_credits}}, {{initiative_limit}}, {{valid_days}} and {{payment_days}}, typed exactly like that, with no spaces.'],
  ['TERMS_TOO_LONG', 'The text is too long (terms 20,000 characters at most, inclusions 10,000, change note 500).'],
  ['TERMS_FORBIDDEN', 'Only an owner or admin can change commercial terms.'],
  ['TERMS_VERSION_IMMUTABLE', 'An approved version cannot be edited. Write a new version instead.'],
```

Run the existing tests that read this map to make sure nothing else asserts a fixed count: `node --test --experimental-strip-types tests/unit/documents-vocabulary.test.ts tests/unit/documents-ui.test.ts`. If a test fails because it lists all tokens against migrations, extend that test to include these twelve (they appear in `20261012160000_commercial_terms.sql`).

- [ ] **Step 2: Write the failing grouping test `tests/unit/terms-grouping.test.ts`**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { groupTemplates, templateStatus, type TemplateSummary } from '../../features/terms/grouping.ts'

const row = (over: Partial<TemplateSummary> & Pick<TemplateSummary, 'targetKind' | 'title'>): TemplateSummary => ({
  id: over.title, targetKey: over.targetKind === 'company' ? null : 'k', appliesTo: 'quote', current: null, upcoming: null, hasDraft: false, ...over,
})

test('templates are grouped Company, Strategic Partnerships, Projects, then the three support groups', () => {
  const groups = groupTemplates([
    row({ targetKind: 'support', targetKey: 'podcast_content', title: 'Podcast Content' }),
    row({ targetKind: 'project', title: 'Digital Presence' }),
    row({ targetKind: 'retainer', title: 'Growth Partner' }),
    row({ targetKind: 'company', title: 'Company terms: quotes' }),
    row({ targetKind: 'support', targetKey: 'website_care', title: 'Website Care' }),
    row({ targetKind: 'support', targetKey: 'digital_presence_management', title: 'Digital Presence Management' }),
  ])
  assert.deepEqual(groups.map((group) => group.label), ['Company', 'Strategic Partnerships', 'Projects', 'Project Care', 'Managed Services', 'Recurring Content'])
  assert.deepEqual(groups.find((group) => group.label === 'Project Care')!.rows.map((entry) => entry.title), ['Website Care'])
})

test('an empty group is left out and an unknown support service goes under Other services', () => {
  const groups = groupTemplates([row({ targetKind: 'support', targetKey: 'brand_new_service', title: 'Brand New' })])
  assert.deepEqual(groups.map((group) => group.label), ['Other services'])
})

test('rows keep their order inside a group, sorted by title', () => {
  const groups = groupTemplates([row({ targetKind: 'project', title: 'B' }), row({ targetKind: 'project', title: 'A' })])
  assert.deepEqual(groups[0].rows.map((entry) => entry.title), ['A', 'B'])
})

test('the status says which version is in force, which is coming, or that there are none', () => {
  assert.deepEqual(templateStatus(row({ targetKind: 'project', title: 'x', current: { version: 2, effectiveFrom: '2026-10-12' } })), { kind: 'current', version: 2, effectiveFrom: '2026-10-12' })
  assert.deepEqual(templateStatus(row({ targetKind: 'project', title: 'x', upcoming: { version: 3, effectiveFrom: '2027-01-01' } })), { kind: 'upcoming', version: 3, effectiveFrom: '2027-01-01' })
  assert.deepEqual(templateStatus(row({ targetKind: 'project', title: 'x' })), { kind: 'none' })
  assert.equal(templateStatus(row({ targetKind: 'project', title: 'x', current: { version: 1, effectiveFrom: '2026-01-01' }, upcoming: { version: 2, effectiveFrom: '2027-01-01' } })).kind, 'current', 'a current version wins over an upcoming one')
})
```

Run: `node --test --experimental-strip-types tests/unit/terms-grouping.test.ts` — FAIL (module missing).

- [ ] **Step 3: Write `features/terms/grouping.ts`**

```ts
// How the template list is grouped and what each row's status badge says. Pure.

export type TemplateSummary = {
  id: string
  targetKind: 'company' | 'retainer' | 'project' | 'support'
  targetKey: string | null
  appliesTo: 'quote' | 'invoice' | 'both'
  title: string
  current: { version: number; effectiveFrom: string } | null
  upcoming: { version: number; effectiveFrom: string } | null
  /** Only owners and admins can see drafts, so this is false for a member whatever exists. */
  hasDraft: boolean
}

const CARE = ['ai_automation_care', 'application_interface_care', 'website_care', 'communication_asset_care']
const MANAGED = ['operations_improvement', 'digital_experience_management', 'digital_presence_management']
const CONTENT = ['podcast_content', 'integrated_podcast_social', 'social_media_content']

function groupLabel(row: TemplateSummary): string {
  if (row.targetKind === 'company') return 'Company'
  if (row.targetKind === 'retainer') return 'Strategic Partnerships'
  if (row.targetKind === 'project') return 'Projects'
  if (row.targetKey && CARE.includes(row.targetKey)) return 'Project Care'
  if (row.targetKey && MANAGED.includes(row.targetKey)) return 'Managed Services'
  if (row.targetKey && CONTENT.includes(row.targetKey)) return 'Recurring Content'
  return 'Other services'
}

const ORDER = ['Company', 'Strategic Partnerships', 'Projects', 'Project Care', 'Managed Services', 'Recurring Content', 'Other services']

export function groupTemplates(rows: TemplateSummary[]): Array<{ label: string; rows: TemplateSummary[] }> {
  return ORDER
    .map((label) => ({ label, rows: rows.filter((row) => groupLabel(row) === label).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter((group) => group.rows.length > 0)
}

export function templateStatus(row: TemplateSummary): { kind: 'current' | 'upcoming' | 'none'; version?: number; effectiveFrom?: string } {
  if (row.current) return { kind: 'current', version: row.current.version, effectiveFrom: row.current.effectiveFrom }
  if (row.upcoming) return { kind: 'upcoming', version: row.upcoming.version, effectiveFrom: row.upcoming.effectiveFrom }
  return { kind: 'none' }
}
```

Run the test — expect 4 PASS.

- [ ] **Step 4: Write `features/terms/queries/list-terms-templates.ts`**

```ts
import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import type { TemplateSummary } from '../grouping'
import { currentVersion, saToday, upcomingVersion, type SelectableVersion } from '../selection'

type VersionRow = SelectableVersion & { templateId: string }

/** Every template of the organisation with the version in force, the one coming next, and whether a draft exists. */
export async function listTermsTemplates(): Promise<TemplateSummary[]> {
  const { organization, db } = await documentContext()
  const [templates, versions] = await Promise.all([
    db.from('terms_templates').select('id,target_kind,target_key,applies_to,title').eq('organization_id', organization.id).order('title'),
    db.from('terms_template_versions').select('template_id,version,status,effective_from').eq('organization_id', organization.id),
  ])
  if (templates.error) throw templates.error
  if (versions.error) throw versions.error

  const today = saToday()
  const byTemplate = new Map<string, VersionRow[]>()
  for (const row of versions.data ?? []) {
    const list = byTemplate.get(row.template_id) ?? []
    list.push({ templateId: row.template_id, version: row.version, status: row.status, effectiveFrom: row.effective_from })
    byTemplate.set(row.template_id, list)
  }

  return (templates.data ?? []).map((row: any): TemplateSummary => {
    const own = byTemplate.get(row.id) ?? []
    const current = currentVersion(own, today)
    const upcoming = upcomingVersion(own, today)
    return {
      id: row.id,
      targetKind: row.target_kind,
      targetKey: row.target_key,
      appliesTo: row.applies_to,
      title: row.title,
      current: current ? { version: current.version, effectiveFrom: current.effectiveFrom as string } : null,
      upcoming: upcoming ? { version: upcoming.version, effectiveFrom: upcoming.effectiveFrom as string } : null,
      hasDraft: own.some((item) => item.status === 'draft'),
    }
  })
}
```

- [ ] **Step 5: Write `features/terms/queries/load-preview.ts`**

```ts
import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import { formatCurrency } from '@/lib/utils/format-money'
import { resolveTerms, type ResolvedLayer, type ResolvedTerms } from '../resolve-terms'
import { appliesToKind, currentVersion, saToday } from '../selection'
import { buildPlaceholderValues } from '../values'

export type TemplateInfo = {
  id: string
  targetKind: 'company' | 'retainer' | 'project' | 'support'
  targetKey: string | null
  appliesTo: 'quote' | 'invoice' | 'both'
  title: string
}

/**
 * The terms as a client would read them: the current company terms (for quotes, or for invoices when the template is for
 * invoices), then the given version of this template, with the placeholders filled from the rate card and the company
 * settings as they are today.
 */
export async function loadTermsPreview(template: TemplateInfo, version: { id: string; version: number; body: string; inclusions: string }): Promise<ResolvedTerms> {
  const { organization, db } = await documentContext()
  const kind = template.appliesTo === 'invoice' ? 'invoice' : 'quote'
  const layers: ResolvedLayer[] = []

  if (template.targetKind !== 'company') {
    const companyTemplates = await db.from('terms_templates').select('id,applies_to').eq('organization_id', organization.id).eq('target_kind', 'company')
    if (companyTemplates.error) throw companyTemplates.error
    const ids = (companyTemplates.data ?? []).filter((row: any) => appliesToKind(row.applies_to, kind)).map((row: any) => row.id as string)
    if (ids.length > 0) {
      const rows = await db.from('terms_template_versions').select('id,template_id,version,status,effective_from,body,inclusions').eq('organization_id', organization.id).in('template_id', ids).eq('status', 'approved')
      if (rows.error) throw rows.error
      const today = saToday()
      for (const id of ids) {
        const own = (rows.data ?? []).filter((row: any) => row.template_id === id).map((row: any) => ({ ...row, effectiveFrom: row.effective_from }))
        const current = currentVersion(own, today) as any
        if (current) layers.push({ layer: 'company', templateId: id, versionId: current.id, version: current.version, body: current.body, inclusions: current.inclusions })
      }
    }
  }

  layers.push({
    layer: template.targetKind === 'company' ? 'company' : 'offering',
    templateId: template.id, versionId: version.id, version: version.version, body: version.body, inclusions: version.inclusions,
  })

  const [rate, settings] = await Promise.all([
    template.targetKind === 'retainer' && template.targetKey
      ? db.from('price_list_items').select('unit_price,credits,initiative_limit').eq('organization_id', organization.id).eq('rate_key', `retainer.${template.targetKey}.monthly`).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('organization_settings').select('default_quote_valid_days,default_payment_days').eq('organization_id', organization.id).maybeSingle(),
  ])
  if (rate.error) throw rate.error
  if (settings.error) throw settings.error

  const values = buildPlaceholderValues({
    retainer: rate.data
      ? { monthlyFee: Number(rate.data.unit_price), credits: rate.data.credits === null ? null : Number(rate.data.credits), initiativeLimit: rate.data.initiative_limit === null ? null : Number(rate.data.initiative_limit) }
      : null,
    validDays: settings.data?.default_quote_valid_days ?? null,
    paymentDays: settings.data?.default_payment_days ?? null,
    formatMoney: (amount) => formatCurrency(amount, 'ZAR'),
  })
  return resolveTerms({ layers, values })
}
```

- [ ] **Step 6: Write `features/terms/queries/get-terms-template.ts`**

```ts
import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import type { ResolvedTerms } from '../resolve-terms'
import { currentVersion, saToday, type VersionStatus } from '../selection'
import { loadTermsPreview, type TemplateInfo } from './load-preview'

export type VersionDetail = {
  id: string
  version: number
  status: VersionStatus
  effectiveFrom: string | null
  body: string
  inclusions: string
  changeNote: string | null
  createdBy: string | null
  createdAt: string
  approvedBy: string | null
  approvedAt: string | null
  archivedAt: string | null
}

export type TermsTemplateDetail = {
  template: TemplateInfo
  versions: VersionDetail[]
  current: VersionDetail | null
  draft: VersionDetail | null
  selected: VersionDetail | null
  preview: ResolvedTerms | null
  /** user id -> team member name, for the author and approver columns. */
  names: Record<string, string>
}

/** One template with its versions (a member never receives a draft: the database hides it), the version to preview and its rendered terms. */
export async function getTermsTemplate(templateId: string, requestedVersionId?: string): Promise<TermsTemplateDetail | null> {
  const { organization, db } = await documentContext()
  const found = await db.from('terms_templates').select('id,target_kind,target_key,applies_to,title').eq('id', templateId).eq('organization_id', organization.id).maybeSingle()
  if (found.error) throw found.error
  if (!found.data) return null
  const template: TemplateInfo = { id: found.data.id, targetKind: found.data.target_kind, targetKey: found.data.target_key, appliesTo: found.data.applies_to, title: found.data.title }

  const rows = await db.from('terms_template_versions').select('*').eq('template_id', templateId).eq('organization_id', organization.id).order('version', { ascending: false })
  if (rows.error) throw rows.error
  const versions: VersionDetail[] = (rows.data ?? []).map((row: any) => ({
    id: row.id, version: row.version, status: row.status, effectiveFrom: row.effective_from, body: row.body, inclusions: row.inclusions,
    changeNote: row.change_note, createdBy: row.created_by, createdAt: row.created_at, approvedBy: row.approved_by, approvedAt: row.approved_at, archivedAt: row.archived_at,
  }))

  const current = currentVersion(versions, saToday())
  const draft = versions.find((item) => item.status === 'draft') ?? null
  const selected = versions.find((item) => item.id === requestedVersionId) ?? draft ?? current ?? versions[0] ?? null

  const userIds = [...new Set(versions.flatMap((item) => [item.createdBy, item.approvedBy]).filter((id): id is string => Boolean(id)))]
  const names: Record<string, string> = {}
  if (userIds.length > 0) {
    const members = await db.from('team_members').select('user_id,full_name').eq('organization_id', organization.id).in('user_id', userIds)
    if (members.error) throw members.error
    for (const member of members.data ?? []) names[member.user_id] = member.full_name
  }

  const preview = selected ? await loadTermsPreview(template, selected) : null
  return { template, versions, current, draft, selected, preview, names }
}
```

- [ ] **Step 7: Write `features/terms/actions/terms.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { failureState } from '@/features/documents/action-failure'
import { documentContext } from '@/features/documents/server-context'
import type { ActionState } from '@/features/documents/types'
import { isValidIsoDate } from '@/features/delivery/schemas/date'
import { isUuid } from '@/lib/utils'

const NOT_FOUND = 'That terms template was not found.'

function revalidateTerms() {
  revalidatePath('/settings/terms')
  revalidatePath('/(unison)/settings/terms/[templateId]', 'page')
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '')

export async function createTermsTemplateAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const kind = text(form, 'targetKind').trim()
  if (!['retainer', 'project', 'support'].includes(kind)) return { error: 'Choose what the template is for.' }
  const appliesTo = text(form, 'appliesTo').trim()
  if (!['quote', 'invoice', 'both'].includes(appliesTo)) return { error: 'Choose whether it is for quotes, invoices or both.' }
  const { organization, db } = await documentContext()
  const created = await db.rpc('create_terms_template', {
    p_org: organization.id, p_target_kind: kind, p_target_key: text(form, 'targetKey').trim(), p_applies_to: appliesTo, p_title: text(form, 'title'),
  })
  if (created.error || typeof created.data !== 'string') return failureState(created.error, 'The template could not be created. Please try again.')
  revalidateTerms()
  redirect(`/settings/terms/${created.data}`)
}

/** Saves the draft; with intent "approve" it then approves the version it just saved. */
export async function saveTermsDraftAction(templateId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(templateId)) return { error: NOT_FOUND }
  const effective = text(form, 'effectiveFrom').trim()
  if (effective !== '' && !isValidIsoDate(effective)) return { error: 'Enter a valid effective date.' }
  const { db } = await documentContext()
  const saved = await db.rpc('save_terms_draft', {
    p_template: templateId,
    p_body: text(form, 'body'),
    p_inclusions: text(form, 'inclusions'),
    p_effective_from: effective === '' ? null : effective,
    p_change_note: text(form, 'changeNote'),
  })
  if (saved.error || typeof saved.data !== 'string') return failureState(saved.error, 'The draft could not be saved. Please try again.')
  if (text(form, 'intent') === 'approve') {
    const approved = await db.rpc('approve_terms_version', { p_version: saved.data })
    // The draft is saved even when approval is refused: say so, so nothing typed is lost.
    if (approved.error) {
      revalidateTerms()
      const message = failureState(approved.error, 'The terms could not be approved. Please try again.').error
      return { error: `Your draft was saved, but it was not approved. ${message}` }
    }
    revalidateTerms()
    return { success: 'Approved. This version is now fixed and cannot be edited.' }
  }
  revalidateTerms()
  return { success: 'Draft saved.' }
}

export async function discardTermsDraftAction(templateId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(templateId)) return { error: NOT_FOUND }
  const { db } = await documentContext()
  const result = await db.rpc('discard_terms_draft', { p_template: templateId })
  if (result.error) return failureState(result.error, 'The draft could not be discarded. Please try again.')
  revalidateTerms()
  return { success: 'Draft discarded.' }
}

export async function archiveTermsVersionAction(versionId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(versionId)) return { error: NOT_FOUND }
  const { db } = await documentContext()
  const result = await db.rpc('archive_terms_version', { p_version: versionId })
  if (result.error) return failureState(result.error, 'The version could not be archived. Please try again.')
  revalidateTerms()
  return { success: 'Archived.' }
}

export async function restoreTermsVersionAction(versionId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(versionId)) return { error: NOT_FOUND }
  const { db } = await documentContext()
  const result = await db.rpc('restore_terms_version', { p_version: versionId })
  if (result.error) return failureState(result.error, 'The version could not be restored. Please try again.')
  revalidateTerms()
  return { success: 'Copied into a new draft. Set its effective date and approve it to use it.' }
}
```

- [ ] **Step 8: Write the failing source checks `tests/unit/terms-ui.test.ts` (server layer)**

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { documentErrorMessage } from '../../features/documents/errors.ts'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const TOKENS = ['TERMS_TEMPLATE_EXISTS', 'TERMS_TARGET_INVALID', 'TERMS_NOT_FOUND', 'TERMS_NOT_DRAFT', 'TERMS_NOT_APPROVED', 'TERMS_DRAFT_EXISTS', 'TERMS_EMPTY', 'TERMS_EFFECTIVE_REQUIRED', 'TERMS_PLACEHOLDER_UNKNOWN', 'TERMS_TOO_LONG', 'TERMS_FORBIDDEN', 'TERMS_VERSION_IMMUTABLE']

test('every terms refusal the database can raise has a plain message', () => {
  const sql = read('supabase', 'migrations', '20261012160000_commercial_terms.sql')
  for (const token of TOKENS) {
    assert.ok(sql.includes(`'${token}'`), `${token} is raised by the migration`)
    assert.ok(documentErrorMessage(token), `${token} has a message`)
  }
  assert.match(documentErrorMessage('TERMS_PLACEHOLDER_UNKNOWN')!, /\{\{monthly_fee\}\}/, 'the message names the allowed placeholders')
})

test('the terms actions send ids and text to the database functions and never write a table directly', () => {
  const actions = read('features', 'terms', 'actions', 'terms.ts')
  assert.match(actions, /^'use server'/)
  for (const fn of ['create_terms_template', 'save_terms_draft', 'discard_terms_draft', 'approve_terms_version', 'archive_terms_version', 'restore_terms_version']) {
    assert.ok(actions.includes(`rpc('${fn}'`), `${fn} is called`)
  }
  assert.doesNotMatch(actions, /\.from\(['"]terms_/, 'no direct table writes')
  assert.match(actions, /isUuid\(templateId\)/)
  assert.match(actions, /isUuid\(versionId\)/)
  assert.match(actions, /isValidIsoDate\(effective\)/)
  assert.match(actions, /text\(form, 'intent'\) === 'approve'/, 'approve saves first, then approves')
  assert.match(actions, /Your draft was saved, but it was not approved/, 'a refused approval says the draft is kept')
})

test('the queries read only the organisation of the signed-in user and the preview never uses a draft of another template', () => {
  const list = read('features', 'terms', 'queries', 'list-terms-templates.ts')
  const get = read('features', 'terms', 'queries', 'get-terms-template.ts')
  const preview = read('features', 'terms', 'queries', 'load-preview.ts')
  for (const source of [list, get, preview]) assert.match(source, /^import 'server-only'/)
  for (const source of [list, get]) assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(preview, /\.eq\('status', 'approved'\)/, 'the company layer is taken from approved versions only')
  assert.match(preview, /currentVersion\(/)
})
```

Run: `node --test --experimental-strip-types tests/unit/terms-ui.test.ts tests/unit/terms-grouping.test.ts` — expect PASS once steps 3–7 are written.

- [ ] **Step 9: Typecheck, full unit suite, commit**

```bash
npx tsc --noEmit -p .
node --test --experimental-strip-types tests/unit/*.test.ts
git add features/documents/errors.ts features/terms/grouping.ts features/terms/queries features/terms/actions tests/unit/terms-grouping.test.ts tests/unit/terms-ui.test.ts
git commit -m "feat(terms): messages, queries and server actions"
```

---

### Task 7: The admin screens

**Files:**
- Create: `features/terms/components/terms-list-screen.tsx`, `new-template-form.tsx`, `terms-template-screen.tsx`, `draft-editor.tsx`, `terms-preview.tsx`
- Create: `app/(unison)/settings/terms/page.tsx`, `app/(unison)/settings/terms/[templateId]/page.tsx`
- Modify: `features/organizations/components/organization-profile-screen.tsx` (add the link under the price list item)
- Test: `tests/unit/terms-ui.test.ts` (append)

**Interfaces:**
- Consumes: Task 6 queries and actions; `WorkspaceHeader` (`@/components/shared/workspace-header`: props `category`, `parent {label, href}`, `title`, `description`), `WorkspaceSection` (`title`, `description?`, `action?`, `children`), `ActionButton` (`@/features/crm-workspace/components/action-button`: `action`, `label`, `confirmText?`, `tone?`, `ariaLabel?`), `formatDocumentDate` (`@/features/documents/document-view`), `documentContext`, `placeholderProblems` (Task 1).
- Produces: pages `/settings/terms` and `/settings/terms/[templateId]`.

- [ ] **Step 1: Write the failing source checks (append to `tests/unit/terms-ui.test.ts`)**

```ts
test('the two settings pages exist, check the id before loading, and are linked from the organisation profile', () => {
  const list = read('app', '(unison)', 'settings', 'terms', 'page.tsx')
  assert.match(list, /TermsListScreen/)
  const detail = read('app', '(unison)', 'settings', 'terms', '[templateId]', 'page.tsx')
  assert.match(detail, /isUuid\(templateId\)/)
  assert.match(detail, /notFound\(\)/)
  assert.match(detail, /await params/)
  assert.match(detail, /await searchParams/)
  const profile = read('features', 'organizations', 'components', 'organization-profile-screen.tsx')
  assert.match(profile, /href="\/settings\/terms"/)
  assert.match(profile, /Commercial terms/)
})

test('the list shows the groups and statuses, and only an owner or admin sees the New template form', () => {
  const screen = read('features', 'terms', 'components', 'terms-list-screen.tsx')
  assert.match(screen, /const canManage = role === 'owner' \|\| role === 'admin'/)
  assert.match(screen, /\{canManage \? <NewTemplateForm \/> : null\}/)
  assert.match(screen, /No approved terms/)
  assert.match(screen, /Draft pending/)
  assert.match(screen, /groupTemplates\(/)
  assert.match(screen, /href=\{`\/settings\/terms\/\$\{template\.id\}`\}/)
  const form = read('features', 'terms', 'components', 'new-template-form.tsx')
  assert.match(form, /createTermsTemplateAction/)
  assert.doesNotMatch(form, /value="company"/, 'company templates are seeded, not created by hand')
})

test('the template page offers editing, approving, archiving and restoring to owners and admins only, and never an edit on an approved version', () => {
  const screen = read('features', 'terms', 'components', 'terms-template-screen.tsx')
  assert.match(screen, /const canManage = role === 'owner' \|\| role === 'admin'/)
  assert.match(screen, /archiveTermsVersionAction\.bind\(null, /)
  assert.match(screen, /restoreTermsVersionAction\.bind\(null, /)
  assert.match(screen, /discardTermsDraftAction\.bind\(null, /)
  assert.match(screen, /An approved version cannot be edited/)
  assert.match(screen, /\{canManage \?/)
  const editor = read('features', 'terms', 'components', 'draft-editor.tsx')
  assert.match(editor, /name="intent" value="save"/)
  assert.match(editor, /name="intent" value="approve"/)
  assert.match(editor, /placeholderProblems\(/, 'the editor warns about an unknown placeholder as you type')
  assert.match(editor, /startTransition\(\(\) => run\(data\)\)/, 'a failed save keeps what was typed')
  assert.match(editor, /submitter/, 'the clicked button decides save or approve')
  const preview = read('features', 'terms', 'components', 'terms-preview.tsx')
  assert.match(preview, /Left out/)
  assert.match(preview, /Service inclusions/)
})
```

Run: `node --test --experimental-strip-types tests/unit/terms-ui.test.ts` — the new tests FAIL (files missing).

- [ ] **Step 2: Write the pages**

`app/(unison)/settings/terms/page.tsx`:

```tsx
import { TermsListScreen } from '@/features/terms/components/terms-list-screen'

export default function Page() {
  return <TermsListScreen />
}
```

`app/(unison)/settings/terms/[templateId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'

import { TermsTemplateScreen } from '@/features/terms/components/terms-template-screen'
import { isUuid } from '@/lib/utils'

export default async function Page({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ version?: string }> }) {
  const { templateId } = await params
  const { version } = await searchParams
  if (!isUuid(templateId)) notFound()
  return <TermsTemplateScreen templateId={templateId} versionId={version && isUuid(version) ? version : undefined} />
}
```

- [ ] **Step 3: Write `features/terms/components/new-template-form.tsx`**

```tsx
'use client'

import { useActionState, useTransition } from 'react'

import { createTermsTemplateAction } from '../actions/terms'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'

/** Owners and admins add a template for an offering that has none (the seeded ones are listed above). */
export function NewTemplateForm() {
  const [state, run, pending] = useActionState(createTermsTemplateAction, undefined)
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="grid gap-3 border border-border bg-card p-5 md:grid-cols-2"
    >
      <h2 className="unison-section-title text-xs text-foreground md:col-span-2">New template</h2>
      <label className="text-sm font-medium">
        For
        <select name="targetKind" required defaultValue="" aria-label="What the template is for" className={`${field} mt-1.5`}>
          <option value="" disabled>Choose…</option>
          <option value="retainer">A retainer tier</option>
          <option value="project">A project category</option>
          <option value="support">A support service</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Key
        <input name="targetKey" required pattern="[a-z0-9_]{1,60}" aria-label="Key" placeholder="for example website_care" className={`${field} mt-1.5`} />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">The rate card key: lowercase letters, numbers and underscores.</span>
      </label>
      <label className="text-sm font-medium">
        Applies to
        <select name="appliesTo" required defaultValue="quote" aria-label="Applies to" className={`${field} mt-1.5`}>
          <option value="quote">Quotes</option>
          <option value="invoice">Invoices</option>
          <option value="both">Quotes and invoices</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Title
        <input name="title" required maxLength={200} aria-label="Title" className={`${field} mt-1.5`} />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{state.error}</p> : null}
      <div className="md:col-span-2">
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Creating…' : 'Create template'}</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Write `features/terms/components/terms-list-screen.tsx`**

```tsx
import Link from 'next/link'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatDocumentDate } from '@/features/documents/document-view'
import { documentContext } from '@/features/documents/server-context'
import { groupTemplates, templateStatus } from '../grouping'
import { listTermsTemplates } from '../queries/list-terms-templates'
import { NewTemplateForm } from './new-template-form'

const APPLIES: Record<string, string> = { quote: 'Quotes', invoice: 'Invoices', both: 'Quotes and invoices' }
const badge = 'ml-2 border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide'

export async function TermsListScreen() {
  const [{ role }, templates] = await Promise.all([documentContext(), listTermsTemplates()])
  const canManage = role === 'owner' || role === 'admin'
  const groups = groupTemplates(templates)
  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Organisation Profile', href: '/settings' }}
        title="Commercial terms"
        description="The standard terms and conditions for each offering. Only approved terms whose effective date has arrived are used, and an approved version never changes: write a new version instead."
      />
      <p className="mb-4 text-sm text-[var(--briefing-muted)]">
        {canManage ? 'Owners and admins write, approve and archive terms.' : 'You can read approved terms. Only an owner or admin can change them.'}
      </p>
      <div className="space-y-5">
        {groups.map((group) => (
          <WorkspaceSection key={group.label} title={group.label}>
            <ul className="divide-y divide-border">
              {group.rows.map((template) => {
                const status = templateStatus(template)
                return (
                  <li key={template.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{template.title}</p>
                      <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                        {APPLIES[template.appliesTo]}
                        {status.kind === 'current' ? ` · Approved version ${status.version}, effective ${formatDocumentDate(status.effectiveFrom)}` : null}
                        {status.kind === 'upcoming' ? ` · Approved version ${status.version}, effective ${formatDocumentDate(status.effectiveFrom)} (not yet in force)` : null}
                      </p>
                      {status.kind === 'none' ? <span className={`${badge} ml-0 border-amber-300 text-amber-800`}>No approved terms</span> : null}
                      {template.hasDraft ? <span className={`${badge} ml-0 border-border text-[var(--briefing-muted)]`}>Draft pending</span> : null}
                    </div>
                    <Link href={`/settings/terms/${template.id}`} aria-label={`${canManage ? 'Open' : 'View'}: ${template.title}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">
                      {canManage ? 'Open' : 'View'}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </WorkspaceSection>
        ))}
        {groups.length === 0 ? <p className="text-sm text-[var(--briefing-muted)]">There are no terms templates yet.</p> : null}
        {canManage ? <NewTemplateForm /> : null}
      </div>
    </>
  )
}
```

- [ ] **Step 5: Write `features/terms/components/terms-preview.tsx`**

```tsx
import type { ResolvedTerms } from '../resolve-terms'

/** The terms as a client would read them, with a clear warning for anything a placeholder left out. */
export function TermsPreview({ preview, label }: { preview: ResolvedTerms; label: string }) {
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-xs text-[var(--briefing-muted)]">{label}</p>
      {preview.skipped.length > 0 ? (
        <div role="status" className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Left out of this preview because a value is not available: {preview.missing.map((name) => `{{${name}}}`).join(', ')}</p>
          <ul className="mt-1 list-disc pl-4">
            {preview.skipped.map((line) => <li key={line} className="break-words">{line}</li>)}
          </ul>
        </div>
      ) : null}
      {preview.inclusions.length > 0 ? (
        <section>
          <h3 className="unison-section-title text-xs text-foreground">Service inclusions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {preview.inclusions.map((line) => <li key={line} className="break-words">{line}</li>)}
          </ul>
        </section>
      ) : null}
      <section>
        <h3 className="unison-section-title text-xs text-foreground">Terms and conditions</h3>
        {preview.lines.length > 0 ? (
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            {preview.lines.map((line) => <li key={line} className="break-words">{line}</li>)}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-[var(--briefing-muted)]">There is no wording yet.</p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Write `features/terms/components/draft-editor.tsx`**

```tsx
'use client'

import { useActionState, useState, useTransition } from 'react'

import { placeholderProblems } from '../placeholders'
import { saveTermsDraftAction } from '../actions/terms'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'
const area = 'mt-1.5 w-full rounded-none border border-border bg-background px-3 py-2 text-sm font-mono'

type Start = { body: string; inclusions: string; effectiveFrom: string | null; changeNote: string | null }

/**
 * The draft of a template: one clause per line, the service inclusions, an effective date and a change note.
 * "Save draft" keeps it; "Save and approve" fixes it as a new approved version.
 * A failed save keeps what was typed (the action is called by hand, as in the price list form).
 */
export function DraftEditor({ templateId, start, hasDraft }: { templateId: string; start: Start; hasDraft: boolean }) {
  const [state, run, pending] = useActionState(saveTermsDraftAction.bind(null, templateId), undefined)
  const [, startTransition] = useTransition()
  const [body, setBody] = useState(start.body)
  const [inclusions, setInclusions] = useState(start.inclusions)
  const problems = [...new Set([...placeholderProblems(body), ...placeholderProblems(inclusions)])]
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        const data = new FormData(event.currentTarget, submitter)
        startTransition(() => run(data))
      }}
      className="grid gap-3 px-5 py-4 md:grid-cols-2"
    >
      <p className="text-xs text-[var(--briefing-muted)] md:col-span-2">
        {hasDraft ? 'Editing the draft.' : 'Saving starts a new draft from the wording shown below.'} An approved version cannot be edited; approving this draft creates the next version.
      </p>
      <label className="text-sm font-medium md:col-span-2">
        Terms and conditions (one clause per line)
        <textarea name="body" rows={12} value={body} onChange={(event) => setBody(event.target.value)} aria-label="Terms and conditions" className={area} />
      </label>
      <label className="text-sm font-medium md:col-span-2">
        Service inclusions (one per line)
        <textarea name="inclusions" rows={5} value={inclusions} onChange={(event) => setInclusions(event.target.value)} aria-label="Service inclusions" className={area} />
      </label>
      {problems.length > 0 ? (
        <p role="status" className="text-xs text-amber-800 md:col-span-2">
          Not a placeholder UNISON knows: {problems.join(', ')}. Use only {'{{monthly_fee}}'}, {'{{monthly_credits}}'}, {'{{initiative_limit}}'}, {'{{valid_days}}'} and {'{{payment_days}}'}, with no spaces. The draft can be saved, but not approved.
        </p>
      ) : null}
      <label className="text-sm font-medium">
        Effective from
        <input name="effectiveFrom" type="date" defaultValue={start.effectiveFrom ?? ''} aria-label="Effective from" className={`${field} mt-1.5`} />
      </label>
      <label className="text-sm font-medium">
        Change note
        <input name="changeNote" maxLength={500} defaultValue={start.changeNote ?? ''} aria-label="Change note" className={`${field} mt-1.5`} />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-success md:col-span-2">{state.success}</p> : null}
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <button type="submit" name="intent" value="save" disabled={pending} className="border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60">{pending ? 'Working…' : 'Save draft'}</button>
        <button type="submit" name="intent" value="approve" disabled={pending || problems.length > 0} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save and approve</button>
      </div>
    </form>
  )
}
```

`name="intent" value="save"` and `value="approve"` must appear literally (the source test checks for them).

- [ ] **Step 7: Write `features/terms/components/terms-template-screen.tsx`**

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatDocumentDate } from '@/features/documents/document-view'
import { documentContext } from '@/features/documents/server-context'
import { archiveTermsVersionAction, discardTermsDraftAction, restoreTermsVersionAction } from '../actions/terms'
import { getTermsTemplate } from '../queries/get-terms-template'
import { DraftEditor } from './draft-editor'
import { TermsPreview } from './terms-preview'

const APPLIES: Record<string, string> = { quote: 'quotes', invoice: 'invoices', both: 'quotes and invoices' }
const KIND: Record<string, string> = { company: 'Company-wide terms', retainer: 'Retainer tier', project: 'Project category', support: 'Support service' }
const STATUS: Record<string, string> = { draft: 'Draft', approved: 'Approved', archived: 'Archived' }

export async function TermsTemplateScreen({ templateId, versionId }: { templateId: string; versionId?: string }) {
  const [{ role }, detail] = await Promise.all([documentContext(), getTermsTemplate(templateId, versionId)])
  if (!detail) notFound()
  const canManage = role === 'owner' || role === 'admin'
  const { template, versions, current, draft, selected, preview, names } = detail
  const who = (id: string | null) => (id ? names[id] ?? 'A team member' : '—')
  // A new draft starts from the draft if there is one, otherwise from the version in force, otherwise from the newest version.
  const startFrom = draft ?? current ?? versions[0] ?? null

  return (
    <>
      <WorkspaceHeader
        category="Settings"
        parent={{ label: 'Commercial terms', href: '/settings/terms' }}
        title={template.title}
        description={`${KIND[template.targetKind]}${template.targetKey ? ` (${template.targetKey})` : ''}, for ${APPLIES[template.appliesTo]}.`}
      />
      <div className="space-y-5">
        <WorkspaceSection title="Versions" description="An approved version cannot be edited. To change the wording, write a new version.">
          {versions.length ? (
            <ul className="divide-y divide-border">
              {versions.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">
                      Version {item.version} · {STATUS[item.status]}
                      {current?.id === item.id ? <span className="ml-2 border border-success/40 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-success">In force</span> : null}
                      {selected?.id === item.id ? <span className="ml-2 border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--briefing-muted)]">Previewed</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                      {item.effectiveFrom ? `Effective ${formatDocumentDate(item.effectiveFrom)}` : 'No effective date yet'}
                      {` · Written by ${who(item.createdBy)} on ${formatDocumentDate(item.createdAt.slice(0, 10))}`}
                      {item.approvedAt ? ` · Approved by ${who(item.approvedBy)} on ${formatDocumentDate(item.approvedAt.slice(0, 10))}` : ''}
                      {item.archivedAt ? ` · Archived ${formatDocumentDate(item.archivedAt.slice(0, 10))}` : ''}
                    </p>
                    {item.changeNote ? <p className="mt-1 break-words text-xs text-[var(--briefing-muted)]">{item.changeNote}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/settings/terms/${template.id}?version=${item.id}`} aria-label={`Preview version ${item.version}`} className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground">Preview</Link>
                    {canManage && item.status !== 'draft' ? (
                      <ActionButton action={restoreTermsVersionAction.bind(null, item.id)} label="Restore" ariaLabel={`Restore version ${item.version} into a new draft`} confirmText="Copy this version into a new draft? The version itself is not changed." />
                    ) : null}
                    {canManage && item.status === 'approved' ? (
                      <ActionButton action={archiveTermsVersionAction.bind(null, item.id)} label="Archive" ariaLabel={`Archive version ${item.version}`} tone="danger" confirmText="Archive this version? It stops being used for new documents. Documents that already used it are not changed." />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No version has been written yet.</p>
          )}
        </WorkspaceSection>

        {canManage ? (
          <WorkspaceSection
            title={draft ? 'Draft' : 'Write a new version'}
            action={draft ? <ActionButton action={discardTermsDraftAction.bind(null, template.id)} label="Discard draft" ariaLabel="Discard the draft" tone="danger" confirmText="Discard this draft? The text is deleted." /> : undefined}
          >
            <DraftEditor
              key={`${draft?.id ?? 'new'}-${draft?.version ?? current?.version ?? 0}`}
              templateId={template.id}
              hasDraft={Boolean(draft)}
              start={{
                body: startFrom?.body ?? '', inclusions: startFrom?.inclusions ?? '',
                effectiveFrom: draft?.effectiveFrom ?? null, changeNote: draft?.changeNote ?? null,
              }}
            />
          </WorkspaceSection>
        ) : null}

        <WorkspaceSection title="Preview" description="As a client would read it, with today's rate card values and company settings.">
          {preview && selected ? (
            <TermsPreview preview={preview} label={`Version ${selected.version} (${STATUS[selected.status].toLowerCase()})${template.targetKind === 'company' ? '' : ', after the current company terms'}.`} />
          ) : (
            <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">Nothing to preview yet.</p>
          )}
        </WorkspaceSection>
      </div>
    </>
  )
}
```

- [ ] **Step 8: Link from the organisation profile**

In `features/organizations/components/organization-profile-screen.tsx`, after the price list `<li>` (the one ending `Products and services to pick from.</span></li>`), add:

```tsx
            <li>
              <Link href="/settings/terms" className="font-semibold text-brand hover:underline">Commercial terms</Link>
              <span className="block text-xs text-muted-foreground">Standard terms for each offering.</span>
            </li>
```

- [ ] **Step 9: Run tests, typecheck, build the page graph**

```bash
node --test --experimental-strip-types tests/unit/terms-ui.test.ts
node --test --experimental-strip-types tests/unit/*.test.ts
npx tsc --noEmit -p .
```
Expected: all pass. If an existing test asserts the exact contents of the organisation profile's settings links, extend it for the new link.

- [ ] **Step 10: Commit**

```bash
git add features/terms/components app/\(unison\)/settings/terms features/organizations/components/organization-profile-screen.tsx tests/unit/terms-ui.test.ts
git commit -m "feat(terms): the Commercial terms settings screens"
```

---

### Task 8: Walk the screens, update the docs, final checks

**Files:**
- Modify: `docs/crm-roadmap.md`, `docs/follow-ups.md`, `docs/superpowers/specs/2026-10-12-commercial-terms-foundation-design.md` (record the six rulings)
- Memory: update `C:\Users\Neo\.claude\projects\C--Users-Neo-OneDrive-Documents-HIMARK-SGC-projects-apps-unison\memory\` (a project note for this build; index line in `MEMORY.md`)

- [ ] **Step 1: Controller: look at the real screens (needs the user to be signed in)**

Start the dev server (`preview_start` name `unison-dev`), open `/settings/terms` and a retainer template. The built-in browser is not signed in and the controller never enters a password: ask the user to sign in on the pane, then check: the list groups and badges, the Signature template preview (fee `R100 000,00`, 40 credits, "up to 2"), Reserve preview (no skipped lines), a support template ("No approved terms"), the draft editor (save, approve, an unknown placeholder warning, restore), a member's read-only view if a member account exists. Report anything not checked.

- [ ] **Step 2: Update the docs**

- `docs/crm-roadmap.md`: under Stage 2, add after the pricing line: `- [x] Commercial terms foundation (build 1 of the terms engine): versioned, approved terms templates with company-wide, offering and project layers, placeholders from the rate card, and a Settings > Commercial terms screen (built 2026-10-12; quote and invoice forms are not connected yet: that is build 2; credit allocations are build 3; waiting for the signed-in walk-through)`.
- `docs/follow-ups.md`: new section "From the commercial terms foundation" listing: (a) the company-wide templates are a copy of the default text boxes in company settings until build 2 switches documents over; (b) Strategic Consulting has terms but no rate card row; (c) the brief's "AI & Automation Operations" is "Operations Improvement Support" on the rate card, decision needed in build 2; (d) the brief's Project Care, Managed and Content prices equal the rate card's agreed support prices but the brief calls them "proposed", decision needed before they are shown on a quote; (e) missing commercial policies requiring HIMARK approval: late-payment penalty, termination period, intellectual-property transfer, credit expiry or rollover, and any validity wording beyond the existing company setting; (f) support-service templates are empty and need wording; (g) an organisation other than HIMARK gets no templates until `seed_commercial_terms` is called for it (same as the rate card).
- Spec: add the six rulings from the top of this plan under a new heading "Rulings made while planning the build" and fix the function table row for `create_terms_template` to include `p_org`.

- [ ] **Step 3: Full verification (controller)**

```bash
node --test --experimental-strip-types tests/unit/*.test.ts
npx tsc --noEmit -p .
node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/*.test.ts
```
Expected: unit suite and typecheck clean; the whole RLS suite passes (the new files plus all earlier ones). Then verify production is clean again (no fixture organisations or users, no new null-organisation audit rows).

- [ ] **Step 4: Commit the docs and update memory**

```bash
git add docs/crm-roadmap.md docs/follow-ups.md docs/superpowers/specs/2026-10-12-commercial-terms-foundation-design.md
git commit -m "docs: record the commercial terms foundation and what is left for builds 2 and 3"
```

Write the memory note and index line, then report to the user: files and modules changed, database changes and migrations, where templates live, how placeholders and layering work, the tests actually run and their results, and the missing commercial policies (step 2 list). Do not claim the screens were checked in a signed-in browser unless step 1 actually happened.

---

## Self-review (run by the plan author)

**Spec coverage**
- Two tables, columns, constraints, one-draft rule, immutability, select policy, no direct writes: Task 4.
- Functions and error tokens: Task 4 (SQL), Task 6 step 1 (messages), tests in Task 4.
- Placeholders (list, validation at approval, missing never printed, retainer-only values): Tasks 1, 3, 4, 6.
- Resolver (layer order, dedupe, inclusions apart, sources): Task 1.
- Current version rule with South African today and future dates: Task 2; used by Task 6 queries.
- `termsTargetsFor(kind, offering)`: Task 2 (the spec's `kind` argument is dropped because applicability by kind is a separate pure function `appliesToKind`; the company template choice per kind happens in the loader).
- Admin screens (list groups, badges, template page, draft editor, restore, archive, preview, member read-only, link from profile): Task 7.
- Seeded content, effective 2026-10-12, company copy from settings, support empty, inclusions: Tasks 3, 5.
- Seed function service-role only and idempotent: Task 5.
- Tests (unit and database): every task; cleanup sweep: Task 4 step 2.
- Docs and the missing-policies report: Task 8.

**Placeholder scan:** the only deliberate non-code content is "PASTE THE GENERATED JSON HERE" in Task 5, which is produced by the script shown in the same step and verified by a unit test; and the "replace the incomplete restore test" instruction in Task 4, which is spelled out.

**Type consistency:** `TermsLayer`, `ResolvedLayer`, `ResolvedTerms` (with `skipped`) are defined in Task 1 and used unchanged in Tasks 5–7; `SelectableVersion` and `currentVersion`/`upcomingVersion` signatures in Task 2 match their uses in Task 6 (rows carry `effectiveFrom`); `TemplateSummary` is defined in `grouping.ts` (Task 6) and used by the list query and screen; `TemplateInfo` is exported from `load-preview.ts` and used by `get-terms-template.ts`. Action names match between Task 6 (definitions) and Task 7 (imports).

**Review Focus coverage:** items 1 (line endings): Task 1 test and Task 4 test; 2 (dates): Task 2; 3 (dedupe spacing): Task 1; 4 (archive falls back): Task 2; 5 (spaced placeholder): Task 1 and Task 4; 6 (Reserve, missing value): Tasks 1 and 3; 7 (member and outsider direct calls): Task 4.
