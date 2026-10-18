# Quote portal, slice 1: links, portal, email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A salesperson emails a sent quote with a branded message whose button opens a private, read-only portal page for exactly that quote, behind a per-organisation switch that is off by default.

**Architecture:** New tables and service-role-only database functions hold hashed-token links; one new allowlisted server module calls them; a bare `/q/<token>` route group renders the frozen quote through the existing `buildDocumentView`. The existing email action mints a link and sends a new table-based template when the switch is on, and behaves exactly as today when it is off.

**Tech Stack:** Next.js 16.3.4 (App Router, `proxy.ts`), Supabase Postgres, `@react-pdf/renderer`, Microsoft Graph mail, `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-18-quote-portal-design.md` (read it first; the appendix holds the exact client-facing copy). The two reference images are in `docs/superpowers/specs/assets/`. Slices 2 (accept/decline) and 3 (HIVE feed gate) are separate plans.

## Global Constraints

- **Production is the only database.** The Supabase project `unison-uat` (`nwdzpjzllhhqwawmsxjd`) is live production, and `pnpm test:rls` runs against it. Every fixture row, including audit rows, must be deleted and verified gone (Task 12 has the check). Migrations are append-only and are applied with the Supabase MCP `apply_migration` before the tests that need them.
- **Git:** stage by explicit path only (never `git add -A`, `git checkout .`, `git restore .`, `git stash`, `git clean`). Commit on this branch; never push or merge.
- **Next.js 16 differs from older versions.** Before writing route, page, config or proxy code, read the relevant guide in `node_modules/next/dist/docs/`. `params` and `searchParams` are Promises; `proxy.ts` replaces middleware.
- **No new environment variables and no new dependencies.**
- **Service role:** exactly one new file may import `lib/supabase/admin`: `lib/quote-portal/portal-client.ts`. The portal functions are granted to `service_role` only; nothing is granted to `anon`.
- **Token:** 32 random bytes, base64url, 43 characters, stored only as lower-case hex sha256; the link's `expires_at` is the start of the day after `valid_until` in `Africa/Johannesburg`, or 30 days after creation when there is no `valid_until`.
- **Opening or refreshing the portal never changes the quote.** "Viewed" is stamped only by a client-side call after the page has loaded.
- **Portal responses:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Content-Security-Policy: frame-ancestors 'none'`; no third-party resources; Vercel Analytics must never receive the token.
- **Switch off means no change:** with `quote_portal_enabled` false the email action and email are exactly what they are today.
- **Client-facing status word:** Sent shows "Awaiting response"; every other status keeps its name.
- **Copy** is taken verbatim from the spec appendix; `features/quote-portal/copy.ts` is its only home.
- **House style:** `'use server'` files export only async functions; modules unit-tested by `node --test` use relative `.ts` imports, no `@/`, no `server-only`, no directive; database clients are untyped (`as any`) because `types/database.ts` is stale; read `AGENTS.md`.
- **Test commands:** unit `node --test --experimental-strip-types tests/unit/<file>.test.ts`; database `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/<file>.test.ts` (`.env.local` already exists in this worktree and is gitignored).

## Review Focus

Failure modes the spec implies that no feature task would otherwise test, most likely first. Each has a test in the task named.

1. A mail scanner or prefetcher fetching the link (repeatedly, or only the PDF) changes nothing and does not stamp "opened" (Tasks 3, 7).
2. Malformed, truncated, upper-cased, padded or SQL-looking tokens all give the same "link not valid" page and never a 500 (Tasks 3, 5, 7).
3. A quote valid until today stays reachable until midnight South African time and not a second longer (Tasks 2, 3).
4. Hostile text in a client name, contact name or personal note (angle brackets, newlines, 5,000 characters) is escaped in the email and the portal and cannot inject a header or a link (Tasks 7, 8).
5. Quotes whose lines have no charge kind, a mix of kinds, only monthly lines, or zero-rated lines render a sensible, correctly added summary (Task 5).

---

### Task 0: Land the groundwork

**Files:**
- Modify: `tests/integration/rls/provision-organization.test.ts` (already edited), `docs/follow-ups.md`
- Add: `docs/superpowers/specs/2026-10-18-quote-portal-design.md`, `docs/superpowers/specs/assets/*.webp`, this plan

**Interfaces:** Consumes nothing. Produces a clean tree for every later task.

- [ ] **Step 1:** In `docs/follow-ups.md`, find where the two provisioning RLS test failures are recorded as known and replace that note with a short dated entry saying the two tests were stale (premise predated the `organizations_internal_select` policy of migration 20261011154613) and now check membership through `memberships` instead.
- [ ] **Step 2:** Run `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/provision-organization.test.ts`. Expected: 28 pass, 0 fail.
- [ ] **Step 3:** Commit the test and follow-ups edit as `fix(rls): provision-organization tests check membership, not organizations visibility`; commit the spec, assets and this plan as `docs: spec and slice 1 plan for the quote portal`. Stage each by explicit path.

---

### Task 1: Schema

**Files:**
- Create: `supabase/migrations/20261018100000_quote_portal_schema.sql`, `tests/integration/rls/quote-portal-schema.test.ts`
- Modify: `tests/integration/rls/anon-privileges.test.ts` (add `'quote_access_links'` to `TABLES`), `tests/unit/documents-vocabulary.test.ts`, `tests/unit/registers-spec.test.ts`, `features/documents/vocabulary.ts`, `features/registers/register-spec.ts`, `features/product-ui/registry.ts`

**Interfaces:** Produces the objects every later task uses:
- `quote_access_links(id, organization_id, quote_id, token_hash text unique, recipient_email text, recipient_name text null, created_by uuid null, created_at, expires_at timestamptz not null, revoked_at null, revoked_reason text null, first_viewed_at null, last_viewed_at null)`; composite FK `(quote_id, organization_id) → quotes(id, organization_id)` on delete cascade; `recipient_email` check: lower-case and one `@`.
- `quotes.supersedes_quote_id uuid null`, FK `(supersedes_quote_id, organization_id) → quotes(id, organization_id) on delete set null (supersedes_quote_id)`, check `supersedes_quote_id <> id`.
- `quotes_status_check` redefined to add `'Superseded'` (drop and re-add).
- `quote_lines.charge_kind text null check (charge_kind in ('once_off','monthly'))`.
- `organization_settings.quote_portal_enabled boolean not null default false`.
- RLS on `quote_access_links`: select for `is_member_of(organization_id)`; no insert/update/delete policy; `revoke all ... from anon, authenticated` then `grant select ... to authenticated`.
- TS: `QUOTE_SENT_STATUSES` gains `'Superseded'`; `CHARGE_KINDS = ['once_off','monthly'] as const`, `type ChargeKind`, `CHARGE_KIND_LABELS: Record<ChargeKind,string>` (`Once-off`, `Monthly`) exported from `features/documents/vocabulary.ts`.

- [ ] **Step 1: Write the failing tests** in `quote-portal-schema.test.ts` (fixtures: one org with a member and an owner of a second org, via `createFixtureOrg`/`createFixtureUser`; a quote and line inserted with the service role):
  - `'Superseded is an accepted quote status and an unknown one is not'` (update to `Superseded` succeeds; `Bogus` fails with code 23514).
  - `'charge_kind accepts once_off, monthly and null and nothing else'`.
  - `'quote_portal_enabled defaults to false'`.
  - `'a member reads their organisation's links, never another's, and cannot write one'` (insert a link with the service role; member select returns it, other org's member gets `[]`; member insert, update and delete each fail or affect nothing; the anon client gets a permission error).
  - `'supersedes_quote_id cannot point at another organisation's quote'` (23503).
  - `'deleting a quote deletes its links'`.
- [ ] **Step 2:** Run the file. Expected: FAIL (columns and table missing).
- [ ] **Step 3:** Write the migration. Add `'Superseded'` to the two mirrored unit tests the same way: change `documents-vocabulary.test.ts` and `registers-spec.test.ts` so the quote status list is read from the **last** `quotes_status_check` definition across all migrations (the invoice and other checks keep reading their original files); update `QUOTE_SENT_STATUSES`, `REGISTERS.quote.statuses` and the `quotes` view list in `registry.ts` to include `'Superseded'` after `'Expired'`. Do not add `Superseded` to the status select in `phase-six-form.tsx`: staff never set it by hand.
- [ ] **Step 4:** Apply the migration with `apply_migration` (name `quote_portal_schema`). Run the schema test, `anon-privileges.test.ts`, and `node --test --experimental-strip-types tests/unit/documents-vocabulary.test.ts tests/unit/registers-spec.test.ts`. Expected: all pass.
- [ ] **Step 5:** `pnpm typecheck` passes. Commit `feat(quote-portal): schema for links, superseding, charge kind and the portal switch`.

---

### Task 2: Link functions, superseding, expiry

**Files:**
- Create: `supabase/migrations/20261018101000_quote_portal_links.sql`, `tests/integration/rls/quote-portal-links.test.ts`
- Modify: `features/documents/errors.ts` (map the new tokens)

**Interfaces:** Consumes Task 1. Produces (all `security definer`, `search_path ''`):
- `create_quote_access_link(p_quote_id uuid, p_recipient_email text, p_recipient_name text default null) returns text` — grant `authenticated`. Requires: caller is a member of the quote's organisation (`QUOTE_NOT_FOUND`, 42501 otherwise); `organization_settings.quote_portal_enabled` (`QUOTE_PORTAL_OFF`); quote status `Sent` (`QUOTE_NOT_SENT`); email matches the same address rule as `isValidEmailAddress` (`RECIPIENT_INVALID`); computed expiry is in the future (`QUOTE_EXPIRED`). Lower-cases the email. Token is `translate(encode(extensions.gen_random_bytes(32),'base64'),'+/=','-_')`; stored hash is `encode(extensions.digest(token,'sha256'),'hex')`; expiry is `((valid_until + 1)::timestamp at time zone 'Africa/Johannesburg')`, else `now() + interval '30 days'`. Returns the raw token, which is never stored.
- `revoke_quote_access_link(p_link_id uuid, p_reason text default 'revoked by staff') returns void` — grant `authenticated`; member only (`LINK_NOT_FOUND`); idempotent (an already revoked link keeps its original time and reason).
- `revise_quote(p_id uuid) returns uuid` — grant `authenticated`; source must be `Sent`, `Declined` or `Expired` (`QUOTE_CANNOT_REVISE`); calls `duplicate_quote` and sets `supersedes_quote_id` on the copy.
- `duplicate_quote(uuid)` replaced (same body as in `20261013240000_drop_retired_billing_columns.sql`) so copied lines keep `charge_kind`.
- Trigger `quotes_supersede_original` (after update on `quotes`): when `old.status in ('Draft','Internal Review')`, `new.status = 'Sent'` and `new.supersedes_quote_id is not null`, set the original to `Superseded` only if it is still `Sent`, and only then revoke its unrevoked links with reason `'superseded'` (links of an Accepted, Declined or Expired original are left alone).
- `mark_expired_quotes(p_organization_id uuid default null) returns integer` — grant `service_role` only. Sets `Sent` quotes with `valid_until < (now() at time zone 'Africa/Johannesburg')::date` and `archived_at is null` to `Expired`, revokes their links with reason `'expired'`, returns the count; scheduled with `pg_cron` job `unison-mark-expired-quotes` at `'10 22 * * *'` using the same `do $$ ... if not exists (select 1 from cron.job ...)` guard as `20261011140000_payments_overdue.sql`.
- New tokens in `features/documents/errors.ts`: `QUOTE_PORTAL_OFF` ("The client portal is switched off. An owner or admin can turn it on under Settings, Company details."), `QUOTE_NOT_SENT` ("The secure link can only be added to a quote that is still awaiting a response."), `RECIPIENT_INVALID` ("Enter one valid email address."), `QUOTE_EXPIRED` ("This quote has passed its valid-until date."), `LINK_NOT_FOUND` ("That link was not found."), `QUOTE_CANNOT_REVISE` ("Only a sent, declined or expired quote can be revised.").

- [ ] **Step 1: Write the failing tests** in `quote-portal-links.test.ts` (org A with company settings and `quote_portal_enabled` true, a member, a client; org B with its own member; a quote sent through the real `send_quote` RPC; quotes with a past `valid_until` are made by updating a sent quote with the service role):
  - `'a link is 43 base64url characters and only its sha256 is stored'` (recompute the hash with `node:crypto` and compare; the raw token appears in no column of the row).
  - `'the recipient is lower-cased and the expiry is the start of the next day in South Africa'` (expected `new Date(`${valid_until}T00:00:00+02:00`).getTime() + 86_400_000`; also a quote valid until today stays creatable and one valid until yesterday gives `QUOTE_EXPIRED`).
  - `'creation is refused when the switch is off, the quote is not Sent, the address is invalid, or the caller belongs to another organisation'`, each with its token.
  - `'two recipients get two independent active links'`.
  - `'revoking is idempotent and cannot reach another organisation's link'`.
  - `'a plain member cannot switch the portal on'` (member update of `organization_settings.quote_portal_enabled` affects no row).
  - `'revise_quote copies lines with their charge kind and links back'`, `'refuses an Accepted or draft source'`.
  - `'sending the revision supersedes a Sent original and revokes its links'`, `'an Accepted, Declined or Expired original keeps its status when its revision is sent'`.
  - `'mark_expired_quotes expires only this organisation's overdue Sent quotes and revokes their links'`, `'a member cannot call it'`.
  - `'duplicate_quote keeps charge_kind'`.
- [ ] **Step 2:** Run the file. Expected: FAIL (functions missing).
- [ ] **Step 3:** Write the migration and the `errors.ts` entries.
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_links`). Run the file. Expected: all pass. Run `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/documents-send-issue.test.ts tests/integration/rls/documents-delivery.test.ts` to confirm sending and invoicing are untouched. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): link functions, superseding and nightly expiry`.

---

### Task 3: Portal read functions

**Files:**
- Create: `supabase/migrations/20261018102000_quote_portal_read.sql`, `tests/integration/rls/quote-portal-read.test.ts`

**Interfaces:** Consumes Tasks 1 and 2. Produces, granted to `service_role` only (revoked from `public, anon, authenticated`):
- `private.quote_snapshot(p_quote_id uuid) returns jsonb` — `{ record, lines }`. `record` has exactly these keys: `quote_number, status, issue_date, valid_until, currency, client_name, contact_name, client_ref, project_name, project_description, project_ref, vat_rate, subtotal, tax_amount, total_amount, terms, service_inclusions, terms_sources, bill_to, issuer, sent_at, accepted_at`. Each line has exactly: `id, position, title, description, quantity, unit_price, vat_code, line_amount, charge_kind`, ordered by position. It never includes `notes`, `owner_id`, `organization_id` or any other id.
- `public.portal_get_quote(p_token text) returns jsonb`. The token must match `^[A-Za-z0-9_-]{43}$`, then its sha256 hex is looked up. Result `{ state, expires_at, recipient_email, recipient_name, record, lines, version, replaces_number, owner }`, or exactly `{ "state": "invalid" }` for a malformed, unknown or revoked-but-not-superseded token. `state` is chosen in this order: quote status `Superseded` → `superseded`; link revoked with a reason other than `'expired'` → `invalid`; `now() >= expires_at` or quote status `Expired` → `expired` (so a link the nightly job revoked with reason `'expired'` reads as expired, not invalid); `Accepted` → `accepted`; `Declined` → `declined`; `Sent` → `open`; anything else → `invalid`. `record` and `lines` are present only for `open`, `accepted` and `declined`; `expired` and `superseded` carry `record` limited to `quote_number, client_name, valid_until` and no lines. `version` is 1 plus the number of ancestors along `supersedes_quote_id` (cycle-safe, capped at 50); `replaces_number` is the direct predecessor's number or null; `owner` is `{ name, email, job_title }` from `team_members` (`full_name`, `email`, `job_title`) for the quote's `owner_id`, or null.
- `public.portal_record_view(p_token text) returns void` — for an `open`, `accepted` or `declined` link sets `first_viewed_at` if null and always `last_viewed_at = now()`; does nothing for any other state.

- [ ] **Step 1: Write the failing tests** in `quote-portal-read.test.ts` (calls go through the service-role client; reuse Task 2's fixture shape):
  - `'an open link returns the frozen record, lines and owner, and nothing internal'` (assert the exact key sets above; `notes` absent; no `organization_id` anywhere in the JSON).
  - `'unknown, malformed and hostile tokens are all invalid'` (empty string, `'x'`, 42 and 44 characters, 43 characters with a space, a `'; drop table quotes; --` string, the correct token upper-cased) — each returns exactly `{state:'invalid'}`.
  - `'state follows the quote and the link'`: revoked → invalid; `expires_at` set one second ago → expired; quote `Expired` → expired; `Accepted` → accepted (with `accepted_at`); `Declined` → declined; superseded original → superseded even though its link is revoked; expired and superseded carry no lines or terms.
  - `'version and replaces_number follow the chain'` (a revision shows version 2 and the original's number).
  - `'reading changes nothing'` (call `portal_get_quote` five times; the link row and quote row, including `updated_at`, are identical afterwards, and `first_viewed_at` is still null).
  - `'portal_record_view stamps first once and last every time, and ignores invalid, revoked and expired links'`.
  - `'neither a member nor anon can call either function'` (permission denied).
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_read`). Run the file. Expected: all pass.
- [ ] **Step 5:** Commit `feat(quote-portal): service-role read functions for the portal`.

---

### Task 4: Charge kind in the app

**Files:**
- Modify: `features/documents/vocabulary.ts` (from Task 1), `features/documents/types.ts` (`DocumentLine.charge_kind: string | null`), `features/documents/fields.ts`, `features/documents/hive-offerings.ts`, `features/documents/components/line-editor.tsx`, `tests/unit/documents-fields.test.ts`, `tests/unit/hive-offering-line.test.ts`
- Create: `tests/unit/document-charge-kind.test.ts`

**Interfaces:** Consumes Task 1's `ChargeKind`. Produces:
- `LineFields` gains `charge_kind: ChargeKind | null`; `readLineFields` reads form field `chargeKind` (`''` or absent → null; anything else outside `CHARGE_KINDS` → `{ error: 'Choose Once-off or Monthly.' }`).
- `chargeKindForOffering(offering: HiveOffering): ChargeKind` in `features/documents/hive-offerings.ts`: `'monthly'` when `kind` is `retainer` or `support`, or `price.billingPeriod === 'month'`; otherwise `'once_off'`. `hiveOfferingToLine` includes it.
- Charge kind is quotes-only: `addLineAction`, `updateLineAction` and `addHiveOfferingLineAction` also serve invoices, whose `invoice_lines` table has no such column, so each removes `charge_kind` from the row before writing when `kind === 'invoice'`; the line editor renders the select only when `kind === 'quote'`. Add a source test pinning that each of the three actions guards on `kind`.

- [ ] **Step 1: Write the failing tests:** `'chargeKindForOffering maps retainer and support to monthly, implementation, project and credit packs to once_off, and a month billing period to monthly'`; `'readLineFields reads chargeKind, treats blank as null and refuses an unknown value'`; update the two existing `deepEqual` expectations (`documents-fields.test.ts:31`, `hive-offering-line.test.ts:26`) to include `charge_kind` (the Growth retainer line is `'monthly'`).
- [ ] **Step 2:** Run the three unit files. Expected: FAIL.
- [ ] **Step 3:** Implement. In `line-editor.tsx` add a select named `chargeKind` beside the VAT select in both forms: the add form defaults to `once_off`; the edit form defaults to the line's value, with a blank "Not set" option first. Locked (sent) quotes show the kind as text in the line row only when it is set.
- [ ] **Step 4:** Run the three unit files and `node --test --experimental-strip-types tests/unit/documents-ui.test.ts tests/unit/documents-actions-source.test.ts`. Expected: pass. `pnpm typecheck` passes.
- [ ] **Step 5:** Commit `feat(documents): a charge kind on quote lines, set from HIVE offerings`.

---

### Task 5: Portal helpers and copy (pure)

**Files:**
- Create: `lib/quote-portal/token.ts`, `lib/quote-portal/types.ts`, `features/quote-portal/summary.ts`, `features/quote-portal/copy.ts`, `tests/unit/quote-portal-token.test.ts`, `tests/unit/quote-portal-summary.test.ts`

**Interfaces:** Produces (relative imports only, no directive):
- `isPortalToken(value: unknown): value is string` — true only for `^[A-Za-z0-9_-]{43}$`.
- `type PortalState = 'open'|'accepted'|'declined'|'expired'|'superseded'|'invalid'`; `type PortalLine`, `type PortalQuote` mirroring the Task 3 JSON (`record` keys and line keys exactly as pinned there; amounts may arrive as strings).
- `clientStatusLabel(status: string): string` — `Sent` → `Awaiting response`, else unchanged.
- `versionLabel(version: number, replacesNumber: string | null): string` — `Version 1`, or `Version 2, replacing HMK-Q-2026-00045`.
- `buildCommercialSummary(lines: PortalLine[], vatRate: number): { grouped: false; lines: PortalLine[] } | { grouped: true; onceOff: PortalLine[]; monthly: PortalLine[]; onceOffSubtotal: number; monthlySubtotal: number; monthlyVat: number; monthlyIncludingVat: number }` — grouped only when every line has a charge kind and at least one is monthly; all arithmetic in integer cents, VAT on standard-rated lines only, rounded to 2 decimals.
- `copy.ts` exports the spec-appendix strings as named constants (`PORTAL_HEADING`, `PORTAL_INTRO`, `READY_TO_RESPOND`, `TERMS_STRIP`, `EMAIL_HEADING`, `EMAIL_DEFAULT_NOTE`, `EMAIL_NEXT_STEPS`, `QUESTIONS_HEADING`, `RECURRING_NOTE` = "Monthly charges recur each month; the first month is included in the total above.", `SLICE_ONE_RESPOND_NOTE` = "To accept or decline this quotation, reply to the email you received or contact your HIMARK contact.").

- [ ] **Step 1: Write the failing tests:** `isPortalToken` accepts a real 43-character token and rejects `''`, 42 and 44 characters, whitespace-padded, `+`, `/`, `=`, non-string; `clientStatusLabel`; `versionLabel`; `buildCommercialSummary` for: all-monthly, mixed once-off and monthly with a zero-rated once-off line, a line with no kind (→ `grouped:false`), no monthly lines (→ `grouped:false`), amounts as strings, and a case where float arithmetic would drift (`0.1 + 0.2` style cents) proving cents are exact.
- [ ] **Step 2:** Run both. Expected: FAIL.
- [ ] **Step 3:** Implement the five modules.
- [ ] **Step 4:** Run both. Expected: pass. Commit `feat(quote-portal): token check, summary grouping and copy`.

---

### Task 6: Portal plumbing

**Files:**
- Create: `lib/quote-portal/portal-client.ts`, `components/shared/analytics-url.ts`, `components/shared/safe-analytics.tsx`, `features/quote-portal/actions/record-view.ts`, `tests/unit/quote-portal-routes.test.ts`
- Modify: `proxy.ts`, `next.config.mjs`, `app/layout.tsx`, `tests/unit/service-role-boundary.test.ts`, `tests/unit/documents-pdf.test.ts`

**Interfaces:** Consumes Tasks 3 and 5. Produces:
- `getPortalQuote(token: string): Promise<PortalQuote>` and `recordPortalView(token: string): Promise<void>` in `lib/quote-portal/portal-client.ts` (`import 'server-only'`; the only importer of `createAdminSupabase`; both return `{ state: 'invalid' }` / do nothing without calling the database when `isPortalToken` is false; a database error throws).
- `recordViewAction(token: string): Promise<void>` (`'use server'`) calling `recordPortalView`.
- `redactPortalUrl<T extends { url: string }>(event: T): T` in `components/shared/analytics-url.ts`: a URL whose path starts with `/q/` has its path replaced by `/q/redacted` and its query and hash dropped; any other URL is returned unchanged. `SafeAnalytics` (`'use client'`) renders `<Analytics beforeSend={redactPortalUrl} />`.
- `proxy.ts`: `'/q'` added to `AUTH_EXEMPT` with a comment (the link token is the credential; exact prefix only).
- `next.config.mjs`: an async `headers()` returning, for `source: '/q/:path*'`, the four portal headers from Global Constraints; `outputFileTracingIncludes` gains `'/q/\\[token\\]/pdf': ['./public/brand/**/*']`.

- [ ] **Step 1: Write the failing tests** in `quote-portal-routes.test.ts` (source-reading style, like `integration-webhook-route.test.ts`): `'/q is exempt from sign-in with a segment boundary'` (`/q`, `/q/abc` exempt; `/quotes`, `/qq/x`, `/commercial/quotes/1` not; no `/api` entry added); `'portal responses carry the four headers'` (parse `next.config.mjs`); `'the pdf route is traced with the brand images'`; `'the portal client is the only new service-role importer and is server-only'`; `'the root layout uses SafeAnalytics, not Analytics directly'`; `redactPortalUrl` cases (a `/q/<43 chars>?x=1#h` URL becomes `https://host/q/redacted`; `/commercial/quotes/abc` is unchanged; a malformed URL string is returned unchanged rather than throwing). Update `service-role-boundary.test.ts`'s allowlist (add the file with its reason: "The quote portal has no session: the link token is the credential, and its functions are granted to service_role only so the database API cannot be called with the public key") and its pinned-by-value test; update `documents-pdf.test.ts` to assert the new tracing key.
- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3:** Implement. Read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md` and `proxy.md` first.
- [ ] **Step 4:** Run the three files plus `integration-webhook-route.test.ts` and `client-feed.test.ts`. Expected: pass. `pnpm typecheck` passes.
- [ ] **Step 5:** Commit `feat(quote-portal): service-role module, public route, headers and analytics redaction`.

---

### Task 7: Portal pages and PDF

**Files:**
- Create: `app/(portal)/layout.tsx`, `app/(portal)/q/[token]/page.tsx`, `app/(portal)/q/[token]/pdf/route.ts`, `features/quote-portal/components/portal-quote-view.tsx`, `features/quote-portal/components/portal-state-card.tsx`, `features/quote-portal/components/viewed-beacon.tsx`, `features/quote-portal/to-bundle.ts`, `tests/unit/quote-portal-ui.test.ts`

**Interfaces:** Consumes Tasks 5 and 6. Produces:
- `toDocumentBundle(quote: PortalQuote): DocumentBundle` (pure, `features/quote-portal/to-bundle.ts`): `{ record, lines, client: null, settings: null }`, valid because a non-draft quote is built only from its frozen `record`.
- `app/(portal)/layout.tsx`: bare layout, no navigation, a `<main>` only; sets the page title "Your quotation | HIMARK".
- The page reads `await params`, calls `isPortalToken` first, then `getPortalQuote`; renders `PortalQuoteView` for `open`, `accepted`, `declined` and `PortalStateCard` for `expired`, `superseded`, `invalid`, and for a thrown error ("temporary error" card, no detail). `ViewedBeacon` (`'use client'`) calls `recordViewAction(token)` once from an effect after mount and renders nothing; it is rendered only for `open`, `accepted`, `declined`.
- `PortalQuoteView({ token, quote }: { token: string; quote: PortalQuote })` (server component) shows, in the order of the portal reference image: banner and secure-quotation indicator, "Review your quotation" with `PORTAL_INTRO`, the information strip (number, `versionLabel`, client, project, issued, valid until, `clientStatusLabel`, amount and currency, VAT treatment), scope (project description, service inclusions, line descriptions as stored), the commercial summary from `buildCommercialSummary` (grouped or flat, totals from `view.totals`, `RECURRING_NOTE` only when grouped), the frozen terms with their template versions from `terms_sources`, and the response panel: **only** "Download PDF" (link to `/q/<token>/pdf`), `SLICE_ONE_RESPOND_NOTE`, and the "Questions about this quotation?" block with the owner's name and job title when present, falling back to `issuer` name, with the issuer website, email and phone. No Accept or Decline buttons exist in this slice. All text is rendered as React text nodes; no `dangerouslySetInnerHTML`. Desktop is two columns, mobile stacks.
- The PDF route (`runtime = 'nodejs'`): `isPortalToken`, `getPortalQuote`, 404 JSON unless state is `open`, `accepted` or `declined`, then `makeDocumentPdf('quote', toDocumentBundle(quote))` with the same response headers as `documentPdfResponse` plus `Referrer-Policy: no-referrer`.

- [ ] **Step 1: Write the failing tests** in `quote-portal-ui.test.ts`: `toDocumentBundle` produces a bundle whose `buildDocumentView` output has the quote's number, frozen issuer name and lines (use a fixture record); source guards for the page (calls `isPortalToken` before `getPortalQuote`; never calls `recordViewAction` directly; `ViewedBeacon` is a client component whose only effect calls the action; no `dangerouslySetInnerHTML` anywhere under `features/quote-portal` and `app/(portal)`); the PDF route returns 404 for non-viewable states; the response panel source contains no `Accept Quotation` or `Decline Quotation` text.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the files. Follow the existing sheet for typography and tokens (`styles/tokens.css`: navy `#0d2340`, soft blue `#edf3f8`, border `#dce2e8`); radius 0, flat borders.
- [ ] **Step 4:** Run the file and `pnpm typecheck`. Expected: pass.
- [ ] **Step 5: Browser check.** With a throwaway script in the scratchpad (service role, fixture organisation named `RLS portal-preview`), create a sent quote with a monthly retainer line, a once-off line and a zero-rated line, mint a link with the real `create_quote_access_link` function, then start the dev server (`pnpm dev` via `preview_start`; add a `.claude/launch.json` entry if there is none) and open `/q/<token>` at desktop and 375 px width. Confirm: the page renders, the PDF link downloads a PDF with the same number and total, a wrong token shows the "link not valid" card, `quote_access_links.first_viewed_at` is set after the page loads, and reloading with the network blocked for the beacon changes nothing. Delete the fixture with `cleanup()` from `tests/integration/rls/helpers.ts` and verify (Task 12's check).
- [ ] **Step 6:** Commit `feat(quote-portal): read-only portal page and PDF download`.

---

### Task 8: Email template and images

**Files:**
- Create: `lib/email/templates/safe.ts`, `lib/email/templates/quote.ts`, `tests/unit/quote-email-template.test.ts`, `public/brand/email-wordmark.png`, `public/brand/email-banner.jpg`
- Modify: `lib/email/templates/invitation.ts`

**Interfaces:** Produces:
- `safe.ts` exports `escapeHtml(value: string): string`, `sanitizeLine(value: string, maxLength?: number): string`, `assertSafeUrl(value: string, label: string): string` — moved out of `invitation.ts` unchanged (the label replaces the hard-coded "acceptUrl" in the error text); `invitation.ts` imports them and its existing tests pass untouched.
- `type QuoteEmailData = { quoteNumber: string; clientName: string; projectName: string | null; totalLabel: string; vatNote: string; validUntil: string | null; statusLabel: string; recipientName: string | null; personalNote: string; reviewUrl: string; pdfUrl: string; assetBaseUrl: string; sender: { name: string; role: string | null; company: string; website: string | null; email: string | null; phone: string | null } }`.
- `quoteEmailTemplate(data: QuoteEmailData, subject: string): EmailTemplate` — a 600 px table layout with inline styles and no scripts: navy header block with the company name as text and the wordmark image (`${assetBaseUrl}/brand/email-wordmark.png`, alt "HIMARK"), banner image (`email-banner.jpg`, alt text), heading `EMAIL_HEADING`, greeting ("Hello {recipientName}," or "Hello,"), the personal note as escaped paragraphs, a five-cell summary card (number, project, amount with `vatNote`, valid until, status), a table-cell "bulletproof" REVIEW QUOTATION button (navy, white text) to `reviewUrl`, an outline DOWNLOAD PDF button to `pdfUrl`, `EMAIL_NEXT_STEPS`, the sender block, and a hidden preheader. The text alternative contains the heading, the note, the details and both URLs.
- `public/brand/email-wordmark.png` (about 480 px wide) and `public/brand/email-banner.jpg` (about 1200 px wide, 150 KB or less) derived from the existing `himark-wordmark.png` and `banner.png`. Derive them with a throwaway script in the scratchpad that loads `sharp` from `node_modules/.pnpm/sharp@0.35.4_@types+node@24.10.4/node_modules/sharp` (it is not resolvable from the repo root; do not add it to `package.json`); touch no other file in `public/`.

- [ ] **Step 1: Write the failing tests** in `quote-email-template.test.ts`: the HTML contains the heading, "REVIEW QUOTATION" inside an anchor whose `href` equals `reviewUrl` and "DOWNLOAD PDF" with `pdfUrl`; no `<script` and no `javascript:`; the plain text contains both URLs and the quote number; `clientName` and `personalNote` of `<img src=x onerror=alert(1)>` and `"><a href=//evil>` appear only escaped; a 5,000-character note is included whole and escaped; a note with `\n\n` becomes separate paragraphs and a single `\n` becomes `<br>`; `subject` with CR or LF is collapsed to one line (use `sanitizeLine`); a `reviewUrl` of `javascript:alert(1)` or `ftp://x` throws; blocked-image fallback: the header cell has a navy `bgcolor` and the company name as text; every `<img` has a non-empty `alt`; a null `projectName`, `validUntil` and `recipientName` omit their cells or words without printing "null".
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `safe.ts`, refactor `invitation.ts` to import it, implement `quote.ts`, produce the two images.
- [ ] **Step 4:** Run the new test and `node --test --experimental-strip-types tests/unit/email-templates.test.ts`. Expected: pass. Check the two images are within the sizes above (`ls -l`).
- [ ] **Step 5:** Commit `feat(email): branded quote email template and email-sized brand images`.

---

### Task 9: Send action, defaults and form

**Files:**
- Create: `features/quote-portal/prepare-portal-email.ts`, `tests/unit/quote-portal-email-source.test.ts`
- Modify: `features/documents/actions/email.ts`, `features/documents/queries/get-email-defaults.ts`, `features/documents/components/email-document-form.tsx`, `features/documents/types.ts` (`CompanySettings.quote_portal_enabled?: boolean`), `tests/unit/documents-actions-source.test.ts`

**Interfaces:** Consumes Tasks 2 and 8. Produces (`prepare-portal-email.ts` is `import 'server-only'`; it, not the action, reads the environment):
- `preparePortalEmail(input: { db: any; quoteId: string; bundle: DocumentBundle; fields: EmailFields; senderName: string; senderUserId: string; organizationId: string }): Promise<{ template: EmailTemplate; linkId: string } | { error: string }>` — calls `rpc('create_quote_access_link', { p_quote_id, p_recipient_email: fields.to, p_recipient_name: bundle.record.contact_name ?? null })` (a database error is mapped with `documentErrorMessage`), reads the new link's id by its hash (sha256 hex of the token via `node:crypto`, selected under the member's own RLS), builds `reviewUrl = ${readAppUrl(process.env)}/q/<token>` and `pdfUrl = ${reviewUrl}/pdf`, reads the sender's `job_title` from `team_members` by `user_id`, builds `QuoteEmailData` from `buildDocumentView` (amount `view.currency + ' ' + view.totals.total`, VAT note "incl. VAT {rate}%", status `clientStatusLabel`) and returns `quoteEmailTemplate(data, fields.subject)`. The raw token is never logged or returned.
- `abandonPortalLink(db: any, linkId: string): Promise<void>` — `rpc('revoke_quote_access_link', { p_link_id, p_reason: 'email not sent' })`, errors logged without the token.
- The action: after the `> MAX_EMAIL_PDF_BYTES` check and before `await sendEmail(`, when `kind === 'quote' && bundle.record.status === 'Sent' && bundle.settings?.quote_portal_enabled === true` (an Accepted, Declined, Expired or Superseded quote gets the plain email as today, with no link), call `preparePortalEmail`; use its template, otherwise the existing `{ subject, text, html: emailHtml(body) }`. If the send throws or `!delivered`, call `abandonPortalLink` before returning the same messages as today. Exactly one `await sendEmail(` and one `record_document_email` remain.
- `getEmailDefaults` returns `{ to, subject, body, portal: boolean }` (`portal` is true under the same condition as the action: a `Sent` quote with the switch on); when portal is true `body` is `EMAIL_DEFAULT_NOTE` only (the template adds greeting and signature). `EmailDocumentForm` shows, when `defaults.portal`, the label "Personal note" and the help text "The secure quotation link and the PDF are added for you. Replies go to your own email address."

- [ ] **Step 1: Write the failing tests.** In `quote-portal-email-source.test.ts`: `preparePortalEmail` source calls the create function before building the template, never passes the token to `console`, and contains `readAppUrl(process.env)`; the action source contains `preparePortalEmail(` after `> MAX_EMAIL_PDF_BYTES` and before `await sendEmail(`, calls `abandonPortalLink` in the catch and the `!delivered` branches, still has exactly one `await sendEmail(`, and still has no `process.env`. Update `documents-actions-source.test.ts`: add `'preparePortalEmail('` to the ordered marker list between `> MAX_EMAIL_PDF_BYTES` and `await sendEmail(`, and relax the log-mode assertion to allow `{ await abandonPortalLink(...); return { error: 'Email is in log mode ...' } }` while keeping the exact message.
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both files plus `documents-email.test.ts` and `documents-ui.test.ts`. Expected: pass. `pnpm typecheck` passes.
- [ ] **Step 5:** Commit `feat(quote-portal): mint a link and send the branded email when the portal is on`.

---

### Task 10: The portal switch

**Files:**
- Create: `features/documents/actions/portal-switch.ts`, `features/documents/components/quote-portal-switch.tsx`, `tests/unit/quote-portal-switch.test.ts`
- Modify: `app/(unison)/settings/company/page.tsx`

**Interfaces:** Produces `setQuotePortalEnabledAction(_previous: ActionState, form: FormData): Promise<ActionState>` (`'use server'`): requires `roleHasPermission(role, 'company.manage')` ("Only an owner or admin can change this."); reads checkbox `enabled`; `update`s `organization_settings` by `organization_id`; if no row was updated returns `{ error: 'Save the company details first.' }`; revalidates `/settings/company` and the document pages. `QuotePortalSwitch` (`'use client'`) is a small form under the company details form explaining "When on, emailed quotes carry a secure link to a private page. Turn it on only when you are ready for clients to see it." and is disabled for non-editors.

- [ ] **Step 1: Write the failing test:** source guard that the action checks `company.manage` before touching the database, reads only `enabled`, and revalidates; the page passes `settings?.quote_portal_enabled ?? false` and `canEdit`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and `pnpm typecheck`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): owner/admin switch for the client portal`.

---

### Task 11: Staff panel and revising

**Files:**
- Create: `features/quote-portal/link-state.ts`, `features/quote-portal/queries/list-quote-links.ts`, `features/quote-portal/actions/links.ts`, `features/quote-portal/components/client-response-panel.tsx`, `tests/unit/quote-portal-staff.test.ts`
- Modify: `app/(unison)/commercial/quotes/[quoteId]/page.tsx`, `features/documents/components/document-actions.tsx`

**Interfaces:** Consumes Task 2. Produces:
- `linkState(link: { expires_at: string; revoked_at: string | null; revoked_reason: string | null }, now: Date): 'Active' | 'Expired' | 'Revoked' | 'Superseded' | 'Not sent'` (pure): revoked reason `superseded` → `Superseded`, `email not sent` → `Not sent`, any other revoked → `Revoked`, else expired when `now >= expires_at`, else `Active`.
- `listQuoteLinks(quoteId: string)`: member-session read of `quote_access_links` (recipient, created, expires, first and last viewed, revoked fields), newest first, plus the number of the quote it supersedes and of the quote that supersedes it.
- `revokeLinkAction(linkId: string, _previous: ActionState, _form: FormData)` and `reviseQuoteAction(quoteId: string, ...)` (`'use server'`): `isUuid` first; the database function decides; errors through `documentErrorMessage`; `reviseQuoteAction` redirects to the new draft like `duplicateQuoteAction`.
- `ClientResponsePanel({ quoteId })`: a `WorkspaceSection` "Client portal" listing links with `linkState`, "Opened" times (labelled "Opened", not "Read"), a Revoke button on active links, and the supersede chain; rendered after `EmailSection` in `QuoteWorkspace` only when the quote is not a draft. `DocumentActions` shows "Revise this quote" for quotes in `Sent`, `Declined` or `Expired` (beside "Duplicate as new draft").

- [ ] **Step 1: Write the failing tests:** `linkState` for each outcome, including the exact boundary (`now === expires_at` is Expired); source guards that both actions call `isUuid` before `documentContext`, call the matching `rpc` names, and `reviseQuoteAction` redirects; the panel source does not print any token or token hash.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it, `documents-ui.test.ts`, and `pnpm typecheck`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): client portal panel on the quote page and Revise this quote`.

---

### Task 12: Verification, docs and clean-up

**Files:**
- Modify: `docs/crm-roadmap.md`, `docs/follow-ups.md`, the spec's `Status` line

**Interfaces:** Consumes everything.

- [ ] **Step 1:** `pnpm typecheck`, `pnpm test`, `pnpm build`. Expected: all pass. Confirm the built `.nft.json` for `/q/[token]/pdf` lists `public/brand` files (as `documents-pdf.test.ts` describes).
- [ ] **Step 2:** `pnpm test:rls` (about five minutes, against production). Expected: every file passes, including the 28 in `provision-organization.test.ts`.
- [ ] **Step 3: Production residue check.** With the Supabase MCP `execute_sql` (read-only) run: `select (select count(*) from public.organizations where name like 'RLS %' or slug like 'rls-%'), (select count(*) from auth.users where email like 'rls-%@unison.test'), (select count(*) from public.quote_access_links), (select count(*) from public.quotes where status = 'Superseded')`. Expected: 0, 0, 0 and 0, apart from rows the owner created. Then compare `select count(*) from public.audit_events where organization_id is null` with the value before this work (1,320 on 2026-10-18); any increase is fixture residue from this plan's tests and must be traced and deleted by id.
- [ ] **Step 4:** Add a roadmap line under Stage 2 for slice 1 ("built, behind a switch that is off; waiting for one real send to the owner's own address") and a "From the quote portal, slice 1" section in `docs/follow-ups.md` listing what is not verified or not built: Outlook and Gmail rendering unverified; no Accept or Decline buttons until slice 2; `quote.superseded` timeline entries arrive with slice 2; old quotes show a flat commercial list; the token appears in platform request logs; `types/database.ts` is stale; email images derived from the banner. Set the spec status to "Slice 1 built".
- [ ] **Step 5:** Commit `docs: record quote portal slice 1`. Report to the owner what to do next: turn the switch on under Settings, Company details, and email one real quote to their own address.
