# Quote portal, slice 3: the HIVE feed gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner or admin can switch on a rule that makes the existing HIVE client feed (`GET /api/v1/clients`) return a client only while it has an Accepted quote, behind an off-by-default setting, with the effect shown before it is switched on and the feed status shown on the quote page.

**Architecture:** One new setting on `organization_settings`; `get_clients_for_api_key` is replaced so that, only when the setting is on, a client is returned while it has at least one non-archived Accepted quote and `updated_since` / `updatedAt` use the later of the client's own `updated_at` and its latest `accepted_at`. A single private SQL helper defines "has an accepted quote" for both the feed and a new member-readable status function. The setting and its impact preview live on Settings > Integrations next to the feed keys; the quote page gets a one-line feed status.

**Tech Stack:** Next.js 16.3.4 (App Router, server actions), Supabase Postgres (definer functions), `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-18-quote-portal-design.md` ("Slice 3: HIVE feed gate", plus the owner's decisions: HIVE has no endpoint that receives anything from UNISON; it only pulls `GET /api/v1/clients`, so this is a gate on that feed, never a push). Boundary spec: `docs/superpowers/specs/2026-10-13-client-focused-boundary-design.md` ("The API for HIVE"). Slices 1 and 2 are built and merged (`docs/follow-ups.md`, "From the quote portal, slice 1/2").

## Global Constraints

- **Production is the only database.** The Supabase project `unison-uat` (`nwdzpjzllhhqwawmsxjd`) is live production and `pnpm test:rls` runs against it. Every fixture row, including audit rows, must be deleted and verified gone (Task 5 has the check). Migrations are append-only and are applied with the Supabase MCP `apply_migration` before the tests that need them. **Before Task 1, record the baseline** with `execute_sql`: `select count(*) from public.audit_events where organization_id is null` (expected 1320 on 2026-10-25), and, for the real organisation, `select id, organization_id, name, last_used_at, revoked_at from public.client_api_keys order by created_at`. Write both in the Task 1 commit message body.
- **The real HIVE key is never used.** No test, script or check may call `get_clients_for_api_key` with a production key or change `client_api_keys` rows that are not the test's own (a call stamps `last_used_at`, which tells the owner when HIVE last read the feed). Tests make their own organisation and their own key. Task 5 proves the real key's `last_used_at` is unchanged.
- **Git:** stage by explicit path only (never `git add -A`, `git checkout .`, `git restore .`, `git stash`, `git clean`). Commit on this branch; never push or merge.
- **Next.js 16 differs from older versions.** Before writing server action or page code read the matching guide in `node_modules/next/dist/docs/`.
- **Shipping changes nothing for HIVE.** The new setting defaults to false. With it false, `get_clients_for_api_key` returns exactly what it returns today: the same keys, the same values (`updatedAt` is the client's own `updated_at`), the same order, paging and filtering. A characterisation test written **before** the migration, and passing before and after it, proves this.
- **The response shape never changes,** on or off. Nothing about quotes is added to the feed.
- **The function keeps its security:** `security definer`, `set search_path = ''`, `volatile` (it stamps `last_used_at`), `revoke execute ... from public`, `grant execute ... to anon` (the key is checked inside). The new migration restates those lines.
- **Wording:** UNISON can only say whether a client would appear in the feed and when HIVE last read it. It never says "handed off", "sent", "synced", "completed" or "failed". HIVE keeps what it already read; whether it removes a client that leaves the feed is HIVE's behaviour.
- **No new environment variables, no new dependencies, no new file that imports `lib/supabase/admin`.** `proxy.ts` and `app/api/v1/clients/route.ts` do not change (a comment in the route may).
- **House style:** `'use server'` files export only async functions; modules unit-tested by `node --test` use relative `.ts` imports, no `@/`, no `server-only`, no directive; database clients are untyped (`as any`); no raw invisible/bidi characters in source files; read `AGENTS.md`.
- **Test commands:** unit `node --test --experimental-strip-types tests/unit/<file>.test.ts`; database `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/<file>.test.ts` (`.env.local` exists in this worktree and is gitignored). Run database test files one at a time.

## Review Focus

Failure modes the spec implies that no feature task would otherwise test, most likely first. Each has a test in the task named.

1. **Off means identical.** With the setting off the feed's keys, values, order, paging, `updated_since` filtering and `updatedAt` are exactly today's (Task 1, characterisation written first and passing before and after the migration).
2. **An acceptance reaches an incremental pull.** A client whose own row did not change, but which became eligible after HIVE's last pull, is returned by an `updated_since` pull taken after that acceptance, with `updatedAt` equal to the acceptance time (Task 1).
3. **Eligibility is exactly "a non-archived Accepted quote of this client in this organisation".** Sent, Declined, Expired, Superseded, Draft, an archived Accepted quote, another client's Accepted quote and another organisation's Accepted quote never make a client eligible; an Accepted quote moved back by staff makes the client leave; an Accepted quote set by hand counts the same as one accepted on the portal (Tasks 1, 2).
4. **Paging stays correct under the filter.** Cursor and limit across a mix of eligible and ineligible clients return no repeats and no gaps, and `nextCursor` is null exactly at the end (Task 1).
5. **The switch is owner/admin only, cannot be enabled by accident, and shows its effect first.** A member cannot change it; enabling needs the explicit acknowledgement that HIVE's maintainers have been told (enforced on the server, not just in the browser); a missing settings row says so; the page shows how many clients would remain before the switch is turned on (Tasks 1, 3).

---

### Task 1: The setting and the gate in the feed

**Files:**
- Create: `supabase/migrations/20261025100000_hive_feed_gate.sql`, `tests/integration/rls/client-feed-gate.test.ts`
- Modify: `tests/unit/client-feed.test.ts` (a source guard for the new migration), `app/api/v1/clients/route.ts` (a comment only)

**Interfaces:** Produces, in one migration:
- `organization_settings.hive_feed_requires_accepted_quote boolean not null default false`. Existing policies already limit updates to owners and admins (`organization_settings_update`); no policy changes.
- `private.client_accepted_quotes(p_organization_id uuid, p_client_id uuid) returns table (accepted_count integer, accepted_since timestamptz, latest_accepted_at timestamptz)` — `language sql stable`, `set search_path = ''`, revoked from `public, anon, authenticated`. It is the one definition of eligibility: the client's quotes in that organisation with `status = 'Accepted'` and `archived_at is null`; one row always (zero count and nulls when none); `accepted_since = min(accepted_at)`, `latest_accepted_at = max(accepted_at)`.
- `public.get_clients_for_api_key(p_key text, p_updated_since timestamptz default null, p_cursor uuid default null, p_limit integer default 100) returns jsonb` replaced from its newest definition (`20261014120000_client_feed_primary_contact.sql`; copy it, change only what follows). It reads the key's organisation's setting once. **Setting off:** identical to today. **Setting on:** a client is a candidate only when `accepted_count > 0`; the `updated_since` comparison and the returned `updatedAt` use `greatest(c.updated_at, coalesce(latest_accepted_at, c.updated_at))`; ordering by id, the cursor, the limit, `nextCursor` and every other field are unchanged. The eligibility join uses `private.client_accepted_quotes` (a lateral join).

- [ ] **Step 1: Write the characterisation tests first** in `client-feed-gate.test.ts` (fixtures: a throwaway organisation made with `createFixtureOrg`, an `organization_settings` row, five clients incl. one archived and one with a contact, a second organisation with a client, and keys made through `create_client_api_key` called with the service role — if the service role cannot execute it, insert the key row with the service role using `encode(extensions.digest(...))`'s equivalent `sha256` hex of a generated `unk_` key; the function is called through an anon client like the route does). These pass against the **current** function, and must still pass after the migration:
  - `'with the setting at its default every client of the key's organisation is returned in id order with exactly the documented keys'` (assert the full key set of one client object and of `billingAddress` and of a contact; the archived client has `archived: true`; `updatedAt` equals the row's `updated_at`; none of the other organisation's clients appear).
  - `'updated_since keeps clients whose own updated_at is at or after it'`; `'a limit pages by id and nextCursor is null exactly at the end'` (5 clients, limit 2: pages of 2, 2, 1; no repeats); `'an unknown, an empty and a revoked key give null, and a live key's last_used_at is stamped'` (assert on the test's own key row only).
- [ ] **Step 2:** Run the file against the current database. Expected: PASS (this is the proof of "today's behaviour"; if anything here fails, the test is wrong, not the function: fix the test).
- [ ] **Step 3: Write the gate tests** (same file; failing now):
  - `'the setting is false by default; a member cannot change it and an owner and an admin can'` (members through `createFixtureUser` + `signedInClient`; the member's update affects no row or fails; the owner's succeeds).
  - `'with the setting on only clients with a non-archived Accepted quote are returned'`: Accepted set by a member by hand, Accepted inserted with an explicit `accepted_at`, and the quote's Accepted status set through the service role all count; **no** eligibility from Sent, Declined, Expired, Superseded, Draft, an archived Accepted quote, another client's Accepted quote, or another organisation's Accepted quote for a client of the same name.
  - `'an Accepted quote moved back to Sent makes its client leave the feed; moved forward again it returns'`.
  - `'a client accepted after HIVE's last pull is returned by an updated_since pull even though its own row did not change, with updatedAt equal to the acceptance time; with the setting off that pull does not return it'` (client `updated_at` earlier than the cutoff, `accepted_at` later).
  - `'updatedAt is the later of the client's updated_at and its latest accepted_at, and the response keys are identical to the setting-off keys'`.
  - `'cursor paging across a mix of eligible and ineligible clients returns every eligible client once and nextCursor is null at the end'` (6 clients, 4 eligible, limit 2 and limit 3).
  - `'turning the setting off again restores the full feed'`.
- [ ] **Step 4:** Run the file. Expected: the characterisation tests PASS, the gate tests FAIL (column missing).
- [ ] **Step 5:** Write the migration. Add a source guard in `tests/unit/client-feed.test.ts`: the new migration restates `revoke execute on function public.get_clients_for_api_key(text, timestamptz, uuid, integer) from public` and `grant execute ... to anon`, keeps `security definer` and `set search_path = ''`, and the setting column is `not null default false`. In the route, extend the comment above `GET` to say the feed may be narrowed by `organization_settings.hive_feed_requires_accepted_quote` (no code change).
- [ ] **Step 6:** Apply with `apply_migration` (name `hive_feed_gate`). Run the new file and `node --test --experimental-strip-types tests/unit/client-feed.test.ts`. Expected: all pass. Run the residue check (no `RLS %` organisations, no `rls-%@unison.test` users, null-organisation audit count back to its baseline, the real key's `last_used_at` unchanged).
- [ ] **Step 7:** Commit `feat(hive-feed): the accepted-quote gate on the client feed, off by default`.

---

### Task 2: Feed status for staff

**Files:**
- Create: `supabase/migrations/20261025101000_hive_feed_status.sql`, `tests/integration/rls/client-feed-status.test.ts`

**Interfaces:** Consumes Task 1's setting and `private.client_accepted_quotes`. Produces `public.get_hive_feed_status(p_organization_id uuid, p_client_id uuid default null) returns jsonb` — `language plpgsql stable security definer set search_path = ''`, `revoke ... from public, anon`, `grant execute ... to authenticated`. It raises `42501` unless `auth.uid()` is not null and `public.is_member_of(p_organization_id)`. It returns:
`{ "gate_enabled": boolean, "has_live_key": boolean, "last_read_at": timestamptz | null, "client": null | { "included": boolean, "since": timestamptz | null }, "summary": null | { "total_clients": integer, "with_accepted_quote": integer } }`.
- `has_live_key`: the organisation has a key that is not revoked; `last_read_at`: the latest `last_used_at` over those keys (null if none or never used).
- `client` is returned only when `p_client_id` belongs to the organisation (otherwise null, never an error and never data about another organisation): `included` is true when the gate is off, else true when the client has an accepted quote; `since` is the client's `accepted_since` when the gate is on and it is included, else null.
- `summary` is returned only to an owner or admin (`public.has_role(p_organization_id, array['owner','admin'])`), else null: counts over the organisation's clients **regardless of the gate** (`with_accepted_quote` = what the feed would return if the gate were on).

- [ ] **Step 1: Write the failing tests:** `'a non-member and anon are refused'`; `'a member gets the status and a client line but no summary; an owner and an admin also get the summary'`; `'with the gate off every client is included and has no since date'`; `'with the gate on a client without an accepted quote is not included, and one with accepted quotes is included since the earliest accepted_at of its non-archived Accepted quotes'`; `'an archived Accepted quote and another client's Accepted quote do not count'`; `'last_read_at is the latest last_used_at over live keys, null when never used, and a revoked key is ignored; has_live_key is false with no live key'`; `'a client id of another organisation, or one that does not exist, gives client null'`; `'the summary counts do not depend on the gate'`; `'the function leaks no key, no key hash and no name'` (assert the returned key set).
- [ ] **Step 2:** Run the file. Expected: FAIL (function missing).
- [ ] **Step 3:** Write the migration (use `private.client_accepted_quotes`; do not re-derive eligibility).
- [ ] **Step 4:** Apply with `apply_migration` (name `hive_feed_status`). Run the file and `client-feed-gate.test.ts`. Expected: pass. Residue check as in Task 1.
- [ ] **Step 5:** Commit `feat(hive-feed): a feed status for staff`.

---

### Task 3: The switch and its preview on Settings > Integrations

**Files:**
- Create: `features/platform-automation/components/client-feed-gate.tsx`, `tests/unit/client-feed-gate-ui.test.ts`
- Modify: `features/platform-automation/client-feed-actions.ts`, `features/platform-automation/client-feed-queries.ts`, `features/platform-automation/components/platform-pages.tsx`

**Interfaces:** Consumes Tasks 1 and 2. Produces:
- `getClientFeedGate(): Promise<{ enabled: boolean; hasLiveKey: boolean; lastReadAt: string | null; totalClients: number; withAcceptedQuote: number } | null>` in `client-feed-queries.ts`: owner/admin only (`null` for anyone else, like `listClientFeedKeys`); reads `organization_settings.hive_feed_requires_accepted_quote` through the member's own client and `get_hive_feed_status` for the rest.
- `setClientFeedGateAction(_previous: ClientFeedGateState, form: FormData): Promise<ClientFeedGateState>` in `client-feed-actions.ts` (`'use server'`; export the state type from a non-action module or inline it): the session first, owner/admin check (`requireAdministrator`'s rule) before any database call; reads only `enabled` (checkbox present means true) and `acknowledged`; whenever `enabled` is present and `acknowledged` is absent the action refuses, before any database call, with `Tick the box to confirm that HIVE's maintainers have been told.` (no read of the current value is needed, so the action still makes exactly one database call); otherwise `update organization_settings set hive_feed_requires_accepted_quote = <bool> where organization_id = <session org>` `.select('id')`; a database error gives a generic message and logs the detail; no row updated says `Save the company details first.`; success revalidates `/settings/integrations` and says, on: `Only clients with an accepted quote are now included in the HIVE client feed.`; off: `The HIVE client feed includes every client again.` (state shape `{ error?: string; success?: string } | undefined`).
- `ClientFeedGate({ gate }: { gate: NonNullable<Awaited<ReturnType<typeof getClientFeedGate>>> })` (`'use client'`), rendered by `IntegrationsPage` between the connection register and the key table, only when the viewer can manage: a "HIVE client feed" section with the explanation (`By default HIVE reads every client of this organisation. Turn this on to include only clients with an accepted quote.`), the effect line (`Today N of M clients have an accepted quote. Turning this on removes the other M−N from the feed. HIVE keeps anything it has already read.`; when `hasLiveKey` is false add `No feed key is active yet, so nothing is reading the feed.`; the last-read line `HIVE last read the feed <date time>` or `HIVE has not read the feed yet`), the checkbox `Only include clients with an accepted quote`, and — shown whenever the first checkbox is ticked, and pre-ticked only when the saved setting is already on (it was acknowledged when it was switched on, so re-saving does not ask again) — the second checkbox, labelled exactly `I have told HIVE's maintainers that the feed will include only clients with an accepted quote`. Plain wording only: nothing says handed off, sent, synced or completed.

- [ ] **Step 1: Write the failing tests** (`client-feed-gate-ui.test.ts`, source-regex house style as `tests/unit/quote-portal-switch.test.ts`, plus pure checks where a helper is extracted): the action module is `'use server'` with only async exports; the session and the owner/admin check precede the first database call; exactly one database call; the form reads only `enabled` and `acknowledged`; enabling without `acknowledged` is refused before the database; the update is scoped to the session organisation and selects `id`; error vs missing-row order (error first); the exact success and error sentences; the query returns `null` for non-admins; the component never contains the words `handed off`, `synced`, `completed` or `failed`; the acknowledgement checkbox exists and its default is the saved setting (`defaultChecked={gate.enabled}`), so it starts unticked while the setting is off; the page renders the gate only when `access.canManage`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Format `lastReadAt` in South African time like `client-feed-keys.tsx`.
- [ ] **Step 4:** Run it, `node --test --experimental-strip-types tests/unit/client-feed.test.ts`, and `pnpm typecheck`. Expected: pass.
- [ ] **Step 5:** Commit `feat(hive-feed): owner and admin switch with an impact preview`.

---

### Task 4: The feed status on the quote page

**Files:**
- Create: `features/platform-automation/feed-status.ts` (pure), `features/platform-automation/components/hive-feed-status.tsx`, `tests/unit/hive-feed-status.test.ts`
- Modify: `app/(unison)/commercial/quotes/[quoteId]/page.tsx` (mount the component after `ClientResponsePanel`)

**Interfaces:** Consumes Task 2. Produces:
- `feedStatusLines(status: { gateEnabled: boolean; hasLiveKey: boolean; lastReadAt: string | null; client: { included: boolean; since: string | null } | null }): { headline: string; detail: string | null } | null` (pure; relative imports): `null` when there is no live key or no client; gate off: headline `The HIVE client feed currently includes every client.`; gate on and included: `Included in the HIVE client feed since <date>.`; gate on and not included: `Not included in the HIVE client feed (no accepted quote).`; `detail` is `HIVE last read the feed <date time>.` or `HIVE has not read the feed yet.`; dates in South African time.
- `HiveFeedStatus({ quoteId })` (server component): reads the quote's `client_id` and organisation through the member's session, calls `get_hive_feed_status`, renders `feedStatusLines` in a small bordered panel titled "HIVE client feed" (no heading when it renders nothing); a failed read renders nothing and logs one line without data.

- [ ] **Step 1: Write the failing tests:** `feedStatusLines` for each case above (no live key → null, no client → null, gate off, on-included with a date, on-not-included, last read vs never read, an unreadable date does not throw); a source guard that the component calls only `get_hive_feed_status`, never selects key columns, contains none of the forbidden words, and that the page mounts it after `ClientResponsePanel`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and `pnpm typecheck`. Expected: pass.
- [ ] **Step 5:** Commit `feat(hive-feed): the feed status on the quote page`.

---

### Task 5: Verification and walk-through

**Files:** none (a report only).

**Interfaces:** Consumes everything.

- [ ] **Step 1:** `pnpm typecheck`, `pnpm test`, `pnpm build`. Expected: all pass. Delete the gitignored `.next` folder before any later `pnpm dev` (a stale one made `/q/<token>` 404 in slice 2).
- [ ] **Step 2:** `pnpm test:rls` (about thirty minutes, against production). Expected: every file passes including the two new ones.
- [ ] **Step 3: Walk it in the browser** (controller): make a throwaway organisation with the portal fixtures helper (`tests/integration/rls/portal-fixtures.ts`: `setupPortalOrg`), add a feed key and a second client with an Accepted quote through the service role, run `pnpm dev --port 3002` with `EMAIL_TRANSPORT=log`, and check with the browser pane that Settings > Integrations shows the section, the correct counts and the acknowledgement requirement, and that turning it on and off works for the owner, and that the quote page shows each of the three status lines. The throwaway organisation's login passwords are known only to the fixtures helper: have the walk-through script create the fixture user, and sign in through the app's sign-in page with those test credentials; if that is not possible, say so and rely on the tests. Remove every fixture afterwards.
- [ ] **Step 4: Production residue check** with `execute_sql` (read-only): no `RLS %` organisations or `rls-%@unison.test` users, null-organisation audit count equal to its baseline, `select count(*) from public.organization_settings where hive_feed_requires_accepted_quote` equal to 0 for the real organisation, and the real key's `last_used_at` unchanged from the baseline.
- [ ] **Step 5:** Report; no commit (the later tasks' docs land after the final review).

---

### Task 6: Docs (after the final whole-branch review)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-client-focused-boundary-design.md`, `docs/follow-ups.md`, `docs/crm-roadmap.md`, `docs/superpowers/specs/2026-10-18-quote-portal-design.md` (Status line)

**Interfaces:** Consumes everything.

- [ ] **Step 1:** In the boundary spec's "The API for HIVE" section add a short subsection "Narrowing the feed (optional)" stating: the setting `organization_settings.hive_feed_requires_accepted_quote` (default false, set by an owner or admin in Settings > Integrations); the rule when on (a client is returned only while the organisation has at least one non-archived Accepted quote for it, by either the portal or staff); that `updatedAt` and `updated_since` then use the later of the client's own `updated_at` and its latest `accepted_at`; that the response shape does not change; that a client whose Accepted quote is moved back leaves the feed, and that UNISON cannot make HIVE forget a client it has already read; and that the setting stays off until HIVE's maintainers have been told.
- [ ] **Step 2:** In `docs/follow-ups.md` add "From the quote portal, slice 3 (2026-10-25)": a **"Read before you switch the feed gate on"** block (turning it on narrows a live contract; as of 2026-10-18 production had two active clients and none with an Accepted quote, so switching on with those numbers empties the feed; tell HIVE's maintainers first; the page shows today's counts), the production changes already live (two migrations, additive, default off, the real key untouched), what was verified, not verified (HIVE's own behaviour when a client leaves the feed; the real HIVE pull), known limits, and the owner's open decisions (the acknowledgement checkbox, showing the status line only when a live key exists).
- [ ] **Step 3:** In `docs/crm-roadmap.md` add the slice 3 line under Stage 2 in the style of the slice 1 and 2 lines and mark the quote portal as complete (all three slices built); set the spec's `Status` to `Slices 1, 2 and 3 built (<date>)`.
- [ ] **Step 4:** Commit `docs: record quote portal slice 3`.

---

## Calls made in this plan (for review)

Where the spec is silent. Say if any should change.

1. **The switch lives in Settings > Integrations,** beside the feed keys (the spec says only "behind its own setting"), and is owner/admin only.
2. **Enabling needs an acknowledgement** that HIVE's maintainers have been told, enforced on the server. The spec says the setting stays off until they have been told; this makes that a deliberate click.
3. **The page shows the effect before the switch is turned on** (`N of M clients have an accepted quote today`), computed regardless of the gate, because switching on with today's data would empty the feed.
4. **The quote-page status line appears only when a live feed key exists** and the quote has a client; with no key nothing reads the feed and a line would be noise.
5. **"Included since" is the earliest `accepted_at` among the client's non-archived Accepted quotes.**
6. **`get_hive_feed_status` is readable by any member** for the client line and `last_read_at`; only owners and admins get the organisation counts.
7. **One private SQL helper defines eligibility** for both the feed and the status function so they cannot drift.
8. **The route and proxy do not change** (no new endpoint, no `GET /api/v1/clients/{id}`, which the boundary spec mentions but the repo has never had).
