# Quote portal, slice 2: accept and decline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client who holds a valid portal link can accept or decline the quote on the portal after confirming an emailed six-digit code; the decision is recorded append-only, the quote's status follows it, the owner is told, the client gets an acknowledgement, and a decline creates a recovery follow-up for the owner.

**Architecture:** Two new service-role-only database functions do the work (`portal_issue_code`, `portal_decide`); `portal_decide` takes a row lock on the quote and does every check, the write, the status change and the follow-ups in one transaction. The existing `lib/quote-portal/portal-client.ts` gains two calls; two server actions send the code and carry the decision; emails go out after the decision has committed. The portal's response panel gets the Accept/Decline flow; the staff panel shows the recorded response.

**Tech Stack:** Next.js 16.3.4 (App Router, server actions), Supabase Postgres (definer functions, pgcrypto in `extensions`), Microsoft Graph mail, `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-18-quote-portal-design.md` (read "Slice 2", "Security, evidence and legal" and the appendix first; the appendix holds the client-facing copy). Slice 1 is built and merged (plan `docs/superpowers/plans/2026-10-18-quote-portal-slice-1.md`; read the "For slice 2" notes in `docs/follow-ups.md`). Slice 3 (HIVE feed gate) is a separate plan.

## Global Constraints

- **Production is the only database.** The Supabase project `unison-uat` (`nwdzpjzllhhqwawmsxjd`) is live production, and `pnpm test:rls` runs against it. Every fixture row, including audit rows, must be deleted and verified gone (Task 11 has the check). Migrations are append-only and are applied with the Supabase MCP `apply_migration` before the tests that need them. Before Task 1, record the baseline `select count(*) from public.audit_events where organization_id is null` and write it in the Task 1 commit message body.
- **Git:** stage by explicit path only (never `git add -A`, `git checkout .`, `git restore .`, `git stash`, `git clean`). Commit on this branch; never push or merge.
- **Next.js 16 differs from older versions.** Before writing server action or `headers()` code read the matching guide in `node_modules/next/dist/docs/`. `params` are Promises.
- **No new environment variables, no new dependencies, no new file that imports `lib/supabase/admin`.** `lib/quote-portal/portal-client.ts` stays the only portal file holding the service role (the allowlist in `tests/unit/service-role-boundary.test.ts` does not change). `portal_issue_code` and `portal_decide` are granted to `service_role` only; nothing is granted to `anon`.
- **The code:** six digits from a cryptographic source (`extensions.gen_random_bytes`, never `random()`), stored only as `sha256(salt || ':' || code)` hex with its own random salt; expires 10 minutes after issue; 5 attempts per code; 5 code requests per link per hour; the code is emailed only to the link's `recipient_email` (never to an address the browser supplies) and is bound to its link.
- **A link alone can only view.** Rendering `/q/<token>` and fetching its PDF change nothing; the only writes are the two server actions, invoked by a button press.
- **One decision per link, one final decision per quote.** The quote's status is authoritative for the page; "one decision per link" is a unique constraint; both apply.
- **`quote_responses` is append-only** for every role including the service role (a trigger refuses update, delete and truncate), except that rows go with their quote or organisation.
- **Refusals are returned, not raised,** wherever the database must keep a write made before the refusal (a failed code attempt is counted).
- **Emails come after commit and are best effort;** a failed email never undoes a decision. A code, a token or an address never appears in an error message or log line (the dev-only `EMAIL_TRANSPORT=log` prints the code email's text on purpose so the flow can be exercised locally; the link token is still redacted there).
- **Copy:** spec-appendix wording is used verbatim; the strings the appendix does not give are drafted in `features/quote-portal/copy.ts` and listed under "Calls made in this plan". `copy.ts` is the only home of client-facing copy.
- **Consent wording:** accept: "I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions." (unchecked by default).
- **House style:** `'use server'` files export only async functions; modules unit-tested by `node --test` use relative `.ts` imports, no `@/`, no `server-only`, no directive; database clients are untyped (`as any`); read `AGENTS.md`.
- **Test commands:** unit `node --test --experimental-strip-types tests/unit/<file>.test.ts`; database `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/<file>.test.ts` (`.env.local` already exists in this worktree and is gitignored).

## Review Focus

Failure modes the spec implies that no feature task would otherwise test, most likely first. Each has a test in the task named.

1. A double click, two tabs or a retry submitting the same decision at once records exactly one response and one set of follow-ups; the second answer is the recorded outcome and sends no second email (Tasks 4, 5, 8).
2. A wrong code is refused **and counted** (the refusal must not roll the count back); the sixth attempt with the right code, an expired code, an older code after a new one was issued, and a code issued for another link never decide (Task 4).
3. A decision that races a staff action or another recipient (quote moved to Expired, Superseded, Accepted by hand or archived; link revoked; a line changed after the page loaded; an accept and a decline from two links at once) is refused and writes nothing (Task 4).
4. Hostile signatory text (markup, `\r\nBcc:`, 10,000 characters, bidi override characters) never reaches a mail header, a page or an email unescaped, and never makes the decision fail in a way that loses it (Tasks 4, 6, 7, 10).
5. An email failure never undoes a decision, and an owner without a login still hears about it by email while only people with logins get an in-app notice (Tasks 5, 8).

---

### Task 1: Tables for codes and responses

**Files:**
- Create: `supabase/migrations/20261020100000_quote_portal_decisions_schema.sql`, `tests/integration/rls/quote-portal-decisions-schema.test.ts`
- Modify: `tests/integration/rls/anon-privileges.test.ts` (add `'quote_access_codes'` and `'quote_responses'` to `TABLES`)

**Interfaces:** Produces:
- `quote_access_codes(id, organization_id → organizations on delete cascade, link_id → quote_access_links(id) on delete cascade, code_salt text, code_hash text, created_at default now(), expires_at timestamptz not null, attempts smallint not null default 0 check (attempts between 0 and 5), consumed_at timestamptz null)`; index `(link_id, created_at desc)`. RLS on, **no policy, no grant** to `anon` or `authenticated` (`revoke all`): only definer functions and the service role touch it.
- `quote_responses(id, organization_id → organizations on delete cascade, quote_id, link_id → quote_access_links(id) `deferrable initially deferred` with no cascade action (an immediate check would fail when a quote delete removes the links before the responses), decision text check in ('accepted','declined'), decided_at timestamptz not null default now(), signatory_name, signatory_position, signatory_organisation, verified_email, consent_text text not null, consent_given boolean not null check (consent_given), code_verified_at timestamptz not null, snapshot_hash text check (snapshot_hash ~ '^[0-9a-f]{64}$'), terms_sources jsonb null, quote_number text not null, quote_version integer not null, ip_address text null check (char_length(ip_address) <= 64), user_agent text null check (char_length(user_agent) <= 300), decline_reason text null check in ('Budget considerations','Timing is not right','Scope does not meet our requirements','Internal approval pending','Chose another provider','Other'), decline_comments text null)`; `unique (link_id)`; composite FK `(quote_id, organization_id) → quotes(id, organization_id)` on delete cascade; check `decision = 'declined' or (decline_reason is null and decline_comments is null)`. RLS: select for `is_member_of(organization_id)`; `revoke all ... from anon, authenticated` then `grant select ... to authenticated`.
- Triggers on `quote_responses`: `before update` always raises `QUOTE_RESPONSE_APPEND_ONLY` (23514); `before delete` raises the same unless `pg_trigger_depth() > 1` (a cascade from the quote or organisation runs inside the referential trigger; a direct delete does not); `before truncate` (statement level) raises it. All three apply to the service role.

- [ ] **Step 1: Write the failing tests** (fixtures: two orgs with a member each; a Sent quote and a link as in `quote-portal-read.test.ts`; rows inserted with the service role):
  - `'a member reads their organisation's responses, never another's, and cannot write one'`; `'anon has no privileges on quote_responses and quote_access_codes'` (table-privilege message, as `anon-privileges.test.ts`); `'a member cannot read quote_access_codes at all'` (permission denied, not an empty list).
  - `'a response cannot be updated or deleted, even by the service role'` (both fail with `QUOTE_RESPONSE_APPEND_ONLY`); `'truncate is refused'`.
  - `'deleting the quote, and deleting the organisation, removes its responses and codes'`.
  - `'a link that has a response cannot be deleted on its own'` (service-role delete of the link fails at commit; deleting its quote still succeeds);
  - `'one decision per link'` (second insert for the same link fails 23505); `'decline fields are refused on an accepted response'`; `'a decision outside accepted and declined, and a reason outside the six, are refused'`; `'attempts cannot exceed 5'`.
- [ ] **Step 2:** Run the file. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write the migration (follow the style of `20261018100000_quote_portal_schema.sql`: comments, then `revoke all` / explicit grants). Add both tables to the anon test.
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_decisions_schema`). Run the new file and `anon-privileges.test.ts`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(quote-portal): tables for confirmation codes and the append-only decision record`.

---

### Task 2: Timeline entries for declined and superseded quotes

**Files:**
- Create: `supabase/migrations/20261020101000_quote_portal_timeline.sql`, `tests/integration/rls/quote-portal-timeline.test.ts`
- Modify: `features/crm-workspace/vocabulary.ts` (append `'quote.declined'`, `'quote.superseded'` to `SYSTEM_ACTIVITY_KINDS` after `'billing.document_built'`; labels `Quote declined`, `Quote superseded`), `tests/unit/crm-workspace-vocabulary.test.ts` only if it pins the list by value

**Interfaces:** Produces, in one migration:
- `activities_kind_check` redefined (drop and re-add, same single-line form as `20261012110000_client_engagements.sql:133` so the vocabulary test's regex still finds it) with the 20 existing kinds plus `'quote.declined'`, `'quote.superseded'`, in that order.
- `public.log_quote_milestones()` replaced: the body of `20261010120000_crm_quote_entries_hygiene.sql` unchanged, plus one branch: when `new.status = 'Declined'` and (`tg_op = 'INSERT'` or `old.status is distinct from 'Declined'`) insert `kind 'quote.declined'`, subject `'Quote ' || new.quote_number || ' declined'`, `created_by public.activity_actor(new.organization_id)`, `quote_id new.id`. Grants unchanged (revoked from `public, anon, authenticated`).
- `public.quotes_supersede_original()` replaced: the **newest** definition, in `20261018103000_quote_portal_supersede_same_client.sql` (it supersedes only a same-client original), unchanged, plus, after the original is set to `Superseded`, an `activities` row on the original: kind `'quote.superseded'`, subject `'Quote ' || <original number> || ' replaced by ' || new.quote_number`, actor `activity_actor`, `quote_id` the original.
- Verified 2026-10-20 in a rolled-back probe on production: with no signed-in user (`auth.uid()` null, `current_user` postgres) a Sent quote can be set to Accepted or Declined, `accepted_at` is set, and the existing trigger writes `quote.accepted` with `created_by` null. The timeline already renders a null author.

- [ ] **Step 1: Write the failing tests:** `'a hand-set Declined writes one quote.declined entry by the member'`; `'Declined, reopened to Sent and declined again writes a second entry'`; `'sending a revision writes quote.superseded on the original, naming the revision'`; `'an Accepted original that is revised gets no superseded entry'`; `'a revision for a different client supersedes nothing and writes no entry'`; the vocabulary test passes with the two new kinds.
- [ ] **Step 2:** Run the new file and `node --test --experimental-strip-types tests/unit/crm-workspace-vocabulary.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the migration and edit the vocabulary.
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_timeline`). Run both files again. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): declined and superseded entries on the quote timeline`.

---

### Task 3: Snapshot hash, response flag and confirmation codes

**Files:**
- Create: `supabase/migrations/20261020102000_quote_portal_code_functions.sql`, `tests/integration/rls/quote-portal-codes.test.ts`, `tests/integration/rls/portal-fixtures.ts` (the fixture helpers `quote-portal-read.test.ts` defines inline — `setupPortalOrg()`, `sentQuote()`, `newLink()`, `setQuote()`, `setLink()`, with a team member who owns quotes — exported for Tasks 3, 4 and 5)
- Modify: `tests/integration/rls/quote-portal-read.test.ts` (the viewable key set gains `snapshot_hash` and `response`; the short payloads are unchanged)

**Interfaces:** Produces, all `security definer set search_path = ''` except the hash helper, revoked from `public, anon, authenticated`, granted to `service_role`:
- `private.quote_snapshot_hash(p_quote_id uuid) returns text` — `encode(extensions.digest(private.quote_snapshot(p_quote_id)::text, 'sha256'), 'hex')`: the hash is taken over the database's own jsonb text (fixed to UTC), never a JavaScript re-serialisation.
- `public.portal_get_quote(p_token text) returns jsonb` replaced: the body of `20261018102500_quote_portal_read_fixes.sql` §2 unchanged, except that the three viewable states (`open`, `accepted`, `declined`) also return `snapshot_hash` (the helper above) and `response` (`null`, or `{ "decision": "accepted" | "declined", "decided_at": <timestamptz> }` from `quote_responses` for **this link**). Expired, superseded and invalid payloads are unchanged.
- `public.portal_issue_code(p_token text) returns jsonb`: `{ "ok": true, "code": "<6 digits>", "expires_at", "recipient_email", "quote_number", "client_name" }` or `{ "ok": false, "reason": "invalid" | "not_open" | "already_decided" | "throttled" }`. Order: state from `public.portal_get_quote(p_token) ->> 'state'` (`invalid` → `invalid`; anything but `open` → `not_open`); this link already has a response → `already_decided`; lock the link row `for update`; refuse `throttled` when 5 codes were issued for the link in the last hour, **or** the link's failed attempts (sum of `attempts` over its codes created in the last hour) are 10 or more, **or** its lifetime failed attempts are 30 or more; otherwise insert a code row (random salt, hash, `expires_at = now() + interval '10 minutes'`) and return the plain code once. It writes nothing else.
- Failed-attempt caps (10 per hour, 30 lifetime) are this plan's reading of "failed attempts per link are also capped per hour"; Task 4 enforces them.

- [ ] **Step 1: Write the failing tests** in `quote-portal-codes.test.ts`:
  - `'the viewable payload carries snapshot_hash and response'` (64 hex characters; same value across three reads; `response` null); `'snapshot_hash changes when a frozen line changes'` (service-role edit of a line); update `quote-portal-read.test.ts`'s key set.
  - `'a code is six digits, stored hashed with its own salt, and the plain code is in no column'`; `'it expires ten minutes after issue'` (within 5 seconds); `'two codes for one link have different salts'`.
  - `'the sixth request in an hour is throttled and the fifth is not'`; `'failed attempts of 10 in the hour, and of 30 in all, throttle new codes'` (set `attempts` on code rows with the service role).
  - `'invalid, revoked and unknown tokens give invalid; an expired link, an Expired, Superseded, Accepted or Declined quote and an archived quote give not_open or invalid exactly as portal_get_quote does'`.
  - `'issuing a code changes nothing but the codes table'` (quote row including `updated_at` and link row identical afterwards).
  - `'neither a member nor anon can call portal_issue_code'` (permission denied).
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Write the migration (the replaced `portal_get_quote` is a copy of the final slice 1 body plus the two keys; do not re-derive its state logic) and the shared fixtures.
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_code_functions`). Run the new file and `quote-portal-read.test.ts`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): confirmation codes and the snapshot hash`.

---

### Task 4: The decision function

**Files:**
- Create: `supabase/migrations/20261020103000_quote_portal_decide.sql`, `tests/integration/rls/quote-portal-decide.test.ts`

**Interfaces:** Consumes Task 3 (`portal_get_quote`, `private.quote_snapshot_hash`, the fixtures). Produces:
- `public.portal_decide(p_token text, p_code text, p_decision text, p_signatory_name text, p_signatory_position text, p_signatory_organisation text, p_consent_text text, p_consent boolean, p_snapshot_hash text, p_decline_reason text, p_decline_comments text, p_ip text, p_user_agent text) returns jsonb` (definer, `service_role` only).
- Success: `{ "ok": true, "replay": boolean, "decision", "decided_at", "quote_id", "quote_number", "client_name", "recipient_email", "signatory_name", "signatory_position", "decline_reason", "decline_comments", "owner_name" (text or null), "notify_email" (text or null) }`. Refusal: `{ "ok": false, "reason": "invalid" | "not_open" | "incomplete" | "stale" | "code_missing" | "code_wrong" | "code_expired" | "code_locked" | "throttled", "attempts_left"? }`.
- `private.decision_recipients(p_quote_id uuid, p_link_id uuid)` returning one row `(owner_member_id uuid, owner_user_id uuid, owner_name text, owner_email text, sender_member_id uuid, sender_user_id uuid, sender_email text, notify_email text)`: the quote owner (`quotes.owner_id` → `team_members`) and the sender (`quote_access_links.created_by` → their `team_members` row in the same organisation); `notify_email` is the owner's team email, else the sender's, else null. An owner with no login (`user_id` null) still has an email.
- `private.decision_follow_ups(p_response_id uuid) returns void` — **a no-op here**, called by `portal_decide` after the status change; Task 5 replaces its body.

**The order of checks (a decision this plan fixes):**
1. Token shape, link and quote found, else `invalid`. Lock the quote row `for update`, then the link row `for update` (the order `quotes_supersede_original` uses), then read `public.portal_get_quote(p_token)` for the state and version.
2. State `invalid` → `invalid`. If this link already has a response and the state is `open`, `accepted` or `declined` → return `ok` with `replay: true` and the **recorded** outcome, writing nothing (this covers a double submit, a retry, and a reopened quote whose link was already used). Any other state → `not_open`; an `open` state is required from here on.
3. Field checks → `incomplete`, **without** counting an attempt: decision in the two values; name and position 2 to 120 and organisation 2 to 160 characters after trimming, none containing control characters (`[[:cntrl:]]`); `p_consent` true and `p_consent_text` 20 to 500 characters; reason one of the six or null (declined only; an accepted decision must pass null); comments at most 2000; code exactly six digits; hash 64 hex.
4. `p_snapshot_hash` must equal `private.quote_snapshot_hash(quote id)` → else `stale`, not counted.
5. Throttle (Task 3's caps) → `throttled`.
6. The link's newest code row `for update`: none or consumed → `code_missing`; `expires_at <= now()` → `code_expired` (not counted); `attempts >= 5` → `code_locked`; hash mismatch → `attempts = attempts + 1` and `return` `code_wrong` with `attempts_left = 5 - attempts` (a **return**, so the increment commits); match → continue.
7. Insert the `quote_responses` row (verified email = the link's `recipient_email`; `terms_sources` copied from `quotes.terms_sources`, ids included, not from the snapshot; `quote_number`; `quote_version` from the state read; `code_verified_at = now()`), `ip_address` and `user_agent` are cut to their column limits (an over-long or odd value never refuses a decision), set the code's `consumed_at`, set `quotes.status` to `Accepted` or `Declined` (the existing triggers set `accepted_at` and write the timeline entry), call `private.decision_follow_ups`, return the success shape. The quote's archived state, expiry and revocation are already covered by step 2 because it uses `portal_get_quote`.

- [ ] **Step 1: Write the failing tests** in `quote-portal-decide.test.ts` (each calls the function through the service role; codes come from `portal_issue_code`):
  - `'an accepted decision records every field, sets Accepted and accepted_at, and writes quote.accepted with no actor'` (response row: all columns including full `terms_sources`, the page's `snapshot_hash`, version 1, ip and user agent; code consumed; link row unchanged).
  - `'a declined decision stores the reason and comments and sets Declined'`.
  - `'two identical decisions sent at once record one response, one status change and one timeline entry'` (`Promise.all`; one result `replay: false`, one `replay: true`); `'a decline after an accept on the same link returns the accepted outcome and writes nothing'`.
  - `'a wrong code is refused and the attempt is kept'` (4 attempts left, `attempts = 1` afterwards); `'the fifth wrong code leaves none, and the right code is then code_locked'`; `'a new code works after a lock'`; `'an expired code is code_expired and not counted'`; `'no code, and a used code, are code_missing'`; `'an older code is wrong once a newer one exists'`; `'a code issued for one link cannot decide another link of the same quote'`.
  - `'10 failures in the hour, or 30 in all, throttle even a correct code'`.
  - `'a changed quote is stale and nothing is counted or written'`; `'moving the quote to Expired, Superseded, Accepted (by hand) or archiving it, or revoking the link, after the page loaded is refused and writes nothing'`; `'an accept and a decline from two links at once record exactly one response'`.
  - `'reopening: a link that already decided stays used, a second unused link can decide again, a new response row is appended and the first is unchanged'`.
  - `'incomplete input is refused without counting an attempt'`: blank name, one-character name, 121-character name, name containing a newline or a tab, consent false, consent text empty, reason outside the six, reason on an accept, 2001-character comments, 5-digit code, hash with upper case.
  - `'hostile text is stored exactly as given'` (`O'Brien <b>` as a name, a 2000-character comment, a bidi override character in comments) `'and nothing in the result is altered'`.
  - `'neither a member nor anon can call portal_decide'`.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Write the migration. Constants (5 attempts, 10 minutes, 10 and 30 failure caps) are declared once at the top of each function.
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_decide`). Run `quote-portal-decide.test.ts`, `quote-portal-codes.test.ts` and `quote-portal-decisions-schema.test.ts`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): the decision function`.

---

### Task 5: Notifications and the decline follow-up

**Files:**
- Create: `supabase/migrations/20261020104000_quote_portal_follow_ups.sql`, `tests/integration/rls/quote-portal-follow-ups.test.ts`

**Interfaces:** Consumes Task 4's `private.decision_recipients` and the stub `private.decision_follow_ups(p_response_id uuid) returns void`. Produces its real body (definer, `search_path = ''`, never granted). Each group of writes below runs in its own `begin … exception when others then raise warning` block: **a follow-up that cannot be written never undoes the decision**.
- **Notifications** (`notifications`, category `Commercial`, `href '/commercial/quotes/<quote id>'`): one row each for the quote owner (when `user_id` is not null) and the member who sent the link, once if they are the same person. Title: `<client name> accepted quotation <number>` or `… declined …`; body: `Signed by <name>, <position>.`, and for a decline `<name>, <position>. Reason: <reason, or "none given">.`
- **Decline recovery** (declined decisions only), parent = the quote's opportunity when it has one, else its client, else none; assignee = the owner's team member, else the sender's, else null. Priority `Medium`, status `Planned`, `due_at = now() + interval '3 days'`, title `Follow up: <client> declined quotation <number>`, description = the recommended action, then `Reason given: <reason>.` and the client's comments when present:

| Reason | Task description starts with | Task? |
|---|---|---|
| Budget considerations | Review whether a smaller, clearly scoped engagement could meet their most important need. Do not discount automatically. | yes |
| Timing is not right | Offer to reconnect on a date the client chooses. | yes |
| Scope does not meet our requirements | Offer a discovery conversation and a revised quotation if the need can be met. | yes |
| Internal approval pending | Offer a concise business case, supporting documents or an executive conversation. | yes |
| Chose another provider | (no task) a `note` activity on the same parent: Thank them and close the opportunity respectfully, no repeated contact. | no |
| Other, or none given | One courteous, optional follow-up if it suits the relationship. | yes |

The opportunity, its stage and the client are not touched; nothing is sent to the client. An accepted decision creates notifications only.

- [ ] **Step 1: Write the failing tests** (fixtures with owners, with and without logins; quotes with and without an opportunity):
  - `'the owner and the sender are each notified once; one person who is both gets one row'`; `'an owner without a login gets no notification but the sender does, and notify_email is still the owner's address'`; `'the notice names the client, the number, the signatory and, for a decline, the reason'`.
  - `'each of the five reasons that call for one creates a task with its recommended action, due in three days, assigned to the owner, else the sender'`; `'Chose another provider creates no task and exactly one note'`; `'no reason creates the optional follow-up'`; `'the task is attached to the opportunity when the quote has one, otherwise to the client'`; `'an accepted decision creates no task'`.
  - `'two identical decisions at once create one set of notifications and one task'`; `'the opportunity stage and the client row are unchanged by a decline'`; `'hostile comments are stored verbatim in the task description'`.
  - Source test: the migration wraps each write group in an `exception when others` block that only warns.
- [ ] **Step 2:** Run the file. Expected: FAIL (the stub writes nothing).
- [ ] **Step 3:** Write the migration (`create or replace` the function; do not touch `portal_decide`).
- [ ] **Step 4:** Apply with `apply_migration` (name `quote_portal_follow_ups`). Run the new file and `quote-portal-decide.test.ts`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): owner notices and the decline recovery task`.

---

### Task 6: Decision input, types and copy (pure)

**Files:**
- Create: `features/quote-portal/decision.ts`, `tests/unit/quote-portal-decision.test.ts`
- Modify: `lib/quote-portal/types.ts`, `features/quote-portal/copy.ts`

**Interfaces:** Produces (relative imports only, no directive):
- In `types.ts`: `DECLINE_REASONS` (the six strings, in the order of the Task 1 check) and `type DeclineReason`; `type DecisionKind = 'accepted' | 'declined'`; `type DecideInput = { token; code; decision: DecisionKind; signatoryName; signatoryPosition; signatoryOrganisation; consentText; consent: true; snapshotHash; declineReason: DeclineReason | null; declineComments: string | null }`; `type DecisionOutcome` (the success shape of Task 4 in camel case — `decision, decidedAt, quoteId, quoteNumber, clientName, recipientEmail, signatoryName, signatoryPosition, declineReason, declineComments, ownerName, notifyEmail` — `ok` and `replay` excluded); `type IssueCodeRefusal = 'invalid' | 'not_open' | 'already_decided' | 'throttled'`; `type IssueCodeResult = { ok: true; code: string; expiresAt: string; recipientEmail: string; quoteNumber: string; clientName: string | null } | { ok: false; reason: IssueCodeRefusal }`; `type DecideRefusal = 'invalid' | 'not_open' | 'incomplete' | 'stale' | 'code_missing' | 'code_wrong' | 'code_expired' | 'code_locked' | 'throttled'`; `type DecideResult = { ok: true; replay: boolean; outcome: DecisionOutcome } | { ok: false; reason: DecideRefusal; attemptsLeft?: number }`; `PortalQuoteFull` gains `snapshot_hash: string` and `response: { decision: DecisionKind; decided_at: string } | null`.
- In `decision.ts`: `normaliseDecisionInput(raw: Record<string, unknown>)` (the keys of `raw` are exactly the `DecideInput` field names: `token, code, decision, signatoryName, signatoryPosition, signatoryOrganisation, consentText, consent, snapshotHash, declineReason, declineComments`) `: { ok: true; value: DecideInput } | { ok: false; errors: Partial<Record<'token' | 'name' | 'position' | 'organisation' | 'consent' | 'reason' | 'comments' | 'code' | 'snapshot', string>> }` — the token must satisfy `isPortalToken` (relative import of `lib/quote-portal/token.ts`); trims; collapses runs of whitespace inside single-line fields; accepts `\n` in comments (after turning `\r\n` into `\n`); rejects other control characters (`\p{Cc}`) and bidi controls (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069); the same length rules as Task 4; consent must be `true` **and** `consentText` must equal `CONSENT_ACCEPT` (accept) or `CONSENT_DECLINE` (decline) exactly; empty reason or comments become null; a reason on an accept is an error. `maskEmail(address: string): string` (`j***@acme.co.za`; the local part keeps its first character; an address without `@` is returned as `***`). `refusalMessage(reason: DecideRefusal | IssueCodeRefusal | 'send_failed', attemptsLeft?: number): string`.
- In `copy.ts` (appendix text verbatim): `ACCEPT_QUOTATION` "Accept Quotation", `DECLINE_QUOTATION` "Decline Quotation", `CONSENT_ACCEPT`, `DECLINE_MESSAGE` ("We understand that the quotation may not be the right fit at this time. Thank you for considering HIMARK."), `CODE_EMAIL_SUBJECT` "Your HIMARK confirmation code", `codeEmailSentence(code)`, `acknowledgementAccepted(number, date, owner)`, `acknowledgementDeclined(number)`, `ownerNoticeTitle(client, decision, number)`. Drafted for the owner's approval (marked in a comment): `CONSENT_DECLINE` "I confirm that I am authorised to decline this quotation on behalf of the organisation.", the step labels, the messages in `refusalMessage`, `ALREADY_RESPONDED_NOTE`.

- [ ] **Step 1: Write the failing tests:** valid accept and valid decline; a token of the wrong length; each field error (blank, one character, over length, newline in the name, tab, bidi override, `\r\nBcc: x@y.test`); a comment with `\r\n` and one with a null byte; consent false, missing and with a changed sentence; reason on an accept; reason outside the list; code with letters or spaces inside (`'12 34 56'` is refused, `' 123456 '` is accepted trimmed); hash upper case; `maskEmail` for ordinary, one-letter local part and no-`@` input; `refusalMessage` has a distinct, non-empty message per reason and mentions the attempts left for `code_wrong`; the `DECLINE_REASONS` list equals the list in the Task 1 migration's check (read the SQL, like `crm-workspace-vocabulary.test.ts`); the appendix strings equal the spec's by value.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and `node --test --experimental-strip-types tests/unit/quote-portal-ui.test.ts tests/unit/quote-portal-summary.test.ts` (`SLICE_ONE_RESPOND_NOTE` stays until Task 9). Expected: pass. `pnpm typecheck` passes.
- [ ] **Step 5:** Commit `feat(quote-portal): decision input rules, types and copy`.

---

### Task 7: The three emails

**Files:**
- Create: `lib/email/templates/quote-decision.ts`, `tests/unit/quote-decision-emails.test.ts`

**Interfaces:** Consumes Task 6's copy and `lib/email/templates/safe.ts` (`escapeHtml`, `sanitizeLine`, `assertSafeUrl`). Produces (pure, relative imports, `EmailTemplate = { subject, html, text }`):
- `quoteCodeEmailTemplate(data: { code: string; quoteNumber: string; clientName: string | null }): EmailTemplate` — subject "Your HIMARK confirmation code"; the code large in a monospaced block; body per the appendix; the code is refused unless it is six digits.
- `quoteAcknowledgementEmailTemplate(data: { decision: DecisionKind; quoteNumber: string; decidedOn: string; ownerName: string | null; signatoryName: string }): EmailTemplate` (the greeting uses the signatory's name).
- `quoteOwnerNoticeEmailTemplate(data: { decision: DecisionKind; clientName: string; quoteNumber: string; signatoryName: string; signatoryPosition: string; declineReason: string | null; declineComments: string | null; quoteUrl: string }): EmailTemplate` — subject `<client> accepted|declined quotation <number>`.
- Single column, tables for layout, no images, the palette of `quoteEmailTemplate`; every client-supplied value goes through `sanitizeLine` (subject and one-line fields) or `escapeHtml` (body), comments with line breaks preserved; `quoteUrl` through `assertSafeUrl`.

- [ ] **Step 1: Write the failing tests:** exact subjects; the code appears in html and text and the expiry sentence is present; the accepted and declined acknowledgement sentences match the appendix; the owner notice names the signatory and, for a decline, the reason and comments; hostile values (`<img src=x onerror=alert(1)>`, `"\r\nBcc: evil@x.test"`, 5,000 characters, a name with `&` and a quote) are escaped in html, the subject has no CR or LF and is length-capped, and no raw `<img` or `<script` appears; a non-six-digit code throws; `quoteUrl` of `javascript:` throws; every template's text part is non-empty.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and `node --test --experimental-strip-types tests/unit/email-templates.test.ts`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): confirmation code, acknowledgement and owner notice emails`.

---

### Task 8: Portal client calls and server actions

**Files:**
- Create: `features/quote-portal/actions/request-code.ts`, `features/quote-portal/actions/decide.ts`, `features/quote-portal/send-decision-emails.ts`, `tests/unit/quote-portal-decision-actions.test.ts`
- Modify: `lib/quote-portal/portal-client.ts`

**Interfaces:** Consumes Tasks 3 to 7. Produces:
- In `portal-client.ts`: `issuePortalCode(token: string): Promise<IssueCodeResult>` (a malformed token is `{ ok: false, reason: 'invalid' }` with no database call) and `submitPortalDecision(input: DecideInput, evidence: { ip: string | null; userAgent: string | null }): Promise<DecideResult>`; both map the database's snake case to camel case, reduce a database error to `failure()` (code only, no token, no code), and throw on an answer outside the documented shapes.
- `requestCodeAction(token: string): Promise<{ ok: true; maskedEmail: string; expiresInMinutes: 10 } | { ok: false; message: string }>` (`'use server'`): `issuePortalCode`, then `sendEmail({ to: recipientEmail, template: quoteCodeEmailTemplate(...) })`; a refusal gives `refusalMessage(reason)`; a send that throws gives `refusalMessage('send_failed')` and logs one line with neither the code nor an address.
- `decideAction(raw: Record<string, unknown>): Promise<{ ok: true; decision: DecisionKind; replay: boolean } | { ok: false; message: string; reason?: string; attemptsLeft?: number; errors?: Record<string, string> }>` (`'use server'`): `normaliseDecisionInput` first (field errors go back without touching the database); evidence from `headers()` — the first entry of `x-forwarded-for` (else `x-real-ip`) accepted only if `node:net` `isIP` says so, else null; `user-agent` cut to 300 characters; then `submitPortalDecision`; when the result is `ok` and **not** `replay`, `sendDecisionEmails(outcome)`.
- `sendDecisionEmails(outcome: DecisionOutcome): Promise<void>` (server-only module; reads the app's public address with `readAppUrl` like `prepare-portal-email.ts`): the acknowledgement to `recipientEmail` and the owner notice to `notifyEmail` (skipped when null; its `quoteUrl` is `<app address>/commercial/quotes/<outcome.quoteId>`), run with `Promise.allSettled` and awaited before the action returns; each failure is logged with the quote number only. It never throws.

- [ ] **Step 1: Write the failing tests** (source-regex house style, plus pure checks): neither action imports `lib/supabase/admin`; `request-code.ts` sends only to the address the database returned and takes no address parameter; neither file logs `token`, `code` or an address variable; `decide.ts` calls `normaliseDecisionInput` before `submitPortalDecision`, reads `headers()` from `next/headers`, calls `sendDecisionEmails` only inside a branch that tests `replay`, and wraps nothing in a way that lets an email error change the returned result; `sendDecisionEmails` uses `Promise.allSettled` and has no `throw`; both action files export only async functions and carry `'use server'`; `portal-client.ts` still imports the admin client and the boundary test's allowlist is unchanged; the portal page file (`app/(portal)/q/[token]/page.tsx`) imports neither `issuePortalCode` nor `submitPortalDecision` (a page render and a mail scanner cannot decide).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement (read the Next 16 server action guide first).
- [ ] **Step 4:** Run it and `node --test --experimental-strip-types tests/unit/service-role-boundary.test.ts`. Expected: pass. `pnpm typecheck` passes.
- [ ] **Step 5:** Commit `feat(quote-portal): request a code and send a decision`.

---

### Task 9: The portal response flow

**Files:**
- Create: `features/quote-portal/decision-flow.ts` (pure), `features/quote-portal/components/portal-decision-flow.tsx` (`'use client'`), `tests/unit/quote-portal-decision-flow.test.ts`
- Modify: `features/quote-portal/portal-view-model.ts`, `features/quote-portal/components/portal-quote-view.tsx` (the response panel, around lines 376-396), `features/quote-portal/copy.ts` (remove `SLICE_ONE_RESPOND_NOTE`), `tests/unit/quote-portal-ui.test.ts`, `tests/unit/quote-portal-summary.test.ts` (wherever they pin the removed note)

**Interfaces:** Consumes Tasks 6 and 8. Produces:
- `buildPortalQuoteModel` gains `snapshotHash: string`, `recipientEmail: string`, `response: { decision; decidedOn: string | null } | null`, `confirmation: ConfirmationModel`, and `respondable` stays true only for an open quote; `ConfirmationModel = { numberAndVersion: string; organisation: string; services: string[]; initialTotal: string; recurring: string | null; keyTerms: string[]; prefill: { name: string; organisation: string } }` (services = the scope services' titles, else the line titles; initial total = the stored total; recurring = the monthly figure with `per month` when the summary is grouped, else null; key terms = the first three terms; prefill name from the link's recipient name, organisation from the quote's client).
- `decision-flow.ts`: a reducer over the steps `idle → confirm → code → done` with `type FlowState`, `type FlowAction` and `flowReducer(state: FlowState, action: FlowAction): FlowState`; Accept and Decline both open `confirm`; "Email me a code" is allowed only with the three fields valid and the consent ticked; a code request failure stays in `confirm` with its message; a wrong code stays in `code` with `refusalMessage`; `stale` and `not_open` end in a `refresh` state; success is `done`.
- The panel: for an open quote with no `response`, the flow component under "Ready to respond?" with buttons `Accept Quotation` / `Decline Quotation` (real `<button type="button">`, never links) and the existing Download PDF; the confirm step shows the `ConfirmationModel`, the editable name, position and organisation (prefilled), the verified email as plain text (not an input), the unchecked consent checkbox (with the decline reason `<select>` of the six and an optional comments box on a decline) and "Email me a code"; the code step has a single numeric input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`) and a Confirm button, a "Send a new code" action, and an `aria-live="polite"` message region; focus moves to each step's heading; on success `router.refresh()` swaps in the decided page. An open quote whose link already carries a response (a reopened quote) shows `ALREADY_RESPONDED_NOTE` and no buttons. A declined page shows `DECLINE_MESSAGE` under its banner when this link made the decision. Renders correctly at 375 px.

- [ ] **Step 1: Write the failing tests:** reducer transitions for the happy accept, the happy decline, a code request failure, wrong code twice then locked, stale, and a double press of Confirm while pending (ignored); `buildPortalQuoteModel` returns the new fields for an open quote and `respondable` false when `response` is set; the confirmation model for a grouped and a flat quote; source guards: no `<a` element carries the Accept/Decline labels, the consent checkbox has no `defaultChecked` and starts `false`, there is no `<input` for the email, no `dangerouslySetInnerHTML`, the component imports the two actions from `../actions/`, and `SLICE_ONE_RESPOND_NOTE` is gone; update the two pinned UI tests deliberately.
- [ ] **Step 2:** Run the three unit files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit files and `pnpm typecheck`. Expected: pass. The browser check of the flow is Task 11 Step 3.
- [ ] **Step 5:** Commit `feat(quote-portal): accept and decline on the portal`.

---

### Task 10: Staff panel, the recorded response

**Files:**
- Modify: `features/quote-portal/queries/list-quote-links.ts`, `features/quote-portal/components/client-response-panel.tsx`, `tests/unit/quote-portal-staff.test.ts`
- Create: `features/quote-portal/response-attribution.ts` (pure)

**Interfaces:** Produces:
- `listQuoteResponses(quoteId: string): Promise<QuoteResponseRow[]>` — member-session read of `quote_responses` for the quote, newest first, selecting only `id, link_id, decision, decided_at, signatory_name, signatory_position, signatory_organisation, verified_email, quote_number, quote_version, terms_sources, snapshot_hash, decline_reason, decline_comments` (never `ip_address`, `user_agent` or `consent_text`).
- `responseAttribution(status: string, responses: Array<{ decision: 'accepted' | 'declined'; decided_at: string }>): 'client' | 'staff' | null` — `null` unless the status is Accepted or Declined; `'client'` when the newest response's decision matches the status; otherwise `'staff'`.
- Panel: a "Response" block per response (decision, signatory, position, organisation, verified email, time in South African time, quote version, terms versions as `layer v<version>`, the snapshot hash in a wrapping monospace `<code>`, and for a decline the reason and comments rendered as text with line breaks); a link that carries a decision shows "Responded <time>"; `'staff'` attribution shows "Marked by staff" with the sentence "No client response is on record for this status."; the "Replaced by" line reads "Revised as" unless the quote's own status is Superseded (settles the follow-up about Declined and Expired originals).

- [ ] **Step 1: Write the failing tests:** `responseAttribution` for no responses, a matching response, a response the staff later contradicted, a quote that is neither Accepted nor Declined; a source guard that the query's column list excludes the three private columns and the panel has no `dangerouslySetInnerHTML`; a source guard that the "Revised as" and "Replaced by" strings both exist and the choice depends on `Superseded`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it, `node --test --experimental-strip-types tests/unit/documents-ui.test.ts`, and `pnpm typecheck`. Expected: pass.
- [ ] **Step 5:** Commit `feat(quote-portal): the recorded client response on the quote page`.

---

### Task 11: Verification, docs and clean-up

**Files:**
- Modify: `docs/crm-roadmap.md`, `docs/follow-ups.md`, the spec's `Status` line

**Interfaces:** Consumes everything.

- [ ] **Step 1:** `pnpm typecheck`, `pnpm test`, `pnpm build`. Expected: all pass (one unit test, `crm-overview-metrics`, fails on this machine for locale reasons unrelated to this work).
- [ ] **Step 2:** `pnpm test:rls` (about five minutes, against production). Expected: every file passes, including the new ones.
- [ ] **Step 3: Walk the flow once in the browser pane** against a fixture made with the RLS helpers (a throwaway organisation, a Sent quote, a link; the portal switch is irrelevant because the link is minted directly). Run the dev server with `EMAIL_TRANSPORT=log`, open `/q/<token>`, take screenshots at 375 px and desktop, press Accept, take the code from the server log (`preview_logs`; the log shows the code and a redacted token), enter a wrong code, then the right one, and confirm the page shows the accepted state; then do a decline on a second fixture quote and confirm the task and notifications exist. Report anything unexpected; do not paper over it. Then delete every fixture.
- [ ] **Step 4: Production residue check.** With the Supabase MCP `execute_sql` (read-only): `select (select count(*) from public.organizations where name like 'RLS %' or slug like 'rls-%'), (select count(*) from auth.users where email like 'rls-%@unison.test'), (select count(*) from public.quote_access_codes), (select count(*) from public.quote_responses), (select count(*) from public.tasks where title like 'Follow up: %declined quotation%'), (select count(*) from public.notifications where title like '% accepted quotation %' or title like '% declined quotation %')`. Expected: 0 for every column except rows the owner made. Compare `select count(*) from public.audit_events where organization_id is null` with the Task 1 baseline; any increase is fixture residue and must be traced and deleted by id. Confirm HMK-Q-2026-00001 is still `Sent` with no response.
- [ ] **Step 5:** Docs. In `docs/follow-ups.md` add "From the quote portal, slice 2": not verified (real send of a code and acknowledgement through Graph; the staff panel and the decision flow signed in, on a real phone; Outlook rendering of the three emails); known limits (a leaked link plus the recipient's mailbox decides; the caps of 10 and 30 failed attempts; IP and user agent are stored and not shown; nothing retained or deleted automatically; the dev log prints the code); owner decisions (the Calls below, the drafted copy, the decline task due date); and **Needs the owner: legal and privacy review before launch** (ECTA click-to-accept with an emailed code, POPIA retention of the evidence record). Add the roadmap line under Stage 2, set the spec status to "Slices 1 and 2 built", and remove the "For slice 2" items this plan settled. Commit `docs: record quote portal slice 2`.

---

## Calls made in this plan (for review)

Where the spec is silent or gives no number. Say if any should change.

1. **Failed-attempt caps:** 10 failed code attempts per link per hour, and 30 for the life of the link (the spec says "capped per hour" without a number; the lifetime cap closes the slow-guess route over a 30-day link and costs one more sum). A locked link needs a fresh link from staff.
2. **Decline confirmation wording** is drafted: "I confirm that I am authorised to decline this quotation on behalf of the organisation." The spec says only that decline has "its own, shorter, confirmation".
3. **Decline task:** priority Medium, status Planned, due in three days, assigned to the owner else the sender; "Chose another provider" creates a timeline note and no task.
4. **A follow-up that cannot be written never undoes the decision** (each group of writes is a sub-block that warns); the spec says the function "creates" them in one transaction.
5. **A repeated request from a link that already decided returns the recorded outcome**, even when staff have since reopened the quote; a fresh link is needed to decide again.
6. **Staff see no IP address or user agent** (they are stored for evidence only); any member of the organisation can still read them through the database.
7. **`quote.declined` is logged for any move to Declined,** including a hand-set one, because it lives in the existing trigger; `quote.superseded` is logged when a revision is sent.
8. **The owner's email goes to their team-member address** whether or not they have a login; in-app notices need a login.
9. **Emails are awaited before the action returns** (not `after()`), so nothing is lost if the function instance is frozen; the cost is about a second of latency after a decision.
10. **All new client-facing messages** (refusal messages, step labels, the "already responded" note) are drafted in `copy.ts` and need the owner's approval, as in slice 1.
